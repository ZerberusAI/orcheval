import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateConfig, writeEvaluationBundle, type EvaluationConfig } from '../core/index.ts';
import { createPhaseOneEngine, phaseOneDependencies } from '../harness/index.ts';
import { runSimpleFile } from '../simple/index.ts';

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
  resources:
    enabled: true
  cost:
    enabled: true
runs:
  repetitions: 3
  warmup: 1
  seed: 20261007
load:
  concurrency:
    - 1
    - 10
faults:
  - transient_failure
  - worker_kill
`;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed) as string;
  if (trimmed.startsWith("'")) {
    if (trimmed.length < 2 || !trimmed.endsWith("'")) throw new Error('Unterminated YAML string.');
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function stripComment(line: string): string {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote === '"' && char === '\\') { index += 1; continue; }
    if (quote === "'" && char === "'" && line[index + 1] === "'") { index += 1; continue; }
    if (quote && char === quote) quote = '';
    else if (!quote && (char === '"' || char === "'")) {
      const prefix = line.slice(0, index).trim();
      if (!prefix || prefix === '-' || prefix.endsWith(':')) quote = char;
    }
    else if (!quote && char === '#' && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index);
  }
  return line;
}

/** Parses the documented Phase 1 configuration subset and retains its nested list structure. */
export function parseSimpleYamlConfig(content: string): EvaluationConfig {
  const config: EvaluationConfig = {};
  let section = '';
  let activeList = '';
  for (const sourceLine of content.split(/\r?\n/)) {
    const withoutComment = stripComment(sourceLine);
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    const line = withoutComment.trim();
    if (line.startsWith('- ')) {
      const value = unquote(line.slice(2));
      if (activeList === 'targets') (config.targets ??= []).push(value);
      if (activeList === 'faults') (config.faults ??= []).push(value);
      if (activeList === 'concurrency') (config.concurrency ??= []).push(Number(value));
      continue;
    }
    const match = line.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, rawKey, rawValue] = match;
    const key = unquote(rawKey);
    if (indent === 0) {
      section = key;
      activeList = key === 'targets' || key === 'faults' ? key : '';
      if (key === 'targets' || key === 'faults' || key === 'gates' || key === 'metrics') {
        if (rawValue !== '' && rawValue !== '[]') throw new Error(`${key} must use the documented YAML block format or [].`);
        config[key] = [];
      }
      if (rawValue === '' || rawValue === '[]') continue;
    }
    const value = unquote(rawValue);
    if (section === 'profile' && key === 'id') config.profileId = value;
    else if (section === 'runs' && key === 'repetitions') config.repetitions = Number(value);
    else if (section === 'runs' && key === 'warmup') config.warmup = Number(value);
    else if (section === 'runs' && key === 'seed') config.seed = Number(value);
    else if (section === 'gates' && indent === 2 && rawValue === '') (config.gates ??= []).push(key);
    else if (section === 'metrics' && indent === 2 && rawValue === '') activeList = `metric:${key}`;
    else if (section === 'metrics' && indent >= 4 && key === 'enabled' && value === 'true' && activeList.startsWith('metric:')) (config.metrics ??= []).push(activeList.slice(7));
    else if (section === 'load' && key === 'concurrency') {
      if (rawValue !== '' && rawValue !== '[]') throw new Error('Concurrency must use a YAML block list.');
      config.concurrency = [];
      activeList = 'concurrency';
    }
    else if (section === 'evaluation' && key === 'name') config.name = value;
    else if (key === 'version' && indent === 0) config.version = Number(value);
  }
  return config;
}

function usage(): string { return 'Usage: orcheval <init [evaluation.yaml]|list <targets|profiles>|doctor [target]|validate <evaluation.yaml>|run <evaluation.yaml> [--output <directory>]|report <result-directory>>'; }

export async function runCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === 'simple-run') { const file = rest[0]; if (!file) throw new Error('Usage: orcheval simple-run <evaluation.json>'); console.log(`Result: ${await runSimpleFile(file)}`); return; }
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
  if (command === 'doctor') {
    const requestedTarget = rest[0];
    const targets = requestedTarget ? phaseOneDependencies.targets.filter((target) => target.id === requestedTarget) : phaseOneDependencies.targets;
    if (requestedTarget && targets.length === 0) throw new Error(`Unknown target: ${requestedTarget}.`);
    const diagnosis = await Promise.all(targets.map(async (target) => {
      const metadata = await target.metadata();
      const health = await target.health();
      return { id: metadata.id, displayName: metadata.displayName, mode: metadata.mode, version: metadata.version, healthy: health.healthy, details: health.details, capabilities: metadata.capabilities };
    }));
    console.log(JSON.stringify(diagnosis, null, 2));
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
