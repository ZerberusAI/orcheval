import { createHash } from 'node:crypto';
import type { EvaluationExecution, ExecutionObservation, WorkloadDefinition } from './index.ts';

export interface OracleVerdict { passed: boolean; details: string[]; }
export interface WorkloadOracle { id: string; version: string; evaluate(workload: WorkloadDefinition, execution: EvaluationExecution, observation: ExecutionObservation): Promise<OracleVerdict>; }

/** Records idempotency keys independently from a provider's own completion report. */
export class SideEffectLedger {
  private readonly effects = new Map<string, string>();
  record(key: string, value: unknown): { duplicate: boolean; digest: string } {
    const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const previous = this.effects.get(key);
    if (previous && previous !== digest) throw new Error(`Side effect key ${key} was reused with different data.`);
    this.effects.set(key, digest);
    return { duplicate: Boolean(previous), digest };
  }
  count(): number { return this.effects.size; }
}

/** Minimum independent check applicable to every provider-neutral workload. */
export const structuralWorkloadOracle: WorkloadOracle = {
  id: 'structural-workload-oracle', version: '1.0.0',
  async evaluate(workload, execution, observation) {
    const details: string[] = [];
    if (observation.executionId !== execution.id) details.push('Execution id does not match the submitted workload.');
    if (observation.workloadId !== workload.id) details.push('Workload id does not match the submitted workload.');
    if (observation.outcome === 'SUCCEEDED' && !observation.steps.length) details.push('Successful workload has no independently observable steps.');
    return { passed: details.length === 0, details };
  },
};
