# Orcheval clean-slate charter action plan

**Audit date:** 2026-10-07
**Decision:** retain the evidence core; reset the benchmark protocol, provider
scope, and release plan. Do not use existing smoke results for selection.

## Audit conclusion

The repository already has a credible evaluation kernel: versioned workload
profiles, explicit live/simulated target metadata, reproducibility fingerprints,
immutable evidence bundles, bounded lifecycle polling, and mandatory security
gates that preserve `NOT_VALIDATED`. The local quality baseline is healthy:
39 tests pass; TypeScript build and lint pass; `npm audit --omit=dev` reports no
known vulnerabilities.

It is not yet a comparative benchmark or publishable package:

| Area | Reuse | Gap to close |
| --- | --- | --- |
| Evidence core | `packages/core`, `reproducibility.ts`, lifecycle validation and result bundles | Add schema versioning, migrations, artifact signing/provenance, and a public stable API. |
| Workloads | `ai-orchestration` defines ORCH-01–10 | Only ORCH-01 and part of two lifecycle cases have live slices; workload semantics, data generators and correctness oracles need formal specifications. |
| Security | SEC-001–008 correctly fail closed | Implement probes and adversarial fixtures; current live evidence is `NOT_VALIDATED`. |
| Performance | Metric-plugin interface exists | Current latency is an average, configured concurrency is not executed concurrently, and no warm-up, percentile, variance, resource or cost protocol exists. |
| Providers | Runner protocol and nine local integration experiments exist | The official registry exposes five reference targets, adapters are not installable plugins, and capability claims lack a compatibility matrix. Trigger.dev is excluded from the reset. |
| CLI and configuration | CLI validates a documented YAML subset and writes bundles | Handwritten parser is intentionally narrow; no JSON Schema, config provenance, override precedence, provider credentials model, or packaged binary exists. |
| Release/OSS | License, governance documents, CI and contribution templates exist | Package is `private`, has no exports/bin/release workflow, no versioning policy, examples, SBOM, provenance or compatibility support policy. |
| Prior results | Useful engineering diagnostics | They are synthetic or restricted local smoke evidence and must be quarantined from executive ranking and paper datasets. |

The attempted aiServices deployment is **not** benchmark evidence. It found real
application packaging and eager-integration-startup issues; leave that work in
the application repository and keep the benchmark workload application-neutral.

## Programme structure

One protocol and evidence model serve three outputs:

1. A decision-ready, use-case-specific executive recommendation.
2. A configurable open-source package that reproduces the protocol.
3. A research artifact and paper based only on preregistered, reproducible runs.

No output may publish a framework ranking unless every comparison row identifies
mode, version, hardware, workload version, configuration fingerprint, sample
size, warm-up policy, gate status and limitations.

## Work plan

### Milestone 0 — freeze and govern the protocol

**Objective:** make the experiment falsifiable before running providers.

- Create `protocol/core-v1.md`: workload inputs/outputs, deterministic oracle,
  allowed provider-specific adaptations, retry model, clocks, isolation model,
  and error taxonomy.
- Create a decision matrix with executive weights by use case: durable critical
  work, event-driven product work, internal automation, and queue baseline.
- Define a strict run matrix: self-hosted and managed modes are separate;
  versions/images/configurations are pinned; every provider receives equal
  warm-up, repetitions, concurrency levels and failure injections.
- Define exclusion rules: unavailable feature, unsupported workload, failed
  gate and unvalidated evidence are reported, never converted to zero or pass.
- Move existing local results under `results/legacy-smoke/` or mark them in an
  index as non-comparative diagnostics. Do not delete raw evidence.

**Exit criteria:** protocol reviewed by an engineering owner, security owner,
and decision sponsor; a signed `core-v1` manifest exists before live runs.

### Milestone 1 — benchmark engine v0.2

**Objective:** make the harness genuinely execute the declared experiment.

- Replace the handwritten YAML parser with JSON Schema-backed configuration;
  retain YAML as a serialization format, with defaults and overrides recorded.
- Add concurrency scheduling, deterministic seeded data generation, warm-up,
  percentile/variance calculations, timeout accounting and controlled retries.
- Implement resource collection (CPU, memory, disk/network where available),
  run-clock synchronization and an optional cost collector with currency/date.
- Add a workload oracle interface and side-effect ledger to test idempotency,
  isolation and recovery rather than accepting provider-reported success.
- Version schemas and bundle format; add schema validation, redaction, SBOM,
  image digests, source revision, and signed/attested artifact hooks.

**Exit criteria:** one reference adapter runs all `core-v1` scenarios with
parallel load, fault injection and independently checked assertions; a complete
bundle can be replayed on a clean host.

### Milestone 2 — security and correctness gates

**Objective:** turn SEC-001–008 into measured probes.

- Implement tenant/cross-run canaries, secret sentinel injection and log/output
  scanning, identity substitution attempts, duplicate-side-effect ledger checks,
  audit correlation checks, cancellation control runs and recovery verification.
- Run probes in disposable, least-privilege networks; segregate credentials by
  provider and redact all artifacts before publication.
- Add negative controls proving each probe fails when its violation is injected.

**Exit criteria:** all gates have both positive and negative-control tests; a
provider with missing proof produces `NOT_VALIDATED`, not `PASS`.

### Milestone 3 — official provider cohort

**Objective:** produce a fair first comparison, not broad shallow coverage.

- Select a cohort of 3–5 frameworks using published inclusion criteria and
  disclose vendor affiliations. Exclude Trigger.dev unless re-approved.
- Implement each adapter against the same workload oracle and publish a
  capability matrix. Unsupported scenarios are explicit rows.
- Run self-hosted comparison first. Add managed mode only as a separate,
  credential-governed study.
- Repeat full runs on at least two clean environments and investigate variance.

**Exit criteria:** every cohort provider has complete raw bundles or an explicit
failure/unavailability record for every required scenario and security gate.

### Milestone 4 — executive recommendation

**Objective:** deliver a defensible decision, not a universal ranking.

- Create a board pack: decision question, admissibility table, use-case score
  cards, performance distributions, operational/cost assumptions, risks and
  recommended pilot.
- Recommend a primary choice per use case and a second-choice/exit strategy.
- Publish the complete technical appendix and raw-bundle locations internally.

**Exit criteria:** sponsor signs the scoring weights and assumptions; every
recommendation traces to an admissible evidence bundle.

### Milestone 5 — public package v0.1

**Objective:** let others reproduce and extend the evaluation.

- Convert the repository into publishable packages with explicit `exports`,
  `bin`, semver policy, Node support policy and release automation.
- Publish `orcheval init`, `validate`, `doctor`, `run`, `report`, and a
  provider/plugin discovery command; ship seeded manifests that users override.
- Define plugin, workload, metric and gate contracts; add compatibility tests
  and a conformance suite for community adapters.
- Add documentation, threat model, examples, changelog, SBOM, provenance and
  release signing. Never ship vendor credentials or result bundles containing
  secrets.

**Exit criteria:** clean-install test, three official adapters, documented
extension example, reproducible example bundle and release dry run all pass.

### Milestone 6 — publication package

**Objective:** create a credible empirical software/systems paper.

- Preregister research questions, hypotheses, inclusion/exclusion criteria,
  metrics, statistical analysis, threats to validity and artifact plan before
  the comparative run.
- Prepare an artifact archive: source revisions, images, configurations, raw
  data, redaction method, analysis notebooks and reproduction guide.
- Write methods before results; report effect sizes and confidence intervals,
  not only ranks. Separate framework facts from study-specific observations.
- Select a venue after the study design is stable; target fit and acceptance are
  external decisions, not project deliverables.

**Exit criteria:** independent replay succeeds and the artifact passes an
internal reproducibility review before submission.

## Immediate next 10 working days

1. Approve the initial cohort and the four executive use cases.
2. Write and review `core-v1` protocol and the scoring-weight worksheet.
3. Implement JSON Schema configuration, seed/data generator and true concurrent
   runner; add percentile/resource metrics.
4. Implement one complete reference adapter plus security negative controls.
5. Hold a go/no-go review before implementing the remaining cohort adapters.

## Non-negotiable controls

- No synthetic/smoke result enters comparative charts.
- No missing security evidence becomes a pass or an inferred score.
- No managed result is compared directly with self-hosted without a separate
  labelled cohort.
- No provider-specific optimization is applied without documenting equivalent
  configurations for the other providers.
- No paper claim exceeds the reproducible artifact evidence.
