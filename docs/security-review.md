# Security review — working evidence record

## Architecture and trust boundaries (before remediation)

React 19/CRA/CRACO uses Axios to FastAPI. Standard requests use JWT bearer
tokens stored in localStorage and also accept Secure HttpOnly SameSite=None
cookies. Passwords use bcrypt; an external Emergent Google session exchange is
also supported. FastAPI reloads user status, role and client memberships on each
request. Motor/PyMongo connects to a shared Mongo database. Evidence base64 is
stored with metadata in Mongo, returned through authenticated JSON downloads.
There is no separate object-store authorization layer or database row-level
security. The backend is primarily server.py plus framework, evidence, policy,
profile, AI and onboarding modules. Source records remain authoritative.

Authorization is server-side but scattered: shared scope/writable helpers,
route-local role checks, lifecycle-specific decision checks, and assignment
eligibility. UI gates do not constitute authorization. Mongo queries use shared
scope for list endpoints; many ID lookups authorize after lookup. Demo is a
separate browser adapter with synthetic sessionStorage records and cannot confer
server identity. Its role simulation is not a security-test substitute.

Trust boundaries: browser → API; authenticated user → role/client/record action;
API → Mongo; API → identity/mail provider; build-time public configuration →
server secrets; local synthetic tests → any external environment. All dynamic
work in this review is restricted to synthetic local data. No production access,
external deployment, real mail, or real identity-provider transactions are allowed.

## Approach

Preserve persisted role identifiers: super_admin = Platform Owner;
platform_admin = Service Provider GRC Administrator (explicit assignments only).
Add client_grc_manager without promoting existing contributors. Retain contributor
and read-only roles. External auditor remains unsupported/default-denied until
explicit content grants exist. Centralize role-family/scope decisions and deny
unknown roles. Keep existing workflow approval rules in addition to role checks.
Add a request authorization contract for client operational changes and retain
per-record checks. Do not replace the business modules or introduce a parallel
permission database. No automatic role/membership expansion is permitted.

## Source versions verified

- OWASP ASVS 5.0.0, stable May 2025: https://github.com/OWASP/ASVS
- OWASP Top 10:2025: https://top10.owasp.org/2025/0x00_2025-Introduction/
- OWASP API Security Top 10:2023: https://owasp.org/projects/api-security-project
- NIST SP 800-218 SSDF 1.1 (published final): https://csrc.nist.gov/pubs/sp/800/218/final
- Authorization, Session Management, File Upload and CSRF cheat sheets:
  https://cheatsheetseries.owasp.org/
- FastAPI security: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/

This review is not ASVS certification or an independent penetration test.
Findings, matrix, remediation evidence and limitations are recorded below as
verification completes. Staging transport, durable database behavior, identity
provider configuration and real-device behavior are not inferred from mocks.

## 1. Executive assessment

**Not approved for real customer data or production.** This is a first-party
white-box review with local adversarial regression tests, not independent assurance.
Concrete privilege, scope, session and configuration defects were reproduced or
identified and remediated. The test environment uses synthetic Mongo-compatible
memory storage; hosted authentication, transport and persistent database behavior
remain release gates. No external environment was modified.

## 2–6. Architecture, authentication, authorization, roles and permission matrix

The existing password/JWT architecture remains. JWTs now require issuer,
environment audience, subject, issue time, expiry and access-token type. Maximum
lifetime remains seven days; current account state and membership are fetched on
every request. Logout revokes all account sessions. Password-reset tokens are
random, hashed, expiring and atomically claimed; invitation acceptance reuses
that flow and does not accept a client-supplied role. No MFA is implemented.

Tokens are no longer persisted in localStorage. Document-local bearer credentials
support the initial session; reload uses Secure/HttpOnly/SameSite=Lax cookies.
Cookie-authenticated writes require an explicit trusted Origin. An invalid bearer
cannot fall back to a valid ambient cookie. Same-site UI/API hosting is required.
External Emergent Google exchange is disabled in staging/production until a
properly validated identity-provider integration exists. Existing identities can
no longer be re-promoted from an email allowlist during sign-in.

`authorization.py` centralizes role families, client scope, default-deny client
mutations, assignment checks and property restrictions. Existing route, reference,
approval, concurrency and historical-record checks remain mandatory. Providers
are not globally privileged when their assignment list is empty. Unknown roles
are rejected. Legacy `client_viewer` means read-only, never elevated authority.

Matrix below describes the implemented API contract, not a grant editor. O=Owner,
P=assigned provider, M=client manager, C=contributor, R=read-only. All client actions
require explicit client authorization. “Operational” is the narrow allowlist in
`authorization.py`; it does not grant arbitrary edits. Future auditor/content-grant
and client approval roles are not enabled.

| Resource / action | O | P | M | C | R |
|---|---|---|---|---|---|
| Client records, dashboard, calendar, reports, search: read/export | All | Assigned | Own client | Own client | Own client |
| Create client | Yes | No | No | No | No |
| Client profile, onboarding, applicability, program configuration | Yes | Assigned | No | No | No |
| Reviews: create/configure/delete/restore | Yes | Assigned; history locks apply | No | No | No |
| Reviews: start/complete/raise finding | Yes | Assigned | Operational | Assigned activity | No |
| Reviews: notes / owner changes | Yes | Assigned | Notes, client-user assignment | Assigned notes | No |
| Framework assessments: update/raise finding | Yes | Assigned | Operational | Assigned assessment | No |
| Framework program baselines/configuration | Yes | Assigned | No | No | No |
| Findings: create/delete/verify/accept/close | Yes | Assigned; workflow rules | No | Only via assigned Review/assessment; no verify | No |
| Findings: remediation notes | Yes | Assigned | Yes | Assigned | No |
| Action items: create/update/submit | Yes | Assigned | Client operational work | Own/assigned work | No |
| Assign work | Yes | Assigned | Existing active client users | Own task assignment only | No |
| Risks/Policies/Vendors/Assets: authoritative create/configure/delete/decide | Yes | Assigned | No | No | No |
| These records: notes / permitted ownership | Yes | Assigned | Notes, client-user ownership | Assigned notes | No |
| AI Governance: read | All | Assigned | Own client | Own client | Own client |
| AI Governance: configuration/lifecycle | Yes | Assigned | No | No | No |
| Contacts, account relationships: administer | Yes | Assigned | No | No | No |
| Evidence: upload/read/download | Yes | Assigned | Own client | Own client | Read/download only |
| Evidence: classify/unlink/delete/archive | Yes | Assigned; historical locks | No | No | No |
| Notes/comments: create | Yes | Assigned | Authorized parent | Authorized parent | No |
| Client invitations/roles/membership | Yes | Client roles within assignments | No | No | No |
| Internal accounts / owner role assignment | Yes | No | No | No | No |
| Audit log read/export | All | Assigned client events, not platform events | No | No | No |
| Audit history mutation/deletion | No ordinary endpoint | No | No | No | No |
| Account profile/logout/own notifications | Own account | Own account | Own account | Own account | Own account |
| Global reminders / tenant creation | Yes | No | No | No | No |
| Dynamic RBAC/security/integration configuration | No general grant editor implemented | No | No | No | No |

Normal operational deletion is distinct from tenant destruction. Historical locks,
archive behavior, version tokens and authoritative references are not removed by
this review. Tenant archive behavior remains existing scoped administration; no
new hard-delete tenant or audit API was added.

## 7–8. Tenant and Demo isolation

Mongo is shared-collection, tenant-keyed storage. Collection/query scope is the
primary application boundary; UUIDs are not treated as authorization. Lists and
aggregates use authorized scopes; legacy object lookups still include fetch-then-
authorize paths. A database-enforced equivalent of SQL RLS is not configured.
Separate DB credentials/instances for environments and centralized repository
scope are recommended defense in depth, not claimed existing database isolation.

The Demo adapter stores synthetic data in browser storage. It cannot mint a
standard server credential. `/api/demo*` is rejected by the real backend.
Unknown server environment names fail validation; missing configuration never
activates Demo. Standard builds exclude Demo entry unless explicitly compiled
with the Demo flag. Browser role/localStorage changes are never server authority.
Demo users can inspect their own synthetic fixtures; that is not tenant security.

## 9. File/evidence security

Existing Mongo metadata/base64 storage is preserved. Uploads require authorized
client/parent relationships. JSON bodies are bounded to 12 MiB and decoded files
to 8 MiB. Path/control-character filenames and common active/executable extensions
and MIME types are rejected. Client-supplied data-URL prefixes are discarded.
Authenticated downloads use opaque `application/octet-stream`, including legacy
payloads, and no-store/nosniff headers. There are no public object-store URLs.
Historical evidence retention and unlink/delete safeguards remain intact.

This is **not malware detection or complete file-type validation**. Renamed malicious
Office/PDF files can still be stored and opened externally. Quarantine, signature
validation, AV/CDR policy, safe download behavior across browsers, file-volume
quotas and future object-store ACLs require further work before real documents.

## 10–12. API, application security and secure coding

OpenAPI contains 128 operations. Route inspection found 120 with dependencies and
eight without: public health, five authentication flows, and two secret-protected
cron operations. A durable inventory test detects additions to the unauthenticated
set. This is not a claim that every method/property combination was fuzzed.

New API middleware limits request bodies, adds response protections, validates
cookie write Origins and applies bounded per-process authentication request limits.
Unknown client mutation operations are denied until explicitly permitted. Fields
such as role, tenant, history, approval metadata and owner changes are not freely
mass-assigned. Existing schema validation and business transitions still apply.

CSV cells beginning with spreadsheet formula triggers are neutralized. User and
client labels in ReportLab Paragraph content are escaped. React content is normally
rendered as text; source searches did not find an application eval or raw HTML
rendering path. This targeted review is not comprehensive DOM/injection fuzzing.
External HTTP calls observed use configured/fixed services, not arbitrary request
URLs; actual identity/mail service behavior was not exercised.

## 13–14. Dependencies, secrets and configuration

Read-only advisory scans were run against installed JavaScript packages and Python
runtime pins, plus the broader local Python environment. Initial JS scan returned
23 advisory entries across js-yaml, fast-uri, postcss, qs, react-router and svgo.
The active node_modules junction points outside this checkout and contains older
versions than the committed manifest. A separate frozen-lockfile install with
scripts disabled succeeded after an npm tarball timeout and a lower-concurrency
retry. Its 1,304-package-name inventory returned **three SVGO advisory entries**
(two high, one moderate), involving legacy SVGO 1.3.2; other initial advisory
families were absent. No manifest/lockfile or shared install was modified.
Build-tool and SSR/RSC advisories are not automatically SPA exploits;
no SSR/RSC server is used, and user evidence is not fed to the asset compiler.

The 11 direct Python runtime pins had no reported advisories. The broader development
environment returned 53 entries across pip and pypdf (including duplicate advisory
aliases); pypdf is not in the application runtime manifest. These counts are tool
results, not confirmed exploitable application vulnerabilities. Container base OS,
clean transitive resolution and full SBOM remain staging/build-chain gates.

Tracked-file and available Git-history pattern scans for private keys, GitHub token
patterns and AWS access-key patterns returned no matches. No tracked .env/private-key
file was found. This limited pattern scan is not proof of no secrets; no credential
values were printed or rotated. Bootstrap uses configured bcrypt hashes and does
not overwrite existing identities. The legacy broad requirements.txt is not the
Docker runtime input; use requirements-runtime.txt.

## 15–16. Logging and browser protections

Login/logout are now audited; existing role/membership, invitation, workflow and
record audit events remain. Denials log actor ID when authenticated, method, route
template and result without body/token contents. Provider audit queries exclude
other tenants and platform/null-scope events. No client audit-edit API was added.
Logs are not immutable external storage; retention, alerting, export integrity,
denial-event correlation and tamper resistance still require staging operations.

API responses receive no-store, nosniff, no-referrer, framing denial and restrictive
API CSP. HTTPS responses add HSTS. Interactive API schemas are disabled for staging/
production. These API headers do not configure a separately hosted frontend's CSP
or TLS. Hosted ingress, cache, proxy headers, CORS and browser variations remain
NOT YET DYNAMICALLY VALIDATED.

## 17–19. Adversarial campaigns

The new suite uses real FastAPI auth/route code, no authentication dependency
override, and synthetic Mongo-compatible storage. It exercises empty provider
scope; unknown roles; provider internal-role creation; cross-tenant generic
read/list/update/delete; evidence download/catalog/library; search/aggregates;
dashboard/calendar/report/export; profile/framework/assignee/comment/audit scope;
mass-assignment and vertical escalation; stale membership/role/disabled sessions;
logout replay; forged Demo credentials; environment-bound JWTs; cookie Origin;
invalid-bearer cookie fallback; active file/path rejection; body size; assignment;
unknown account states and malformed sessions. Positive authorized operations are
also asserted. Existing invitation expiry/replay/disable and lifecycle suites run.

Browser QA uses Edge/Chromium, the standard optimized frontend, a loopback server,
real password login and synthetic data. Owner, provider, manager, contributor and
read-only each passed login, cookie-based reload, no persistent token, scoped client
lists, foreign record/profile/evidence requests, allowed/denied writes, admin-route
navigation and logout. No page runtime errors occurred in those flows. This is a
focused role smoke test, not every screen, every role, or real-device testing.

## 20–22. Findings and remediation ledger

| ID / severity | Attack path and root cause | Remediation / evidence / status |
|---|---|---|
| SEC-01 High | Provider with empty memberships obtained global client/user scope | Explicit memberships; default deny; reproduced before, direct and browser tests pass |
| SEC-02 High | Provider could create another provider role; role-family boundary absent | Client-only delegation and internal-account protection; direct escalation tests pass |
| SEC-03 High | Contributor could modify onboarding/program configuration via broad writable check | Program-admin guard + mutation allowlist; reproduced before, tests pass |
| SEC-04 Medium | Copied JWT remained valid after logout | Server revocation timestamp and session removal; replay test passes |
| SEC-05 Medium | Cookie-authenticated mutation lacked Origin/CSRF guard | Lax cookie, trusted Origin, exclusive bearer handling; direct test and normal browser writes pass; cross-origin deployment still unvalidated |
| SEC-06 Medium | Unsupported roles with membership could read data | Known-role/default-deny checks; tests pass |
| SEC-07 High | Google allowlist could restore a downgraded user's owner role | Removed re-promotion; external flow disabled in staging/production; real IdP still unvalidated |
| SEC-08 Medium | Provider audit scope included unrelated platform events | Client-only log/facet scope; campaign passes |
| SEC-09 Medium | Uploads lacked explicit body/file limits and trusted active MIME | Bounded body/file, active-type rejection, opaque download; tested; malware/signature work remains |
| SEC-10 Medium | Unescaped ReportLab labels / spreadsheet formula cells | Escaping and CSV neutralization; code reviewed, helper tested; exhaustive document exploit testing remains |
| SEC-11 Medium | Unset cron secret matched empty bearer string | Nonempty secret + constant-time comparison; regression test passes |
| SEC-12 Medium | Persistent browser bearer credential increased theft lifetime | Memory-only bearer + HttpOnly reload; browser storage/reload/logout tested |
| SEC-13 High release gate | No MFA or validated production-like OIDC; seven-day maximum token lifetime | NOT resolved by this review; select/validate identity policy before customer use |
| SEC-14 Medium release gate | Dependency-tree drift and unresolved build-environment advisories | Frozen install verified; three legacy SVGO entries remain; no forced incompatible upgrade |
| SEC-15 Medium release gate | No malware quarantine, distributed abuse controls, durable immutable logging | Architecture/operations work remains; no claims of validation |

Severity describes plausible impact in a real deployment, not an assertion that
this development build currently exposes customer data. First six findings were
reproduced as failing local tests before remediation. Other findings are identified
by source inspection and targeted tests, not claimed live exploitation.

## 23–24. Tests and regression

Commands: `backend/tests/run_isolated.py` (explicit offline allowlist, never legacy
external-HTTP discovery); CRACO Jest `--watch=false --runInBand`; ESLint with the
repository React/hooks configuration; optimized standard CRACO build; the new
`security_browser_qa.cjs` loopback fixture; dependency advisory scans; diff checks.

Existing tests changed only where the requested role contract superseded prior
behavior: empty provider scope is no longer global; client roles cannot create
policies/configure programs; read-only cannot approve; absent status is not active.
Validation/lifecycle assertions are retained with authorized actors, and new denied
actor assertions precede them where applicable. No tests were deleted or disabled.
Relevant suites cover Dashboard, Calendar, Reviews, Findings, Actions, Risks,
Policies, Vendors, AI, Contacts, Evidence, Profile, onboarding, framework modules
and Demo state/reset. This is automated regression, not a full browser tour.

Recorded results on 2026-09-23:

- Backend offline regression: **383 passed, 567 subtests passed**. Eight FastAPI
  startup/shutdown deprecation warnings; no failed assertions.
- Focused security/account tests after final self-service allowlist tightening:
  **21 passed, 300 subtests passed**.
- Frontend, repeated on the isolated frozen-lockfile install: **87 suites / 478 tests passed**, including the changed role metadata,
  assignment rules, Demo identity and frontend authentication behavior.
- ESLint: zero errors; existing PlatformAdmin `load` hook-dependency warning.
- Python changed-module compile check and Git diff whitespace check passed.
- Optimized standard build passed with that same hook warning and a Node
  `fs.F_OK` deprecation warning. No TypeScript project/typecheck is configured.
- Browser: five-role smoke passed on the clean-install standard build, including
  browser-storage tampering and direct admin-route redirects, with no page errors.
  No staging/production browser claim is made.
- Clean frozen dependency install, optimized build and advisory scan completed.
  The build retained only the existing hook and Node deprecation warnings.

The framework regression includes the implemented CIS, ISO, HIPAA, NIST and SOC
workspaces. CMMC formal assessment/POA&M/scoring has not received a separate
adversarial browser campaign here; do not infer that from general framework tests.

## 25–28. Unvalidated areas, staging and production gates

Ready to prepare a **private synthetic security-test environment**, not customer
operation. See `staging-security.md`. Configuration checks are a foundation, not
proof that resources are separate. Required before production:

1. Close remaining findings and finish independent tenant/property/workflow review.
2. Validate MFA/identity provider, verified account linking, secure invitations and
   real mail delivery; external auditors need explicit content-grant architecture.
3. Private staging with isolated DB credentials, storage, signing secrets, origins,
   mail sandbox, logs and synthetic identities; no Demo bypasses.
4. Real Mongo concurrent writes, indexes, restart durability, backups/restores and
   retention tests. Current mocks do not demonstrate distributed correctness.
5. File signature/quarantine/malware policy and cross-browser download tests.
6. Frozen dependency install/build and container/OS/SBOM scans with reviewed fixes.
7. TLS, frontend CSP, ingress CORS/headers/cache, trusted proxies, distributed rate
   limits, monitoring and incident response with externally retained audit logs.
8. Full role-by-screen browser workflows, cross-origin CSRF, session lifetime,
   role revocation, invitation theft/replay and assignment races in staging.

Independent penetration-test scope should prioritize authenticated BOLA/property
authorization, provider/client role families, all relationship endpoints, files and
exports, invitations/session replay, workflow verification and immutable history,
CSV/PDF/stored content, Demo escape, resource exhaustion, hosting configuration and
dependency reachability. Authentication and database tests must use actual staging
services, not Demo simulation or mocked authorization.

## 29–30. Material files and delivery status

Core: `backend/authorization.py`, `security_runtime.py`, `server.py`,
`assignment_eligibility.py`, `policy_approval.py`. Frontend: API/AuthContext/callback,
role administration/catalog, affected operation gates and Demo identity mirror.
Tests: `test_security_campaign.py`, offline runner, existing permission-contract
tests, browser fixture/driver and frontend role/assignment tests. Documentation:
this report and staging configuration checklist.

No database migration or historical-record deletion was executed. Existing role
IDs remain. Operators must review missing-status accounts and explicitly assign
provider clients; there is no automatic activation or expansion. Old JWTs without
environment claims and sessions without environment tags require reauthentication.
Read-only approval designations remain historical metadata but confer no writes.

Working changes are local and uncommitted unless the handoff explicitly states
otherwise. No push, preview publication, staging update or production deployment
is authorized or performed by this review. Generated builds/logs remain outside
the repository. Production was NOT deployed.
