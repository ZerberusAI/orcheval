import { setTimeout as delay } from 'node:timers/promises';
import { createHatchetClient } from './hatchet-client.mjs';
import { mockStep, stepIds } from './workload.mjs';

let client;
for (let attempt = 0; attempt < 90; attempt++) {
  try { client = await createHatchetClient(); await client.workers.list(); break; }
  catch { client = undefined; await delay(1_000); }
}
if (!client) throw new Error('Hatchet bootstrap did not become ready.');
const workflow = client.workflow({ name: 'orcheval-sequential' });
let parent;
for (const id of stepIds) {
  const previous = parent;
  parent = workflow.task({ name: id, parents: previous ? [previous] : [], retries: 0, executionTimeout: '10s', fn: async ({ execution }, context) => {
    const prior = previous ? await context.parentOutput(previous) : { state: { completed: [], output: null }, steps: [] };
    const result = await mockStep(id, prior.state, execution);
    return { execution, state: result.state, steps: [...prior.steps, result.observation], output: result.state.output };
  } });
}
const worker = await client.worker('orcheval-sequential-worker', { workflows: [workflow], slots: 1 });
await worker.start();
