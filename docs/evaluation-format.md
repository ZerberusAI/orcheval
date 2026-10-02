# Evaluation format

Orcheval uses YAML-driven evaluation definition files to describe:

- the selected profile;
- target runtimes;
- gate configuration;
- metric configuration;
- load and fault characteristics;
- repetition counts.

The framework resolves this configuration into a reproducible run with immutable output artifacts.

The Phase 1 CLI supports `version`, `evaluation.name`, `profile.id`, `targets`,
`gates`, enabled `metrics`, `runs.repetitions`, `load.concurrency` and `faults`.
`orcheval validate evaluation.yaml` rejects unknown targets, profiles, gates and
metrics. `orcheval run evaluation.yaml` writes a directory containing the resolved
configuration, environment, raw observations, trace events, gates, metrics,
comparison and Markdown report.
