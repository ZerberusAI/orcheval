# Open-Source Runtime Evaluation Framework — Two-Phase Delivery Plan

**Organisation:** Zerberus Technologies  
**Repository:** New public repository under the Zerberus GitHub namespace  
**Working project name:** `orcheval` *(placeholder; final naming can be changed before public release)*  
**License:** MIT License  
**Initial focus:** Orchestration/runtime evaluation  
**Future scope:** Containerisation and compute-runtime evaluation  
**Delivery model:** Two phases only

---

# 1. Project Intent

Build an open-source, vendor-neutral framework for evaluating orchestration and runtime platforms against reproducible workloads.

The framework must treat:

- **security**
- **correctness**
- **tenant isolation**
- **recoverability**
- **trace integrity**

as **mandatory admissibility gates**.

Other dimensions such as:

- cost;
- scaling;
- burst handling;
- latency;
- throughput;
- traceability;
- developer experience;
- operational complexity;
- accuracy;
- resource efficiency

must be implemented as **optional evaluation metrics**, not as substitutes for security.

Core principle:

> **Security and correctness determine whether a runtime is admissible. Performance, cost and developer experience determine how well it fits.**

The framework should avoid declaring a universal “best” orchestration platform. It should instead produce evidence that allows teams to evaluate platforms against their own requirements and weights.

---

# 2. Repository Setup

Create a new public repository under the Zerberus namespace.

Suggested names:

```text
ZerberusAI/orcheval
ZerberusAI/runtime-eval
ZerberusAI/runtimebench
ZerberusAI/runproof
```

Recommended initial working name:

```text
orcheval
```

Suggested repository description:

> Policy-driven open-source framework for evaluating orchestration runtimes using reproducible workloads, mandatory security gates and configurable operational metrics.

Initial repository structure:

```text
orcheval/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│
├── packages/
│   ├── core/
│   ├── cli/
│   ├── harness/
│   └── instrumentation/
│
├── adapters/
├── profiles/
├── gates/
├── metrics/
├── policies/
├── examples/
├── docs/
├── tests/
│
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── ROADMAP.md
├── package.json
├── tsconfig.json
└── .gitignore
```

---

# 3. Repository Governance Baseline

The repository should start with the following files rather than adding them later.

## LICENSE

Use the standard **MIT License**.

Copyright line:

```text
Copyright (c) 2026 Zerberus Technologies
```

Do not refer to it as “MIT 2.0”.

## SECURITY.md

Include:

- supported versions;
- responsible disclosure instructions;
- where security vulnerabilities should be reported;
- request that security vulnerabilities are **not** raised as public GitHub issues;
- response expectations;
- scope covering framework core, official adapters and official policy packs.

Do not publish a private security email unless Zerberus already has one suitable for public disclosure.

## CONTRIBUTING.md

Define:

- local setup;
- coding standards;
- adapter contribution model;
- metric-plugin contribution model;
- requirement for reproducible tests;
- requirement for security tests;
- requirement that vendor claims be backed by executed evidence;
- no vendor-sponsored ranking language.

## CODE_OF_CONDUCT.md

Use a standard open-source code of conduct.

## Pull request template

Require contributors to declare:

```text
- feature / adapter / metric / security-gate change
- tests added
- security impact
- reproducibility impact
- documentation impact
- vendor affiliation, if relevant
```

Vendor affiliation disclosure is important for neutrality.

---

# PHASE 1 — OSS FOUNDATION + ORCHESTRATION MVP

## Goal

Release a credible `v0.1` that can evaluate orchestration platforms using common workloads without contaminating the framework with product-specific assumptions.

Finalised Phase 1 scope:

- public OSS repository and governance baseline;
- core evaluation engine and contracts;
- one official workload profile: `ai-orchestration`;
- official reference adapters: Temporal, Inngest, Hatchet, Trigger.dev and Windmill;
- additional adapters may be added after `v0.1`, but they are not mandatory for the first release;
- security gate pack: `security-baseline`;
- evidence collection and reproducible result bundles;
- YAML-driven CLI execution and reporting;
- optional metrics covering latency, throughput, burst, traceability and developer experience.

Phase 1 proves the architecture and the evidence model. It must **not** attempt to support every workload/runtime category before the core is validated.

## Execution status — 2026-10-06

Work is local on `feature/Phase1-Evaluations`. The requested branch name contained a space, which Git does not allow. No remote deployment or Git pull is part of this execution plan.

| Work package | Status | Evidence / remaining work |
| --- | --- | --- |
| 1. Configuration replay and reproducible bundles | Complete locally | Commit `1cfcf0b`; resolved configuration, content fingerprints, version metadata and overwrite protection. |
| 2. Evidence and execution lifecycle | Foundation implemented | Per-target mandatory gates, nullable security assertions, identity/timestamp validation, nonterminal snapshots, bounded polling, abortable runner calls and recorded lifecycle actions. Full-profile fault/load orchestration remains. |
| 3. Temporal sequential vertical slice | Complete locally | Three real ORCH-01 executions, five activities each, through the Node SDK in Docker; workflow histories captured. |
| 4. Temporal full scenario coverage | In progress | ORCH-06 approval/resume and the waiting-work subset of ORCH-07 pass three real executions each, with signal/cancel/terminal history assertions. Queued/running cancellation, unrelated-run effects, parallelism, retries, recovery and tenant/load/context/version scenarios remain. |
| 5. Five-provider integration and parity | In progress | Temporal, Inngest, Hatchet and Windmill have live ORCH-01 evidence. Hatchet and Windmill each pass three executions with five native tasks/jobs. Trigger.dev's connector and task definitions pass SDK/API fixture checks; its live environment remains pending. Lifecycle, fault and security parity across providers remains. |
| 6. Metrics, documentation and release | Pending | Full-profile security probes, measured load, comparable metrics, verified example bundles and release packaging remain. |

Initial checkpoint `3455ba2`: 29 tests passed; TypeScript build and lint passed. Its Docker evidence is under `results/local-docker/20261005T150928Z-79039/evaluation-40f4f30f-733a-4782-8fa0-41f44bd05933/` (ignored local output).

Lifecycle milestone validation: **39 tests**, TypeScript build and lint pass, plus **one Docker-only regression test** for Inngest's completed status arriving before its end timestamp. The runner now waits under its existing deadline and retains intermediate records instead of manufacturing an end time. Real integration checks passed **12 executions**: three ORCH-01 runs for each runtime, three Temporal approval/resume runs and three Temporal waiting cancellations.

Temporal/Inngest lifecycle evidence is under `results/local-docker/20261005T154350Z-88746/`:

- `evaluation-334987e3-afcc-49a7-b3d7-ad261d1b80b1/`: sequential profile, both runtimes.
- `evaluation-fc77439d-e760-4335-abfb-d0e9dc36de02/`: Temporal lifecycle profile, including engine action logs and server histories.

Both reports remain **INCOMPLETE**: security assertions were not exercised and remain **NOT_VALIDATED**. Waiting cancellation alone does not validate SEC-005, unrelated-run isolation or the full ORCH-07 scenario. The restricted lab profiles are separate from full Phase 1 acceptance.

Connector milestone, 2026-10-06:

| Provider | Implemented / verified | Outstanding |
| --- | --- | --- |
| Temporal | Live ORCH-01, ORCH-06, waiting subset of ORCH-07 | Remaining scenarios and security probes |
| Inngest | Live ORCH-01 | Lifecycle and remaining scenarios/security |
| Hatchet | Node SDK worker; five native DAG tasks; three live ORCH-01 runs | Lifecycle and remaining scenarios/security |
| Windmill | REST runner; five native Bun flow modules; three live ORCH-01 runs | Lifecycle and remaining scenarios/security |
| Trigger.dev | SDK runner, root plus five native child task definitions; SDK/API fixture validation | Live provisioning, task registration/execution, then remaining scenarios/security |

New live evidence (ignored local output):

- Hatchet: `results/local-docker/hatchet-20261006T091219Z-47890/evaluation-341ebeb2-f02e-4e06-b4b5-2de19a2b7fb3/`.
- Windmill: `results/local-docker/windmill-20261006T091233Z-47864/evaluation-cbd13459-3523-4f79-b653-a9c3ea1b970e/`.

Both new reports are **INCOMPLETE / NOT_VALIDATED** because the security probes have not run. Hatchet captures run/task/event records; Windmill captures the flow and five successful module jobs. All new connectors reject workloads outside ORCH-01. Seven Docker-only checks cover the Hatchet submission-timestamp regression and Trigger.dev's real SDK against controlled API fixtures, including idempotency-key separation, pending/terminal states, malformed/foreign records and all six task registrations. Fixture success is not live Trigger.dev evidence.

Pinned dependencies: Hatchet SDK `1.35.1`, Trigger.dev SDK `4.7.2`, and immutable Node/PostgreSQL/Hatchet/Windmill image digests. Verified Windmill reports `CE v1.824.1-1-g18e44d3174`. Each live bundle includes the actual SDK image id and generated lockfile. New labs run independently with automatic teardown and no writable host mounts.

Validation: all **39 framework tests** pass (the full-profile simulator test now covers all five providers), along with TypeScript build/lint and **seven Docker connector checks**. The host `package.json`, `package-lock.json` and aggregate `node_modules` content hashes match the pre-work baseline. Provider containers, credential volumes and networks were removed after validation; downloaded images/build cache remain in Docker.

Trigger.dev live setup is pending an isolated Docker host/VM with sufficient capacity and a bootstrapped project/worker. The current Docker allocation is about 7.65 GiB; the documented minimums are 6 GB for its webapp stack and 8 GB for its worker stack. Its worker manages task containers through a Docker socket proxy. Preserve the workstation's Docker settings and socket boundary; run that stack in a dedicated environment. See [Trigger.dev Docker requirements](https://trigger.dev/docs/self-hosting/docker). No live or checkpoint-parity claim is made for this connector.

Environment boundary: all vendor SDKs and npm downloads remain inside the dedicated Docker image. Repository mounts are read-only during evaluation; the host package manifest, lockfile and installed dependencies remain unchanged. The isolated Compose project publishes no host ports. Its containers and network were removed after the run; downloaded images/build cache remain in Docker. See `docs/local-docker-evaluation.md` for reproduction and cleanup.

Next implementation milestone:

1. Provision the isolated Trigger.dev environment, register the six task definitions and capture three real ORCH-01 runs. Retain the distinction between its completed SDK/API checks and pending live validation.
2. Add independently observed queued and running cancellation variants, with an unrelated control execution; bring all five providers to equivalent approval/resume and cancellation coverage.
3. Exercise retry/idempotency and worker failure/recovery; expand live security probes without converting missing evidence into passing assertions.
4. Complete the remaining full-profile scenarios for all five providers before claiming Phase 1 completion.

### Connector expansion track — started 2026-10-06

The five original providers remain the Phase 1 acceptance set. Expansion work must
not delay their lifecycle and security coverage, and no expansion connector may be
counted as a Phase 1 pass. **Restate** now has the first vertical slice: three
live ORCH-01 executions in an isolated OSS server and TypeScript service
container. The service executes the five application operations through durable
`ctx.run` calls; the runner preserves Restate invocation IDs, output and actual
step timestamps. Evidence is in
`results/local-docker/restate-20261006T092743Z-50876/evaluation-98064ccc-a39b-48b0-adc0-c3bd89a2f31a/`.
Security, recovery, lifecycle and throughput claims remain unknown until measured.

**DBOS** now has the corresponding PostgreSQL-backed vertical slice: three live
ORCH-01 executions against a disposable system database. The embedded TypeScript
executor runs the same five durable steps and exposes its DBOS workflow status,
workflow ID, output and timestamps to the runner. Evidence is in
`results/local-docker/dbos-20261006T093302Z-53159/evaluation-cbeab11f-d860-4e6e-a9cb-f63f637ec6be/`.
Its application-side system database and embedded execution model remain a
material comparison distinction from Restate and the original five providers.

**BullMQ** now has a Redis job-queue baseline: three isolated ORCH-01 runs
submit one queued job each, execute the five application-owned operations
sequentially inside that job, and retain the native BullMQ job state and
timestamps. Evidence is in
`results/local-docker/bullmq-20261006T094243Z-56195/evaluation-40d36629-ad85-4f81-b5ff-a5726b9e54f2/`.
It must not be described as an equivalent durable workflow implementation.
Argo Workflows stays in the Phase 2 Kubernetes/container profile. Each
expansion has a separate Docker compose profile, immutable image/dependency
identifiers, host-independent reproduction command, and an explicit
capability/coverage label.

**Kestra** now has an isolated REST-API vertical slice: three ORCH-01 flows use
five built-in core `debug.Return` tasks and retain authenticated execution,
task-run and task-output records. Evidence is in
`results/local-docker/kestra-20261006T101837Z-64688/evaluation-1a046459-591a-4eaa-a9e7-4bb611e2c1f1/`.
The lab reserves the documented standalone minimum of 2 vCPUs and 4 GiB only
while the Docker profile is running, and mounts neither a Docker socket nor a
host directory. Its result remains an expansion comparison, outside Phase 1
acceptance; lifecycle, recovery, tenancy and security claims remain untested.

**Prefect** now has a Docker-only self-hosted vertical slice: three ORCH-01
flows run through a separate Python flow-client container against Prefect Server
and execute five native Prefect tasks each. Evidence is in
`results/local-docker/prefect-20261006T103235Z-68710/evaluation-d6fa35fd-679e-4184-893c-06f82109391c/`.
The runner retains the completed server flow record beside task output. Its
local flow-client execution does not establish deployment-worker, cancellation,
recovery, tenancy or security equivalence.

The original document included Trigger.dev and Windmill in its example configuration and adapter families but omitted them from its Phase 1 summary and acceptance list. Those sections now consistently include all five intended providers.

### Provider expansion and fair comparison

After the original five, prioritise Restate (durable services, workflows and stateful objects) and DBOS (PostgreSQL-backed application workflows). BullMQ is covered as a separate job-queue baseline. Keep Argo Workflows with the Phase 2 Kubernetes/container workload family; these additions are backlog candidates, not extra Phase 1 release requirements.

For every connector, record deployment mode, edition, version, native capabilities, application code required and unsupported scenarios. Evaluate the same business workload and fault assertions where applicable; a missing capability must not silently become a simulated pass. Security evidence remains unknown until the actual probe runs.

Trigger.dev self-hosting currently excludes checkpoint support, and Windmill reserves custom approval permissions for Cloud/Enterprise editions. Capture these distinctions in evidence instead of treating a local Community deployment as equivalent to a managed deployment. Sources: [Trigger.dev self-hosting](https://trigger.dev/docs/self-hosting/docker), [Windmill approvals](https://www.windmill.dev/docs/flows/flow_approval).

All package installations remain inside Docker. Run provider labs independently to bound memory use; preserve the host dependency manifests, existing repositories and Docker global settings. Do not mount the host Docker socket into a provider or worker container.

Lifecycle scope: polling is bounded after `execute` returns; runner setup/execute/teardown retain their per-call deadlines. In-process adapters must cooperate with abort signals and clean up in teardown. The engine cannot forcibly stop arbitrary in-process adapter code. No host npm install, remote deployment or Git pull was performed for either milestone.

---

# 4. Phase 1 Architecture

Implement five independent architectural concepts:

```text
Evaluation Engine
      |
      +-- Workload Profiles
      |
      +-- Target Adapters
      |
      +-- Mandatory Gates
      |
      +-- Optional Metrics
      |
      +-- Instrumentation / Evidence
```

The framework core must understand only:

```text
Target
Workload
Execution
Observation
Measurement
Assertion
Gate
Metric
Result
```

It must not understand:

```text
Temporal Workflow
Hatchet Task
Inngest Function
Windmill Script
Trigger.dev Task
```

Those concepts belong inside adapters.

---

# 5. Core Contracts

Create stable TypeScript contracts before candidate implementations.

## Target Adapter

Conceptually:

```ts
export interface EvaluationTarget {
  id: string;

  metadata(): Promise<TargetMetadata>;

  setup(context: EvaluationContext): Promise<void>;

  health(): Promise<HealthResult>;

  execute(
    workload: WorkloadDefinition,
    execution: EvaluationExecution
  ): Promise<ExecutionHandle>;

  signal?(
    executionId: string,
    signal: EvaluationSignal
  ): Promise<void>;

  cancel(
    executionId: string
  ): Promise<void>;

  observe(
    executionId: string
  ): Promise<ExecutionObservation>;

  teardown(
    context: EvaluationContext
  ): Promise<void>;
}
```

## Metric Plugin

```ts
export interface MetricPlugin {
  id: string;

  requirements(): CapabilityRequirement[];

  evaluate(
    evidence: EvaluationEvidence
  ): Promise<MetricResult>;
}
```

## Security Gate

```ts
export interface EvaluationGate {
  id: string;
  mandatory: boolean;

  evaluate(
    evidence: EvaluationEvidence
  ): Promise<GateResult>;
}
```

A failed mandatory gate must prevent the candidate from being represented as generally admissible for that evaluation profile.

---

# 6. Phase 1 Workload Profile

Create one official profile:

```text
profiles/ai-orchestration/
```

Include:

### ORCH-01 Sequential workflow

```text
request
 -> context
 -> policy/classification mock
 -> retrieval mock
 -> model mock
 -> validation
 -> result
```

### ORCH-02 Parallel fan-out / fan-in

```text
request
 -> tool A
 -> tool B
 -> tool C
 -> aggregate
 -> model synthesis
```

### ORCH-03 Tenant burst

Simulate:

```text
Tenant A = burst
Tenant B = normal workload
Tenant C = low-volume latency-sensitive workload
```

### ORCH-04 Retry + idempotency

Inject a transient failure after a successful consequential mock operation.

Expected outcome:

```text
duplicate_side_effects == 0
```

### ORCH-05 Worker failure

Terminate a worker during execution.

Evaluate recovery.

### ORCH-06 Wait / approval / resume

Pause the workflow and resume using an external signal.

### ORCH-07 Cancellation

Cancel:

- queued work;
- running work;
- waiting work.

### ORCH-08 Burst/load

Initial profiles:

```text
25 executions
100 executions
250 executions
```

### ORCH-09 Execution-context handling

Pass realistically sized state through the workflow.

### ORCH-10 Workflow change/version behaviour

Resume a waiting workflow after the underlying implementation changes.

---

# 7. Phase 1 Mandatory Security Gates

Security is **not** a weighted score.

Initial gate pack:

```text
gates/security-baseline/
```

Required gates:

### SEC-001 — Tenant isolation

A candidate must not expose execution state, payloads or control operations across synthetic tenants.

### SEC-002 — Secret handling

Ensure secrets are not exposed through:

- logs;
- traces;
- task metadata;
- error messages;
- persisted workflow state where avoidable.

### SEC-003 — Retry safety

Injected retries must not create duplicate consequential side effects.

### SEC-004 — Execution identity integrity

Ensure execution identity / correlation cannot be substituted to access another workload.

### SEC-005 — Cancellation integrity

Cancellation of one execution must not terminate unrelated work.

### SEC-006 — Audit trace integrity

Execution state changes must produce a coherent evidence trail.

### SEC-007 — Failure recovery integrity

Recovered executions must not silently skip required steps.

### SEC-008 — Unsafe cross-run state leakage

One execution must not receive another execution's state.

Gate result:

```text
PASS
FAIL
NOT_VALIDATED
```

Never convert security gate outcomes into a 1–5 weighted score.

---

# 8. Phase 1 Optional Metric Packs

Initial official metric packs:

```text
metrics/
├── latency/
├── throughput/
├── burst/
├── scaling/
├── traceability/
├── developer-experience/
└── operational-complexity/
```

Defer detailed cost and accuracy modelling until Phase 2.

Each metric plugin must return:

```text
raw evidence
normalised measurement
optional score
confidence / limitations
```

Do not return only a score.

---

# 9. Instrumentation

Create a candidate-neutral evidence layer.

Use OpenTelemetry-compatible instrumentation where practical.

Canonical trace model:

```text
evaluation.run
  orchestration.queue
  orchestration.execution
    workload.step
      mock.model
      mock.tool
      mock.policy
      mock.approval
```

Required common attributes:

```text
evaluation.id
evaluation.run_id
profile.id
scenario.id
target.id
tenant.id
execution.id
correlation.id
step.id
attempt.number
failure.injected
execution.outcome
```

Capture:

```text
start/end time
queue duration
execution duration
step duration
attempts
errors
retries
recovery time
cancellation time
duplicate side effects
CPU
memory
runtime/container resource usage
```

---

# 10. CLI — Phase 1

Provide a minimal usable CLI.

Examples:

```bash
orcheval init
orcheval list targets
orcheval list profiles
orcheval run evaluation.yaml
orcheval report ./results/<run-id>
orcheval validate evaluation.yaml
```

Local development commands:

```bash
npm run build
npm test
npm run lint
npm run eval:local
```

---

# 11. Configuration

Example:

```yaml
version: 1

evaluation:
  name: orchestration-runtime-evaluation

profile:
  id: ai-orchestration

targets:
  - temporal
  - hatchet
  - inngest
  - triggerdev
  - windmill

gates:
  security-baseline:
    required: true

metrics:
  latency:
    enabled: true

  throughput:
    enabled: true

  burst:
    enabled: true

  scaling:
    enabled: true

  traceability:
    enabled: true

  developer-experience:
    enabled: true

runs:
  repetitions: 5

load:
  concurrency:
    - 1
    - 10
    - 50
    - 100

faults:
  - transient_failure
  - worker_kill
```

---

# 12. Evidence and Reporting

Each run creates an immutable result directory:

```text
results/<evaluation-id>/
├── environment.json
├── config.resolved.yaml
├── raw/
├── traces/
├── gates.json
├── metrics.json
├── comparison.json
└── report.md
```

`environment.json` must contain:

```text
framework version
framework git commit
adapter versions
target runtime versions
SDK versions
container image digests where available
OS
CPU architecture
RAM
Node version
Docker version
configuration hash
timestamp
```

Create an evaluation fingerprint from:

```text
profile
policy packs
scenario versions
target versions
framework version
configuration
```

This enables reproducibility.

---

# 13. Phase 1 Reporting Model

Do not create a universal leaderboard.

Example:

```text
Candidate       Security   Recovery   Burst   Traceability   Dev Experience

Temporal        PASS       4.8        4.1     4.9            3.8
Hatchet         PASS       4.4        4.7     4.5            4.7
Inngest         PASS       4.0        4.5     4.4            4.8
Trigger.dev     PASS       ...
Windmill        PASS       ...
```

If a mandatory gate fails:

```text
Candidate X

SECURITY GATE: FAILED

SEC-001 Tenant Isolation

Comparative suitability score suppressed.
```

Raw measurements remain visible.

---

# 14. Phase 1 CI/CD

Add GitHub Actions for:

```text
lint
unit tests
contract tests
security tests
build
CLI smoke test
```

Official adapter integration tests may run separately if they require containers or longer runtimes.

Do not require vendor cloud credentials for basic pull-request validation.

---

# 15. Phase 1 Documentation

Minimum public documentation:

```text
README.md
docs/architecture.md
docs/security-model.md
docs/writing-an-adapter.md
docs/writing-a-metric.md
docs/writing-a-gate.md
docs/evaluation-format.md
examples/orchestration-evaluation.yaml
```

README should explain immediately:

> Orcheval does not rank vendors globally. It executes repeatable workloads, applies mandatory security gates, and exposes evidence that teams can evaluate using their own priorities.

---

# 16. Phase 1 Definition of Done

Phase 1 is complete when:

- the public Zerberus repository exists;
- MIT License is present;
- OSS governance/security files exist;
- the framework installs locally;
- the core contracts are stable enough for external adapters;
- the official reference adapters (Temporal, Inngest, Hatchet, Trigger.dev, Windmill) execute through one common API;
- the `ai-orchestration` profile executes consistently across those targets;
- mandatory security gates execute independently from optional scoring;
- common telemetry is captured;
- reproducible result bundles are generated;
- CLI can execute an evaluation from YAML;
- GitHub Actions validate core contributions;
- README and contributor documentation are sufficient for an external engineer to add an adapter;
- no SuperReach or Zerberus product-specific code is required to run the framework.

The v0.1 release should be intentionally narrow and credible, not broad and aspirational.

Suggested release:

```text
v0.1.0
```

---

# PHASE 2 — EXTENSIBLE RUNTIME EVALUATION PLATFORM

## Goal

Turn the orchestration evaluator into a general runtime-assurance framework capable of evaluating additional orchestration, containerisation and compute platforms.

Finalised Phase 2 scope:

- extension/plugin model for adapters, profiles and metric packs;
- official support for compute and container runtimes;
- additional workload profiles for durable execution, multi-tenant SaaS and container runtime assurance;
- AI runtime profile expansion with multi-agent and policy-limited workflows;
- richer metrics for cost, correctness, resource efficiency and portability;
- reusable policy packs and capability manifests;
- SBOM, provenance, signed release artifacts and supply-chain hardening;
- exportable benchmark bundles and richer report profiles;
- community extension validation without Zerberus-specific assumptions.

Phase 2 should be driven by lessons from real Phase 1 adapter implementations. Do not generalise abstractions before Phase 1 exposes where they are actually necessary.

---

# 17. Phase 2 Target Expansion

Extend the adapter model to support compute/container runtimes.

Candidate adapter families:

```text
adapters/
├── orchestration/
│   ├── temporal
│   ├── hatchet
│   ├── inngest
│   ├── triggerdev
│   └── windmill
│
└── compute/
    ├── docker
    ├── kubernetes
    ├── nomad
    ├── ecs
    └── cloud-run
```

Cloud-dependent adapters must distinguish:

```text
LOCAL
SELF_HOSTED
MANAGED
CLOUD_ONLY
NOT_VALIDATED
```

---

# 18. Phase 2 Profiles

Add additional official workload profiles.

## Durable execution

```text
profiles/durable-execution/
```

Focus:

- retries;
- timers;
- long-running work;
- version changes;
- durable state;
- external signals.

## Multi-tenant SaaS

```text
profiles/multi-tenant-saas/
```

Focus:

- isolation;
- noisy neighbour;
- queue fairness;
- tenant limits;
- control-plane separation;
- tenant-specific observability.

## Container runtime

```text
profiles/container-runtime/
```

Scenarios:

```text
cold start
horizontal scaling
rolling restart
node failure
network partition
secret rotation
image update
resource pressure
noisy neighbour
burst scaling
```

## AI agent runtime

Expand the initial AI profile to include:

```text
multi-agent fan-out
tool-calling
approval boundaries
policy checks
model retry
partial tool failure
delegated execution
execution lineage
```

---

# 19. Phase 2 Metric Plugin Ecosystem

Add richer metrics.

## Cost

Support:

```text
infrastructure
subscription
per-execution
compute
storage
network
operational burden
engineering-complexity proxy
```

Every cost result must declare provenance:

```text
MEASURED
DERIVED
PUBLISHED
ESTIMATED
```

## Accuracy / Correctness

Useful for AI runtime profiles.

Possible measures:

```text
task completion
tool-selection correctness
structured-output validity
workflow result equivalence
semantic correctness
context preservation
```

Accuracy must remain profile-specific rather than a core runtime assumption.

## Resource efficiency

Measure:

```text
CPU/execution
memory/execution
worker utilisation
idle overhead
storage growth
```

## Portability

Evaluate:

```text
vendor-specific LOC
migration surface
workflow DSL dependency
runtime API dependence
self-host/cloud parity
```

---

# 20. Phase 2 Policy Packs

Introduce reusable policy packs.

```text
policies/
├── security-baseline/
├── multi-tenant-saas/
├── ai-runtime/
├── regulated-workload/
└── zero-trust-runtime/
```

Policy packs should select gates and assertions.

Example:

```yaml
policyPack:
  id: multi-tenant-saas

requirements:
  - SEC-001
  - SEC-002
  - SEC-004
  - SEC-005
  - SEC-008
```

Allow organisations to create private policy packs without modifying framework core.

---

# 21. Capability Manifests

Adapters may declare supported capabilities:

```yaml
capabilities:
  durable_execution: true
  external_signals: true
  cancellation: true
  priority_queues: true
  per_tenant_concurrency: partial
  self_hosted: true
  telemetry_export: true
  workflow_versioning: true
```

Capability manifests only determine:

- whether a test can be attempted;
- expected adapter setup.

They must **not** count as evaluation evidence.

Measured results always override declared capability.

---

# 22. Extension Registry

Introduce plugin discovery.

Possible structure:

```text
@orcheval/core
@orcheval/cli
@orcheval/adapter-temporal
@orcheval/adapter-hatchet
@orcheval/profile-ai-orchestration
@orcheval/metric-cost
@orcheval/gate-security-baseline
```

The CLI should discover explicitly installed extensions rather than bundling every adapter.

Target:

```bash
npm install \
  @orcheval/core \
  @orcheval/adapter-temporal \
  @orcheval/profile-ai-orchestration
```

Then:

```bash
orcheval run evaluation.yaml
```

---

# 23. Supply-Chain Security

For Phase 2, harden the project itself.

Add:

```text
dependency pinning
lockfile enforcement
Dependabot/Renovate
CodeQL
secret scanning
SBOM generation
release provenance
signed release artifacts where practical
```

Generate an SBOM for framework releases.

Prefer:

```text
CycloneDX
SPDX
```

Publish release hashes.

The framework should model the security expectations it imposes on evaluated systems.

---

# 24. Reproducible Benchmark Bundles

Support exporting a complete evaluation bundle:

```text
orcheval export <evaluation-id>
```

Example:

```text
orcheval-evaluation.tar.gz
├── manifest.json
├── evaluation.yaml
├── environment.json
├── target-versions.json
├── gates.json
├── metrics.json
├── raw/
├── traces/
└── report.md
```

Allow another engineer to inspect or rerun the same evaluation.

---

# 25. Report Profiles

Support different report consumers.

```bash
orcheval report --format engineering
orcheval report --format executive
orcheval report --format json
```

## Engineering report

Include:

- scenarios;
- raw evidence;
- failures;
- timing distributions;
- security gate outcomes;
- implementation friction;
- telemetry;
- reproduction metadata.

## Executive report

Include:

- mandatory-gate status;
- architectural fit;
- operational burden;
- scaling;
- cost;
- major constraints;
- reversibility;
- evidence confidence.

Avoid technical implementation noise.

---

# 26. Community Neutrality Model

To preserve credibility:

1. Do not publish an official universal vendor ranking.
2. Do not accept vendor capability claims as evidence.
3. Require reproducible measurements.
4. Require vendor affiliation disclosure from contributors.
5. Keep weighting user-defined.
6. Clearly separate measured, derived and subjective metrics.
7. Make evaluation configurations public alongside published results.
8. Suppress aggregate suitability conclusions where mandatory gates fail.
9. Version profiles and gates.
10. Preserve raw evidence.

---

# 27. Phase 2 Definition of Done

Phase 2 is complete when:

- third parties can publish adapters without modifying core;
- third parties can publish metric packs;
- third parties can publish profiles;
- organisations can define private policy packs;
- orchestration and container/runtime targets can use the same core engine;
- cost and AI correctness metrics exist as optional plugins;
- security remains a mandatory gate mechanism;
- capability manifests are supported but never treated as evidence;
- evaluation bundles are exportable and reproducible;
- project releases generate SBOM/provenance data;
- official documentation includes extension-authoring guides;
- at least one external/community adapter can be installed independently;
- the project no longer depends on any Zerberus-specific runtime assumptions;
- official compute/container adapters have been validated using the same security and evidence model introduced in Phase 1.

Suggested release:

```text
v1.0.0
```

---

# 28. Explicitly Out of Scope

Do not turn the project into:

- a universal cloud benchmarking suite;
- a vendor recommendation engine;
- a SaaS monitoring product;
- a load-testing replacement;
- a penetration-testing framework;
- an orchestration abstraction layer used by production applications;
- a workflow portability runtime;
- a Zerberus product integration requirement.

The framework evaluates runtimes.

It should not become the runtime.

---

# 29. Recommended Delivery Order

## Phase 1

```text
Repository + OSS governance
        ↓
Core contracts
        ↓
Harness + evidence model
        ↓
Security gate engine
        ↓
AI orchestration profile
        ↓
Reference adapters: Temporal + Inngest + Hatchet + Trigger.dev + Windmill
        ↓
Metric plugins: latency, throughput, burst, traceability
        ↓
CLI + YAML evaluation format
        ↓
Reporting + result bundles
        ↓
CI / docs
        ↓
v0.1.0
```

## Phase 2

```text
Review Phase 1 abstractions
        ↓
Extension/plugin model
        ↓
Additional profiles: durable execution, multi-tenant SaaS, container runtime
        ↓
Compute/container adapters
        ↓
Cost + correctness + resource-efficiency metrics
        ↓
Policy packs
        ↓
Capability manifests and plugin discovery
        ↓
Supply-chain hardening + SBOM/provenance
        ↓
Portable evaluation bundles + richer reports
        ↓
External extension validation
        ↓
v1.0.0
```

---

# 30. Success Criteria for Zerberus

The project should be considered successful if it becomes useful **without requiring adoption of another Zerberus product**.

The strongest positioning is:

> Zerberus maintains an open framework that helps engineering and security teams test whether orchestration and runtime platforms meet their own security, resilience and operational requirements using reproducible evidence.

That establishes technical credibility around runtime assurance while preserving the project's independence and usefulness to the wider ecosystem.
