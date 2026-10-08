import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIMENSIONS = ['reliability', 'security', 'performance', 'cost', 'governance'] as const;
export type Dimension = typeof DIMENSIONS[number];
export type Status = 'PASS' | 'FAIL' | 'NOT_VALIDATED';
export interface DimensionEvidence { status: Status; summary: string; evidence?: Record<string, unknown>; }
export interface CandidateResult { id: string; name: string; dimensions: Record<Dimension, DimensionEvidence>; }
export interface CandidateAdapter { evaluate(): Promise<CandidateResult>; }
export interface SimpleConfig { version: 1; name: string; adapters: string[]; weights?: Partial<Record<Dimension, number>>; outputDir?: string; }

const defaults: Record<Dimension, number> = { reliability: 5, security: 4, performance: 3, cost: 2, governance: 1 };
function valid(result: CandidateResult): string[] {
  const errors: string[] = [];
  if (!result.id || !result.name) errors.push('Candidate must have id and name.');
  for (const dimension of DIMENSIONS) if (!result.dimensions?.[dimension] || !['PASS', 'FAIL', 'NOT_VALIDATED'].includes(result.dimensions[dimension].status)) errors.push(`${result.id}: invalid ${dimension} evidence.`);
  return errors;
}
export async function runSimple(config: SimpleConfig): Promise<{ results: CandidateResult[]; report: string }> {
  if (config.version !== 1 || !config.adapters.length) throw new Error('Simple evaluation needs version 1 and at least one adapter.');
  const results: CandidateResult[] = [];
  for (const adapterPath of config.adapters) {
    const module = await import(pathToFileURL(resolve(adapterPath)).href) as { default?: CandidateAdapter; adapter?: CandidateAdapter };
    const adapter = module.default ?? module.adapter;
    if (!adapter?.evaluate) throw new Error(`${adapterPath} must export default or adapter with evaluate().`);
    const result = await adapter.evaluate(); const errors = valid(result); if (errors.length) throw new Error(errors.join(' ')); results.push(result);
  }
  const weights = { ...defaults, ...config.weights };
  const rows = results.map((result) => {
    const admissible = (['reliability', 'security'] as Dimension[]).every((d) => result.dimensions[d].status === 'PASS');
    const score = DIMENSIONS.reduce((total, d) => total + (result.dimensions[d].status === 'PASS' ? weights[d] : 0), 0);
    return { result, admissible, score };
  });
  const report = ['# Simple orchestration evaluation', '', `Name: ${config.name}`, '', '| Framework | Reliability | Security | Performance | Cost | Governance | Admissible | Score |', '| --- | --- | --- | --- | --- | --- | --- | ---: |', ...rows.map(({ result, admissible, score }) => `| ${result.name} | ${result.dimensions.reliability.status} | ${result.dimensions.security.status} | ${result.dimensions.performance.status} | ${result.dimensions.cost.status} | ${result.dimensions.governance.status} | ${admissible ? 'yes' : 'no'} | ${score} |`), '', 'Scores are secondary to reliability/security admissibility. `NOT_VALIDATED` is never a pass.'].join('\n');
  return { results, report };
}
export async function runSimpleFile(path: string): Promise<string> {
  const config = JSON.parse(await readFile(path, 'utf8')) as SimpleConfig;
  const { results, report } = await runSimple(config);
  const base = config.outputDir ? resolve(config.outputDir) : resolve(dirname(path), 'simple-results');
  await mkdir(base, { recursive: true });
  const stem = `evaluation-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await writeFile(resolve(base, `${stem}.json`), JSON.stringify({ config, results }, null, 2) + '\n', { flag: 'wx' });
  await writeFile(resolve(base, `${stem}.md`), report + '\n', { flag: 'wx' });
  return resolve(base, `${stem}.md`);
}
