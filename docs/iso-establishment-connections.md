# ISO establishment connections — W1 / W2 / W3

Bounded implementation on `codex/iso-establishment-connections`, based on fetched
main `c57a57f0f5549dce7d4c9dc128387823a85af617`. No merge, Site publication,
production deployment, reseed, migration or dependency change.

## Design and authoritative records

- **W1:** One ISO-only discovery checklist in the onboarding handoff and an
  expandable ISO workspace section. Six areas link to the actual current-client
  clause assessment and existing registers. A narrative or supporting relationship
  is information recorded, not establishment confirmed or an implementation or
  effectiveness conclusion. Missing information stays visible; onboarding is not
  blocked. Business approver and platform recorder are distinguished. Controlled
  external references are accepted in existing implementation/Notes fields.
- The minimal handoff projection derives an ISO-only boolean from authoritative
  implementation, Notes and relationships. It neither stores setup status nor
  returns the underlying narratives/relationships. Other frameworks retain their
  existing projection. Owners, dates, assessment conclusions and Reviews are not
  changed by checklist rendering.
- **W2:** The existing organizational Controls component is now available in ISO
  assessments and the SoA workspace, with its existing design history, permissions,
  requirement mappings and Risk links. Necessary-control decisions belong in the
  existing design and risk-treatment basis. The built-in table and frozen snapshots
  are explicitly **Annex A only**. A controlled complete SoA/supplement, including
  necessary custom controls, remains supporting information for the existing SoA
  Review through Evidence or controlled external references. No frozen-snapshot
  schema expansion and no duplicate ISO Controls register. A link is not proof
  that a complete SoA was evaluated. Retain the version considered with its
  completed occurrence; do not infer historical design from the current Control.
- **W3:** Concise current management-review guidance beside Notes and evaluation,
  using existing reviewed, Omnisciente-authored 9.3.1–9.3.3 explanations. Existing
  fields, linked Actions and supporting records suffice. No mandatory new field,
  file, entity or frequency. Recognition uses active framework drivers or explicit
  same-client management-clause relationships, not title matching. Historical
  conclusions remain distinct from current guidance.
- Normal ISO management-review Notes were not covered by the existing pilot-only
  draft guard. This guard is extended to recognized ISO management Reviews only;
  existing non-ISO behavior is preserved. Evaluation, Notes, comments and Findings
  cannot be silently discarded when changing/closing that Review.

## Shared runtime files and parallel integration

PR #24 (`codex/cis-operational-handoff`) was inspected and left untouched. It was
open/draft, not merged, at inspection. No combined-branch verification is claimed.

| Shared file | Reason / non-ISO impact / integration risk |
| --- | --- |
| `components/OnboardingHandoff.jsx` | ISO-gated checklist; CIS/SOC output unchanged. PR24 adds adjacent CIS handoff content; retain both gates. |
| `pages/FrameworkWorkspace.jsx` | ISO-gated checklist and existing custom Controls access; no CIS/SOC rendering change. PR24 also edits this file: retain independent ISO/CIS sections and imports. |
| `components/FrameworkAssessmentWorkspace.jsx` | Removes ISO exclusion from existing Controls component. CIS/Brawndo and SOC/Prestige behavior unchanged; their tests exercised. |
| `components/ReviewDrawer.jsx` | ISO guide, Annex-only snapshot label and ISO Notes draft guard. Existing pilot guard unchanged. **PR24 edits the same dirty/leave guards**: combine its CIS guard with the ISO guard, do not choose one branch's implementation wholesale. Re-run both focused suites after authorized integration. |
| `components/IsoProgramWorkspace.jsx` | Scope labels only; non-ISO does not use this component. |
| `routes/onboarding.py` | ISO-only derived discovery boolean; authenticated tenant scope and minimal non-ISO projection preserved. PR24 does not edit this route. |
| `preview/onboardingHandoff.js` | Same derived boolean for preview parity, without stored conclusions or full narratives; non-ISO unchanged. No preview published. |
| `tests/suites.json` and existing frontend tests | Registers new regression coverage; updates obsolete ISO-exclusion expectations without weakening failure assertions. PR24 also changes the manifest and CIS tests; retain both sets. |

New checklist and guide components are ISO-gated. No catalog, schema, Risk,
organizational Controls backend, recurrence engine or authorization code changed.

## Verification commands

Run from `frontend` with `CI=true`:

```text
node node_modules/@craco/craco/dist/scripts/test.js --watchAll=false --runInBand --runTestsByPath src/components/IsoEstablishmentChecklist.test.jsx src/components/IsoManagementReviewGuide.test.jsx src/components/IsoAssessment.test.jsx src/components/OrganizationalControls.test.jsx src/pages/FrameworkWorkspace.test.jsx src/pages/BrawndoReviews.test.jsx src/pages/Onboarding.test.jsx src/lib/onboardingHandoff.test.js src/preview/onboardingHandoff.test.js src/preview/isoFramework.test.js src/components/PrestigeSocAssessment.test.jsx src/components/BrawndoCisAssessment.test.jsx
```

Fresh result: **12 suites / 190 tests passed**. New discovery-projection tests
verify that information does not become an assessment conclusion and clearing
the narrative removes the derived flag. Existing CIS and SOC tests were run,
not merely reused from the assessment.

Run from `backend`, using the existing test Python environment:

```text
python -m pytest -c pytest.ini tests/test_iso_work_packages.py tests/test_iso_framework.py tests/test_organizational_controls.py tests/test_iso_audit_program.py tests/test_onboarding_handoff.py tests/test_onboarding_recovery.py tests/test_soc_framework.py -q -o addopts=''
```

Fresh result: **68 tests and 12 subtests passed**; four existing FastAPI
`on_event` deprecation warnings. These use `mongomock_motor`, not real MongoDB.

Normal-auth production build:

```text
REACT_APP_PREVIEW=false
REACT_APP_STANDARD_SIGN_IN=true
REACT_APP_BACKEND_URL=
BUILD_PATH=<owned temporary output>/build
node node_modules/@craco/craco/dist/bin/craco.js build
```

Build passed, with the existing large-bundle advisory and Node `fs.F_OK`
deprecation warning. The full frontend/backend suites were not run; targeted
results are not a whole-application assurance claim.

Browser reproduction from the repository root:

```text
ISO_QA_PYTHON=<existing test Python executable>
ISO_QA_BUILD=<absolute normal-auth build directory>
ISO_QA_OUTPUT=<existing owned output directory>
NODE_PATH=<existing Playwright dependency directory>
node frontend/scripts/qa/iso-establishment.cjs
```

The harness uses Edge, a disposable loopback server on 4197, real application
password/cookie authentication and ephemeral synthetic users/clients. Mongo is
mocked; external browser requests are blocked. It never imports a production
`.env`, provisions a service or seeds completed occurrences. Evidence is created
and downloaded through the application and management Reviews are completed
through their actual execution fields. Output records the tested Git commit.

Fresh browser walkthrough passed onboarding saved-answer reload, exact clause
navigation, later ISO enablement preserving CIS assessments and unique Review
IDs, custom-Control create/save/reopen and Risk links, immutable historical
Annex-only snapshot plus downloaded supplemental Evidence hash, substantive
management-review execution with Notes draft protection, linked Action and one
annual recurrence, and historical read-only results after later edits. Both
read-only and unassigned-contributor writes and foreign-tenant access returned
403; no role permissions were widened. No browser page errors were recorded.
Screenshots were inspected for the existing wide layout. This is a targeted
workflow walkthrough, not a WCAG audit or real persistence/restart test.

## Limits and decisions

No authorized full ISO/IEC 27001:2022 / Amd 1:2024 text was available. Existing
original explanations are reused and marked non-official; no exhaustive catalog
or normative-wording validation is claimed. Guidance wording needing normative
confirmation still requires authorized source comparison.

No approved isolated real MongoDB/storage target was supplied, and no local
MongoDB service/tool was available. Real database indexing, concurrency,
transactions, process-restart durability and external/object-storage behavior
were not executed. Minimum additional setup: an approved disposable MongoDB
target and isolated Evidence storage, test-only credentials and explicit
permission to create/delete synthetic fixtures and restart the test service.

No broad multi-year simulation or withdrawn F07 implementation. Any automatic
inclusion of custom controls in frozen SoA snapshots is a separate schema decision,
not part of this change. No certification or organizational conformity claim.
