import { mockStep, stepIds } from './workload.mjs';

export function sequentialFlow() {
  return { modules: stepIds.map((id, index) => ({
    id,
    value: {
      type: 'rawscript', language: 'bun',
      input_transforms: {
        execution: { type: 'javascript', expr: 'flow_input.execution' },
        previous: index === 0 ? { type: 'static', value: { state: { completed: [], output: null }, steps: [] } } : { type: 'javascript', expr: `results.${stepIds[index - 1]}` },
      },
      content: `const stepIds = ${JSON.stringify(stepIds)};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
${mockStep.toString()}
export async function main(execution, previous) {
  const result = await mockStep(${JSON.stringify(id)}, previous.state, execution);
  return { execution, state: result.state, steps: [...previous.steps, result.observation], output: result.state.output };
}`,
    },
  })) };
}
