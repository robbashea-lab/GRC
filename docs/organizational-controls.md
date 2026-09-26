# Client-owned organizational Controls

Approved direction, 2026-09-26: criterion assessments are independent judgments;
organizational Controls are reusable client-owned operating records.

## Implementation contract

- Add an additive `organizational_controls` collection, not another Review,
  Evidence or remediation engine. Each Control maps to one or more assessment IDs
  and references existing Reviews, Evidence, Policies, Findings, Actions, Risks
  and Vendors. Only SOC 2 exposes this workflow in this release.
- Program administrators create, reconcile, map and edit Controls. Existing
  authorized client readers may inspect them. This matches existing framework
  configuration/link administration; no new client privilege is inferred.
- Explicit, idempotent migration groups exact legacy control IDs within one
  client. It never merges across clients, matches by name, deletes source fields,
  or edits assessment/history snapshots.
- Preserve every legacy description/period observation with its criterion,
  assessment, time and actor. Only unanimous current design fields become the
  initial shared design. Conflicting fields remain unset and require an explicit
  operator reconciliation note; no source wins by ordering.
- Mapping a Control, revising its design or recording operation never changes a
  criterion's status, applicability or assessment history. Original criterion
  annotations become read-only after migration to avoid competing authorities.
- Revision history retains design, owner, frequency, mappings and relationships.
  New period observations snapshot the actual Control revision at recording time.
  Legacy observations are explicitly legacy criterion observations, not inferred
  shared operating conclusions. No prescribed sample count or frequency is added.
- Same-client authorization and relationship validation occur on the server.
  Mutation uses optimistic concurrency; create uses a stable request identity.
  Migration retries complete additive inserts without overwriting resolved work.
  An additive assessment metadata fence prevents in-flight legacy edits from
  racing migration. Assessment values and history are unchanged. If interrupted,
  rerun migration; do not clear the fence and re-enable competing legacy edits.
- Evidence remains in its original Library/occurrence. A Control links it; it
  does not copy the file or change its original attribution. Reviews remain the
  source of execution dates and immutable occurrences.
  Evidence Library links back to current and historical Controls. Removing a
  current link cannot erase a design/period snapshot or its retained Evidence.

## Verification gates

Test equal/conflicting/missing legacy IDs; current and historical observations;
idempotent migration; source preservation; client separation; denied client-role
mutations; cross-client links; stale edits; disabled owners; mapping one Control
to two criteria without copying conclusions; design changes across observation
periods; shared Evidence; persistence and browser conflict reconciliation.

No deployment or destructive migration is part of this change.
