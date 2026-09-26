# Developer handoff

## Read this first

This is not a production-readiness approval. See the engineering health report
for open retry-safety, volume, dependency and staging issues. Do not infer backend
readiness from a working static Demo. Do not run historical HTTP tests against an
unknown deployment. No new account, membership or permission is needed for the
offline suites.

## Architecture and ownership

| Responsibility | Entry points |
| --- | --- |
| Navigation/session/client selection | frontend/src/App.js, context/AuthContext.jsx, context/OrgContext.jsx |
| Real API versus intentional Demo | frontend/src/lib/api.js; preview/adapter.js and store.js |
| Shared registers and editing | pages/RecordListPage.jsx; components/RecordDrawer.jsx and ReviewDrawer.jsx |
| Server authentication, authorized routes, generic CRUD | backend/server.py |
| Assignment | backend/assignment_eligibility.py; frontend shared AssigneeSelect |
| Authoritative recurring work/history | backend/review_occurrences.py; frontend/src/lib/reviewOccurrences.js |
| Finding/remediation relationship | backend/remediation.py and action_items.py; dedicated lifecycle routes |
| Exposure and third-party governance | backend/risk_lifecycle.py, vendor_governance.py |
| Policy decisions | backend/policy_approval.py and policy_provenance.py |
| Assessments and shared framework work | backend/framework_governance.py, framework_catalog.py; frontend FrameworkDrawer |
| Management metrics | backend/management_obligations.py and shared managementRules.json |
| Evidence bytes/context | server Evidence routes and backend/evidence_context.py |
| Runtime packaging | backend/Dockerfile and backend/Dockerfile.dockerignore |

Review = recurring obligation; occurrence = immutable execution snapshot.
Finding = deficiency; Action = remediation/work, not a second Finding.
Risk = exposure. Vendor = third-party relationship. Assessment = independent
framework conclusion. Linking work does not automatically complete an assessment.
Contacts identify business people; Users carry platform access. A Contact does
not grant membership, assignment eligibility or Policy approval authority.

Do not derive framework applicability from titles. The catalogs and structured
links are authoritative. All 47 validated cadence plans remain unchanged.
Deactivation does not silently cancel established Reviews or erase history.

## Authentication, scope and storage

FastAPI reloads stored user identity/role/client membership for authorization.
Every affected record/file/relationship route must check that scope server-side.
Frontend route guards and filters are not authorization. Password hashing, JWT,
account lifecycle and existing Policy authority remain unchanged in this release.

Standard startup retains required indexes and insert-only configured bootstrap
account creation. RUN_LEGACY_MIGRATIONS is an explicit opt-in; leave it disabled
in established staging unless a reviewed migration is authorized. Demo data is
created only by the isolated Demo initialization/reset path, never standard startup.

Runtime needs MONGO_URL, DB_NAME and JWT_SECRET. Optional bootstrap uses
ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD_HASH; use the existing secure seed
process, never plaintext in source. CORS and provider/email settings must come
from the authorized deployment configuration. Keep all values out of Git and
REACT_APP_* variables; those are public browser build configuration.

## Reproduce local checks

Use a dedicated Python 3.12 verification environment, not a system installation.
Install backend/requirements-runtime.txt plus the existing mock test dependency
from preview/requirements.txt. The verified runner versions are pytest 9.1.1 and
pytest-xdist 3.8.0. The configured two-worker loadscope behavior is retained.

```text
python backend/tests/run_isolated.py
python -m pip check
python -m pip_audit --disable-pip --no-deps -r backend/requirements-runtime.txt
```

The first command is an explicit allowlist of reviewed offline suites. New tests
must be inspected before extending it. The suite uses real FastAPI handlers and
Mongo mocks: it does not test durable Mongo indexes, transactions or restart recovery.
The fault-characterization test deliberately demonstrates a remaining duplicate
create-on-retry defect; a green test is not a green resilience gate.

Frontend declares Yarn 1.22.22; use its existing resolutions and package manager.
No committed lockfile was found at this checkpoint. Clean-install reproducibility
therefore needs follow-up; do not invent a lockfile by installing arbitrary latest
versions over the tested dependency tree.

```text
cd frontend
yarn test --watch=false --runInBand
cd ..
node frontend/scripts/preview.cjs build
```

The preview build writes build/ and explicitly disables standard sign-in. It
contains no backend secret. There is no configured TypeScript project gate.
For standalone lint, the tested installation uses CRA's nested ESLint and adjacent
eslint-config-react-app, with --no-eslintrc and --env es2021. The production build
also runs configured checks. Do not disable rules to hide failures.

Serve build/ with an approved loopback SPA static server. Set QA_BASE_URL to
that server; the engineering/browser scripts reject non-loopback hosts.
Use the existing Playwright installation and an installed browser (QA_BROWSER).
Run frontend/scripts/qa/framework-operator.cjs, engineering-reliability.cjs,
operating-core.cjs (CORE_QA_URL), operating-onboarding.cjs and operating-policy.cjs.
The shell ships no analytics; every QA script still intercepts non-loopback
requests so synthetic activity can never reach an external service.
Never publish synthetic verification records.

For bounded mock measurements, set PYTHONPATH to backend and backend/tests
(semicolon on Windows, colon on POSIX), then:

```text
python backend/tests/engineering_probe.py --profile medium --soak-seconds 30
python backend/tests/engineering_probe.py --profile large --soak-seconds 1
```

These intentionally use no network database. Timings include Python tracing and
mock collection scans, not production capacity. Stop escalation when latency or
resource use becomes excessive. A thirty-second run is not a long soak test.

## Editing and failure handling

Shared record forms send expected_updated_at; framework forms send
expected_last_assessed. The server checks the client snapshot and atomically
compares the prior value at update time. Equal clock ticks advance minimally.
Demo consumes the same preconditions without storing them as business data.
Conflict leaves the draft available and asks the user to reload; never auto-merge
assessment conclusions. Older API clients that omit preconditions are still
compatible and are not protected against user-level stale intent.

Separate lifecycle routes, client configuration and inline commands are not a
universal versioned-edit protocol. Review completion uses occurrence identity;
Policy decisions use submission identity. Do not equate serialized leases with
stale-form protection. Generic POST creation has no request identity: after an
uncertain response, inspect the authoritative register before retrying.

More than 1,000 generic register records now yields an explicit error, not a
plausible but incomplete list. This is not pagination or a scale solution.
Dashboard payloads still grow substantially; do not raise limits blindly.

## Deployment and recovery

The existing Railway Omnisciente Development project is the authorized staging
target; its environment happens to be named production. Do not confuse it with
an older iVenture project. Its latest API deployment is failed; the current 500 MB
Mongo volume cannot meet required index free-space checks. Resolve capacity with
owner authorization. Never drop indexes, reduce safety checks, reset data or
reconnect an uncertain database.

The private Sites preview uses .openai/hosting.json. Build/publish from the tested
clean checkout only, preserve owner-private access, and verify deployment/version
success. A Git source push or build success is not a published preview.
Current local publication is blocked by unavailable bash for the bundled packager;
normal GitHub push is blocked by unavailable Git credentials.

Before a real pilot: recover approved capacity; deploy exact tested API; use
authorized role accounts; verify real browser/API authentication, cross-tenant
denials, persistence after restart, failure recovery, backup/restore and multi-user
edits. Roll back source only through normal Git history; it does not undo data.

## Risky touchpoints and review expectations

server.py is large and mixes orchestration. Changes need connected-workflow tests.
Demo mirrors server behavior and can drift. Multi-document writes/audit are not
generally transactional. History arrays are unbounded. Some complete dashboards
perform full scans and include repeated records. Error handling and timeouts are
inconsistent. Dependency advisories and missing lockfile require follow-up.
These are documented risks, not authorization for a broad rewrite.

A new senior developer can locate core responsibilities and run the isolated
checks from this document. They should not yet trust persistent resilience or
large-client performance. Independent security review and persistent stress tests
remain required; passing selected checks is not whole-application assurance.
