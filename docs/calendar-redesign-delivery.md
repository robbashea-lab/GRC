# Approved Calendar redesign

Baseline: `0e1494247be98fe3f329f19ed03f51e1ec5c0c3b` (remote main).
Branch: `codex/approved-calendar-redesign`; isolated worktree.
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
- [ ] Independent final diff review, main reconciliation, required GitHub checks and normal merge.
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

- Frontend: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --runTestsByPath` covering Calendar, CalendarFocus, BrawndoCalendar, calendarView, reviewOccurrences, brawndoVendorCalendar and reviewHistoryIntegrity: final seven suites / 45 tests passed (7.53s).
- Backend: configured `python -m pytest` covering review_occurrences, phase6_visibility, generic_save_recovery, remediation_tickets, vendor_governance, risk_lifecycle, policy_provenance and dashboard_work_queue: final 83 passed, seven subtests (13.79s). One concurrent local attempt hit Windows resource exhaustion; stopped and reran successfully without changing configured two-worker limits.
- Full backend initial run: 635 passed, 690 subtests, one failed ten-year Calendar expectation. Independent rerun isolated three extra approved Vendor dates; no rejected requests, history mismatches or orphaned records, six tenant denials returned 403. The test now independently reconciles Vendor obligations against Vendor records and linked Reviews, while retaining original three-kind reconciliation. Final corrected configured ten-year rerun: three passed (356.14s), including the two inherited harness tests. Do not call the initial full run passing.
- Full frontend: pending. `BrawndoCisFindings.test.jsx` origin label fails identically on unchanged baseline `0e149424`, using the same freshly frozen dependency tree. No assertion weakened or unrelated component changed; integration handoff posted on PR #41.
- Builds: final normal (`craco build` with Preview false/standard sign-in true), Demo (`scripts/preview.cjs build`) and staging (`scripts/staging.cjs`) compiled successfully. Existing large-bundle warning remains; no dependency or unrelated optimization changes. A concurrent normal-build attempt was stopped to free memory, then passed on rerun. Deployment must use staging's normal-sign-in-plus-Demo artifact where required, not substitute the Demo-only artifact.
- Browser: `node frontend/scripts/qa/calendar-redesign.cjs`, fresh Edge context, new synthetic Demo client in session storage, final eight scenarios passed with zero page errors: new-client/complete/overdue visibility; view navigation; date/offset/refresh/draft/Escape/focus; exact historical Review/unified Finding ticket/three Vendor links; occurrence-only recurrence; drag/no duplicate task; light/dark at 1440/768/390 with no page overflow and all seven Month columns reachable by inner scrolling; client isolation.
- Durable backend: `python backend/scripts/verify_generic_save_restart.py --mongo-url mongodb://127.0.0.1:27092` passed using normal password login and a fresh UUID Mongo database. Synthetic audit failure, application process restart, exact-key recovery/replay, Calendar/source reconciliation, original cadence, completed history and completion replay passed. Only that allocated database was dropped in `finally`; no existing database or account changed. This is real HTTP/Mongo process-restart verification, not authenticated hosted-browser proof.
- Visual reference was rendered and compared with application screenshots; presentation only, existing operational drawers retained.
- Independent review found and resolved popup/record focus transfer and same-client actor-switch stale-response isolation. Server owns `recurrence_due_date`; callers cannot edit it. Recurring definition edits clear it, Calendar moves preserve it, completion snapshots it then clears it before advancing the original cycle.
- No lockfiles, package versions, hosting configuration, accounts, plans, access controls or environment secrets changed. Registry installed-tree audit: 1,304 public package names, 16 advisory matches (10 high / six moderate), involving existing Axios 1.18.0, braces 3.0.3 and SVGO 1.3.2. Keep as separate dependency/reachability triage; matches do not establish exploitation. Existing transitive SVGO 2.8.4 is outside reported affected ranges.

## Release gates

Latest fetch still resolves main to the baseline. PR #41 owns release CI/protection work; PRs #39/#42/#43 remain unrelated work. No bypass, protection change, unrelated merge or concurrent deployment.

GitHub Status reported Actions runner-assignment delays on 2026-10-05; required checks must actually pass regardless of that incident. Final protected merge and exact merged-SHA review remain gates.

Existing owner-private ChatGPT preview is version 111 at `https://iventure-grc-code-preview.mr-robbashea.chatgpt.site`, access revision 1. No publication under this task yet. Existing Render staging URL is `https://omnisciente-staging.onrender.com`; deployment and hosted authenticated Calendar verification pending. Preserve standard sign-in plus sales Demo and existing Free plans. Production authenticated-browser verification and dependency advisories remain distinct follow-ups.
