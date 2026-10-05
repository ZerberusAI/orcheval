import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunnerTarget } from '../adapters/runner-target.ts';

const runnerSource = `let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const observation = { executionId: request.payload?.executionId ?? 'execution-1', tenantId: 'tenant-a', correlationId: 'correlation-1', workloadId: 'ORCH-01', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'SUCCEEDED', steps: [], attempts: 1, errors: [], duplicateSideEffects: 0, crossTenantLeakDetected: false, secretExposureDetected: false, identitySubstitutionAllowed: false, cancellationAffectedUnrelatedWork: false, auditTrailComplete: true, recoverySkippedSteps: false };
  const responses = { metadata: { displayName: 'Temporal test runner', version: 'test-1', adapterVersion: 'adapter-1', sdkVersions: { worker: '1.0.0' }, containerImageDigests: ['sha256:test'], capabilities: ['cancellation'] }, health: { healthy: true, details: ['ready'] }, execute: { executionId: request.payload?.execution?.id }, observe: observation };
  process.stdout.write(JSON.stringify(responses[request.action] ?? {}));
});`;

test('runner target preserves reproduction metadata and executes the protocol without shell interpolation', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'orcheval-runner-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runnerPath = join(dir, 'runner.mjs');
  await writeFile(runnerPath, runnerSource);
  const target = new RunnerTarget('temporal', 'Temporal', { command: process.execPath, args: [runnerPath] });

  const metadata = await target.metadata();
  assert.equal(metadata.mode, 'LIVE');
  assert.equal(metadata.adapterVersion, 'adapter-1');
  assert.deepEqual(metadata.sdkVersions, { worker: '1.0.0' });
  assert.deepEqual(metadata.containerImageDigests, ['sha256:test']);
  assert.equal((await target.health()).healthy, true);
  await target.setup({ evaluationId: 'evaluation-1', runId: 'run-1', profileId: 'ai-orchestration', targetId: 'temporal' });
  const handle = await target.execute({ id: 'ORCH-01', description: 'test', required: true, kind: 'sequential' }, { id: 'execution-1', tenantId: 'tenant-a', correlationId: 'correlation-1', faults: [] });
  const observation = await target.observe(handle.executionId);
  assert.equal(observation.executionId, 'execution-1');
  assert.equal(observation.secretExposureDetected, false);
  await target.teardown({ evaluationId: 'evaluation-1', runId: 'run-1', profileId: 'ai-orchestration', targetId: 'temporal' });
});
