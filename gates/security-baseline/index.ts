import type { EvaluationEvidence, EvaluationGate, GateResult } from '../../packages/core/index.ts';

const ASSERTIONS = [
  ['SEC-001', 'Tenant isolation', true, (value: { crossTenantLeakDetected: boolean }) => !value.crossTenantLeakDetected],
  ['SEC-002', 'Secret handling', true, (value: { secretExposureDetected: boolean }) => !value.secretExposureDetected],
  ['SEC-003', 'Retry safety', true, (value: { duplicateSideEffects: number }) => value.duplicateSideEffects === 0],
  ['SEC-004', 'Execution identity integrity', true, (value: { identitySubstitutionAllowed: boolean }) => !value.identitySubstitutionAllowed],
  ['SEC-005', 'Cancellation integrity', true, (value: { cancellationAffectedUnrelatedWork: boolean }) => !value.cancellationAffectedUnrelatedWork],
  ['SEC-006', 'Audit trace integrity', true, (value: { auditTrailComplete: boolean }) => value.auditTrailComplete],
  ['SEC-007', 'Failure recovery integrity', true, (value: { recoverySkippedSteps: boolean }) => !value.recoverySkippedSteps],
  ['SEC-008', 'Cross-run state leakage', true, (value: { crossTenantLeakDetected: boolean }) => !value.crossTenantLeakDetected],
] as const;

export const securityBaselineGate: EvaluationGate = {
  id: 'security-baseline',
  version: '1.0.0',
  mandatory: true,
  async evaluate(evidence: EvaluationEvidence): Promise<GateResult> {
    const observations = evidence.targets.flatMap((target) => target.observations);
    const assertions = ASSERTIONS.map(([id, description, observable, predicate]) => ({ id, description, observable, pass: observations.length > 0 && observations.every(predicate) }));
    const allLive = evidence.targets.length > 0 && evidence.targets.every(({ target }) => target.mode === 'LIVE');
    const status = !observations.length ? 'NOT_VALIDATED' : assertions.some((assertion) => assertion.observable && !assertion.pass) ? 'FAIL' : allLive && assertions.every((assertion) => assertion.observable) ? 'PASS' : 'NOT_VALIDATED';
    return {
      id: 'security-baseline', mandatory: true, status,
      details: assertions.map((assertion) => `${assertion.id} ${assertion.description}: ${!assertion.observable ? 'not validated by the current evidence model' : assertion.pass ? 'observed' : 'failed'}.`),
      evidence: [
        `${observations.length} execution observations evaluated.`,
        allLive ? 'Evidence comes from live targets.' : 'Evidence comes from SIMULATED targets; it is not vendor validation.',
      ],
    };
  },
};

export const securityBaselineGates = ASSERTIONS.map(([id, description]) => ({ id, description }));
