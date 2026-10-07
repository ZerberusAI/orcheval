import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const provider = process.env.ORCHEVAL_PROVIDER;
const bases = { dbos: process.env.DBOS_SERVICE_URL, bullmq: process.env.BULLMQ_SERVICE_URL, prefect: process.env.PREFECT_SERVICE_URL };
const base = bases[provider];
if (!base) throw new Error(`Unsupported security probe provider: ${provider}.`);
const suffix = `${Date.now()}-${process.pid}`;
const execution = (role) => ({ id: `security-${provider}-${role}-${suffix}`, tenantId: `${role}-tenant`, correlationId: `security-${provider}-${role}-${suffix}`, faults: [] });
const victim = execution('victim');
const control = execution('control');

async function request(path, options = {}) { return fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } }); }
for (let attempt = 0; attempt < 50; attempt += 1) {
  try { const health = await request('/health'); if (health.ok) break; } catch { /* service is still starting */ }
  if (attempt === 49) throw new Error('Service did not become healthy within 10 seconds.');
  await delay(200);
}
async function observe(id) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await request(`/observe/${encodeURIComponent(id)}`);
    if (!response.ok) return { response, body: null };
    const body = await response.json();
    const terminal = provider === 'dbos' ? body.status?.status === 'SUCCESS' : provider === 'bullmq' ? body.job?.state === 'completed' : body.flowRun?.state?.type === 'COMPLETED';
    if (terminal) return { response, body };
    await delay(100);
  }
  throw new Error(`Timed out observing ${id}.`);
}
function finding(id, status, details) { return { id, status, details }; }

const victimStart = await request('/execute', { method: 'POST', body: JSON.stringify(victim) });
if (!victimStart.ok) throw new Error(`Victim submission returned HTTP ${victimStart.status}.`);
const controlStart = await request('/execute', { method: 'POST', body: JSON.stringify(control) });
if (!controlStart.ok) throw new Error(`Control submission returned HTTP ${controlStart.status}.`);

// Deliberately no Authorization header: the attacker is an unauthenticated caller.
const read = await request(`/observe/${encodeURIComponent(victim.id)}`);
const readAllowed = read.ok;
let cancel = { status: 0, ok: false };
if (provider === 'dbos') {
  const response = await request(`/cancel/${encodeURIComponent(victim.id)}`, { method: 'PATCH' });
  cancel = { status: response.status, ok: response.ok };
}
const controlObserved = await observe(control.id);
const controlComplete = controlObserved.response.ok;
const findings = [
  finding('SEC-001', readAllowed ? 'FAIL' : 'PASS', readAllowed ? 'An unauthenticated caller read a tenant workflow/job record.' : 'Unauthenticated read was rejected.'),
  finding('SEC-002', 'NOT_VALIDATED', 'Secret-sentinel/log-redaction probe is outside this service-control-plane test.'),
  finding('SEC-003', 'NOT_VALIDATED', 'Retry/idempotency probe is outside this service-control-plane test.'),
  finding('SEC-004', provider === 'dbos' ? (cancel.ok ? 'FAIL' : 'PASS') : 'NOT_VALIDATED', provider === 'dbos' ? (cancel.ok ? 'Unauthenticated caller invoked the workflow cancellation route.' : `Unauthenticated cancellation was rejected with HTTP ${cancel.status}.`) : 'This façade does not expose a cancellation route in the evaluated configuration.'),
  finding('SEC-005', controlComplete ? 'PASS' : 'FAIL', controlComplete ? 'An unrelated control workflow/job completed after the victim-side action.' : 'Unrelated control workflow/job did not complete.'),
  finding('SEC-006', 'NOT_VALIDATED', 'No authenticated audit-history query is exposed by this disposable façade.'),
  finding('SEC-007', 'NOT_VALIDATED', 'Physical worker-loss recovery is not evaluated by this service-control-plane test.'),
  finding('SEC-008', readAllowed ? 'FAIL' : 'PASS', readAllowed ? 'An unauthenticated caller read another execution through the shared service façade.' : 'Cross-run read was rejected.'),
];
const overall = findings.some(({ status }) => status === 'FAIL') ? 'FAIL' : findings.some(({ status }) => status === 'NOT_VALIDATED') ? 'INCOMPLETE' : 'PASS';
await mkdir('/results', { recursive: true });
await writeFile(`/results/${provider}-security-probes.json`, JSON.stringify({ target: provider, mode: 'LIVE', scope: 'disposable unauthenticated service façade negative control', capturedAt: new Date().toISOString(), overall, findings, limitations: ['This evaluates the lab service façade and its deployment defaults, not a hardened production topology.'] }, null, 2) + '\n');
process.stdout.write(`${provider} ${overall}\n`);
