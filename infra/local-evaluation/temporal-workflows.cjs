const { proxyActivities } = require('@temporalio/workflow');
const { mockStep } = proxyActivities({ startToCloseTimeout: '5 seconds', retry: { maximumAttempts: 1 } });

exports.sequential = async function sequential(execution) {
  let state = { completed: [], output: null };
  const steps = [];
  for (const id of ['context', 'policy', 'retrieval', 'model', 'validation']) {
    const result = await mockStep(id, state, execution);
    state = result.state;
    steps.push(result.observation);
  }
  return { execution, steps, output: state.output };
};
