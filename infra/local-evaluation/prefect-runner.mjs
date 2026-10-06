import { requestFromStdin, http, sdkDigest, respond } from './connector-common.mjs';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

const base = process.env.PREFECT_SERVICE_URL;
if (!base) throw new Error('PREFECT_SERVICE_URL is required.');
const imageId = process.env.ORCHEVAL_PREFECT_IMAGE_ID;
if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')) throw new Error('ORCHEVAL_PREFECT_IMAGE_ID must identify the exact Docker image.');

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  if (action === 'metadata') return {
    displayName: 'Prefect local Python runner', version: 'sdk-3.8.7', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-flow-smoke'],
    sdkVersions: { prefect: '3.8.7' }, containerImageDigests: [sdkDigest(), `orcheval-prefect@${imageId}`],
  };
  if (action === 'health') {
    const health = await http(base, '/health');
    return { healthy: health?.healthy === true, details: ['Prefect flow client is connected to its self-hosted server.'] };
  }
  if (action === 'setup' || action === 'teardown') return {};
  if (action === 'execute') {
    assertSequential(payload);
    const started = await http(base, '/execute', { body: payload.execution, timeoutMs: 15_000 });
    if (!started?.flowRunId) throw new Error('Prefect did not return a flow run id.');
    return { executionId: payload.execution.id };
  }
  if (action === 'observe') {
    const { record, flowRun } = await http(base, `/observe/${encodeURIComponent(payload.executionId)}`);
    if (!record?.execution || record.execution.id !== payload.executionId) throw new Error('Prefect returned a different execution.');
    if (record.error) throw new Error('Prefect flow client failed.');
    const state = flowRun?.state?.type;
    if (['FAILED', 'CRASHED', 'CANCELLED'].includes(state)) throw new Error(`Prefect flow run ended ${state}.`);
    const complete = state === 'COMPLETED' && record.result;
    const result = complete ? record.result : { execution: record.execution, steps: [], output: null };
    if (complete) verifyResult(result);
    return observationFromSnapshot(payload.executionId, { ...result, outcome: complete ? 'SUCCEEDED' : flowRun ? 'RUNNING' : 'QUEUED' }, {
      startedAt: record.submittedAt, endedAt: complete ? flowRun.end_time : null, observedAt: new Date().toISOString(),
    }, {
      deploymentMode: 'SELF_HOSTED', edition: 'OSS', flowRun,
      steps: complete ? result.steps : [],
      limitation: 'The flow client executes in its own container against Prefect Server; deployments, workers, lifecycle, recovery, tenancy and security are outside this ORCH-01 slice.',
    });
  }
  throw new Error(`Unsupported Prefect smoke action: ${action}.`);
});
