# Portable $0 Omnisciente staging

## Scope and current status, 2026-10-05

Use one Render **Free** web service for the normal React frontend and existing
FastAPI application, with a new MongoDB Atlas **Free** cluster. Cloudflare,
Railway, all prior databases and the private ChatGPT Demo v108 stay unchanged.
No account registration, Demo data seed or legacy migration is enabled.

Render account sign-in is verified. Its empty Hobby workspace has no payment
card, no pending charges, and unused 750 Free hours, 5 GB bandwidth and 500
Starter pipeline minutes this month. Do not add a payment method or upgrade.
Without a card, exceeding Free bandwidth suspends service and exhausting build
minutes stops new builds rather than buying overages. Check these controls
again before deployment; do not assume a future account change preserves $0.
Build-pipeline caps do not cap every kind of billable usage.

A separate Atlas project **Omnisciente Staging** and active cluster
**omnisciente-staging** were created: Free, MongoDB 8.0.34, AWS N. Virginia.
Sample data, automatic security setup, backups and auto-scaling are off.
Database credentials and network access are not yet configured. Existing
Project 0 was not modified. No paid resources were selected.

The Render service form is prepared for the public repository, branch
`codex/cloudflare-staging-preparation`, Docker runtime, Free, Virginia, root
build context, `deploy/RenderStaging.Dockerfile`, `/api/` health check and
automatic deployments Off. An actual running application and its URL are
not yet verified. Provider credentials and hosted acceptance remain pending.

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
SameSite=Lax cookies unchanged. `REACT_APP_PREVIEW=false`, normal password
sign-in and same-origin `/api` are fixed by the build script. Do not embed any
backend secret or database URI in a browser bundle. Docker context is an
allowlist excluding `.env`, keys and credentials; no secret Docker ARG is used.
Render exposes environment variables as potential build arguments, so never
declare credential ARGs. All storage, including evidence bytes, remains in Mongo;
the container's ephemeral filesystem is not the record store.

## Deployment steps

1. In the dedicated Atlas project, create a database user with only `readWrite`
   on `staging_omnisciente_render`. Use Database & Network Access > Database
   Users > Add New Database User and Specific Privileges; do not use the Connect
   wizard's default `atlasAdmin`. The owner enters and stores the new password
   directly in the provider UI/password manager. No credentials belong in chat.
2. Configure the new Render Free service with the prepared settings above, or
   explicitly select `deploy/render.staging.yaml` as the custom Blueprint file.
   Review the initial deployment action; automatic deployments remain Off.
   Use public repository access rather than granting unnecessary GitHub access.
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

Preparation results:

- Clean `yarn install --frozen-lockfile --non-interactive` with Yarn 1.22.22
  verified against the repository's package-manager integrity hash; unchanged
  lockfile. Existing resolution/peer warnings remain.
- `node frontend/scripts/staging.cjs`: normal production build passed (local
  Node 24.19.0). Existing bundle-size warning remains; Docker's Node 22/Linux
  build still requires hosted verification.
- `python -m unittest discover -s deploy -p test_render_staging.py -v`: 5 passed,
  including API error/method preservation, SPA navigation, missing files,
  frontend mutation rejection and traversal denial. API fixture is a stub.
- Existing `test_auth_boundaries.py`: 3 passed; `test_security_campaign.py`:
  22 passed, real application auth/routes with synthetic Mongo, not hosted DB.
  Initial imports required installing existing test harness dependency
  `mongomock-motor==0.0.36` into an isolated local venv; application dependency
  manifests are unchanged. Starlette's httpx TestClient deprecation is noted.
- Existing Cloudflare proxy suite: 7 passed; no Cloudflare resource changed.
  YAML assertions confirm Free, manual deployment, root Docker context and
  isolated namespace; credentials/origins have no committed values.
- Docker engine unavailable locally. Provider deployment validation, actual
  Mongo connection/index initialization, hosted browser workflows, restart
  durability and export/restore remain pending. No independent security review
  of the new hosting wrapper has been performed.

Local checks cover static hosting boundaries and existing auth/permission tests
using synthetic Mongo. They are not hosted durability evidence. Use the normal
browser application with fictional tenants and controlled role accounts to
verify login, reopening the session, logout/revocation, saving/reopening,
evidence retrieval/downloads, read-only mutation denial and cross-client record,
file/export isolation. Verify role changes and duplicate/retry handling.
Restart the Render backend and reopen the same records and evidence; verify
they remain in Atlas. Record outcomes and versions before calling delivery done.

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
