import { spawn } from 'node:child_process';

import type { EvaluationContext, EvaluationExecution, EvaluationSignal, EvaluationTarget, ExecutionHandle, ExecutionObservation, HealthResult, TargetMetadata, WorkloadDefinition } from '../packages/core/index.ts';

export interface RunnerCommand { command: string; args?: string[]; }
interface RunnerRequest { action: 'metadata' | 'setup' | 'health' | 'execute' | 'signal' | 'cancel' | 'observe' | 'teardown'; targetId: string; payload?: unknown; }

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Runner response must be a JSON object.');
  return value as Record<string, unknown>;
}

function asObservation(value: unknown): ExecutionObservation {
  const response = asRecord(value);
  const requiredStrings = ['executionId', 'tenantId', 'correlationId', 'workloadId', 'startedAt', 'endedAt', 'outcome'];
  const requiredBooleans = ['crossTenantLeakDetected', 'secretExposureDetected', 'identitySubstitutionAllowed', 'cancellationAffectedUnrelatedWork', 'auditTrailComplete', 'recoverySkippedSteps'];
  if (!requiredStrings.every((field) => typeof response[field] === 'string') || !requiredBooleans.every((field) => typeof response[field] === 'boolean') || !Array.isArray(response.steps) || !Array.isArray(response.errors) || typeof response.attempts !== 'number' || typeof response.duplicateSideEffects !== 'number') throw new Error(`Runner observation for ${String(response.executionId ?? 'unknown')} does not satisfy the Phase 1 evidence contract.`);
  return response as unknown as ExecutionObservation;
}

/**
 * A secure process bridge for a live adapter. The runner receives one JSON request on stdin
 * and must write one JSON response to stdout. It is intentionally shell-free: the command
 * and argument vector are passed directly to spawn.
 */
export class RunnerTarget implements EvaluationTarget {
  readonly id: string;
  private readonly displayName: string;
  private readonly runner: RunnerCommand;

  constructor(id: string, displayName: string, runner: RunnerCommand) {
    this.id = id;
    this.displayName = displayName;
    this.runner = runner;
  }

  private call(action: RunnerRequest['action'], payload?: unknown): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.runner.command, this.runner.args ?? [], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) { reject(new Error(`Runner for ${this.id} exited with ${code}: ${stderr.trim()}`)); return; }
        try { resolve(asRecord(JSON.parse(stdout))); } catch (error) { reject(new Error(`Runner for ${this.id} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)); }
      });
      child.stdin.end(`${JSON.stringify({ action, targetId: this.id, payload } satisfies RunnerRequest)}\n`);
    });
  }

  async metadata(): Promise<TargetMetadata> {
    const response = await this.call('metadata');
    return { id: this.id, displayName: typeof response.displayName === 'string' ? response.displayName : this.displayName, version: typeof response.version === 'string' ? response.version : 'unknown', mode: 'LIVE', capabilities: Array.isArray(response.capabilities) ? response.capabilities.filter((item): item is string => typeof item === 'string') : [] };
  }
  async setup(context: EvaluationContext): Promise<void> { await this.call('setup', context); }
  async health(): Promise<HealthResult> {
    const response = await this.call('health');
    return { healthy: response.healthy === true, details: Array.isArray(response.details) ? response.details.filter((item): item is string => typeof item === 'string') : [] };
  }
  async execute(workload: WorkloadDefinition, execution: EvaluationExecution): Promise<ExecutionHandle> {
    const response = await this.call('execute', { workload, execution });
    if (typeof response.executionId !== 'string') throw new Error(`Runner for ${this.id} did not return an executionId.`);
    return { executionId: response.executionId };
  }
  async signal(executionId: string, signal: EvaluationSignal): Promise<void> { await this.call('signal', { executionId, signal }); }
  async cancel(executionId: string): Promise<void> { await this.call('cancel', { executionId }); }
  async observe(executionId: string): Promise<ExecutionObservation> { return asObservation(await this.call('observe', { executionId })); }
  async teardown(context: EvaluationContext): Promise<void> { await this.call('teardown', context); }
}

function commandFromEnvironment(targetId: string): RunnerCommand | undefined {
  const prefix = `ORCHEVAL_${targetId.toUpperCase()}_RUNNER`;
  const command = process.env[prefix];
  if (!command) return undefined;
  const rawArgs = process.env[`${prefix}_ARGS`];
  if (!rawArgs) return { command };
  try {
    const args = JSON.parse(rawArgs);
    if (!Array.isArray(args) || !args.every((item) => typeof item === 'string')) throw new Error('must be a JSON string array');
    return { command, args };
  } catch (error) { throw new Error(`${prefix}_ARGS ${error instanceof Error ? error.message : 'is invalid'}`); }
}

export function liveRunnerFor(targetId: string): RunnerCommand | undefined { return commandFromEnvironment(targetId); }
