# Northstar GRC — Product Requirements

## Original problem
Desktop-first, responsive multi-tenant B2B web GRC management platform (Linear/Stripe/Notion-inspired). Roles: Super Admin, Platform Admin, Client Contributor, Client Read-Only. Strict tenant isolation, restricted destructive actions, audit log, ownership fields, comments, notifications/reminders, activity history, document/evidence uploads, version history, simple approval workflows. The reusable Review object is the core workflow primitive (asset, software, access, vendor, policy, risk, vulnerability/patch, BCP/DR, IR, awareness). Modules: Reviews, Findings, Risks, Policies, Vendors, Assets, Software, Tasks, Evidence/Documents, Reports, Administration. Dashboard focuses on Overdue Reviews / Open Findings / Significant Risks / Upcoming Reviews (not compliance gauges).

## Architecture
- Backend: FastAPI + MongoDB (motor). Single `server.py`. `/api/auth/*`, `/api/clients`, `/api/reviews|findings|risks|policies|vendors|assets|tasks` (generic entity router, regex-scoped), `/api/evidence`, `/api/comments`, `/api/dashboard`, `/api/audit-logs`, `/api/users`.
- Auth: JWT (HS256, bearer in localStorage `grc_token`) + Emergent Google Social Login (`/auth/callback` -> `/api/auth/google/session`).
- Frontend: React 19 + react-router 7 + shadcn/ui + sonner + lucide-react + Tailwind. Global `AuthProvider` and `OrgProvider` (client selector persisted in localStorage).

## Personas
- Super Admin (Rob Bashea) — full access
- Platform Admin / GRC Team Member — cross-tenant work
- Client Contributor — create/update within own tenant
- Client Read-Only — view within own tenant

## Implemented (Feb 2026)
- Multi-tenant auth (JWT + Google) with role enforcement and tenant scoping
- Client organization selector persisted per user in localStorage
- Reviews CRUD with review types, statuses, recurrence, due & next-review dates
- Findings, Risks, Policies, Vendors, Assets, Tasks CRUD with filters & search
- Evidence uploads (base64 in Mongo) with drag-and-drop, download, tenant scoping
- Comments on any record + Activity/Audit log
- Command Center dashboard: Overdue Reviews, Open Findings, Critical Findings, Significant Risks, Upcoming reviews list, Open findings list, Top risks table
- Restricted destructive actions (delete = platform-level roles only)
- Seed: 2 tenants (Acme Corp, Globex Ltd) + 5 users + 6 reviews + 4 findings + 3 risks + 3 policies + 3 vendors + 3 assets + 3 tasks per tenant

## P0 / P1 / P2 backlog
- P0: Client onboarding & baseline assessment wizard
- P0: Review → Finding one-click create; Finding → Task one-click create
- P1: Exceptions & risk acceptance workflow (linked to risks/findings)
- P1: Lightweight BCP/DR + Incident Response detail views (via generic review type)
- P1: Reports / export (CSV, PDF) & saved views
- P1: Notifications & email reminders (Resend) for overdue reviews & findings
- P2: Approval workflows for policies (2-step approve/publish)
- P2: Vendor & asset relationships to findings/evidence
- P2: Custom permissions matrix per role/tenant
- P2: Password reset flow, brute-force protection on /login

## Test credentials
See `/app/memory/test_credentials.md`
