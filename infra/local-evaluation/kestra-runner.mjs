import { readFile, writeFile } from 'node:fs/promises';
import { requestFromStdin, http, sdkDigest, respond } from './connector-common.mjs';
import { assertSequential, observationFromSnapshot, stepIds, verifyResult } from './workload.mjs';

const base = process.env.KESTRA_BASE_URL;
if (!base) throw new Error('KESTRA_BASE_URL is required.');
const username = process.env.KESTRA_USERNAME;
const password = process.env.KESTRA_PASSWORD;
if (!username || !password) throw new Error('KESTRA_USERNAME and KESTRA_PASSWORD are required.');
const auth = { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
const namespace = 'orcheval';
const flowId = 'orcheval_sequential';
const flow = `id: ${flowId}
namespace: ${namespace}
inputs:
  - id: execution
    type: JSON
tasks:
  - id: context
    type: io.kestra.plugin.core.debug.Return
    format: "{{ inputs.execution.id }}"
  - id: policy
    type: io.kestra.plugin.core.debug.Return
    format: "{{ inputs.execution.tenantId }}"
  - id: retrieval
    type: io.kestra.plugin.core.debug.Return
    format: "{{ inputs.execution.correlationId }}"
  - id: model
    type: io.kestra.plugin.core.debug.Return
    format: "candidate"
  - id: validation
    type: io.kestra.plugin.core.debug.Return
    format: "approved:{{ inputs.execution.tenantId }}:{{ inputs.execution.id }}"
outputs:
  - id: approval
    type: STRING
    value: "{{ outputs.validation.value }}"
`;

async function yaml(path, value) {
  const response = await fetch(new URL(path, base), {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/x-yaml', ...auth }, body: value,
  });
  if (!response.ok) throw new Error(`POST ${path} returned HTTP ${response.status}.`);
  return response.json();
}
async function executionFor(id) {
  return JSON.parse(await readFile(`/state/kestra-${id}.json`, 'utf8'));
}
function taskRuns(execution) {
  const runs = execution.taskRunList ?? execution.taskRuns;
  return Array.isArray(runs) ? runs.filter((run) => stepIds.includes(run.taskId)).sort((left, right) => stepIds.indexOf(left.taskId) - stepIds.indexOf(right.taskId)) : [];
}
function iso(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`Kestra ${label} timestamp is missing.`);
  return new Date(value).toISOString();
}

await respond(async () => {
  const { action, payload } = await requestFromStdin();
  if (action === 'metadata') return {
    displayName: 'Kestra local REST runner', version: '2.0.5', adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-flow-smoke'],
    sdkVersions: { 'kestra-rest-api': '2.0.5' },
    containerImageDigests: [sdkDigest(), 'kestra/kestra@sha256:bcb1bc921e93f83bf1e3704f6c912ae57fdb327d712e19d9061cc1e8c8fda526'],
  };
  if (action === 'health') {
    const response = await fetch(new URL('/api/v1/main/flows', base), { headers: auth, signal: AbortSignal.timeout(5_000) });
    return { healthy: response.status === 405, details: ['Kestra authenticated REST route is reachable.'] };
  }
  if (action === 'setup') { await yaml('/api/v1/main/flows', flow); return {}; }
  if (action === 'teardown') return {};
  if (action === 'execute') {
    assertSequential(payload);
    const input = new FormData();
    input.set('execution', JSON.stringify(payload.execution));
    const submittedAt = new Date().toISOString();
    const response = await fetch(new URL(`/api/v1/main/executions/${namespace}/${flowId}`, base), {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: auth, body: input,
    });
    if (!response.ok) throw new Error(`Kestra execute returned HTTP ${response.status}.`);
    const execution = await response.json();
    if (typeof execution?.id !== 'string') throw new Error('Kestra did not return an execution id.');
    await writeFile(`/state/kestra-${execution.id}.json`, JSON.stringify({ execution: payload.execution, submittedAt }), { mode: 0o600 });
    return { executionId: execution.id };
  }
  if (action === 'observe') {
    const detail = await http(base, `/api/v1/main/executions/${encodeURIComponent(payload.executionId)}`, { headers: auth });
    const saved = await executionFor(payload.executionId);
    const state = detail?.state?.current;
    if (['FAILED', 'KILLED', 'CANCELLED'].includes(state)) throw new Error(`Kestra execution ended ${state}.`);
    const complete = state === 'SUCCESS';
    const runs = taskRuns(detail);
    if (!complete) return observationFromSnapshot(payload.executionId, { execution: saved.execution, steps: [], output: null, outcome: state === 'CREATED' ? 'QUEUED' : 'RUNNING' }, { startedAt: saved.submittedAt, endedAt: null, observedAt: new Date().toISOString() }, { deploymentMode: 'SELF_HOSTED', edition: 'OSS', execution: detail, taskRuns: runs });
    if (runs.length !== stepIds.length || !runs.every((run) => run.state?.current === 'SUCCESS')) throw new Error('Kestra completed without five successful task runs.');
    const steps = runs.map((run) => ({ id: run.taskId, startedAt: iso(run.state?.startDate, `${run.taskId} start`), endedAt: iso(run.state?.endDate, `${run.taskId} end`), attempt: 1, outcome: 'SUCCEEDED' }));
    const validation = runs.find((run) => run.taskId === 'validation');
    const outputs = await http(base, `/api/v1/main/outputs/tasks/${encodeURIComponent(payload.executionId)}/${encodeURIComponent(validation.id)}`, { headers: auth });
    if (outputs?.value !== `approved:${saved.execution.tenantId}:${saved.execution.id}`) throw new Error('Kestra validation task returned an unexpected output.');
    const result = { execution: saved.execution, steps, output: outputs.value };
    verifyResult(result);
    return observationFromSnapshot(payload.executionId, { ...result, outcome: 'SUCCEEDED' }, { startedAt: saved.submittedAt, endedAt: iso(detail.state?.endDate, 'execution end'), observedAt: new Date().toISOString() }, { deploymentMode: 'SELF_HOSTED', edition: 'OSS', execution: detail, taskRuns: runs, nativeExecutionStartedAt: iso(detail.state?.startDate, 'execution start'), limitation: 'Core debug tasks validate a sequential API flow only; no script task, Docker socket, lifecycle, recovery, tenancy or security claim is made.' });
  }
  throw new Error(`Unsupported Kestra smoke action: ${action}.`);
});
