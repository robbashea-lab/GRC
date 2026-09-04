# Northstar GRC — Product Requirements

## Original problem
Desktop-first multi-tenant B2B GRC platform (Linear/Stripe/Notion-inspired). Roles: Super Admin, Platform Admin, Client Contributor, Client Read-Only. Tenant isolation, audit log, comments with @mentions, evidence uploads, reusable Review workflow, Findings→Tasks→Risks, Policies with 2-step approval + history, Vendors, Assets, Exceptions register, Baseline assessment wizard, Overdue email reminders, Notifications inbox, CSV exports.

## Architecture
- Backend FastAPI + MongoDB (motor). `server.py` mounts `api` router + generic entity `/{kind}` router last so literal routes win.
- Auth: JWT bearer in localStorage + Emergent Google OAuth.
- Frontend React 19 + react-router 7 + shadcn/ui + sonner + lucide-react.
- Scheduled tasks: `.emergent/crons.yml` — daily 13:00 UTC overdue-reminders.
- Emails via Emergent Resend (safety-checked HTML digest).

## Implemented (Feb 2026)
### v1
- Multi-tenant auth (JWT + Google), roles, tenant scoping
- Client org selector persisted per user
- CRUD for Reviews, Findings, Risks, Policies, Vendors, Assets, Tasks
- Evidence upload (base64) with drag-and-drop
- Comments + Audit log
- Command Center dashboard (overdue reviews, open findings, critical findings, significant risks)

### v2
- Baseline Assessment wizard (`/onboarding`) that bulk-seeds policies + risks + review calendar
- Quick actions: Review → Finding, Finding → Task (auto-flips finding to `in_remediation`)
- Related-items tab on every drawer
- Exceptions Register (linked to risks/findings)
- Overdue Reminders (Resend + cron + manual trigger)

### v3
- Notifications inbox — @mention notifications on comments, auto-notify on finding/task assignment, policy state changes; bell + unread badge in sidebar; mark-read + mark-all
- Policy approval workflow — submit-review → approve/reject; approval_history logged and rendered in drawer; RBAC (only platform admins approve/reject)
- CSV exports — `/api/export/{kind}` streaming CSV with sensible column order; per-page "Export CSV" button
- Evidence in Drawer — every record drawer has an Evidence tab with drag-and-drop upload, download, delete; linked_type/linked_id auto-set

## Test coverage
- 47/47 backend pytest tests, 100% frontend E2E across iterations 1–3

## P1 backlog (still open)
- CSV export: stream row-by-row and JSON-serialize list/dict cells cleanly
- Notifications: pagination + real-time (SSE/WebSocket) push
- Custom permissions matrix per role/tenant
- Password reset flow + brute-force lockout on /login
- Extract server.py into modules (notifications, approvals, exports, cron)

## P2 backlog
- SLA countdowns and calendar view
- Slack/Teams webhook notifications
- Vendor/asset relationship UX to findings/evidence
- Bulk actions on tables (multi-select + assign/close)

## Test credentials
See `/app/memory/test_credentials.md`
