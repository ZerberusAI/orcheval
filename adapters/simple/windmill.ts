import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CandidateAdapter } from '../../packages/simple/index.ts';

async function newestWindmillBundle(): Promise<string> {
  const root = resolve(process.env.ORCHEVAL_WINDMILL_EVIDENCE ?? 'results/local-docker');
  const names = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('windmill-')).map((entry) => entry.name).sort();
  if (!names.length) throw new Error(`No Windmill evidence under ${root}. Run the isolated Windmill lab first.`);
  const top = join(root, names.at(-1)!);
  const runs = (await readdir(top, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('evaluation-')).map((entry) => entry.name);
  if (runs.length !== 1) throw new Error(`Expected one evaluation bundle in ${top}.`);
  return join(top, runs[0]);
}
const adapter: CandidateAdapter = { async evaluate() {
  const bundle = await newestWindmillBundle();
  const observations = JSON.parse(await readFile(join(bundle, 'raw/observations.json'), 'utf8')) as Array<{ observations: Array<{ outcome: string }> }>;
  const runs = observations.flatMap((entry) => entry.observations);
  const reliable = runs.length === 3 && runs.every((run) => run.outcome === 'SUCCEEDED');
  const unknown = (summary: string) => ({ status: 'NOT_VALIDATED' as const, summary });
  return { id: 'windmill', name: 'Windmill', dimensions: {
    reliability: { status: reliable ? 'PASS' : 'FAIL', summary: `${runs.length} live sequential executions captured.`, evidence: { bundle } },
    security: unknown('No Windmill tenant/identity security probe has been run.'),
    performance: unknown('Three smoke executions are not a performance benchmark.'),
    cost: unknown('No dated cost evidence was captured.'),
    governance: unknown('No governance/scalability evidence was captured.'),
  } };
} };
export default adapter;
