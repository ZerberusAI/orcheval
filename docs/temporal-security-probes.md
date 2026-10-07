# Temporal local security probes

`run-temporal-security-probes.sh` is a disposable negative-control experiment.
It deliberately gives an unrelated client the same local-dev namespace access,
then attempts to read and cancel a waiting workflow owned by another tenant.

Expected result for the current Temporal development server is `FAIL`: it has no
authentication or authorization boundary, so the client can read and cancel the
victim workflow. This is a configuration finding for this lab—not a claim about
Temporal deployments configured with namespace authorization, mTLS, or an
application-level access-control boundary.

The probe also verifies that cancelling the victim does not stop an unrelated
control workflow and that the Temporal history contains the relevant audit events.
Secret redaction and physical worker-loss recovery remain `NOT_VALIDATED`.
