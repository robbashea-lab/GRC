# Phase 4B — assignment eligibility verification

22 September 2026. See [inspection matrix](assignment-eligibility.md) for every
inspected surface, its prior query, identity semantics and intentional exceptions.

## Implemented

- `backend/assignment_eligibility.py`: shared active-account/client-scope contract
  and changed-reference validation. Existing RBAC and `_can_access_client` remain
  authoritative. No role, client membership, account, invitation or authentication
  changes; no migrations, reseeding or persistent data operations.
- GET `/api/clients/{client_id}/assignees`: caller authorization, literal name/email
  search, bounded pages (default 50, maximum 100), stable tie-breaking by User ID,
  and only ID/name/email in responses. No arbitrary historical-person lookup.
- Shared checks cover generic create/update and bulk preflight, Review-to-Finding,
  Finding-to-Action, Policy verification owner, CIS assessment and AI ownership.
  Exact unchanged stored assignments survive disabled/removed eligibility. Explicit
  Unassigned on new Finding remediation no longer falls back to the Finding owner.
- `AssigneeSelect`: existing popover/input/button primitives, neutral styling,
  keyboard focus/Escape, search, selected indicators, pagination, loading, empty,
  error/retry and client/session stale-response protection. Historical names are
  display-only and never candidate sources.
- Applied to Review configuration and Raise Finding; Action assignee; generic
  Finding/Risk/Policy/Asset/Requirement/Exception ownership; Risk/Vendor creation;
  Vendor editing; Policy Verify owner; CIS Assessment Owner; AI business/technical/
  oversight owners; generic bulk-owner picker. Source-specific Actions use the
  same Action field. Actual Vendor Review ownership uses the Review drawer.
- Demo adapter mirrors the contract, stays session-local, and never authorizes
  standard requests. Its previous scoped-Platform-Admin inconsistency is corrected.
- Manage people opens the current client's existing Contacts & Roles in a separate
  same-origin tab, clears the opener before navigation, and leaves the original
  draft/assignment unchanged. No creation, invitations or linking side effects.

## Intentional differences and unresolved product choices

- CIS Process Owner remains a client Contact; the Assessment Owner is a User.
- Vendor Business Owner is already a User in this model and feeds recurring
  Review ownership. This work does not convert Contact responsibility to a User.
- Finding Owner is issue/governance accountability, not remediation execution or
  validator authority. No responsibilities were merged.
- Policy Owner is a User reference. Policy/Exception Approver selectors and
  actual approval checks are not normalized: named recipient versus actual
  approval actor remains a later Policy-approval decision.
- Existing operational owner rules do not require the owner to be a writer.
  Client-authorized active accounts therefore retain that eligibility; assignment
  does not grant edit/complete/approve rights. A narrower role policy needs product
  approval. Internal/global access follows existing scope, never job titles.
- There is no distinct Policy Reviewer or Risk Process/Treatment Owner selector.
  Linked Reviews and treatment Actions use their own operational ownership.
- The legacy Vendor schedule endpoint ignores owner/reviewer inputs; no scheduling
  semantics were silently changed. Use the actual linked Review for assignment.
- Onboarding generation, automated ownership propagation and historical actor
  lookup sources are preserved; this is not a rewrite of generation or history.
- Phase 4C: Primary Contact / GRC Lead source and display reconciliation deferred.
- Phase 4D: invitation, account linking, provisioning and disabled-session
  enforcement deferred. Existing access-state ambiguity is not relabeled as proof
  of authentication or invitation acceptance.

## Automated verification

**141 backend test executions passed**, using `python -m unittest ... -q` with the
existing isolated HTTPX/FastAPI/MongoMock harness (some inherited harness tests
are repeated). Suites: assignment_eligibility, client_dashboard_sources,
core_audit, action_items, evidence_context, framework_governance,
seed_account_settings, standard_initialization, ai_governance,
governance_integrity, management_obligations, onboarding_baseline,
review_lifecycle, review_occurrences, risk_ids, risk_lifecycle,
vendor_governance, people_visibility.

New API/rule coverage: active member, Contact-only, scoped internal staff, global
internal staff, Super Admin, same-name foreign User, foreign scoped administrator,
disabled, invited, unknown state and missing account; unauthenticated/foreign
caller; minimal payload; literal search/bounds/paging; all declared operational
fields; create/update retention across core modules; legacy Action attribution;
explicit Unassigned; bulk preflight rejects mixed-client assignment before writes.

**274 frontend tests across 47 suites passed**, using
`craco test --watch=false --runInBand`. Includes shared Demo contract, selector
state/cancellation, historical retention, empty/error behavior and existing
Phase 4A, workflows, navigation, dashboard, evidence, authentication-UI and design
regressions. Selector unit tests substitute the portal/focus primitive to isolate
candidate-state behavior; real popovers are exercised in browser QA, not mocked
as proof of browser accessibility.

**Production build passed** via `node frontend/scripts/preview.cjs build`.
Integrated ESLint retains three existing hook-dependency warnings in Calendar,
ClientDirectory and PlatformAdmin. No separate lint/type-check script is configured;
this is JavaScript/JSX, not a separately type-checked TypeScript application.
No dependencies, lockfiles or test assertions were weakened.

## Browser verification

Real Edge/Playwright against the local production build; isolated Demo fixtures,
not real accounts or persistent backend data. Super Admin Demo actor.

| Surface | Candidate matrix | Save/persistence exercised |
| --- | --- | --- |
| Reviews | active client/internal/Super Admin included; Contact/disabled/same-name foreign excluded | changed owner and unchanged disabled owner saved; reload checked |
| Actions | same matrix | assignment saved/reloaded; Manage people retained original draft |
| Risks | same matrix | existing Risk owner saved/reloaded |
| Vendors | same matrix on creation and editing | existing Vendor business owner saved |
| Vendor Review | shared Review matrix | authoritative linked Review owner saved |
| Policies | owner matrix; approver intentionally unchanged | new owner saved/reloaded |
| Bulk owner | shared candidate picker | selection exercised |
| CIS | User-owner matrix; Contact process choices preserved | Assessment Owner and Contact Process Owner saved |

Also verified: name/email search, empty search, keyboard opening, initial search
focus, Escape/focus return, 1280/1024/768 viewport overflow check, client switch
replacing candidates and same-name identity isolation. Manage people reached the
same client's Contacts page with `window.opener === null`. Smoke navigation:
Dashboard, Calendar, Reviews, Actions, Risks, Vendors, Policies, Contacts, Evidence,
Onboarding, Client Settings, Client Management, Users & Access. No page errors in
the exercised run. This is not whole-application accessibility certification.

## Verification limits / remaining risks

- Standard sign-in is still deferred. No live browser against a persistent
  FastAPI/MongoDB staging environment was verified or deployed. Authorization
  evidence is real API route execution with isolated test persistence, not a
  browser-authenticated multi-role deployment.
- AI and generic Asset/Requirement/Exception owner paths are code inspected and
  automated-test covered; not separately browser-matrix verified in this pass.
- Policy verification owner and all source-specific Action combinations were not
  individually browser-tested; they reuse the tested selector and shared rules.
- Legacy `/findings` blank-screen issue and Contact deletion UI issue were already
  documented in Phase 4A; neither is silently claimed fixed here. Existing Finding
  and remediation tests pass; the legacy standalone Findings route is not signed off.
- Existing account-directory/history APIs were not redesigned. The new candidate
  endpoint is minimal and scoped; it is not an audit of all old directory endpoints.
- Legacy integration suites that expect an external server/database were not run
  against uncertain infrastructure. No independent security review or full
  vulnerability scan was performed. Review these authorization-sensitive changes
  independently before enabling standard staging authentication.

## Scoped UI review

Medium-priority inconsistency at operational owner controls: before, mixed
directory/member queries; after, shared scoped search and clear eligibility text.
Low-priority empty/history ambiguity: before, unexplained omissions; after, explicit
empty/error messages and retained recorded ownership. Existing light/charcoal/lime
design, density and component tokens remain intact. Scoped review: approved for
the tested selector interactions, not a platform redesign. Slow-motion animation
review was not performed; no animation system changes were introduced.

## Repository / release

Full changed-file review and whitespace checks performed. No secrets, password
material, environment files, generated build artifacts or QA browser fixtures are
intended for the commit. Commit/push and published version are reported in the
handoff only after remote confirmation. Backend code is preserved in source;
publishing the static Demo frontend does not deploy FastAPI or a database.
