import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseSimpleYamlConfig } from '../packages/cli/index.ts';
import { buildEnvironmentSnapshot, OrchevalEngine, validateConfig, writeEvaluationBundle, type EvaluationConfig, type EngineDependencies } from '../packages/core/index.ts';
import { createPhaseOneEngine, phaseOneDependencies } from '../packages/harness/index.ts';

async function temporaryDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'orcheval-reproduction-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const config: EvaluationConfig = {
  version: 1,
  name: 'Customer\'s "quoted" #1: C:\\evaluations\nsecond line',
  profileId: 'ai-orchestration',
  targets: ['temporal', 'hatchet', 'inngest'],
  gates: ['security-baseline'],
  metrics: ['traceability', 'latency', 'throughput'],
  repetitions: 3,
  concurrency: [1, 10, 50],
  faults: ['transient_failure', 'worker_kill'],
};

test('exported configuration validates and replays every setting with the same fingerprint', async (t) => {
  const result = await createPhaseOneEngine().run(config);
  const outputDir = await writeEvaluationBundle(result, await temporaryDirectory(t));
  const names = ['report.md', 'gates.json', 'metrics.json', 'environment.json', 'manifest.json', 'comparison.json', 'raw/observations.json', 'traces/events.json', 'config.resolved.yaml'];
  for (const name of names) assert.equal((await stat(join(outputDir, name))).isFile(), true);

  const resolved = parseSimpleYamlConfig(await readFile(join(outputDir, 'config.resolved.yaml'), 'utf8'));
  assert.deepEqual(validateConfig(resolved, phaseOneDependencies), []);
  assert.deepEqual(resolved, config);
  assert.deepEqual(result.evidence.targets.map(({ target }) => target.id), config.targets);
  assert.deepEqual(result.metrics.map(({ id }) => id), config.metrics);

  const replay = await createPhaseOneEngine().run(resolved);
  assert.deepEqual(replay.evidence.config, result.evidence.config);
  assert.equal(replay.evidence.configurationHash, result.evidence.configurationHash);
  assert.equal(replay.evidence.fingerprint, result.evidence.fingerprint);
  assert.notEqual(replay.evidence.runId, result.evidence.runId);

  const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest, { configurationHash: result.evidence.configurationHash, fingerprint: result.evidence.fingerprint, ...result.evidence.manifest });
  const report = await readFile(join(outputDir, 'report.md'), 'utf8');
  assert.match(report, /INCOMPLETE/);
  assert.match(report, /SEC-001/);
  assert.match(report, /Fingerprint: [a-f0-9]{64}/);
});

test('replay preserves defaults, empty faults, and explicitly disabled metrics', async (t) => {
  const baseDir = await temporaryDirectory(t);
  for (const metrics of [undefined, []]) {
    const result = await createPhaseOneEngine().run({ targets: ['temporal'], metrics });
    const output = await writeEvaluationBundle(result, baseDir);
    const resolved = parseSimpleYamlConfig(await readFile(join(output, 'config.resolved.yaml'), 'utf8'));
    assert.deepEqual(resolved, result.evidence.config);
    assert.deepEqual(resolved.faults, []);
    const replay = await createPhaseOneEngine().run(resolved);
    assert.equal(replay.evidence.fingerprint, result.evidence.fingerprint);
    assert.equal(replay.metrics.length, metrics === undefined ? 4 : 0);
  }
});

test('fingerprints distinguish evaluation settings but exclude the output directory', async () => {
  const baseline = await createPhaseOneEngine().run(config);
  const variants: EvaluationConfig[] = [
    { name: 'another evaluation' }, { targets: ['temporal'] }, { targets: [...config.targets!].reverse() },
    { repetitions: 2 }, { concurrency: [1, 25] }, { faults: [] }, { metrics: [] }, { metrics: ['latency'] },
  ];
  for (const variant of variants) {
    const changed = await createPhaseOneEngine().run({ ...config, ...variant });
    assert.notEqual(changed.evidence.configurationHash, baseline.evidence.configurationHash, JSON.stringify(variant));
    assert.notEqual(changed.evidence.fingerprint, baseline.evidence.fingerprint, JSON.stringify(variant));
  }
  const differentOutput = await createPhaseOneEngine().run({ ...config, outputDir: '/unused' });
  assert.equal(differentOutput.evidence.fingerprint, baseline.evidence.fingerprint);
});

test('fingerprints include profile definitions and gate, metric, runtime, adapter and SDK versions', async () => {
  const singleTarget = { ...config, targets: ['temporal'] };
  const baseline = await createPhaseOneEngine().run(singleTarget);
  const dependencies = phaseOneDependencies;
  const variants: EngineDependencies[] = [
    { ...dependencies, profiles: dependencies.profiles.map((profile) => ({ ...profile, version: '2.0.0' })) },
    { ...dependencies, profiles: dependencies.profiles.map((profile) => ({ ...profile, scenarios: profile.scenarios.map((scenario) => ({ ...scenario, description: `${scenario.description} Revised.` })) })) },
    { ...dependencies, gates: dependencies.gates.map((gate) => ({ ...gate, version: '2.0.0' })) },
    { ...dependencies, metrics: dependencies.metrics.map((metric) => ({ ...metric, version: '2.0.0' })) },
  ];
  for (const metadata of [{ version: 'runtime-2' }, { adapterVersion: 'adapter-2' }, { sdkVersions: { sdk: '2.0.0' } }, { containerImageDigests: ['sha256:example'] }]) {
    variants.push({ ...dependencies, targets: dependencies.targets.map((target) => Object.assign(Object.create(target), { metadata: async () => ({ ...await target.metadata(), ...metadata }) })) });
  }
  for (const variant of variants) {
    const changed = await new OrchevalEngine(variant).run(singleTarget);
    assert.equal(changed.evidence.configurationHash, baseline.evidence.configurationHash);
    assert.notEqual(changed.evidence.fingerprint, baseline.evidence.fingerprint);
  }

  const alternateGate = { ...dependencies.gates[0], id: 'alternate-baseline' };
  const changedSelection = await new OrchevalEngine({ ...dependencies, gates: [...dependencies.gates, alternateGate] }).run({ ...singleTarget, gates: ['alternate-baseline'] });
  assert.notEqual(changedSelection.evidence.configurationHash, baseline.evidence.configurationHash);
  assert.notEqual(changedSelection.evidence.fingerprint, baseline.evidence.fingerprint);
});

test('metadata key insertion order does not change the fingerprint', async () => {
  const run = (sdkVersions: Record<string, string>) => new OrchevalEngine({
    ...phaseOneDependencies,
    targets: phaseOneDependencies.targets.map((target) => Object.assign(Object.create(target), { metadata: async () => ({ ...await target.metadata(), sdkVersions }) })),
  }).run({ ...config, targets: ['temporal'] });
  assert.equal((await run({ worker: '1', client: '2' })).evidence.fingerprint, (await run({ client: '2', worker: '1' })).evidence.fingerprint);
});

test('environment captures actual host and framework identity without Docker access', async () => {
  const result = await createPhaseOneEngine().run({ targets: ['temporal'] });
  const environment = buildEnvironmentSnapshot(result);
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(environment.frameworkVersion, packageJson.version);
  assert.equal(environment.frameworkGitCommit, result.evidence.manifest.framework.gitCommit);
  assert.equal(environment.frameworkGitDirty, result.evidence.manifest.framework.gitDirty);
  assert.equal(environment.nodeVersion, process.version);
  assert.equal(environment.architecture, process.arch);
  assert.equal(environment.platform, process.platform);
  assert.ok((environment.ramBytes as number) > 0);
  assert.ok((environment.cpuCount as number) > 0);
  assert.equal(environment.dockerVersion, null);
  assert.equal(environment.configurationHash, result.evidence.configurationHash);
  assert.equal(environment.fingerprint, result.evidence.fingerprint);
  assert.notEqual(environment.configurationHash, environment.fingerprint);
  assert.deepEqual(result.evidence.manifest.targets[0].sdkVersions, {});

  const unknown = structuredClone(result);
  unknown.evidence.manifest.framework = { version: packageJson.version, gitCommit: null, gitDirty: null };
  unknown.evidence.manifest.targets[0].sdkVersions = null;
  const incomplete = buildEnvironmentSnapshot(unknown);
  assert.equal(incomplete.frameworkGitCommit, null);
  assert.match((incomplete.limitations as string[]).join(' '), /Git revision is unavailable/);
  assert.match((incomplete.limitations as string[]).join(' '), /metadata was not supplied/);
});

test('bundle creation rejects concurrent and subsequent overwrites without changing any artifact', async (t) => {
  const result = await createPhaseOneEngine().run({ targets: ['temporal'] });
  const baseDir = await temporaryDirectory(t);
  const attempts = await Promise.allSettled([writeEvaluationBundle(result, baseDir), writeEvaluationBundle(result, baseDir)]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = attempts.find((entry) => entry.status === 'rejected');
  assert.equal(rejected?.status, 'rejected');
  if (rejected?.status === 'rejected') assert.match(String(rejected.reason), /refusing to overwrite/);

  const output = join(baseDir, result.evidence.runId);
  const files = ['report.md', 'gates.json', 'metrics.json', 'environment.json', 'manifest.json', 'comparison.json', 'raw/observations.json', 'traces/events.json', 'config.resolved.yaml'];
  const original = await Promise.all(files.map((name) => readFile(join(output, name), 'utf8')));
  result.summary.message = 'This change must not reach the existing bundle.';
  await assert.rejects(() => writeEvaluationBundle(result, baseDir), /refusing to overwrite/);
  assert.deepEqual(await Promise.all(files.map((name) => readFile(join(output, name), 'utf8'))), original);
});

test('bundle ids cannot escape the output directory', async (t) => {
  const result = await createPhaseOneEngine().run({ targets: ['temporal'] });
  const baseDir = await temporaryDirectory(t);
  for (const id of ['', '.', '..', '../outside', '/absolute']) {
    result.evidence.runId = id;
    await assert.rejects(() => writeEvaluationBundle(result, baseDir), /single directory name/);
  }
  assert.deepEqual(await readdir(baseDir), []);
});

test('evaluations started at the same clock time have different bundle ids', async (t) => {
  t.mock.method(Date, 'now', () => 1234567890);
  const engine = createPhaseOneEngine();
  const first = await engine.run({ targets: ['temporal'] });
  const second = await engine.run({ targets: ['temporal'] });
  assert.notEqual(first.evidence.runId, second.evidence.runId);
  assert.equal(first.evidence.fingerprint, second.evidence.fingerprint);
});
