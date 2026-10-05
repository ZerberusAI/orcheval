# Roadmap

## Phase 1 — v0.1.0

Completed locally:

- [x] public OSS repository and governance baseline
- [x] core evaluation contracts, engine and contract harness
- [x] `ai-orchestration` profile with ORCH-01 through ORCH-10
- [x] deterministic local contract simulators for Hatchet, Temporal and Inngest
- [x] security-baseline engine with all SEC-001 through SEC-008 evidence fields
- [x] latency, throughput, burst and traceability metric plugins
- [x] YAML validation, CLI execution, reporting and reproducible result bundles
- [x] CI build, test, lint and CLI smoke-test workflow
- [x] live-runner protocol for vendor SDK/API adapters
- [x] container-isolated Temporal and Inngest ORCH-01 smoke lab, with untested security evidence marked unknown

Remaining before `v0.1.0`:

- [ ] complete and integration-test full-profile live Hatchet, Temporal and Inngest runners
- [ ] provision reproducible local or hosted test environments for those runners
- [ ] collect live evidence for all security assertions and publish verified example bundles
- [ ] perform release packaging and publish the first public release

## Phase 2 — v1.0.0

- extension and plugin model
- compute/container runtime support
- additional profiles for durable execution and multi-tenant SaaS
- cost, correctness and resource-efficiency metrics
- policy packs, capability manifests and community extension validation
- supply-chain security hardening and SBOM/provenance publishing
