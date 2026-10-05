import { setTimeout as delay } from 'node:timers/promises';
import type { EvaluationExecution, EvaluationTarget, ExecutionHandle, ExecutionObservation, ExecutionSnapshot, LifecycleEvent, WorkloadDefinition } from './index.ts';

const terminalStates = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const pendingStates = new Set(['QUEUED', 'RUNNING', 'WAITING']);

function validateSnapshot(snapshot: ExecutionSnapshot, workload: WorkloadDefinition, execution: EvaluationExecution, handle: ExecutionHandle): void {
  if (snapshot.executionId !== handle.executionId || snapshot.tenantId !== execution.tenantId || snapshot.correlationId !== execution.correlationId || snapshot.workloadId !== workload.id) throw new Error(`Observation identity mismatch for ${execution.id}.`);
  const terminal = terminalStates.has(snapshot.outcome);
  if (!terminal && !pendingStates.has(snapshot.outcome)) throw new Error(`Invalid execution state for ${execution.id}.`);
  const start = Date.parse(snapshot.startedAt);
  const end = Date.parse(terminal ? snapshot.endedAt ?? '' : snapshot.observedAt ?? '');
  if ((!terminal && snapshot.endedAt !== null) || !Number.isFinite(start) || !Number.isFinite(end) || end < start || snapshot.steps.some((step) => {
    const stepStart = Date.parse(step.startedAt);
    const stepEnd = Date.parse(step.endedAt);
    return !Number.isFinite(stepStart) || !Number.isFinite(stepEnd) || stepStart < start || stepEnd < stepStart || stepEnd > end;
  })) throw new Error(`Invalid observation timeline for ${execution.id}.`);
}

/** Poll under one deadline; actions are issued once, only after observing their barrier. */
export async function completeExecution(target: EvaluationTarget, workload: WorkloadDefinition, execution: EvaluationExecution, handle: ExecutionHandle): Promise<ExecutionObservation> {
  const timeoutMs = workload.timeoutMs ?? 30_000;
  const pollIntervalMs = workload.pollIntervalMs ?? 100;
  if (![timeoutMs, pollIntervalMs].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error('Lifecycle limits must be positive integers.');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Execution ${handle.executionId} timed out after ${timeoutMs}ms.`);
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  const bounded = <T>(operation: () => Promise<T>) => {
    controller.signal.throwIfAborted();
    return Promise.race([operation(), expired]);
  };
  const events: LifecycleEvent[] = [];
  let acted = false;
  let startedAt: string | undefined;
  try {
    while (true) {
      const snapshot = await bounded(() => target.observe(handle.executionId, options));
      validateSnapshot(snapshot, workload, execution, handle);
      if (startedAt !== undefined && startedAt !== snapshot.startedAt) throw new Error(`Execution start time changed for ${execution.id}.`);
      startedAt = snapshot.startedAt;
      // Store transitions, not an unbounded copy of every identical poll.
      if (events.at(-1)?.action !== 'observe' || events.at(-1)?.outcome !== snapshot.outcome) events.push({ action: 'observe', timestamp: new Date().toISOString(), outcome: snapshot.outcome });
      const action = workload.lifecycle;
      if (terminalStates.has(snapshot.outcome)) {
        if (action && !acted) throw new Error(`Execution ${execution.id} ended before the required ${action.at} ${action.action} action.`);
        const expected = action?.action === 'cancel' ? 'CANCELLED' : 'SUCCEEDED';
        if (action && snapshot.outcome !== expected) throw new Error(`Execution ${execution.id} reached ${snapshot.outcome}; expected ${expected} after ${action.action}.`);
        return { ...snapshot, endedAt: snapshot.endedAt!, lifecycle: events };
      }
      if (action && !acted && snapshot.outcome === action.at) {
        if (action.action === 'signal') {
          if (!target.signal) throw new Error(`Target ${target.id} does not support signals.`);
          await bounded(() => target.signal!(handle.executionId, action.signal, options));
        } else await bounded(() => target.cancel(handle.executionId, options));
        acted = true;
        events.push({ action: action.action, timestamp: new Date().toISOString(), outcome: snapshot.outcome, ...(action.action === 'signal' ? { signal: structuredClone(action.signal) } : {}) });
      }
      await bounded(() => delay(pollIntervalMs, undefined, options));
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
