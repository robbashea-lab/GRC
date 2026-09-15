# Authentication and demo validation checkpoint

Date: 2026-09-15. This is a development/staging checkpoint, not production readiness or a completed browser QA sign-off.

## Verified without restarting the preview

- 82 self-contained backend tests passed, including real FastAPI handlers with isolated mock databases, tenant authorization, initialization, and account preservation.
- 116 frontend tests passed across 21 suites, including intentional workspace routing, absence of demo HTTP writes, clearing selection/session state, canonical demo reset, and relationship integrity.
- Separate lint of 139 JavaScript/JSX files: zero errors; four existing hook-dependency warnings in Calendar, ClientDirectory, Evidence and PlatformAdmin. No unrelated fixes were made.
- Production preview build succeeded using the configured staging API endpoint. Build output is ignored and not committed.
- A separate TypeScript check is not available: this is a JavaScript application without TypeScript or a configured type-check script. Compilation is not represented as type checking.
- HTTPS API-only checks exercised case-normalized successful authentication, invalid email/password rejection, empty-field validation, a zero-client standard workspace, explicit standard mode, the logout response and unauthenticated access denial. These checks did not run through the frontend and do not establish end-to-end authentication or data isolation.

## Initialization and isolation design

Standard startup retains schema indexes. Legacy status normalizations are preserved behind explicit opt-in, disabled by default. Account bootstrap accepts only an externally provided bcrypt hash and uses insert-only updates; it does not overwrite an existing account. Removing bootstrap configuration prevents recreation of a removed account. Tests verify that startup preserves existing records across all operational collections and never introduces fictional clients.

The five canonical fictional organizations are created only by the demo adapter in session storage. Standard requests use the backend; intentional demo requests use the local adapter without a bearer token. Mode transitions clear selected-client state and query caches. Old operational fixtures remain for historical regression comparison, but the application adapter imports only extracted configuration and the new demo seed.

Demo framework examples use existing catalog functionality only. No certification or compliance claim is made. SOC 2 framework pages and custom Program Coverage modes are not introduced in this change.

## Checks not available in this pass

The legacy generated HTTP suites require the former Acme/Globex dataset, multiple test accounts and sometimes cron configuration. They can mutate data and were not pointed at an uncertain old environment or at the blank standard staging database. They are not included in the passing backend count.

The previous local-preview restart was denied by execution policy. This pass deliberately did not retry that restart or make application changes to bypass it. Current restart availability is therefore not established.

## Remaining release gate

1. Start the existing preview with its normal scripts and the staging API configuration; do not seed standard operational data.
2. Exercise the actual frontend and backend together: valid/invalid/case-varied login, empty fields, logout, reload, demo entry and workspace switching.
3. Exercise bidirectional data isolation across the requested modules with explicitly scoped QA records; preserve all existing non-demo data.
4. Verify the five demo clients, relationships, metrics, actions, responsive layout and console/network behavior.
5. Publish the exact validated frontend to the existing private preview. Rebuild and retest if any code changes are required.

The updated frontend is not published at this checkpoint. Publishing was deferred until browser validation, not demonstrated to be environmentally blocked. No credentials or secret environment values belong in this document or repository; the public API origin is necessarily build configuration visible to the browser.
