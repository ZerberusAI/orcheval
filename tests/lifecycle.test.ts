import test from 'node:test';
import assert from 'node:assert/strict';
import { completeExecution } from '../packages/core/lifecycle.ts';
import { OrchevalEngine, type EvaluationTarget, type ExecutionOutcome, type ExecutionSnapshot, type WorkloadDefinition } from '../packages/core/index.ts';
import { securityBaselineGate } from '../gates/security-baseline/index.ts';

const execution = { id: 'execution-1', tenantId: 'tenant-a', correlationId: 'correlation-1', faults: [] };
const handle = { executionId: execution.id };
const approval: WorkloadDefinition = { id: 'ORCH-06', kind: 'approval-resume', description: 'approval', required: true, timeoutMs: 500, pollIntervalMs: 1, lifecycle: { action: 'signal', at: 'WAITING', signal: { name: 'approve', payload: { approved: true } } } };

function fixture(states: ExecutionOutcome[]) {
  let position = 0;
  let signals = 0;
  let cancellations = 0;
  const snapshot = (outcome: ExecutionOutcome): ExecutionSnapshot => ({
    executionId: execution.id, tenantId: execution.tenantId, correlationId: execution.correlationId, workloadId: approval.id,
    startedAt: '2026-10-05T10:00:00.000Z', observedAt: '2026-10-05T10:00:01.000Z',
    endedAt: ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(outcome) ? '2026-10-05T10:00:01.000Z' : null,
    outcome, steps: [], attempts: 1, errors: [], duplicateSideEffects: null, crossTenantLeakDetected: null, secretExposureDetected: null, identitySubstitutionAllowed: null, cancellationAffectedUnrelatedWork: null, auditTrailComplete: null, recoverySkippedSteps: null,
  });
  const target: EvaluationTarget = {
    id: 'fixture', metadata: async () => ({ id: 'fixture', displayName: 'Fixture', version: '1', mode: 'SIMULATED', capabilities: [] }),
    setup: async () => {}, health: async () => ({ healthy: true, details: [] }), execute: async () => handle,
    observe: async () => snapshot(states[Math.min(position++, states.length - 1)]),
    signal: async (id, signal) => { assert.equal(id, handle.executionId); assert.equal(signal.name, 'approve'); assert.ok(position >= 2, 'signal before waiting'); signals++; },
    cancel: async () => { cancellations++; }, teardown: async () => {},
  };
  return { target, snapshot, counts: () => ({ signals, cancellations }) };
}

test('approval waits for the observed barrier, signals once and records terminal success', async () => {
  const f = fixture(['RUNNING', 'WAITING', 'WAITING', 'SUCCEEDED']);
  const result = await completeExecution(f.target, approval, execution, handle);
  assert.equal(result.outcome, 'SUCCEEDED');
  assert.deepEqual(f.counts(), { signals: 1, cancellations: 0 });
  assert.deepEqual(result.lifecycle?.map(({ action, outcome }) => [action, outcome]), [['observe', 'RUNNING'], ['observe', 'WAITING'], ['signal', 'WAITING'], ['observe', 'WAITING'], ['observe', 'SUCCEEDED']]);
});

test('cancellation must reach CANCELLED after a single request', async () => {
  for (const terminal of ['CANCELLED', 'SUCCEEDED'] as const) {
    const f = fixture(['WAITING', 'WAITING', terminal]);
    const run = completeExecution(f.target, { ...approval, lifecycle: { action: 'cancel', at: 'WAITING' } }, execution, handle);
    if (terminal === 'CANCELLED') assert.equal((await run).outcome, terminal);
    else await assert.rejects(run, /expected CANCELLED/);
    assert.equal(f.counts().cancellations, 1);
  }
});

test('early completion and unsupported approval cannot masquerade as lifecycle success', async () => {
  await assert.rejects(completeExecution(fixture(['SUCCEEDED']).target, approval, execution, handle), /ended before the required WAITING signal/);
  const f = fixture(['WAITING']);
  delete f.target.signal;
  await assert.rejects(completeExecution(f.target, approval, execution, handle), /does not support signals/);
});

test('pending identity and timeline mismatches are rejected before sending an action', async () => {
  for (const change of [{ correlationId: 'unrelated' }, { endedAt: '2026-10-05T10:00:01.000Z' }, { observedAt: 'invalid' }]) {
    const f = fixture(['WAITING']);
    f.target.observe = async () => ({ ...f.snapshot('WAITING'), ...change });
    await assert.rejects(completeExecution(f.target, approval, execution, handle), /identity mismatch|Invalid observation timeline/);
    assert.equal(f.counts().signals, 0);
  }
});

test('an execution cannot change its start time between polls', async () => {
  const f = fixture(['RUNNING']);
  let calls = 0;
  f.target.observe = async () => ({ ...f.snapshot('RUNNING'), startedAt: calls++ ? '2026-10-05T10:00:00.500Z' : '2026-10-05T10:00:00.000Z' });
  await assert.rejects(completeExecution(f.target, approval, execution, handle), /start time changed/);
});

test('an unresponsive observation is bounded and its abort signal is delivered', async () => {
  const f = fixture(['RUNNING']);
  let aborted = false;
  f.target.observe = async (_id, options) => new Promise<ExecutionSnapshot>(() => options!.signal.addEventListener('abort', () => { aborted = true; }));
  await assert.rejects(completeExecution(f.target, { ...approval, timeoutMs: 30 }, execution, handle), /timed out/);
  assert.equal(aborted, true);
});

test('action rejection propagates and never yields a completed observation', async () => {
  const f = fixture(['WAITING']);
  f.target.signal = async () => { throw new Error('approval rejected'); };
  await assert.rejects(completeExecution(f.target, approval, execution, handle), /approval rejected/);
});

test('engine tears down after failed setup or lifecycle timeout', async () => {
  for (const failure of ['setup', 'observe']) {
    const f = fixture(['RUNNING']);
    let tornDown = false;
    f.target.teardown = async () => { tornDown = true; };
    if (failure === 'setup') f.target.setup = async () => { throw new Error('setup failed'); };
    else f.target.observe = async () => new Promise<ExecutionSnapshot>(() => {});
    const engine = new OrchevalEngine({ profiles: [{ id: 'lifecycle', version: '1', scenarios: [{ ...approval, timeoutMs: 30 }] }], targets: [f.target], gates: [securityBaselineGate], metrics: [] });
    await assert.rejects(engine.run({ profileId: 'lifecycle', targets: ['fixture'], metrics: [] }), /setup failed|timed out/);
    assert.equal(tornDown, true);
  }
});
