const { proxyActivities, defineQuery, defineSignal, setHandler, condition, isCancellation, patched } = require('@temporalio/workflow');
const { mockStep } = proxyActivities({ startToCloseTimeout: '5 seconds', retry: { maximumAttempts: 1 } });
const { coreV1Step } = proxyActivities({ startToCloseTimeout: '5 seconds', retry: { maximumAttempts: 2 } });

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

const coreV1Steps = {
  'ORCH-01': ['context', 'policy', 'retrieval', 'model', 'validation'],
  'ORCH-02': ['tool-a', 'tool-b', 'tool-c', 'aggregate', 'synthesis'],
  'ORCH-03': ['admit', 'dispatch', 'result'],
  'ORCH-04': ['validate-request', 'consequential-operation', 'verify-effect'],
  'ORCH-05': ['start', 'recoverable-operation', 'verify-recovery'],
  'ORCH-06': ['request', 'policy', 'approval', 'fulfil', 'audit'],
  'ORCH-07': ['queue', 'dispatch', 'wait'],
  'ORCH-08': ['admit', 'work', 'result'],
  'ORCH-09': ['hydrate-context', 'model', 'validate-context'],
  'ORCH-10': ['prepare', 'version-marker', 'resume'],
};

async function coreV1(execution, workloadId) {
  const ids = coreV1Steps[workloadId];
  if (!ids) throw new Error(`Unsupported core-v1 workload: ${workloadId}.`);
  const steps = [];
  let outcome = 'RUNNING';
  let approved = false;
  let duplicateSideEffects = 0;
  const snapshot = () => ({
    execution, workloadId, steps, outcome, duplicateSideEffects,
    // Security remains unknown until purpose-built adversarial probes run.
    crossTenantLeakDetected: null, secretExposureDetected: null, identitySubstitutionAllowed: null,
    cancellationAffectedUnrelatedWork: null, auditTrailComplete: null, recoverySkippedSteps: null, crossRunLeakDetected: null,
    output: outcome === 'SUCCEEDED' ? `order:${execution.tenantId}:${execution.id}:${workloadId}` : null,
    protocol: 'core-v1',
  });
  setHandler(defineQuery('snapshot'), snapshot);
  setHandler(defineSignal('approve'), (payload) => {
    if (payload?.approved === true && outcome === 'WAITING') approved = true;
  });
  try {
    for (const id of ids) {
      if ((workloadId === 'ORCH-06' && id === 'approval') || (workloadId === 'ORCH-07' && id === 'wait')) {
        outcome = 'WAITING';
        await condition(() => approved);
        outcome = 'RUNNING';
      }
      if (workloadId === 'ORCH-02' && id === 'tool-a') {
        const parallel = await Promise.all(['tool-a', 'tool-b', 'tool-c'].map((tool) => coreV1Step(tool, execution, workloadId)));
        for (const item of parallel) steps.push(item.observation);
        duplicateSideEffects += parallel.reduce((sum, item) => sum + item.duplicateSideEffects, 0);
        continue;
      }
      if (workloadId === 'ORCH-02' && (id === 'tool-b' || id === 'tool-c')) continue;
      if (workloadId === 'ORCH-10' && id === 'version-marker') patched('orcheval-core-v1-order-workload');
      const item = await coreV1Step(id, execution, workloadId);
      steps.push(item.observation);
      duplicateSideEffects += item.duplicateSideEffects;
    }
    outcome = 'SUCCEEDED';
    return snapshot();
  } catch (error) {
    outcome = isCancellation(error) ? 'CANCELLED' : 'FAILED';
    throw error;
  }
}

exports.coreV1 = coreV1;
