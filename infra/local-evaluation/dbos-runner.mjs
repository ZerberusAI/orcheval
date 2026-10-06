import { requestFromStdin, http, sdkDigest, sdkVersion, respond } from './connector-common.mjs';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

const base = process.env.DBOS_SERVICE_URL;
if (!base) throw new Error('DBOS_SERVICE_URL is required.');
const iso = (milliseconds) => new Date(milliseconds).toISOString();

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  if (action === 'metadata') return {
    displayName: 'DBOS local SDK runner', version: 'sdk-5.2.11', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke'],
    sdkVersions: { '@dbos-inc/dbos-sdk': await sdkVersion('@dbos-inc/dbos-sdk') }, containerImageDigests: [sdkDigest(), 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea'],
  };
  if (action === 'health') {
    const health = await http(base, '/health');
    return { healthy: health?.healthy === true, details: ['DBOS executor launched and connected to its disposable PostgreSQL system database.'] };
  }
  if (action === 'setup' || action === 'teardown') return {};
  if (action === 'execute') {
    assertSequential(payload);
    const started = await http(base, '/execute', { body: payload.execution });
    if (started?.workflowId !== payload.execution.id) throw new Error('DBOS did not preserve the requested workflow id.');
    return { executionId: started.workflowId };
  }
  if (action === 'observe') {
    const { status } = await http(base, `/observe/${encodeURIComponent(payload.executionId)}`);
    if (!status) throw new Error('DBOS returned no workflow status.');
    if (['ERROR', 'MAX_RECOVERY_ATTEMPTS_EXCEEDED', 'CANCELLED'].includes(status.status)) throw new Error(`DBOS workflow ended ${status.status}.`);
    const execution = status.input?.[0];
    if (!execution) throw new Error('DBOS workflow status has no execution input.');
    const complete = status.status === 'SUCCESS';
    const result = complete ? status.output : { execution, steps: [], output: null };
    if (complete) verifyResult(result);
    const outcome = complete ? 'SUCCEEDED' : ['ENQUEUED', 'DELAYED'].includes(status.status) ? 'QUEUED' : 'RUNNING';
    return observationFromSnapshot(payload.executionId, { ...result, outcome }, { startedAt: iso(status.createdAt), endedAt: complete ? iso(status.completedAt) : null, observedAt: new Date().toISOString() }, { deploymentMode: 'SELF_HOSTED', edition: 'OSS library', status, steps: complete ? result.steps : [] });
  }
  if (action === 'cancel') { await http(base, `/cancel/${encodeURIComponent(payload.executionId)}`, { method: 'PATCH' }); return {}; }
  throw new Error(`Unsupported DBOS smoke action: ${action}.`);
});
