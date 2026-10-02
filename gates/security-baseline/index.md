# Security baseline gate pack

This gate pack contains the mandatory admissibility checks for the initial orchestration-focused profile.

## Required gates

- SEC-001 Tenant isolation
- SEC-002 Secret handling
- SEC-003 Retry safety
- SEC-004 Execution identity integrity
- SEC-005 Cancellation integrity
- SEC-006 Audit trace integrity
- SEC-007 Failure recovery integrity
- SEC-008 Unsafe cross-run state leakage

## Result model

The gate evaluation returns PASS, FAIL or NOT_VALIDATED and must not be converted into a weighted score.
