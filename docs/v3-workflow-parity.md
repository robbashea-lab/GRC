# GoverNara v3.0 native workflow handoff

## Current exact HTML staging delivery, November 24

Robb confirmed that the complete supplied interactive HTML should be the ordinary staging interface, including all eight sample clients and ten programs, with existing saved records still available. The default internal sign-in entry at `/clients` serves `frontend/public/visual-preview.html`, copied from `GoverNara-v3-Workflow-Parity (3).html`. The SHA-256 is `5bb03e1219276a01459f2a44be6da44dce71271feb8a17c15a2083e6db397db9`.

The complete source document supplies the sample screens, records, framework assignments, guided assessments, reports and interactions. A single external session script provides real Sign out and an Existing records menu link. The source file itself is unchanged. The first exact-document release opens Glass ’07, and later theme selections follow the mockup's saved preference.

`/existing` returns to the native application and its saved records using the original route paths and authentication. A session preference selects which portfolio opens. Customer roles retain their authorized native dashboard. Explore Demo opens the complete supplied sample directly.

Sample edits retain the HTML's browser-local save/recovery behavior. They are independent of native client records and their database history. This deployment does not establish native persistence or workflow parity for the sample document. The prior native implementation remains available through Existing records.

## Earlier native staging implementation, November 24

The signed-in release on `codex/staging-signed-in-v3-20261124` combines the native workflows below with the design from `GoverNara-v3-Workflow-Parity (3).html`. Its SHA-256 is `5bb03e1219276a01459f2a44be6da44dce71271feb8a17c15a2083e6db397db9`. The exact HTML is available in `frontend/public/visual-preview.html` for visual comparison. The authenticated application uses its own React components, existing API and database.

Regular sign-in continues through the existing role and client selection rules. The portfolio opens the four-column client directory, and the client overview links to the status ledger and underlying work. Client dashboards and framework workspaces display status using the selected client's native assessments. The Appearance menu is part of the signed-in shell. The release uses the existing Render staging service. Full workflow QA and owner acceptance are deferred.

## All-client visual update

Glass ’07 is the initial appearance on upgrade. Choosing another theme saves it for later visits in the same browser. Calendar, quarter ledgers, policy cards, program and profile screens, administration, onboarding, setup and reports use the verified client context. The calendar and its agenda fill the workspace and the month scrolls within its panel on small screens. Chart entries open their saved record or occurrence.

Scope confirmations use the existing version-checked client profile save. The audit package reads the selected client and program, includes saved report and register history for the selected period, and records the download. Current register rows reflect the saved state at generation. Reconstruction of a complete prior-period register would require historical snapshots.

The package includes native multi-sheet workbooks, current client-profile scope and dated history. Level 2 CMMC packages use the same authorized SSP, POA&M, and SPRS generators as the workbook tabs. Linked open actions include future and undated work.

The local shared-view check opened 90 routes across all five clients in a new Demo and paired 70 with a matching mockup page. The route checks found no browser exceptions or horizontal document overflow. Additional isolated onboarding checks exercised newly created clients.

The branch is `codex/staging-signed-in-v3-20261124`. The deployment receipt and hosted verification are recorded separately after activation.

## Earlier implementation baseline

Work lives on `codex/v3-workflow-parity-20261124`, based on `fac1a1f1a617d34a31d348ab0885a29a4813e567`. The approved reference is `GoverNara-v3-Workflow-Parity.html`, SHA-256 `59053eb33db4dabc8f90561f3bd2b32854a1de33748cb252192f5f3e5b5d2843`. Its companion `STAGING-PARITY-NOTES.md` describes the standalone mockup observations and the staging baseline. The local verification folder beside this checkout is `governara-v3-qa`.

## Records and behavior

- After completing onboarding, a client operator can open the client's Services & Tools or iVenture Setup. The applicable inventory assessment reads the saved tool, responsibility, recurring ticket, cadence and first scheduled date. Scheduling a Review and completing an occurrence are separate operations.
- Frameworks, Dashboard, linked records and reports resolve shared Reviews by each active framework driver. Explicitly narrower links stay scoped. Evidence uses saved identities, including Library relationships and the appropriate occurrence. Files with the same name can represent separate evidence.
- A finding and its Action share native remediation history. Returning work for correction retains the submitted Action and creates a separate rework Action. The originating assessment displays the ticket's status. An eligible validator can close the finding. The assessment decision changes through reassessment.
- The CMMC workspace reads one client and level at a time. Level 1 has an internal printable SSP. Level 2 has an editable SSP, POA&M and planning score, with a separate field for a previously submitted SPRS result. Preparing a download reads the current saved records and records the export request. Nothing posts an official score on the client's behalf.
- The Word and Excel exports use the approved document and workbook layouts. The SSP includes requirement narratives, linked records, remaining inputs and remediation. The POA&M workbook groups work by point impact and retains closeout history. The score workbook distinguishes known deductions and unresolved inputs.

## Reproducing the local checks

With the repository's Python dependencies and a local MongoDB executable, run `python scripts/qa_native_inventory.py <path-to-mongod> --sample-report <output.pdf>` and `python scripts/qa_cmmc_workbook.py <path-to-mongod>`. Each starts a new local database and exercises the native login and API. The first covers the inventory lifecycle, nine separately enrolled single-framework clients and a six-framework client. The second checks Level 1 and Level 2, workbook saves, linked remediation, role boundaries and export audit. The frontend regression suites cover guided context, remediation, framework relationships, reports and Office file contents.

## Acceptance and release

The signed-in and Demo builds, named checks, browser downloads and document renders are local evidence. See `final-receipt.json` in the verification folder for the exact commit, build identifiers and artifacts. The native CMMC tabs use existing native components. Full screen-by-screen design acceptance, existing-client data rehearsal and hosted release checks remain open. The next release decision belongs to Robb after reviewing the native changes and the updated files. Deployment requires separate approval.
