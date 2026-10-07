/** Provider adapters may attach this only when the source and effective date are recorded. */
export interface CostEvidence { currency: string; amount: number; effectiveAt: string; source: string; }

export function validCostEvidence(value: CostEvidence | undefined): value is CostEvidence {
  return Boolean(value && /^[A-Z]{3}$/.test(value.currency) && Number.isFinite(value.amount) && value.amount >= 0 && Number.isFinite(Date.parse(value.effectiveAt)) && value.source.trim());
}
