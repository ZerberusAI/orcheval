import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Candidate-neutral contracts used by profiles, targets and plugins. */
export type GateStatus = 'PASS' | 'FAIL' | 'NOT_VALIDATED';
export type MetricStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_VALIDATED';
export type ExecutionOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'WAITING';

export interface EvaluationConfig { version?: number; name?: string; profileId?: string; targets?: string[]; gates?: string[]; metrics?: string[]; repetitions?: number; concurrency?: number[]; faults?: string[]; outputDir?: string; }
export interface EvaluationContext { evaluationId: string; runId: string; profileId: string; targetId: string; }
export interface TargetMetadata { id: string; displayName: string; version: string; mode: 'SIMULATED' | 'LIVE'; capabilities: string[]; }
export interface HealthResult { healthy: boolean; details: string[]; }
export interface WorkloadDefinition { id: string; description: string; required: boolean; kind: string; }
export interface EvaluationExecution { id: string; tenantId: string; correlationId: string; faults: string[]; cancellationRequested?: boolean; }
export interface ExecutionHandle { executionId: string; }
export interface EvaluationSignal { name: string; payload?: unknown; }
export interface StepObservation { id: string; startedAt: string; endedAt: string; attempt: number; outcome: ExecutionOutcome; }
export interface ExecutionObservation { executionId: string; tenantId: string; correlationId: string; workloadId: string; startedAt: string; endedAt: string; outcome: ExecutionOutcome; steps: StepObservation[]; attempts: number; errors: string[]; duplicateSideEffects: number; crossTenantLeakDetected: boolean; secretExposureDetected: boolean; identitySubstitutionAllowed: boolean; cancellationAffectedUnrelatedWork: boolean; auditTrailComplete: boolean; recoverySkippedSteps: boolean; }

export interface EvaluationTarget {
  id: string;
  metadata(): Promise<TargetMetadata>;
  setup(context: EvaluationContext): Promise<void>;
  health(): Promise<HealthResult>;
  execute(workload: WorkloadDefinition, execution: EvaluationExecution): Promise<ExecutionHandle>;
  signal?(executionId: string, signal: EvaluationSignal): Promise<void>;
  cancel(executionId: string): Promise<void>;
  observe(executionId: string): Promise<ExecutionObservation>;
  teardown(context: EvaluationContext): Promise<void>;
}

export interface TargetEvidence { target: TargetMetadata; health: HealthResult; observations: ExecutionObservation[]; }
export interface TraceEvent { name: string; timestamp: string; attributes: Record<string, string | number | boolean>; }
export interface EvaluationEvidence { evaluationId: string; runId: string; fingerprint: string; profileId: string; profileVersion: string; config: Required<Pick<EvaluationConfig, 'repetitions' | 'faults' | 'concurrency'>>; targets: TargetEvidence[]; traces: TraceEvent[]; capturedAt: string; }
export interface GateResult { id: string; mandatory: boolean; status: GateStatus; details: string[]; evidence: string[]; }
export interface MetricResult { id: string; status: MetricStatus; raw: Record<string, number | string | boolean>; normalised?: number; score?: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; limitations: string[]; }
export interface EvaluationGate { id: string; mandatory: boolean; evaluate(evidence: EvaluationEvidence): Promise<GateResult>; }
export interface MetricPlugin { id: string; requirements(): string[]; evaluate(evidence: EvaluationEvidence): Promise<MetricResult>; }
export interface WorkloadProfile { id: string; version: string; scenarios: WorkloadDefinition[]; }
export interface EvaluationSummary { status: 'PASS' | 'FAIL' | 'INCOMPLETE'; eligible: boolean; message: string; }
export interface EvaluationRunResult { profileId: string; summary: EvaluationSummary; gates: GateResult[]; metrics: MetricResult[]; evidence: EvaluationEvidence; }
export interface EngineDependencies { profiles: WorkloadProfile[]; targets: EvaluationTarget[]; gates: EvaluationGate[]; metrics: MetricPlugin[]; }

export const DEFAULT_PROFILE_ID = 'ai-orchestration';
export const DEFAULT_GATES = ['security-baseline'];
export const DEFAULT_METRICS = ['latency', 'throughput', 'burst', 'traceability'];

export function validateConfig(config: EvaluationConfig, dependencies?: EngineDependencies): string[] {
  const errors: string[] = [];
  if (!config.profileId?.trim()) errors.push('Profile id is required.');
  if (!config.targets?.length) errors.push('At least one target is required.');
  if (!config.gates?.length) errors.push('At least one gate is required.');
  if ((config.repetitions ?? 1) < 1) errors.push('Repetitions must be at least one.');
  if (!dependencies) return errors;
  if (config.profileId && !dependencies.profiles.some((profile) => profile.id === config.profileId)) errors.push(`Unknown profile: ${config.profileId}.`);
  for (const target of config.targets ?? []) if (!dependencies.targets.some((candidate) => candidate.id === target)) errors.push(`Unknown target: ${target}.`);
  for (const gate of config.gates ?? []) if (!dependencies.gates.some((candidate) => candidate.id === gate)) errors.push(`Unknown gate: ${gate}.`);
  for (const metric of config.metrics ?? []) if (!dependencies.metrics.some((candidate) => candidate.id === metric)) errors.push(`Unknown metric: ${metric}.`);
  return errors;
}

export function buildReportMarkdown(result: EvaluationRunResult): string {
  const targetRows = result.evidence.targets.map((entry) => `| ${entry.target.displayName} | ${entry.target.mode} | ${entry.observations.length} | ${entry.health.healthy ? 'PASS' : 'FAIL'} |`).join('\n');
  const gates = result.gates.map((gate) => `| ${gate.id} | ${gate.status} | ${gate.details.join(' ')} |`).join('\n');
  const metrics = result.metrics.map((metric) => `| ${metric.id} | ${metric.status} | ${metric.normalised ?? 'n/a'} | ${metric.confidence} |`).join('\n');
  return ['# Orcheval Evaluation Report', '', `Profile: ${result.profileId}`, `Fingerprint: ${result.evidence.fingerprint}`, `Status: ${result.summary.status}`, `Admissible: ${result.summary.eligible ? 'yes' : 'no'}`, '', result.summary.message, '', '## Targets', '| Target | Mode | Executions | Health |', '| --- | --- | ---: | --- |', targetRows, '', '## Mandatory gates', '| Gate | Status | Details |', '| --- | --- | --- |', gates, '', '## Metrics', '| Metric | Status | Normalised | Confidence |', '| --- | --- | ---: | --- |', metrics].join('\n');
}

export function buildEnvironmentSnapshot(result: EvaluationRunResult): Record<string, unknown> {
  return { frameworkVersion: '0.1.0', frameworkGitCommit: process.env.GITHUB_SHA ?? 'local-dev', profile: result.profileId, targetVersions: result.evidence.targets.map(({ target }) => ({ id: target.id, version: target.version, mode: target.mode })), nodeVersion: process.version, platform: process.platform, architecture: process.arch, configurationHash: result.evidence.fingerprint, timestamp: result.evidence.capturedAt };
}

function resolvedConfigYaml(result: EvaluationRunResult): string {
  return ['version: 1', 'profile:', `  id: ${result.profileId}`, 'targets:', ...result.evidence.targets.map(({ target }) => `  - ${target.id}`), 'gates:', ...result.gates.map((gate) => `  - ${gate.id}`), 'metrics:', ...result.metrics.map((metric) => `  - ${metric.id}`), 'runs:', `  repetitions: ${result.evidence.config.repetitions}`].join('\n') + '\n';
}

export async function writeEvaluationBundle(result: EvaluationRunResult, baseDir: string): Promise<string> {
  const runDir = join(baseDir, result.evidence.runId);
  await mkdir(join(runDir, 'raw'), { recursive: true });
  await mkdir(join(runDir, 'traces'), { recursive: true });
  await Promise.all([
    writeFile(join(runDir, 'environment.json'), JSON.stringify(buildEnvironmentSnapshot(result), null, 2) + '\n'),
    writeFile(join(runDir, 'config.resolved.yaml'), resolvedConfigYaml(result)),
    writeFile(join(runDir, 'gates.json'), JSON.stringify(result.gates, null, 2) + '\n'),
    writeFile(join(runDir, 'metrics.json'), JSON.stringify(result.metrics, null, 2) + '\n'),
    writeFile(join(runDir, 'comparison.json'), JSON.stringify({ summary: result.summary, targets: result.evidence.targets.map(({ target }) => target.id) }, null, 2) + '\n'),
    writeFile(join(runDir, 'raw', 'observations.json'), JSON.stringify(result.evidence.targets, null, 2) + '\n'),
    writeFile(join(runDir, 'traces', 'events.json'), JSON.stringify(result.evidence.traces, null, 2) + '\n'),
    writeFile(join(runDir, 'report.md'), buildReportMarkdown(result)),
  ]);
  return runDir;
}

export class OrchevalEngine {
  private readonly dependencies: EngineDependencies;

  constructor(dependencies: EngineDependencies) { this.dependencies = dependencies; }

  async run(config: EvaluationConfig): Promise<EvaluationRunResult> {
    const normalised: EvaluationConfig = { ...config, profileId: config.profileId ?? DEFAULT_PROFILE_ID, gates: config.gates?.length ? config.gates : DEFAULT_GATES, metrics: config.metrics?.length ? config.metrics : DEFAULT_METRICS, repetitions: config.repetitions ?? 1, concurrency: config.concurrency?.length ? config.concurrency : [1], faults: config.faults ?? [] };
    const errors = validateConfig(normalised, this.dependencies);
    if (errors.length) throw new Error(`Invalid evaluation configuration: ${errors.join(' ')}`);
    const profile = this.dependencies.profiles.find((candidate) => candidate.id === normalised.profileId)!;
    const selectedTargets = this.dependencies.targets.filter((candidate) => normalised.targets!.includes(candidate.id));
    const evaluationId = `evaluation-${Date.now()}`;
    const targetEvidence: TargetEvidence[] = [];
    for (const target of selectedTargets) {
      const metadata = await target.metadata();
      const context: EvaluationContext = { evaluationId, runId: `${evaluationId}-${target.id}`, profileId: profile.id, targetId: target.id };
      await target.setup(context);
      try {
        const health = await target.health();
        const observations: ExecutionObservation[] = [];
        if (health.healthy) for (const scenario of profile.scenarios) for (let repetition = 0; repetition < normalised.repetitions!; repetition += 1) {
          const execution: EvaluationExecution = { id: `${context.runId}-${scenario.id}-${repetition}`, tenantId: scenario.id === 'ORCH-03' ? ['tenant-a', 'tenant-b', 'tenant-c'][repetition % 3] : 'tenant-a', correlationId: `${context.runId}-${scenario.id}-${repetition}`, faults: normalised.faults!, cancellationRequested: scenario.id === 'ORCH-07' };
          const handle = await target.execute(scenario, execution);
          observations.push(await target.observe(handle.executionId));
        }
        targetEvidence.push({ target: metadata, health, observations });
      } finally { await target.teardown(context); }
    }
    const traces: TraceEvent[] = targetEvidence.flatMap(({ target, observations }) => observations.flatMap((observation) => [
      { name: 'orchestration.execution', timestamp: observation.startedAt, attributes: { 'evaluation.id': evaluationId, 'evaluation.run_id': evaluationId, 'profile.id': profile.id, 'target.id': target.id, 'tenant.id': observation.tenantId, 'execution.id': observation.executionId, 'correlation.id': observation.correlationId, 'execution.outcome': observation.outcome } },
      ...observation.steps.map((step) => ({ name: 'workload.step', timestamp: step.startedAt, attributes: { 'evaluation.id': evaluationId, 'profile.id': profile.id, 'target.id': target.id, 'tenant.id': observation.tenantId, 'execution.id': observation.executionId, 'correlation.id': observation.correlationId, 'step.id': step.id, 'attempt.number': step.attempt, 'execution.outcome': step.outcome } })),
    ]));
    const resolvedConfig = { repetitions: normalised.repetitions!, faults: normalised.faults!, concurrency: normalised.concurrency! };
    const fingerprint = createHash('sha256').update(JSON.stringify({ frameworkVersion: '0.1.0', profile: { id: profile.id, version: profile.version }, targets: targetEvidence.map(({ target }) => ({ id: target.id, version: target.version, mode: target.mode })), config: resolvedConfig })).digest('hex');
    const evidence: EvaluationEvidence = { evaluationId, runId: evaluationId, fingerprint, profileId: profile.id, profileVersion: profile.version, config: resolvedConfig, targets: targetEvidence, traces, capturedAt: new Date().toISOString() };
    const gates = await Promise.all(this.dependencies.gates.filter((gate) => normalised.gates!.includes(gate.id)).map((gate) => gate.evaluate(evidence)));
    const metrics = await Promise.all(this.dependencies.metrics.filter((metric) => normalised.metrics!.includes(metric.id)).map((metric) => metric.evaluate(evidence)));
    const failed = gates.some((gate) => gate.mandatory && gate.status === 'FAIL');
    const incomplete = gates.some((gate) => gate.mandatory && gate.status === 'NOT_VALIDATED');
    const summary: EvaluationSummary = failed ? { status: 'FAIL', eligible: false, message: 'A mandatory gate failed; comparative suitability is suppressed.' } : incomplete ? { status: 'INCOMPLETE', eligible: false, message: 'Mandatory gates are not validated for every target; no admissibility claim is made.' } : { status: 'PASS', eligible: true, message: 'All mandatory gates passed with captured evidence.' };
    return { profileId: profile.id, summary, gates, metrics, evidence };
  }
}
