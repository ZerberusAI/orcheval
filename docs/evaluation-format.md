# Evaluation format

Orcheval uses YAML-driven evaluation definition files to describe:

- the selected profile;
- target runtimes;
- gate configuration;
- metric configuration;
- load and fault characteristics;
- repetition counts.

The framework resolves this configuration into a reproducible run with immutable output artifacts.
