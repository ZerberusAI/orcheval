const { proxyActivities, defineQuery, defineSignal, setHandler, condition, isCancellation } = require('@temporalio/workflow');
const { mockStep } = proxyActivities({ startToCloseTimeout: '5 seconds', retry: { maximumAttempts: 1 } });

async function evaluated(execution, workloadId) {
  let state = { completed: [], output: null };
  const steps = [];
  let outcome = 'RUNNING';
  let approved = false;
  const snapshot = () => ({ execution, workloadId, steps, output: state.output, outcome });
  setHandler(defineQuery('snapshot'), snapshot);
  setHandler(defineSignal('approve'), (payload) => {
    if (payload?.approved === true && outcome === 'WAITING') approved = true;
  });
  try {
    for (const id of ['context', 'policy', 'retrieval', 'model', 'validation']) {
      if (id === 'retrieval' && workloadId !== 'ORCH-01') {
        outcome = 'WAITING';
        await condition(() => approved);
        outcome = 'RUNNING';
      }
      const result = await mockStep(id, state, execution);
      state = result.state;
      steps.push(result.observation);
    }
    outcome = 'SUCCEEDED';
    return snapshot();
  } catch (error) {
    outcome = isCancellation(error) ? 'CANCELLED' : 'FAILED';
    throw error;
  }
}

exports.sequential = (execution) => evaluated(execution, 'ORCH-01');
exports.lifecycle = (execution, workloadId) => {
  if (!['ORCH-06', 'ORCH-07'].includes(workloadId)) throw new Error('Unsupported lifecycle scenario.');
  return evaluated(execution, workloadId);
};
