# Contributing

## Local setup

1. Clone the repository.
2. Use Node.js 18 or later.
3. Install dependencies with your preferred package manager.
4. Run the project commands documented in the root README.

## Coding standards

- prefer clear, small and explicit contracts;
- keep adapter-specific logic out of the framework core;
- design for reproducibility and evidence preservation;
- make security and correctness outcomes explicit and auditable.

## Adapter contribution model

- adapters must implement the common evaluation target contract;
- adapters must expose health, execution and observation semantics consistently;
- adapters must provide reproducible evidence for each run;
- adapter-specific assumptions must stay behind the public adapter boundary.

## Metric-plugin contribution model

- metrics must return raw evidence and a normalised measurement;
- metric output must separate measured facts from derived or subjective score interpretations;
- metric limitations and confidence must be clearly documented.

## Reproducibility and security requirements

- tests must be reproducible;
- security tests must be included for relevant changes;
- vendor claims must be backed by executed evidence, not marketing assertions;
- public ranking claims must not be framed as neutral framework results.

## Pull requests

Pull requests should clearly describe:

- feature, adapter, metric or security-gate change;
- tests added;
- security impact;
- reproducibility impact;
- documentation impact;
- vendor affiliation, if relevant.
