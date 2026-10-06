import { requestFromStdin, http, sdkDigest, sdkVersion, respond } from './connector-common.mjs';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

const base = process.env.BULLMQ_SERVICE_URL;
if (!base) throw new Error('BULLMQ_SERVICE_URL is required.');
const iso = (milliseconds) => {
  if (!Number.isFinite(milliseconds)) throw new Error('BullMQ job lacks a required timestamp.');
  return new Date(milliseconds).toISOString();
};

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  if (action === 'metadata') return {
    displayName: 'BullMQ local queue runner', version: 'sdk-6.3.11', adapterVersion: 'smoke-0.1.0', capabilities: ['queued-sequential-smoke'],
    sdkVersions: { bullmq: await sdkVersion('bullmq'), ioredis: await sdkVersion('ioredis') },
    containerImageDigests: [sdkDigest(), 'redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499'],
  };
  if (action === 'health') {
    const health = await http(base, '/health');
    return { healthy: health?.healthy === true, details: ['BullMQ worker connected to its disposable Redis service.'] };
  }
  if (action === 'setup' || action === 'teardown') return {};
  if (action === 'execute') {
    assertSequential(payload);
    const started = await http(base, '/execute', { body: payload.execution });
    if (started?.jobId !== payload.execution.id) throw new Error('BullMQ did not preserve the requested job id.');
    return { executionId: started.jobId };
  }
  if (action === 'observe') {
    const { job } = await http(base, `/observe/${encodeURIComponent(payload.executionId)}`);
    if (!job || job.id !== payload.executionId) throw new Error('BullMQ returned a different job.');
    if (['failed', 'unknown'].includes(job.state)) throw new Error(`BullMQ job ended ${job.state}.`);
    const complete = job.state === 'completed';
    const execution = job.data?.execution;
    if (!execution) throw new Error('BullMQ job has no execution input.');
    const result = complete ? job.returnvalue : { execution, steps: [], output: null };
    if (complete) verifyResult(result);
    const outcome = complete ? 'SUCCEEDED' : ['waiting', 'delayed', 'prioritized', 'paused'].includes(job.state) ? 'QUEUED' : 'RUNNING';
    return observationFromSnapshot(payload.executionId, { ...result, outcome }, {
      startedAt: iso(job.timestamp), endedAt: complete ? iso(job.finishedOn) : null, observedAt: new Date().toISOString(),
    }, {
      deploymentMode: 'SELF_HOSTED', edition: 'OSS library', job,
      steps: complete ? result.steps : [],
      limitation: 'One BullMQ job owns the five application operations; this is a job-queue baseline, not a durable workflow claim.',
    });
  }
  throw new Error(`Unsupported BullMQ smoke action: ${action}.`);
});
