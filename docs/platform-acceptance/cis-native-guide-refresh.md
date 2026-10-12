# PFA-001: first CIS interview write after a native save

Product baseline: `28b806716024ec149af2ec5da621a5a618c669d5`.
Author checkout: `codex/acceptance-cis-soc-20261011`, initially at QA-only
`2903a0fd349eba74e10df038d3b9334017b91fc9` with unchanged product source.

## Demonstrated behavior and requirement

The coordinator reported an authenticated staging observation on the unchanged
product: an ordinary native 1.1 Current Implementation save succeeded, then the
already mounted guide's first question-progress save returned “Assessment or
scope changed before this review started; reload before starting”. It retained
the interview draft and saved native marker. A normal fresh reload subsequently
allowed progress. This is coordinator-reported hosted evidence; this author did
not operate staging or access that fixture.

The isolated rendered reproduction uses the actual `FrameworkDrawer`,
`BrawndoCisSafeguard` and `GuidedAssessor`. Modeled API responses enforce the
existing backend's first-write base-token/scope and interview-revision checks.
On unchanged product, both ordinary-native-save sequences fail with the same
409 message: save native before opening the guide, and save native after typing
unsaved interview input. Three baseline/protection cases pass. This is an
application integration defect, not evidence that the backend guard is wrong.

`GuidedAssessor` reads interview metadata on identity changes. Ordinary native
save refreshes the parent's saved assessment but leaves the guide's revision-0
snapshot token unchanged. Its first PUT therefore submits the older token.
The existing CIS contract requires separate progress/native writes, retained
manual text/history, and explicit comparison for **persisted** interviews.
No interview has been persisted at revision 0, so refreshing that initial base
against the already confirmed native position does not rebase saved answers.

## Narrow correction and preserved contracts

Only the existing `GuidedAssessor.save` preflight condition changes: when a
workspace guide is at revision 0 and its cached current assessment token differs
from the confirmed parent token, use the existing `readNewReviewBase` checks.
Use its metadata only for the new write's base; retain local answers, notes,
step and narrative. Explicit restart keeps its previous preflight. Ordinary
fresh writes with matching tokens keep their original request count.

An existing revision remains subject to Compare/rebase. A competing interview
revision, changed scope, or native token not represented by the parent is
rejected; a writer after the read remains protected by backend base/CAS checks.
Leaving the assessment identity while the read is pending prevents the old
interview write. No native assessment, date, verification or linked-record save
is added. No JSX, static copy, CSS, artwork, catalog, evaluator, backend,
authentication, dependency or deployment configuration changes.

## Executed local evidence

Original logs are retained outside the checkout at:
`C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-soc\native-guide-refresh`.

| Log | Actual result | SHA256 |
| --- | --- | --- |
| `baseline-red.log` | Harness failed to resolve React; zero tests executed | `8ab002a78ea0a6056135b411da0cda312de3ac05a34bf2b42b8b7ce8fd66c273` |
| `baseline-red-resolved.log` | Unchanged product: 3 passed, 2 reproduced failures; 21.477s | `80f739e4f9c78cc00e457d6d3220f73c4faba9efaa4c740e7c6c004a30f2fc07` |
| `corrected-focused.log` | First correction: 440 passed, 11 failed, 451 total; 15.794s | `870164534249d4833f389fef25f7a300b267ef65d9305184a49e03fbaa83f94e` |
| `unchanged-existing-baseline.log` | Exact runtime correction temporarily reversed: 394 passed, same 10 date-fixture failures, 404 total; 10.171s | `d59bd8b2e53122e7ac697af195d122aa3e96f05fd25f3794e52f976af522f075` |
| `final-focused.log` | Final source: 7 suites, 1,070 tests passed; 73.965s | `6389f58c504bb8b669a0ce95ed06d70801eab94f91bf568252631c90b762ee2e` |

The ten original failures were independently established on unchanged product,
not dismissed using CI. At the observed Node clock `2026-10-12T00:27:29.903Z`,
America/New_York's local date was `2026-10-11`. Two existing completed-interview
helpers supplied UTC `2026-10-12`. The preserved evaluator constructs date
answers as local calendar dates and rejects future dates; these fixtures
therefore could not support their assumed completed summary. The two helpers
now reuse existing `localCalendarDate`, matching the established question/date
semantics. No evaluator/cadence rule changes or fixed test dates were added.
The provisional always-refresh change also altered one concurrency error's
origin; the final conditional refresh preserves that existing assertion and
request flow, so `GuidedAssessorFocusedLifecycle.test.jsx` is unchanged.

Final new reproduction coverage is 13 cases: normal fresh progress; the two
native-save timing sequences under each cumulative IG; persisted-interview
explicit comparison; unseen external native writer; competing first interview;
scope change; native writer after refresh read; and late identity completion.
Existing affected suites include 339 rendered placements and the 615-case
comprehensive CIS component workflow. These are rendered/model API tests, not
hosted placements, Mongo durability, real identities or denied authorization.

Tested source byte hashes:

- `frontend/src/components/GuidedAssessor.jsx`:
  `d78b8337ba14428501d177e76d23627cb6c846fd95a1c4622ed0f50347501df8`.
- `frontend/src/components/PlatformCisNativeGuideRefresh.test.jsx`:
  `4de80fdde88108dbc8d855bd81690d0f153c39351a63374192fab3d6c48be721`.

The final command used existing Node 24.19 and dependencies read-only, with
`CI=true`, the supplied dependency directory as `NODE_PATH` and Jest
`--modulePaths`, `--watchAll=false --runInBand --runTestsByPath`, selecting:

- `PlatformCisNativeGuideRefresh.test.jsx`
- `GuidedAssessor.test.jsx`
- `GuidedAssessorFocusedLifecycle.test.jsx`
- `GuidedLifecycleNative.test.jsx`
- `OmniCisRolloutRendered.test.jsx`
- `GuidedLifecycle.test.jsx`
- `CisComprehensiveWorkflowCoverage.test.jsx`

## Remaining release work

Independent source/retest disposition, integrated-candidate full regression,
both builds, exact-candidate CI and the coordinator's affected hosted retest
remain separate gates. This author performed no browser, database, account,
authentication/recovery, staging deployment, publication or production action.
No existing acceptance gap is waived by these local results.
