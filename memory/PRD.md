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
### v33 (P1 Usability Refinement — Clickable rows, URL-persisted filters, Sticky filter row, Ownership clarity, Sorting, Due-date readability) — Feb 2026
- **URL-persisted filter state** in `RecordListPage.jsx` — search `q`, `status`, review `tab`, and column `sortBy`/`sortDir` all live in the query string via `useSearchParams`. Back-navigation from a drawer/detail preserves the previous list state exactly; filters are shareable and reload-safe. Default values (e.g. `tab=upcoming`) are omitted from the URL so a clean list state stays clean.
- **Sticky filter row** — the search + tabs + status pill row uses `sticky top-0 z-20 bg-white/95 backdrop-blur` so filters stay accessible while scrolling long Reviews / Action Items / Risks / Policies / Vendors / Findings registers.
- **Ownership clarity** — when a user-typed column is empty, the cell now renders a restrained yellow "Unassigned" chip (`data-testid=<kind>-unassigned-<i>`) instead of a silent `—`, making blank ownership obvious across every operational list.
- **Sortable columns** — every column header is now a clickable sort trigger with `ArrowUp`/`ArrowDown`/`ChevronsUpDown` affordance. Sensible defaults per module: reviews & tasks by `due_date asc`, findings by `severity desc`, risks by `risk_level desc`, policies & vendors by `next_review asc`, exceptions by `expires_on asc`. Severity/priority sort uses rank order (critical > high > medium > low); date sort uses timestamp; user sort uses display name; nulls always sink last. Overdue reviews still float to the top regardless of active sort.
- **Due-date readability** — new `DueCell` renders `Sep 16 · in 12 days` / `Sep 2 · 3 days overdue` / `Sep 5 · today` with restrained color coding (critical for overdue, duesoon for ≤7 days, info for ≤30 days). Closed/cancelled records get neutral treatment so completed work isn't mis-tagged as overdue. Exact date remains the primary line so precision is never lost.
- **Row clickability** — already in place from earlier iterations (`row-hover cursor-pointer`); `⋯` menu retained for secondary actions (Open/Edit, Mark complete, Delete).
- Verified via Playwright: Reviews page opens with sticky search + tabs, typing `test` in search reflects `?q=test` in URL, clicking a sort header reflects `?sortBy=…&sortDir=…`, Action Items opens with `?status=open` pre-applied and Unassigned chips render inline.
- Backend/RBAC unchanged; visual design (charcoal sidebar, lime accent, compact tables, semantic colors) preserved verbatim.

### v32 (Sidebar Client Navigator; removed Platform/All Clients box) — Feb 2026
- **Removed** the sidebar "Platform / All Clients" chip below the logo entirely in Platform mode. The `Clients` nav item now expands in place into a permanent client navigator: heading (still routes to `/clients` Portfolio Overview) + 3 inline filter tabs (All / Fav / Mine) + compact `Search clients…` + a bounded-scroll alphabetized client list. Every row: star toggle (per-user favorites, same server-persisted list from v30) + client name that switches tenant and navigates to `/dashboard` in one click.
- **Client Workspace mode unchanged**: still shows the tenant chip (`context-header-client`) + `← All Clients` return button for internal users. Client contributor/readonly users see only the tenant chip and their normal client nav.
- **Client contributor/readonly** never see the Clients navigator — `PlatformClientsSection` only renders when `atPlatform && isInternal`. Server enforces authorization on `/api/clients` and `/api/me/favorites/{id}` so search cannot enumerate unauthorized tenants.
- **Scale** — the client list is bounded to `max-h-64` (≈16 rows) with vertical scroll, alphabetical sort, search-first filtering; Administration section always remains visible below. Works with 4 clients today, will remain usable with 100+.
- **No dashboard redesign** — Portfolio Overview page and per-client `/dashboard` are untouched. Quick Client Access at the top of `/clients` remains as a visual quick-scan complement to the persistent sidebar navigator.
- Verified via Playwright: legacy `context-header-platform` count=0, `sidebar-clients-section` visible, 3 filter tabs render, search input renders, 4 client items in list, clicking a client's name switches tenant and navigates to `/dashboard`, client-mode header + return button confirmed on the same session.

### v31 (Removed legacy client dropdown; contextual "← All Clients" return) — Feb 2026
- **Removed** the sidebar `OrgSelector` dropdown ("Platform / All Clients ▾") entirely — Quick Client Access on the Portfolio Overview is now the single canonical way to enter a client workspace.
- **Added** `ContextHeader` in `components/Layout.jsx` — in Platform context it renders a static "Platform / All Clients" chip; in Client Workspace context it renders the same client chip PLUS (for internal users only) a `← All Clients` button (`data-testid=return-to-portfolio`) that navigates back to `/clients`. Client users see only the tenant chip and cannot navigate out — RBAC unchanged.
- **Preserved** everything else on Portfolio Overview: Quick Client Access (3 tabs, search, star favorites), portfolio summary cards, Needs Attention Across Clients, detailed Client Portfolio table, Team Workload. Every client's `/dashboard` continues to render the same scoped GRC Program Overview (KPI cards, Needs Your Attention with no Client column, Upcoming Reviews, Priority Findings, Your Actions, Watch Items, Assurance Alerts, Program Status, Recent Activity) — no dashboard redesign.
- **Fixed stale link**: `Dashboard.jsx` Recent Activity 'See all' now points to `/admin/audit?client=<currentClientId>` for internal users (and is hidden for client contributor/readonly, who don't have Audit Log access). The removed `/audit` route no longer produces dead links.
- Verified end-to-end via Playwright: platform header renders, legacy selector fully removed (count=0), Quick Client Access click → `/dashboard`, `← All Clients` button visible inside client and correctly returns to Portfolio Overview. Alphabetical sort in Quick Access confirmed (trim fix from v30).

### v30 (Quick Client Access + per-user Favorites) — Feb 2026
- **Quick Client Access** section on `/clients`, rendered directly below the page header + subtitle and BEFORE the portfolio summary cards. Compact by design — three segmented tabs (All Clients / Favorites / Assigned to Me), a `Search clients…` input, and up to 10 alphabetized client rows in a responsive 1/2/3-col grid. Each row: star toggle, initial avatar, name, `industry · status-dot`, hover arrow. Entire row (minus star) is a single click target that switches tenant and navigates to that client's Dashboard.
- **Per-user Favorites** persisted server-side under `users.favorite_client_ids`. New endpoints: `POST /api/me/favorites/{client_id}` (403 if the caller isn't authorized for the tenant), `DELETE /api/me/favorites/{client_id}`. `MePreferencesIn` also accepts `favorite_client_ids` for batch updates — the server filters out any unauthorized ids before persisting so a malicious payload can't attach a client the user doesn't have access to. `AuthContext.setUser` is used for optimistic UI updates.
- **Assigned to Me** filter — client rows where `grc_lead_id === currentUser.user_id`. Zero-state renders a friendly `quick-empty` message so the tab isn't confused with a fault.
- **Search** — matches name, industry, and GRC-lead name/email; only searches within the currently-selected tab's authorized clients (no cross-tenant enumeration).
- **View all N clients →** link appears only when the visible list is truncated; scrolls smoothly to the existing detailed `client-portfolio-table`. Detailed table preserved — Client cell now also carries a per-row star (`row-fav-<id>`) alongside the existing clickable name button; the `⋯` row menu retains admin actions (Edit, Manage Users, Archive, View activity → `/admin/audit?client=<id>`).
- **Archived clients** are excluded from Quick Client Access by design; they remain available via the existing 'Include archived' toggle on the detailed table.
- **RBAC** — `/clients` is still gated by `InternalOnly`; client contributor/readonly users never see the section. Backend endpoints enforce tenant authorization regardless of client-side gating.
- Verified end-to-end: curl proves add/remove favorite, idempotent add, contributor 403 on unauthorized favorite, and PATCH prefs filters out unauthorized ids. Playwright confirms the section renders above portfolio-cards, 3 tabs work, star toggle persists across page reload, and clicking a row switches tenant + navigates to `/dashboard`.

### v29 (Unified authoritative Audit Log) — Feb 2026
- **One audit log, everywhere**: removed the per-client `/audit` route + `AuditLog.jsx`, removed the 'Audit Log' entry from `CLIENT_NAV`, renamed `PLATFORM_NAV`'s label to simply **'Audit Log'** (still mounted at `/admin/audit`). Every audit event now flows through a single authoritative endpoint with client/tenant context on the event itself; the page filters that dataset.
- **Backend rewrite** — `GET /api/audit-logs` is now **admin-only** (super_admin + platform_admin; 403 otherwise) and accepts: `client_id` ('platform' = null-tenant events; anything else = tenant id, enforced against the caller's scope), `user_id`, `action` (user-facing bucket like 'invite'/'onboarding'/'auth' that collapses to raw codes, OR a raw code passthrough), `entity_type`, `start_date`, `end_date`, free-text `q`, `page`, `page_size` (max 200). Returns `{items, total, page, page_size}` with each item enriched by bulk `user_name` + `client_name` lookups. Platform_admin viewers are transparently scoped to `{client_id ∈ their client_ids} ∪ {platform-null events}` — no cross-tenant exposure.
- **New endpoints**: `GET /api/audit-logs/facets` returns `{clients, users, entity_types, action_buckets}` filtered to the viewer's authorized scope (drives the filter dropdowns). `GET /api/audit-logs/export.csv` streams the currently-filtered rows (capped at 10k) with columns `Timestamp,Client,Client ID,User,Email,Action,Entity Type,Entity ID,Meta` and audit-logs its own export.
- **`_AUDIT_ACTION_BUCKETS`** — 11 user-facing action categories (Created, Updated, Deleted, Assigned, Approved, Completed, Uploaded, Invited, Authentication, Permission Changed, Onboarding) each mapped to the raw event codes they collapse to. Raw codes stay in the DB for immutability/traceability.
- **`AdminAudit.jsx` full rewrite** — filters (Client, User, Action, Entity, Date preset with Custom Range, free-text Search), server-side pagination (50/page, next/prev + total), export CSV, and an event-detail Sheet drawer (`data-testid=audit-detail`) that renders Event · Raw code · Date/Time · Client (badge for Platform) · Performed by · Entity · Entity ID · Previous/New value blocks when `meta.prev`/`meta.next` exist · remaining Metadata. Human-readable action/entity labels rendered client-side; raw code remains visible in the detail drawer.
- **Deep link from Client Settings** — the tenant chip row now has a 'View Audit History' button that routes to `/admin/audit?client=<currentClientId>`, opening the Audit Log pre-filtered to that tenant without leaving Platform Administration.
- **URL-persisted filter state** — every filter change is reflected in the URL query string (`?client=…&action=…&date=…&q=…`), enabling shareable links, back-nav parity, and the Client-Settings deep link.
- Verified end-to-end: 1,354 real events across Globex + platform; contributor/readonly get 403 on list/facets/export; platform-only filter returns 9 platform events with `client_id=null`; action='invite' bucket collapses to invite/invite-contact/resend_invite; CSV export downloads 239 KB with correct header row.

### v28 (Route extraction: portfolio + baseline; Compliance Profile tab; contact-invite polish) — Feb 2026
- **`/api/clients/directory`** extracted from `server.py` into **`backend/routes/portfolio.py`** — 425 lines lifted verbatim (portfolio KPIs, non-overlap due-window buckets, attention queue, team workload). Late-binding imports mirror the `routes/onboarding.py` pattern. Registered via `app.include_router(portfolio_router)` at the bottom of server.py.
- **`/api/baseline/templates` + `/api/baseline` + `BaselineIn` model + `BASELINE_TEMPLATES`** extracted into **`backend/routes/baseline.py`** (100 lines). `POST /api/baseline` retains the read-only rejection + `_can_access_client` tenant guard.
- **server.py** trimmed from **4048 → 3583 lines** (net −465). Onboarding, portfolio, and baseline routers now live in `backend/routes/`. Structural pattern is now in place for extracting `/api/users` + contact-invite next.
- **Compliance Profile tab** added to `/client-settings` (frontend-only grouping — no new backend model). `ClientSettings.jsx` now renders a Tabs component with **Users & Access** (existing) + **Compliance Profile** (new). ComplianceProfile fetches `/api/requirements?client_id=…` and buckets by category into: Assurance/Certification (SOC 2/ISO/CMMC/PCI), HIPAA & Privacy (legal/regulatory), Contractual, Insurance, Other Obligations. Summary cards show Total / Applicable / Needs review. Every requirement row deep-links to `/requirements?open=<id>`.
- **Contact invite email — tenant + role aware**: `contact_invite` now looks up `db.clients.find_one` for the tenant name and reads `contact.grc_roles` (falling back to the legacy singular `role`). `admin_create_user` accepts an optional `invite_context={client_name, grc_roles}` kwarg. When present, the invite subject becomes `"You're invited to Northstar GRC — <Client>"` and the body reads `"You have been invited as the <Role[, Role]> for <Client> to collaborate on their GRC program."` (both HTML-escaped). Direct `/api/users` callers still get the neutral template — zero regression.
- **Invite success toast** in `RecordDrawer.jsx` now includes an explicit `Copy link` action button (Sonner `action: {label, onClick}`, 10 s duration). Clicking copies `invite_link` to the clipboard with a follow-up confirmation toast. Falls back to a plain success toast when no link is returned (e.g. contact already linked to an existing user).
- **Fix**: `ID_FIELD` map in `RecordDrawer.jsx` was missing `contacts` and `requirements`. Added both — this unblocks the invite POST (was 404-ing to `/api/contacts/undefined/invite`) plus the on-open `/comments` and `/related` fetches (were 422-ing).
- **Fix**: `renderContactActions()` was defined but never wired into the JSX. Now invoked from the default branch of `renderFields()` alongside the other `kind === …` guards, so the Platform-access panel + Invite button actually appear in the contact drawer for admins.
- Tested: backend pytest 7/7 (portfolio+baseline+invite parity, tenant isolation, read-only rejection). Frontend Playwright: Client Settings tabs + Compliance Profile summary cards + all 5 buckets render; contact drawer's Invite to Platform button POSTs correctly, toast with Copy-link action renders, clipboard write of `/reset-password?token=…` URL verified.

### v21 (GRC Portfolio Overview) — Sep 2026
- **/clients page rebuilt** as an operational portfolio console. Header renamed **GRC Portfolio Overview** with sub-sections: 6 summary cards → Needs Attention Across Clients → Client Portfolio → Team Workload.
- **Six new summary cards**: Past Due · Due Next 30 Days · Due 31–90 Days · Critical / High Open · Unassigned · Clients Requiring Attention (X of Y). Each card is clickable and opens a portfolio-scoped drill dialog (`drill-dialog`) except the last which scrolls to and filters the client table.
- **Non-overlapping due windows** and **de-duplication** enforced server-side: a task with a `finding_id` never double-counts against its parent finding; risks only surface if they carry a `next_review` date; archived/inactive clients are excluded from totals unless `include_archived=true`.
- **Attention Queue** — top ~15 items across the portfolio, ranked by `_priority_rank` (critical+overdue → critical → high+overdue → overdue → critical/high → due ≤7d → due ≤30d). Emits Priority | Client | Item | Type | Owner | Due | Status | Action columns.
- **Client Portfolio table** columns updated to: Client · GRC Lead · Program Status · Past Due · Due 30d · Critical/High · Unassigned · Next Major Item · Actions. Every metric cell is a hyperlink that switches into that client's workspace and navigates to `/action-items`. Next Major Item is computed from the earliest significant upcoming Review (vendor/policy/access/risk_assessment/pen_test/bcp_dr/incident_response/awareness).
- **Rule-driven Program Status**: `action_required` when a critical item is overdue OR 3+ past-due OR 3+ critical/high open. `needs_attention` when any past-due, critical/high, due-soon, or unassigned exists. Otherwise `healthy` (or `onboarding`/`archived`/`inactive` for those explicit client statuses).
- **Team Workload** — per-user (super/platform admins only) counts of Clients led, Past Due, Due 30d, Critical/High, Open Actions. Counts use **explicit assignment** only, never activity history. Metric cells drill into filtered client portfolio.
- **Filters** — filter tabs (All / Assigned to Me / Action Required / Needs Attention / Past Due / Critical / High / Onboarding / Archived) + GRC Lead dropdown + Include-archived toggle. Search extended to match GRC Lead name.
- **Performance** — single bulk query per collection, in-memory bucketing per client. Legacy keys retained on `/clients/directory` response so no callers break.
- Verified via curl end-to-end: portfolio.past_due=13, due_30d=17, due_31_90d=13, critical_high_open=9, unassigned=29, attention_queue=15 items, team_workload=2 admins.

### v20 (Policies & Governance Onboarding · Presence vs Verified) — Sep 2026
- **Onboarding step 1 renamed** "Policies & Governance Documents" and rewritten as an inventory of what the client says they have (not a builder of drafts). Segmented Yes/No/Unsure/N/A control per item; optional per-row note; required rationale for N/A.
- **POLICY_LIBRARY** — 24 items grouped into 5 categories (Core Governance, Security Operations, Business Resilience, Physical/Workforce/Technology, Privacy & Data Protection). Items tagged `common_baseline` or `consider_based_on_applicability`.
- **Backend endpoints** — `GET /api/onboarding/policy-library` returns categorized library preloaded with any existing Policy Register match (`current_presence`, `existing_policy_id`). `POST /api/onboarding/policy-responses` writes/updates Policy rows without ever duplicating and creates linked Tasks for `no`/`unsure`. `POST /api/policies/{id}/verify` moves a reported-existing policy to `verified_existing` and populates version/owner/approval date/etc. Platform-admin-only.
- **Presence vs Lifecycle** — `PolicyIn` gained `presence` (reported_existing / verified_existing / reported_missing / needs_confirmation / not_applicable), `category`, `applicability_rationale`, `onboarding_note`, `is_client_reported`, `verified_at/by`, `last_reviewed_at`. `status` extended with `needs_verification`, `needs_creation`, `not_applicable`. Version/owner/dates are **never fabricated** by onboarding.
- **Tasks** now carry `policy_id` + `source` (e.g. "GRC Program Onboarding"). Onboarding is idempotent — resubmitting same responses updates existing rows and does not spawn duplicate tasks. `ActionItems.jsx` now honors `t.source` so the origin badge shows correctly.
- **Policies list columns** updated to Policy/Document | Presence | Status | Version | Owner | Last review | Next review with tone-mapped presence badges.
- **Tenant isolation & RBAC verified**: contributor@acme.demo cannot POST onboarding responses for a Globex client_id (403); only super/platform admins can call `/policies/{id}/verify`.
- Tested: 5/5 backend pytest passing, iteration_11 frontend flows green (rationale enforcement, idempotence, verify workflow, Policies list rendering, action-items origin).

### v19 (Risk & Vendor Detail Tabs · Schedule Vendor Review · Assurance Expiry Alerts) — Sep 2026
- **RecordDrawer.jsx** fully refactored with `TABS_BY_KIND` mapping. Non-generic kinds get bespoke tabs; other kinds keep the 5 generic tabs (overview/related/evidence/comments/activity).
- **Risk drawer — 6 tabs**: Overview (Risk actions panel: `risk-mark-reviewed`, `risk-accept`), Assessment (1–5 likelihood/impact selects with live `risk-live-score` badge), Treatment (treatment select, acceptance rationale, compensating controls, mitigation notes, acceptance history card), Related (linked findings/evidence), Review History (last/next review + reversed `rating_history` timeline), Activity.
- **Vendor drawer — 8 tabs**: Overview, Data & Access (chip toggles for `data_types` + `data_relationship`, business owner select, vendor contact fields), Security Assurance (`assurance_status`, `assurance_expires_at`, dedicated evidence dropzone for SOC 2 / ISO / DPA), Reviews (frequency/last/next + `vendor-schedule-review` button + linked-reviews list), Action Items (findings + tasks linked via related endpoint), Risks (`related_risk_ids` resolved to full rows), Contract (start/renewal/expiration/auto-renewal), Activity.
- **Backend `POST /api/vendors/{vendor_id}/schedule-review`**: creates a `review_type=vendor` Review with recurrence prefilled from `vendor.review_frequency` (biennial → custom 730d), owner defaulted to `business_owner_id`, `next_review_date` computed via `_next_due_for_recurrence`, updates `vendor.next_review`, writes an audit log, and notifies the owner. New Pydantic model `VendorScheduleReviewIn`.
- **Backend `VendorIn`** gained `assurance_expires_at` (ISO date) — the SOC 2 / ISO / DPA renewal cutoff surfaced on Dashboard + weekly digest.
- **Dashboard `assurance_alerts`**: new endpoint payload key populated by `_assurance_alerts_for(vendors, 60d)` — includes vendors expiring within 60 days OR flagged (`missing/expired/expiring/requested`), sorted overdue-first. `Dashboard.jsx` renders `panel-assurance-alerts`.
- **Weekly digest** (`_send_weekly_digest`): added `assurance` bucket per user (only vendors they own via `business_owner_id`) — rendered as its own section in the Monday HTML.
- Tested end-to-end: 6/6 pytest passing, all Playwright tab flows green, weekly digest `emails_sent=4/errors=0`, Assurance Expiry Alerts renders on Dashboard.

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

### v18 (Vendor Register — criticality, data types, reviews, contracts, assurance) — Sep 2026
- **`/vendors` route** now renders a dedicated `VendorRegister.jsx` (was the generic list page). Page header reads "Vendor Register".
- **Backend `VendorIn`** extended with: `service`, `category`, `criticality` (critical/high/medium/low — business dependency, deliberately separate from risk), `data_types[]` (PII/PHI/Financial/Customer/Employee/…), `data_relationship[]`, `business_owner_id`, `contact_name/email/phone`, `website`, `review_frequency` (quarterly/semiannual/annual/biennial/as_needed/custom), `last_review`, `next_review`, `contract_start/renewal/expiration`, `auto_renewal`, `assurance_status`, `related_risk_ids[]`, `notes`. Legacy `services` + `contract_end` retained for existing records.
- **Frontend**: summary strip (Critical · Reviews Due · Contracts Expiring · Assurance Attention), quick views (All Active / Critical / Reviews Due / Contracts Expiring / Assurance / Inactive), search across name/service/category/owner, sortable table with new columns (Vendor · Service · Criticality · Data Types · Business Owner · Last Review · Next Review · Contract Renewal · Status), attention dot on rows with overdue review / contract in ≤60d / assurance issues / critical + review-due, CSV export, new-vendor dialog with multi-select data-type chips.
- Vendor Reviews continue to live in the Reviews module (kind = review with `review_type=vendor`); evidence lives in the Evidence module — the register just links to them. Tenant isolation and RBAC unchanged.
- Full 7-tab detail drawer (Overview · Data & Access · Security Assurance · Reviews · Action Items · Risks · Contract · Activity) is on the backlog; the existing RecordDrawer still handles vendor edits today.
- Verified: created "V18 PayrollPro" critical with data types + contract renewal persisted correctly; existing legacy vendor list still returns without error.

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
- Continue server.py slim-down: extract `/api/users` + `/api/contacts/{id}/invite` block (~140 lines) into `backend/routes/users.py`.
- Risk Coverage Report PDF export (per-client + portfolio).
- External integrations (LLM-generated summary/suggestion helpers).

## Test credentials
See `/app/memory/test_credentials.md`
