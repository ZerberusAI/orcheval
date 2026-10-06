# Writing an adapter

An adapter implements the public evaluation-target contract with context-specific semantics for the runtime under test.

At minimum, an adapter must provide the `EvaluationTarget` contract:

- metadata;
- setup;
- health checks;
- execution and cancellation;
- observation of pending and completed executions;
- teardown.

Metadata must identify whether the target is `LIVE` or `SIMULATED`. Simulators are
useful for contract and CLI testing, but must not be used to validate a runtime or
to produce admissibility claims. A live adapter must attach captured observations
for each execution, including tenant and correlation identifiers, step attempts,
outcome, retries, cancellation effects and audit-trail completeness.

For reproducibility, metadata may additionally include `adapterVersion`,
`sdkVersions` (a package-name-to-version map), and `containerImageDigests` (an array
of image digests). The runner protocol preserves these fields in the bundle and
fingerprint. Supply the versions actually used. Omitted fields are recorded as
unknown; use an empty map/list only when no SDKs/images apply. Gate and metric
plugins can similarly declare a `version`, which is recorded in the manifest.

Adapter-specific concepts belong inside the adapter, not in the framework core.

## Live runner protocol

The bundled reference targets can invoke an adapter runner when an environment
variable such as `ORCHEVAL_TEMPORAL_RUNNER` contains the runner executable. Optional
arguments are supplied as a JSON string array in `ORCHEVAL_TEMPORAL_RUNNER_ARGS`.
Orcheval starts the executable directly, without a shell, and sends one JSON request
on standard input. The runner writes one JSON response to standard output.

Supported actions are `metadata`, `setup`, `health`, `execute`, `signal`, `cancel`,
`observe`, and `teardown`. The `observe` response must satisfy
`ExecutionSnapshot`, including the eight security evidence fields:
`crossTenantLeakDetected`, `secretExposureDetected`,
`identitySubstitutionAllowed`, `duplicateSideEffects`,
`cancellationAffectedUnrelatedWork`, `auditTrailComplete`,
`recoverySkippedSteps`, and the execution's tenant/correlation identifiers.

Use `null` for untested security checks, including `duplicateSideEffects` when
no side-effect probe ran. `crossRunLeakDetected` is a separate optional nullable
field for SEC-008; tenant isolation cannot substitute for that check. Missing or
unknown evidence cannot produce a passing baseline. The engine checks execution,
tenant, correlation and workload identities and requires coherent step timelines.
Gate results identify the target they evaluate.

Runner calls default to a 30-second deadline and a 1 MiB combined stdout/stderr
limit. `RunnerCommand.timeoutMs` and `RunnerCommand.maxOutputBytes` can override
these limits programmatically. A timeout or excessive output kills the runner
process and rejects the call. Persistent workers belong in the separately
managed runtime environment, not in a runner subprocess.

## Execution lifecycle

`observe` can return `QUEUED`, `RUNNING` or `WAITING` with `endedAt: null` and
an ISO `observedAt` timestamp. Terminal states are `SUCCEEDED`, `FAILED` and
`CANCELLED`, with an actual `endedAt`. Do not block observation until completion
when the workload requires an external action. The engine validates identity,
stable start time and step timelines on every snapshot.

A workload can declare a lifecycle barrier, for example:

```ts
{ action: 'signal', at: 'WAITING', signal: { name: 'approve', payload: { approved: true } } }
{ action: 'cancel', at: 'WAITING' }
```

The engine polls until the barrier, issues the action once, and requires success
after approval or `CANCELLED` after cancellation. An acknowledgement alone is
insufficient. Early completion, rejected actions and timeouts fail evaluation.
The final observation's `lifecycle` array records state transitions and acknowledged
actions; adapters should also retain runtime evidence that corroborates them.

`WorkloadDefinition.timeoutMs` (default 30,000) bounds observation/action polling
after execution starts. `pollIntervalMs` defaults to 100. These values and the
action definition are included in the profile manifest and fingerprint. They do
not bound setup, execute or teardown for in-process adapters. Runner subprocesses
retain their separate per-call limits. The engine passes an optional abort signal
to observe/signal/cancel; the runner bridge kills its subprocess on abort.
In-process adapters should honour that signal and use teardown to clean up their
resources, including after partial setup. An abort cannot forcibly stop an
in-process adapter that ignores it.

The Docker lifecycle profile currently exercises Temporal approval/resume and
waiting cancellation. The default reference profile still uses simulators unless
a live runner is configured; neither the lab nor those simulators provide full
ORCH-07 or SEC-005 coverage.

A configured runner is marked `LIVE`; absent configuration retains the deterministic
local simulator. The runner is the boundary for vendor SDK/API implementations.
The five reference ids are `temporal`, `inngest`, `hatchet`, `triggerdev` and
`windmill`; for example, Trigger.dev uses `ORCHEVAL_TRIGGERDEV_RUNNER` and
`ORCHEVAL_TRIGGERDEV_RUNNER_ARGS`. Configuring a runner does not establish that
its runtime has passed integration or security checks. See the
[Docker coverage table](local-docker-evaluation.md) for verified coverage.
