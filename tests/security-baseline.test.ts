import test from 'node:test';
import assert from 'node:assert/strict';

import { securityBaselineGate } from '../gates/security-baseline/index.ts';
import { createPhaseOneEngine } from '../packages/harness/index.ts';

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
