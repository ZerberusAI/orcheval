import type { EvaluationEvidence, MetricPlugin, MetricResult } from '../../packages/core/index.ts';
import { validCostEvidence } from '../../packages/instrumentation/cost.ts';

function isLive(evidence: EvaluationEvidence): boolean { return evidence.targets.every(({ target }) => target.mode === 'LIVE'); }
function observations(evidence: EvaluationEvidence) { return evidence.targets.flatMap((target) => target.observations); }
function hasMeasuredObservations(evidence: EvaluationEvidence): boolean { return evidence.targets.length > 0 && evidence.targets.every((target) => target.health.healthy && target.observations.length > 0); }
function elapsedMs(startedAt: string, endedAt: string): number { return Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)); }
function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(quantile * ordered.length) - 1)];
}
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function result(id: string, evidence: EvaluationEvidence, raw: Record<string, number | string | boolean>): MetricResult {
  const live = isLive(evidence);
  const measured = hasMeasuredObservations(evidence);
  if (!measured) return { id, status: 'NOT_VALIDATED', raw, confidence: 'LOW', limitations: ['No complete set of healthy target observations was captured; no metric is claimed.'] };
  return { id, status: live ? 'PASS' : 'WARN', raw, confidence: 'LOW', limitations: live ? ['One local run is raw evidence, not a cross-provider performance score.'] : ['Measurements were produced by deterministic local simulators and are not vendor benchmark results.'] };
}

export const latencyMetric: MetricPlugin = {
  id: 'latency', version: '1.0.0', requirements: () => ['execution timestamps'],
  async evaluate(evidence) {
    const values = observations(evidence).map((entry) => elapsedMs(entry.startedAt, entry.endedAt));
    const averageMs = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return result('latency', evidence, { averageExecutionMs: averageMs, p50ExecutionMs: percentile(values, 0.5), p95ExecutionMs: percentile(values, 0.95), p99ExecutionMs: percentile(values, 0.99), standardDeviationMs: standardDeviation(values), sampleCount: values.length });
  },
};

export const throughputMetric: MetricPlugin = {
  id: 'throughput', version: '1.0.0', requirements: () => ['execution observations'],
  async evaluate(evidence) {
    const count = observations(evidence).filter((entry) => entry.outcome === 'SUCCEEDED').length;
    return result('throughput', evidence, { completedExecutions: count, configuredConcurrency: evidence.config.concurrency.join(',') });
  },
};

export const burstMetric: MetricPlugin = {
  id: 'burst', version: '1.0.0', requirements: () => ['tenant identifiers', 'execution observations'],
  async evaluate(evidence) {
    const tenantIds = new Set(observations(evidence).map((entry) => entry.tenantId));
    const failures = observations(evidence).filter((entry) => entry.outcome === 'FAILED').length;
    return result('burst', evidence, { tenantsObserved: tenantIds.size, failedExecutions: failures });
  },
};

export const traceabilityMetric: MetricPlugin = {
  id: 'traceability', version: '1.0.0', requirements: () => ['correlation identifiers', 'step observations'],
  async evaluate(evidence) {
    const entries = observations(evidence);
    const complete = entries.filter((entry) => entry.correlationId.length > 0 && entry.auditTrailComplete && entry.steps.length > 0).length;
    if (!hasMeasuredObservations(evidence) || entries.some((entry) => entry.auditTrailComplete === null)) return { id: 'traceability', status: 'NOT_VALIDATED', raw: { completeTraces: complete, sampleCount: entries.length }, confidence: 'LOW', limitations: ['Audit-trail completeness requires a dedicated trace-integrity probe.'] };
    return { ...result('traceability', evidence, { completeTraces: complete, sampleCount: entries.length }), status: complete === entries.length ? (isLive(evidence) ? 'PASS' : 'WARN') : 'WARN' };
  },
};

export const resourceMetric: MetricPlugin = {
  id: 'resources', version: '1.0.0', requirements: () => ['process resource snapshots'],
  async evaluate(evidence) {
    const entries = observations(evidence);
    const samples = entries.filter((entry) => entry.resources);
    const cpuMicros = samples.reduce((sum, entry) => sum + entry.resources!.cpuUserMicros + entry.resources!.cpuSystemMicros, 0);
    return { id: 'resources', status: entries.length > 0 && samples.length === entries.length ? 'WARN' : 'NOT_VALIDATED', raw: { sampleCount: samples.length, cpuMicros, averageRssBytes: samples.length ? samples.reduce((sum, entry) => sum + entry.resources!.rssBytes, 0) / samples.length : 0 }, confidence: 'LOW', limitations: ['Snapshots measure the shared Orcheval process, not isolated provider/container resource consumption.'] };
  },
};

export const costMetric: MetricPlugin = {
  id: 'cost', version: '1.0.0', requirements: () => ['dated provider cost evidence'],
  async evaluate(evidence) {
    const costs = observations(evidence).map((entry) => entry.cost).filter(validCostEvidence);
    const currencies = new Set(costs.map(({ currency }) => currency));
    if (!costs.length || currencies.size !== 1) {
      const missing: MetricResult = { id: 'cost', status: 'NOT_VALIDATED', raw: { sampleCount: costs.length }, confidence: 'LOW', limitations: ['No complete, single-currency, dated provider cost evidence was supplied.'] };
      return missing;
    }
    const measured: MetricResult = { id: 'cost', status: 'WARN', raw: { currency: costs[0].currency, totalAmount: costs.reduce((sum, entry) => sum + entry.amount, 0), sampleCount: costs.length }, confidence: 'LOW', limitations: ['Cost evidence is adapter-supplied and must be reviewed against the recorded source and effective date.'] };
    return measured;
  },
};

export const phaseOneMetrics: MetricPlugin[] = [latencyMetric, throughputMetric, burstMetric, traceabilityMetric, resourceMetric, costMetric];
