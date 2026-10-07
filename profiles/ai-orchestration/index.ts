import type { WorkloadProfile } from '../../packages/core/index.ts';

export const aiOrchestrationProfile: WorkloadProfile = {
  id: 'ai-orchestration',
  version: '1.0.0',
  scenarios: [
    { id: 'ORCH-01', description: 'Sequential request, context, policy, retrieval, model and validation workflow.', required: true, kind: 'sequential' },
    { id: 'ORCH-02', description: 'Parallel tool fan-out followed by aggregation and synthesis.', required: true, kind: 'fan-out' },
    { id: 'ORCH-03', description: 'Tenant burst alongside normal and latency-sensitive tenants.', required: true, kind: 'tenant-burst' },
    { id: 'ORCH-04', description: 'Retry after a consequential mock operation.', required: true, kind: 'retry-idempotency' },
    { id: 'ORCH-05', description: 'Controlled recoverable worker-side activity fault; physical worker loss is a separate probe.', required: true, kind: 'worker-failure' },
    { id: 'ORCH-06', description: 'Wait for an external approval signal and resume.', required: true, kind: 'approval-resume', lifecycle: { action: 'signal', at: 'WAITING', signal: { name: 'approve', payload: { approved: true } } } },
    { id: 'ORCH-07', description: 'Cancellation of queued, running and waiting work.', required: true, kind: 'cancellation', lifecycle: { action: 'cancel', at: 'WAITING' } },
    { id: 'ORCH-08', description: 'Burst/load execution at configured concurrency.', required: true, kind: 'load' },
    { id: 'ORCH-09', description: 'Realistically sized execution-context handling.', required: true, kind: 'context' },
    { id: 'ORCH-10', description: 'Resume after an implementation version change.', required: true, kind: 'version-change' },
  ],
};
