# Architecture

Orcheval is organised around a minimal core model that knows only evaluation primitives: target, workload, execution, observation, measurement, assertion, gate, metric and result.

The framework separates:

- core evaluation logic;
- adapter implementations;
- workload profiles;
- mandatory security gates;
- optional metrics;
- instrumentation and evidence capture.

This keeps the framework neutral and prevents product-specific assumptions from leaking into the core.

The engine resolves an explicit profile, targets, gates and metric plugins. It runs
every required scenario for each target, persists observations and trace events,
then evaluates gates separately from metrics. A mandatory `FAIL` suppresses
admissibility; a mandatory `NOT_VALIDATED` produces an incomplete result and also
suppresses admissibility.

The initial bundled targets are local contract simulators. The same
`EvaluationTarget` contract will be used by live Hatchet, Temporal and Inngest
adapters, but a simulated target is always labelled `SIMULATED` in evidence and
never produces a passing security-baseline result.
