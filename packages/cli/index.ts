import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateConfig, writeEvaluationBundle, type EvaluationConfig } from '../core/index.ts';
import { createPhaseOneEngine, phaseOneDependencies } from '../harness/index.ts';

const TEMPLATE = `version: 1
evaluation:
  name: orchestration-runtime-evaluation
profile:
  id: ai-orchestration
targets:
  - temporal
  - hatchet
  - inngest
gates:
  security-baseline:
    required: true
metrics:
  latency:
    enabled: true
  throughput:
    enabled: true
  burst:
    enabled: true
  traceability:
    enabled: true
runs:
  repetitions: 3
load:
  concurrency:
    - 1
    - 10
faults:
  - transient_failure
  - worker_kill
`;

function unquote(value: string): string { return value.trim().replace(/^['"]|['"]$/g, ''); }

/** Parses the documented Phase 1 configuration subset and retains its nested list structure. */
export function parseSimpleYamlConfig(content: string): EvaluationConfig {
  const config: EvaluationConfig = {};
  let section = '';
  let activeList = '';
  for (const sourceLine of content.split(/\r?\n/)) {
    const withoutComment = sourceLine.replace(/\s+#.*$/, '');
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    const line = withoutComment.trim();
    if (indent === 0 && line.endsWith(':')) { section = line.slice(0, -1); activeList = section === 'targets' || section === 'faults' ? section : ''; continue; }
    if (line.startsWith('- ')) {
      const value = unquote(line.slice(2));
      if (activeList === 'targets') (config.targets ??= []).push(value);
      if (activeList === 'faults') (config.faults ??= []).push(value);
      if (activeList === 'concurrency') (config.concurrency ??= []).push(Number(value));
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = unquote(rawValue);
    if (section === 'profile' && key === 'id') config.profileId = value;
    else if (section === 'runs' && key === 'repetitions') config.repetitions = Number(value);
    else if (section === 'gates' && indent === 2 && rawValue === '') (config.gates ??= []).push(key);
    else if (section === 'metrics' && indent === 2 && rawValue === '') activeList = `metric:${key}`;
    else if (section === 'metrics' && indent >= 4 && key === 'enabled' && value === 'true' && activeList.startsWith('metric:')) (config.metrics ??= []).push(activeList.slice(7));
    else if (section === 'load' && key === 'concurrency') activeList = 'concurrency';
    else if (section === 'evaluation' && key === 'name') config.name = value;
    else if (key === 'version' && indent === 0) config.version = Number(value);
  }
  return config;
}

function usage(): string { return 'Usage: orcheval <init [evaluation.yaml]|list <targets|profiles>|validate <evaluation.yaml>|run <evaluation.yaml> [--output <directory>]|report <result-directory>>'; }

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === 'init') {
    const path = rest[0] ?? 'evaluation.yaml';
    try { await access(path); throw new Error(`${path} already exists; refusing to overwrite it.`); }
    catch (error: unknown) { if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error; }
    await writeFile(path, TEMPLATE);
    console.log(`Created ${path}.`);
    return;
  }
  if (command === 'list') {
    if (rest[0] === 'targets') console.log(JSON.stringify(phaseOneDependencies.targets.map((target) => target.id), null, 2));
    else if (rest[0] === 'profiles') console.log(JSON.stringify(phaseOneDependencies.profiles.map((profile) => profile.id), null, 2));
    else console.log('Usage: orcheval list <targets|profiles>');
    return;
  }
  if (command === 'report') {
    const path = rest[0];
    if (!path) { console.log('Usage: orcheval report <result-directory>'); return; }
    console.log(await readFile(resolve(path, 'report.md'), 'utf8'));
    return;
  }
  if (command !== 'validate' && command !== 'run') { console.log(usage()); return; }
  const filePath = rest[0];
  if (!filePath) { console.log(`Usage: orcheval ${command} <evaluation.yaml>`); return; }
  const content = await readFile(filePath, 'utf8');
  const config = parseSimpleYamlConfig(content);
  const errors = validateConfig(config, phaseOneDependencies);
  if (errors.length) throw new Error(`Configuration is invalid:\n- ${errors.join('\n- ')}`);
  if (command === 'validate') { console.log('Configuration is valid.'); return; }
  const outputFlag = rest.indexOf('--output');
  const outputDir = outputFlag >= 0 ? rest[outputFlag + 1] : resolve(dirname(filePath), 'results');
  if (!outputDir) throw new Error('Missing directory after --output.');
  const result = await createPhaseOneEngine().run(config);
  const bundle = await writeEvaluationBundle(result, outputDir);
  console.log(`${result.summary.status}: ${result.summary.message}\nResult bundle: ${bundle}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) void runCli(process.argv.slice(2)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
