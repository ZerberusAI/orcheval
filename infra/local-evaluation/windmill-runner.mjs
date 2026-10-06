import { readFile, writeFile, rm } from 'node:fs/promises';
import { requestFromStdin, http, sdkDigest, respond } from './connector-common.mjs';
import { sequentialFlow } from './windmill-flow.mjs';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  const base = process.env.WINDMILL_BASE_URL;
  if (!base) throw new Error('WINDMILL_BASE_URL is required.');
  const authFile = '/state/windmill-auth.json';
  const workspace = 'orcheval';
  const path = `/api/w/${workspace}`;
  let response;
  if (action === 'metadata') {
    const version = await http(base, '/api/version');
    response = { displayName: 'Windmill local API runner', version: String(version), adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke'], sdkVersions: {}, containerImageDigests: [sdkDigest(), 'ghcr.io/windmill-labs/windmill@sha256:4bc925d3170e4b5b9fc9fedb6b5f7252514507d9d028f78482ba4356b12bd7a1'] };
  } else if (action === 'health') {
    await http(base, '/api/version');
    response = { healthy: true, details: ['Windmill API reachable; workflow execution verifies worker readiness.'] };
  } else if (action === 'setup') {
    // Credentials apply only to the fresh, private Community lab database.
    const token = await http(base, '/api/auth/login', { body: { email: 'admin@windmill.dev', password: 'changeme' } });
    if (typeof token !== 'string' || !token) throw new Error('Windmill login did not return a token.');
    await http(base, '/api/workspaces/create', { token, body: { id: workspace, name: 'Orcheval disposable evaluation' } });
    await writeFile(authFile, JSON.stringify({ token }), { mode: 0o600 });
    response = {};
  } else if (action === 'teardown') {
    await rm(authFile, { force: true }); response = {};
  } else {
    const { token } = JSON.parse(await readFile(authFile, 'utf8'));
    if (action === 'execute') {
      assertSequential(payload);
      const id = await http(base, `${path}/jobs/run/preview_flow`, { token, body: { value: sequentialFlow(), args: { execution: payload.execution } } });
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Windmill did not return a job UUID.');
      response = { executionId: id };
    } else if (action === 'observe') {
      const job = await http(base, `${path}/jobs_u/get/${encodeURIComponent(payload.executionId)}?no_logs=true&no_code=true`, { token });
      if (job.success === false) await writeFile('/results/windmill-failed-job.json', JSON.stringify(job, null, 2));
      if (job.id !== payload.executionId) throw new Error('Windmill returned a different job id.');
      const complete = typeof job.success === 'boolean';
      if (complete && (!job.success || job.canceled)) throw new Error('Windmill sequential flow failed or was cancelled.');
      const result = complete ? job.result : { execution: job.args.execution, steps: [], output: null };
      if (complete) verifyResult(result);
      const endedAt = complete ? job.completed_at ?? new Date(Date.parse(job.started_at) + job.duration_ms).toISOString() : null;
      response = observationFromSnapshot(payload.executionId, { ...result, outcome: complete ? 'SUCCEEDED' : 'RUNNING' }, { startedAt: job.created_at, endedAt, observedAt: new Date().toISOString() }, { deploymentMode: 'SELF_HOSTED', edition: 'Community', job, endTimestampSource: job.completed_at ? 'completed_at' : 'started_at + server duration_ms' });
    } else if (action === 'cancel') {
      await http(base, `${path}/jobs/queue/cancel/${encodeURIComponent(payload.executionId)}`, { token, body: { reason: 'Orcheval cancellation' } }); response = {};
    } else throw new Error(`Unsupported Windmill smoke action: ${action}.`);
  }
  return response;
});
