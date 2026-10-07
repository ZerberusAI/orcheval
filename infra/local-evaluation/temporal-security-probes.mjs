import { Client, Connection } from '@temporalio/client';
import { mkdir, writeFile } from 'node:fs/promises';

const address = process.env.TEMPORAL_ADDRESS;
const connection = await Connection.connect({ address, connectTimeout: '5 seconds' });
const client = new Client({ connection, namespace: 'default' });
const taskQueue = 'orcheval-phase1-sequential';
const suffix = `${Date.now()}-${process.pid}`;
const victimId = `security-victim-${suffix}`;
const controlId = `security-control-${suffix}`;
const victim = { id: victimId, tenantId: 'tenant-victim', correlationId: victimId, faults: [] };
const control = { id: controlId, tenantId: 'tenant-control', correlationId: controlId, faults: [] };

function finding(id, status, details) { return { id, status, details }; }

try {
  // The client below deliberately represents an unrelated principal. Dev-mode
  // Temporal applies no authentication/authorization to this namespace.
  const victimHandle = await client.workflow.start('coreV1', { workflowId: victimId, taskQueue, args: [victim, 'ORCH-06'], workflowExecutionTimeout: '60 seconds' });
  const snapshot = await victimHandle.query('snapshot');
  const tenantReadable = snapshot?.execution?.tenantId === victim.tenantId;

  const controlHandle = await client.workflow.start('coreV1', { workflowId: controlId, taskQueue, args: [control, 'ORCH-01'], workflowExecutionTimeout: '60 seconds' });
  await controlHandle.result();

  let cancelAccepted = false;
  try { await client.workflow.getHandle(victimId).cancel(); cancelAccepted = true; } catch { /* a protected namespace should reject this */ }
  let victimCancelled = false;
  try { await victimHandle.result(); } catch { victimCancelled = true; }
  const controlResult = await controlHandle.result();
  const history = await victimHandle.fetchHistory();
  const auditComplete = (history.events ?? []).some((event) => event.workflowExecutionStartedEventAttributes !== undefined)
    && (history.events ?? []).some((event) => event.workflowExecutionCancelRequestedEventAttributes !== undefined);

  const findings = [
    finding('SEC-001', tenantReadable ? 'FAIL' : 'PASS', tenantReadable ? 'An unrelated client read the victim tenant workflow snapshot.' : 'Cross-tenant read was rejected.'),
    finding('SEC-002', 'NOT_VALIDATED', 'Secret-sentinel/log-redaction probe is not implemented in this lab.'),
    finding('SEC-003', 'NOT_VALIDATED', 'Retry safety is captured by the separate core-v1 workload run, not this authorization probe.'),
    finding('SEC-004', cancelAccepted && victimCancelled ? 'FAIL' : 'PASS', cancelAccepted && victimCancelled ? 'An unrelated client cancelled the victim workflow.' : 'Cross-identity cancellation was rejected.'),
    finding('SEC-005', controlResult?.output === `order:${control.tenantId}:${control.id}:ORCH-01` ? 'PASS' : 'FAIL', 'The unrelated control workflow completed with its expected output.'),
    finding('SEC-006', auditComplete ? 'PASS' : 'FAIL', auditComplete ? 'Temporal history retained workflow start and cancellation-request events.' : 'Required audit events were absent from history.'),
    finding('SEC-007', 'NOT_VALIDATED', 'Physical worker-loss recovery is not evaluated by this authorization probe.'),
    finding('SEC-008', tenantReadable ? 'FAIL' : 'PASS', tenantReadable ? 'An unrelated client read another run through the shared namespace.' : 'Cross-run read was rejected.'),
  ];
  const overall = findings.some(({ status }) => status === 'FAIL') ? 'FAIL' : findings.some(({ status }) => status === 'NOT_VALIDATED') ? 'INCOMPLETE' : 'PASS';
  const evidence = { target: 'temporal', mode: 'LIVE', scope: 'local-dev namespace authorization negative control', capturedAt: new Date().toISOString(), overall, findings, limitations: ['This proves the posture of the disposable Temporal dev server and shared namespace, not a hardened Temporal deployment.'] };
  await mkdir('/results', { recursive: true });
  await writeFile('/results/temporal-security-probes.json', JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(`${overall}: ${findings.filter(({ status }) => status === 'FAIL').map(({ id }) => id).join(',') || 'no failures'}\n`);
} finally {
  await connection.close();
}
