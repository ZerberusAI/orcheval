import type { EvaluationExecution, ExecutionObservation, WorkloadDefinition } from '../../packages/core/index.ts';
import { structuralWorkloadOracle, type OracleVerdict, type WorkloadOracle } from '../../packages/core/oracle.ts';

const stepsByWorkload: Record<string, string[]> = {
  'ORCH-01': ['context', 'policy', 'retrieval', 'model', 'validation'],
  'ORCH-02': ['tool-a', 'tool-b', 'tool-c', 'aggregate', 'synthesis'],
  'ORCH-03': ['admit', 'dispatch', 'result'],
  'ORCH-04': ['validate-request', 'consequential-operation', 'verify-effect'],
  'ORCH-05': ['start', 'recoverable-operation', 'verify-recovery'],
  'ORCH-06': ['request', 'policy', 'approval', 'fulfil', 'audit'],
  'ORCH-07': ['queue', 'dispatch', 'wait'],
  'ORCH-08': ['admit', 'work', 'result'],
  'ORCH-09': ['hydrate-context', 'model', 'validate-context'],
  'ORCH-10': ['prepare', 'version-marker', 'resume'],
};

export function coreV1Steps(workloadId: string): string[] {
  const steps = stepsByWorkload[workloadId];
  if (!steps) throw new Error(`Unknown core-v1 workload: ${workloadId}.`);
  return [...steps];
}

function outputFor(execution: EvaluationExecution, workload: WorkloadDefinition): string {
  return `order:${execution.tenantId}:${execution.id}:${workload.id}`;
}

function verdict(workload: WorkloadDefinition, execution: EvaluationExecution, observation: ExecutionObservation): OracleVerdict {
  const details: string[] = [];
  if (observation.executionId !== execution.id || observation.workloadId !== workload.id) details.push('Execution/workload identity does not match the submitted request.');
  const expected = coreV1Steps(workload.id);
  const seen = observation.steps.map((step) => step.id);
  const cancelled = workload.id === 'ORCH-07';
  const expectedSteps = cancelled ? expected.slice(0, 2) : expected;
  if (seen.join(',') !== expectedSteps.join(',')) details.push(`Observed steps differ from the core-v1 contract (expected ${expectedSteps.join(',')}; got ${seen.join(',')}).`);
  if (observation.outcome !== (cancelled ? 'CANCELLED' : 'SUCCEEDED')) details.push(`Unexpected terminal outcome: ${observation.outcome}.`);
  if (!cancelled && observation.output !== outputFor(execution, workload)) details.push('Returned application output does not match the independently derived result.');
  const retried = (workload.id === 'ORCH-04' && execution.faults.includes('transient_failure')) || (workload.id === 'ORCH-05' && execution.faults.includes('worker_kill'));
  if (retried && !observation.steps.some((step) => step.attempt >= 2)) details.push('The configured recoverable fault did not produce an observed retry.');
  if (workload.id === 'ORCH-04' && observation.duplicateSideEffects !== 0) details.push('Consequential operation did not provide zero-duplicate side-effect evidence.');
  return { passed: details.length === 0, details };
}

/** Core-v1 checks are application invariants, distinct from the security-gate probes. */
export const coreV1WorkloadOracle: WorkloadOracle = {
  id: 'core-v1-order-workload-oracle', version: '1.0.0',
  async evaluate(workload, execution, observation) {
    const runtime = observation.runtimeEvidence as { protocol?: unknown } | undefined;
    // Contract simulators are retained for harness tests; they cannot claim core-v1 coverage.
    if (runtime?.protocol !== 'core-v1') return structuralWorkloadOracle.evaluate(workload, execution, observation);
    return verdict(workload, execution, observation);
  },
};
