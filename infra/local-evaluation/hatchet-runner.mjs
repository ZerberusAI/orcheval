import { createHatchetClient } from './hatchet-client.mjs';
import { requestFromStdin, sdkVersion, sdkDigest, respond } from './connector-common.mjs';
import { assertSequential } from './workload.mjs';
import { hatchetObservation } from './hatchet-observation.mjs';

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  const client = await createHatchetClient();
  let response;
  if (action === 'metadata') {
    response = { displayName: 'Hatchet local SDK runner', version: 'image-cc81f078a528', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke'], sdkVersions: { '@hatchet-dev/typescript-sdk': await sdkVersion('@hatchet-dev/typescript-sdk') }, containerImageDigests: [sdkDigest(), 'ghcr.io/hatchet-dev/hatchet/hatchet-lite@sha256:cc81f078a5285d7d2051ec4a4fa459d033e1face4ca5983d82612b00da6e3fa3'] };
  } else if (action === 'health' || action === 'setup') {
    const workers = await client.workers.list();
    const ready = workers.rows?.some((worker) => worker.name === 'orcheval-sequential-worker' && Date.now() - Date.parse(worker.lastHeartbeatAt ?? '') < 30_000);
    response = { healthy: Boolean(ready), details: ['Worker readiness checked against Hatchet heartbeat records.'] };
  } else if (action === 'execute') {
    assertSequential(payload);
    const ref = await client.runNoWait('orcheval-sequential', { execution: payload.execution });
    response = { executionId: await ref.runId };
  } else if (action === 'observe') {
    response = hatchetObservation(payload.executionId, await client.runs.get(payload.executionId));
  } else if (action === 'cancel') {
    await client.runs.cancel({ ids: [payload.executionId] }); response = {};
  } else if (action === 'teardown') response = {};
  else throw new Error(`Unsupported Hatchet smoke action: ${action}.`);
  return response;
});
