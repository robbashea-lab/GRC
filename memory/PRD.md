# Northstar GRC — Product Requirements

## Original problem
Multi-tenant B2B GRC platform (Linear/Notion-inspired). Roles: Super Admin, Platform Admin, Client Contributor, Client Read-Only. Tenant isolation, audit log, @mention comments, evidence uploads, reusable Review workflow, connected Findings/Tasks/Risks, Policies with 2-step approval + history, Vendors, Assets, Exceptions register, Baseline wizard, overdue email reminders, notifications inbox, CSV/PDF exports, calendar with drag-to-reschedule, bulk actions incl. change due date, self-service password reset with full session invalidation.

## Architecture
- Backend FastAPI + MongoDB (motor). server.py mounts api + entity_router at end.
- Auth: JWT bearer (`iat` claim + `password_changed_at` gate) + Emergent Google OAuth (db.sessions rows) + self-serve password reset (2h TTL, single-use, sha256-hashed).
- Frontend React 19 + react-router 7 + shadcn/ui + sonner + lucide-react.
- Cron: `.emergent/crons.yml` daily 13:00 UTC overdue-reminders.
- Emails via Emergent Resend; PDFs via reportlab.

## Implemented (Feb 2026)
### v1
- Multi-tenant auth, roles, tenant scoping, client org selector
- CRUD for Reviews / Findings / Risks / Policies / Vendors / Assets / Tasks
- Evidence uploads, comments, audit log, command-center dashboard

### v2
- Baseline Assessment wizard, quick actions (Review→Finding, Finding→Task)
- Related-items tab, Exceptions Register, Overdue Reminders + cron

### v3
- Notifications inbox (@mentions + auto-assignment), Policy approvals with history
- CSV exports per record kind, Evidence tab inside every drawer

### v4
- Bulk actions (close / set-status / set-owner / delete) with RBAC + tenant scoping
- Calendar month grid, Board Report PDF

### v5
- Password Reset (forgot + reset endpoints, /forgot-password + /reset-password pages)
- Bulk Set Due Date action + date-picker popover
- Drag-To-Reschedule on Calendar (preserves original time-of-day)

### v6
- **Session Invalidation on password reset** — JWTs now carry `iat`; `password_changed_at` on user rejects any JWT issued before the reset; all rows in `db.sessions` for the user are deleted on reset (Emergent Google OAuth cookies); reset response returns `sessions_revoked`

### v17 (Risk workflow polish: approver picker + reassess digest + finding chip) — Sep 2026
- **Approver Picker on Accept**: replaced the `prompt()`-based accept flow with a proper Sheet dialog inside `RecordDrawer.jsx` — searchable approver combobox (matches by name/email/role), date picker for the expiry (`next_review`), compensating-controls textarea. `data-testid`s: `accept-risk-dialog`, `accept-rationale`, `accept-approver-search`, `approver-option-<uid>`, `accept-expiry`, `accept-controls`, `accept-submit`.
- **Reassess Digest**: the Monday `_send_weekly_digest` now queries each user's owned risks and adds a "Risks to reassess (>12 months since last review)" section to the personalized email — using `last_reviewed` with `date_identified` / `created_at` fallback. Empty-users are still skipped; the HTML template gained a Risk row type. Verified: manual trigger returned 4 emails sent (no errors) and the stale test risk fed the digest correctly.
- **Finding → Risk Badge**: on the Findings list, primary title cell now renders a compact `→ Risk` chip (`data-testid=finding-risk-chip-<i>`) whenever `row.risk_id` is set, with the linked risk id in the tooltip. No new API round-trip — `risk_id` is already returned by GET `/api/findings`.
- **Risk Detail Tabs**: full 6-tab drawer refactor still on the backlog; the current single-form drawer already surfaces rating history via the `rating_history[]` field plus the Accept/Mark-reviewed panel, so today's changes deliver the workflow value first.

### v16 (Risk lifecycle: raise from finding, accept, mark reviewed, stale surfacing) — Sep 2026
- **`POST /api/findings/{id}/raise-risk`**: one-click promotion of a finding into a Risk Register entry. Severity → L/I defaults (critical=5, high=4, medium=3, low=2), auto-computes score/level, seeds `source="Finding <ID>"`, links both ways (`risk_id` on the finding, `related_finding_ids` on the risk). Idempotent — a second call returns **400** because the finding already links to a risk.
- **`POST /api/risks/{id}/accept`**: captures rationale (required), expiry date (→ `next_review`), approver, and optional compensating controls. Sets `status=accepted`, `treatment=accept`, stamps `accepted_by` / `acceptance_date` and `last_reviewed`. Because expiry is stored in `next_review`, the risk automatically reappears in the register's **Due for Review** quick view when the expiry approaches.
- **`POST /api/risks/{id}/mark-reviewed`**: stamps `last_reviewed` now and pushes `next_review` +365 days.
- **Stale-risk surfacing on the Dashboard**: `needs_attention` now includes up to 5 risks with `last_reviewed` (or `date_identified`/`created_at` fallback) older than 12 months, tagged action = "Mark reviewed". `significant_risks` also picks up any risk with `risk_level in {high, critical}`, not just the legacy `impact=="high"` filter.
- **Frontend RecordDrawer**: Findings gain a **Raise as risk** button (disabled/labelled "Linked to risk" if already linked). Risks gain a **Risk actions** panel with **Mark reviewed** + **Accept risk** (rationale + expiry prompts). Full drawer refactor into 6 tabs is on the backlog; today's changes deliver the workflow value without breaking any existing forms.
- Verified: finding severity=high → risk score 16 / critical; second raise-risk returns 400; accept sets status/treatment/next_review/accepted_by/rationale; mark-reviewed stamps last_reviewed=today and next_review=+365d.

### v15 (Risk Register — 5×5 matrix, computed score/level, rating history) — Sep 2026
- **`/risks` route** now renders a dedicated `RiskRegister.jsx` instead of the generic list page. Page header reads "Risk Register" with the client name + subtitle.
- **Backend RiskIn** extended with numeric `likelihood_score` / `impact_score` (1-5), `risk_score`, `risk_level`, and structured fields: `treatment` (mitigate/accept/transfer/avoid/monitor), `source`, `impact_description`, `date_identified`, `last_reviewed`, `next_review`, `accepted_by/date/rationale`, `notes`. Status vocabulary: `open`, `in_progress`, `accepted`, `escalated`, `closed`. Legacy string fields preserved for existing rows.
- **`_apply_risk_scoring`** helper computes `risk_score = L × I` and `risk_level` (Critical ≥15, High ≥10, Moderate ≥5, else Low) on every risk create/update — users cannot save contradictory ratings.
- **Rating history**: PATCH to a risk that changes L/I appends an entry to `rating_history[]` (prev/new values + actor + timestamp) and stamps `last_reviewed`. `date_identified` auto-set on create. Verified: L3×I4→12 (high); PATCH L→5 → score 20 (critical) with history_len=1 and last_reviewed set. Min (1×1=1, low) and max (5×5=25, critical) both compute correctly.
- **Frontend**: summary strip (Open · High/Critical · Accepted · Due for Review), quick views (All Active / High-Critical / Mine / Accepted / Due for Review / Closed), search, table columns (ID · Risk · Category · Likelihood · Impact · Score · Level · Owner · Status · Last reviewed) sorted by level then score, CSV export, **Risk Scale & Matrix** modal (full 5×5 heat map with numeric scores + threshold key), **New Risk** dialog with live score/level preview and a Scale shortcut.
- Existing RecordDrawer still handles risk edit — no drawer changes required. Tenant isolation, RBAC, and audit logging inherited from generic entity router.

### v14 (Action Items unified work queue — merge Tasks + Findings nav) — Sep 2026
- **Sidebar**: removed "Findings" and "Tasks"; added **"Action Items"** (`/action-items`). Underlying `/findings` and `/tasks` list routes are preserved for internal linking (Dashboard, related-record navigation, RecordDrawer flows).
- **ActionItems.jsx** — a **unified work view** that merges three existing collections without creating duplicates:
  - **Tasks** → surfaced as-is with Type = "General Task" (source: Manual / linked Finding)
  - **Open Findings** (`status ∈ {open, in_remediation}`) → Type = "Finding Remediation" (severity → priority)
  - **Assigned Reviews** (`status ∉ {completed, cancelled}`) → Type = "Review" (never duplicated; row opens the Review drawer)
- **Quick views**: My Actions · All Open · Findings · Reviews · Due Soon · Overdue · Completed — each with a live count.
- **Row click** opens the appropriate drawer (`tasks`, `findings`, `reviews`) — same detail pages, no new records created.
- **Overdue is computed** (due < now AND status ∉ closed). Client contributors default to **My Actions**; internal admins default to **All Open**.
- **Dashboard `KIND_ROUTE`** updated so task briefs now link to `/action-items` (findings still open the Finding list page). No double-counting: Reviews appear once (native) and once as an actionable row inside Action Items — dashboard KPI still uses backend-computed sets, so counts are consistent.

### v13 (Settings architecture: My Account · Client Settings · Platform Administration) — Sep 2026
- **Every user gets `/account`** (`MyAccount.jsx`): Profile (name/job_title/phone; email + role read-only), Security (password change for local auth; SSO message for Google users; MFA + sessions UI on backlog), Notifications (weekly digest opt-out toggle).
- **Sidebar footer profile dropdown** replaces the plain logout icon — `My Account`, notifications, `Sign out`.
- **Platform Administration** (`/admin/users`, super_admin + platform_admin only, added to `PLATFORM_NAV`): full Users table with invite, change role, edit client access, resend invite (7-day token), disable/re-enable, orphaned-assignment warning before disable.
- **Client Settings** (`/client-settings`, added to `CLIENT_NAV` with `adminOnly`, hidden for client users): Users & Access scoped to `currentClient` — invite into this client only, change role, remove from this client. No cross-tenant client dropdown anywhere.
- **Backend endpoints added**: `PATCH /api/me`, `PATCH /api/me/password` (revokes other sessions + audit), `PATCH /api/me/preferences`, `POST /api/users` (invitation-token flow w/ optional email), `PATCH /api/users/{id}` (role/clients/status guardrails: users can't self-elevate or self-disable; platform_admin can't grant super_admin or assign clients they don't have), `GET /api/users/{id}/open_assignments` (orphan preview), `POST /api/users/{id}/resend-invite`. Login guard: `status="disabled"` → 403. `last_login_at` stamped on login.
- **Verified**: admin invites new contributor (status=invited, 7-day invite link generated); contributor gets **403** on POST/PATCH `/users`; admin **cannot** self-disable (400); disabling a user revokes sessions and updates `password_changed_at`; local password change with wrong current password → 400; orphan preview returns per-user counts.
- **Explicit backlog (do not treat as bugs)**: MFA enrollment UI, active-session listing/revocation UI, secure email-change verification flow, Roles/Permissions matrix screen, dedicated Client Approver role. Server-side capability model is ready for these but not surfaced yet.

### v12 (Slim client nav — remove standalone Exceptions & Assets modules) — Sep 2026
- **Removed** `/exceptions` and `/assets` routes from `App.js`; wildcard redirects surface these deep links back to the landing route.
- **Removed** "Exceptions" and "Assets" nav items from `CLIENT_NAV` in `Layout.jsx`; dropped now-unused `ShieldOff` / `Server` icon imports. Final client sidebar: Dashboard · Calendar · Reviews · Findings · Risks · Policies · Vendors · Tasks · Evidence · Onboarding · Audit Log.
- **Dashboard link safety**: `KIND_ROUTE` no longer maps `asset`/`exception`; the dashboard useEffect filters `needs_attention` / `your_actions` / `watch_items` / `priority_findings` to only include kinds that still have a list page, so no dashboard row can link to a dead route.
- **Preserved**: `review_type` still includes `"asset"` (Asset Inventory Review) and Findings/Evidence continue to link to reviews of any type. Backend `exceptions` and `assets` collections remain intact (no destructive migration) — future risk-acceptance work can attach to Findings/Risks without a rebuild.
- **Verified live**: contributor sidebar shows 0 Assets / 0 Exceptions and 10 kept items; direct navigation to `/assets` and `/exceptions` bounces to `/dashboard`; Reviews page renders normally with the "Asset" review type still selectable in the schema.

### v11 (Baseline → GRC Program Onboarding, auto-scoped to active client) — Sep 2026
- **Renamed** sidebar "Baseline" → **"Onboarding"**; page title "Baseline Assessment" → **"GRC Program Onboarding"** with subtitle "Establish the client's initial GRC program, identify existing capabilities and gaps, and create the appropriate ongoing review schedule."
- **Removed the tenant-selection step** from the wizard. Onboarding now operates against `currentClientId` from `OrgContext` and never lists other tenants (previously showed `clients.map(...)` inside the first step).
- **Active tenant chip** shown at the top of the page (informational, non-editable): `ACTIVE CLIENT · <Client Name>`.
- **Wizard steps**: `Policies → Risks → Reviews → Review & create` (4 steps instead of 5).
- **Empty-state guard**: internal admins landing on `/onboarding` without a selected client see a friendly "Select a client first" panel with a button to the Client Directory.
- **Tenant isolation regression verified**: contributor's `GET /api/clients` returns ONLY Acme; the DOM contains no "Globex" reference; contributor `POST /api/baseline` with a spoofed Globex `client_id` → **403** (server-side `_can_access_client` guard).

### v10 (Weekly "My Work" digest email) — Sep 2026
- **New cron `weekly-my-work`** in `.emergent/crons.yml` — Mondays 08:00 UTC → `POST /api/cron/weekly-my-work` (bearer-auth via `WEBHOOK_CRON_SECRET`; acks 2xx in <200ms and enqueues the send loop as an asyncio task).
- **Personalized digest**: for every non-opted-out user we compute their **primary-owned** open items grouped into Overdue and Due-in-next-7-days across `reviews` (owner/reviewer), `tasks` (assignee/owner) and `findings` (owner). Users with zero items are silently skipped — no noise emails.
- **Email template** built server-side (table-based inline CSS, dashboard deep link, no forms/inputs) and shipped through the existing Emergent-managed Resend helper (`send_email` + `_assert_safe_email` gate).
- **Opt-out**: `users.weekly_digest_optout = true` skips the send. No UI yet — admins can toggle in Mongo or via existing user PATCH; a preferences UI is on the backlog.
- **Manual trigger** for testing: `POST /api/reminders/send-weekly-now` (super_admin / platform_admin) returns real stats (`users_considered`, `emails_sent`, `users_empty`, `errors`). Verified live: 4 emails sent, 1 empty, 0 errors.

### v9 (Dashboard View selector — Entire Org / My Work / Person / Unassigned) — Sep 2026
- **`GET /api/dashboard`** gained `scope` (`org` | `mine` | `user` | `unassigned`) and `user_id` query params. The endpoint pre-filters `reviews / findings / risks / tasks / policies / vendors / exceptions` by the target user against **primary assignment fields only** (`_PRIMARY_OWNER_FIELDS`: `owner_id`, `assignee_id`, `reviewer_id`, `approver_id`) so every downstream KPI/panel naturally recomputes without duplicated logic. Response gained `scope`, `scope_label`, `target_user`.
- **RBAC on scope**: `scope=user` viewing another user is 403 for client_contributor / client_readonly; `scope=unassigned` is restricted to `super_admin` / `platform_admin`; `scope=user` also verifies the target is a member of the currently viewed client.
- **`GET /api/clients/{client_id}/members`**: returns tenant users; for internal admins also surfaces "orphaned" users (`orphaned=true`) — user_ids that own tenant records but are no longer formal members — so admins can reassign.
- **`DashboardScopeSelector.jsx`** (Popover): Entire Organization / My Work / Unassigned (admins only) + searchable people picker. Default per role: `client_contributor` → **My Work**; everyone else → **Entire Organization**. Read-only users don't see person filtering.
- **Active-scope chip** on the dashboard (dismissable) + panel title switches to "Your Actions" / "<Name>'s Actions" / "Unassigned Actions".
- **Metric click-through carries scope** as URL params on the destination list page (`?owner=<uid>|__me__`, `?unassigned=1`, `?severity=critical,high`, `?status=open`). `RecordListPage.jsx` parses these, applies them additively, and shows a dismissable **carried-scope chip**. Manual navigation from the sidebar drops the filters (no invisible persistence).
- **Board Report PDF** is always **organization-wide** regardless of active dashboard scope; toast is explicit.

### v8 (Client Directory — portfolio view for internal admins) — Sep 2026
- **`GET /api/clients/directory`** (super_admin + platform_admin only): returns per-client aggregated KPIs (`open_actions`, `open_findings`, `significant_risks`, `upcoming_reviews` next 30d, `last_activity` from audit trail, computed `program_status`) plus a portfolio-wide summary. O(N) — bulk fetch + client-side bucketing, not per-client round-trips.
- **Client model gained**: `status` (`onboarding` / `active` / `inactive` / `archived`), `primary_contact`, `assigned_owner_id`, `logo_url`. Legacy tenants back-filled to `status=active`.
- **`GET /api/clients?include_archived=`** — archived hidden by default.
- **`PATCH /api/clients/{id}`** — admins-only edit/archive/restore.
- **`POST /api/clients`** persists new fields; defaults to `status=onboarding`.
- **`/clients` route** (`ClientDirectory.jsx`): portfolio strip (6 KPIs), search (name/industry/contact), filter chips (All / Action Required / Needs Attention / Healthy / Onboarding / Assigned to Me / Archived), Include-archived toggle, table with clickable client name + metric-cell deep links (`/tasks`, `/findings`, `/risks`, `/reviews`), `...` row menu (Open workspace, View activity, Archive/Restore for admins), Add-Client dialog.
- **Role-based landing**: super_admin & platform_admin → `/clients`; client_contributor & client_readonly → `/dashboard`. `/clients` guarded server-side (403) and client-side (`InternalOnly` redirect).
- **Platform-level sidebar**: when at `/clients`, sidebar shows only Platform nav (Clients) and org selector reads "Platform / All Clients". Inside a tenant workspace: full client-scoped nav returns; org selector gains a "View all clients" item for internal admins.
- **Tenant isolation regression verified**: cross-tenant reads/writes still 403 via existing `_can_access_client` / `_scope_filter` guards (server-side, not just UI).

### v7 (Reviews as authoritative schedule + historical record) — Sep 2026
- **Review status enum simplified**: `upcoming`, `in_progress`, `completed`, `cancelled`. Overdue is now **computed** (`due_date < now` AND status not in `{completed, cancelled}`) — no longer a stored status.
- **Recurrence rule**: `none`, `monthly`, `quarterly`, `semiannual`, `annual`, `custom` (with `custom_recurrence_days`).
- **`POST /api/reviews/{id}/complete`**: closes a review (stamps `completion_date`, appends completion notes with author+date stamp preserving history), and if recurring auto-**spawns the next occurrence** — starts blank (no findings/evidence inherited), links back via `parent_review_id`; the completed review is stamped with `next_occurrence_id`.
- **Legacy status migration** at startup: `planned` / `blocked` / `overdue` → `upcoming`.
- **Reviews list**: 5 tabs (Upcoming, Overdue, In progress, Completed, All) with counts. Columns: Title, Type, Status, Owner (user name), Due date, Recurrence, Next due. Trash icon replaced by `...` dropdown menu (Open/Edit, Mark complete, admin-only Delete).
- **Reviews drawer**: `Mark complete` quick action + lineage panel (parent / next occurrence). `custom_recurrence_days` shown only when recurrence=custom via `showIf`.
- **Dashboard KPI** `is_overdue` helper now excludes `cancelled` alongside `completed`.

## P1 backlog
- Risk exception & risk acceptance workflows connecting Risks ↔ Findings
- BCP / DR and Incident Response tracking leveraging the new Reviews cadence
- Notifications filters (unread-only / mentions / tenant)
- Owner name preload in review payload (or read-only /users/lookup) so client_readonly users see owner names on lists
- Vendor Portal (guest link for due-diligence questionnaires)
- Bulk Assign Reviewer (people picker for reviewer_id)
- Brute-force lockout on /auth/login
- Extract server.py into modules (server.py now ~1963 lines)

## Test credentials
See `/app/memory/test_credentials.md`
