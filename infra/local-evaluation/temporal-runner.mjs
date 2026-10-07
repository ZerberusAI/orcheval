import { Client, Connection } from '@temporalio/client';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { assertSequential, observationFromSnapshot, verifyResult } from './workload.mjs';

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const { action, payload } = JSON.parse(Buffer.concat(input).toString('utf8'));
const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS, connectTimeout: '5 seconds' });
const client = new Client({ connection, namespace: 'default' });
const coreV1 = process.env.ORCHEVAL_CORE_V1 === '1';
try {
  let response;
  if (action === 'metadata') {
    const system = await connection.workflowService.getSystemInfo({});
    const sdkVersions = {};
    for (const name of ['client', 'worker', 'workflow']) sdkVersions[`@temporalio/${name}`] = JSON.parse(await readFile(new URL(`../node_modules/@temporalio/${name}/package.json`, import.meta.url), 'utf8')).version;
    response = { displayName: coreV1 ? 'Temporal core-v1 reference adapter' : 'Temporal local SDK smoke runner', version: system.serverVersion, adapterVersion: coreV1 ? 'core-v1-1.0.0' : 'smoke-0.2.0', capabilities: coreV1 ? ['core-v1-order-workload', 'parallel-activities', 'controlled-retry', 'approval-resume', 'waiting-cancellation', 'workflow-version-marker'] : ['sequential-smoke', 'approval-resume-smoke', 'waiting-cancellation-smoke'], sdkVersions, containerImageDigests: ['temporalio/temporal@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e', `orcheval-phase1-sdk@${process.env.ORCHEVAL_SDK_IMAGE_ID}`] };
  } else if (action === 'health' || action === 'setup') {
    let pollers = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const queue = await connection.workflowService.describeTaskQueue({ namespace: 'default', taskQueue: { name: 'orcheval-phase1-sequential' }, taskQueueType: 1 });
      pollers = queue.pollers?.length ?? 0;
      if (pollers > 0) break;
      await delay(250);
    }
    response = { healthy: pollers > 0, details: [`Temporal service reachable; observed ${pollers} task-queue poller(s).`] };
  } else if (action === 'execute') {
    const lifecycle = payload.workload.lifecycle;
    const isApproval = payload.workload.id === 'ORCH-06' && payload.workload.kind === 'approval-resume' && lifecycle?.action === 'signal' && lifecycle.at === 'WAITING' && lifecycle.signal?.name === 'approve' && lifecycle.signal.payload?.approved === true;
    const isCancellation = payload.workload.id === 'ORCH-07' && payload.workload.kind === 'cancellation' && lifecycle?.action === 'cancel' && lifecycle.at === 'WAITING';
    if (!coreV1) {
      if (!isApproval && !isCancellation) assertSequential(payload);
      if (payload.execution.faults.length || payload.execution.cancellationRequested) throw new Error('This runner requires explicit lifecycle actions and supports no fault injection.');
    }
    const workflowType = coreV1 ? 'coreV1' : (isApproval || isCancellation ? 'lifecycle' : 'sequential');
    const handle = await client.workflow.start(workflowType, { workflowId: payload.execution.id, taskQueue: 'orcheval-phase1-sequential', args: [payload.execution, payload.workload.id], workflowExecutionTimeout: '60 seconds' });
    response = { executionId: handle.workflowId };
  } else if (action === 'observe') {
    const handle = client.workflow.getHandle(payload.executionId);
    let result = await handle.query('snapshot');
    const description = await handle.describe();
    const status = description.status.name;
    if (status === 'COMPLETED') {
      result = await handle.result();
      if (!coreV1) verifyResult(result);
    }
    else if (status === 'CANCELLED') result = { ...result, outcome: 'CANCELLED' };
    else if (status !== 'RUNNING') throw new Error(`Temporal workflow ended unexpectedly: ${status}.`);
    else if (result.outcome !== 'WAITING') result = { ...result, outcome: 'RUNNING' };
    const history = description.closeTime ? await handle.fetchHistory() : undefined;
    response = observationFromSnapshot(payload.executionId, result, { startedAt: description.startTime.toISOString(), endedAt: description.closeTime?.toISOString() ?? null, observedAt: new Date().toISOString() }, { protocol: coreV1 ? 'core-v1' : 'smoke', workflowId: payload.executionId, runId: description.runId, status, history });
  } else if (action === 'signal') {
    if (payload.signal?.name !== 'approve' || payload.signal.payload?.approved !== true) throw new Error('Unsupported approval signal.');
    await client.workflow.getHandle(payload.executionId).signal('approve', payload.signal.payload);
    response = {};
  } else if (action === 'cancel') {
    await client.workflow.getHandle(payload.executionId).cancel();
    response = {};
  } else if (action === 'teardown') {
    response = {};
  } else {
    throw new Error(`Unsupported smoke action: ${action}.`);
  }
  process.stdout.write(JSON.stringify(response));
} finally {
  await connection.close();
}
