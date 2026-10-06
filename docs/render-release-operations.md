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

The service must also use the connected **Git Provider** repository. A public Git
URL or a saved CI policy alone does not establish automatic delivery. Verify that
`robbashea-lab/GRC` appears in the repository picker and in the existing Render
GitHub app's selected repository access. Preserve its scope; do not grant access
to unrelated repositories. When updating Source, retain Docker, branch main,
`deploy/RenderStaging.Dockerfile`, context `.`, the Free plan, health path `/api/`
and existing environment values. The source editor initially proposes Node;
select Docker before saving. See [Render Git-provider setup](https://render.com/docs/git-provider).

A source-configuration save is not proof of merge-triggered deployment. Verify a
subsequent reviewed merge, its completed main-push gate and a Render automatic
deployment of that same SHA. Do not substitute a manual deploy for that proof.

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

## Verified integration and acceptance ledger

PR41 merged through the applied protections as
`2d13a3e6286e457fed70bd14ba1825fc18e4b8b9`. Its actual main-push
[run 37373098036](https://github.com/robbashea-lab/GRC/actions/runs/37373098036)
passed after GitHub runner-assignment failures were retried: 215 frontend suites,
1,550 tests, one snapshot, both builds, 631 backend tests plus 690 subtests and
99 disposable Mongo checks. Cancelled prerequisites did not satisfy the gate.

PR39 then merged as `1b9691d7dc51bc7b5577fc49304d6422135f3889`; its actual main-push
[run 37380150170](https://github.com/robbashea-lab/GRC/actions/runs/37380150170)
passed 215 frontend suites, 1,552 tests, one snapshot, both builds, 631 backend tests
plus 690 subtests and 99 disposable Mongo checks. Its correction changes only the
recorded CIS-group subtitle; this operating-document update changes no application
code or build inputs.

Main protection requires a PR, an up-to-date `Release gate` from GitHub Actions
and no administrator bypass. The existing Free Docker service's saved policy is
main / **After CI Checks Pass**. The missing Git-provider repository connection was
identified separately from successful CI and corrected using the existing Render
installation scoped to GRC.

The PR introducing this ledger carries the final acceptance handoff: tested and
merged SHAs, actual main-push CI, Render trigger/deploy/served-asset evidence,
hosted workflow observations, private preview version/source/access and remaining
limitations. Read that handoff for the final delivery state; successful CI alone
does not establish hosted acceptance. Preserve the sequential release/session
handoffs recorded on PR42, PR43 and PR44.

The subsequent [hosted acceptance record](release-hosted-acceptance.md) records
authenticated observations, synthetic persistence checks, remaining limitations
and the demonstrated Demo selection-cache correction. Read its correcting PR's
final handoff for the final deployed revision and logout/isolation results.
