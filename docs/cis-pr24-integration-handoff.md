# PR #24: persistent integration gate handoff

Inspected 2026-10-03. This is preparation, not a completed integration run.

## Source and delivery boundary

- Product head: `5525f543ef1f952bbeefa336cb95036baa189a62`, branch `codex/cis-operational-handoff`.
- Fetched main: `c57a57f0f5549dce7d4c9dc128387823a85af617`.
- Both fetched refs match the earlier implementation snapshot; no intervening changes were found. Working tree was clean at intake.
- PR #24 was open, draft, unmerged and mergeable. Keep it draft while this gate is open.
- This follow-up changes documentation only. No product, schema, dependency, authentication or framework changes. No broad Demo QA rerun, merge, preview publication or deployment.

## Current result

**NOT EXECUTED: real authenticated frontend/backend/database/file/restart integration.** No failed integration assertion was observed because no approved target was available. Previous Demo and Mongo-mock results remain accepted within their documented scope, not upgraded to persistent integration evidence.

Executed: Git fetch/ref/history checks, GitHub PR state inspection, repository/configuration inspection, local executable/service/environment-name checks and limited local-listener discovery. No secret values were printed or used.

No `mongod`, `mongosh` or Docker executable/service was found; no backend/frontend `.env` file or relevant configured process environment names were present. No database/API listener was found on the checked standard/harness ports (27017, 8000, 4180). A loopback static Demo server on 4195 is not a backend/database target. These observations do not prove no database exists anywhere; they establish that no usable approved target was supplied or discovered.

Historical `docs/phase9-runtime-inspection.md` is not current authorization to use its external environment. ChatGPT Sites is a static Demo preview. Neither was contacted as an integration target.

## Existing architecture and exact missing prerequisites

The normal application is React/CRACO + FastAPI + Motor/PyMongo + MongoDB. Backend startup uses `MONGO_URL` and `DB_NAME`, normal password/JWT authentication, current database-backed role/client assignments and origin-checked secure session cookies. Uploaded file bytes are persisted in MongoDB's `evidence.content_base64`, with decoded size and SHA-256. Downloads use the authenticated `/api/evidence/{id}/download` route. There is no separate bucket configuration required for the current storage implementation.

Missing:

1. An explicitly approved synthetic-only MongoDB instance/database and test-only connection credentials, with persistent storage. No production or shared customer database.
2. A private HTTPS frontend/API origin and trusted certificate, preferably same-origin routing of `/api` to a loopback API. Normal secure cookies must work across browser reload. Do not turn off Secure cookies, authentication, origin checks or TLS validation.
3. Approved synthetic bootstrap/user credentials, tenant-scoped accounts and permission to create/remove test records.
4. Authority and an identified procedure to restart the isolated backend and MongoDB process without deleting its data, affecting parallel services or changing the JWT secret.

A local isolated target is sufficient; external provisioning is not necessary. Installing/provisioning services, configuring a private TLS ingress and issuing credentials require separate authorization or an already approved target. This handoff creates no infrastructure project.

## Configuration contract — names only

| Variable | Isolated target requirement |
| --- | --- |
| `APP_ENV` | `staging`, to exercise strict non-Demo runtime validation |
| `MONGO_URL` | Approved test-only Mongo connection, injected securely; least-privilege access to the isolated database |
| `DB_NAME` | Unique synthetic database beginning `staging_`; record its exact name in the run manifest |
| `JWT_SECRET` | Injected test-only secret of at least 32 characters; unchanged through restart |
| `APP_BASE_URL` | Explicit private HTTPS frontend origin |
| `CORS_ORIGINS` | Explicit approved HTTPS origin(s), no wildcard |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | Synthetic initial administrator and valid bcrypt hash; insert-only bootstrap, not a password bypass |
| `ADMIN_NAME` | Optional synthetic bootstrap display name |
| `REACT_APP_BACKEND_URL` | Empty for approved same-origin `/api` routing, otherwise explicit approved API base |
| `REACT_APP_PREVIEW` | `false` for frontend and any backend-visible configuration |
| `REACT_APP_STANDARD_SIGN_IN` | `true` |
| `DEMO_MODE`, `RUN_LEGACY_MIGRATIONS` | Unset/false; forbidden true in staging |
| `BUILD_PATH` | Separate integration build directory, not the existing Demo output |

Leave external email/webhook/integration credentials unset, including `EMERGENT_EMAIL_KEY` and `WEBHOOK_CRON_SECRET`. If invitation delivery is needed, use a separately approved synthetic mail sink; do not send real invitations. Remove bootstrap settings after initial provisioning. Do not write credentials into Git, command arguments, screenshots, traces or reports.

## Prepared commands — NOT executed in this follow-up

Prerequisites: approved runtime and dependencies from the existing lockfile/runtime manifest, securely injected backend variables above, persistent MongoDB, and private HTTPS routing. The repository currently pins Motor 3.7.1, PyMongo 4.18.0 and Uvicorn 0.25.0. Do not upgrade them to create a test environment.

From the PR checkout, after target authorization/configuration:

```powershell
# Frontend: normal build, NOT scripts/preview.cjs or build:preview.
Set-Location frontend
$env:REACT_APP_PREVIEW = 'false'
$env:REACT_APP_STANDARD_SIGN_IN = 'true'
$env:REACT_APP_BACKEND_URL = '' # only with approved same-origin /api routing
$env:BUILD_PATH = '.qa-integration-build'
yarn build
```

Serve that output through the approved private HTTPS ingress with SPA fallback and `/api` proxying; no public exposure. Its startup command depends on the approved ingress, which is not currently supplied. Do not substitute a static Demo server.

In a separate shell with securely injected backend configuration:

```powershell
Set-Location backend
# Use the approved Python environment with requirements-runtime.txt installed.
python -m uvicorn server:app --host 127.0.0.1 --port 8016
```

The private ingress must route `/api` to this identified process. Port 8016 is a proposed isolated port, not a discovered running service; verify availability first. Log in through the normal frontend. No Demo fixtures, mocked DB, test auth bypass or browser role manipulation.

Focused regression commands, also prepared rather than rerun here:

```powershell
# From backend, with the repository test environment (these remain mock tests).
python -m pytest -q -o addopts='' tests/test_cis_operational_handoff.py tests/test_framework_governance.py tests/test_assessment_verification.py tests/test_onboarding_handoff.py
```

`backend/scripts/verify_mongo_recovery.py` is an existing real-Mongo storage smoke utility, but it creates/drops its own test databases, accepts only credential-free explicit loopback URLs and uses an ASGI test harness. It does not replace browser authentication or a database-process restart. Do not run it against a shared/credentialed target or relax its safety checks. `serve_lifecycle_qa.py` and `security_browser_server.py` substitute Mongo mocks and likewise cannot satisfy this gate.

## Run manifest and acceptance cases

Create two disposable CIS-only clients A/B using normal onboarding, with a unique run identifier; do not enable CIS on existing clients. Create synthetic administrator, scoped writer A, read-only A and scoped writer B through authorized normal account administration. Record only nonsecret IDs, source SHA, build settings, DB name, process/service identity, timestamps and test outcomes. Capture a baseline of existing Review schedules, descriptions, occurrence conclusions, assessment history and relationships before edits.

| Case | Procedure | Expected result |
| --- | --- | --- |
| Normal authentication | Sign in normally, save through UI, inspect actual API requests; reload and sign in again in a fresh context | Real backend identity and persisted records; no Demo fallback; failed API requests show errors rather than successful local writes; backend Demo routes rejected |
| CIS operation | Save provider/confirmation and implementation narrative; reopen after Next/Previous, route navigation and fresh login | `cis_operation`, narrative and independent implementation/verification states retained; confirming an arrangement does not mark implementation or verification complete |
| Legacy compatibility | Use a normal newly generated assessment that lacks `cis_operation`; read it, edit an unrelated supported field, then save an arrangement | Missing field reads as unconfirmed; no forced status reset, history loss or exception; additive save works |
| Reviews/Evidence | Link actual authorized Review occurrences and Evidence via normal UI; reopen and reload | Exact links preserved, no duplicate Reviews/actions or copied conclusions; direct versus Review-associated support remains distinguishable |
| Durable file contents | Upload a harmless small text file containing the run ID; record SHA-256 using `Get-FileHash -Algorithm SHA256`; download using normal authenticated UI | Retrieved bytes match original hash, not just filename/metadata; backend persisted payload size/hash match |
| Backend restart | Stop/restart only the identified test API process with unchanged configuration; use fresh browser context and normal login | Saved assessments, links and downloaded file hash unchanged; no session-held content dependency |
| Database restart | With authorized operator, restart only isolated Mongo process/service, preserving its exact data directory; restart API if necessary, then fresh login/download | Same record IDs, history, relationships and actual file bytes/hash retained; no reseeding or data-volume recreation |
| Cross-client denial | As A writer/read-only, substitute B client, assessment, Review and Evidence IDs in direct authenticated requests, including file download | Server denies unauthorized reads/writes/downloads; no B content in responses/search; guessed ID is not authorization |
| Read-only restrictions | As read-only A, attempt arrangement/status/narrative mutation, linking/unlinking/upload and other affected mutations directly | Denied by server with no data/history changes. Authorized A reads/downloads remain allowed; read-only is not a blanket file-read denial |
| Logged-out file access | Request authenticated file route without session/bearer credentials | Authentication rejected; no bytes disclosed |
| History and schedule preservation | Compare baseline after all tests, including completed occurrence views and custom Review text | Historical conclusions/client descriptions and recurrence schedules unchanged; new assessment edits append legitimate history, not rewrite it |
| Error/draft integrity | Interrupt only the isolated API while attempting a save, then restore it and retry | Visible save failure, retained draft, no false navigation/completion or duplicate relationship writes |

Direct-request checks must use normal authenticated browser/request sessions and required Origin headers, not patched dependencies. Keep response bodies containing file data or authentication material out of saved traces. Record allow and deny outcomes separately. Any failure must identify the exact source SHA, request/action, root cause and whether attributable to CIS-P01–P04 before changing code.

## Cleanup and gate completion

No integration clients, accounts, uploads or databases were created during this follow-up; no target cleanup was executed.

For an authorized run: track every created ID. Remove/archive only run-owned records through permitted workflows, revoke test accounts/sessions, and stop only run-owned processes. Database teardown requires explicit authority for the exact unique database/data directory; never drop an existing tenant/shared database or delete a broad directory. Preserve sanitized outcome/hash evidence before teardown. Remove injected bootstrap credentials and temporary browser downloads/build artifacts according to the approved test-data policy; never include secrets in the PR.

The gate closes only after every acceptance case is actually executed against the approved persistent target and attributable failures are corrected/retested. Until then, keep PR #24 draft/unmerged and do not publish a preview. Minimum unblock action: supply an approved private persistent Mongo + HTTPS frontend/API target, synthetic credentials, record-creation/cleanup permission and controlled restart permission, or separately authorize that local isolated setup. No additional broad Demo cycle is needed.
