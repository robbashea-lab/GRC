# Phase 7 — approval authority

## Inspection before implementation

The existing Policy stores a User-backed owner, an optional `approver_id`
business designation, version text, lifecycle state and actor/date histories.
There is no distinct reviewer, approval permission, reporting hierarchy or
separation-of-duties constraint. Generic edits cannot approve, but could previously
set pending state. Submission and decisions did not require valid prior state.
Only scoped super/platform admins could approve or return to Draft; approval
overwrote the named approver. Verification separately records externally reported
approval, explicitly not an in-app decision. Contacts link to accounts explicitly;
linking, invitations, membership and assignment eligibility are separate.
The static Demo mirrors workflows in session storage; it is not backend auth.

## Minimal authority contract

- Preserve owner assignment and legacy approver designation/attribution.
- A named business Contact conveys no permission, regardless of title or linkage.
- A scoped internal administrator can explicitly delegate approval of ONE Policy
  to an active account already authorized for that client. This does not change
  roles, memberships, invitations or general editing rights.
- A read-only client account may decide that explicitly delegated Policy, not
  edit it or configure its authority. Authorization is checked server-side on
  every decision against current account state and client access.
- Preserve scoped internal administrative approval, clearly identified as such.
  It does not impersonate the named business approver.
- Existing self-approval remains permitted; no modeled reporting hierarchy or
  established segregation rule exists. Do not claim segregation-of-duties enforcement.
- Only a submitted round can be decided. A request identifier and conditional
  single-document update protect against duplicate/stale decisions. Status and
  decision history are committed together. Pending content/authority is locked.
- History retains actor identity at decision time; disabled users cannot newly
  decide, but historical attribution remains visible.

## Sources and boundaries

[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html):
least privilege, deny by default and validate permissions on every request.
[MongoDB atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/):
conditional single-document updates for decision and history consistency.
These are implementation guidance, not a claim of ASVS certification.
Version/artifact binding belongs to Phase 8. Persistent multi-user browser
verification belongs to Phase 9; Demo verification is labelled separately.
