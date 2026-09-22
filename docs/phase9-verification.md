# Phase 9 checkpoint — 2026-09-22

## PASS WITH LIMITATIONS — repository/Demo continuation only

This checkpoint is **not** approval for a real-client pilot. Automated route-level
authorization tests pass; updated persistent authenticated-browser verification
is blocked by infrastructure capacity and unavailable privileged credentials.
It is safe to continue Phase 10 against isolated Demo data.

## Implemented and automated-test verified

- Docker now packages both missing shared runtime catalogs. Packaging regression
  discovers JSON references in backend source instead of a parallel fixed list.
- Central bcrypt-boundary validation rejects fewer than eight characters and
  more than 72 UTF-8 bytes before creating/updating credentials. Existing hashing,
  email normalization, login, disabled-state checks and RBAC remain authoritative.
- 194 tests in 26 isolated backend suites pass; four legacy client-management
  tests also pass in a separate process. Real FastAPI route/auth code with isolated
  Mongo mock storage. These are not persistent database tests.
- Frontend: 318 tests / 57 suites pass. Demo production build and separate local
  staging-enabled build pass; the latter is not published. Two existing hook
  warnings remain. No configured TypeScript check in this JavaScript application.
- Python dependency consistency (`pip check`) passes. No packages upgraded.
- Tests cover multiple client roles, scoped/internal roles, foreign and disabled
  accounts, stale membership, contact links/invitation contracts, approval
  delegation/duplicates, archived Evidence retention, policy version history,
  initialization, review recurrence and source-record integrity.

## Persistent environment — attempted, not passed

Dedicated Railway **Omnisciente Development** project with existing private
MongoDB and 500 MB persistent volume. No older iVenture database was connected.
The connector exposes configuration names, not credential values. No known
administrator credential was reused, guessed or created through a bypass.

1. Tested source was pushed to GitHub and pinned for the API deployment.
2. First container exposed the additional missing managementRules.json catalog;
   this was fixed and retested. No initialization ran in that failed container.
3. Corrected deployment `ac8d16dc-f470-4e14-b29c-b46d5c1203c0`, source
   `da81cdeb25f6ea4b3a303e68c15b548a16662bfb`, imports successfully but required
   index creation fails with MongoDB OutOfDiskSpace: 233,508,864 bytes available,
   minimum 524,288,000. Prior revision remains the serving deployment at inspection.
4. API/browser harness checks for the new approval route before creating any
   account. It stopped on the stale endpoint response; **no QA account created**.
5. A 1 GB development volume increase was requested because billing may change.
   Storage/DB limits were not weakened and records were not deleted to bypass it.

## Data protection and release boundaries

- `RUN_LEGACY_MIGRATIONS=false` explicitly set for this API only. Normal startup
  creates required indexes and insert-only configured bootstrap account; it does
  not seed fictional operational records or overwrite existing accounts/data.
- Existing required schema/index initialization retained. Mongo service/volume
  and all other runtime secrets/configuration were left unchanged.
- Publicly published owner-private preview remains Demo-only. Standard Sign In
  stays disabled. Local QA build uses the existing allowed loopback origin;
  CORS, authentication and membership rules were not relaxed.
- Generated QA credentials would exist in process memory only; no plaintext
  credentials, environment files, tokens or build/debug artifacts were committed.
- No external email delivery, operational persistence across API restart,
  real multi-user concurrency, privileged persistent browser flows, full live
  cross-client isolation, persistent Policy approval or Board PDF success is
  claimed. These remain **NOT VERIFIED**.
- OAuth/identity-provider configuration, independent security review, database
  backup/restore and penetration testing were not exercised.

## Remaining release work

Resolve storage capacity with owner authorization; deploy tested API; use actual
authorized role accounts for multi-client/multi-session workflows, invitations,
Evidence retrieval, policy approval and restart persistence. Publish standard
authentication only after those gates pass. No grant of broader access merely
to make verification pass is authorized or performed.
