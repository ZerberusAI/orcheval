import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { RunnerTarget } from '/workspace/adapters/runner-target.ts';
import { OrchevalEngine, writeEvaluationBundle } from '/workspace/packages/core/index.ts';
import { securityBaselineGate } from '/workspace/gates/security-baseline/index.ts';
import { aiOrchestrationProfile } from '/workspace/profiles/ai-orchestration/index.ts';

assert.match(process.env.ORCHEVAL_SDK_IMAGE_ID ?? '', /^sha256:[a-f0-9]{64}$/, 'The exact SDK image id must be supplied. Use run.sh.');

const targets = ['temporal', 'inngest'].map((id) => new RunnerTarget(id, id, {
  command: process.execPath, args: [fileURLToPath(new URL(`./${id}-runner.mjs`, import.meta.url))], timeoutMs: 45_000,
}));
for (const target of targets) {
  let ready = false;
  let failure = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const health = await target.health(); ready = health.healthy; failure = health.details.join(' '); } catch (error) { failure = error.message; }
    if (ready) break;
    await delay(1_000);
  }
  assert.ok(ready, `${target.id} is not ready: ${failure}`);
}

const engine = new OrchevalEngine({
  profiles: [
    { id: 'ai-orchestration-smoke', version: '0.1.0', scenarios: aiOrchestrationProfile.scenarios.filter(({ id }) => id === 'ORCH-01') },
    { id: 'ai-orchestration-lifecycle-smoke', version: '0.1.0', scenarios: aiOrchestrationProfile.scenarios.filter(({ id }) => ['ORCH-06', 'ORCH-07'].includes(id)).map((scenario) => ({ ...scenario,
      description: scenario.id === 'ORCH-07' ? 'Cancel waiting work; queued/running cancellation and unrelated-run isolation are not exercised.' : scenario.description,
      timeoutMs: 30_000, pollIntervalMs: 100,
      lifecycle: scenario.id === 'ORCH-06' ? { action: 'signal', at: 'WAITING', signal: { name: 'approve', payload: { approved: true } } } : { action: 'cancel', at: 'WAITING' },
    })) },
  ],
  targets, gates: [securityBaselineGate], metrics: [],
});
const result = await engine.run({ name: 'local-docker-sdk-smoke', profileId: 'ai-orchestration-smoke', targets: ['temporal', 'inngest'], gates: ['security-baseline'], metrics: [], repetitions: 3, concurrency: [1], faults: [] });
assert.equal(result.summary.status, 'INCOMPLETE');
assert.equal(result.summary.eligible, false);
assert.equal(result.gates.length, 2);
assert.ok(result.gates.every((gate) => gate.status === 'NOT_VALIDATED'));
for (const target of result.evidence.targets) {
  assert.equal(target.target.mode, 'LIVE');
  assert.equal(target.observations.length, 3);
  assert.ok(target.observations.every((observation) => observation.outcome === 'SUCCEEDED' && observation.steps.length === 5 && observation.runtimeEvidence));
}

const lifecycleResult = await engine.run({ name: 'local-docker-lifecycle-smoke', profileId: 'ai-orchestration-lifecycle-smoke', targets: ['temporal'], gates: ['security-baseline'], metrics: [], repetitions: 3, concurrency: [1], faults: [] });
assert.equal(lifecycleResult.summary.status, 'INCOMPLETE');
assert.equal(lifecycleResult.summary.eligible, false);
assert.equal(lifecycleResult.gates[0].status, 'NOT_VALIDATED');
assert.equal(lifecycleResult.evidence.targets[0].observations.length, 6);
for (const observation of lifecycleResult.evidence.targets[0].observations) {
  const approval = observation.workloadId === 'ORCH-06';
  assert.equal(observation.outcome, approval ? 'SUCCEEDED' : 'CANCELLED');
  assert.deepEqual(observation.steps.map(({ id }) => id), approval ? ['context', 'policy', 'retrieval', 'model', 'validation'] : ['context', 'policy']);
  const events = observation.lifecycle;
  const actionIndex = events.findIndex(({ action }) => action === (approval ? 'signal' : 'cancel'));
  assert.ok(actionIndex > 0);
  assert.equal(events[actionIndex - 1].action, 'observe');
  assert.equal(events[actionIndex - 1].outcome, 'WAITING');
  assert.equal(events.at(-1).outcome, observation.outcome);
  const history = observation.runtimeEvidence.history.events;
  assert.ok(history.some((event) => approval ? event.workflowExecutionSignaledEventAttributes?.signalName === 'approve' : event.workflowExecutionCancelRequestedEventAttributes));
  assert.ok(history.some((event) => approval ? event.workflowExecutionCompletedEventAttributes : event.workflowExecutionCanceledEventAttributes));
}

await mkdir('/results', { recursive: true });
for (const evaluation of [result, lifecycleResult]) {
  const bundle = await writeEvaluationBundle(evaluation, '/results');
  await copyFile('/opt/orcheval-lab/package-lock.json', `${bundle}/sdk-package-lock.json`);
  await writeFile(`${bundle}/lab-environment.json`, JSON.stringify({ sdkImageId: process.env.ORCHEVAL_SDK_IMAGE_ID, nodeImage: 'node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c', compose: await readFile(new URL('./compose.yaml', import.meta.url), 'utf8'), limitations: [evaluation === result ? 'Only ORCH-01 was exercised for Temporal and Inngest.' : 'Only Temporal approval/resume and waiting cancellation were exercised. Queued/running cancellation and unrelated-run isolation remain untested.', 'Development services are not production security configurations.', 'Full security probes, load, recovery and version-change scenarios remain untested.', 'Inngest REST run output is empty in this dev-server version; worker output is matched to the completed runtime run id.', 'Inngest worker evidence is held in memory and does not validate recovery.'] }, null, 2));
  console.log(JSON.stringify({ bundle, status: evaluation.summary.status, targets: evaluation.evidence.targets.map(({ target, observations }) => ({ id: target.id, mode: target.mode, version: target.version, executions: observations.length })) }, null, 2));
}
