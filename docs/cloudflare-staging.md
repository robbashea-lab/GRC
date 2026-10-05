# Omnisciente hosted staging preparation

## Observed state, 2026-10-05

Inspected current `origin/main` at `57a2b4cd6adbf3e9d07fe24132ff28a3ad0bc215`.
Preparation is isolated on `codex/cloudflare-staging-preparation`. Application
business rules, authentication and database models are unchanged.

The owner deleted `grc`; Cloudflare confirmed that Worker no longer exists.
Its previous contents could not be inspected after deletion. A new
`omnisciente-staging` Worker was created in account
`775c0a39a7897512fc6ca499edd2b933`, at
https://omnisciente-staging.mr-robbashea.workers.dev.
It currently contains Cloudflare's Hello World starter, version prefix
`cfc1ee39`, with zero bindings. It contains neither Omnisciente frontend nor
FastAPI backend. The dashboard's Production label identifies this Worker's
deployment slot, not Omnisciente production readiness.

The Access tab confirms all-traffic protection with the Cloudflare account
members Allow policy, including production and previews. Opening the URL in
a separate browser tab redirects to Cloudflare Access sign-in. Completion of
that sign-in, and Omnisciente sign-in, have not been verified. No paid-plan
upgrade, customer-data upload or backend deployment was performed.

The authorized Railway connector found project **Omnisciente Development**
(`cc2a2570-6bb4-4c1c-a360-fb11473db43c`), environment named `production`
(`9b143765-4ea7-4a6a-8c08-046985a17dc1`). Observed:

| Service | Current evidence | Limitation |
| --- | --- | --- |
| Omnisciente API | Online; active successful deployment `885006a3-b6ad-405a-858a-0fa010bcdd88`, source `2db6afdd5b6775a20c53aded709c35d4f3c5840f`; HTTPS `/api/` returned 200 and `grc-platform/ok` | Old application revision. Latest attempted deployment `f26e097c-78e6-4506-87f6-dab39ce43bcd` failed at HEALTHCHECK. Its underlying cause remains unconfirmed. |
| MongoDB | Online; `mongo:8.3.11`, private networking, no public TCP proxy, persistent `/data/db` volume 500 MB | Database contents, effective credentials, free capacity, backups and staging isolation were not inspected or certified. |

The API's configured source pointer is `da81cdeb25f6ea4b3a303e68c15b548a16662bfb`,
which is not proof that revision is running. Variable names were inspected
without retrieving secret values. `APP_BASE_URL` is absent from the listed
variables and is required by current staging startup validation. Bootstrap
`ADMIN_*` variable names remain present. An old staged environment patch has
zero changes; it was not applied. Neither existing service was modified.

The private ChatGPT Demo version 108 and saved work remain unchanged.

## Smallest compatible arrangement

Use Cloudflare Workers Static Assets for the **normal** React build and a
small same-origin `/api` transport proxy. Run the existing Python 3.12
FastAPI/Uvicorn Dockerfile on a conventional container host, preferably the
existing Railway account if its capacity and billing permit a separate
staging service. Use a dedicated staging Mongo database and a credential
limited to that database. A separate Mongo service/volume provides stronger
isolation; provision it only after reviewing cost. Do not repoint the old API
or reuse its database credentials by default.

Native Python Workers support FastAPI, but are not a drop-in Linux runtime.
The repository pins Motor 3.7.1, whose asyncio implementation executes Mongo
operations through `ThreadPoolExecutor`. Cloudflare's Python runtime uses
Pyodide and documents threading as nonfunctional. Adapting the driver/runtime,
and validating native bcrypt/reportlab dependencies, would require changes
outside this hosting task. Cloudflare Containers can run a Linux image, but
require the Workers Paid plan and additional container lifecycle configuration.
Keep the existing backend and Mongo rather than replacing them with D1.

References inspected:
- [Cloudflare FastAPI support](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)
- [Python Workers runtime limits](https://developers.cloudflare.com/workers/languages/python/stdlib/)
- [Motor 3.7.1 executor implementation](https://github.com/mongodb/motor/blob/3.7.1/motor/frameworks/asyncio/__init__.py)
- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [Static Assets configuration](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Railway config as code](https://docs.railway.com/config-as-code/reference)

## Prepared files, not deployed application configuration

- `deploy/cloudflare/wrangler.staging.json`: targets only `omnisciente-staging`,
  serves `deploy/cloudflare/dist`, SPA navigation, API routing before assets,
  preview URLs disabled. `API_ORIGIN` deliberately empty until a reviewed
  staging backend exists. Never substitute the current old API automatically.
- `deploy/cloudflare/worker.mjs`: HTTPS fixed-origin proxy; preserves application
  authorization, original Origin, idempotency keys, cookie attributes, binary
  downloads and backend failure statuses. API responses are not cached. Missing
  configuration returns 503 rather than a Demo response or SPA HTML. Access
  cookies and forwarded identity headers are removed before contacting Railway.
  Backend redirects remain on the frontend origin; foreign redirects fail.
- `frontend/scripts/staging.cjs`: builds normal sign-in with Demo disabled,
  same-origin API, no source maps, output separate from ChatGPT's `build`.
- `deploy/railway.staging.json`: root-context existing Dockerfile, `/api/`
  health check, bounded restart policy, watches backend and shared catalogs.
  It is not auto-discovered at the repository root and does not change the
  existing Railway service. Set the custom config path only on the selected
  new staging service.

## Remaining setup steps

1. In Railway, review existing subscription/usage and capacity. Decide whether
   a new isolated staging API/database can run within the approved budget.
   No service, volume, paid upgrade or deployment has been created by this
   preparation. Keep the current services and records intact. If Railway is
   unsuitable, the same Dockerfile works on another conventional container
   host with an external dedicated MongoDB; no application rewrite is needed.
2. Provision an empty database `staging_omnisciente_cf` using a separate
   credential restricted to that database (`readWrite`, including index
   creation), with private networking or an explicit backend egress allowlist.
   Do not expose Mongo publicly or allow all internet addresses. Validate
   available disk/index capacity, credential scope, backup and restore first.
   The existing 500 MB volume must not be assumed sufficient for a second
   database. Do not copy real client records or seed legacy Demo data.
3. Create/configure the selected isolated API service from a reviewed revision
   of `robbashea-lab/GRC`, repo root `/`, Dockerfile `backend/Dockerfile`, custom
   Railway config path `/deploy/railway.staging.json`. Disable automatic deploy
   until the staging configuration is checked. The Docker build requires repo
   root context because it copies existing frontend catalogs and shared rules.
4. Enter these values directly in the backend host's environment/secret UI:

   | Name | Value / handling |
   | --- | --- |
   | `APP_ENV` | `staging` |
   | `DB_NAME` | `staging_omnisciente_cf` |
   | `MONGO_URL` | Dedicated connection credential, secret |
   | `JWT_SECRET` | New independently generated random secret, >=32 characters; secret |
   | `APP_BASE_URL` | `https://omnisciente-staging.mr-robbashea.workers.dev` |
   | `CORS_ORIGINS` | Same exact HTTPS UI origin; no wildcard |
   | `DEMO_MODE` | `false` |
   | `RUN_LEGACY_MIGRATIONS` | `false` |
   | `ADMIN_EMAIL` | Staging administrator's controlled account email |
   | `ADMIN_NAME` | Staging Administrator |
   | `ADMIN_PASSWORD_HASH` | bcrypt hash of a unique password; secret; remove after bootstrap |

   Generate secrets locally with a password manager or trusted Python tooling.
   To generate the bcrypt hash with the project's installed backend dependencies,
   run `python -c "import bcrypt,getpass; print(bcrypt.hashpw(getpass.getpass('Staging admin password: ').encode(), bcrypt.gensalt()).decode())"`
   in a private local terminal, then enter the hash directly into the host's
   secret UI. Do not send the password, hash, connection URI or JWT secret in
   chat, Git, screenshots, logs or frontend settings. The generated hash is a
   sensitive bootstrap credential. Remove bootstrap variables after successful
   initialization; initialization inserts an account, not a password reset.
   Leave outbound email and cron secrets unset unless a controlled sandbox is
   explicitly configured. Existing admin account creation supports a password;
   test invites/reset-email only after configuring sandbox delivery.
5. Deploy the API only after confirming the service/database and budget.
   Require successful startup/index initialization, `/api/` health and denied
   unauthenticated record access. Record the actual running SHA. A 200 health
   response alone does not demonstrate permissions or persistence.
6. In a clean checkout, install frontend dependencies from the existing Yarn
   1.22.22 lockfile (`yarn install --frozen-lockfile` in `frontend`), then from
   repo root run `node frontend/scripts/staging.cjs`. Do not use `build:preview`
   or `scripts/preview.cjs`. Do not use a stale shared node_modules junction for
   release evidence. Keep `.env*` files absent from this build environment and
   inspect public `REACT_APP_*` settings; CRA embeds them in browser bundles.
7. Set `vars.API_ORIGIN` in the staging Wrangler configuration to the approved
   backend's HTTPS origin, without `/api`, credentials, query or trailing path.
   This origin is public configuration, not a secret. Never put Mongo/JWT/admin
   values in Cloudflare frontend configuration. Using a same-origin `/api` proxy
   keeps the existing Secure, HttpOnly, SameSite=Lax cookies working without
   weakening their attributes or introducing cross-site browser cookie reliance.
8. With the official Cloudflare Wrangler CLI, authenticate through its browser
   flow, inspect `wrangler deploy --config deploy/cloudflare/wrangler.staging.json
   --dry-run`, then deploy only to the new staging Worker. Do not change account
   permissions or mint/paste an API token in chat. Verify the all-traffic
   Cloudflare account-members Access policy remains attached after deployment.
   Do not connect default-main automatic builds to a preview build command.

Cloudflare Access is an outer staging access boundary, not Omnisciente account
authorization. It does not automatically protect the Railway origin URL.
Verify direct-origin authentication and tenant permissions separately; before
claiming fully private staging, restrict origin ingress through the provider's
supported controls or an approved Access-protected origin arrangement. Do not
trust forwarded user/tenant headers or turn on wildcard proxy trust. Distributed
authentication rate limiting, static security headers/CSP, origin ingress,
monitoring, backup/restore and rollback remain launch checks described in
`docs/staging-security.md`. No infrastructure control is asserted implemented
merely because it appears in these instructions.

## Verification and acceptance

Preparation checks completed: `node --test deploy/cloudflare/worker.test.mjs`
passed 6 tests; `node --check frontend/scripts/staging.cjs` and
`git diff --check` passed. Tests cover transport behavior and mocked upstream
boundaries; they do not exercise server authorization, Mongo or a deployed
Worker. The normal frontend build and Docker build have not been run in this
new clean worktree (frontend dependencies and Docker CLI are absent). Wrangler
schema/dry-run and backend deployment are pending. Existing CIS verification
was not repeated or substituted for hosted-staging verification.

After deploying, use fictional tenants and separately controlled role accounts
through the ordinary interface. Verify actual application login, cookie
reopening, logout/revocation, disabled accounts, saving and reopening assessment
answers, Review, tickets, CSV and binary evidence downloads. Verify direct
unauthorized and cross-tenant API/file/export/search requests are denied, and
read-only accounts cannot mutate records. Recheck role/membership revocations,
Origin rejection, retry/duplicate behavior and completed history. Restart the
staging API and verify records remain in the dedicated Mongo database. Verify
backups restore into a separate disposable database. Record deployed frontend
and backend versions separately from these preparation tests. This is not
production deployment or an assertion that the user's usability review passed.
