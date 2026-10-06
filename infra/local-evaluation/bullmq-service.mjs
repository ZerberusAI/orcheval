import { createServer } from 'node:http';
import { Queue, Worker } from 'bullmq';
import { mockStep, stepIds } from './workload.mjs';

const redis = new URL(process.env.BULLMQ_REDIS_URL ?? '');
if (redis.protocol !== 'redis:' || !redis.hostname) throw new Error('BULLMQ_REDIS_URL must be a Redis URL.');
const connection = { host: redis.hostname, port: Number(redis.port || 6379) };
const queueName = 'orcheval-sequential';
const queue = new Queue(queueName, { connection });

const worker = new Worker(queueName, async (job) => {
  const execution = job.data.execution;
  let state = { completed: [], output: null };
  const steps = [];
  for (const id of stepIds) {
    const result = await mockStep(id, state, execution);
    state = result.state;
    steps.push(result.observation);
    await job.updateProgress({ completed: state.completed });
  }
  return { execution, steps, output: state.output };
}, { connection });
await worker.waitUntilReady();

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function reply(response, code, value) {
  response.writeHead(code, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}
async function jobSnapshot(id) {
  const job = await queue.getJob(id);
  if (!job) return null;
  return {
    id: job.id, state: await job.getState(), timestamp: job.timestamp,
    processedOn: job.processedOn ?? null, finishedOn: job.finishedOn ?? null,
    attemptsMade: job.attemptsMade, progress: job.progress,
    data: job.data, returnvalue: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  };
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return reply(response, 200, { healthy: worker.isRunning() });
    if (request.method === 'POST' && request.url === '/execute') {
      const execution = await body(request);
      const job = await queue.add('sequential', { execution }, { jobId: execution.id, removeOnComplete: false, removeOnFail: false });
      return reply(response, 202, { jobId: job.id });
    }
    const match = /^\/observe\/([^/]+)$/.exec(request.url ?? '');
    if (match && request.method === 'GET') {
      const job = await jobSnapshot(decodeURIComponent(match[1]));
      return job ? reply(response, 200, { job }) : reply(response, 404, { message: 'Job not found.' });
    }
    return reply(response, 404, { message: 'Not found.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BullMQ service request failed.';
    return reply(response, 500, { message: message.slice(0, 500) });
  }
});
server.listen(Number(process.env.PORT ?? 9082), '0.0.0.0');

async function close() {
  server.close();
  await worker.close();
  await queue.close();
}
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
