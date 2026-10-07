import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { activityInfo } from '@temporalio/activity';

const sideEffects = new Map();

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * The credential-free reference application: a small order fulfilment service.
 * Its only consequential operation is retained in this process-local ledger so a
 * Temporal activity retry can be checked for duplicate writes without trusting a
 * workflow completion status alone.
 */
export async function coreV1Step(id, execution, workloadId) {
  const startedAt = new Date().toISOString();
  const attempt = activityInfo().attempt;
  const recoverable = (workloadId === 'ORCH-04' && id === 'consequential-operation' && execution.faults.includes('transient_failure'))
    || (workloadId === 'ORCH-05' && id === 'recoverable-operation' && execution.faults.includes('worker_kill'));
  if (recoverable && attempt === 1) throw new Error(`Controlled recoverable fault at ${id}.`);
  await delay(5);

  let duplicateSideEffects = 0;
  if (id === 'consequential-operation') {
    const key = `order:${execution.id}`;
    const value = { tenantId: execution.tenantId, workloadId, executionId: execution.id };
    const previous = sideEffects.get(key);
    const next = digest(value);
    if (previous && previous !== next) throw new Error(`Idempotency key ${key} was reused with different data.`);
    duplicateSideEffects = previous ? 1 : 0;
    sideEffects.set(key, next);
  }
  return { observation: { id, startedAt, endedAt: new Date().toISOString(), attempt, outcome: 'SUCCEEDED' }, duplicateSideEffects };
}
