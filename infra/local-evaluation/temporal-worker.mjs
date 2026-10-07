import { NativeConnection, Worker } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import { mockStep } from './workload.mjs';
import { coreV1Step } from './core-v1-activities.mjs';

const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
try {
  const worker = await Worker.create({
    connection, namespace: 'default', taskQueue: 'orcheval-phase1-sequential',
    workflowsPath: fileURLToPath(new URL('./temporal-workflows.cjs', import.meta.url)),
    activities: { mockStep, coreV1Step },
  });
  await worker.run();
} finally {
  await connection.close();
}
