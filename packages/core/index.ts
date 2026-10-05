import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { captureFrameworkIdentity, captureHostEnvironment, contentHash, type ReproductionManifest } from './reproducibility.ts';
import { completeExecution } from './lifecycle.ts';

/** Candidate-neutral contracts used by profiles, targets and plugins. */
export type GateStatus = 'PASS' | 'FAIL' | 'NOT_VALIDATED';
export type MetricStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_VALIDATED';
export type ExecutionOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'QUEUED' | 'RUNNING' | 'WAITING';
export type LifecycleAction = { action: 'signal'; at: 'WAITING'; signal: EvaluationSignal } | { action: 'cancel'; at: 'QUEUED' | 'RUNNING' | 'WAITING' };
export interface LifecycleEvent { action: 'observe' | 'signal' | 'cancel'; timestamp: string; outcome: ExecutionOutcome; signal?: EvaluationSignal; }
export interface TargetCallOptions { signal: AbortSignal; }

export interface EvaluationConfig { version?: number; name?: string; profileId?: string; targets?: string[]; gates?: string[]; metrics?: string[]; repetitions?: number; concurrency?: number[]; faults?: string[]; outputDir?: string; }
export type ResolvedEvaluationConfig = Required<Omit<EvaluationConfig, 'outputDir'>>;
export interface EvaluationContext { evaluationId: string; runId: string; profileId: string; targetId: string; }
export interface TargetMetadata { id: string; displayName: string; version: string; mode: 'SIMULATED' | 'LIVE'; capabilities: string[]; adapterVersion?: string; sdkVersions?: Record<string, string>; containerImageDigests?: string[]; }
export interface HealthResult { healthy: boolean; details: string[]; }
export interface WorkloadDefinition { id: string; description: string; required: boolean; kind: string; lifecycle?: LifecycleAction; timeoutMs?: number; pollIntervalMs?: number; }
export interface EvaluationExecution { id: string; tenantId: string; correlationId: string; faults: string[]; cancellationRequested?: boolean; }
export interface ExecutionHandle { executionId: string; }
export interface EvaluationSignal { name: string; payload?: unknown; }
export interface StepObservation { id: string; startedAt: string; endedAt: string; attempt: number; outcome: ExecutionOutcome; }
export interface ExecutionObservation { executionId: string; tenantId: string; correlationId: string; workloadId: string; startedAt: string; endedAt: string; outcome: ExecutionOutcome; steps: StepObservation[]; attempts: number; errors: string[]; duplicateSideEffects: number | null; crossTenantLeakDetected: boolean | null; secretExposureDetected: boolean | null; identitySubstitutionAllowed: boolean | null; cancellationAffectedUnrelatedWork: boolean | null; auditTrailComplete: boolean | null; recoverySkippedSteps: boolean | null; crossRunLeakDetected?: boolean | null; lifecycle?: LifecycleEvent[]; runtimeEvidence?: unknown; }
/** Pending snapshots have no end time; only validated terminal observations enter results. */
export type ExecutionSnapshot = Omit<ExecutionObservation, 'endedAt'> & { endedAt: string | null; observedAt?: string; };

export interface EvaluationTarget {
  id: string;
  metadata(): Promise<TargetMetadata>;
  setup(context: EvaluationContext): Promise<void>;
  health(): Promise<HealthResult>;
  execute(workload: WorkloadDefinition, execution: EvaluationExecution): Promise<ExecutionHandle>;
  signal?(executionId: string, signal: EvaluationSignal, options?: TargetCallOptions): Promise<void>;
  cancel(executionId: string, options?: TargetCallOptions): Promise<void>;
  observe(executionId: string, options?: TargetCallOptions): Promise<ExecutionSnapshot>;
  teardown(context: EvaluationContext): Promise<void>;
}

export interface TargetEvidence { target: TargetMetadata; health: HealthResult; observations: ExecutionObservation[]; }
export interface TraceEvent { name: string; timestamp: string; attributes: Record<string, string | number | boolean>; }
export interface EvaluationEvidence { evaluationId: string; runId: string; fingerprint: string; configurationHash: string; profileId: string; profileVersion: string; config: ResolvedEvaluationConfig; manifest: ReproductionManifest; host: ReturnType<typeof captureHostEnvironment>; targets: TargetEvidence[]; traces: TraceEvent[]; capturedAt: string; }
export interface GateResult { id: string; targetId?: string; mandatory: boolean; status: GateStatus; details: string[]; evidence: string[]; }
export interface MetricResult { id: string; status: MetricStatus; raw: Record<string, number | string | boolean>; normalised?: number; score?: number; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; limitations: string[]; }
export interface EvaluationGate { id: string; version?: string; mandatory: boolean; evaluate(evidence: EvaluationEvidence): Promise<GateResult>; }
export interface MetricPlugin { id: string; version?: string; requirements(): string[]; evaluate(evidence: EvaluationEvidence): Promise<MetricResult>; }
export interface WorkloadProfile { id: string; version: string; scenarios: WorkloadDefinition[]; }
export interface EvaluationSummary { status: 'PASS' | 'FAIL' | 'INCOMPLETE'; eligible: boolean; message: string; }
export interface EvaluationRunResult { profileId: string; summary: EvaluationSummary; gates: GateResult[]; metrics: MetricResult[]; evidence: EvaluationEvidence; }
export interface EngineDependencies { profiles: WorkloadProfile[]; targets: EvaluationTarget[]; gates: EvaluationGate[]; metrics: MetricPlugin[]; }

export const DEFAULT_PROFILE_ID = 'ai-orchestration';
export const DEFAULT_GATES = ['security-baseline'];
export const DEFAULT_METRICS = ['latency', 'throughput', 'burst', 'traceability'];

export function resolveConfig(config: EvaluationConfig): ResolvedEvaluationConfig {
  return {
    version: config.version ?? 1,
    name: config.name ?? 'orchestration-runtime-evaluation',
    profileId: config.profileId ?? DEFAULT_PROFILE_ID,
    targets: [...(config.targets ?? [])],
    gates: [...(config.gates ?? DEFAULT_GATES)],
    metrics: [...(config.metrics ?? DEFAULT_METRICS)],
    repetitions: config.repetitions ?? 1,
    concurrency: [...(config.concurrency ?? [1])],
    faults: [...(config.faults ?? [])],
  };
}

export function validateConfig(config: EvaluationConfig, dependencies?: EngineDependencies): string[] {
  const errors: string[] = [];
  if ((config.version ?? 1) !== 1) errors.push('Only configuration version 1 is supported.');
  if (!config.profileId?.trim()) errors.push('Profile id is required.');
  if (!config.targets?.length) errors.push('At least one target is required.');
  if (!config.gates?.length) errors.push('At least one gate is required.');
  if (!Number.isSafeInteger(config.repetitions ?? 1) || (config.repetitions ?? 1) < 1) errors.push('Repetitions must be a positive integer.');
  if (config.concurrency && (!config.concurrency.length || config.concurrency.some((value) => !Number.isSafeInteger(value) || value < 1))) errors.push('Concurrency must contain positive integers.');
  for (const key of ['targets', 'gates', 'metrics'] as const) {
    const values = config[key] ?? [];
    if (new Set(values).size !== values.length) errors.push(`Duplicate ${key} are not supported.`);
  }
  if (!dependencies) return errors;
  if (config.profileId && !dependencies.profiles.some((profile) => profile.id === config.profileId)) errors.push(`Unknown profile: ${config.profileId}.`);
  for (const target of config.targets ?? []) if (!dependencies.targets.some((candidate) => candidate.id === target)) errors.push(`Unknown target: ${target}.`);
  for (const gate of config.gates ?? []) if (!dependencies.gates.some((candidate) => candidate.id === gate)) errors.push(`Unknown gate: ${gate}.`);
  for (const metric of config.metrics ?? []) if (!dependencies.metrics.some((candidate) => candidate.id === metric)) errors.push(`Unknown metric: ${metric}.`);
  return errors;
}

export function buildReportMarkdown(result: EvaluationRunResult): string {
  const targetRows = result.evidence.targets.map((entry) => `| ${entry.target.displayName} | ${entry.target.mode} | ${entry.observations.length} | ${entry.health.healthy ? 'PASS' : 'FAIL'} |`).join('\n');
  const gates = result.gates.map((gate) => `| ${gate.targetId ?? 'all'} | ${gate.id} | ${gate.status} | ${gate.details.join(' ')} |`).join('\n');
  const metrics = result.metrics.map((metric) => `| ${metric.id} | ${metric.status} | ${metric.normalised ?? 'n/a'} | ${metric.confidence} |`).join('\n');
  return ['# Orcheval Evaluation Report', '', `Profile: ${result.profileId}`, `Fingerprint: ${result.evidence.fingerprint}`, `Status: ${result.summary.status}`, `Admissible: ${result.summary.eligible ? 'yes' : 'no'}`, '', result.summary.message, '', '## Targets', '| Target | Mode | Executions | Health |', '| --- | --- | ---: | --- |', targetRows, '', '## Mandatory gates', '| Target | Gate | Status | Details |', '| --- | --- | --- | --- |', gates, '', '## Metrics', '| Metric | Status | Normalised | Confidence |', '| --- | --- | ---: | --- |', metrics].join('\n');
}

export function buildEnvironmentSnapshot(result: EvaluationRunResult): Record<string, unknown> {
  const { manifest, host, configurationHash, fingerprint, capturedAt } = result.evidence;
  const limitations = ['Docker version was not probed; no Docker access is required to produce a bundle.'];
  if (!manifest.framework.gitCommit) limitations.push('Framework Git revision is unavailable.');
  if (manifest.framework.gitDirty) limitations.push('The working tree contains uncommitted changes; the Git revision does not identify the exact source used.');
  if ([...manifest.gates, ...manifest.metrics].some(({ version }) => version === null)) limitations.push('Some gate or metric versions were not supplied.');
  if (manifest.targets.some((target) => target.adapterVersion === null || target.sdkVersions === null || target.containerImageDigests === null)) limitations.push('Some adapter, SDK or container metadata was not supplied; null means unknown.');
  return {
    frameworkVersion: manifest.framework.version,
    frameworkGitCommit: manifest.framework.gitCommit,
    frameworkGitDirty: manifest.framework.gitDirty,
    profile: result.profileId,
    profileVersion: manifest.profile.version,
    targetVersions: manifest.targets,
    ...host,
    configurationHash, fingerprint, timestamp: capturedAt, limitations,
  };
}

function resolvedConfigYaml(result: EvaluationRunResult): string {
  const config = result.evidence.config;
  return [
    `version: ${config.version}`, 'evaluation:', `  name: ${JSON.stringify(config.name)}`,
    'profile:', `  id: ${JSON.stringify(config.profileId)}`,
    'targets:', ...config.targets.map((id) => `  - ${JSON.stringify(id)}`),
    'gates:', ...config.gates.flatMap((id) => [`  ${JSON.stringify(id)}:`, '    required: true']),
    config.metrics.length ? 'metrics:' : 'metrics: []',
    ...config.metrics.flatMap((id) => [`  ${JSON.stringify(id)}:`, '    enabled: true']),
    'runs:', `  repetitions: ${config.repetitions}`,
    'load:', '  concurrency:', ...config.concurrency.map((value) => `    - ${value}`),
    config.faults.length ? 'faults:' : 'faults: []', ...config.faults.map((fault) => `  - ${JSON.stringify(fault)}`),
  ].join('\n') + '\n';
}

export async function writeEvaluationBundle(result: EvaluationRunResult, baseDir: string): Promise<string> {
  if (!result.evidence.runId || basename(result.evidence.runId) !== result.evidence.runId || ['.', '..'].includes(result.evidence.runId)) throw new Error('Run id must be a single directory name.');
  const runDir = join(baseDir, result.evidence.runId);
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  const files: Record<string, string> = {
    'environment.json': json(buildEnvironmentSnapshot(result)),
    'manifest.json': json({ configurationHash: result.evidence.configurationHash, fingerprint: result.evidence.fingerprint, ...result.evidence.manifest }),
    'config.resolved.yaml': resolvedConfigYaml(result),
    'gates.json': json(result.gates),
    'metrics.json': json(result.metrics),
    'comparison.json': json({ summary: result.summary, targets: result.evidence.config.targets }),
    'raw/observations.json': json(result.evidence.targets),
    'traces/events.json': json(result.evidence.traces),
    'report.md': buildReportMarkdown(result),
  };
  await mkdir(baseDir, { recursive: true });
  try { await mkdir(runDir); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Result bundle already exists; refusing to overwrite ${runDir}.`);
    throw error;
  }
  try {
    await mkdir(join(runDir, 'raw'));
    await mkdir(join(runDir, 'traces'));
    // Finish every write before removing our own incomplete directory on failure.
    const writes = await Promise.allSettled(Object.entries(files).map(([name, content]) => writeFile(join(runDir, name), content, { flag: 'wx' })));
    const failed = writes.find((entry) => entry.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  } catch (error) {
    await rm(runDir, { recursive: true, force: true });
    throw error;
  }
  return runDir;
}

export class OrchevalEngine {
  private readonly dependencies: EngineDependencies;

  constructor(dependencies: EngineDependencies) { this.dependencies = dependencies; }

  async run(config: EvaluationConfig): Promise<EvaluationRunResult> {
    const normalised = resolveConfig(config);
    const errors = validateConfig(normalised, this.dependencies);
    if (errors.length) throw new Error(`Invalid evaluation configuration: ${errors.join(' ')}`);
    const profile = this.dependencies.profiles.find((candidate) => candidate.id === normalised.profileId)!;
    const selectedTargets = normalised.targets.map((id) => this.dependencies.targets.find((candidate) => candidate.id === id)!);
    const selectedGates = normalised.gates.map((id) => this.dependencies.gates.find((candidate) => candidate.id === id)!);
    const selectedMetrics = normalised.metrics.map((id) => this.dependencies.metrics.find((candidate) => candidate.id === id)!);
    const framework = captureFrameworkIdentity();
    const host = captureHostEnvironment();
    const evaluationId = `evaluation-${randomUUID()}`;
    const targetEvidence: TargetEvidence[] = [];
    for (const target of selectedTargets) {
      const metadata = await target.metadata();
      const context: EvaluationContext = { evaluationId, runId: `${evaluationId}-${target.id}`, profileId: profile.id, targetId: target.id };
      try {
        await target.setup(context);
        const health = await target.health();
        const observations: ExecutionObservation[] = [];
        if (health.healthy) for (const scenario of profile.scenarios) for (let repetition = 0; repetition < normalised.repetitions!; repetition += 1) {
          const execution: EvaluationExecution = { id: `${context.runId}-${scenario.id}-${repetition}`, tenantId: scenario.id === 'ORCH-03' ? ['tenant-a', 'tenant-b', 'tenant-c'][repetition % 3] : 'tenant-a', correlationId: `${context.runId}-${scenario.id}-${repetition}`, faults: normalised.faults!, cancellationRequested: !scenario.lifecycle && scenario.id === 'ORCH-07' };
          const handle = await target.execute(scenario, execution);
          const observation = await completeExecution(target, scenario, execution, handle);
          observations.push(observation);
        }
        targetEvidence.push({ target: metadata, health, observations });
      } finally { await target.teardown(context); }
    }
    const traces: TraceEvent[] = targetEvidence.flatMap(({ target, observations }) => observations.flatMap((observation) => [
      { name: 'orchestration.execution', timestamp: observation.startedAt, attributes: { 'evaluation.id': evaluationId, 'evaluation.run_id': evaluationId, 'profile.id': profile.id, 'target.id': target.id, 'tenant.id': observation.tenantId, 'execution.id': observation.executionId, 'correlation.id': observation.correlationId, 'execution.outcome': observation.outcome } },
      ...observation.steps.map((step) => ({ name: 'workload.step', timestamp: step.startedAt, attributes: { 'evaluation.id': evaluationId, 'profile.id': profile.id, 'target.id': target.id, 'tenant.id': observation.tenantId, 'execution.id': observation.executionId, 'correlation.id': observation.correlationId, 'step.id': step.id, 'attempt.number': step.attempt, 'execution.outcome': step.outcome } })),
    ]));
    const manifest: ReproductionManifest = {
      framework,
      profile: { id: profile.id, version: profile.version, scenarios: structuredClone(profile.scenarios) },
      gates: selectedGates.map(({ id, version, mandatory }) => ({ id, version: version ?? null, mandatory })),
      metrics: selectedMetrics.map(({ id, version }) => ({ id, version: version ?? null })),
      targets: targetEvidence.map(({ target }) => ({ id: target.id, version: target.version, mode: target.mode, adapterVersion: target.adapterVersion ?? null, sdkVersions: target.sdkVersions ?? null, containerImageDigests: target.containerImageDigests ?? null })),
    };
    const configurationHash = contentHash(normalised);
    const fingerprint = contentHash({ config: normalised, manifest });
    const evidence: EvaluationEvidence = { evaluationId, runId: evaluationId, fingerprint, configurationHash, profileId: profile.id, profileVersion: profile.version, config: normalised, manifest, host, targets: targetEvidence, traces, capturedAt: new Date().toISOString() };
    const gates = await Promise.all(targetEvidence.flatMap((target) => selectedGates.map(async (gate) => ({ ...await gate.evaluate({ ...evidence, targets: [target] }), targetId: target.target.id }))));
    const metrics = await Promise.all(selectedMetrics.map((metric) => metric.evaluate(evidence)));
    const failed = gates.some((gate) => gate.mandatory && gate.status === 'FAIL');
    const incomplete = gates.some((gate) => gate.mandatory && gate.status === 'NOT_VALIDATED');
    const summary: EvaluationSummary = failed ? { status: 'FAIL', eligible: false, message: 'A mandatory gate failed; comparative suitability is suppressed.' } : incomplete ? { status: 'INCOMPLETE', eligible: false, message: 'Mandatory gates are not validated for every target; no admissibility claim is made.' } : { status: 'PASS', eligible: true, message: 'All mandatory gates passed with captured evidence.' };
    return { profileId: profile.id, summary, gates, metrics, evidence };
  }
}
