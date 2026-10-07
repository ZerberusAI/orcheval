import type { EvaluationEvidence, EvaluationGate, ExecutionObservation, GateResult } from '../../packages/core/index.ts';

function absent(value: boolean | null | undefined): boolean | null { return typeof value === 'boolean' ? !value : null; }

const ASSERTIONS = [
  ['SEC-001', 'Tenant isolation', (value: ExecutionObservation) => absent(value.crossTenantLeakDetected)],
  ['SEC-002', 'Secret handling', (value: ExecutionObservation) => absent(value.secretExposureDetected)],
  ['SEC-003', 'Retry safety', (value: ExecutionObservation) => typeof value.duplicateSideEffects !== 'number' ? null : value.duplicateSideEffects === 0],
  ['SEC-004', 'Execution identity integrity', (value: ExecutionObservation) => absent(value.identitySubstitutionAllowed)],
  ['SEC-005', 'Cancellation integrity', (value: ExecutionObservation) => absent(value.cancellationAffectedUnrelatedWork)],
  ['SEC-006', 'Audit trace integrity', (value: ExecutionObservation) => value.auditTrailComplete],
  ['SEC-007', 'Failure recovery integrity', (value: ExecutionObservation) => absent(value.recoverySkippedSteps)],
  ['SEC-008', 'Cross-run state leakage', (value: ExecutionObservation) => absent(value.crossRunLeakDetected)],
] as const;

export const securityBaselineGate: EvaluationGate = {
  id: 'security-baseline',
  version: '1.1.0',
  mandatory: true,
  async evaluate(evidence: EvaluationEvidence): Promise<GateResult> {
    const observations = evidence.targets.flatMap((target) => target.observations);
    const assertions = ASSERTIONS.map(([id, description, predicate]) => {
      const checks = observations.map(predicate);
      return { id, description, failed: checks.some((value) => value === false), validated: checks.length > 0 && checks.every((value) => value === true) };
    });
    const allLive = evidence.targets.length > 0 && evidence.targets.every(({ target }) => target.mode === 'LIVE');
    const expectedPerScenario = evidence.config.repetitions * evidence.config.concurrency.length;
    const completeCoverage = evidence.targets.length > 0 && evidence.targets.every((target) => target.health.healthy && evidence.manifest.profile.scenarios.filter((scenario) => scenario.required).every((scenario) => target.observations.filter((observation) => observation.workloadId === scenario.id).length === expectedPerScenario));
    const status = assertions.some((assertion) => assertion.failed) ? 'FAIL' : allLive && completeCoverage && assertions.every((assertion) => assertion.validated) ? 'PASS' : 'NOT_VALIDATED';
    return {
      id: 'security-baseline', mandatory: true, status,
      details: assertions.map((assertion) => `${assertion.id} ${assertion.description}: ${assertion.failed ? 'failed' : allLive && completeCoverage && assertion.validated ? 'observed' : 'not validated'}.`),
      evidence: [
        `${observations.length} execution observations evaluated.`,
        allLive ? 'Evidence comes from live targets.' : 'Evidence comes from SIMULATED targets; it is not vendor validation.',
        completeCoverage ? 'Required scenario observation counts are present.' : 'A target is unhealthy or required observations are missing.',
      ],
    };
  },
};

export const securityBaselineGates = ASSERTIONS.map(([id, description]) => ({ id, description }));
