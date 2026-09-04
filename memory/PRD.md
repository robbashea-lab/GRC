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
