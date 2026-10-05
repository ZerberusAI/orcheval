# Local Docker evaluation

The isolated lab runs real Temporal and Inngest services and SDK workers. It
exercises three repetitions per scenario:

| Profile | Runtimes | Coverage |
| --- | --- | --- |
| `ai-orchestration-smoke` | Temporal, Inngest | ORCH-01 sequential execution |
| `ai-orchestration-lifecycle-smoke` | Temporal | ORCH-06 approval/resume and the waiting-work subset of ORCH-07 cancellation |

Mock application steps execute through the real runtime. This is an integration
smoke check, not the full Phase 1 evaluation or a performance benchmark. Hatchet
is not included yet. These profiles are registered by this lab harness only.
Replay them with the helper below; the default CLI does not register them.

## Host isolation

- npm installation happens only while building the SDK image in Docker.
- Its manifest, lockfile, cache and `node_modules` live under `/opt/orcheval-lab`
  inside the image. No host npm installation is needed.
- The repository and lab sources are mounted read-only. No other repositories,
  home directories, Docker sockets or host dependency directories are mounted
  separately. No container has a writable host mount.
- The dedicated `orcheval-phase1` network is internal. Services publish no host
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

## Versions and evidence

The Dockerfile pins the Node image digest and Temporal SDK `1.24.0` / Inngest SDK
`4.21.1`. Compose pins both runtime image digests. The tested Temporal image
contains server `1.32.0` (CLI `1.9.1`); the Inngest image is `1.45.1-9059f14a7`.
The bundle includes the actual SDK image content id and generated
`sdk-package-lock.json`, so transitive versions can be inspected. A fresh image
build can resolve different transitive versions; preserve the image or use its
exported lockfile inside Docker when reproducing an exact dependency tree.

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
Inngest lifecycle parity and version changes still require their own evaluations.

Runner calls have time and output limits. The engine rejects mismatched identities
and invalid timelines. Gates are evaluated separately per target, and missing
checks, missing required observations or unhealthy targets cannot produce a
passing baseline. Lifecycle observation/action polling has a 30-second total
deadline; an expired deadline aborts the active runner process. Setup, execute and
teardown retain individual runner deadlines. No full-profile acceptance claim is
made by these restricted checks.

References: [Temporal TypeScript setup](https://docs.temporal.io/develop/typescript/set-up-your-local-typescript),
[Inngest Docker development](https://www.inngest.com/docs/local-development/docker).
