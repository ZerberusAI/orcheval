import type { CandidateAdapter, CandidateResult, Dimension } from '../../packages/simple/index.ts';
const unknown = (summary: string) => ({ status: 'NOT_VALIDATED' as const, summary });
function candidate(id: string, name: string): CandidateResult {
  const dimensions = Object.fromEntries((['reliability', 'security', 'performance', 'cost', 'governance'] as Dimension[]).map((d) => [d, unknown('Local contract simulator only; attach a live adapter for evidence.')])) as CandidateResult['dimensions'];
  return { id, name, dimensions };
}
const adapter: CandidateAdapter = { async evaluate() { return candidate('contract-baseline', 'Contract baseline'); } };
export default adapter;
