# Brawndo CIS IG1 criteria refinement

Validated 2026-09-30. Scope: the existing Brawndo Demo CIS prototype only.

## Behavior and data

The safeguard now follows four sections: What CIS Requires, CIS IG1 Assessment
Criteria, Implementation Status, and Current Implementation. Owner, editable
verification and last-assessed information remain compact near the top.
The Program configuration shortcut, owner helper/Manage People link, maturity
tiers, stronger-practice prompts, checklist progress, Previously Recorded panel
and repeated bottom Verification section are removed from this prototype only.

The new optional `cis_assessment_criteria` array stores stable criterion IDs.
Both Demo and backend validate the safeguard-specific allowlist, reject use
outside Brawndo CIS, and preserve assessment history. Legacy verification
checklists, technology, notes and existing narratives are not migrated, erased,
or reinterpreted. Checking a criterion does not change assessment status or
verification. No dependency, global status, permission or recurrence changes.

## Source basis

All 56 IG1 safeguards have 85 concise criteria, individually checked against
their publisher safeguard paragraphs on the [CIS assessment specification](https://cas.docs.cisecurity.org/en/latest/).
All 56 deep links were checked against the published anchors across 15 Control
pages. The dataset records each source URL and v8.1 association.
These are paraphrases, not newly reproduced official text. CAS metrics,
enhanced implementation recommendations and examples were not promoted into
mandatory criteria. The source display continues to distinguish summaries from
authorized official text. Existing repository commercial-use authorization is
recorded in `cis-substantive-validation.md`; this work is not independent legal
verification of that authorization. [Publisher terms](https://cas.docs.cisecurity.org/en/latest/source/terms-of-use/)
and [CIS CAS overview](https://www.cisecurity.org/controls/cis-controls-assessment-specification)
were consulted.

## Verification

- Focused frontend: 52 tests across 6 suites passed.
- Backend assessment verification: 17 tests and 12 subtests passed.
- Broad frontend run: 148 suites / 801 tests passed; 1 suite / 1 test failed.
  `multiFrameworkLifecycle.test.js` reaches the existing Demo storage ceiling
  during its multi-year simulation. This same failure was previously reproduced
  on the unchanged baseline. It was not suppressed or changed. The separate
  `brawndoTenYear.test.js` was excluded from this broad run.
- Optimized preview build passed. Existing PlatformAdmin hook-dependency and
  bundle-size warnings remain.
- Browser: all 56 safeguards opened, source/checklist reviewed by assertions,
  criterion selections saved and reloaded; status and narrative preserved.
- Browser: 1440, 1280, 1024 and 768 pixels, light and dark; screenshots inspected
  at 1440 light and 768 dark. No horizontal overflow or runtime errors detected.
- Final browser pass: Save & next, Previous, unsaved-change protection,
  breadcrumb return, focus trapping, Escape and focus restoration passed.
  Initech retained its existing experience. Automated tests cover default
  assignment helper behavior and rejection of criteria writes outside the pilot.

The runnable browser check is `frontend/scripts/qa/cis-criteria.cjs`, using a
local Demo build and isolated synthetic browser state. Browser evidence is local
validation, not backend staging or independent compliance assurance.

## Changed areas and publication boundary

UI: BrawndoCisOverview, BrawndoCisSafeguard JSX/CSS, FrameworkDrawer and the
opt-in AssigneeSelect guidance flag. Persistence: preview/frameworks and backend
framework_governance; Docker packaging includes the shared criterion dataset.
Tests cover the UI, assignment defaults, source dataset, Demo and backend writes.

The approved delivery is a branch push and publication to the existing ChatGPT
Demo preview. GitHub main is not merged by this task. Backend changes are
committed but no backend/Railway deployment is performed.
