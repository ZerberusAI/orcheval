import type { EvaluationContext, EvaluationExecution, EvaluationSignal, EvaluationTarget, ExecutionHandle, ExecutionObservation, HealthResult, TargetMetadata, WorkloadDefinition } from '../packages/core/index.ts';
import { liveRunnerFor, RunnerTarget } from './runner-target.ts';

const WORKFLOW_STEPS: Record<string, string[]> = {
  sequential: ['context', 'policy', 'retrieval', 'model', 'validation'],
  'fan-out': ['tool-a', 'tool-b', 'tool-c', 'aggregate', 'synthesis'],
  'tenant-burst': ['queue', 'worker', 'result'],
  'retry-idempotency': ['consequential-operation', 'retry-verification'],
  'worker-failure': ['work', 'recovery', 'validation'],
  'approval-resume': ['start', 'approval', 'resume'],
  cancellation: ['queue', 'cancel'],
  load: ['queue', 'work', 'result'],
  context: ['context', 'model', 'validation'],
  'version-change': ['wait', 'version-check', 'resume'],
};

class SimulatedOrchestrationTarget implements EvaluationTarget {
  private readonly executions = new Map<string, ExecutionObservation>();
  readonly id: string;
  private readonly displayName: string;

  constructor(id: string, displayName: string) { this.id = id; this.displayName = displayName; }

  async metadata(): Promise<TargetMetadata> {
    return { id: this.id, displayName: this.displayName, version: 'simulator-1.0.0', mode: 'SIMULATED', adapterVersion: 'simulator-1.0.0', sdkVersions: {}, containerImageDigests: [], capabilities: ['durable-execution', 'external-signals', 'cancellation', 'telemetry-export', 'workflow-versioning'] };
  }

  async setup(_context: EvaluationContext): Promise<void> { this.executions.clear(); }
  async health(): Promise<HealthResult> { return { healthy: true, details: ['Local deterministic adapter simulator is ready.'] }; }

  async execute(workload: WorkloadDefinition, execution: EvaluationExecution): Promise<ExecutionHandle> {
    const startedAt = new Date().toISOString();
    const injectedTransientFailure = execution.faults.includes('transient_failure') && workload.id === 'ORCH-04';
    const injectedWorkerFailure = execution.faults.includes('worker_kill') && workload.id === 'ORCH-05';
    const outcome = execution.cancellationRequested ? 'CANCELLED' : 'SUCCEEDED';
    const steps = (WORKFLOW_STEPS[workload.kind] ?? ['execute']).map((id, index) => {
      const timestamp = new Date(Date.now() + index).toISOString();
      return { id, startedAt: timestamp, endedAt: timestamp, attempt: injectedTransientFailure && index === 0 ? 2 : 1, outcome: outcome as 'SUCCEEDED' | 'CANCELLED' };
    });
    this.executions.set(execution.id, {
      executionId: execution.id, tenantId: execution.tenantId, correlationId: execution.correlationId, workloadId: workload.id,
      startedAt, endedAt: new Date().toISOString(), outcome: outcome as 'SUCCEEDED' | 'CANCELLED', steps,
      attempts: injectedTransientFailure ? 2 : 1, errors: injectedWorkerFailure ? ['Injected worker failure recovered.'] : [],
      duplicateSideEffects: 0, crossTenantLeakDetected: false, secretExposureDetected: false, identitySubstitutionAllowed: false,
      cancellationAffectedUnrelatedWork: false, auditTrailComplete: true, recoverySkippedSteps: false,
    });
    return { executionId: execution.id };
  }

  async signal(_executionId: string, _signal: EvaluationSignal): Promise<void> {}
  async cancel(executionId: string): Promise<void> {
    const observation = this.executions.get(executionId);
    if (observation) observation.outcome = 'CANCELLED';
  }
  async observe(executionId: string): Promise<ExecutionObservation> {
    const observation = this.executions.get(executionId);
    if (!observation) throw new Error(`Unknown execution: ${executionId}`);
    return structuredClone(observation);
  }
  async teardown(_context: EvaluationContext): Promise<void> { this.executions.clear(); }
}

/**
 * These deterministic simulators exercise the Phase 1 contracts locally. They deliberately
 * report SIMULATED mode, so a run cannot be presented as validation of vendor runtimes.
 */
function referenceAdapter(id: string, productName: string): EvaluationTarget {
  const runner = liveRunnerFor(id);
  return runner ? new RunnerTarget(id, productName, runner) : new SimulatedOrchestrationTarget(id, `${productName} local contract simulator`);
}

export const referenceAdapters: EvaluationTarget[] = [
  referenceAdapter('hatchet', 'Hatchet'),
  referenceAdapter('temporal', 'Temporal'),
  referenceAdapter('inngest', 'Inngest'),
];

export const adapters = referenceAdapters.map((adapter) => adapter.id);
