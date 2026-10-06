import { observationFromSnapshot, verifyResult } from './workload.mjs';

export function hatchetObservation(executionId, detail) {
  const { run } = detail;
  if (run.metadata.id !== executionId) throw new Error('Hatchet returned a different run id.');
  if (['FAILED', 'CANCELLED'].includes(run.status)) throw new Error(`Hatchet run ${run.status}.`);
  const complete = run.status === 'COMPLETED' && run.finishedAt;
  const result = complete ? run.output : { execution: run.input.execution, steps: [], output: null };
  if (complete) verifyResult(result);
  // The aggregate run.createdAt can reflect an asynchronously recorded start,
  // after the first worker step. metadata.createdAt is the stable submission time.
  return observationFromSnapshot(executionId, { ...result, outcome: complete ? 'SUCCEEDED' : 'RUNNING' }, {
    startedAt: run.metadata.createdAt, endedAt: complete ? run.finishedAt : null, observedAt: new Date().toISOString(),
  }, { deploymentMode: 'SELF_HOSTED', edition: 'Hatchet Lite', startTimestampSource: 'run.metadata.createdAt (submission)', detail });
}
