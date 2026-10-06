import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { hatchetObservation } from './hatchet-observation.mjs';
import { stepIds } from './workload.mjs';

// These are SDK/API contract fixtures, never live runtime evaluation evidence.
const execution = { id: 'fixture-execution', tenantId: 'tenant-a', correlationId: 'fixture-correlation', faults: [], cancellationRequested: false };
const start = '2026-10-06T08:00:00.000Z';
const end = '2026-10-06T08:00:01.000Z';
const output = {
  execution, output: `approved:${execution.tenantId}:${execution.id}`,
  steps: stepIds.map((id, index) => ({ id, startedAt: new Date(Date.parse(start) + 10 + index * 10).toISOString(), endedAt: new Date(Date.parse(start) + 15 + index * 10).toISOString(), outcome: 'SUCCEEDED', attempt: 1 })),
};

function runFixture(overrides = {}) {
  return {
    id: 'run_fixture', taskIdentifier: 'orcheval-sequential', status: 'COMPLETED',
    isQueued: false, isExecuting: false, isWaiting: false, isCompleted: true,
    isSuccess: true, isFailed: false, isCancelled: false, isTest: true,
    createdAt: start, updatedAt: end, startedAt: start, finishedAt: end,
    tags: [], costInCents: 0, baseCostInCents: 0, durationMs: 1000,
    depth: 0, triggerFunction: 'trigger', relatedRuns: {}, attemptCount: 1,
    payload: { execution }, output, ...overrides,
  };
}

async function apiFixture(t, reply) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const captured = { method: request.method, path: request.url, authorization: request.headers.authorization, body: text ? JSON.parse(text) : undefined };
    requests.push(captured);
    response.setHeader('content-type', 'application/json');
    response.setHeader('x-trigger-jwt', 'fixture-public-token');
    response.end(JSON.stringify(reply(captured)));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { requests, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(action, payload = {}, env = {}) {
  const child = spawn(process.execPath, [new URL('./triggerdev-runner.mjs', import.meta.url).pathname], {
    env: { ...process.env, TRIGGER_API_URL: '', TRIGGER_SECRET_KEY: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [], stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try {
    child.stdin.end(JSON.stringify({ action, payload }));
    const [code] = await once(child, 'close');
    return { code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() };
  } finally { clearTimeout(timer); }
}

function fixtureEnv(base) { return { TRIGGER_API_URL: base, TRIGGER_SECRET_KEY: 'tr_dev_fixture-not-a-real-key' }; }
function ok(result) { assert.equal(result.code, 0, result.stderr); return JSON.parse(result.stdout); }

test('Hatchet uses stable submission time and direct final output, retaining server timestamps', () => {
  const detail = { run: { metadata: { id: 'hatchet-fixture', createdAt: start }, createdAt: end, status: 'RUNNING', input: { execution } } };
  const pending = hatchetObservation('hatchet-fixture', detail);
  assert.equal(pending.startedAt, start);
  assert.equal(pending.endedAt, null);
  detail.run = { ...detail.run, status: 'COMPLETED', output, finishedAt: end };
  const completed = hatchetObservation('hatchet-fixture', detail);
  assert.equal(completed.startedAt, pending.startedAt);
  assert.equal(completed.outcome, 'SUCCEEDED');
  assert.equal(completed.output, output.output);
  assert.ok(Date.parse(completed.steps[0].startedAt) < Date.parse(detail.run.createdAt));
  assert.ok(Date.parse(completed.steps[0].startedAt) >= Date.parse(completed.startedAt));
  assert.equal(completed.runtimeEvidence.detail, detail);
  assert.equal(completed.crossTenantLeakDetected, null);
  assert.throws(() => hatchetObservation('different-id', detail), /different run id/);
});

test('Trigger.dev requires explicit endpoint and credentials, without cloud fallback', async () => {
  const result = await call('health');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /explicit self-hosted/);
});

test('Trigger.dev SDK authenticates, submits the intended task and carries idempotency', async (t) => {
  const api = await apiFixture(t, (request) => request.method === 'GET' ? { data: [], pagination: {} } : { id: 'run_fixture' });
  const env = fixtureEnv(api.base);
  assert.equal(ok(await call('health', {}, env)).healthy, true);
  assert.deepEqual(ok(await call('execute', { workload: { id: 'ORCH-01', kind: 'sequential' }, execution }, env)), { executionId: 'run_fixture' });
  ok(await call('execute', { workload: { id: 'ORCH-01', kind: 'sequential' }, execution }, env));
  ok(await call('execute', { workload: { id: 'ORCH-01', kind: 'sequential' }, execution: { ...execution, id: 'another-execution' } }, env));
  assert.equal(api.requests.length, 4);
  assert.match(api.requests[0].path, /^\/api\/v1\/runs\?/);
  const request = api.requests[1];
  assert.equal(request.path, '/api/v1/tasks/orcheval-sequential/trigger');
  assert.equal(request.authorization, `Bearer ${env.TRIGGER_SECRET_KEY}`);
  assert.deepEqual(JSON.parse(request.body.payload).json, { execution });
  // The SDK hashes the supplied key; repetition must preserve it and distinct
  // execution identities must produce distinct wire keys.
  assert.match(request.body.options.idempotencyKey, /^[a-f0-9]{64}$/);
  assert.equal(request.body.options.idempotencyKey, api.requests[2].body.options.idempotencyKey);
  assert.notEqual(request.body.options.idempotencyKey, api.requests[3].body.options.idempotencyKey);
});

test('Trigger.dev SDK maps queued, waiting and complete snapshots with unknown security', async (t) => {
  let fixture = runFixture({ status: 'QUEUED', finishedAt: undefined, output: undefined });
  const api = await apiFixture(t, () => fixture);
  const env = fixtureEnv(api.base);
  const queued = ok(await call('observe', { executionId: 'run_fixture' }, env));
  assert.equal(queued.outcome, 'QUEUED');
  assert.equal(queued.endedAt, null);
  fixture = runFixture({ status: 'WAITING', finishedAt: undefined, output: undefined });
  assert.equal(ok(await call('observe', { executionId: 'run_fixture' }, env)).outcome, 'WAITING');
  fixture = runFixture();
  const completed = ok(await call('observe', { executionId: 'run_fixture' }, env));
  assert.equal(completed.outcome, 'SUCCEEDED');
  assert.equal(completed.startedAt, queued.startedAt);
  assert.equal(completed.endedAt, end);
  assert.deepEqual(completed.steps, output.steps);
  assert.equal(completed.auditTrailComplete, null);
  assert.equal(completed.runtimeEvidence.run.id, 'run_fixture');
  assert.ok(api.requests.every(({ path }) => path === '/api/v3/runs/run_fixture'));
});

test('Trigger.dev rejects foreign, failed and incomplete terminal records', async (t) => {
  let fixture;
  const api = await apiFixture(t, () => fixture);
  for (const [override, expected] of [
    [{ id: 'foreign-run' }, /different run or task/],
    [{ taskIdentifier: 'foreign-task' }, /different run or task/],
    [{ status: 'FAILED' }, /ended FAILED/],
    [{ finishedAt: undefined }, /no terminal timestamp/],
    [{ output: { ...output, steps: [] } }, /missing\/out-of-order steps/],
  ]) {
    fixture = runFixture(override);
    const result = await call('observe', { executionId: 'run_fixture' }, fixtureEnv(api.base));
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, expected);
  }
});

test('Trigger.dev rejects unsupported workloads before submitting to the API', async (t) => {
  const api = await apiFixture(t, () => ({ id: 'unexpected' }));
  const result = await call('execute', { workload: { id: 'ORCH-06', kind: 'approval-resume' }, execution }, fixtureEnv(api.base));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /only ORCH-01/);
  assert.equal(api.requests.length, 0);
});

test('Trigger.dev SDK registers the root and all five native child tasks', async () => {
  const definitions = await import('./trigger-tasks/sequential.mjs');
  assert.deepEqual(Object.values(definitions).map(({ id }) => id).sort(), ['orcheval-sequential', ...stepIds.map((id) => `orcheval-${id}`)].sort());
});
