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
  return observationFromSnapshot(executionId, { ...result, outcome: 'SUCCEEDED' }, timing, runtimeEvidence);
}

export function observationFromSnapshot(executionId, result, timing, runtimeEvidence) {
  return {
    executionId, tenantId: result.execution.tenantId, correlationId: result.execution.correlationId, workloadId: result.workloadId ?? 'ORCH-01',
    ...timing, outcome: result.outcome, steps: result.steps, attempts: Math.max(1, ...result.steps.map((step) => step.attempt)), errors: [],
    // A runtime result cannot substitute for the adversarial security probes. Values
    // remain null unless a specific probe has independently established them.
    duplicateSideEffects: result.duplicateSideEffects ?? null,
    crossTenantLeakDetected: result.crossTenantLeakDetected ?? null,
    secretExposureDetected: result.secretExposureDetected ?? null,
    identitySubstitutionAllowed: result.identitySubstitutionAllowed ?? null,
    cancellationAffectedUnrelatedWork: result.cancellationAffectedUnrelatedWork ?? null,
    auditTrailComplete: result.auditTrailComplete ?? null,
    recoverySkippedSteps: result.recoverySkippedSteps ?? null,
    crossRunLeakDetected: result.crossRunLeakDetected ?? null,
    output: result.output, runtimeEvidence,
  };
}

export function assertSequential(payload) {
  if (payload?.workload?.id !== 'ORCH-01' || payload.workload.kind !== 'sequential') throw new Error('This smoke runner supports only ORCH-01 sequential execution.');
  if (payload.execution.faults.length || payload.execution.cancellationRequested) throw new Error('Fault injection and cancellation scenarios are outside the smoke profile.');
}
