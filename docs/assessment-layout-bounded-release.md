# PR36 bounded layout release

Owner authorization, October5,2026: release the approved assessment layout and verified authored content corrections; preserve111 source-pending ISO units. No new verbatim ISO/SOC paragraphs, new requirements or product explanatory wording. This release is not complete normative verification across frameworks. Remaining inputs are consolidated in assessment-layout-inputs.md.

## Tested candidate

Assessment implementation0bcb780f5c462949c232af4d04527deee5fb701e; provenance documentation b18d146a60177d2ea6296f5adb12d6215ba7085d. Latest main d2468ed13242ee4c6fbab047e7eb5fa2a38c8f4a reconciled without conflicts in candidate0e5965a78fc47bc40f7d1e1d7faa21e3d373c35f. PR38 shared dashboard/navigation and PR37 account-version protection preserved. Independent read-only reviewer inspected the complete PR diff at that candidate and found no material release blocker; git diff --check passed.

Post-reconciliation focused frontend36 suites/528 tests passed. Backend framework/identity71 tests plus19 subtests and dashboard9 tests passed. Both normal and Demo optimized builds compiled. Render also successfully built the normal-plus-isolated-Demo Docker artifact. Rendered reference comparison found no differences across the13 common-component groups for CIS1.1,SOC CC1.1,ISO4.1. Local authenticated real-route browser:four assessment samples and five-role authorization/tenant/storage/logout checks passed with synthetic in-memory storage; these are separate from hosted Atlas results.

## Actual hosted candidate acceptance

Existing Render Free service srv-db1s0cugekts73f72reg manually deployed exact candidate0e5965a for pre-merge verification. Normal staging administrator sign-in and logout passed. Users & Access and authenticated API both confirmed exactly one active account; the three existing fictional accounts remained disabled. No login account was created or enabled.

Labelled synthetic client: Synthetic PR36 Assessment Release QA. Actual browser and hosted API verified CIS1.1,SOC CC1.1,ISO4.1 implementation/status/checklist saves and reloads. Checklist changes remain independent of verification/conclusion. CIS expanded to IG3/153 safeguards with the prior CIS1.1 response retained. Pending ISO7.1 implementation and pending Annex A.5.1 implementation/SoA justification/applicability saved successfully; these units have no invented checklist items and retained authored summaries/guidance. All123 ISO identities remain present. Dirty-close prompted Keep editing/Discard changes and retained the draft on Keep editing.

From pending ISO7.1, a labelled synthetic Finding created its unified corrective Action. Editing planned action and work status through the existing ticket drawer updated the assessment ticket to in progress without altering the assessment conclusion. Native evidence/control/SoA/history workflows remain available.

Render Demo entry and assessment editing passed. Authenticated records read before/after the Demo edit (all synthetic client's framework assessments, Findings, tasks and clients) were byte-equivalent, SHA256 e75ab654bd0eb8e0ed89565b08aafe88a44d3f41de40f286fe1fdf80da5f461a. User inventory stayed exactly one active account. This is hosted API/browser persistence evidence, not a database backup/restore test or full-framework normative acceptance.

## Release provenance

Final protected merge, owner-private preview version and final Render merged-source deployment are recorded below when verified. Candidate publication does not establish a finished final rollout. Provider settings, credentials, infrastructure, Free plans and existing data are preserved. Backend DEMO_MODE remains false; browser Demo uses the separate adapter.
