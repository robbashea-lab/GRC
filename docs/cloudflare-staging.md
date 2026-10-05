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

Further read-only inventory found a second project, **iVenture GRC Test**, with
an online Mongo service and its own 500 MB volume; its API has no deployment.
The sampled recent API HTTP logs contained only our health probe. That does
not establish the absence of other consumers or classify stored data. Connector
variable values are redacted, and Railway billing requires a separate account
sign-in. Safe reuse or deletion of either database is **not established**.
The existing API depends on its configured Mongo connection; the delivered
static Demo does not use this API. Other externally configured consumers remain
unknown. Leave both projects untouched. Before retirement, inventory consumers,
back up retained databases, verify restore and agree on retention/deletion.
Removing Railway from the new architecture does not cancel existing charges.

The private ChatGPT Demo version 108 and saved work remain unchanged.

## Smallest compatible arrangement

Use Cloudflare Workers Static Assets for the **normal** React build and a
small same-origin `/api` transport proxy. Run the existing Python 3.12
FastAPI/Uvicorn Dockerfile on **Render**, with a new **MongoDB Atlas Free**
cluster in a dedicated staging project. This removes Railway from staging
without changing the API framework or database. Use a dedicated database and
credential limited to it. Do not repoint or copy the old services or records.
Evidence bytes are stored in Mongo by the existing backend, so no Render disk
or additional file-storage service is required for the current application.

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
- [Render Docker/Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses)

## Proposed resources and cost decision

Prices checked 2026-10-05, before tax. No Render or Atlas resources or paid
upgrades have been created. Their account eligibility and remaining shared
allowances are not yet verified. Cloudflare's dashboard confirms this account
currently uses **Workers Free**; Access is configured, but its separate billing
subscription has not been checked.

| Resource | Suggested starting tier | Expected new monthly charge / allowance |
| --- | --- | --- |
| Existing Cloudflare staging Worker, normal frontend and API proxy | Workers Free | $0 within account-wide 100,000 dynamic requests/day and 10 ms CPU/request; static-asset requests free. No Workers upgrade required. |
| New Render `omnisciente-staging-api` | Free | $0 compute; 750 free service-hours/month shared across the workspace. Hobby workspace includes 500 Starter pipeline minutes/month. Check remaining bandwidth/build allowances in Billing. |
| New Atlas staging project/cluster and `staging_omnisciente_cf` | Free (formerly M0) | $0; one Free cluster/project, 0.5 GB documents plus indexes, 10 GB in and out per rolling seven days. No automated backups. |
| Optional Render API upgrade, only if explicitly approved | Starter | $7/month service compute, plus any chargeable bandwidth/build overages; avoids Free idle shutdown. Atlas and Cloudflare remain Free. |
| Existing Railway services/subscription | Retained, outside new staging | Already provisioned, not new charges authorized here. Actual account credit coverage and bill are unverified. Continue to accrue under the existing plan until separately retired. |

Start with Free for a small fictional-data staging trial. Render sleeps after
15 minutes idle and takes about a minute to wake; the proxy waits up to 90
seconds for upstream headers. Render can return a warming page during startup:
verify this behavior before acceptance and wait for healthy API startup before
retrying sign-in. No automatic mutation retries or artificial keep-alive jobs
are added. Free resources can be suspended by quotas or high outbound traffic
(including Atlas queries). They are unsuitable for an uptime guarantee.
Atlas can pause after 30 days with no connections; export data before extended
inactivity. Keep evidence samples small and verify index initialization fits.

Spending controls: select only Render Free and Atlas Free, no disks, paid
workspace features, auto-scaling or automatic upgrades. With no Render payment
method, bandwidth exhaustion suspends Free services instead of buying overage,
and build exhaustion stops builds. If a payment method already exists, bandwidth
can incur overage even on Free; inspect Billing before provisioning and set the
build-pipeline spend limit to the lowest permitted amount. That limit covers
pipeline minutes, **not all spending**. Do not change workspace-wide settings
without considering other services. Monitor usage and alerts; do not claim a
hard total cap or free trial credit unless the account actually shows it.
Cloudflare Free and Atlas Free impose limits rather than providing a reason
to silently upgrade. No time-limited paid trial is needed for this proposal.

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Render Free limits](https://render.com/docs/free),
[Render pipeline limits](https://render.com/docs/build-pipeline),
[Render Starter price](https://render.com/articles/render-vs-railway),
[Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

## Prepared files, not deployed application configuration

- `deploy/cloudflare/wrangler.staging.json`: targets only `omnisciente-staging`,
  serves `deploy/cloudflare/dist`, SPA navigation, API routing before assets,
  preview URLs disabled. `API_ORIGIN` deliberately empty until a reviewed
  staging backend exists. Never substitute the current old API automatically.
- `deploy/cloudflare/worker.mjs`: HTTPS fixed-origin proxy; preserves application
  authorization, original Origin, idempotency keys, cookie attributes, binary
  downloads and backend failure statuses. API responses are not cached. Missing
  configuration returns 503 rather than a Demo response or SPA HTML. Access
  cookies and forwarded identity headers are removed before contacting Render.
  Backend redirects remain on the frontend origin; foreign redirects fail.
- `frontend/scripts/staging.cjs`: builds normal sign-in with Demo disabled,
  same-origin API, no source maps, output separate from ChatGPT's `build`.
- `deploy/render.staging.yaml`: new Free API service, root-context existing
  Dockerfile, `/api/` health check, automatic deployments off, secret values
  requested through the provider UI. Select this custom Blueprint path and
  the reviewed preparation branch explicitly. Blueprint setup may perform its
  initial deployment; do not submit until database, secrets and budget are ready.
  No existing Railway deployment configuration is changed.

## Remaining setup steps

1. Sign in to Render and MongoDB Atlas directly in their dashboards. If new
   accounts are needed, the owner completes account terms and credential setup.
   Check account usage and choose Free, or explicitly approve the optional $7
   API service. No service, volume, upgrade or application deployment has been
   created by this preparation. Existing Railway records remain untouched.
2. In Atlas, create a dedicated staging project and Free cluster, preferably
   AWS us-east-1 to match the prepared Render Virginia region. Provision an
   empty database `staging_omnisciente_cf` using a separate
   credential restricted to that database (`readWrite`, including index
   creation). Atlas Free uses public TLS endpoints, not private networking.
   Allow only the Render service's outbound IP ranges from Connect > Outbound;
   these are shared regional ranges, not an exclusive service identity. Do not
   use `0.0.0.0/0`. Restrict a temporary maintenance IP if needed for manual
   backups, and remove it afterward. Validate
   available disk/index capacity, credential scope, backup and restore first.
   Atlas Free's 0.5 GB includes indexes and evidence bytes. Back up with trusted
   MongoDB Database Tools and restore to a separate disposable database; Free
   has no managed backup. Do not copy real records or seed legacy Demo data.
3. Create/configure the selected isolated API service from a reviewed revision
   of `robbashea-lab/GRC`. In Render New > Blueprint, choose the preparation
   branch and custom path `deploy/render.staging.yaml`, review the new Free
   service, and leave automatic deployments off. Alternatively enter the same
   settings in New > Web Service: Docker runtime, root context, Dockerfile
   `backend/Dockerfile`, health path `/api/`, Virginia, Free. The build requires
   root context because it copies existing catalogs and shared rules. Render's
   `PORT` is supported by the existing Docker CMD. Once the outbound ranges are
   known, update Atlas's allowlist before requiring successful API startup.
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
authorization. It does not automatically protect the Render origin URL.
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
passed 7 tests; `node --check frontend/scripts/staging.cjs` and
`git diff --check` passed. Render YAML was parsed using the already installed
`js-yaml`, with assertions for Free tier, Docker root context, staging database,
manual deployment and absent secret values. Wrangler JSON parsed successfully.
Provider-side Blueprint validation and Wrangler schema/dry-run remain pending.
Tests cover transport behavior and mocked upstream
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
