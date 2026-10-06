import { defineConfig } from '@trigger.dev/sdk/v3';

if (!process.env.TRIGGER_PROJECT_REF) throw new Error('TRIGGER_PROJECT_REF must identify the disposable self-hosted project.');
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF,
  runtime: 'node',
  dirs: ['./trigger-tasks'],
  maxDuration: 60,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
});
