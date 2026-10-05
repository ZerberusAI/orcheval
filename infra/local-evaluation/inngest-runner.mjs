import { Inngest } from 'inngest';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { assertSequential, observationFromResult } from './workload.mjs';

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const { action, payload } = JSON.parse(Buffer.concat(input).toString('utf8'));
const base = process.env.INNGEST_BASE_URL;
const app = process.env.INNGEST_APP_URL;
const client = new Inngest({ id: 'orcheval-phase1' });
let response;
if (action === 'metadata') {
  const { version } = JSON.parse(await readFile(new URL('../node_modules/inngest/package.json', import.meta.url), 'utf8'));
  response = { displayName: 'Inngest local SDK smoke runner', version: '1.45.1-9059f14a7', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke'], sdkVersions: { inngest: version }, containerImageDigests: ['inngest/inngest@sha256:b251da91bd014d56816c3159c606f470d6e423be9a12fbed45808636160aa92c', `orcheval-phase1-sdk@${process.env.ORCHEVAL_SDK_IMAGE_ID}`] };
} else if (action === 'health') {
  const checks = await Promise.all([fetch(`${base}/health`, { signal: AbortSignal.timeout(5_000) }), fetch(`${app}/health`, { signal: AbortSignal.timeout(5_000) })]);
  response = { healthy: checks.every((check) => check.ok), details: checks.map((check) => `${check.url}: ${check.status}`) };
} else if (action === 'setup') {
  const registration = await fetch(`${app}/api/inngest`, { method: 'PUT', signal: AbortSignal.timeout(10_000) });
  if (!registration.ok) throw new Error(`Inngest function registration failed: ${registration.status} ${await registration.text()}`);
  response = {};
} else if (action === 'execute') {
  assertSequential(payload);
  const { ids } = await client.send({ id: payload.execution.id, name: 'orcheval/sequential', data: { execution: payload.execution } });
  if (ids.length !== 1) throw new Error('Expected exactly one Inngest event id.');
  response = { executionId: ids[0] };
} else if (action === 'observe') {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const request = await fetch(`${base}/v1/events/${encodeURIComponent(payload.executionId)}/runs`, { signal: AbortSignal.timeout(5_000) });
    if (!request.ok) throw new Error(`Inngest run inspection failed: ${request.status} ${await request.text()}`);
    const { data } = await request.json();
    const run = data?.[0];
    if (run && ['failed', 'cancelled'].includes(run.status.toLowerCase())) throw new Error(`Inngest run ${run.run_id} ${run.status}.`);
    if (run?.status?.toLowerCase() === 'completed') {
      // The pinned dev server's REST response omits output. Pair its terminal
      // status with worker-captured output, keyed by the actual runtime run id.
      const capture = await fetch(`${app}/evidence/${encodeURIComponent(run.run_id)}`, { signal: AbortSignal.timeout(5_000) });
      if (!capture.ok) throw new Error(`Completed Inngest run has no worker evidence: ${run.run_id}.`);
      const workerResult = await capture.json();
      response = observationFromResult(payload.executionId, workerResult, { startedAt: run.run_started_at, endedAt: run.ended_at }, { eventId: payload.executionId, run, workerResult, outputSource: 'worker capture matched to completed runtime run id' });
      break;
    }
    await delay(200);
  }
  if (!response) throw new Error('Timed out waiting for the Inngest sequential workflow.');
} else if (action === 'teardown') {
  response = {};
} else {
  throw new Error(`Unsupported smoke action: ${action}.`);
}
process.stdout.write(JSON.stringify(response));
