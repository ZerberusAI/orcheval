import assert from 'node:assert/strict';
import { copyFile, writeFile, readFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { RunnerTarget } from '/workspace/adapters/runner-target.ts';
import { OrchevalEngine, writeEvaluationBundle } from '/workspace/packages/core/index.ts';
import { securityBaselineGate } from '/workspace/gates/security-baseline/index.ts';
import { aiOrchestrationProfile } from '/workspace/profiles/ai-orchestration/index.ts';

const id = process.env.ORCHEVAL_PROVIDER;
assert.ok(['hatchet', 'windmill', 'triggerdev', 'restate', 'dbos', 'bullmq', 'kestra'].includes(id), 'Choose an implemented provider.');
const target = new RunnerTarget(id, id, { command: process.execPath, args: [fileURLToPath(new URL(`./${id}-runner.mjs`, import.meta.url))], timeoutMs: 15_000 });
// Retain the last raw snapshot even if the evaluator rejects it.
await mkdir('/results', { recursive: true });
const observe = target.observe.bind(target);
target.observe = async (...args) => {
  const snapshot = await observe(...args);
  await writeFile(`/results/${id}-last-snapshot.json`, JSON.stringify(snapshot, null, 2));
  return snapshot;
};
let ready = false;
let lastError = '';
const readinessDeadline = Date.now() + 90_000;
while (Date.now() < readinessDeadline) {
  try {
    if (id === 'restate') {
      const response = await fetch('http://restate:9070/version', { signal: AbortSignal.timeout(5_000) });
      ready = response.ok;
    } else ready = (await target.health()).healthy;
  } catch (error) { lastError = error.message; }
  if (ready) break;
  await delay(1_000);
}
assert.ok(ready, `${id} did not become ready: ${lastError}`);
const profile = { id: 'ai-orchestration-connector-smoke', version: '0.1.0', scenarios: aiOrchestrationProfile.scenarios.filter(({ id }) => id === 'ORCH-01').map((scenario) => ({ ...scenario, timeoutMs: 60_000, pollIntervalMs: 200 })) };
const result = await new OrchevalEngine({ profiles: [profile], targets: [target], gates: [securityBaselineGate], metrics: [] }).run({ profileId: profile.id, targets: [id], repetitions: 3, gates: ['security-baseline'], metrics: [], concurrency: [1], faults: [] });
assert.equal(result.summary.status, 'INCOMPLETE');
assert.equal(result.summary.eligible, false);
assert.equal(result.gates[0].status, 'NOT_VALIDATED');
const observations = result.evidence.targets[0].observations;
assert.equal(observations.length, 3);
for (const observation of observations) {
  assert.equal(observation.outcome, 'SUCCEEDED');
  assert.deepEqual(observation.steps.map(({ id }) => id), ['context', 'policy', 'retrieval', 'model', 'validation']);
  assert.ok(observation.runtimeEvidence);
  if (id === 'hatchet') {
    assert.equal(observation.runtimeEvidence.detail.tasks.length, 5);
    assert.ok(observation.runtimeEvidence.detail.tasks.every((task) => task.status === 'COMPLETED'));
  }
  if (id === 'windmill') {
    assert.equal(observation.runtimeEvidence.job.flow_status.modules.length, 5);
    assert.ok(observation.runtimeEvidence.job.flow_status.modules.every((module) => module.type === 'Success'));
  }
  if (id === 'restate') assert.equal(observation.runtimeEvidence.steps.length, 5);
  if (id === 'dbos') assert.equal(observation.runtimeEvidence.status.status, 'SUCCESS');
  if (id === 'bullmq') {
    assert.equal(observation.runtimeEvidence.job.state, 'completed');
    assert.equal(observation.runtimeEvidence.steps.length, 5);
  }
  if (id === 'kestra') {
    assert.equal(observation.runtimeEvidence.execution.state.current, 'SUCCESS');
    assert.equal(observation.runtimeEvidence.taskRuns.length, 5);
  }
}
const bundle = await writeEvaluationBundle(result, '/results');
await copyFile('/opt/orcheval-lab/package-lock.json', `${bundle}/sdk-package-lock.json`);
await writeFile(`${bundle}/lab-environment.json`, JSON.stringify({ sdkImageId: process.env.ORCHEVAL_SDK_IMAGE_ID, compose: await readFile(new URL('./providers.compose.yaml', import.meta.url), 'utf8'), limitations: ['ORCH-01 sequential execution only.', 'Security checks, lifecycle, recovery, load and version changes remain unvalidated.', 'Private development instance; no production configuration or cloud equivalence claim.'] }, null, 2));
console.log(JSON.stringify({ provider: id, bundle, executions: observations.length, status: result.summary.status }, null, 2));
