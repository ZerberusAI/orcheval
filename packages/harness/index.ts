import { referenceAdapters } from '../../adapters/index.ts';
import { securityBaselineGate } from '../../gates/security-baseline/index.ts';
import { phaseOneMetrics } from '../../metrics/latency/index.ts';
import { aiOrchestrationProfile } from '../../profiles/ai-orchestration/index.ts';
import { coreV1WorkloadOracle } from '../../profiles/ai-orchestration/oracle.ts';
import { OrchevalEngine, type EngineDependencies, type EvaluationConfig, type EvaluationRunResult } from '../core/index.ts';

export const phaseOneDependencies: EngineDependencies = { profiles: [aiOrchestrationProfile], targets: referenceAdapters, gates: [securityBaselineGate], metrics: phaseOneMetrics, oracle: coreV1WorkloadOracle };
export function createPhaseOneEngine(): OrchevalEngine {
  return new OrchevalEngine(phaseOneDependencies);
}

export class EvaluationHarness {
  private readonly engine: OrchevalEngine;

  constructor(engine = createPhaseOneEngine()) { this.engine = engine; }

  async run(config: EvaluationConfig): Promise<EvaluationRunResult> { return this.engine.run(config); }
}
