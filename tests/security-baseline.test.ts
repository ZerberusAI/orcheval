import test from 'node:test';
import assert from 'node:assert/strict';

import { securityBaselineGate } from '../gates/security-baseline/index.ts';
import { createPhaseOneEngine } from '../packages/harness/index.ts';
import { phaseOneDependencies } from '../packages/harness/index.ts';
import { OrchevalEngine } from '../packages/core/index.ts';

test('security baseline fails when execution evidence contains a tenant leak', async () => {
  const run = await createPhaseOneEngine().run({ profileId: 'ai-orchestration', targets: ['temporal'], gates: ['security-baseline'] });
  const evidence = structuredClone(run.evidence);
  evidence.targets[0].target.mode = 'LIVE';
  evidence.targets[0].observations[0].crossTenantLeakDetected = true;

  const result = await securityBaselineGate.evaluate(evidence);
  assert.equal(result.status, 'FAIL');
  assert.match(result.details.join('\n'), /SEC-001 Tenant isolation: failed/);
});

test('security baseline does not treat simulated target evidence as validation', async () => {
  const run = await createPhaseOneEngine().run({ profileId: 'ai-orchestration', targets: ['temporal'], gates: ['security-baseline'] });
  const result = await securityBaselineGate.evaluate(run.evidence);
  assert.equal(result.status, 'NOT_VALIDATED');
  assert.match(result.evidence.join('\n'), /SIMULATED targets/);
});

test('security baseline passes complete live evidence', async () => {
  const run = await createPhaseOneEngine().run({ profileId: 'ai-orchestration', targets: ['temporal'], gates: ['security-baseline'] });
  const evidence = structuredClone(run.evidence);
  evidence.targets[0].target.mode = 'LIVE';
  const result = await securityBaselineGate.evaluate(evidence);
  assert.equal(result.status, 'PASS');
});

test('unknown live security evidence remains unvalidated', async () => {
  const run = await createPhaseOneEngine().run({ targets: ['temporal'] });
  const evidence = structuredClone(run.evidence);
  evidence.targets[0].target.mode = 'LIVE';
  evidence.targets[0].observations[0].secretExposureDetected = null;
  const result = await securityBaselineGate.evaluate(evidence);
  assert.equal(result.status, 'NOT_VALIDATED');
  assert.match(result.details.join('\n'), /SEC-002 Secret handling: not validated/);
});

test('cross-run leakage is checked independently of cross-tenant leakage', async () => {
  const run = await createPhaseOneEngine().run({ targets: ['temporal'] });
  const evidence = structuredClone(run.evidence);
  evidence.targets[0].target.mode = 'LIVE';
  delete evidence.targets[0].observations[0].crossRunLeakDetected;
  assert.equal((await securityBaselineGate.evaluate(evidence)).status, 'NOT_VALIDATED');
  evidence.targets[0].observations[0].crossRunLeakDetected = true;
  const result = await securityBaselineGate.evaluate(evidence);
  assert.equal(result.status, 'FAIL');
  assert.match(result.details.join('\n'), /SEC-008 Cross-run state leakage: failed/);
  assert.match(result.details.join('\n'), /SEC-001 Tenant isolation: observed/);
});

test('missing required observations and unhealthy targets cannot pass', async () => {
  const run = await createPhaseOneEngine().run({ targets: ['temporal'] });
  const evidence = structuredClone(run.evidence);
  evidence.targets[0].target.mode = 'LIVE';
  evidence.targets[0].health.healthy = false;
  assert.equal((await securityBaselineGate.evaluate(evidence)).status, 'NOT_VALIDATED');
  evidence.targets[0].health.healthy = true;
  evidence.targets[0].observations.pop();
  assert.equal((await securityBaselineGate.evaluate(evidence)).status, 'NOT_VALIDATED');
});

test('the engine keeps passing, failing and unvalidated target gate results separate', async () => {
  const targets = phaseOneDependencies.targets.map((target) => Object.assign(Object.create(target), {
    metadata: async () => ({ ...await target.metadata(), mode: 'LIVE' as const }),
    health: async () => ({ healthy: target.id !== 'inngest', details: [] }),
    observe: async (id: string) => ({ ...await target.observe(id), crossTenantLeakDetected: target.id === 'temporal' }),
  }));
  const result = await new OrchevalEngine({ ...phaseOneDependencies, targets }).run({ targets: ['temporal', 'hatchet', 'inngest'] });
  assert.deepEqual(result.gates.map(({ targetId, status }) => ({ targetId, status })), [
    { targetId: 'temporal', status: 'FAIL' }, { targetId: 'hatchet', status: 'PASS' }, { targetId: 'inngest', status: 'NOT_VALIDATED' },
  ]);
  assert.equal(result.summary.eligible, false);
});
