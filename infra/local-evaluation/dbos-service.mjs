import { createServer } from 'node:http';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { mockStep, stepIds } from './workload.mjs';

const pipeline = DBOS.registerWorkflow(async (execution) => {
  let previous = { state: { completed: [], output: null }, steps: [] };
  for (const id of stepIds) {
    const result = await DBOS.runStep(() => mockStep(id, previous.state, execution), { name: id });
    previous = { state: result.state, steps: [...previous.steps, result.observation], output: result.state.output };
  }
  return { execution, ...previous };
}, { name: 'orchevalSequential' });

DBOS.setConfig({ name: 'orcheval-dbos', applicationVersion: 'smoke-0.1.0', systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL, systemDatabasePoolSize: 4, logLevel: 'warn' });
await DBOS.launch();

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function reply(response, code, value) {
  response.writeHead(code, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}
createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return reply(response, 200, { healthy: DBOS.isInitialized() });
    if (request.method === 'POST' && request.url === '/execute') {
      const execution = await body(request);
      const handle = await DBOS.startWorkflow(pipeline, { workflowID: execution.id })(execution);
      return reply(response, 202, { workflowId: handle.workflowID });
    }
    const match = /^\/(observe|cancel)\/([^/]+)$/.exec(request.url ?? '');
    if (match?.[1] === 'observe' && request.method === 'GET') return reply(response, 200, { status: await DBOS.getWorkflowStatus(decodeURIComponent(match[2])) });
    if (match?.[1] === 'cancel' && request.method === 'PATCH') {
      await DBOS.cancelWorkflow(decodeURIComponent(match[2]));
      return reply(response, 200, {});
    }
    return reply(response, 404, { message: 'Not found.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DBOS service request failed.';
    return reply(response, 500, { message: message.slice(0, 500) });
  }
}).listen(Number(process.env.PORT ?? 9081), '0.0.0.0');
