import test from 'node:test';
import assert from 'node:assert/strict';

import { SideEffectLedger, structuralWorkloadOracle } from '../packages/core/oracle.ts';

test('side-effect ledger detects duplicate and conflicting idempotency keys', () => {
  const ledger = new SideEffectLedger();
  assert.equal(ledger.record('operation-1', { value: 1 }).duplicate, false);
  assert.equal(ledger.record('operation-1', { value: 1 }).duplicate, true);
  assert.throws(() => ledger.record('operation-1', { value: 2 }), /different data/);
  assert.equal(ledger.count(), 1);
});

test('structural oracle rejects a successful workload with no observable steps', async () => {
  const verdict = await structuralWorkloadOracle.evaluate(
    { id: 'ORCH-01', description: 'test', required: true, kind: 'sequential' },
    { id: 'run-1', tenantId: 'tenant-a', correlationId: 'run-1', faults: [] },
    { executionId: 'run-1', tenantId: 'tenant-a', correlationId: 'run-1', workloadId: 'ORCH-01', startedAt: '2026-10-07T00:00:00.000Z', endedAt: '2026-10-07T00:00:01.000Z', outcome: 'SUCCEEDED', steps: [], attempts: 1, errors: [], duplicateSideEffects: null, crossTenantLeakDetected: null, secretExposureDetected: null, identitySubstitutionAllowed: null, cancellationAffectedUnrelatedWork: null, auditTrailComplete: null, recoverySkippedSteps: null },
  );
  assert.equal(verdict.passed, false);
});
