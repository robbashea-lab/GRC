# Northstar GRC — Product Requirements

## Original problem
Desktop-first multi-tenant B2B GRC platform (Linear/Stripe/Notion-inspired). Roles: Super Admin, Platform Admin, Client Contributor, Client Read-Only. Tenant isolation, restricted destructive actions, audit log, comments, evidence uploads, reusable Review workflow, connected Findings→Tasks→Risks, Policies with approval, Vendors, Assets, Exceptions register, Baseline assessment, Overdue reminders.

## Architecture
- Backend FastAPI + MongoDB (motor). `server.py` mounts three routers (auth+literal `api`, generic entity `/{kind}` router, both attached last).
- Auth: JWT bearer in localStorage + Emergent Google OAuth session exchange.
- Frontend React 19 + react-router 7 + shadcn/ui + sonner + lucide-react.
- Scheduled tasks: `.emergent/crons.yml` — daily 13:00 UTC overdue-reminders.

## Implemented (Feb 2026)
### v1
- Multi-tenant auth (JWT + Google), roles, tenant scoping
- Client organization selector (persisted in localStorage)
- Reviews / Findings / Risks / Policies / Vendors / Assets / Tasks CRUD, filters, drawer detail
- Evidence upload (base64) with drag-and-drop
- Comments and Audit log
- Command Center dashboard (overdue reviews, open findings, critical findings, significant risks, upcoming reviews)

### v2 (this iteration)
- **Baseline Assessment wizard** (`/onboarding`) — 5 step wizard picking policies, risks and a recurring review calendar, then bulk creates them for a chosen tenant
- **Quick actions**: Review → Finding + Finding → Task (auto-flips finding to `in_remediation`)
- **Related items** tab in every record drawer showing linked records across collections
- **Exceptions Register** (new entity + sidebar item) linked to risks and findings
- **Overdue Reminders**: `send_email` via Emergent Resend integration + daily cron at `/api/cron/overdue-reminders` (auth via `WEBHOOK_CRON_SECRET`) that digests overdue reviews + findings per owner; manual trigger at `/api/reminders/send-now`

## P1 backlog
- Notifications inbox in-app (bell icon + unread state)
- Approval workflows for policies (2-step approve/publish)
- Reports & CSV/PDF export, saved views bar
- Custom permissions matrix per role/tenant
- Password reset flow + brute-force protection on /login

## P2 backlog
- Vendor & asset relationships to findings/evidence UX
- Attach evidence directly from record drawer
- SLA countdowns and calendar view
- Slack/Teams webhook notifications

## Test credentials
See `/app/memory/test_credentials.md`
