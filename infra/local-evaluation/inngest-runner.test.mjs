import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { RunnerTarget } from '/workspace/adapters/runner-target.ts';
import { stepIds } from './workload.mjs';

// Runs inside the SDK image: no host dependency installation or published port.
test('Inngest runner waits for the real end timestamp after Completed', async (t) => {
  let polls = 0;
  const start = '2026-10-05T10:00:00.000Z';
  const end = '2026-10-05T10:00:01.000Z';
  const execution = { id: 'execution-1', tenantId: 'tenant-a', correlationId: 'correlation-1' };
  const workerResult = { execution, steps: stepIds.map((id) => ({ id, startedAt: start, endedAt: start, attempt: 1, outcome: 'SUCCEEDED' })), output: 'approved:tenant-a:execution-1' };
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/events/event-1/runs') {
      polls++;
      response.end(JSON.stringify({ data: [{ run_id: 'run-1', status: 'Completed', run_started_at: start, ended_at: polls === 1 ? null : end }] }));
    } else if (request.url === '/evidence/run-1') response.end(JSON.stringify(workerResult));
    else { response.writeHead(404); response.end('{}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const originalBase = process.env.INNGEST_BASE_URL;
  const originalApp = process.env.INNGEST_APP_URL;
  process.env.INNGEST_BASE_URL = process.env.INNGEST_APP_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    if (originalBase === undefined) delete process.env.INNGEST_BASE_URL; else process.env.INNGEST_BASE_URL = originalBase;
    if (originalApp === undefined) delete process.env.INNGEST_APP_URL; else process.env.INNGEST_APP_URL = originalApp;
  });
  const target = new RunnerTarget('inngest', 'Inngest', { command: process.execPath, args: [fileURLToPath(new URL('./inngest-runner.mjs', import.meta.url))], timeoutMs: 5_000 });
  const observation = await target.observe('event-1');
  assert.equal(polls, 2);
  assert.equal(observation.outcome, 'SUCCEEDED');
  assert.equal(observation.endedAt, end);
  assert.equal(observation.runtimeEvidence.incompleteTerminalRecords.length, 1);
  assert.equal(observation.runtimeEvidence.incompleteTerminalRecords[0].run.ended_at, null);
});
