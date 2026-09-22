# Phase 4B assignment contract and inspection matrix

Baseline inspected: b11835c8cf95ec2d439dd16796c82805824dbd44.
This matrix records the existing system before implementation. Assignment is
accountability, not authorization to perform or approve work.

## Existing sources and rules

`members` means GET /clients/{client_id}/members: all member account states,
plus historical orphan owners for platform administrators. `users` means the
administrator-only GET /users directory. Neither is an eligibility contract.
The account has one platform role and client_ids, not separate per-client roles.

| Surface | Existing candidate source | Identity / existing write validation | Disposition |
| --- | --- | --- | --- |
| Review Owner; Raise Finding owner | members | User; existence and client access, not active state | Shared operational baseline |
| Review reviewer_id | generic schema/users; absent dedicated Review form | User; incomplete validation | Same baseline; no new UI field |
| Action Assignee, standalone and source-linked | members; generic users for bulk | User; existence and client access | Shared baseline; retain legacy owner attribution |
| Finding Owner | generic users; members when opened from Review | User; governance accountability, not validator; creation-path checks differ | Shared baseline, not Action/validator role merging |
| Risk Owner / treatment Action assignee | members; generic drawer receives parent users | User; existence and scope | Shared baseline; no separate Risk Process/Treatment Owner model exists |
| Vendor Business Owner | members | User (not Contact); existence and scope; feeds Review ownership | Shared baseline without changing identity model |
| Vendor Review Owner | Review owner; legacy schedule dialog users | User; legacy schedule endpoint ignores owner/reviewer inputs | Use actual Review assignment; do not change scheduling semantics silently |
| Policy Owner; Verify Policy owner | generic users | User; no equivalent generic eligibility check | Shared account/scope baseline; no approval grant |
| Policy Approver / Verify reported approver | generic users | User; named responsibility and historical approval actor share field | Approval semantics excluded; requires later Policy phase |
| Policy Reviewer | no separate field | Linked Review ownership | Review contract only |
| CIS Assessment Owner | members | Active User and client access | Shared baseline; preserve current assignment on unrelated edit |
| CIS Process Owner | client-scoped contacts | Contact in same client | Intentional business responsibility exception, unchanged |
| AI business / technical / oversight owners | members | Active User and client access | Shared baseline; no new AI permissions |
| Asset / legacy Requirement / Exception Owner | generic users | User; uneven validation | Shared baseline where existing operational User field |
| Exception Approver | generic users | Named User separate from acting approval role | Approval exception, unchanged |
| GRC Lead | users filtered to super_admin/platform_admin in Client Management | User; separate client relationship responsibility | Phase 4C; source/display unchanged |
| Contact linked account | generic users | Explicit identity link, not assignment | Phase 4D; linking/invitations unchanged |
| Evidence uploader / historical actors | captured actor IDs and names | System attribution; no assignment selector | Unchanged |
| Onboarding-generated work | explicit owner inputs or caller; CIS starts unassigned | Existing generation workflow | Inspection only; onboarding unchanged |

## Shared operational eligibility

New choices require an actual User with authoritative status `active` and the
existing `_can_access_client` relationship: membership, Super Admin global scope,
or Platform Admin global scope when its client_ids is empty. A scoped Platform
Admin is not global. No new role or access is granted by assignment. Existing
operational validators do not require the assignee to be a writer; adding that
restriction would be a separate product decision, not a normalization fix.

Contact existence, names, email matching, business titles and linked account
labels never establish assignment eligibility. Client-only foreign Users are
excluded even when their name matches an eligible User. Missing/unknown account
status, invited and disabled accounts are not new candidates.

Existing assignments may be retained unchanged, including former/disabled Users.
That exception must compare the actual persisted assignment on the same record;
it is not permission to copy that person onto a new record. No automatic clearing
or reassignment. Historical display remains separate from candidate retrieval.

## Verification plan and trust boundaries

Test active member, Contact-only, scoped internal, foreign-only, disabled and
Super Admin across equivalent fields. Include same names, global versus scoped
Platform Admin, missing state, empty membership, candidate payload minimization,
bounded retrieval, unauthorized caller, changed assignment and unchanged legacy
assignment. Browser checks must separately verify save/reload and Manage people.
An in-memory API test is not a live persistent-backend or browser-authentication test.

Server-side checks, not selector visibility, protect assignments. Candidate
responses must not include account configuration, membership lists, credentials
or unrelated client profiles. A stored historical ID must not turn the candidate
API into an arbitrary user-lookup endpoint.

Security reference consulted: OWASP Authorization Cheat Sheet, sections
Enforce Least Privileges, Deny by Default, Validate the Permissions on Every
Request, and Create Unit and Integration Test Cases for Authorization Logic:
https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Delivery status

Inspection complete; implementation and test results are recorded separately.
No completion, browser verification or publication is implied by this matrix.
