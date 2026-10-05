# Assessment layout delivery status

Original baseline: `27746e510240a11ab16392d93f55de1c9b604442`.
Branch: `codex/assessment-layout-all-frameworks`.

## Implemented

- Shared two-tab assessment layout for cumulative CIS IG1/2/3, all SOC 2 criteria, ISO ISMS/SoA/Annex A and internal-audit workpapers. Requirement summary is one disclosure; status, implementation narrative and linked Findings use the shared layout.
- Checklist selections stay independent of status, verification and completion. Existing metadata remains saved. Stable historical responses remain available with original text.
- CIS:153 safeguards; cumulative scope56/130/153;483 current checks,286 archived assertions, all361 baseline IDs retained. Current-plus-history union stays within existing20-item limit. Official CAS links and explicit triggers are mapped separately. Source conflicts11.1/12.2/17.5 are documented rather than silently rewriting the canonical requirement text.
- SOC 2:61 criteria,148 criterion-only checks;129 old practical-guidance items preserved. Points of focus and implementation suggestions are not promoted into mandatory requirements.
- ISO:12 source-verified units in clauses4–6,96 separate checks, max20 per unit.111 units remain source-pending (18 clause units and93 Annex A entries). Pending units have no invented checklist. SoA and audit lifecycle fields remain separate.
- Backend and isolated Demo validate ISO selections against the correct definition, retain prior same-record IDs and omitted audit selections, and preserve authorization, tenant scoping, optimistic tokens and history. No dependencies, production backend deployment or staging infrastructure changes.

## Current acceptance blockers

Approved HTML is available and the actual CIS workbook comparison is complete. Full ISO verification needs legitimate ISO/IEC27001:2022 clauses7–10 and Annex A for111 units. Applicable product reuse rights for official ISO/SOC2 wording remain unresolved. See assessment-layout-inputs.md for one exact list of blocked units and reusable content. Source access and implementation approval do not grant redistribution rights.

PR36 stays draft. Release is authorized only after design/content acceptance, current-main reconciliation and normal GitHub gates, to the existing owner-private preview and existing Render staging. No provider settings or database changes are authorized. Local synthetic authenticated checks do not establish hosted Atlas acceptance.

## Verification

Final commands and evidence will be recorded below once running checks complete. Separate combined implementation review found no new material code defect; it could not compare an absent mockup or unavailable normative sections.

- Backend: `PYTHONPATH=backend;backend/tests`, existing `backend/tests/run_isolated.py`:626 passed +690 subtests,8 FastAPI/Pydantic deprecation warnings (296.33s). Uses classified offline test fixtures; not real Mongo/authenticated browser acceptance.
- Builds: `CI=true REACT_APP_PREVIEW=false node node_modules/@craco/craco/dist/bin/craco.js build`; `CI=true node scripts/preview.cjs build`:both compiled successfully. Main gzip736.71kB normal /736.75kB Demo; large-bundle advisory and Node fs.F_OK deprecation remain.
- Existing `verify-remediation-tickets.cjs` browser suite passed unified updates, validation, closure/reopening, evidence/history, unassigned ownership, mobile/focus and unrelated-client preservation.
- Final `verify-ticket-sources.cjs` passed SOC/CIS IG2/ISO clause/Annex and audit associations, storage-failure recovery, discarded-draft retention, historical Review occurrence and newly onboarded client tickets.
- Final loopback Demo browser checks use disposable session storage and headless Edge. Light/dark widths1440/1280/768/480, tabs/keyboard, save/reopen, independent status/metadata, newly onboarded client, framework additions and CIS scope upgrades verified. The complete per-subtype run is recorded in the exported JSON.
- `git diff --check` passed. No package or lockfile change. Final separate combined code review found no new material defect; no independent normative or mockup assurance is claimed.
- Settled frontend regression:45 suites /619 tests passed (374.048s), including five-year multi-framework and24-month CIS lifecycle, content identifiers, onboarding/configuration, stale saves, assignments and remediation. Some existing mocked dialogs forward Radix focus props to DOM and emit React test-console warnings; real optimized browser checks reported no page errors.
- Expanded browser checks passed Security/Availability/Confidentiality/Processing Integrity/Privacy, CIS IG1/IG3-only safeguard, ISO ISMS/SoA and Annex view. Audit source/ticket checks passed separately. No exact screenshot comparison or complete ISO coverage claim.
- Earlier integration runs failed stale content-count fixtures and historical-response assertions; those assertions were corrected to the new requirements while preserving exact ID/text checks, then settled regressions passed. The earlier broad frontend run was interrupted; the final45-suite scope is reported, not a whole-frontend pass.

Release disposition: draft PR only; no merge or publication. Existing owner-private preview URL/access/version untouched. No merged commit or new preview version exists for this change.

## PR36 follow-up after approved reference supplied

Approved HTML is now available and rendered; the earlier missing-mockup blocker is superseded. See assessment-layout-visual-comparison.md for measured differences, corrections and boundaries of screenshot evidence. New source inspection verified the actual original CIS workbook: all153 descriptions exactly match. The earlier ledger-only/CAS discrepancy blocker is superseded by cis-assessment-source-reconciliation.md; proposed source authority stays the supplied workbook, with CAS differences documented. No canonical wording or historical response was changed.

The exact remaining input list is assessment-layout-inputs.md. SOC review source is available; official product wording rights remain unestablished. Remaining ISO requirement verification needs complete legitimate2022 clauses7–10 and Annex A. Public clause4–6 coverage remains12units/96checks. No licensed publication is copied into the product.

Follow-up automated verification:328 frontend tests across10 suites;50 backend route tests +19 subtests;13 auth/assignment API tests +168 subtests. These use synthetic in-memory storage. Both optimized builds passed; normal sign-in was explicitly enabled for isolated authenticated-browser verification. Real login/routes passed for owner/provider/manager/contributor/reader, including tenant/mutation/route gates, reload, storage tampering and logout. This is authenticated synthetic-storage browser evidence, not real Mongo/browser acceptance. Existing complete offline626+690 and relevant frontend619 evidence remains from the prior tested commit; those entire collections are not claimed rerun after this presentation-only follow-up.

Optimized Demo checks are separate: checklist/narrative save/reopen, draft tabs, independent status, existing/new/multi-framework clients, ordinary scope upgrades and unified source ticket synchronization. No production backend, staging infrastructure, main merge or private preview publication occurred. Prior source and interface reports are historical where superseded here.

## Reconciled verification 2026-10-05

Reconciled PR34 main bb9bcbfe5b7a36b4fb16ff98226adb3913a5ce41; both normal and Demo builds passed. Final six-suite frontend regression:295 passed. Backend ISO/governance/remediation/auth/assignment scope:63 passed +187 subtests. Optimized Demo:10 representative units, light/dark1440/1280/768/480, existing/new client and56→130→153 cumulative scope history checks passed. Unified ticket sources passed. Independent review found no new material code defect.

Normal authenticated browser used real cookie/JWT/bcrypt/routes with synthetic in-memory Mongo, no mail/IdP/external database. CIS1.1,SOC CC1.1,ISO4.1 and Annex A.5.1 passed draft-tab retention, checklist where available, save/reload and independent status/verification/owners/evidence/relationships. Five-role normal login/reload, tenant and mutation gates, forged storage rejection and logout passed with zero page errors. This is not hosted Atlas/restart acceptance; ISO audit-occurrence save is separate from these four normal assessment samples.

Native dialog X preserves dirty-close protection; redundant footer close removed from CIS/SOC/ISO assessments and canonical titles match the approved format. Navigation remains required by the original task. Tab transitions disabled for settled screenshot comparison. Source/history preservation means source-driven content differs from mockup sample data; no claim of whole-dialog pixel identity or complete normative coverage.

PR36 remains draft because applicable source/content acceptance is incomplete. No merge, private preview publication or Render deployment from this branch occurred. Hosted results in PR34 are historical evidence for that deployment, not verification of this assessment change. Existing preview URL/access/version and Render/Atlas settings/data/Free plans remain unchanged by this branch.

## Exact final reconciliation provenance

Latest fetched main: e8f600da3996f6a7f757152e7e176bb7de6b645e (PR37 merged after PR34). Reconciled without conflicts into tested assessment commit1b4b0a5692af2f0f5b4cfda66e95381bd776c4b3, containing layout/source follow-up e708fe2. Frontend builds and295 tests were performed on that same frontend source before the backend-only PR37 merge. After the merge, identity/auth/assignment API checks passed29 tests +168 subtests; authenticated assessment/five-role browser rerun passed against that exact tested commit. No package/lockfile/provider/deployment configuration changes from assessment work. Final subsequent commit only records this evidence.

Merged rollout SHA: none. Deployed rollout SHA: none. Private preview version: unchanged, not newly queried or published. Render revision: not changed or claimed verified by this task. Hosted changed-assessment checks await release eligibility. Missing normative material/rights is the exact release blocker; implementation approval does not establish third-party content rights. Current public/main staging provenance is separate from this tested isolated branch.
