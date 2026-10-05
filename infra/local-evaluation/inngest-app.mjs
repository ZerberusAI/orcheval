import { createServer } from 'node:http';
import { Inngest } from 'inngest';
import { serve } from 'inngest/node';
import { mockStep, stepIds } from './workload.mjs';

const client = new Inngest({ id: 'orcheval-phase1' });
const completed = new Map();
const sequential = client.createFunction({ id: 'sequential', triggers: [{ event: 'orcheval/sequential' }], retries: 0 }, async ({ event, step, runId }) => {
  let state = { completed: [], output: null };
  const steps = [];
  for (const id of stepIds) {
    const result = await step.run(id, () => mockStep(id, state, event.data.execution));
    state = result.state;
    steps.push(result.observation);
  }
  const result = { execution: event.data.execution, steps, output: state.output };
  completed.set(runId, result);
  return result;
});

const handler = serve({ client, functions: [sequential] });
const server = createServer((request, response) => {
  if (request.url === '/health') { response.writeHead(200); response.end('ready'); return; }
  if (request.method === 'GET' && request.url?.startsWith('/evidence/')) {
    const result = completed.get(decodeURIComponent(request.url.slice('/evidence/'.length)));
    response.writeHead(result ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result ?? { error: 'No completed worker evidence for this run.' }));
    return;
  }
  if (request.url?.startsWith('/api/inngest')) { void handler(request, response); return; }
  response.writeHead(404); response.end();
});
server.listen(3000, '0.0.0.0');
process.on('SIGTERM', () => server.close());
