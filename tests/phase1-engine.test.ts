import test from 'node:test';
import assert from 'node:assert/strict';

import { type EvaluationConfig } from '../packages/core/index.ts';
import { createPhaseOneEngine } from '../packages/harness/index.ts';

test('Phase 1 engine executes every profile scenario but does not claim simulated targets are admissible', async () => {
  const config: EvaluationConfig = {
    profileId: 'ai-orchestration',
    targets: ['temporal', 'hatchet', 'inngest'],
    gates: ['security-baseline'],
    metrics: ['latency', 'throughput', 'traceability'],
    repetitions: 2,
  };

  const result = await createPhaseOneEngine().run(config);

  assert.equal(result.profileId, 'ai-orchestration');
  assert.equal(result.summary.status, 'INCOMPLETE');
  assert.equal(result.summary.eligible, false);
  assert.equal(result.gates.length, 1);
  assert.equal(result.gates[0].status, 'NOT_VALIDATED');
  assert.equal(result.metrics.length, 3);
  assert.equal(result.evidence.targets.length, 3);
  assert.equal(result.evidence.targets[0].observations.length, 20);
});

test('Phase 1 engine rejects unknown targets instead of producing a result', async () => {
  await assert.rejects(
    () => createPhaseOneEngine().run({ profileId: 'ai-orchestration', targets: ['unknown'], gates: ['security-baseline'] }),
    /Unknown target: unknown/,
  );
});
