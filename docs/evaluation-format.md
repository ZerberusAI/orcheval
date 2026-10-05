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

## Replaying a bundle

`config.resolved.yaml` preserves the configuration version, evaluation name,
profile, ordered target/gate/metric selections, repetitions, concurrency and
faults. Defaults are made explicit. An empty `metrics: []` disables optional
metrics; omitting `metrics` selects the defaults. An empty `faults: []` injects no
faults. Repetition and concurrency values must be positive integers. Only
configuration version 1 is supported.

The parser supports the documented YAML subset, including block lists, quoted
strings and empty lists. It is not a general-purpose YAML parser. Exports use
quoted strings so names containing quotes, hashes or line breaks survive replay.

Using the repository's existing Node entry point:

```bash
node --experimental-strip-types packages/cli/index.ts validate results/<run-id>/config.resolved.yaml
node --experimental-strip-types packages/cli/index.ts run results/<run-id>/config.resolved.yaml --output results
```

Each execution receives a UUID-based run id. The bundle writer exclusively
creates its run directory and refuses an existing directory, even when two
writers race. Existing artifacts are never overwritten by the writer. A failed
write removes only the incomplete directory that invocation created. These are
application-level protections; the files are not tamper-proof or filesystem
read-only.

## Fingerprints and provenance

`environment.json` contains two different SHA-256 hashes:

- `configurationHash` identifies the complete resolved evaluation configuration.
- `fingerprint` identifies that configuration plus the reproduction manifest.

`manifest.json` records the framework package version and available Git identity,
profile version and scenario definitions, selected gate/metric versions, and
target runtime mode/version plus any supplied adapter, SDK and image versions.
The fingerprint hashes `{ config, manifest }`, with object keys sorted recursively
and array order preserved. The manifest in that calculation excludes the two
hash fields stored alongside it in `manifest.json`.

Target, gate and metric selection order is preserved during execution. Changing
settings, selections or recorded component versions changes the fingerprint;
timestamps, execution ids, output paths and machine details do not participate.
Equivalent object key insertion order does not affect the hashes. Replaying the
same settings and manifest yields the same fingerprint, with a new run id.
Fingerprints produced before this format change are not directly comparable.

Environment metadata captures Node, OS release, architecture, CPU model/count
and host RAM at evaluation start. Framework version comes from `package.json`.
The framework checkout supplies its actual Git revision and dirty status when
available. A dirty checkout is explicitly flagged: the commit and fingerprint
do not identify the exact uncommitted source. Source must be committed or
separately preserved for exact reproduction.

Missing metadata is recorded as `null` with limitations, rather than invented.
An empty SDK map or image list means the adapter explicitly reported none.
Docker is not invoked or contacted; its version remains unknown in this stage.
Host resource metadata does not measure per-execution resource usage. A matching
fingerprint identifies recorded inputs, not identical performance or successful
security validation.

Run `orcheval doctor [target]` before a live evaluation to inspect a target's mode,
version, capabilities and health. A `SIMULATED` result confirms that no live runner
has been configured and cannot be used for vendor validation.
