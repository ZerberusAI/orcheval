import { readFile, writeFile } from 'node:fs/promises';
import { requestFromStdin, http, sdkDigest, sdkVersion, respond } from './connector-common.mjs';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

const ingress = process.env.RESTATE_INGRESS_URL;
const admin = process.env.RESTATE_ADMIN_URL;
if (!ingress || !admin) throw new Error('RESTATE_INGRESS_URL and RESTATE_ADMIN_URL are required.');

async function executionFor(invocationId) {
  return JSON.parse(await readFile(`/state/restate-${invocationId}.json`, 'utf8'));
}

async function pending(executionId, runtimeEvidence) {
  const observedAt = new Date().toISOString();
  const startedAt = runtimeEvidence.submittedAt;
  return observationFromSnapshot(executionId, { execution: await executionFor(executionId), steps: [], output: null, outcome: 'QUEUED' }, { startedAt, endedAt: null, observedAt }, runtimeEvidence);
}

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  if (action === 'metadata') return {
    displayName: 'Restate local SDK runner', version: 'image-65abc8016d40', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke'],
    sdkVersions: { '@restatedev/restate-sdk': await sdkVersion('@restatedev/restate-sdk') },
    containerImageDigests: [sdkDigest(), 'restatedev/restate@sha256:65abc8016d408b8b424f5e492a5da37c24573207e217a3d43242dd8b3fd8dc61'],
  };
  if (action === 'health') {
    const response = await http(admin, '/services');
    const services = Array.isArray(response) ? response : response?.services;
    const registered = Array.isArray(services) && services.some(({ name }) => name === 'OrchevalSequential');
    return { healthy: registered, details: ['Restate admin API reachable and OrchevalSequential deployment registered.'] };
  }
  if (action === 'setup') {
    await http(admin, '/deployments', { body: { uri: 'http://restate-service:9080' } });
    return {};
  }
  if (action === 'execute') {
    assertSequential(payload);
    const submittedAt = new Date().toISOString();
    const sent = await http(ingress, '/restate/send/OrchevalSequential/run', { body: payload.execution, headers: { 'idempotency-key': payload.execution.id } });
    if (!sent?.invocationId) throw new Error('Restate did not return an invocation id.');
    await writeFile(`/state/restate-${sent.invocationId}.json`, JSON.stringify({ ...payload.execution, submittedAt }), { mode: 0o600 });
    return { executionId: sent.invocationId };
  }
  if (action === 'observe') {
    const output = await http(ingress, `/restate/output/${encodeURIComponent(payload.executionId)}`);
    const runtimeEvidence = { deploymentMode: 'SELF_HOSTED', edition: 'OSS', invocationId: payload.executionId, submittedAt: (await executionFor(payload.executionId)).submittedAt, steps: output?.steps ?? [] };
    if (output?.message === 'not ready') return pending(payload.executionId, runtimeEvidence);
    verifyResult(output);
    const startedAt = runtimeEvidence.submittedAt;
    const endedAt = output.steps.at(-1).endedAt;
    return observationFromSnapshot(payload.executionId, { ...output, outcome: 'SUCCEEDED' }, { startedAt, endedAt, observedAt: new Date().toISOString() }, { ...runtimeEvidence, steps: output.steps, endTimestampSource: 'application step completion; Restate invocation id retained' });
  }
  if (action === 'cancel') { await http(admin, `/invocations/${encodeURIComponent(payload.executionId)}/cancel`, { method: 'PATCH' }); return {}; }
  if (action === 'teardown') return {};
  throw new Error(`Unsupported Restate smoke action: ${action}.`);
});
