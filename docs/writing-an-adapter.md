# Writing an adapter

An adapter implements the public evaluation-target contract with context-specific semantics for the runtime under test.

At minimum, an adapter must provide:

- metadata;
- setup;
- health checks;
- execution and cancellation;
- observation of completed executions;
- teardown.

Adapter-specific concepts belong inside the adapter, not in the framework core.
