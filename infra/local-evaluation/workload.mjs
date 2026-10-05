import { setTimeout as delay } from 'node:timers/promises';

export const stepIds = ['context', 'policy', 'retrieval', 'model', 'validation'];

// Synthetic application operations executed by real vendor workers.
export async function mockStep(id, state, execution) {
  const index = stepIds.indexOf(id);
  if (index < 0 || state.completed.join(',') !== stepIds.slice(0, index).join(',')) throw new Error(`Unexpected step order at ${id}.`);
  const startedAt = new Date().toISOString();
  await delay(5);
  const next = { completed: [...state.completed, id], output: id === 'validation' ? `approved:${execution.tenantId}:${execution.id}` : null };
  return { state: next, observation: { id, startedAt, endedAt: new Date().toISOString(), attempt: 1, outcome: 'SUCCEEDED' } };
}

export function verifyResult(result) {
  if (!result?.execution || !Array.isArray(result.steps) || result.steps.map(({ id }) => id).join(',') !== stepIds.join(',') || result.output !== `approved:${result.execution.tenantId}:${result.execution.id}`) throw new Error('Sequential workflow returned incorrect output or missing/out-of-order steps.');
}

export function observationFromResult(executionId, result, timing, runtimeEvidence) {
  verifyResult(result);
  return {
    executionId, tenantId: result.execution.tenantId, correlationId: result.execution.correlationId, workloadId: 'ORCH-01',
    ...timing, outcome: 'SUCCEEDED', steps: result.steps, attempts: 1, errors: [],
    // This smoke scenario does not perform the security probes. Unknown is explicit.
    duplicateSideEffects: null, crossTenantLeakDetected: null, secretExposureDetected: null,
    identitySubstitutionAllowed: null, cancellationAffectedUnrelatedWork: null,
    auditTrailComplete: null, recoverySkippedSteps: null, crossRunLeakDetected: null,
    output: result.output, runtimeEvidence,
  };
}

export function assertSequential(payload) {
  if (payload?.workload?.id !== 'ORCH-01' || payload.workload.kind !== 'sequential') throw new Error('This smoke runner supports only ORCH-01 sequential execution.');
  if (payload.execution.faults.length || payload.execution.cancellationRequested) throw new Error('Fault injection and cancellation scenarios are outside the smoke profile.');
}
