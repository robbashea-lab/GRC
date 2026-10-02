# Frontend structure and test execution boundaries

Baseline: remote main `6cc52ad4794fa1846923647dc42471c2c6a138b1`.

## Revalidation and implementation

- `RecordDrawer` still mixed Risk panels, Policy approval presentation, and shared drawer orchestration. Risk assessment, treatment, and completed-history panels now live in `RiskRecordPanels.jsx`; Policy approval status and verification entry live in `PolicyWorkflowPanel.jsx`. The drawer retains the single draft, save/optimistic-concurrency handling, focus return, related records, and discard protection. Existing Vendor and Action Item panels were already separate and remain in use.
- The exported `RecordDrawer` always routes Reviews to `ReviewDrawer`. The old Review forms, quick-create command, and completion handlers inside its private `EntityDrawer` were unreachable and have been deleted. The active Review implementation is unchanged by that deletion.
- `ActionItems` and `BrawndoActionItems` duplicated the same record/member fetch orchestration. Both now use `useActionRegisterData`. The controller filters every source by selected client, hides previous-client state before effects run, ignores obsolete requests, and exposes load/retry failures. Missing or inaccessible historical assessments remain unavailable links; a server failure is reported instead of silently treated as deleted history.
- Risk and Vendor registers already share one controller across their alternate presentations; they did not need another abstraction.
- The pending `claude/cross-client-visual-consistency` changes to show the reference Action Items and Risk registers for every Demo client were preserved through targeted changes to `isReferenceRegister` and the two callers. No unrelated branch was merged. Other unmerged dashboard/framework changes are tracked by the integration owner.
- Risk history navigation now checks the selected tenant and request generation before opening the original Review occurrence, and reports a failed/missing historical read. Linking an existing Action similarly excludes foreign-client records.

## Verification

Before changes: the four Brawndo Action Items, Risk, Policy, and Vendor page suites passed (23 tests).

After changes: those suites plus `RiskRecordPanels.test.jsx` and `useActionRegisterData.test.jsx` passed (6 suites, 32 tests). Coverage includes one draft across tabs, failed save/retry retaining `expected_updated_at`, completed occurrence navigation, denied cross-client history, read-only assessment, delayed old-client requests, source filtering, dependency failure/retry, and missing/inaccessible historical origins.

Follow-up checks passed: Remediation UX, register cells, Finding remediation drawer and Findings register (4 suites, 21 tests). Two additional Action Items deep-link regressions verify retry after a failed dependency or unavailable Finding; Action Items plus PlatformAdmin passed 13 tests. The PlatformAdmin load effect now uses a scope-bound callback and request generation guard rather than suppressing a missing dependency warning. Its test switches tenants before the first request resolves and verifies the old response cannot replace current members.

Command, from `frontend`:

```powershell
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --runTestsByPath src/components/RiskRecordPanels.test.jsx src/lib/useActionRegisterData.test.jsx src/pages/BrawndoActionItems.test.jsx src/pages/BrawndoRisks.test.jsx src/pages/BrawndoPolicies.test.jsx src/pages/BrawndoVendors.test.jsx
```

These are component/API-mock checks, not browser or persistent-backend verification. Coordinated full regression, build, and browser results belong in the main implementation/release log.

## Backend test classification

`backend/tests/suites.json` explicitly classifies every test module as `offline` or `environment`. The registry validates the complete discovered set before import: a new unclassified file, duplicate classification, or stale entry fails the run. Tests outside `backend/tests` also fail with a placement error. The previously omitted offline ISO staging suite is included.

`backend/conftest.py` applies the boundary to both the convenience runner and ordinary pytest. Default discovery ignores environment modules before import. Explicitly selecting an environment module without both opt-in and target fails before import. `pytest.ini` addopts remain exactly `-n 2 --dist loadscope`.

Safe offline command:

```powershell
python backend/tests/run_isolated.py
```

Environment suites contain legacy assumptions and mutating HTTP operations. Run only against a disposable, explicitly selected test service whose accounts/data are suitable for those suites:

```powershell
python -m pytest -c backend/pytest.ini backend/tests --run-environment-tests --environment-url http://127.0.0.1:4180 -m environment
```

The command-line target overrides any ambient `REACT_APP_BACKEND_URL` for that run and is restored afterward. Target URLs cannot contain credentials, paths, query strings, or fragments. No environment tests were executed for this classification change.

Registry tests: 4 passed, 8 subtests. Explicit selection of `test_iteration2.py --collect-only` without opt-in was rejected before test import. Add new suites to the appropriate registry category only after reviewing their effects; they cannot silently disappear from the offline runner.

## Shared backend / Demo contract matrix

`shared/contracts/governance-lifecycle.json` supplies the same expected examples to `backend/tests/test_governance_lifecycle_contract.py` and `frontend/src/preview/governanceLifecycleContract.test.js`.

| Boundary | Observable checks |
| --- | --- |
| Recurrence | Month-end and fixed-day anchors, leap-year annual cadence, year-crossing quarter, custom intervals, invalid dates and date overflow |
| Review history | Late completion advances one original period; retry adds no duplicate occurrence; later owner/title/due/cadence changes leave the completed snapshot intact |
| Schedule projections | Policy, Risk and Vendor last/next Review dates follow the linked Review; Policy lifecycle and Risk assessment remain independent |
| Primary persistence failure | Failed storage returns an error with no primary record; same-intent retry and replay result in exactly one record |
| Concurrency and isolation | Stale edits return 409 without overwriting later work; a foreign-client record read returns 403 |

Backend: 5 tests with 18 subtests passed using real routes and isolated Mongo mocks. Demo: 5 tests passed using the adapter and Web Storage. The comparison exposed a real Demo error-status drift: generic stale writes returned 400; the store now marks them 409, matching the backend. These tests do not establish persistent Mongo recovery or browser-storage capacity. Framework capability and command-replay contract fixtures have their own tests and are covered in the integrated release log.

Independent frontend cross-review also identified an onboarding retry trap: a failed draft save was being labeled as uncertain completion before a completion request existed. The corrected flow retries the draft with the existing concurrency token, allows editing if that still fails, and only locks the payload once the final command has actually started. Onboarding and PlatformAdmin component suites passed together (6 tests).

## Expanded regression findings

The first current full ordinary run (excluding the separately run five- and ten-year scenarios) finished with 168 passing suites and three failing suites, 950 passing tests and three failing tests. Every failure was investigated rather than treated as a generic baseline problem:

- The seeded Brawndo schedule assertion failed identically on pristine main. `demoHistory` reset each historical snapshot's anchor, so a fixed-day-28 Review's February snapshot incorrectly projected to May 31. New seed generation now retains one canonical anchor and steps backward from it. Existing stored occurrences are not migrated or rewritten. The original assertion remains, with four controlled-clock regressions added for month-end and clipped-month seeds. Seed/program/adapter checks passed together (5 suites, 34 tests).
- The portfolio test also failed on pristine main because it still expected two sample clients. It now verifies the exact three client IDs and the exact two remaining after Brawndo is archived; its no-assignment isolation assertion remains.
- The generic Vendor drawer test passed on pristine main but its fixture was incomplete under the corrected canonical `service` contract. The fixture now supplies a real service value; required-field validation remains. Portfolio and register drawer tests passed together (2 suites, 9 tests).

The register drawer suite emits a Radix missing-title warning with its mocked Sheet implementation on both pristine and current code. That warning is distinct from the corrected Vendor assertion. Full rerun results are recorded by the integration owner, not inferred from these focused passes.

The current ordinary rerun completed with 171 passing suites and 958 passing tests in 387.245 seconds, excluding only the separately executed five- and ten-year scenarios. The pristine full baseline completed with 161 passing and four failing suites, 917 passing and seven failing tests in 1,778.04 seconds. Its failures were three stale adapter assertions, one seeded-schedule assertion, one stale portfolio population assertion, and two ten-year history assertions comparing compressed at-rest records with expanded application records.

Claude follow-up commits `9ce8fe0` and `d54195b` were inspected and their narrow history/storage corrections retained: the ten-year history capture and comparisons restore persisted snapshots before comparison, and the Dunder upgrade only modifies Demo-seeded stores. This restores the full original imported-backend portfolio assertion rather than filtering unexpected clients out. All immutability assertions remain. The added three-client history regression changes owner/title and repeatedly persists records, then requires exact equality with the completed snapshot and an unchanged recurrence anchor. History, storage, and adapter checks passed together (3 suites, 26 tests).

Expanded backend lifecycle checks exposed two fixture issues: the three-year scenario left a shared clock at 2029 before the ten-year scenario seeded its starting obligations, and catch-up executions reused a same-day quick-Finding request ID across different occurrences. Both scenarios now scope and restore the clock, and ten-year request identity includes its originating occurrence. No completion thresholds, history assertions, or product behavior were relaxed. The sequential single-worker run passed four tests and three subtests in 144.37 seconds. The ten-year report reached 2036-09-29 from 2026-09-28 with 510 completions, 115 late completions, no unexpected rejections, no reconciliation discrepancies, no history mismatches, no orphans, and all six cross-client reads denied with 403. This remains isolated Mongo-mock lifecycle evidence, not persistent-database capacity evidence.

The final Demo ten-year run passed all seven tests in 1,034.788 seconds. It completed 1,405 Reviews (298 late), recorded 210 Finding validations and 214 completed Actions, and uploaded 1,168 evidence files. All 1,405 completed occurrences and 317 assessment snapshots matched their captured history, with no unexpected request rejection, count discrepancy, broken reference or cross-client metadata change. The reopened Finding retained both validations. The same per-occurrence request-identity correction was applied to the Demo simulation caller; assertions were not relaxed.

This simulation uses unlimited test storage after recording capacity diagnostics. It crossed its diagnostic 5,242,880-character budget on simulated 2030-09-23 and ended at 10,978,246 characters. Existing storage compaction also evicted 69 bytes of other-client file content while retaining metadata. These results prove the tested lifecycle invariants, not ten-year browser-storage capacity or permanent file-byte retention.

`frontend/scripts/qa/published-findings-ai.cjs` adds UI-only E05/E13 release journeys with read-only storage assertions and explicit unsupported-persona/action boundaries. Syntax and two pre-UI safety guards passed. Browser outcomes must come from the coordinated published release run; creating the helper does not establish those outcomes.

After the coordinated dashboard/workspace port, the final ordinary frontend run passed 176 suites, 984 tests and one unchanged approved snapshot in 271.835 seconds. Command: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --no-cache --testPathIgnorePatterns='frameworkFiveYear|brawndoTenYear'`. Those two long scenarios were verified separately. The preceding run exposed two router-stub import failures in DashboardPrograms/DashboardAttention; aligning their existing stubs with the shared callers' `virtual: true` convention fixed the linked-runtime Jest resolution issue without changing application code, dependencies, assertions or production configuration.
