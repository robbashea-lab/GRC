# Phase 4D implementation and verification

Date: 2026-09-22. Scope: account association, invitations, account state, client membership and retained work. No production-readiness claim.

## Architecture and behavior

1. **Identity architecture:** existing Users, Contacts, `linked_user_id`, `client_ids`, roles, bcrypt passwords, signed access tokens and existing provider sessions remain authoritative. No new identity provider or account schema replacement.
2. **Existing invitation capability:** reused `password_resets` and the existing email transport. No new delivery service. Account creation and resend use one invitation helper. Password material is not returned in administrator responses.
3. **Account state:** `active`, `invited`, `disabled` retained. New password/Google registrations explicitly set active. Legacy accounts with no status retain existing authentication compatibility; Phase 4B's stricter assignment rule still requires explicit active status. Unknown explicit states fail authentication.
4. **Contact link:** dedicated confirmed admin action replaces generic linked-user editing and silent matching-email linking. Link/unlink changes the Contact association only.
5. **Candidates:** reuse Phase 4B's bounded, searchable active, client-authorized User candidates. Contact-only, disabled, and unrelated client Users do not qualify. Current links can remain after an account becomes ineligible. Creating a new link to an account without current client access is deliberately not exposed; a retained link can have no access.
6. **Invitations:** administrator chooses a client role and confirms the Contact's client. Existing email returns a conflict with instructions to use explicit linking/membership management; no other account profile is returned and no duplicate or automatic association is created. New account emails are normalized; the existing unique index remains required. No migration/merging of historical mixed-case duplicates.
7. **Invitation state:** persisted invited state means not activated, not proof of successful email. Delivery result is sent-to-transport or unavailable. Demo explicitly reports simulated/no email. Resend is restricted to pending invitations and existing administration authority. No token copy UI. Real inbox delivery is NOT VERIFIED.
8. **Membership:** separate scoped mutation updates visible client memberships and retains all memberships outside the caller's scope. Full account mutation also rejects changes to unrelated client memberships. Compare-and-set detects concurrent membership/account state changes. Membership removal leaves Contact link and owners intact. Existing Users can be added to another client by an administrator already authorized to manage that account and destination; a client-only administrator cannot enumerate and take over another client's User.
9. **Disabled accounts:** password login, JWT lookup, stored session lookup, Google session exchange and password-reset completion reject nonactive/disabled accounts as applicable. Disabling invalidates sessions/reset links and records token revocation time. Reactivation is explicit; an account lacking established password/provider credentials must complete invitation activation, not merely be marked active.
10. **Departed Contacts:** existing inactive business-Contact behavior is unchanged. No automatic deletion, unlink, disable, membership revocation, or reassignment.
11. **Active assignments:** a scoped read-only report reuses Phase 4B operational fields for Reviews, Actions, Findings, Risks, Vendors, Policies, assets, requirements, exceptions, CIS assessments and AI systems. Each record counts once even if multiple fields reference the same User. Existing terminal states and retired/inactive/Not Applicable exclusions apply. Current approved Policy/assessed framework ownership can remain an ongoing responsibility. Reports show up to 100 rows per module with truncation disclosure and complete counts.
12. **Reassignment:** report opens the existing authoritative record drawer and existing eligible selector. Bulk reassignment is deliberately deferred. No new workflow engine, automatic reassignment, closure, or history rewrite.
13. **History:** account/Contact association and membership mutations do not update operational records. Existing historical actors remain stored. The scoped members display retains former operational owners across the shared assignment fields, including Vendor and CIS ownership. No account deletion endpoint was added.
14. **Primary Contact:** Phase 4C behavior retained: Contact selection by ID, no account creation, no invitation, inactive existing Contact retained, projection shared across Management/Portfolio.
15. **GRC Lead:** stored lead is not silently replaced after disable. Existing Phase 4C disabled/ineligible notice and explicit reassignment remain.
16. **Assignment eligibility:** shared Phase 4B active-account/client-access rules unchanged. Membership/account changes affect future candidates; unchanged persisted assignments remain readable and saveable.
17. **Policy safety:** no approval endpoints, permission gates, approver fields, business-role mappings or lifecycle logic changed. Invitation defaults to least-privileged client read-only in the Contact dialog. Business designations do not determine platform role.
18. **Server authorization:** actual FastAPI handlers tested with Super Admin, scoped platform admin, client contributor, unrelated client member, disabled and invited identities. Cross-client account management and global-scope escalation rejected. Shared membership does not authorize changing an account globally when unrelated clients would be affected.
19. **Isolation:** candidate queries, account context, directories and assignment reports are server-scoped. Contact account context returns minimal linked identity/state and a computed client-access flag, not the target's unrelated memberships. Scoped membership editor preserves hidden memberships. Unchanged account PATCH responses are also minimized.
20. **Audit:** explicit link/unlink, invite/resend, granted/removed memberships, disabled/status changes recorded through the existing audit infrastructure. Demo records simulated events. Password-reset/invitation secrets are not audit metadata. Existing source-record assignment audits remain in their own workflows.
21. **Demo differences:** isolated session adapter mirrors identity-management UX, scope rules and report behavior. No mail is sent; no real account/session is established. Activation through actual invitation delivery is not simulated. Existing Demo global Super Admin member display is retained; this is not evidence of persistent provider behavior.
22. **Persistent authenticated browser:** NOT VERIFIED. Persistent staging/database/provider delivery remains unavailable for this validation. Standard sign-in in the published frontend remains intentionally deferred. No old or uncertain database was connected, reset, or reseeded.

## Automated verification

- Backend: **164 passing unittest executions**, including inherited harness regressions. Fourteen focused identity lifecycle tests exercise real FastAPI authorization/routes with isolated Mongo-compatible mock persistence, not a running persistent database. External Google/email transport is mocked.
- Focused scenarios: explicit link/unlink without permissions/membership changes; cross-client/Contact-only exclusion; direct generic-link writes rejected; non-admin invitation/link/membership denial; scoped admin cannot manage Super Admin/global scope; existing User reuse with explicit memberships; hidden membership preservation; active work retained after disable/removal; current report deduplication/scope; disabled and invited JWT/session/password rejection; disabled Google exchange; expired/replayed/missing-account reset rejection; single-use invitation activation without automatic login; pending email unavailable/resend behavior; legacy missing-state compatibility.
- Backend regression modules: identity_lifecycle, client_relationships, assignment_eligibility, client_dashboard_sources, core_audit, action_items, evidence_context, framework_governance, seed_account_settings, standard_initialization, ai_governance, governance_integrity, management_obligations, onboarding_baseline, review_lifecycle, review_occurrences, risk_ids, risk_lifecycle, vendor_governance, people_visibility.
- Command: `PYTHONPATH=backend/tests python -m unittest <the test_ modules above> -q`, using the existing isolated workflow virtual environment. Legacy external-server test scripts were not pointed at an unknown database.
- Frontend: **49 passing suites / 286 tests**, `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand`.
- Existing tests were updated only for intentional contracts: the narrower Contact account-context endpoint and the now-required explicit invitation role/client/confirmation. New Demo rule tests cover link, invitation, disabled work, membership preservation, restricted administration and truthful feedback.
- Production preview build: `node frontend/scripts/preview.cjs build` passed. Build-time ESLint reports the same three pre-existing `load` dependency warnings in Calendar, ClientDirectory and PlatformAdmin. No standalone lint or type-check script exists; no independent type-check result is claimed. No dependencies changed.

## Browser verification

Local production-build Demo in headless Edge through Playwright; isolated fictional session fixtures, no live invitations or customer data.

| Scope | Verified behavior |
| --- | --- |
| Phase 4D | Blank login inputs, five canonical clients, explicit scoped link/unlink and reload persistence, pending simulated invitation with explicit role, Contact-only/foreign/disabled exclusion, retained work after disable, report opens authoritative Review, explicit re-enable, membership removal retains other client/link/history, no-access presentation, desktop dialog fit and Escape, logout without a standard token. |
| Phase 4B | Reviews, Actions, Risks, Vendors, Policies and CIS selectors; eligible client/internal/global candidates; disabled/current-owner preservation; same-name cross-client exclusion; search, save/reload, intentional reassignment, Vendor Review source, CIS Contact process owner distinction; Manage people retains original draft. |
| Phase 4C | Primary Contact create/select/inactive retention; no User auto-creation; scoped internal GRC Lead and disabled notice; Management/Portfolio projection equality; client switching. |
| Smoke | Dashboard, Calendar, Reviews, Actions, Risks, Vendors, Policies, Contacts, Evidence, Onboarding, Client Settings, CIS and Users & Access; no uncaught page errors in the scripts. |

This is **Demo-browser verified**, not persistent-backend-browser verified. API authorization tests are separate and include nonsuper identities. Real mail delivery, real OAuth-provider exchange, durable database concurrency and independent security review remain NOT VERIFIED.

## Boundaries, intentional deferrals and decisions

- No new roles, membership inference, Contact-to-User conversion, automatic invitations, Policy approval authority, authentication bypass, dashboard metric changes, or source workflow changes.
- Narrow onboarding safeguard only: Contact business-field upserts no longer set or clear `linked_user_id`. Onboarding still creates the same business records; identity associations must use the explicit account-link action.
- Link/unlink and membership updates use conditional writes. Account creation, invitation transport and Contact linking are not one database/mail transaction. If a Contact association changes concurrently, return a conflict instead of overwriting it; the explicitly created invitation/account remains available for administrator reconciliation. A token claimed before a failed account update is consumed; request a new link rather than replay it. No workflow retries pretending success.
- Pending account reactivation before initial credential setup is not faked. Returning such an account to invited status and resending requires explicit administration; a dedicated recovery UI can be added later.
- Existing global platform-admin semantics are not expanded: global client read scope does not automatically confer Super Admin account-management authority. Broader management authority and linking accounts without current client scope need a separate product/security decision.
- No new cross-client existing-account discovery or membership-request system. Authorized Super Admin can reuse an account through existing Users & Access; a scoped admin may manage only already-authorized identities/scope.
- Bulk reassignment deferred; manual reassignment via existing record controls is supported. No historical actor mutation.
- No data migration/startup changes, destructive initialization, or persistent data writes during testing. No new frontend credential handling, environment files, secret values, lockfile changes, or debugging artifacts are part of this change.
- Final diff reviewed for scope and credentials. This is self-review, not independent assurance. Independent authorization/security review and persistent staging QA are recommended before enabling real authentication.

## UI preservation

The better-ui and emil-design-eng skills guided reuse of existing dialogs, selectors, drawers, neutral tokens and density, without new motion or redesign.

| Location | Before | After | Why |
| --- | --- | --- | --- |
| Contact account actions | Implicit invitation/link and token-copy feedback | Explicit confirmed link/unlink/invite; pending/unavailable feedback | Clear identity/access separation without new visual language |
| Users & Access | Count-only disable warning and raw invite links | Scoped report into existing record drawers; no secret-copy interface | Deliberate reassignment and accurate delivery state |
| Assignment report menu | Modal/menu focus timing conflict found in browser | Open report after menu close/focus lifecycle | Reliable keyboard/modal interaction |

Changed flows verified in Demo browser; touch-device and screen-reader verification not performed. Approve only this inspected UI scope, not whole-application accessibility conformance.

## Release

Commit hashes and deployment result are reported in the handoff after the exact tested source is committed. Publishing updates the isolated Demo frontend, not the persistent backend or real authentication.
