# Security model

Orcheval treats security and correctness as mandatory admissibility gates. A runtime may be measured and compared only after it passes the required gate set for the selected policy profile.

Key rules:

- mandatory gates are not treated as weighted metrics;
- failed mandatory gates suppress comparative suitability conclusions;
- raw evidence remains visible even when a gate fails;
- policies must be explicit and reproducible.

`NOT_VALIDATED` is not a pass. It means the current evidence cannot establish the
condition, and prevents an admissibility claim for a required gate. The initial
security-baseline pack records all eight planned SEC assertions. Each live adapter
observation declares tenant leakage, secret exposure, identity substitution,
duplicate side effects, cancellation scope, audit completeness, recovery
completeness, and cross-run leakage. A simulator may exercise those contracts, but
its result remains `NOT_VALIDATED` because it is not evidence about a vendor runtime.
