# Orcheval

Orcheval is a policy-driven open-source framework for evaluating orchestration runtimes using reproducible workloads, mandatory security gates and configurable operational metrics.

The project is intentionally neutral. It does not rank vendors globally. It executes repeatable workloads, applies mandatory security gates and exposes evidence that teams can evaluate using their own priorities and weights.

## Project intent

- evaluate orchestration platforms against reproducible workloads;
- enforce security and correctness as admissibility gates;
- keep optional metrics separate from mandatory safety criteria;
- preserve raw evidence and allow policy-based comparison without universal ranking.

## Phase 1 scope

Phase 1 focuses on the orchestration/evaluation core and a credible v0.1 release.

- public OSS repository and governance baseline;
- core contracts and evaluation engine;
- official profile: `ai-orchestration`;
- reference adapters: Hatchet, Temporal, Inngest;
- security gate pack: `security-baseline`;
- evidence capture and reproducible result bundles;
- CLI-driven evaluation and reporting.

## Current implementation status

The repository now provides the Phase 1 contracts, the complete `ai-orchestration`
scenario set, evidence/result bundles, a security-baseline gate, and local CLI
execution. The bundled Hatchet, Temporal and Inngest targets are deterministic
contract simulators. They exercise the framework locally but deliberately produce
`NOT_VALIDATED` mandatory-gate results, so they cannot be interpreted as vendor
validation or a benchmark. Live target adapters and their integration environments
are the next Phase 1 delivery item.

## Phase 2 scope

Phase 2 expands the framework into a broader runtime assurance platform, including:

- plugin-based extension model;
- container and compute runtime evaluation;
- durable execution, multi-tenant SaaS and container runtime profiles;
- richer cost, correctness and efficiency metrics;
- policy packs and supply-chain security hardening.

## Repository layout

```text
orcheval/
├── .github/
├── packages/
├── adapters/
├── profiles/
├── gates/
├── metrics/
├── policies/
├── examples/
├── docs/
├── tests/
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── ROADMAP.md
├── package.json
├── tsconfig.json
├── .gitignore
└── zerberus-orcheval-two-phase-open-source-plan.md
```

## Local development

```bash
npm run build
npm test
npm run lint
npm run eval:local
```

## Security

See [SECURITY.md](SECURITY.md) for supported versions and responsible disclosure instructions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, standards and contribution expectations.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
