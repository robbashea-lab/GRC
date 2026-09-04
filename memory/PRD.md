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
