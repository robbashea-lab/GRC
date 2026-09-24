# Private staging/security-test requirements

Do not use customer data. Do not expose a test instance publicly for convenience.
No infrastructure was provisioned by this review.

## Application configuration

- `APP_ENV=staging`; unknown values fail startup. No server Demo environment.
- `DB_NAME=staging_<dedicated-name>` with a separately provisioned Mongo database,
  least-privilege credential and network policy in `MONGO_URL`. Name validation
  alone cannot prove isolation; verify credentials cannot reach other environments.
- `JWT_SECRET`: independently generated secret, at least 32 characters; inject
  through the approved secret manager, never frontend variables or committed files.
- `APP_BASE_URL`: exact HTTPS UI origin. `CORS_ORIGINS`: explicit HTTPS origins,
  no wildcard. Prefer same-origin UI and `/api` proxy; Lax cookies require same-site
  hosting. Validate trusted proxy headers rather than disabling Secure cookies.
- Build with `REACT_APP_PREVIEW=false`, `REACT_APP_STANDARD_SIGN_IN=true` and the
  authorized API origin. No Demo role simulator in the standard session.
- No `DEMO_MODE=true`, no `RUN_LEGACY_MIGRATIONS=true`. Run reviewed migrations
  separately against synthetic data, with a tested backup/recovery procedure.
- Initial administrator: one synthetic account via `ADMIN_EMAIL` and a bcrypt
  `ADMIN_PASSWORD_HASH`; remove bootstrap settings after initialization. Do not use
  real customer identities or distribute shared test credentials.
- Disable cron/mail integrations unless intentionally configured to sandbox
  recipients. A configured `WEBHOOK_CRON_SECRET` must be independently generated;
  unset credentials reject requests. Never reuse production integration secrets.

## Services and launch gates

Evidence currently resides in Mongo; isolate its database with all other records.
Any future object storage must have a dedicated bucket/credential and authenticated
downloads. Add malware/quarantine policy before permitting real document uploads.
External Google session exchange and public self-registration are disabled in
staging/production. A validated OIDC/MFA implementation remains a separate gate;
the test environment can exercise existing password authentication with synthetic
users, but cannot validate the absent identity-provider architecture.

Provide private TLS ingress, controlled access, distributed rate limiting, request
timeouts/size limits, frontend security headers/CSP, centralized protected logs,
resource monitoring, backup/restore and a tested rollback procedure. Do not treat
application response headers as validation of the ingress or static frontend.

Use the committed lockfile and runtime manifest in a clean build environment.
Audit container layers and transitive packages. Do not reuse the stale shared
development node_modules junction as release evidence.

## Required dynamic campaign

Seed synthetic owner/provider/client-manager/contributor/read-only identities in
three tenants. Exercise normal and hostile requests after every role or membership
change, including direct files/exports/search, invitations, cookie Origin, logout,
disabled accounts and Demo credentials. Verify real Mongo concurrency, retention,
indexes and restart durability. Test browser workflows on supported platforms.
Only then commission independent penetration testing; no local pass constitutes
production approval.
