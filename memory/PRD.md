# Northstar GRC — Product Requirements

## Original problem
Desktop-first multi-tenant B2B GRC platform (Linear/Stripe/Notion-inspired). Roles: Super Admin, Platform Admin, Client Contributor, Client Read-Only. Tenant isolation, audit log, @mention comments, evidence uploads, reusable Review workflow, connected Findings/Tasks/Risks, Policies with 2-step approval + history, Vendors, Assets, Exceptions register, Baseline wizard, overdue email reminders, notifications inbox, CSV/PDF exports, calendar view, bulk actions.

## Architecture
- Backend FastAPI + MongoDB (motor). server.py mounts api + entity_router LAST so all literal /api/* routes take precedence.
- Auth: JWT bearer in localStorage + Emergent Google OAuth.
- Frontend React 19 + react-router 7 + shadcn/ui + sonner + lucide-react.
- Scheduled tasks: `.emergent/crons.yml` — daily 13:00 UTC overdue-reminders.
- Emails via Emergent Resend; PDFs via reportlab.

## Implemented (Feb 2026)
### v1
- Multi-tenant auth, roles, tenant scoping, client org selector
- CRUD for Reviews / Findings / Risks / Policies / Vendors / Assets / Tasks
- Evidence uploads (base64), comments, audit log
- Command Center dashboard focused on overdue reviews / open findings / critical findings / significant risks

### v2
- Baseline Assessment wizard (`/onboarding`)
- Quick actions Review→Finding + Finding→Task
- Related-items tab, Exceptions Register, Overdue Reminders (Resend + cron)

### v3
- Notifications inbox with @mentions and auto-notifications
- Policy approval workflow (submit/approve/reject) with history + RBAC
- CSV exports per record kind
- Evidence tab inside every record drawer

### v4
- **Bulk Actions** — checkboxes + bulk bar with close / set-status / set-owner (assignee for tasks) / delete (admin only); tenant + role checks on every id
- **Calendar View** — `/calendar` month grid combining reviews, findings and tasks with prev/next/today; `/api/calendar` returns date-bucketed items
- **Board Report PDF** — one-page executive PDF via `GET /api/reports/board?client_id=` using reportlab; Command Center has one-click download

## Test coverage
- 47+ backend pytest tests plus new iter4 suite; 100% frontend E2E across iterations 1-3

## P1 backlog
- Notification pagination + real-time push (SSE)
- Vendor Portal (guest link for due-diligence questionnaires)
- Password reset + brute-force lockout
- Extract server.py into modules

## P2 backlog
- SLA countdowns and calendar drag-to-reschedule
- Slack/Teams webhooks
- CSV export streaming row-by-row + JSON-serialize nested cells
- Custom permissions matrix per role/tenant

## Test credentials
See `/app/memory/test_credentials.md`
