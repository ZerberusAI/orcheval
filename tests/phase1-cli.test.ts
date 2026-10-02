import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSimpleYamlConfig } from '../packages/cli/index.ts';

test('parses targets, gates, metrics, faults and concurrency from the documented YAML format', () => {
  const config = parseSimpleYamlConfig(`version: 1
profile:
  id: ai-orchestration
targets:
  - temporal
gates:
  security-baseline:
    required: true
metrics:
  latency:
    enabled: true
runs:
  repetitions: 2
load:
  concurrency:
    - 1
    - 10
faults:
  - transient_failure
`);
  assert.deepEqual(config, { version: 1, profileId: 'ai-orchestration', targets: ['temporal'], gates: ['security-baseline'], metrics: ['latency'], repetitions: 2, concurrency: [1, 10], faults: ['transient_failure'] });
});
