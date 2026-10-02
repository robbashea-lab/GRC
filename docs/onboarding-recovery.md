# Onboarding recovery

Both `POST /api/onboarding/finalize` and `POST /api/onboarding/baseline` with
`finalize: true` require an `Idempotency-Key`. The active onboarding screen retains
that key and the original body while completion is uncertain. It disables draft
changes and offers **Retry completion**. Ordinary draft saves remain optimistic
updates and do not need a create receipt.

The server authenticates and authorizes the caller and acquires the existing
client configuration lease before accessing any receipt. Receipts are scoped to
the actor, client, route and request key; a changed body with the same key is a
conflict. A completed retry returns the original response without changing newer
records. An in-flight competing request receives a conflict and can retry.

Before the first business write, onboarding validates its snapshots and freezes
the intended rows, target IDs, expected versions, audits and response in the
existing `create_requests` collection. New legacy intake IDs derive from the
request identity; baseline records keep their existing client/catalog IDs.
Each write uses either Mongo's unique `_id` boundary or a version-conditional
update. A retained internal `_onboarding_request` marker and receipt checkpoints
recognize writes whose acknowledgment was lost, including when an operator has
subsequently edited that record. Retrying never reapplies a completed row.
Legacy intake also checks new operational owners through the existing assignment
eligibility validator and requires assessment Evidence to be available in the
same client before storing the plan.

Framework reconciliation remains its existing deterministic operation and keeps
Reviews authoritative. Receipt checkpoints prevent replaying an already finished
reconciliation. Initial baseline history and current baseline state are written
together on the client, with a frozen completion snapshot. Audit records use the
existing deterministic create-request audit mechanism.

A storage or dependency failure returns `503` and leaves the receipt pending.
Retry the same key and body. An unapplied target that another operator changed
returns `409` and preserves that operator's record; reload and reconcile the
conflict rather than overwriting it. Preparation errors carry
`X-Create-Rejected: true`, proving that no business write began and allowing the
form to correct its input. Receipts must not expire while old requests can replay.
The UI retains its request in memory, so keep the page open during recovery.

Demo implements the same request and snapshot contract, but its persistence
boundary is different: one session-storage commit saves both the command's
records and replay receipt. A failed storage commit saves neither. Demo tests are
not evidence of Mongo durability.

## Verification

`backend/tests/test_onboarding_recovery.py` injects persistence failures before a
pending write, after a write's acknowledgment is lost, during audit storage and
during framework reconciliation. It checks exact retries, concurrent retries,
preservation of later edits and history, changed-body conflicts, missing request
identity, authorization and pre-write rejection of invalid recurring dates.
These tests use the real FastAPI routes with isolated in-memory Mongo behavior.
`backend/scripts/verify_mongo_recovery.py` additionally executes them against an
explicit disposable loopback MongoDB, including lost acknowledgments, replay and
new-reference validation; the verified local run used MongoDB 8.0.28.

`frontend/src/preview/onboardingReplayContract.test.js` uses the raw Demo adapter
to verify missing keys/versions, stale source records, storage failures, replay,
changed payload rejection, later edits and tenant isolation. The onboarding
component test verifies that a retry retains its original body/key and blocks
draft changes while completion is uncertain.
Draft-save failures are separate: completion retries the draft with its current
concurrency token, and a failed draft retry leaves editing available rather than
locking a completion request that was never submitted.
Existing workflow tests use
`commandTestAdapter.js` to model fresh form intents; missing-key and stale-token
contract tests bypass that helper.

No migration is needed: markers and receipts are additive, historical record IDs
remain unchanged, and new intake matching retains existing records. Historical
callers of the legacy finalization API must send and retain `Idempotency-Key`.
