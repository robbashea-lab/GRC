# Administration coordination and current-state checkpoint

Base: PR #52, `codex/brawndo-guided-assessor`, `5fd3fd310c2e38e360a9123baeb04e9f26e7be18` (live fetched 2026-10-07).
Administration branch: `codex/admin-console-hardening`; draft PR targets PR52 branch.

Expected files: admin pages and tests, ClientDialog, backend/server.py, backend/security_runtime.py, backend authorization and tests, preview authorization/data handlers, scope contexts/routes/navigation where necessary, documentation. PR52 overlaps: backend/authorization.py, backend/tests/suites.json, frontend/src/preview/authorization.js. Shared changes require a current rebase, separate commit, exact function notes and Omni/CIS regressions. Never overwrite Omni/CIS catalog, question, status, history, character or workspace changes.

## Current architecture and findings before product changes

Admin pages use PageHeader, semantic theme tokens, existing tables and Radix dialogs inside the shared shell. Routes admit super_admin and platform_admin; backend scopes provider administration to explicit client_ids. Five persisted roles; no editable role API. Role page contains a future approver card and auditor roadmap text. Security page includes unsupported MFA and roadmap text; password claim is eight characters.

Client creation is owner-only with idempotent clean client/contact creation, relationship validation, generated identity and optimistic editing. Archive is a status change; ordinary write rejection for archived tenants needs verification. No dedicated permanent client-delete endpoint found. Client inputs lack bounded normalized names and explicit extra-field rejection.

User creation uses existing invitation delivery or supplied initial password; hashed single-use setup tokens, seven-day invitation lifetime, normalized email and unique-index handling. Provider cannot create internal roles. Current patch lacks email editing and explicit all-client entitlement. Self-demotion/deactivation is blocked; final-owner concurrency protection requires investigation. Assignment changes are per-request database-driven. Deactivation removes sessions and invalidates JWTs/reset tokens.

Password storage is bcrypt with default work factor 12; input limited to 72 UTF-8 bytes, preventing truncation but not supporting long Unicode passphrases. Minimum eight characters and no common-password block. Inspect every credential caller before changing shared policy. Existing hashes must remain verifiable.

JWTs are environment-bound, expire after seven days, and reload via HttpOnly cookies. Logout invalidates account sessions; status/roles/assignments read on each protected request. SecurityBoundary requires trusted Origin for cookie mutations, rate-limits authentication per process, bounds body size and sets security headers. Actual hosted proxy/TLS behavior remains unverified.

Audit API is paged, supports existing filters/export and limits providers to assigned-client events. Events store actor email and IDs but lack universal actor/client/object snapshots and explicit outcome. Generic deletion currently writes audit after deletion, losing name snapshots. Unauthorized attempts only emit safe server warnings. Filter facets omit archived clients. Audit has no mutation API; database-superuser immutability is not claimed.

Existing offline suites cover identity lifecycle, client management, authentication boundaries, security campaign and record integrity. Browser/real-backend coverage and full requested identity matrix are not yet verified. Existing test harness behavior must be inspected before counting API checks.

Shared Render staging, production, main, established demo clients and Omni private Site are outside deployment/mutation scope. Admin preview must use a new private Site. Static preview proves synthetic UI only.


## Shared changes
- `backend/authorization.py`: `global_scope`, `can_access`, `scope` recognize only the owner or an explicit boolean provider entitlement. `authorize_request` resolves trusted parent tenants and refuses ordinary archived program writes. Guided operation allowlist and assessment logic remain intact.
- `frontend/src/preview/authorization.js`: `authorizeDemo` mirrors archived write denial without changing guided allowance/history logic.
- `frontend/src/preview/frameworks.js`: `frameworkScope` delegates to existing `clientAccess`; removes the empty-provider-list global fallback. Required for the admin assignment contract, no catalog/provisioning/assessment mutation changes.
All based on a fresh fetch/rebase of PR52 `5fd3fd3`. Tests must cover guided assessment, CIS, SOC and ISO after these changes.
