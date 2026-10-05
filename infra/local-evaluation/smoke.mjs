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
  profiles: [{ id: 'ai-orchestration-smoke', version: '0.1.0', scenarios: aiOrchestrationProfile.scenarios.filter(({ id }) => id === 'ORCH-01') }],
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

await mkdir('/results', { recursive: true });
const bundle = await writeEvaluationBundle(result, '/results');
await copyFile('/opt/orcheval-lab/package-lock.json', `${bundle}/sdk-package-lock.json`);
await writeFile(`${bundle}/lab-environment.json`, JSON.stringify({ sdkImageId: process.env.ORCHEVAL_SDK_IMAGE_ID, nodeImage: 'node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c', compose: await readFile(new URL('./compose.yaml', import.meta.url), 'utf8'), limitations: ['Only ORCH-01 was exercised.', 'Development services are not production security configurations.', 'Full security probes, load, recovery and version-change scenarios remain untested.', 'Inngest REST run output is empty in this dev-server version; worker output is matched to the completed runtime run id.', 'Inngest worker evidence is held in memory and does not validate recovery.'] }, null, 2));
console.log(JSON.stringify({ bundle, status: result.summary.status, targets: result.evidence.targets.map(({ target, observations }) => ({ id: target.id, mode: target.mode, version: target.version, executions: observations.length })) }, null, 2));
