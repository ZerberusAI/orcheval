import { task } from '@trigger.dev/sdk/v3';
import { mockStep } from './workload.mjs';

function stepTask(id) {
  return task({ id: `orcheval-${id}`, retry: { maxAttempts: 1 }, run: async ({ execution, previous }, { ctx }) => {
    const result = await mockStep(id, previous.state, execution);
    return { execution, state: result.state, steps: [...previous.steps, { ...result.observation, runtimeRunId: ctx.run.id }], output: result.state.output };
  } });
}

// Named exports allow the Trigger.dev CLI to discover every native child task.
export const contextTask = stepTask('context');
export const policyTask = stepTask('policy');
export const retrievalTask = stepTask('retrieval');
export const modelTask = stepTask('model');
export const validationTask = stepTask('validation');
export const sequential = task({ id: 'orcheval-sequential', retry: { maxAttempts: 1 }, run: async ({ execution }) => {
  let previous = { state: { completed: [], output: null }, steps: [] };
  for (const child of [contextTask, policyTask, retrievalTask, modelTask, validationTask]) {
    const result = await child.triggerAndWait({ execution, previous });
    if (!result.ok) throw new Error(`Trigger.dev child ${child.id} failed.`);
    previous = result.output;
  }
  return previous;
} });
