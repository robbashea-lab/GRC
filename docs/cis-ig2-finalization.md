# CIS IG2 focused finalization

Date: 2026-10-04. PR: [27](https://github.com/robbashea-lab/GRC/pull/27).
This record supersedes the initial implementation's remaining-failure and
no-publication boundary in `cis-ig2-implementation.md`; earlier results there
remain historical evidence, not the final release gate.

The user explicitly authorized a normal merge after checks/repository review
requirements pass and publication to the existing owner-private ChatGPT Demo
preview. Production backend deployment/data changes remain excluded. The user
accepted real-authenticated-backend browser integration as a documented
production-release limitation; Demo publication does not close it.

## Fixes and preserved assertions

The final application/test-fix commit is
`30790cffa56a8f56b8a7201389323b2c43c7a479`. During finalization, main advanced
from `e3753e9481e10d9d91198a60397a97f1443f6078` to PR #28 merge
`58dd66af7489cc99393552d1c4c49d38495c7206`. The latter was merged into this
branch, preserving its removed CIS/ISO setup panels and SOC workspace cleanup,
while retaining IG2 scope/navigation/guidance and the retained-record notice.

- The CIS status-label snapshot was stale. Merged commit `5525f543` deliberately
  changed CIS `needs_attention` to “Not Implemented.” The snapshot now matches
  that established vocabulary; production status behavior was not changed.
- Three Review-history tests sent `notes`, whereas both the trusted backend's
  `ReviewCompleteIn` and Demo's completion allowlist accept `completion_notes`.
  The tests now use that contract. All owner/title/date/full-object history
  equality and month-end recurrence assertions remain. A completion-note
  preservation assertion was added. No obsolete alias or permissive fallback
  was added to production code.
- Scope reconciliation previously could mark proposed IG2 Review drivers active
  before publishing the client configuration. Proposal reconciliation now keeps
  current mappings limited to authoritative scope, with new IG2-only drivers
  inactive and their current safeguard membership empty. After publishing scope,
  reconciliation activates the mappings. A regression test injects a failure
  after all proposed Reviews initialize and before publication: 130 retained
  assessments/15 Reviews exist, but only 56 safeguards remain active, default
  export has 56 rows, and proposed IG2-only drivers are inactive. Same-command
  retry reuses those identities and activates IG2 without Review duplicates.
- Transition staging caps Review drivers at the lesser of the before/after
  scopes. A second regression test interrupts reduction after IG1 publication
  but before final reconciliation: IG1 remains authoritative, no active driver
  includes IG2 safeguards, and retry/re-enablement retain original assessments.
  A failed reduction before publication can temporarily cap Review mappings at
  IG1 while the client remains IG2; the durable retry restores the intended
  mappings without changing schedule/history/open work.
- The first complete frontend run found one further timeout: all 130 safeguard
  layouts ran inside one five-second test. The test now uses one isolated case
  per safeguard, preserving every assertion and the original timeout. No test
  was skipped or weakened.

The lifecycle tests still verify original 56 records, custom descriptions/dates/
recurrence/anchors/completed occurrences, open Actions, other framework drivers,
scope reduction/re-enablement, stale writes and durable audit recovery. This is
not an all-collections transaction. Partial records remain recoverable while
the authoritative scope and current drivers prevent active IG2 leakage.

## Verification order and boundaries

The initial four failures were investigated before test changes. The corrected
two suites then passed 12 tests and their snapshot. Focused backend checks passed
54 tests and 24 subtests. Before main reconciliation, the focused ten-year run
passed seven tests after the final seed correction; the complete run passed
198 suites and failed only the newly exposed layout timeout. After the reduction
recovery fix, backend checks passed 584 tests/683 subtests and 54 real-Mongo tests.
Those earlier runs are historical, not evidence for the subsequently merged
workspace cleanup. The table below records fresh checks of the reconciled
`30790cffa56a8f56b8a7201389323b2c43c7a479` application/test tree. A briefly
started frontend run on the pre-reconciliation tree was interrupted and is not
counted as a completed gate. Documentation-only follow-up changes do not change
the tested application tree.

| Check after final fixes | Result |
| --- | --- |
| Complete configured backend `python -m pytest -q` | 584 passed, 683 subtests passed; 228.37 seconds; eight existing lifecycle deprecation warnings |
| Actual isolated Mongo recovery, `--include-cis-ig2` | 54 passed, including all eight CIS tests; 62.824 seconds |
| Normal optimized build | Passed |
| Demo build, `node scripts/preview.cjs build` | Passed |
| Fresh local Edge Demo browser | 37 checks passed, no application errors; four clients |
| Ten-year simulation within the complete reconciled run | Passed, 868.241 seconds; original assertions/time limit unchanged |
| Complete frontend `craco test --watch=false --runInBand`, no exclusions | 198 suites / 1,350 tests / one snapshot passed; zero failed or pending tests; 1,264.768 seconds |

Actual-storage verification used the existing approved MongoDB 8.0.28 executable
on localhost:27047, an isolated local data directory and disposable test databases.
It exercised FastAPI through ASGI with real Mongo persistence, not a real
authenticated browser backend. Existing runtime: FastAPI 0.141.1/Pydantic 2.13.5,
not a fresh environment installed from pinned requirements. No certificates,
machine trust, security controls or production data were changed.

Local browser QA uses a fresh isolated session and synthetic Demo data. It checks
Initech 130/74, Brawndo 56, scope reduction/re-enablement, saved method without
automatic implementation/verification, numeric navigation, guidance/drafts,
keyboard, light/dark, 320/390px reflow, CSV and linked Evidence bytes. Dunder ISO
and Prestige SOC 2 methods save and survive reopening; their guidance remains
available. Hosted QA will exercise that same artifact after publication using
the Sites platform's documented service-access credential over normal HTTPS,
restricted to this Site origin. This is not verification of a signed-in human's
SIWC flow or the production backend's authentication.

Existing Node `fs.F_OK`, FastAPI lifecycle deprecations and bundle-size advisories
remain. No dependencies or lockfiles were changed. Independent security/legal
review is not claimed. Content authorization remains the user's explicit CIS
v8.1 IG2 confirmation.

The configured read-only installed-tree dependency audit completed against
1,304 package names and reported 16 advisory matches (Axios, braces and SVGO).
These are unresolved installed-tree findings, not application exploitability
verification or introduced dependency changes. No automatic upgrades, overrides
or security suppression were applied as part of this focused finalization.

## Repository and publication gate

Repository reads on the reconciled pushed head found main unprotected, no
rulesets, status checks, check runs, submitted reviews or review threads. The
empty combined-status response says pending but contains no configured statuses;
it is not evidence of a running or required check. These are refreshed for the
final documentation-only head before normal GitHub merge enforcement.
No bypass or force operation is authorized or planned.

Existing Site project: `appgprj_6a9cafcbde888191ae1b350224562554`.
Verified current Site: active, version 101, owner-private custom allowlist with
one owner, no groups or external visitors.
During this run, the existing preview advanced to version 102; a fresh native
read confirmed its URL and access-policy revision 1 remained unchanged.
Existing URL: https://iventure-grc-code-preview.mr-robbashea.chatgpt.site .
Preserve that project, URL and access policy. Merged SHA, published revision and
post-publication results will be recorded in the final PR handoff.
