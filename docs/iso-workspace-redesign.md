# ISO workspace implementation checklist

Baseline: `19257461d7e308e339506248d47d7a9910e26362` (remote main, 2026-10-02).
Branch: `codex/iso-approved-workspace`. Isolated checkout; existing work preserved.
No open pull requests found during baseline inspection. Approved CIS PR #19 and SOC PR #20 are included.

- [x] Inspect current navigation, authoritative assessment/SoA and audit workpaper models.
- [x] Establish focused automated baseline: 13 suites, 186 tests passed before changes.
- [x] Overview, navigation order, introductions, quarterly check metrics.
- [x] Shared ISO desktop assessment, mandatory-clause/applicability distinction.
- [x] Versioned guide content covering 30 clauses and 93 Annex references; source review.
- [x] Audit guide and quarterly programme organization, retaining Review schedules/history.
- [x] Final browser verification, affected regression and both optimized builds.
- [ ] Complete diff review, reconcile latest main, PR/checks/merge.
- [ ] Publish existing private ChatGPT preview; confirm source commit.

## Metrics and data ownership

Applicability counts decisions (`included`/`excluded`) against all controls considered. Implementation counts `addressed` against all mandatory assessable clauses, or against Annex controls explicitly `included`. Unresolved decisions and exclusions remain visible separately and do not count as implemented. `not_assessed` is distinct from `needs_attention`.

Audit completion counts individual workpaper checks using the existing `auditItemComplete` rule, grouped by authoritative Review due year/quarter (including retained completed occurrences). No planned work means Not scheduled. Findings closure and management implementation conclusions do not affect audit progress. Current and historical instances are distinct; occurrence IDs prevent duplicate counting.

SoA and Annex A edit the same `framework_assessment_id`; no copying or migration. Existing snapshot/export/history behavior must remain intact. Reviews own recurrence; Calendar remains derived. Additional necessary controls remain supported by existing relationships under risk treatment, without creating a separate control register.

Legacy `not_applicable` implementation statuses on mandatory clauses or explicitly included controls are reported in Overview and the assessment. Their values/history are retained; no migration or silent status reinterpretation runs. Such records earn no implemented credit and should be resolved by an authorized assessment decision.

## Verification evidence and limitations

All verification uses local disposable Demo sessions or an isolated in-memory backend database, never production records.

- Final affected regression: 11 suites / 118 tests passed. Includes ISO assessments, audit workpapers, exact guide coverage and category counts, metric denominators, failed-save concurrency/draft retention, read-only presentation, framework capability/onboarding contract, and CIS/SOC guide regressions.
- Full frontend run: 190 suites passed / 1 failed; 1,161 tests passed / 1 failed; snapshot passed. `PrestigePresentation.test.jsx` expects a light-themed Reviews container that current main does not render. Reproduced the identical failure on clean detached baseline `19257461d7e308e339506248d47d7a9910e26362` (3 passed / 1 failed). No Prestige implementation or assertion was changed to hide it. The full run preceded the final client-switch regression; the complete affected suite was rerun afterward.
- Backend: `python -m pytest -c backend/pytest.ini backend/tests/test_iso_framework.py backend/tests/test_iso_audit_program.py backend/tests/test_iso_staging.py -q`: 22 passed. Covers permissions/tenant isolation, exclusion validation, mandatory-clause restrictions, replay/stale-write behavior, audit scheduling/workpapers/reporting, and closed SoA snapshots unaffected by later edits. Eight existing FastAPI lifecycle deprecation warnings. No backend implementation changes.
- Optimized preview build: `node frontend/scripts/preview.cjs build`, passed; final preview asset `main.eefb2c7e.js`.
- Normal optimized build: `REACT_APP_PREVIEW=false`, isolated `BUILD_PATH`, `node node_modules/@craco/craco/dist/bin/craco.js build`, passed. Neither build deploys the backend. CRA reports its bundle-size advisory and Node reports an existing `fs.F_OK` deprecation.
- `git diff --check`: passed. No dependency, lockfile, authentication, endpoint contract or schema changes.

Browser check: `frontend/scripts/qa/iso-workspace.cjs`, installed Playwright + headless Edge, loopback-only static build, all external requests blocked. Final complete run passed, exit 0, with no console or page errors: all 123 records / 615 answers, Dunder, a newly onboarded ISO-only client, and an initially CIS-only client subsequently enabling ISO. Covered shared saves/reloads, exclusion validation, Finding/Action origin, history, no duplicated Reviews/Findings/evidence, unchanged other-client data, audit guide/quarter links, light/dark at 1440/1280/1024/768/390 pixels, keyboard tab navigation/disclosure/focus restoration and Save & next. Representative Brawndo/CIS and Prestige/SOC assessments rendered correctly. Initial harness attempts exposed obsolete label selectors and a build-replacement race; these were corrected, not treated as application success.

Local screenshots were inspected for desktop/narrow light/dark assessment layout. Keyboard and semantic checks are scoped to changed workflows, not a whole-application WCAG conformance claim. No installed axe runner was available; no new dependency was added. Browser persistence verifies the isolated Demo adapter, not live MongoDB or real sign-in; backend behavior is separately exercised by the in-memory API tests above.

Source validation is documented in [iso-guide-content-review.md](iso-guide-content-review.md). Public ISO metadata and legitimate existing authored reference material were checked. No licensed full standard was available; independent normative completeness/certification claims are explicitly out of scope.

## Compatibility and shared-file review

The shared ISO experience is selected by `framework_key === 'iso-27001'` and existing framework configuration/capabilities, not a Dunder ID or name. Reference guidance is shared; assessment data remains client-specific. No seed data is copied to new clients. Existing URLs (`iso_view`, `assessment`, `package`, `audit_occurrence`) remain valid; `audit_year` is additive. Context/scope, management review/objectives and risks remain accessible through their authoritative modules. SoA export, approval snapshots and retained Review occurrences are unchanged.

| Shared file | Necessary change | CIS/Brawndo and SOC/Prestige impact / conflict risk |
| --- | --- | --- |
| `FrameworkWorkspace.jsx` | ISO tab order/introductions, related navigation, applicable-only implementation filters | ISO branches only; non-ISO predicates and routing unchanged. Moderate overlap risk with future shared workspace edits. |
| `FrameworkAssessmentWorkspace.jsx` | ISO ownership/guide/guidance/layout; Findings before evidence; legacy warning | Existing save/actions retained. Evidence and Finding JSX extracted to constants without changing non-ISO order/handlers. Tested CIS regressions. Moderate shared-file overlap risk. |
| `RequirementGuide.jsx` | Optional audit-specific questions | Existing questions remain the default; no CIS/SOC behavior change. Low overlap risk. |
| `FrameworkPresentation.css` | Two-column ISO cards and correct ISO selected-tab style | ISO card classes and scoped `.framework-presentation` selector only. Low overlap risk. |
| `FrameworkWorkspace.test.jsx` | ISO expected wording and accurate applicable-status filter regression | No non-ISO assertions weakened. Low overlap risk. |
| `BrawndoCisAssessment.test.jsx` | Existing ISO case now expects the ISO guide | CIS cases unchanged. Low overlap risk. |

Other new/changed components, utilities, catalog and tests are ISO-specific. Audit client changes clear stale workpaper/UI data while the next authorized programme loads; a regression verifies no write occurs. No new recurring Reviews, cadence changes, finding automation, AI service, approval restrictions or migration were introduced.

## Delivery

Pending final browser result, source reconciliation, PR/repository checks and private preview publication. Existing preview access was verified owner-only (custom access policy, revision 1); preserve it. Production backend and production data are not deployment targets.
