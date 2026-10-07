import test from 'node:test';
import assert from 'node:assert/strict';

import { type EvaluationConfig } from '../packages/core/index.ts';
import { createPhaseOneEngine } from '../packages/harness/index.ts';
import { OrchevalEngine } from '../packages/core/index.ts';
import { phaseOneDependencies } from '../packages/harness/index.ts';

test('Phase 1 engine executes every profile scenario but does not claim simulated targets are admissible', async () => {
  const config: EvaluationConfig = {
    profileId: 'ai-orchestration',
    targets: ['temporal', 'hatchet', 'inngest', 'triggerdev', 'windmill'],
    gates: ['security-baseline'],
    metrics: ['latency', 'throughput', 'traceability'],
    repetitions: 2,
  };

  const result = await createPhaseOneEngine().run(config);

  assert.equal(result.profileId, 'ai-orchestration');
  assert.equal(result.summary.status, 'INCOMPLETE');
  assert.equal(result.summary.eligible, false);
  assert.equal(result.gates.length, config.targets!.length);
  assert.deepEqual(result.gates.map(({ targetId }) => targetId), config.targets);
  assert.ok(result.gates.every(({ status }) => status === 'NOT_VALIDATED'));
  assert.equal(result.metrics.length, 3);
  assert.equal(result.evidence.targets.length, config.targets!.length);
  assert.equal(result.evidence.targets[0].observations.length, 20);
});

test('Phase 1 engine rejects unknown targets instead of producing a result', async () => {
  await assert.rejects(
    () => createPhaseOneEngine().run({ profileId: 'ai-orchestration', targets: ['unknown'], gates: ['security-baseline'] }),
    /Unknown target: unknown/,
  );
});

test('engine rejects observation identity substitutions and invalid timelines', async () => {
  const source = phaseOneDependencies.targets.find(({ id }) => id === 'temporal')!;
  for (const change of ['identity', 'timeline']) {
    const target = Object.assign(Object.create(source), {
      observe: async (id: string) => {
        const observation = await source.observe(id);
        if (change === 'identity') observation.correlationId = 'another-execution';
        else observation.steps[0].endedAt = new Date(Date.parse(observation.endedAt!) + 1_000).toISOString();
        return observation;
      },
    });
    await assert.rejects(() => new OrchevalEngine({ ...phaseOneDependencies, targets: [target] }).run({ targets: ['temporal'] }), change === 'identity' ? /identity mismatch/ : /Invalid observation timeline/);
  }
});

test('engine executes measured repetitions at the configured concurrency and excludes warmups', async () => {
  let active = 0;
  let peak = 0;
  const started = new Map<string, string>();
  const target = {
    id: 'concurrent', metadata: async () => ({ id: 'concurrent', displayName: 'Concurrent', version: '1', mode: 'SIMULATED' as const, capabilities: [] }),
    setup: async () => {}, health: async () => ({ healthy: true, details: [] }),
    execute: async (_workload: unknown, execution: { id: string }) => { active++; peak = Math.max(peak, active); started.set(execution.id, new Date().toISOString()); await new Promise((resolve) => setTimeout(resolve, 15)); active--; return { executionId: execution.id }; },
    observe: async (id: string) => ({ executionId: id, tenantId: 'tenant-a', correlationId: id, workloadId: 'ONE', startedAt: started.get(id)!, endedAt: new Date().toISOString(), outcome: 'SUCCEEDED' as const, steps: [], attempts: 1, errors: [], duplicateSideEffects: null, crossTenantLeakDetected: null, secretExposureDetected: null, identitySubstitutionAllowed: null, cancellationAffectedUnrelatedWork: null, auditTrailComplete: null, recoverySkippedSteps: null }),
    cancel: async () => {}, teardown: async () => {},
  };
  const gate = { id: 'test-gate', mandatory: false, evaluate: async () => ({ id: 'test-gate', mandatory: false, status: 'PASS' as const, details: [], evidence: [] }) };
  const engine = new OrchevalEngine({ profiles: [{ id: 'one', version: '1', scenarios: [{ id: 'ONE', description: 'one', required: true, kind: 'sequential' }] }], targets: [target], gates: [gate], metrics: [] });
  const result = await engine.run({ profileId: 'one', targets: ['concurrent'], gates: ['test-gate'], metrics: [], repetitions: 3, warmup: 1, concurrency: [2], seed: 7 });
  assert.equal(result.evidence.targets[0].observations.length, 3);
  assert.equal(peak, 2);
});
