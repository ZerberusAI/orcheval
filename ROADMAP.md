# Roadmap

## Phase 1 — v0.1.0

Completed locally:

- [x] public OSS repository and governance baseline
- [x] core evaluation contracts, engine and contract harness
- [x] `ai-orchestration` profile with ORCH-01 through ORCH-10
- [x] deterministic local contract simulators for Temporal, Inngest, Hatchet, Trigger.dev and Windmill
- [x] security-baseline engine with all SEC-001 through SEC-008 evidence fields
- [x] latency, throughput, burst and traceability metric plugins
- [x] YAML validation, CLI execution, reporting and reproducible result bundles
- [x] CI build, test, lint and CLI smoke-test workflow
- [x] live-runner protocol for vendor SDK/API adapters
- [x] container-isolated Temporal and Inngest ORCH-01 smoke lab, with untested security evidence marked unknown
- [x] bounded lifecycle polling and Temporal approval/resume and waiting-cancellation lab scenarios
- [x] isolated Hatchet and Windmill ORCH-01 connectors, three real executions each with native task/job evidence
- [x] Trigger.dev SDK/API connector and five child tasks, verified with container-only contract fixtures

Remaining before `v0.1.0`:

- [ ] provision an isolated Trigger.dev environment and verify three real ORCH-01 executions
- [ ] complete and integration-test full-profile live runners for all five reference providers
- [ ] extend lifecycle checks to queued/running cancellation, unrelated-run isolation and parity across all five providers
- [ ] provision reproducible local or hosted test environments for those runners
- [ ] collect live evidence for all security assertions and publish verified example bundles
- [ ] perform release packaging and publish the first public release

Provider expansion after the original five: Restate and DBOS, with BullMQ as a
separate job-queue baseline. Argo Workflows belongs to Phase 2 container evaluation.

## Phase 2 — v1.0.0

- extension and plugin model
- compute/container runtime support
- additional profiles for durable execution and multi-tenant SaaS
- cost, correctness and resource-efficiency metrics
- policy packs, capability manifests and community extension validation
- supply-chain security hardening and SBOM/provenance publishing
