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
