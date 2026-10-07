# Core-v1 reference workload

The first live reference adapter evaluates a credential-free order-fulfilment
application on Temporal. It is source-controlled with Orcheval so every provider
adapter can implement the same public workload contract later; it is not a
product workload or a claim about a user's application.

The workload covers all ten `ai-orchestration` scenarios. It uses three measured
repetitions, one warm-up run and concurrency levels 1 and 5. Every execution has
a deterministic ID and tenant assignment derived from seed `20261007`.

| Scenario | Reference behaviour | Independent assertion |
| --- | --- | --- |
| ORCH-01 | Five sequential fulfilment steps | exact ordered steps and output |
| ORCH-02 | Three parallel tool activities, then aggregation | exact activity set and result |
| ORCH-03 / 08 | Tenant/load dispatch | identity and terminal result |
| ORCH-04 | Controlled transient failure before a consequential operation | observed retry and zero duplicate ledger writes |
| ORCH-05 | Controlled recoverable activity fault | observed retry; **not** a physical worker-kill claim |
| ORCH-06 | Wait for approval, then resume | lifecycle barrier and terminal output |
| ORCH-07 | Wait for cancellation, then cancel | lifecycle barrier and `CANCELLED` outcome |
| ORCH-09 | Context hydration path | exact steps and result |
| ORCH-10 | Temporal workflow version marker | exact steps and result |

Run it in the isolated Docker lab:

```sh
sh infra/local-evaluation/run-temporal-core-v1.sh
```

The helper saves immutable evidence beneath `results/core-v1/`, then removes only
its own Temporal containers, network and volumes. It never mounts a Docker socket,
home directory, or writable host project directory into the runtime.

## Boundaries

This run establishes live Temporal integration and workload-correctness evidence.
It intentionally does **not** establish tenant isolation, secret handling,
identity substitution resistance, cancellation scope, audit integrity, recovery
integrity or cross-run isolation. Those fields remain `null`, so the mandatory
security baseline reports `NOT_VALIDATED` and the bundle is `INCOMPLETE`.

The resource metric measures the shared evaluator process, not Temporal container
CPU/memory, and cost is unavailable for this self-hosted local experiment. Neither
metric is a provider ranking. The ORCH-05 fault is a controlled activity failure;
a separate worker-termination experiment is required before making a worker-loss
recovery claim.
