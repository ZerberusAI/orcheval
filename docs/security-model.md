# Security model

Orcheval treats security and correctness as mandatory admissibility gates. A runtime may be measured and compared only after it passes the required gate set for the selected policy profile.

Key rules:

- mandatory gates are not treated as weighted metrics;
- failed mandatory gates suppress comparative suitability conclusions;
- raw evidence remains visible even when a gate fails;
- policies must be explicit and reproducible.
