import { Client, Connection } from '@temporalio/client';
import { readFile } from 'node:fs/promises';
import { assertSequential, observationFromResult } from './workload.mjs';

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const { action, payload } = JSON.parse(Buffer.concat(input).toString('utf8'));
const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS, connectTimeout: '5 seconds' });
const client = new Client({ connection, namespace: 'default' });
try {
  let response;
  if (action === 'metadata') {
    const system = await connection.workflowService.getSystemInfo({});
    const sdkVersions = {};
    for (const name of ['client', 'worker', 'workflow']) sdkVersions[`@temporalio/${name}`] = JSON.parse(await readFile(new URL(`../node_modules/@temporalio/${name}/package.json`, import.meta.url), 'utf8')).version;
    response = { displayName: 'Temporal local SDK smoke runner', version: system.serverVersion, adapterVersion: 'smoke-0.1.0', capabilities: ['sequential-smoke'], sdkVersions, containerImageDigests: ['temporalio/temporal@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e', `orcheval-phase1-sdk@${process.env.ORCHEVAL_SDK_IMAGE_ID}`] };
  } else if (action === 'health' || action === 'setup') {
    const queue = await connection.workflowService.describeTaskQueue({ namespace: 'default', taskQueue: { name: 'orcheval-phase1-sequential' }, taskQueueType: 1 });
    response = { healthy: (queue.pollers?.length ?? 0) > 0, details: ['Temporal service reachable; worker readiness comes from task-queue pollers.'] };
  } else if (action === 'execute') {
    assertSequential(payload);
    const handle = await client.workflow.start('sequential', { workflowId: payload.execution.id, taskQueue: 'orcheval-phase1-sequential', args: [payload.execution], workflowExecutionTimeout: '30 seconds' });
    response = { executionId: handle.workflowId };
  } else if (action === 'observe') {
    const handle = client.workflow.getHandle(payload.executionId);
    const result = await handle.result();
    const description = await handle.describe();
    const history = await handle.fetchHistory();
    response = observationFromResult(payload.executionId, result, { startedAt: description.startTime.toISOString(), endedAt: description.closeTime.toISOString() }, { workflowId: payload.executionId, runId: description.runId, history });
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
