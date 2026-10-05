# Main-to-Render delivery

Render staging is the primary hosted target: `omnisciente-staging`, service
`srv-db1s0cugekts73f72reg`, Free Docker instance, branch `main`.
Atlas remains Free. `DEMO_MODE=false` and legacy migrations remain disabled.
Do not change credentials, seed accounts, reseed data or create another service.

## Release gate

`.github/workflows/release-verification.yml` runs on every PR targeting main and
every main push, including documentation changes. It runs all classified offline
backend suites, disposable loopback Mongo persistence/recovery/authorization
checks, all frontend suites and both authenticated staging and isolated Demo
builds. No staging database credentials are available to these jobs.
The aggregate `Release gate` fails unless both jobs finish successfully, including
when a prerequisite fails, is cancelled or skipped. Require this check in main's
branch protection and follow the normal reviewed PR workflow.

Render must use **After CI Checks Pass**, matching `autoDeployTrigger: checksPass`
in `deploy/render.staging.yaml`. No deploy hooks or Actions deployment jobs are
needed. Render treats neutral/skipped GitHub checks as passing, making the explicit
aggregate check necessary. See [Render CI integration](https://render.com/docs/deploys#integrating-with-ci)
and [GitHub job dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds).

Before release, fetch main, reconcile intervening changes, rerun affected checks,
and obtain independent review. After merge, inspect the **push** run for the exact
main SHA; a PR run checks a different revision. Confirm Render's successful deploy
commit and compare served JS/CSS assets with the tested normal build. Health/build
success does not replace authenticated browser acceptance.

## Failure and rollback

A failed gate blocks automatic deployment. Fix the demonstrated failure through a
reviewed PR; never skip a job, weaken assertions, or use manual deployment to evade
it. A failed Render build/health check is a deployment failure; inspect its logs
and the last live revision before changing anything.

Prefer a reviewed Git revert of the faulty application change, with the same gate
and automatic deployment. For urgent recovery, an authorized operator can select
the previous known-good Render deployment. **Application rollback does not roll
back MongoDB data or reverse migrations.** Preserve database contents and check
compatibility before reverting code; never reset/reseed Atlas. Database recovery
requires a separate plan and authorization.

Render's Dashboard rollback disables auto-deploy; inspect Settings afterwards and
restore **After CI Checks Pass** once the underlying issue is fixed. After any
manual deployment, also verify branch main, auto-deploy policy and live commit.
See [Render rollbacks](https://render.com/docs/rollbacks).

## Private preview and acceptance limits

The owner-only ChatGPT preview retains its existing URL and access. Publish the
exact merged source through its existing Sites publication process separately;
GitHub-to-Render automation does not publish it. Its Demo/static checks do not prove
authenticated persistence.

Coordinate the single administrator session before login/logout: logout revokes
all that account's sessions. Use labelled synthetic staging records and preserve
real saved work. Administrator browsing alone does not prove tenant isolation;
use restricted identities in isolated tests without creating hosted accounts.
Retain unresolved browser-download, email and backup/restore checks explicitly.
The 111 unfinished ISO source comparisons remain content dependencies, not release
authorization to invent protected or unverified source material.

## Reconciliation baseline

Remote main baseline: `0e1494247be98fe3f329f19ed03f51e1ec5c0c3b`.
Includes PR34 staging, PR37 account projection, PR38 dashboard, PR36 assessment and
PR40 assessment release evidence. At inspection Render was live on
`92044402686d51c07e0bafc31f57999166a6996b`, manual deployment policy Off.
PR39 is the sole open PR: narrow recorded CIS-group subtitle correction. Historical
unmerged branches are preserved; no unrelated branch is included in this release.
All five pre-existing local worktrees were clean at inspection. The dashboard
delivery branch contains additional documentation; it is preserved separately.

Delivery/hosted results are pending until the exact reviewed merge, successful main
CI run, automatic deployment and final browser acceptance are observed.
