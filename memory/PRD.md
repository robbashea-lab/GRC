# Northstar GRC — Product Requirements

## Original problem
Desktop-first multi-tenant B2B GRC platform (Linear/Stripe/Notion-inspired). Roles: Super Admin, Platform Admin, Client Contributor, Client Read-Only. Tenant isolation, audit log, @mention comments, evidence uploads, reusable Review workflow, connected Findings/Tasks/Risks, Policies with 2-step approval + history, Vendors, Assets, Exceptions register, Baseline wizard, overdue email reminders, notifications inbox, CSV/PDF exports, calendar with drag-to-reschedule, bulk actions incl. change due date, self-service password reset.

## Architecture
- Backend FastAPI + MongoDB (motor). server.py mounts api + entity_router at end.
- Auth: JWT bearer + Emergent Google OAuth + self-serve password reset (token-based, 2h TTL, single-use, sha256-hashed).
- Frontend React 19 + react-router 7 + shadcn/ui + sonner + lucide-react.
- Scheduled tasks: `.emergent/crons.yml` — daily 13:00 UTC overdue-reminders.
- Emails via Emergent Resend; PDFs via reportlab.

## Implemented (Feb 2026)
### v1
- Multi-tenant auth, roles, tenant scoping, client org selector
- CRUD for Reviews / Findings / Risks / Policies / Vendors / Assets / Tasks
- Evidence uploads (base64), comments, audit log, command-center dashboard

### v2
- Baseline Assessment wizard, quick actions (Review→Finding, Finding→Task)
- Related-items tab, Exceptions Register, Overdue Reminders + cron

### v3
- Notifications inbox (@mentions + auto-assignment), Policy approvals with history
- CSV exports per record kind, Evidence tab inside every drawer

### v4
- Bulk actions (close / set-status / set-owner / delete) with RBAC + tenant scoping
- Calendar month grid, Board Report PDF (executive one-pager)

### v5
- **Password Reset** — POST /auth/forgot-password + /auth/reset-password, secure token flow with email link, /forgot-password and /reset-password pages, "Forgot?" link on Login
- **Bulk Set Due Date** — new bulk action + UI popover with date picker
- **Drag-To-Reschedule** — draggable calendar chips, drop on any day to PATCH due_date, optimistic UI with revert-on-error

## P1 backlog
- Vendor Portal (guest link for due-diligence questionnaires)
- Notifications pagination + real-time push (SSE)
- Brute-force lockout on /auth/login
- Extract server.py into modules

## P2 backlog
- SLA countdowns & calendar drag-to-resize
- Slack/Teams webhooks
- CSV streaming row-by-row + JSON serialization of nested cells
- Custom permissions matrix per role/tenant

## Test credentials
See `/app/memory/test_credentials.md`
