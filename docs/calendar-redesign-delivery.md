# Approved Calendar redesign

Baseline: `0e1494247be98fe3f329f19ed03f51e1ec5c0c3b` (remote main).
Branch: `codex/approved-calendar-redesign`; isolated worktree.
PR: [#44](https://github.com/robbashea-lab/GRC/pull/44), draft while final regressions and protected release gates remain unresolved.
Reference: owner-provided `approved-calendar-mockup.html`; presentation only.

## Checklist

- [x] Inspect current Calendar, authoritative save paths, recurrence and unified ticket opening.
- [x] Inspect open PRs #39, #41, #42, #43; preserve their dashboard, assessment and release work.
- [x] Fresh frozen frontend dependency install.
- [x] Direct backend baseline: 49 tests passed across phase6 visibility, Review occurrences, generic save recovery and remediation tickets.
- [x] Frontend baseline: five suites / 18 tests. Focused implementation regressions: seven suites / 44 tests, plus Cancel regression (nine Calendar tests).
- [x] Day/week/month and Scheduled items; completed visibility and overdue labels.
- [x] Scheduling popup, exact operational opening, occurrence-only recoverable moves.
- [x] Normal/Demo/staging builds and isolated browser verification.
- [x] Independent review of reconciled application head `c88e36dcfde071256fdbf20dd208fca10c8839ae`; accepted main `2d13a3e6286e457fed70bd14ba1825fc18e4b8b9` merged without conflicts, preserving CI and staging configuration exactly.
- [ ] Required final-head GitHub checks and normal protected merge.
- [ ] Existing private preview and Render Free staging publication of the merged revision.
- [ ] Released Demo and authenticated staging verification where access permits.

## Baseline gate and coordination

Configured pytest initially failed before collection: `test_dashboard_work_queue.py` was unclassified in `backend/tests/suites.json`. Independent review confirmed its isolated Mongo mock/ASGI harness has no external effects; its four tests passed. Classify it offline without weakening the fail-closed registry.

Potential overlap: shared review scheduling/save paths and suite registry. Reconcile current main before delivery; do not merge unrelated PRs or replace their configuration.

## Design constraints and evidence

Calendar remains a projection, not a separate record store. Use existing API authorization, optimistic versions, command recovery and RecordDrawer (including unified remediation tickets). A Calendar move changes one occurrence, not the recurring definition; completion preserves its immutable execution history.

The popup reuses the installed Radix Dialog and native date input. Keyboard/focus acceptance follows [WAI-ARIA APG modal dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) (focus containment, Escape and return focus); this is selected workflow verification, not whole-application conformance.

Publication and authenticated verification remain pending. Do not claim local mocks or Demo prove hosted persistence/authentication. Preserve private access, existing data, sales Demo, URLs and Free plans.

## Verification evidence (2026-10-05)

- Frontend: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --runTestsByPath` covering baseline, Calendar, CalendarFocus, BrawndoCalendar, calendarView, reviewOccurrences, brawndoVendorCalendar and reviewHistoryIntegrity: eight suites / 50 tests passed (30.76s). Empty Calendar expectation includes the empty Vendor bucket, retaining strict emptiness and isolation assertions; independently reviewed.
- Backend: configured `python -m pytest` covering review_occurrences, phase6_visibility, generic_save_recovery, remediation_tickets, vendor_governance, risk_lifecycle, policy_provenance and dashboard_work_queue: final 83 passed, seven subtests (13.79s). One concurrent local attempt hit Windows resource exhaustion; stopped and reran successfully without changing configured two-worker limits.
- Full backend initial run: 635 passed, 690 subtests, one failed ten-year Calendar expectation. Independent rerun isolated three extra approved Vendor dates; no rejected requests, history mismatches or orphaned records, six tenant denials returned 403. The test now independently reconciles Vendor obligations against Vendor records and linked Reviews, while retaining original three-kind reconciliation. Final corrected configured ten-year rerun: three passed (356.14s), including the two inherited harness tests. Do not call the initial full run passing.
- Full backend final configured `python -m pytest -q`: **636 tests + 690 subtests passed**, eight existing deprecation warnings, 440.71s. Offline registry/environment protections and configured two-worker execution unchanged.
- Full frontend initial run remains non-green. The origin-label assertion and four RegisterDrawers save-contract assertions failed identically on untouched baseline with identical dependencies; accepted PR #41 fixture corrections are now reconciled. The new empty Calendar shape mismatch was corrected and its focused suite passed. CIS IG1 and ISO five-year cases exceeded existing 180,000ms budgets; both reproduced on untouched baseline (two failed, one skipped, 377.30s). Combined multi-framework also exceeded its existing 240,000ms budget and remains unresolved. Independent inspection found no Calendar-induced scheduling loop; this is not a passing test result. No timeout increased or timeline shortened. Reconciled-head rerun and required full CI are pending.
- Builds: final normal (`craco build` with Preview false/standard sign-in true), Demo (`scripts/preview.cjs build`) and staging (`scripts/staging.cjs`) compiled successfully. Existing large-bundle warning remains; no dependency or unrelated optimization changes. A concurrent normal-build attempt was stopped to free memory, then passed on rerun. Deployment must use staging's normal-sign-in-plus-Demo artifact where required, not substitute the Demo-only artifact.
- Browser: `node frontend/scripts/qa/calendar-redesign.cjs`, fresh Edge context, new synthetic Demo client in session storage, final eight scenarios passed with zero page errors: new-client/complete/overdue visibility; view navigation; date/offset/refresh/draft/Escape/focus; exact historical Review/unified Finding ticket/three Vendor links; occurrence-only recurrence; drag/no duplicate task; light/dark at 1440/768/390 with no page overflow and all seven Month columns reachable by inner scrolling; client isolation.
- Durable backend: `python backend/scripts/verify_generic_save_restart.py --mongo-url mongodb://127.0.0.1:27092` passed using normal password login and a fresh UUID Mongo database. Synthetic audit failure, application process restart, exact-key recovery/replay, Calendar/source reconciliation, original cadence, completed history and completion replay passed. Only that allocated database was dropped in `finally`; no existing database or account changed. This is real HTTP/Mongo process-restart verification, not authenticated hosted-browser proof.
- Authenticated local browser: normal build, fresh Edge contexts, same-origin loopback proxy to the actual FastAPI process, new synthetic password-authenticated administrator and UUID Mongo database. Task and recurring Review dates saved through UI; Calendar reload, exact source drawer and dashboard work-queue dates matched. After stopping/restarting the API, a fresh browser signed in normally and verified those persisted dates and sources again. Original monthly basis/next cadence also verified directly in the allocated Mongo database. Both browser passes had zero page errors; allocated database dropped in `finally`. This closes the local browser/persistence check only, not hosted staging or production verification.
- Authenticated browser testing demonstrated a loading-state race: a still-mounted entry appeared actionable while its click was intentionally guarded during refresh. Grid and list now expose `aria-disabled` and unavailable styling during loading/saving/error, keeping the existing focus target mounted. Held-refresh regression verifies no source request and re-enablement afterward; independent reviewer reran three relevant suites / 12 tests successfully.
- Visual reference was rendered and compared with application screenshots; presentation only, existing operational drawers retained.
- Independent review of reconciled head `c88e36dcfde071256fdbf20dd208fca10c8839ae` against main `2d13a3e6286e457fed70bd14ba1825fc18e4b8b9` found no demonstrated code blockers. Full diff and tests reviewed; CI/staging changes preserved exactly. Earlier review resolved popup/record focus transfer and same-client actor-switch stale-response isolation. Server owns `recurrence_due_date`; callers cannot edit it. Definition edits clear it, Calendar moves preserve it, completion snapshots it then clears it before advancing the original cycle. Passing required checks remain a separate release gate.
- No lockfiles, package versions, hosting configuration, accounts, plans, access controls or environment secrets changed. Registry installed-tree audit: 1,304 public package names, 16 advisory matches (10 high / six moderate), involving existing Axios 1.18.0, braces 3.0.3 and SVGO 1.3.2. Keep as separate dependency/reachability triage; matches do not establish exploitation. Existing transitive SVGO 2.8.4 is outside reported affected ranges.

## Release gates

Accepted PR #41 is now main `2d13a3e6286e457fed70bd14ba1825fc18e4b8b9`, reconciled into reviewed application head `c88e36dcfde071256fdbf20dd208fca10c8839ae`. Its workflow, test setup, fixture corrections and staging configuration are preserved exactly. PRs #39/#42/#43 remain unrelated work. No bypass, protection change, unrelated merge or concurrent deployment.

Main is protected, requiring **Release gate** from GitHub Actions for everyone. Required verification for reconciled head is running; success is not assumed. Earlier runner-assignment delays and prerequisite workflow absence did not authorize a bypass. Final-head checks, normal protected merge and exact merged-SHA verification remain gates.

### Reconciliation checks

- Reconciled application head: ten frontend suites / 56 tests passed (134.63s), including Calendar regressions, empty projection, origin label and RegisterDrawers. Existing fixture DialogTitle warning remains. Three additional main-changed fixture suites are rerunning.
- Reconciled backend: configured Review occurrences, dashboard queue, generic save recovery and phase6 visibility suites: 42 passed (17.18s), eight existing deprecation warnings.
- Initial pre-reconciliation full frontend completed: 208 suites passed / seven failed; 1,544 tests passed / 11 failed; one snapshot passed, 3,912.54s. Failures comprised accepted-main fixture corrections, the corrected empty projection assertion, and three long-run timeouts. This run was not green; do not substitute focused passing results for final required full CI.
- Staging artifact was additionally exercised locally with both normal password sign-in and sales Demo, in isolated fresh browser storage. Normal authenticated Task/Review save, source/dashboard reconciliation and real Mongo persistence survived API restart; separate Demo showed Calendar without leaking the synthetic normal client's task. Zero page errors; only allocated UUID database removed. This remains local evidence, not hosted staging or production acceptance.

Existing owner-private ChatGPT preview is version 111 at `https://iventure-grc-code-preview.mr-robbashea.chatgpt.site`, access revision 1. No publication under this task yet. Existing Render staging URL is `https://omnisciente-staging.onrender.com`; deployment and hosted authenticated Calendar verification pending. Preserve standard sign-in plus sales Demo and existing Free plans. Production authenticated-browser verification and dependency advisories remain distinct follow-ups.
