# Phase 4C — Primary Contact and GRC Lead

Verified 2026-09-22 against the local production Demo build. See
[ownership architecture](phase4c-ownership.md) for the pre-change inventory and decisions.

## Delivered behavior

1. Primary Contact was free text on the Client, independent of Contacts & Roles.
   This caused duplicate entry; changing directory details could not update it.
2. GRC Lead already referenced `assigned_owner_id`. Client Management looked up
   that ID in an internal-role-only list; Portfolio looked in all Users. A saved
   client-role lead therefore appeared named in one place and Unassigned in another.
3. New-client name/email/title details create one client-side Contact and store
   its ID as `primary_contact_id`. No User, invitation or login access is created.
4. Existing clients select an existing, active same-client Contact by ID. We do
   not auto-match email or names. This avoids ambiguous merges and cross-client
   matching. New Contact creation happens only for a newly generated client ID;
   replacing an existing primary relationship never creates or deletes Contacts.
5. Legacy `primary_contact` text is preserved verbatim, labeled unlinked. A linked
   ID is authoritative, including when its target is unavailable; old text is
   not silently substituted for a missing linked person. Clearing the link on a
   legacy client explicitly retains its legacy details, as labeled in the selector.
6. Contact name/email/title/status are read from the Contact. Inactive Contacts
   remain identifiable. Single and bulk hard deletion reject current Primary
   Contacts; archive them or explicitly change the relationship first.
7. `assigned_owner_id` remains the only GRC Lead reference. Shared backend and
   Demo projections provide a minimal `grc_lead`; a shared frontend helper renders
   the same name, Unassigned fallback, unavailable-account or disabled notice.
8. New lead choices retain the existing internal role subset (super_admin and
   platform_admin), and enforce active status plus existing `_can_access_client`
   scope. For a not-yet-created client only globally scoped staff qualify; a scoped
   internal user can be selected after the client exists and already grants access.
   No operational assignment rule or approval permission changed.
9. Stored client-role/disabled/missing-account leads are not silently reassigned.
   Existing non-internal leads are named with an explanatory notice. A user can
   explicitly select another eligible lead or Unassigned.
10. Client Management, its edit/create dialog, Portfolio, search and table/quick
    lead filters use the authoritative projection/helper. `/clients` also supplies
    the same projection to client context. Settings and Dashboard had no existing
    relationship displays: no cards/fields were added solely for this phase.

## Compatibility and data protection

- No startup change, reseed, migration or bulk reconciliation. The five canonical
  Demo clients are unchanged. Code inspection finds five lead IDs pointing to
  client-admin accounts and no default Primary Contact links/text; those records
  now display honestly rather than being silently converted to internal staff.
- A persistent database inventory was not available. Counts above describe the
  canonical Demo seed, not customer/standard persistent data.
- Client creation inserts its new Contact before the new Client. On a confirmed
  failed Client insertion, compensation removes only that request's newly created
  Contact; existing Contacts are never cleanup targets. An uncertain committed
  Client is checked before cleanup. This is not a cross-collection transaction:
  process termination/database unavailability between writes needs operational
  reconciliation in the future persistent environment. No destructive repair was run.
- No historical Review/Finding/Action actor field is updated by these changes.
- Existing client-creation membership behavior is untouched; setting a Contact or
  GRC Lead does not grant membership or authorization.
- Client-scoped Contact validation runs on the backend, including for Super Admin.
  Lead candidate retrieval checks the caller's admin role and requested client
  access; candidates exclude client-role, disabled and unrelated scoped staff.
- Read projections use batched referenced-ID lookups. Contacts additionally require
  matching client ID. Responses omit password material, notes and full profiles.
- Dependencies, environment files, authentication, RBAC and invitations are unchanged.

## Automated-test verified

Backend command (PYTHONPATH=backend/tests):

`python -m unittest test_client_relationships test_assignment_eligibility test_client_dashboard_sources test_core_audit test_action_items test_evidence_context test_framework_governance test_seed_account_settings test_standard_initialization test_ai_governance test_governance_integrity test_management_obligations test_onboarding_baseline test_review_lifecycle test_review_occurrences test_risk_ids test_risk_lifecycle test_vendor_governance test_people_visibility -q`

- 150 test executions passed; inherited harness cases are included in that count.
- Real FastAPI routes, HTTPX ASGI transport, isolated mongomock-motor database.
- New coverage: new client/contact persistence; no account/email/invitation side
  effects; replacing/reselecting preserves Contacts; live Contact edits and inactive
  status; single/bulk deletion guard; legacy text; explicit unlink; foreign Contact
  rejection even as admin; client-user and foreign-client authorization denials;
  internal/foreign/disabled candidate matrix; unchanged disabled lead; minimal
  response contract; invalid input has no writes; failed-insert compensation;
  Portfolio/list projection parity; no read-time migration/history rewrite.
- External-server legacy suites were not run against an unknown database.

Frontend: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand`

- 48 suites / 280 tests passed. Six new Demo/read-model tests cover relationship
  validation, minimal/scoped projection, honest fallback notices, contact creation,
  reuse/replacement/history, invalid-input atomicity and deletion protection.
- The first full run exposed two existing metrics tests broken by an unconditional
  Contacts lookup in the new helper. The helper now only looks up a Contact when
  there is an ID. The complete suite subsequently passed; assertions were not weakened.

Production Demo build: `node frontend/scripts/preview.cjs build` — passed.

- Build includes ESLint: three existing exhaustive-deps warnings in Calendar,
  ClientDirectory and PlatformAdmin. No new warnings.
- No separate lint/type-check script is configured; application sources are JSX.
- Validated bundle: `main.835b03fa.js`, Demo chunk `576.a2b7a223.chunk.js`.

## Demo-browser verified

Headless Microsoft Edge / Playwright against the actual production build:

| Scenario | Result |
| --- | --- |
| Northstar Manufacturing, Maya Chen / IT Director / fictional email | Client plus one Contact saved and reloaded; no User/link created |
| Existing Jordan Lee selected | Same Contact ID reused; Maya retained; no duplicate |
| Robb Shea scoped internal lead | Select/save/reload; same value in Management and Portfolio |
| Foreign, disabled and Contact-only lead candidates | Excluded from new choices |
| Contact name edited, status made inactive | Current display updates; relationship survives unrelated save |
| Lead disabled after assignment | Named and flagged; no automatic replacement |
| Explicit Unassigned | Both management surfaces agree |
| Historical Review collection | Unchanged by relationship updates |
| Desktop dialog at 1440, 1280 and 1024px | No dialog content overflow; Escape closes |
| Client switching and module navigation | Dashboard, Calendar, Reviews, Actions, Risks, Vendors, Policies, Contacts, Evidence, Onboarding, Settings, CIS and Users loaded |

The Phase 4B browser matrix was rerun unchanged: Review, Action, Risk, Vendor,
Vendor Review, Policy and CIS selectors; client/internal/super candidates; foreign,
disabled and Contact-only exclusions; save/reload; historical disabled assignment;
search, Unassigned, bulk ownership, keyboard/focus, Manage people draft preservation,
client switching. Both browser runs completed with no page errors.

## UI review (existing design preserved)

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | frontend/src/components/ClientDialog.jsx | Free-text person, no directory relationship | Structured creation or same-client Contact selection; explicit account/access explanation | Clear responsibilities without duplicate entry |
| Medium | frontend/src/pages/ClientManagement.jsx; frontend/src/pages/ClientDirectory.jsx | Contradictory lead names/fallbacks | Shared name and readable retained-state notices | Consistent hierarchy and truthful state |
| Low | frontend/src/components/ClientDialog.jsx | Fixed modal content height | Viewport-bounded scrollable existing dialog | Added fields remain reachable at desktop widths |

Approve the inspected interaction scope. Existing light surfaces, charcoal sidebar,
compact controls and typography retained. No custom animation or palette changes.
10%-speed Animations-panel playback, physical-device testing and whole-app WCAG
conformance: **not verified**.

## Not verified / deliberately deferred

- Persistent-backend browser/end-to-end QA, real MongoDB failure/concurrency testing,
  backend staging deployment and production data inventory. Route tests do not
  establish those results. Standard Sign In remains intentionally deferred.
- Existing unrelated legacy Findings-page and Contacts delete-UI defects remain
  outside this change; new backend/Demo deletion guards are API-tested.
- No bulk legacy migration, automatic email matching, User creation/linking,
  invitations, membership expansion, approval changes or reassignment.
- Phase 4D: account provisioning/linking/invitation and disabled-session enforcement
  concerns previously identified. Policy approval authority remains a later phase.
- Operational decision left to the owner: which internal people should replace
  existing client-role Demo/legacy leads. The UI supports explicit reassignment;
  no names, roles or access have been guessed.
- No independent security review was performed. Scoped authorization checks and
  regression tests are evidence, not a security/compliance certification.

Commit/deployment identifiers are reported in the task handoff after release.
