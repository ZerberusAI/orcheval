import type { EvaluationEvidence, MetricPlugin, MetricResult } from '../../packages/core/index.ts';

function isLive(evidence: EvaluationEvidence): boolean { return evidence.targets.every(({ target }) => target.mode === 'LIVE'); }
function observations(evidence: EvaluationEvidence) { return evidence.targets.flatMap((target) => target.observations); }
function elapsedMs(startedAt: string, endedAt: string): number { return Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)); }

function result(id: string, evidence: EvaluationEvidence, raw: Record<string, number | string | boolean>, normalised: number): MetricResult {
  const live = isLive(evidence);
  return { id, status: live ? 'PASS' : 'WARN', raw, normalised, score: normalised, confidence: live ? 'HIGH' : 'LOW', limitations: live ? [] : ['Measurements were produced by deterministic local simulators and are not vendor benchmark results.'] };
}

export const latencyMetric: MetricPlugin = {
  id: 'latency', requirements: () => ['execution timestamps'],
  async evaluate(evidence) {
    const values = observations(evidence).map((entry) => elapsedMs(entry.startedAt, entry.endedAt));
    const averageMs = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return result('latency', evidence, { averageExecutionMs: averageMs, sampleCount: values.length }, Math.max(0, Math.min(1, 1 - averageMs / 1000)));
  },
};

export const throughputMetric: MetricPlugin = {
  id: 'throughput', requirements: () => ['execution observations'],
  async evaluate(evidence) {
    const count = observations(evidence).filter((entry) => entry.outcome === 'SUCCEEDED').length;
    return result('throughput', evidence, { completedExecutions: count, configuredConcurrency: evidence.config.concurrency.join(',') }, Math.min(1, count / Math.max(1, evidence.targets.length * 10)));
  },
};

export const burstMetric: MetricPlugin = {
  id: 'burst', requirements: () => ['tenant identifiers', 'execution observations'],
  async evaluate(evidence) {
    const tenantIds = new Set(observations(evidence).map((entry) => entry.tenantId));
    const failures = observations(evidence).filter((entry) => entry.outcome === 'FAILED').length;
    return result('burst', evidence, { tenantsObserved: tenantIds.size, failedExecutions: failures }, failures === 0 && tenantIds.size >= 3 ? 1 : 0);
  },
};

export const traceabilityMetric: MetricPlugin = {
  id: 'traceability', requirements: () => ['correlation identifiers', 'step observations'],
  async evaluate(evidence) {
    const entries = observations(evidence);
    const complete = entries.filter((entry) => entry.correlationId.length > 0 && entry.auditTrailComplete && entry.steps.length > 0).length;
    return result('traceability', evidence, { completeTraces: complete, sampleCount: entries.length }, entries.length ? complete / entries.length : 0);
  },
};

export const phaseOneMetrics: MetricPlugin[] = [latencyMetric, throughputMetric, burstMetric, traceabilityMetric];
