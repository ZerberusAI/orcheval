import { configure, tasks, runs } from '@trigger.dev/sdk/v3';
import { requestFromStdin, sdkVersion, sdkDigest, respond } from './connector-common.mjs';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  const baseURL = process.env.TRIGGER_API_URL;
  const secretKey = process.env.TRIGGER_SECRET_KEY;
  if (!baseURL || !secretKey) throw new Error('Trigger.dev requires an explicit self-hosted TRIGGER_API_URL and TRIGGER_SECRET_KEY; there is no cloud fallback.');
  configure({ baseURL, secretKey });
  const requestOptions = { retry: { maxAttempts: 1 }, timeoutInMs: 5_000 };
  let response;
  if (action === 'metadata') {
    response = { displayName: 'Trigger.dev SDK connector', version: process.env.TRIGGER_RUNTIME_VERSION ?? 'unknown', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke', 'self-hosted-checkpoints-unavailable'], sdkVersions: { '@trigger.dev/sdk': await sdkVersion('@trigger.dev/sdk') }, containerImageDigests: [sdkDigest(), ...(process.env.TRIGGER_RUNTIME_IMAGE ? [process.env.TRIGGER_RUNTIME_IMAGE] : [])] };
  } else if (action === 'health' || action === 'setup') {
    await runs.list({ limit: 1 }, requestOptions);
    response = { healthy: true, details: ['Authenticated Trigger.dev API reachable. Task registration and worker execution require a live smoke run.'] };
  } else if (action === 'execute') {
    assertSequential(payload);
    const handle = await tasks.trigger('orcheval-sequential', { execution: payload.execution }, { idempotencyKey: payload.execution.id }, requestOptions);
    response = { executionId: handle.id };
  } else if (action === 'observe') {
    const run = await runs.retrieve(payload.executionId, requestOptions);
    if (run.id !== payload.executionId || run.taskIdentifier !== 'orcheval-sequential') throw new Error('Trigger.dev returned a different run or task.');
    if (['FAILED', 'CRASHED', 'EXPIRED', 'SYSTEM_FAILURE', 'TIMED_OUT', 'CANCELED'].includes(run.status)) throw new Error(`Trigger.dev sequential task ended ${run.status}.`);
    const complete = run.status === 'COMPLETED';
    if (complete && !run.finishedAt) throw new Error('Trigger.dev completed run has no terminal timestamp.');
    const result = complete ? run.output : { execution: run.payload?.execution, steps: [], output: null };
    if (!result?.execution) throw new Error('Trigger.dev did not return the execution payload.');
    if (complete) verifyResult(result);
    const outcome = complete ? 'SUCCEEDED' : ['QUEUED', 'DELAYED', 'PENDING_VERSION', 'DEQUEUED'].includes(run.status) ? 'QUEUED' : run.status === 'WAITING' ? 'WAITING' : 'RUNNING';
    response = observationFromSnapshot(payload.executionId, { ...result, outcome }, { startedAt: run.createdAt.toISOString(), endedAt: complete ? run.finishedAt.toISOString() : null, observedAt: new Date().toISOString() }, { deploymentMode: 'SELF_HOSTED', edition: 'Self-hosted; checkpoints unavailable', run });
  } else if (action === 'cancel') {
    await runs.cancel(payload.executionId, requestOptions); response = {};
  } else if (action === 'teardown') response = {};
  else throw new Error(`Unsupported Trigger.dev smoke action: ${action}.`);
  return response;
});
