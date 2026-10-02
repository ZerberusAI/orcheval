import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeEvaluationBundle } from '../packages/core/index.ts';
import { createPhaseOneEngine } from '../packages/harness/index.ts';

test('writes a reproducible evaluation bundle and markdown report', async () => {
  const result = await createPhaseOneEngine().run({
    profileId: 'ai-orchestration',
    targets: ['temporal', 'hatchet', 'inngest'],
    gates: ['security-baseline'],
    metrics: ['latency', 'throughput', 'traceability'],
    repetitions: 3,
  });

  const baseDir = await mkdtemp(join(tmpdir(), 'orcheval-phase1-'));
  const outputDir = await writeEvaluationBundle(result, baseDir);

  const reportStats = await stat(join(outputDir, 'report.md'));
  const gatesStats = await stat(join(outputDir, 'gates.json'));
  const metricsStats = await stat(join(outputDir, 'metrics.json'));
  const environmentStats = await stat(join(outputDir, 'environment.json'));
  const rawStats = await stat(join(outputDir, 'raw', 'observations.json'));
  const resolvedConfigStats = await stat(join(outputDir, 'config.resolved.yaml'));

  assert.equal(reportStats.isFile(), true);
  assert.equal(gatesStats.isFile(), true);
  assert.equal(metricsStats.isFile(), true);
  assert.equal(environmentStats.isFile(), true);
  assert.equal(rawStats.isFile(), true);
  assert.equal(resolvedConfigStats.isFile(), true);

  const report = await readFile(join(outputDir, 'report.md'), 'utf8');
  assert.match(report, /ai-orchestration/);
  assert.match(report, /INCOMPLETE/i);
  assert.match(report, /SEC-001/i);
  assert.match(report, /Fingerprint: [a-f0-9]{64}/);
});
