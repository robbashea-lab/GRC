# Bounded ISO PR25 / CIS PR24 integration

## Authorized Demo finalization follow-up — 2026-10-03

The sections below retain the earlier bounded-integration evidence and its then-current
release boundary. The user subsequently authorized one combined PR/main merge and
publication to the existing private Demo, not a production backend release.

Refetched main `c57a57f0f5549dce7d4c9dc128387823a85af617`, ISO
`bc96e58e58bd4c9ae8b1d6f130634012d1152ec1` and CIS
`980441ed9280b57819385aa1cdce0019ac997a9e`. Merged the newer CIS persistent
verification script and results documentation without altering its source branch.
CIS agent agreed this integration checkout owns merge/publication; no concurrent release.

The specifically authorized CIS handoff defect is corrected: backend and Demo return
three derived `cis_setup` facts (accountable person recorded, operating method recorded,
arrangement confirmed). `operationGaps` uses those for projected rows and the existing
full-record rules elsewhere. No new stored state, narratives, provider details or owner
identifiers are exposed. Saved confirmation survives reload; editing a method retains
the existing confirmation-reset rule. Conclusions, permissions and ISO discovery facts
are unchanged. The earlier "separate direction required" limitation is superseded.

Fresh deduplicated validation: 21 frontend suites / **272 tests**; backend **121 tests
plus 48 subtests**. Normal and Demo optimized builds passed. Normal authenticated
browser QA uses disposable mocked Mongo, not a real persistent environment, and now
asserts saved CIS projection facts. Existing bundle/deprecation advisories remain.

Read-only production safety inspection: Railway `serviceAutoDeployTool` reported
`enabled=false`, `canEnable=false`, `NO_INSTALLATION`; main pushes cannot currently
trigger its backend deployment. The old source link remains; it was not removed or
changed. Latest deployment remains the 2026-09-23 failed deployment. No infrastructure,
certificate, machine trust or production data was changed.

Preserve the CIS source's 15 real-backend acceptance cases at `d17e713` as source-only
evidence, not combined-branch browser/restart proof. Combined real-database browser,
restart/index/transaction/concurrency acceptance is still deferred and is a production
release limitation. The ISO 27001:2022 / Amd 1:2024 normative comparison is outstanding.
Mock/Demo tests do not prove conformity, normative completeness or production readiness.

Final merged SHA, replacement PR, saved preview version and deployment status must be
reported from actual GitHub/Sites results, not inferred from these local tests.

PR26's automated review found two further bounded defects, corrected before merge:
explicit partial CIS arrangement objects now serialize their complete validated defaults,
matching Demo behavior; generated ISO Review relationships no longer count as recorded
setup support. Review links alone require their substantive basis in Notes/implementation;
other supporting relationships remain usable. Full-workspace and Demo share the same
ISO predicate. Regression tests cover untouched ISO setup and empty/provider-only/
confirmation-only CIS payloads. No permissions, cadence, history or schema changes.

One repeated mocked-auth browser run timed out finding parent CIS Next after a nested
Review closed; a subsequent complete run passed unchanged. This intermittent browser/
harness observation is retained, not represented as a flawless browser run.

## Exact sources and boundary

- Branch: `codex/iso-cis-bounded-integration` in its own worktree.
- Main: `c57a57f0f5549dce7d4c9dc128387823a85af617`.
- CIS PR24: `b8b0a59fa2c1079dfbfddb2a9b6afc4457b2e6b9` (includes latest infrastructure handoff).
- ISO PR25: `bc96e58e58bd4c9ae8b1d6f130634012d1152ec1`.
- Combined application merge: `f02a53c9bb2bbd2abbf34c0ebf59da383750e98c`.
- Final tested integration commit: record `git rev-parse HEAD` in the run manifests
  and PR25 handoff. Later commits add tests/scripts/docs only; application code is
  unchanged from the combined merge.

Both sources were merged only into this isolated branch with source ancestry
preserved. No source-branch edits, force push, main merge, PR retarget/close,
hosted preview publication, deployment, environment installation or certificate
creation. Source refs must be refetched before delivery; disclose newer heads.

## Reconciliation

Five overlapping files: `backend/tests/suites.json`,
`frontend/src/components/BrawndoCisAssessment.test.jsx`, `OnboardingHandoff.jsx`,
`ReviewDrawer.jsx`, and `frontend/src/pages/FrameworkWorkspace.jsx`.

- Handoff import/render conflicts retain both independently framework-gated
  components; mixed clients show both. Workspace imports/sections auto-merged and
  were reviewed. Both test registrations and changed ISO/CIS assertions remain.
- ReviewDrawer conflict is resolved with one union predicate: existing pilot,
  recognized CIS Review, or recognized ISO management Review. Notes/configuration,
  comments/Findings, busy-close and historical discard protection use that guard.
  CIS nested-safeguard focus return remains intact. No whole-file selection or
  loosened guard. Ordinary non-CIS/non-ISO Review behavior is unchanged.
- Three new non-pilot regressions cover CIS, ISO and dual-driver Notes cancel,
  successful save, historical navigation/discard, read-only history and return to
  the saved current record. Existing setup/assessment Save & next, failed-save and
  ordinary/SOC tests remain exercised.
- No attributable application defect beyond the explicit merge conflicts was
  demonstrated. Browser harness selectors were made specific to the execution
  brief and verification assertions compare the existing effective default
  `not_verified`, not an absent legacy field.

## Newly executed, deduplicated verification

Frontend: **21 distinct suites / 271 tests passed**. Backend: **120 tests plus
48 subtests passed**. These are actual combined runs, not sums of source reports.
Normal-auth and Demo optimized builds passed. Existing large-bundle, Node
`fs.F_OK` and FastAPI `on_event` advisories remain. Full suites and a whole-app
accessibility audit were not executed.

Frontend command, from `frontend`, `CI=true`:

```text
node node_modules/@craco/craco/dist/scripts/test.js --watchAll=false --runInBand --runTestsByPath src/components/IsoEstablishmentChecklist.test.jsx src/components/IsoManagementReviewGuide.test.jsx src/components/IsoAssessment.test.jsx src/components/OrganizationalControls.test.jsx src/components/CisReviewBrief.test.jsx src/components/AssessmentShell.test.jsx src/components/BrawndoCisAssessment.test.jsx src/components/PrestigeSocAssessment.test.jsx src/pages/FrameworkWorkspace.test.jsx src/pages/BrawndoReviews.test.jsx src/pages/Onboarding.test.jsx src/lib/onboardingHandoff.test.js src/lib/cisOperations.test.js src/lib/cisVerification.test.js src/lib/sharedReviewPlans.test.js src/lib/frameworkOperator.test.js src/preview/onboardingHandoff.test.js src/preview/cisOperations.test.js src/preview/assessmentVerification.test.js src/preview/isoFramework.test.js src/preview/frameworks.test.js
```

Backend command, from `backend`, using the existing test Python:

```text
python -m pytest -c pytest.ini tests/test_cis_operational_handoff.py tests/test_framework_governance.py tests/test_assessment_verification.py tests/test_iso_work_packages.py tests/test_iso_framework.py tests/test_organizational_controls.py tests/test_iso_audit_program.py tests/test_onboarding_handoff.py tests/test_onboarding_recovery.py tests/test_soc_framework.py -q -o addopts=''
```

Builds from `frontend`: normal `node node_modules/@craco/craco/dist/bin/craco.js build`
with `REACT_APP_PREVIEW=false`, `REACT_APP_STANDARD_SIGN_IN=true`, empty
`REACT_APP_BACKEND_URL` and owned `BUILD_PATH`; Demo `node scripts/preview.cjs build`
in this isolated worktree. No hosting step.

## Browser evidence and remaining cases

`frontend/scripts/qa/iso-establishment.cjs` reuses the approved disposable
loopback/password-cookie/mongomock harness. Set its existing `ISO_QA_PYTHON`,
`ISO_QA_BUILD`, `ISO_QA_OUTPUT` and installed Playwright `NODE_PATH`, then run
`node frontend/scripts/qa/iso-establishment.cjs` from the repository root.
For Demo, use this checkout's Demo build with `ISO_QA_DEMO=true`; it runs the
existing `cis-criteria.cjs` bounded `QA_LAYOUT_ONLY` cycle. The wrapper owns and
stops its loopback server; external browser traffic is blocked. No production
environment or persistent target is used.

- Normal auth: ISO-only onboarding/resume/reload; CIS-only then dual-framework
  handoff/later enablement preserving exact CIS assessments and unique Reviews;
  keyboard clause navigation and Control focus; custom Control/Risk save/reopen;
  old Annex-only snapshot and supplemental Evidence download/hash after changes;
  management Review Notes cancel/discard/completion, linked Action, recurrence and
  historical results; CIS confirmation independent of conclusions, parent
  cancel/discard/save-next and setup guard; nested Review/safeguard focus return;
  CIS Notes cancel/save and preserved parent draft; reader/contributor and tenant
  denials. No captured page errors.
- Demo: one representative safeguard save/reload and five guide answers, Finding
  and one Action, Evidence upload/download/reload, keyboard, draft cancel,
  Save & next/Previous, Escape/focus trapping/return, breadcrumbs, light/dark at
  1440/1280/1024/768 widths and ISO/SOC panel-isolation checks. Session storage is
  not durable persistence; no all-56 browser cycle is claimed.
- Manifests: `combined-workflows-browser.json` and `combined-demo-browser.json`
  in the owned output directory; each records the tested commit. Screenshots are
  local test artifacts, not committed customer data.
- Real HTTPS/Mongo application acceptance and restart/index/transaction/concurrency
  durability remain **NOT EXECUTED**. Reuse CIS's target effort: Mongo preflight
  passed, but Windows user certificate trust/private HTTPS remains unresolved.
  No second database/certificate/environment is being prepared.

## Inherited issue, storage correction and gates

An inherited PR24 limitation is confirmed from source and a normal-auth handoff
response: `onboardingHandoffFields.json` omits CIS owner/process-owner,
implementation and `cis_operation`; `CisSetupHandoff` applies full-record gap
logic to those projected rows. A saved confirmed arrangement can therefore remain
"unconfirmed" in the onboarding summary. The full workspace retains the actual
arrangement. This existed at the source head; it is not a merge-induced defect.
No new feature/projection fix was added here. A narrowly scoped CIS handoff
projection correction requires separate direction; do not present summary counts
as verified arrangement status until corrected.

Actual Evidence content storage is MongoDB's normalized `evidence.content_base64`
with size and SHA-256; authenticated download reads the same record. No separate
object-store requirement. ISO handoff wording is clarified accordingly, without
rewriting the historical mock-test result. The existing
[persistent plan](cis-pr24-integration-handoff.md) now requires the exact combined
build and ISO discovery/custom SoA/management plus mixed-framework acceptance,
including actual file-byte checks after API and Mongo restarts.

Authorized full ISO 27001:2022 / Amd 1:2024 comparison remains outstanding.
Software tests do not validate normative wording or organizational conformity.
Annex-only snapshot schema, supplemental SoA support, discovery/conclusion
separation, historical results, schedules, permissions and shared authoritative
records are preserved. Both original PRs remain draft/unmerged; no release gate
is closed by mock/Demo evidence.
