# Portable $0 Omnisciente staging

## Scope and current status, 2026-10-05

The existing Render **Free** Docker service serves the normal React frontend
and unchanged FastAPI API at https://omnisciente-staging.onrender.com, backed
by the separate Atlas **Free** cluster `omnisciente-staging` in project
**Omnisciente Staging**, database `staging_omnisciente_render`.
Cloudflare, Railway, prior databases and the private ChatGPT Demo version 109
remain unchanged. No backend Demo seed or legacy migration is enabled.

Service `srv-db1s0cugekts73f72reg` uses Virginia, root Docker context,
`deploy/RenderStaging.Dockerfile`, `/api/` health check, and connected GitHub main
with **After CI Checks Pass**. Follow [current release operations](render-release-operations.md)
for CI, deployment proof, acceptance and rollback; the provisioning evidence below
does not establish acceptance of a later revision.
Its dashboard environment label is not an application readiness assertion.
`APP_ENV=staging` and the separate database are authoritative.
The initial missing-MONGO_URL startup failure was corrected by the owner;
revision `14c56286af4ae4d475e7503757f7fd3457f3296d` subsequently completed Mongo
connection/index startup and real hosted authentication and persistence checks.
Final revision/deployment evidence belongs in the PR's delivery comment.

Atlas uses MongoDB 8.0.34, AWS N. Virginia. The staging database user has only
`readWrite@staging_omnisciente_render`. Its network list contains Render's shared
regional outbound CIDRs `74.220.49.0/24`, `74.220.57.0/24` and owner-added access.
Existing Project 0 was not modified. No paid resources, automatic backups or
sample-data import were enabled. Shared CIDRs are not exclusive service identity.

At provisioning the Render Hobby workspace had no payment card or pending
charges and included 750 Free hours, 5 GB bandwidth and 500 Starter pipeline
minutes. Builds consume that allowance. Do not add a card, paid resources or
upgrade. Without a card, exhausted Free bandwidth suspends service and exhausted
build minutes stop builds; recheck billing controls if the account changes.
Secrets remain provider-side and in owner-only local files outside Git.
The three `ADMIN_*` bootstrap settings were removed from Render after the
existing administrator successfully authenticated. Verify authentication again
on any subsequent revision; revision `3c8915fcf1db1abdc7247edf9f2b0c9b436444df`
completed startup and existing administrator login without these settings.
Removing settings did not delete or reset the stored account.

## Portable packaging and authentication

`backend/Dockerfile` remains unchanged. The optional staging Dockerfile builds
React using the existing pinned Yarn lockfile and normal staging build script,
then runs the same Python 3.12 dependencies and API modules as the existing
backend image. The output directory's legacy Cloudflare name is local build
packaging only; building it does not deploy or modify Cloudflare.

`deploy/render_staging.py` mounts Starlette static files after the existing API
routes, with SPA navigation fallback. API errors, missing assets and mutations
cannot fall through to successful HTML. The backend's existing authorization,
Origin checks, lifecycle handlers and security middleware remain authoritative.
There are no Render/Atlas application SDKs or new runtime dependencies. The
same image works on another ordinary Docker host using standard environment
variables and a TLS MongoDB connection. `FRONTEND_BUILD_DIR` optionally selects
an absolute build directory; the image default is `/app/frontend/build`.

Frontend and API share one HTTPS origin. Keep Secure, HttpOnly, host-only,
SameSite=Lax cookies unchanged. The staging build selects the existing
`REACT_APP_PREVIEW=true` and `REACT_APP_STANDARD_SIGN_IN=true` combination:
normal email/password sign-in plus the established Explore Demo entry.
Intentional Demo sessions use only the browser-local adapter and fictional
fixtures; they strip credentials, bypass HTTP transport, and clear cached data,
client selection and document-local bearer tokens on mode changes. This frontend
flag does not enable backend `DEMO_MODE`, which remains false. Normal sessions
use the existing authenticated same-origin `/api` and persistent Mongo records. Do not embed any
backend secret or database URI in a browser bundle. Docker context is an
allowlist excluding `.env`, keys and credentials; no secret Docker ARG is used.
Render exposes environment variables as potential build arguments, so never
declare credential ARGs. All storage, including evidence bytes, remains in Mongo;
the container's ephemeral filesystem is not the record store.

## Initial provisioning steps (historical)

The service, database and administrator already exist. Do not repeat provisioning,
create accounts or restore bootstrap settings for an ordinary release. Use
[current release operations](render-release-operations.md) on the existing service.

1. In the dedicated Atlas project, create a database user with only `readWrite`
   on `staging_omnisciente_render`. Use Database & Network Access > Database
   Users > Add New Database User and Specific Privileges; do not use the Connect
   wizard's default `atlasAdmin`. The owner enters and stores the new password
   directly in the provider UI/password manager. No credentials belong in chat.
2. Configure the new Render Free service with the prepared settings above, or
   explicitly select `deploy/render.staging.yaml` as the custom Blueprint file.
   The initial setup used public repository access with automatic deployment Off.
   Current delivery uses the existing GRC-only Git Provider connection and
   **After CI Checks Pass** once exact-main CI is proven; preserve Docker and Free.
3. Record the actual assigned HTTPS Render URL. Set these backend variables
   directly in Render, never in Git or frontend build settings:

   | Variable | Value |
   | --- | --- |
   | `APP_ENV` | `staging` |
   | `DB_NAME` | `staging_omnisciente_render` |
   | `APP_BASE_URL` | Actual assigned HTTPS frontend origin, no path |
   | `CORS_ORIGINS` | Same exact origin, no wildcard |
   | `MONGO_URL` | Standard Atlas driver URI for the dedicated user, secret; TLS verification on |
   | `JWT_SECRET` | Independent random secret of at least 32 characters, secret |
   | `DEMO_MODE` | `false` |
   | `RUN_LEGACY_MIGRATIONS` | `false` |
   | `ADMIN_EMAIL` | `staging-admin@example.com`, fictional bootstrap account |
   | `ADMIN_NAME` | `Staging Administrator` |
   | `ADMIN_PASSWORD_HASH` | bcrypt hash of unique staging password, secret |

   Generate a hash locally using the installed backend dependencies in a private
   terminal: `python -c "import bcrypt,getpass; print(bcrypt.hashpw(getpass.getpass('Staging admin password: ').encode(), bcrypt.gensalt()).decode())"`.
   Enter it directly in Render. Do not expose it in screenshots or logs. The
   bootstrap inserts an account; it does not reset an existing password. Remove
   the `ADMIN_*` bootstrap variables after successful initialization. Leave
   SMTP, OAuth and cron credentials unset; Free Render blocks SMTP ports and
   email invitation/reset flows are not claimed verified without sandbox email.
4. In Render Connect > Outbound, obtain the service's regional outbound CIDRs.
   In the new Atlas project's Network Access allow only those ranges. They are
   shared regional ranges, not an exclusive service identity. No `0.0.0.0/0`,
   TLS bypass, broad database role or insecure cookie troubleshooting shortcut.
   Atlas Free lacks private endpoints; public TLS plus allowlist and the scoped
   credential is the chosen boundary. Database user creation, secret entry and
   network grants require owner involvement in the dashboards.
5. Deploy the reviewed branch revision. Missing required staging configuration
   must fail startup; do not use development mode to get a healthy response.
   Require successful Mongo connection/index startup, then `/api/` health and
   denied anonymous record access. Record both Render's actual deployed SHA and
   its HTTPS URL. Do not infer readiness from a build or health response alone.

For another Docker provider, build from repository root:

```sh
docker build -f deploy/RenderStaging.Dockerfile -t omnisciente-staging:REVIEWED_SHA .
docker run --env-file /secure/local/staging.env -p 8000:8000 omnisciente-staging:REVIEWED_SHA
```

The ignored env file stays outside Git; terminate HTTPS at the host's trusted
ingress and use the matching origin settings. No host-specific app code is
required. Keep the API-only `backend/Dockerfile` for deployments that already
serve the frontend elsewhere. No Docker build is asserted verified locally
until a Docker engine is available or the hosted build succeeds.

## Database export and restore

Atlas Free has no automatic backup. Use the official MongoDB Database Tools,
on a trusted machine temporarily allowlisted in the staging project. These
examples contain only placeholders. Supply the URI and password through a
permission-restricted local `--config` YAML file, not CLI history, Git or chat.
The config contains the standard `uri` and `password` options; restrict its
filesystem permissions and remove temporary access afterward.

```sh
mongodump --config /secure/local/source.yml --db staging_omnisciente_render --archive=/secure/backups/staging.archive --gzip
mongorestore --config /secure/local/restore.yml --archive=/secure/backups/staging.archive --gzip --nsInclude='staging_omnisciente_render.*' --nsFrom='staging_omnisciente_render.*' --nsTo='staging_restore_check.*'
```

Pause staging writes during export so related records form a consistent set.
Use a distinct restore credential limited to the disposable restore database;
verify the target is empty and isolated. Do not use `--drop` against an existing
database. Confirm indexes, users' application records, assessments, evidence
bytes, tickets and history after restore. Free Atlas does not support oplog
backup/replay or database-user/role restore; recreate least-privilege database
users separately. Protect and retain archives according to the test-data
retention decision. This process also supports migration to another standard
MongoDB host; restore compatibility depends on server/tool versions and must
be verified. Backup and restore have not yet been executed against this cluster.

## Verification and free-tier stop conditions

Verification evidence (2026-10-05):

- Frozen Yarn 1.22.22 install and production staging build passed; lockfile and
  runtime dependencies unchanged. Existing peer/resolution, bundle-size and
  local Node deprecation warnings remain. Render's Linux Docker build passed;
  no local Docker engine is available.
- `python -m unittest discover -s deploy -p test_render_staging.py -v`: 5 passed
  (stub API hosting boundaries); `node --test deploy/cloudflare/worker.test.mjs`:
  7 passed (retained inactive Cloudflare wrapper).
- Main reconciliation: 58 existing application auth/security/save/create/ticket
  tests and 325 subtests passed with synthetic persistence, separate from Atlas.
- `craco test --watchAll=false --runInBand --runTestsByPath
  src/lib/workspaceMode.test.js src/pages/Login.test.jsx`: 6 passed. Checks both
  sign-in paths, Demo never using HTTP, cleared bearer/client selection, mode
  refresh and rejection of email/password authentication by the Demo adapter.
- Hosted real API checks: 46 before and 48 after an actual Render restart passed,
  with 6 additional authorization/revocation checks. Secure/HttpOnly/Lax cookies,
  anonymous and cross-client denial, read-only denial, logout revocation, Origin
  enforcement, keyed retries, stale-save conflicts, retained newer edits,
  once-only audit/Review effects and exact decoded evidence bytes were checked.
- Hosted browser: standard administrator and read-only login, labelled staging
  vendor save/reopen, schedule and notes after restart, read-only controls and
  logout verified. Independent hosting-wrapper review found no material blocker.

Evidence retrieval through the authenticated API returned the original uploaded
synthetic bytes. Native completed browser file download remains unavailable in
this in-app-browser automation: both evidence (data URI) and CSV (Blob) download
controls timed out waiting for a download event, without an application error.
This does not demonstrate an application defect; no helper rewrite was made to
satisfy automation. Do not represent decoded API bytes as a completed browser
file save. On deployed `3c8915fcf1db1abdc7247edf9f2b0c9b436444df`, Demo opened
the four established fictional clients; a Brawndo vendor note saved and survived
reload. Demo sign-out followed by normal administrator login displayed only the
two labelled staging clients. Protected API snapshots of clients, assets,
vendors, evidence, reviews and tasks were identical before and after the Demo
edit. The final API pass had 38 successful checks, including normal logout,
revoked membership, read-only and cross-client denial. Retrieved evidence was
saved outside Git and its SHA-256 matched the original uploaded bytes:
`5203dec4bb8b3600b52dd4b0b43d3181db81685bbe9836117e8b01f5ff02d775`.
This artifact was retrieved through the API, not a native browser download.
Exact final merged/deployed revision is recorded in PR #34's delivery comment.

Unavailable checks: hosted editor remount/lost-response Retry interaction,
actual hosted post-primary audit/Review outage injection, email invitation/reset
without SMTP, database export/restore, broader framework onboarding, and local
Docker engine execution. Controlled synthetic lifecycle/outage tests are
separate evidence and do not prove these hosted browser paths. Fictional labelled
staging clients/accounts/files are retained; temporary private verification
artifacts remain outside Git. Never reset an existing database for verification.

Free Render sleeps after 15 idle minutes, takes about a minute to wake, and may
restart or suspend at quotas/high external traffic. Free compute has 512 MB
RAM/0.1 CPU; test actual startup/index initialization and memory before assuming
it fits. Atlas has 0.5 GB documents plus indexes, 500 connections and limited
throughput/transfer. It can pause after 30 days without connections. Do not add
keep-alive jobs, paid resources or automatic upgrades. Stop and report the
exact memory, quota, index, network or security blocker if Free is insufficient.
This staging is accessible over Render HTTPS with application auth, not behind
the existing Cloudflare Access policy. Existing Cloudflare protection is not
evidence of protection on this new origin.

References: [Render Free](https://render.com/docs/free),
[Docker deployment](https://render.com/docs/docker),
[Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/),
[mongodump](https://www.mongodb.com/docs/database-tools/mongodump/),
[mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/).
