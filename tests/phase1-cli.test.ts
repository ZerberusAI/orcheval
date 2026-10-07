import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSimpleYamlConfig } from '../packages/cli/index.ts';
import { validateConfig } from '../packages/core/index.ts';
import { createPhaseOneEngine, phaseOneDependencies } from '../packages/harness/index.ts';

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

test('quoted names retain hashes, apostrophes, escapes and whitespace', () => {
  const name = 'Customer\'s "evaluation" #1: C:\\test\nsecond line';
  assert.equal(parseSimpleYamlConfig(`evaluation:\n  name: ${JSON.stringify(name)} # comment\n`).name, name);
  assert.equal(parseSimpleYamlConfig("# comment\nevaluation:\n  name: 'Customer''s #1' # comment\n").name, "Customer's #1");
  assert.equal(parseSimpleYamlConfig("evaluation:\n  name: Customer's evaluation # comment\n").name, "Customer's evaluation");
  assert.equal(parseSimpleYamlConfig('evaluation:\n  name: A "quoted" evaluation # comment\n').name, 'A "quoted" evaluation');
});

test('disabling every metric does not silently re-enable the defaults', async () => {
  const config = parseSimpleYamlConfig(`profile:
  id: ai-orchestration
targets:
  - temporal
gates:
  "security-baseline":
    required: true
metrics:
  latency:
    enabled: false
faults: []
`);
  assert.deepEqual(validateConfig(config, phaseOneDependencies), []);
  assert.deepEqual(config.metrics, []);
  assert.deepEqual(config.faults, []);
  assert.deepEqual((await createPhaseOneEngine().run(config)).metrics, []);
});

test('invalid versions and numeric settings are rejected before an evaluation', () => {
  const base = { profileId: 'ai-orchestration', targets: ['temporal'], gates: ['security-baseline'] };
  assert.match(validateConfig({ ...base, version: 2 }).join(' '), /version 1/);
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    assert.match(validateConfig({ ...base, repetitions: value }).join(' '), /positive integer/);
    assert.match(validateConfig({ ...base, concurrency: [value] }).join(' '), /positive integer/);
  }
  assert.match(validateConfig({ ...base, concurrency: [] }).join(' '), /positive integer/);
  assert.match(validateConfig({ ...base, targets: ['temporal', 'temporal'] }).join(' '), /Duplicate targets/);
  assert.match(validateConfig({ ...base, unexpected: true } as never).join(' '), /Unknown configuration property/);
  assert.match(validateConfig({ ...base, seed: 1.5 }).join(' '), /Seed must be a safe integer/);
  assert.match(validateConfig({ ...base, warmup: -1 }).join(' '), /Warmup must be a non-negative integer/);
});
