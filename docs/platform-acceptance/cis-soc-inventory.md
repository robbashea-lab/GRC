# CIS and SOC acceptance inventory

This is the initial, source-inspected acceptance map for the new full-platform mandate. It is not a new hosted campaign, source-content approval, or readiness verdict. The initial phase produced this file and its adjacent JSON inventory; the coordinator subsequently assigned the narrow new QA files listed below.

## Baseline and ownership

- Checkout: `platform-acceptance/cis-soc`; branch `codex/acceptance-cis-soc-20261011`.
- Verified local main ancestry: `28b806716024ec149af2ec5da621a5a618c669d5`, tree `8ad5bb83d0c4c227ae8f9c4e9974377ba9c255eb`, parents `911706cebc7a70c0443f500fcd4bc19260c1db60` and `71159a14062e50ebd773af6ca6593cfa30f5c922`.
- The coordinator owns current GitHub/Render verification, staging deployment, and the authenticated browser session. This workstream did not read or operate those surfaces.
- Initial assigned ownership was inventory and coverage requirements only. The coordinator subsequently acknowledged ownership of new `backend/tests/test_platform_cis_soc_inventory.py` and `backend/tests/platform_cis_soc_vectors.cjs`. Existing tests, the shared test registry, runtime, hosted fixtures and account actions remain coordinator-owned.
- The latest user mandate freezes all visuals and static wording, including interview questions/guidance. Content or discoverability concerns are report-only. Functional corrections need a reproducible failure and independent retest.
- No applicable filesystem `AGENTS.md` was found in checkout or its ancestor directories. The supplied engineering instructions apply. Ponytail full is applied: reuse approved code and harnesses, avoid duplicate tests and speculative changes.

`cis-soc-inventory.json` contains one row for each of 214 unique definitions, their current question IDs/types/conditions, scope, source references, versions, plan mapping, existing parameterized suites, and current reachability. Its isolated Node VM evaluated the existing pure frontend catalog composition; it did not import the server or operate authentication, a database, a browser, or a network client. The assertions establish inventory consistency only.

Git-blob and checked-out-file SHA-256 values are separate. This Windows checkout has CRLF transformations in some files. For example the committed SOC catalog hash remains `0f3b43bf3f1992d3ab87e1a197a48c02564feb259b61a713c8792ad611848979`; its checked-out byte hash differs. Do not compare historical LF hashes with current CRLF hashes and infer an application change.

## Catalog and version contract

| Program | Unique definitions | Applicable primary inventory | Source/content baseline | Current guide |
| --- | ---: | --- | --- | --- |
| CIS IG1 | Same canonical CIS namespace | 56 | CIS Controls v8.1; approved `cisIG1.json` and source-reviewed atomic elements | Current version selected by safeguard ID |
| CIS IG2 | Same namespace | 130 = 56 + 74 | Inherited IG1 criteria remain identical | Same definition reused across cumulative groups |
| CIS IG3 | 153 total | 153 = 130 + 23 | Inherited IG1/IG2 criteria remain identical | Same definition reused across cumulative groups |
| SOC 2 | 61 total | Security + Availability + Confidentiality = 38 | AICPA/ASEC 2017 TSC with revised Points of Focus 2022; authored interview, not official wording | `soc2-omni-1` |

The canonical native/guide ID and title comparisons passed for all 214 unique definitions. Current CIS UI eligibility agrees with minimum-group membership on all 339 cumulative placements. SOC has Security/Common Criteria 33, Availability 3, Confidentiality 2, Processing Integrity 5, Privacy 18. The new primary SOC QA client should select exactly the first three categories; derivative QA fixtures may test the other supported configurations. Permanent Prestige remains empty and must not receive synthetic writes.

CIS current guide composition has 1,571 question entries:

| Question version | Definitions | Meaning |
| --- | ---: | --- |
| `cis-v8.1-control1-3` | 1 | Approved 1.1 inventory experience |
| `cis-v8.1-control1-4` | 1 | Source-corrected 1.2, prerequisite inventory is read-only context |
| `cis-v8.1-control1-2` | 3 | 1.3, 1.4 and 1.5 retain their approved version |
| `cis-v8.1-program-3` | 147 | Current source-reviewed atomic requirements |
| `cis-v8.1-program-4` | 1 | 17.5, source-conditioned third-party role requirement |

The backend and frontend retain eight explicit CIS readers: `brawndo-cis-pilot-1`, `cis-v8.1-control1-2`, `cis-v8.1-program-1`, `cis-v8.1-program-2`, `cis-v8.1-control1-3`, `cis-v8.1-control1-4`, `cis-v8.1-program-3`, `cis-v8.1-program-4`. SOC retains `soc2-omni-1` and reviewed-answer metadata. Version changes are explicit, archive old states, and preserve only semantically compatible answers. A source correction must not silently reinterpret earlier answers or regenerate saved native narratives.

SOC contains 155 authored groups and 174 questions: 166 substantive selections, six conditional system-context questions, and two optional text questions. The six contexts occur in P2.1 (two), P3.2, P6.1, P6.4 and P6.5, controlling 11 substantive children. `Relevant`, `Outside the selected system` with explanation, and `Not sure` have distinct behavior. Outside does not create a whole-criterion N/A outcome. Inactive child answers remain historical and do not score the active interview.

## Existing callers, writers, and state boundaries

| Responsibility | Existing paths | Required preservation |
| --- | --- | --- |
| CIS eligibility/version/questions | `frontend/src/lib/guidedAssessment.js`; `backend/guided_assessment.py`; `backend/framework_catalog.py` | Authorized client, CIS program, group, canonical safeguard; no client-name gate |
| CIS grouped behavior and summary | `frontend/src/lib/refinedOmni.js`, `focusedOmni.js`, `omniCisSummary.js`, `omniInventorySummary.js`; `GuidedAssessor.jsx` | Approved 1.1 design; safeguard-specific grouping and exact reviewed prose |
| SOC eligibility/evaluator | `frontend/src/lib/socGuidedAssessment.js`; `backend/soc_guided_assessment.py` | Selected categories, selected system/period scope, active questions; readiness separate from operating assurance |
| SOC grouped UI/native adapter | `SocGuidedAssessor.jsx`; `PrestigeSocAssessment.jsx`; shared `FrameworkDrawer.jsx`/assessment actions | Existing artwork/layout/static wording; summary review basis; exact reviewed multiline implementation |
| Program configuration and native records | `backend/framework_governance.py`; `framework_catalog.py`; `cis_scope.py`; `soc_readiness.py` | Idempotent stable IDs, additive activation, history, scope changes, independent verification |
| Interview progress/history | `GET/PUT /api/framework_assessments/{id}/guided-assessment`; `GET .../guided-assessment/history` | Actor-scoped draft identity; version and revision CAS; progress never applies native implementation |
| Native save | `PATCH /api/framework_assessments/{id}` | Exact text and separate status; explicit replacement; native token/current interview/source checks; unrelated fields unchanged |
| SOC serialization | `backend/soc_guided_lease.py`; live `write_context` before and inside lease | Live actor/membership/assignment checks, 120-second lease, 90-second operation timeout, 80-second driver deadline; uncertain outcome requires authoritative reload |
| Shared recurring work | `framework_governance.reconcile_catalog`; `review_occurrences.py`; review commands | Completed occurrence anchors/evidence/history retained; central Review is not proof of the external operational duty |

The main candidate already includes the final SOC live-authority recheck and unsaved restart/rebase protection. Native retained-record edits deliberately do not acquire new guide-activation criteria. Do not reintroduce the independently caught regression requiring an active category/program for every ordinary native edit.

Native implementation codes remain `not_assessed`, `needs_attention`, `in_progress`, `addressed`, with authorized native applicability handled separately. SOC's guide readiness labels and the native friendly labels differ intentionally: native `addressed` displays `Implemented`, while the guide uses `Addressed (Readiness)`. This is existing approved behavior, not a scoring migration.

Summary output remains one exact editable Current Implementation value with `OVERVIEW`, `IMPLEMENTATION BREAKDOWN` and `ITEMS TO ADDRESS`. Status is separate. Group progress, visiting a guide, completing an interview, saving an assessment, and verification are different events. No automatic verification, Review completion, finding/action creation/closure, control-operation conclusion, or evidence upload requirement follows from OmniBot.

## Distinct design and recurrence paths

The preserved CIS current-source design inventory at `6a4c0c7` has 25 structural designs. The JSON maps each current definition to that historical design ID without claiming a fresh browser execution. 1.1, 1.2, 1.3, 1.4 and 1.5 have distinct specialized behavior. The other designs differ by mandatory/conditional matrix counts, matrix lengths, root transitions, and scope exclusions; 17.5 is separate. Actual current affirmative/fresh reachable group lists are in each JSON row. Do not force every interview into five inventory groups.

CIS requirement types are 25 recurring, 80 operational, 27 state, 13 event and eight training. These classifications are not 153 automatic yearly Reviews. Current default Review count is 12/15/15 for IG1/IG2/IG3. IG3 exposes five additional optional plans, disabled by default: passive discovery reconciliation (custom seven days), script allowlist reassessment (semiannual), event alert tuning (monthly), provider assessment (annual), and internal penetration testing (annual). All 20 plan definitions, source references and enabled/default distinctions are in the JSON.

SOC has 61 state criteria and eight recommended management Reviews: one quarterly access Review and seven annual Reviews. The AICPA criteria do not prescribe those management numerical intervals. Configuration and client control commitments, rather than a new universal annual mandate, drive the operational test cases. Assessment readiness must remain separate from the operating period/evidence and external auditor conclusions.

Reuse the existing calendar-anchor scheduler. Do not replace its calendar recurrence with the UI's approximate `cadenceDays` comparison values. Weekly is represented by the supported custom-seven-day plan; one-time, continuous and event work must use the existing state model or be explicitly classified unsupported. No live clock change or future staging data is permitted.

## Retained evidence and its limits

| Layer | Existing evidence | Precise boundary |
| --- | --- | --- |
| CIS source/question/status review | `docs/omni-cis-rollout/coverage-matrix.json`; IG1/2/3 review/status fixtures; `docs/login-cis-closeout/comprehensive-qa/content/153-row-source-question-review.json` | All 153 previously source-reviewed; no new external normative review executed here |
| CIS decision fixtures | `cisRolloutContentReview.test.js` uses 1,052 + 2,525 + 690 source-justified fixtures = 4,267 | Parameterized deterministic evaluation/summary tests; historical/current versions kept explicit, not every answer combination |
| CIS rendered coverage | `CisComprehensiveWorkflowCoverage.test.jsx`; per-design/per-safeguard coverage JSON | Prior fixed-clock run 614 passed; current file also acknowledges the later SOC/ISO controllers. API/auth/tenant shells mocked. 153 fresh walks, 339 native-adapter placements; not 339 hosted saves |
| CIS hosted | `hosted-placements-b90.json`, `hosted-lifecycles-b90.json`, comprehensive hosted extension, targeted current-source checkpoints | Original b90 has 348 placement observations/339 placements, 54 lifecycle observations plus separate design extension. Later 17.5 read-only checks did not rerun later groups. Brawndo 1.2/3.5 exceptions were one-time interview-only actions, not general write authorization |
| SOC pure/controller/routes | `socGuidedAssessment.test.js`, `SocGuidedAssessor.test.jsx`, `test_soc_guided_assessment.py`, `test_soc_guided_routes.py` | Full ID-positive coverage; first-substantive-question perturbations and six context branches; component/native/API/real-Mongo layers differ |
| SOC hosted | `docs/soc2-omnibot/validation.md`, `mongo-lease-validation.md`, shared coordinator handoff | 5c3594c: 61 native positive cases/155 groups, 59 fresh plus two updates. b384: 59 first-group reads plus two saves. Later candidate corrections and read-only smokes are separate. No new main hosted campaign by this workstream |
| Protected showcase | Coordinator's persistent Brawndo/Initech/Hooli/Prestige records | Showcase visits read-only; synthetic saves only new approved primary/derivative QA clients. Prestige stays empty/permanent |
| Release baseline | Prior closing receipt main28b/CI141+142/Live staging | Coordinator must recheck current provider; older exact-candidate CI is not the new acceptance campaign |

The earliest CIS handoff lists checks later completed on b90/6a4c; do not copy its stale outstanding list into a current report. Conversely, prior successful local/Demo/source/ASGI evidence cannot close actual restricted identities, hosted logout/login, device pointer tests, or after-last-check worker-fencing assurance.

## Reusable safe harnesses and additional coverage required

Backend suites are explicitly classified in `backend/tests/suites.json`. `backend/conftest.py` rejects environment-test collection without an explicit target. `backend/pytest.ini` fixes two workers/loadscope. Reuse those boundaries; do not change security settings or registry rules for convenience.

| Target | Reusable harness/suite | Narrow new acceptance need |
| --- | --- | --- |
| Full CIS ID/group/evaluator/adapter coverage | Existing 4,267 content fixtures; `GuidedTests`/`PilotHistoryTests`; comprehensive connected components | Reuse exact-revision CI or focused relevant suites after an actual change. Add coverage only for a demonstrated uncovered version or condition, not duplicate all existing tests |
| SOC every substantive question affects status and summary | Pure JS/Python engines and existing conformance batch | Existing suites perturb the first substantive question per criterion. A new bounded parameterization over all 166 active substantive questions should independently assert No/Partially/unknown → corrective/confirmation signals, restored Yes removes the affected issue, no answer/native mutation, and inactive children remain ignored. Treat old independent 1,917-case reports separately unless their exact executed cases are available |
| SOC conditional rendered transitions | Six contexts/11 children; existing P6.1 empty-group test and controller helper | Exercise each remaining distinct group skip/reappearance through actual rendered controls, then progress resume. Validate explanation/cancel/save rules; preserve inactive answers and reviewed text. Do not merely inject hidden answers |
| Existing/new/mixed-program activation | `CisSixYearTests.test_fresh_released_groups_are_unassessed_and_optional`; `SocTests`; existing scope retirement/reactivation tests | New primary IG1, IG2, IG3, SOC38 through normal isolated onboarding; add program and repeated configuration on derivative fixtures; preserve main baseline clients and inherited records |
| Four independent ten-year CIS/SOC lifecycles | `FrameworkThreeYearTests` helpers, `TenYearOperationTests`, `CisSixYearTests`, review command/scheduler paths | New isolated ten-year IG1, IG2, IG3 and SOC38 runs, not one IG1 campaign with later expansion. Keep primary scopes fixed; scope expansion/optional categories on derivative fixtures |
| Longitudinal assertions | Existing real route clock injection, occurrence/evidence snapshots, dashboard/Calendar reconciliation | Independently computed per-year counts/anchors; overdue/late/catch-up/retry/duplicates; history/evidence/assessment linkage; owner changes only in isolated harness. Preserve original scope/verification and test repeated requests |
| Hosted task/persona flows | Coordinator-owned normal browser and actual approved identities | Business/product: truthful scope/count/drill-down; CISO: readiness vs verification/exposure; analyst: full work chain/resume/handoff; client: unaided assigned-work and real server denial. Administrator/modeled identities do not establish client-role acceptance |

The existing `test_ten_year_operation.py` runs one Brawndo-equivalent IG1 campaign, not all five requested framework clients. `test_cis_six_year.py` runs 2027–2032 on a single fixture upgraded every two years. `test_framework_three_year.py` covers shorter distinct frameworks, and `multiFrameworkLifecycle.test.js` covers a five-year Demo composite. These are useful starting implementations, not the newly required ten-year execution proof. The shared-lifecycle owner should retain its independent scheduler oracle and avoid deriving expected counts from the same implementation under test.

Candidate commands, for the coordinator's execution assignment rather than execution already performed here:

```text
Existing Python runtime: python -m pytest -c backend/pytest.ini -q -m offline backend/tests/test_guided_assessment.py backend/tests/test_soc_guided_assessment.py backend/tests/test_soc_guided_routes.py
Existing frontend runtime, from frontend: node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --testPathPattern="CisComprehensiveWorkflowCoverage|SocGuidedAssessor|socGuidedAssessment|cisRolloutContentReview"
Longitudinal work: extend the existing classified offline service harness only after shared-lifecycle/test-file ownership is assigned; never point it at protected staging clients.
```

## Initial findings and disposition

No new product defect was reproduced in this inventory-only pass. No suite was rerun, and none is claimed passing at the new acceptance revision.

- `CS-I01`, informational: raw historical `implementation_groups` metadata is `[1,2]`, while explicit availability and runtime scope correctly support `[1,2,3]`. This is not a demonstrated runtime defect or permission to change historical metadata/static copy.
- `CS-G01`, coverage gap: independently executed ten-year IG2/IG3/SOC38 acceptance is absent from the reviewed repository evidence. Required new isolated service runs are delegated to the shared-lifecycle owner; no assumed zero drift/orphans/history loss.
- `CS-G02`, coverage gap: component/evaluator tests usually perturb the first substantive SOC question per criterion. Prepare all-substantive-question transitions and rendered conditional-group coverage; do not rewrite source criteria.
- `CS-G03`, access gap: actual restricted-account/server permission and wrong-client proof remain separately pending; preserved disabled account/approved Reader windows cannot be activated by this agent. Mocked route denial is not hosted identity evidence.
- `CS-G04`, evidence boundary: current-source visual/entry/physical-pointer/logout and fault capabilities remain coordinator-dependent; source hash preservation/builds do not substitute for them.
- `CS-G05`, durability boundary: SOC lease/driver correction has bounded real-Mongo reproduction/retests; it does not prove after-last-check fencing, server-dispatched outcome certainty, cross-document transactionality, or current hosted worker disruption.

No authentication/recovery campaign, shared browser, staging fixture, account, native assessment, interview, history, application code, visual, static wording, deployment, or credential was changed. Product corrections must be assigned narrowly and independently verified before integration.

## Prepared current-source service campaign

The coordinator acknowledged the exact additional test design and new QA-only file ownership. The new test creates four scoped primary test clients (CIS IG1/IG2/IG3 and SOC Security/Availability/Confidentiality) through the existing onboarding routes and a separate all-category SOC derivative. It does not alter the five-framework ten-year campaign owned by the shared-lifecycle specialist.

The lightweight vector-generator execution passed: 428 adequate/unknown vectors over all 214 definitions. CIS inputs/expected outcomes are drawn from the independently authored approved status fixtures, including explicit cadence and valid alternative choices. SOC expectations follow the approved decision table: accepted substantive practices → `addressed`; all unknown/no basis → `not_assessed`. Actual evaluators serialize summaries and must match these expected statuses; their output is not used to choose the assertions. Optional text is omitted. The generator re-queries active questions after conditional parents before answering their children; unknown inactive children are not injected. Every accepted answer was reachable in an actual production group. This is pure-engine evidence only.

The prepared service test will read 339 cumulative CIS placements and 99 SOC placements (38 primary plus 61 derivative), execute 1,277 group-progress checkpoints, and perform 428 explicit native save/update paths. It asserts complete reviewed multiline text/result/status roundtrips, progress/native separation, explicit compare/rebase history preservation, stale/duplicate rejection, same-definition cross-client record isolation, unchanged verification/other fields, and no automatic Findings, Actions or completed Reviews. All synthetic records are in a new assigned run-owned database; modeled ASGI identities are not hosted roles. Saving all 214 definitions is not proof of every negative answer permutation, browser entry path, actual sign-in or human pointer behavior.

The coordinator supplied actual loopback Mongo 8.0.28 at port 58749 and assigned the namespace `platform_acceptance_20261011_inventory_cis_soc` or its children. This test permits only the exact literal origin `mongodb://127.0.0.1:58749` and creates a UUID child database. Alternate hosts/ports, credentials, paths and query options are rejected before constructing the real Motor client. Cleanup may drop that exact new child database only; it never controls the process or drops a shared/global database. The existing interpreter/dependencies remain unchanged. The coordinator's registry-only commit `f1e9381c6228164fed0a6fc51920fd49e41a4942` was cherry-picked as `ddcf1e0`; no classification gate is bypassed.

At this preparation checkpoint, Python AST and Node syntax checks passed and the pure generator completed normally. Independent source review found and closed one test false-pass gap: silently advanced lineage could have skipped an explicit rebase. The test now asserts stale post-save lineage, exact original/current native tokens and 214 mandatory explicit rebases preserving completed history. The reviewer independently passed all 428 pure vectors/1,277 checkpoints and found no other material defect in the bounded source. This does not establish service/persistence or hosted identity acceptance. Protected fields mostly begin at defaults; restricted identities, full conditional transitions and process-restart durability remain distinct checks.

## Executed isolated service/storage results

The coordinator released the CPU slot after the shared-lifecycle run. The focused command completed normally on the final QA source, without changing product code:

```text
PLATFORM_ACCEPTANCE_MONGO_URL=mongodb://127.0.0.1:58749
PLATFORM_ACCEPTANCE_INVENTORY_OUTPUT=<new run-owned external report path>
Existing Python3.12.14 interpreter -m pytest -c backend/pytest.ini -n0 -q -s -x backend/tests/test_platform_cis_soc_inventory.py
```

Result: **1 test and 866 subtests passed in 108.36 seconds**, four existing FastAPI `on_event` deprecation warnings. Execution source was `ddcf1e0e3f7e2494e8466ffc9486dec72fb72705` (registry-only descendant of published product `28b806716024ec149af2ec5da621a5a618c669d5`). The new test/generator were uncommitted during execution, with their exact checked-out hashes captured in the receipt. No application correction was necessary.

| Executed layer | CIS | SOC | Total |
| --- | ---: | ---: | ---: |
| Unique definitions | 153 | 61 | 214 |
| Read-only native/guide placement checks | 339 | 99 = 38 primary + 61 derivative | 438 |
| Adequate/unknown native save/update cases | 306 | 122 | 428 |
| Native outcome observations | 153 `addressed`, 153 `not_assessed` | 61 `addressed`, 61 `not_assessed` | 428 |
| Actual question-group progress writes | 975 | 302 | 1,277 |
| Explicit post-native rebases | 153 | 61 | 214 |

The storage/backend execution verified exact complete reviewed multiline text and separate status, whole result serialization, refreshed GET/resume values, explicit completed-interview history preservation, no implicit base advancement, no native mutation during progress/completion, stale duplicate native rejection, and no automatic verification, Findings, Actions or completed Reviews. Across 336 nonempty same-definition comparisons, 448 foreign records remained identical. IG3-only IDs and optional-category IDs without another configured same-ID record are not described as nonempty cross-client proof.

Final test SHA-256: `74a70f884c801c03c256b17f06fc6558d5575f6f288dc8915ddd9ff6db70e961`.
Generator SHA-256: `c1583edabf1e250d5504b5e6afcbc1ee03f32284962c0a75d77fb0da058e1d12`.
The independent child reviewed the full prepared test and corrected its lineage false-pass gap, then independently passed the pure vectors. The non-author coordinator subsequently caught and rechecked the final database-name guard at this final test hash: exact origin, UUID16/63-byte bound, never reuse an existing database, close on setup failure, bounded cleanup. This is source review plus the author's isolated service run, not an independently executed service rerun.

Original log and results remain outside the checkout:

- `C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-soc\real-mongo-20261011-230634.log`
- `C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-soc\real-mongo-20261011-230634.json`

The sanitized repository receipt is `cis-soc-service-results.json`. A subsequent independent-client PyMongo metadata read confirmed actual Mongo **8.0.28** and **zero assigned inventory-prefix databases remaining** after testcase cleanup. The root-owned Mongo process was left running and untouched. No earlier failure log was replaced; this campaign had no executed harness or product failure.

Coverage remains bounded: two source-justified outcomes per definition, protected fields mostly begin at defaults, and service/actual storage execution rather than a rendered hosted browser. All negative outcomes, native relationships with nondefault operating evidence, full conditional transitions, actual identities, logout/login, human pointer behavior, process-restart recovery and the five ten-year campaigns remain their own tracked acceptance layers. Product source, questions, static wording, styles, history/version contracts, staging and account state remain unchanged.
