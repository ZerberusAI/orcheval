# Writing an adapter

An adapter implements the public evaluation-target contract with context-specific semantics for the runtime under test.

At minimum, an adapter must provide the `EvaluationTarget` contract:

- metadata;
- setup;
- health checks;
- execution and cancellation;
- observation of completed executions;
- teardown.

Metadata must identify whether the target is `LIVE` or `SIMULATED`. Simulators are
useful for contract and CLI testing, but must not be used to validate a runtime or
to produce admissibility claims. A live adapter must attach captured observations
for each execution, including tenant and correlation identifiers, step attempts,
outcome, retries, cancellation effects and audit-trail completeness.

Adapter-specific concepts belong inside the adapter, not in the framework core.

## Live runner protocol

The bundled reference targets can invoke an adapter runner when an environment
variable such as `ORCHEVAL_TEMPORAL_RUNNER` contains the runner executable. Optional
arguments are supplied as a JSON string array in `ORCHEVAL_TEMPORAL_RUNNER_ARGS`.
Orcheval starts the executable directly, without a shell, and sends one JSON request
on standard input. The runner writes one JSON response to standard output.

Supported actions are `metadata`, `setup`, `health`, `execute`, `signal`, `cancel`,
`observe`, and `teardown`. The `observe` response must satisfy
`ExecutionObservation`, including the eight security evidence fields:
`crossTenantLeakDetected`, `secretExposureDetected`,
`identitySubstitutionAllowed`, `duplicateSideEffects`,
`cancellationAffectedUnrelatedWork`, `auditTrailComplete`,
`recoverySkippedSteps`, and the execution's tenant/correlation identifiers.

A configured runner is marked `LIVE`; absent configuration retains the deterministic
local simulator. The runner is the boundary where an official Temporal, Hatchet, or
Inngest SDK implementation belongs.
