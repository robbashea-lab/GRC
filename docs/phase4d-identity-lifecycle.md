# Phase 4D identity lifecycle

## Inspected baseline (before implementation)

| Boundary | Current authoritative source | Identified issue / intended change |
| --- | --- | --- |
| Account | `users`, unique email index; local bcrypt/JWT and existing Google session provider | Check authoritative account state on every authenticated request, including existing sessions. Preserve provider architecture. |
| Account state | `active`, `invited`, `disabled`; legacy accounts can lack status | Pending invitations must not authenticate before activation. Preserve legacy missing-status authentication compatibility; new accounts explicitly active. |
| Contact | `contacts`, optional `linked_user_id`, independent business roles/status | Replace implicit email linking with explicit authorized association; linking never grants membership. |
| Membership | `users.client_ids`; existing global internal-role semantics | Keep explicit membership independent of link. Scoped administration must not mutate unrelated clients or global accounts. |
| Assignment | `assignment_eligibility.py`, shared operational fields | Preserve active-user and authorized-scope baseline; unchanged stored assignments remain readable. |
| Invitations | Existing password-reset token storage and email sender; invited account state | Existing Contact invitation silently links matching email; admin responses expose raw links; resend does not send. Require explicit role/context, no token responses, accurate delivery result. |
| Reset | Hashed random token, expiry, used flag | Activation missing; token consumption non-atomic; disabled-account reset possible. Claim once and conditionally update still-eligible account. |
| Account administration | Internal admin routes; platform admin overlap check | Overlap alone cannot authorize global changes affecting unrelated clients or Super Admin accounts. |
| Departed work | Existing open-assignment counts | Counts currently unscoped/incomplete. Provide scoped active records, preserve owners; defer bulk reassignment. |
| History | Actor IDs on source records and audit log | Do not delete accounts, rewrite actors, clear owners, or silently reassign. |
| Primary Contact / GRC Lead | Phase 4C stored authoritative references/projection | No lifecycle side effects from changing business designations. |
| Demo | Isolated browser session adapter | Must mirror explicit lifecycle UX without real email, real accounts, or standard authentication. |

## Boundaries and verification plan

Contacts, links, membership, permissions, and assignment eligibility remain distinct. No new roles, provider, invitation transport, approval authority, or automatic reassignment. Existing User reuse requires an explicitly authorized membership action; matching email alone must not link or disclose another tenant's account.

Test actual backend routes with isolated in-memory persistence and real authorization logic, including scoped platform admin, contributor, unrelated client, disabled and invited accounts, membership removal, token expiry/replay, and historical ownership preservation. Mock only external email/provider transport. Demo browser tests are not persistent authenticated-backend browser verification.

References consulted: OWASP [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) (random, stored securely, expiring, single-use tokens; no automatic login) and [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) (server-side per-request authorization and least privilege). No whole-standard compliance claim.

## Delivery status

Implementation completed locally; verification and environment limitations are recorded in `phase4d-verification.md`. Persistent authenticated-browser verification is a separate release gate, not implied by Demo tests.
