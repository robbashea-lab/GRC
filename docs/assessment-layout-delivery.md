# Assessment layout delivery status

Baseline and last refetched main: `27746e510240a11ab16392d93f55de1c9b604442`.
Branch: `codex/assessment-layout-all-frameworks`.

## Implemented

- Shared two-tab assessment layout for cumulative CIS IG1/2/3, all SOC 2 criteria, ISO ISMS/SoA/Annex A and internal-audit workpapers. Requirement summary is one disclosure; status, implementation narrative and linked Findings use the shared layout.
- Checklist selections stay independent of status, verification and completion. Existing metadata remains saved. Stable historical responses remain available with original text.
- CIS:153 safeguards; cumulative scope56/130/153;483 current checks,286 archived assertions, all361 baseline IDs retained. Current-plus-history union stays within existing20-item limit. Official CAS links and explicit triggers are mapped separately. Source conflicts11.1/12.2/17.5 are documented rather than silently rewriting the canonical requirement text.
- SOC 2:61 criteria,148 criterion-only checks;129 old practical-guidance items preserved. Points of focus and implementation suggestions are not promoted into mandatory requirements.
- ISO:12 source-verified units in clauses4–6,96 separate checks, max20 per unit.111 units remain source-pending (18 clause units and93 Annex A entries). Pending units have no invented checklist. SoA and audit lifecycle fields remain separate.
- Backend and isolated Demo validate ISO selections against the correct definition, retain prior same-record IDs and omitted audit selections, and preserve authorization, tenant scoping, optimistic tokens and history. No dependencies, production backend deployment or staging infrastructure changes.

## Release blockers

1. Approved mockup screenshot was not attached or otherwise available. Written layout has been implemented; exact proportions and approved screenshot comparison are unverified.
2. Complete licensed ISO source is unavailable. Clauses7–10 and Annex A cannot receive omission-free normative checklists without it.
3. Full official SOC/ISO requirement wording is not authorized in the supplied reference-only catalogs. Authored summaries are visibly attributed; they cannot be represented as official text. This differs from the fixed requested wording until an authorized source is supplied.
4. CIS canonical-source differences noted above require resolution before claiming a fully reconciled source comparison.

These are missing acceptance inputs, not requests for repeat Git/deployment authorization. The user authorized push/PR/merge/private preview; only draft PR is appropriate while required acceptance remains incomplete. Main and existing owner-private preview stay unchanged. Real authenticated backend/Mongo browser acceptance and production readiness are not established by Demo checks.

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
