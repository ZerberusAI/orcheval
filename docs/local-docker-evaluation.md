# Local Docker evaluation

The isolated labs run real Temporal, Inngest, Hatchet and Windmill services. They
exercises three repetitions per scenario:

| Profile | Runtimes | Coverage |
| --- | --- | --- |
| `ai-orchestration-smoke` | Temporal, Inngest | ORCH-01 sequential execution |
| `ai-orchestration-lifecycle-smoke` | Temporal | ORCH-06 approval/resume and the waiting-work subset of ORCH-07 cancellation |
| `ai-orchestration-connector-smoke` | Hatchet, Windmill (separate runs) | ORCH-01, five native tasks/jobs per run |
| `ai-orchestration-connector-smoke` | Restate (separate run) | ORCH-01, five durable TypeScript `ctx.run` steps per run |
| `ai-orchestration-connector-smoke` | DBOS (separate run) | ORCH-01, five durable PostgreSQL-backed steps per run |
| `ai-orchestration-connector-smoke` | BullMQ (separate run) | ORCH-01, one Redis job with five sequential application operations per run |
| `ai-orchestration-connector-smoke` | Kestra (separate run) | ORCH-01, five authenticated built-in core task runs per flow |
| `ai-orchestration-connector-smoke` | Prefect (separate run) | ORCH-01, five native Python task runs per self-hosted flow |
| SDK/API fixtures only | Trigger.dev | Submission, idempotency keys, observation, rejection paths and task registration; **no live execution** |

Mock application steps execute through the real runtime. This is an integration
smoke check, not the full Phase 1 evaluation or a performance benchmark.
These profiles are registered by the lab harnesses only.
Replay them with the helper below; the default CLI does not register them.

## Host isolation

- npm installation happens only while building the SDK image in Docker.
- Its manifest, lockfile, cache and `node_modules` live under `/opt/orcheval-lab`
  inside the image. No host npm installation is needed.
- The repository and lab sources are mounted read-only. No other repositories,
  home directories, Docker sockets or host dependency directories are mounted
  separately. No container has a writable host mount.
- The dedicated `orcheval-phase1` and `orcheval-connectors` networks are internal. Services publish no host
  ports and have no runtime internet route through this network.
- CPU and memory limits apply to each service. Docker still consumes host disk,
  CPU and RAM; this setup does not change Docker Desktop's global settings.
- The helper copies only evidence and logs to this repository's ignored
  `results/local-docker/` directory. It removes its containers, runtime state and
  network on exit. Downloaded images and build cache remain in Docker for reuse.
- Cleanup is scoped to this lab. It does not prune Docker or stop other projects.

## Run

Docker must already be running. From this repository:

```bash
sh infra/local-evaluation/run.sh
```

The first full reference-workload run is intentionally separate from the smoke
lab. It executes all ten core-v1 scenarios on Temporal and retains an incomplete
security result until the dedicated probes exist:

```bash
sh infra/local-evaluation/run-temporal-core-v1.sh
```

See [the core-v1 reference workload](core-v1-reference.md) for its precise
coverage and non-claims.

The helper refuses to start if any containers from this lab already exist.
It builds the SDK image, starts both runtimes and workers, waits for readiness,
checks outputs and writes two evaluation bundles. Its cleanup trap also runs if
evaluation fails. Logs are retained with the output directory for diagnosis.
If a process is forcibly killed before cleanup, inspect the lab before removing
its resources:

```bash
docker compose -f infra/local-evaluation/compose.yaml ps --all
docker compose -f infra/local-evaluation/compose.yaml down --volumes --remove-orphans
```

Run the additional providers one at a time:

```bash
sh infra/local-evaluation/run-provider.sh hatchet
sh infra/local-evaluation/run-provider.sh windmill
sh infra/local-evaluation/run-provider.sh restate
sh infra/local-evaluation/run-provider.sh dbos
sh infra/local-evaluation/run-provider.sh bullmq
sh infra/local-evaluation/run-provider.sh kestra
sh infra/local-evaluation/run-provider.sh prefect
```

Each run builds the separate connector SDK image, starts the services required by
the selected provider, performs three ORCH-01 executions, and copies evidence
before cleanup. The helper refuses to reuse existing connector containers or
their credential volume. PostgreSQL-backed profile data is held in container
tmpfs; generated credentials stay in a Docker volume, which is deleted on exit.
Windmill uses a
fresh Community instance with its development bootstrap account. Its worker runs
without privileged mode or namespace sandboxing; these runs do not test workload
security isolation. Its five Bun scripts have no external package imports.

If interrupted before cleanup, inspect the connector project first. Include the
`tools` profile when removing it so Compose also removes the credential volume:

```bash
docker compose -f infra/local-evaluation/providers.compose.yaml --profile hatchet --profile windmill --profile restate --profile dbos --profile bullmq --profile kestra --profile prefect --profile tools ps --all
docker compose -f infra/local-evaluation/providers.compose.yaml --profile hatchet --profile windmill --profile restate --profile dbos --profile bullmq --profile kestra --profile prefect --profile tools down --volumes --remove-orphans
```

Run the seven connector regression/contract tests without a runtime service or
outbound network (the image build can download npm packages inside Docker):

```bash
sh infra/local-evaluation/test-connectors.sh
```

These tests use the installed Trigger.dev SDK against an HTTP fixture on container
loopback. They do not write evaluation bundles or establish runtime behavior.

## Versions and evidence

The Dockerfile pins the Node image digest and Temporal SDK `1.24.0` / Inngest SDK
`4.21.1`. Compose pins both runtime image digests. The tested Temporal image
contains server `1.32.0` (CLI `1.9.1`); the Inngest image is `1.45.1-9059f14a7`.
The bundle includes the actual SDK image content id and generated
`sdk-package-lock.json`, so transitive versions can be inspected. A fresh image
build can resolve different transitive versions; preserve the image or use its
exported lockfile inside Docker when reproducing an exact dependency tree.

`Dockerfile.connectors` pins Hatchet SDK `1.35.1`, DBOS SDK `5.2.11`, Restate
SDK `1.17.2`, Trigger.dev SDK `4.7.2`, BullMQ `6.3.11` and its Redis transport
`ioredis` `6.0.0`.
`providers.compose.yaml` pins Hatchet Lite, Windmill and PostgreSQL images by
digest, along with Kestra `2.0.5`. The verified Windmill version is `CE v1.824.1-1-g18e44d3174`; Hatchet's
runtime identity is its immutable image digest. Hatchet observations retain the
run record, five task records and task events. Windmill observations retain the
flow record and five successful module job references. Hatchet's aggregate
`run.createdAt` can be later than the first worker step, so the connector uses
`run.metadata.createdAt` as the stable submission timestamp. The raw values and
timestamp source are retained. These timings include queue time and are not
performance rankings.

The Restate profile starts an OSS server and a separate TypeScript service in the
same internal network. The runner registers the service through the local admin
API, sends each request using Restate's asynchronous ingress endpoint with an
idempotency key, and polls the documented output endpoint by Restate invocation
ID. A service handler performs the sequential operations with five durable
`ctx.run` calls. The connector retains its client submission timestamp for pending
snapshots and uses the final application-step timestamp only after the invocation
output is available. This ORCH-01 slice does not validate Restate cancellation,
recovery, tenant isolation or security controls.

The DBOS profile starts a separate Node executor against the disposable
PostgreSQL service used only for that run. DBOS creates and migrates its own
system schema during launch, then runs the five application operations using
`DBOS.runStep`. The runner starts a workflow with the evaluation execution ID,
reads DBOS workflow status, and accepts a terminal observation only for `SUCCESS`.
The profile does not test database permissions, DBOS recovery, cancellation,
tenant isolation, or security controls. It is a PostgreSQL-backed embedded
workflow comparison, not a claim that it has the same topology or capabilities
as the original five providers.

The BullMQ profile starts Redis and a separate Node queue/worker service in the
same internal network. Each ORCH-01 run creates one BullMQ job using the
evaluation execution ID as its job ID. The worker carries out the five
application operations in order, records progress in Redis, and returns their
timestamps and output through the terminal job result. The runner retains the
BullMQ state, submission, processing and completion timestamps. It does not
claim native durable steps, cancellation, retry/recovery, tenant isolation or
security coverage.

The Kestra profile runs an OSS `2.0.5` local server with its required Basic Auth
boundary, a lab-only credential passed only through the internal Compose
network, and no host ports, Docker socket or host directory mount. The runner
creates the flow through the REST API, submits execution input as multipart
form data, then retains the native execution, five task runs, and validation
task output from Kestra's dedicated task-output API. The profile reserves 2
vCPUs and 4 GiB only while it runs, following Kestra's standalone guidance.
It does not test cancellation, recovery, tenant isolation or security controls.

The Prefect profile starts an OSS Prefect Server and a separate Python flow-client
container within the internal Compose network. `Dockerfile.prefect` pins Python
`3.12-slim` by digest and Prefect `3.8.7`; both the five application tasks and
the server flow-run record are retained in each observation. The flow client runs
locally in its own container, so this slice does not evaluate deployments,
workers, cancellation, recovery, tenant isolation or security controls.

Temporal evidence includes workflow/run identifiers and server history. Inngest
evidence combines the server's completed run record with worker-captured step
timings and output, matched by the runtime run id. The pinned Inngest dev server
returns an empty REST `output` field, so the worker capture is required. It is
held in memory and is not recovery evidence. Each adapter rejects scenarios it
does not support.
The Inngest development API can report `Completed` before `ended_at` is populated.
The runner retains those intermediate records and waits within its deadline for
the actual end timestamp. A container-only regression check exercises this race
before the live scenarios run.

Temporal approval and cancellation workflows complete context and policy
activities, then wait on an external signal. The evaluator queries the workflow,
observes `WAITING`, and issues approval or cancellation exactly once. It then
polls to a terminal outcome. Approval must complete the remaining three activities;
cancellation must end as `CANCELLED` with only the first two completed. Assertions
check both the evaluator's lifecycle log and Temporal's signal/cancel/terminal
history events. Each lifecycle scenario runs three times.

The smoke check verifies output, step order, identity and timestamp consistency.
Security probes were not performed: all eight security evidence fields are
unknown, each target's gate stays `NOT_VALIDATED`, and the report is `INCOMPLETE`.
A successful helper exit means the integration check succeeded, not that a
runtime passed security gates. Production authentication, tenant isolation,
fault injection, load, queued/running cancellation, effects on unrelated runs,
lifecycle parity across providers and version changes still require their own evaluations.

Runner calls have time and output limits. The engine rejects mismatched identities
and invalid timelines. Gates are evaluated separately per target, and missing
checks, missing required observations or unhealthy targets cannot produce a
passing baseline. Lifecycle observation/action polling has a 30-second total
deadline by default (60 seconds for the additional provider smoke profile); an expired deadline aborts the active runner process. Setup, execute and
teardown retain individual runner deadlines. No full-profile acceptance claim is
made by these restricted checks.

## Trigger.dev live validation still pending

`triggerdev-runner.mjs` implements the SDK/API boundary; `triggerdev-tasks.mjs`
defines a root task that invokes five native children with `triggerAndWait`.
`trigger-tasks/sequential.mjs` exports them for discovery, and
`trigger.config.mjs` requires an explicit `TRIGGER_PROJECT_REF`. The runner requires
`TRIGGER_API_URL` and `TRIGGER_SECRET_KEY` and has no implicit cloud endpoint.
Record `TRIGGER_RUNTIME_VERSION` and `TRIGGER_RUNTIME_IMAGE` when connecting a
real instance. The current connector supports ORCH-01 only; cancellation API
wiring does not constitute lifecycle coverage.

The current Docker engine has about 7.65 GiB allocated. Trigger.dev documents
minimum resources of 6 GB for its webapp stack and 8 GB for its worker stack.
Its worker setup also manages task containers through a Docker socket proxy.
Before live validation, provide a dedicated isolated Docker host or VM with
sufficient resources, bootstrap a project and credentials there, and register the
tasks with the CLI inside that environment. Keep npm installs and the managed
Docker daemon there; do not mount this workstation's Docker socket or change its
global allocation. No Trigger.dev backend or worker stack was started in this
milestone. Self-hosted Trigger.dev currently lacks checkpoint support, so record
that limitation when testing waits/recovery rather than claiming cloud parity.
See [Trigger.dev's Docker requirements and limitations](https://trigger.dev/docs/self-hosting/docker).

References: [Temporal TypeScript setup](https://docs.temporal.io/develop/typescript/set-up-your-local-typescript),
[Inngest Docker development](https://www.inngest.com/docs/local-development/docker),
[Hatchet Lite](https://docs.hatchet.run/self-hosting/hatchet-lite),
[Windmill self-hosting](https://www.windmill.dev/docs/advanced/self_host),
[BullMQ quick start](https://docs.bullmq.io/quick-start),
[Kestra API guide](https://kestra.io/docs/how-to-guides/api),
[Prefect flows](https://docs.prefect.io/latest/tutorial/flows).
