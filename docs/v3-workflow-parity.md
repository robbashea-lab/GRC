# GoverNara v3.0 native workflow handoff

## Staging QA corrections, November 26 (candidate)

Robb authorized comprehensive staging QA and fixes while preserving the approved design and all existing data. Root owns this branch and the staging release; no other agent deploys. The prior live product is `fbc4fd5c77b72b1ed6480db48c074cbdda231c63`, Render deployment `dep-dc43fup5efls73cv70jg`. The source HTML and its SHA below are unchanged.

Confirmed and corrected:

- Refresh no longer reorders the authenticated account after Users & Access has rendered its action indexes. Access edits retain historical GRC lead assignments; legacy viewer roles map to the native readonly role.
- Contacts reconcile by saved identity, including two Sacred Heart contacts with blank email addresses. Displayed access follows the explicit native linked account and its current permissions; matching email addresses cannot imply access. Reference people remain reference-only.
- Cached program charts, contact badges and evidence totals do not turn read-only navigation into saves. Real register, assessment, enrollment, access and evidence changes remain tracked. Queued saves set the busy indicator immediately and retain it until the queue drains, preventing a misleading idle gap during onboarding.
- A newly completed client with an empty security profile can reopen Client Profile. Missing maturity answers display Unknown; initialization no longer leaves an incomplete object that crashes the approved renderer.
- Evidence totals use actual stored bytes, completed occurrences and current active-program links. The rolling 90-day caption and tooltip use the current date. Folder counts, browsing and ZIP selection share the native catalog's canonical membership, including files linked to both a Risk and its Review. Metadata references remain browseable and are not reported as stored files or exported as invented contents. Download all/folder uses the existing verified native ZIP writer. Busy, double-click, stale-client and replaced-dialog guards protect async downloads.
- Security & Auth and password-help descriptions now describe enforced native behavior instead of asserting mockup-only MFA, lockout, password history/rotation or idle-session expiry. Cards, layout, icons and themes are unchanged; no authentication protections were weakened.

Verification completed before candidate release: optimized authenticated build; 17 focused frontend suites / 144 tests; separate contact identity regression; queue-state regression; 83 isolated native backend tests and 14 isolated hosting tests. Actual approved-document tests exercise all eight clients across fourteen sections, all ten programs, eleven new-client framework/scope combinations and guided draft adoption. Native lifecycle checks complete/replay 29 existing review series across all eight fixture clients and verify their parent Risk/Policy/Vendor/AI readbacks, calendar occurrence identity and history. Evidence checks include a real native upload belonging to both Reviews and Risks and archived-client/catalog behavior. Independent AI review found no remaining material issue in the inspected diff; this is not human acceptance.

The compiled local browser passed sign-in, all eight client calendar links and responsive width, calendar drag/reload, Action create/edit/reload, unanswered-review rejection, identical uploaded/downloaded evidence bytes, profile save/reload and native SPRS download. Its first onboarding run exposed a queued-save timing failure; the failed receipt is retained in `../governara-v3-qa/browser-final-20261126.json`, with a focused rerun in progress after the busy-state correction. The disposable browser uses in-memory Mongo and substitutes serial workbook reads, not replica-set qualification.

Hosted checks, CI, candidate deployment and final acceptance are separate and are not yet claimed for these fixes. Existing staging clients are inspected read-only; use explicitly named new QA clients for completion/onboarding mutations and preserve their audit history. Do not repurpose earlier synthetic acceptance fixtures. Recent audit summaries in the approved page do not replace the full paginated native Audit Log. Historical sample approvals, screenings and evidence references are not certification or proof of file contents. Other roles and unmarked retained clients still use their native workspace as documented below.

## Live native integration on staging, November 26

Branch: `codex/staging-signed-in-v3-20261124`, based on `d1d6beb55009cb63db534344dcc7e3bd5e25a168`. Robb authorized staging implementation of the complete approved portfolio alongside retained records. The unchanged reference remains `frontend/public/visual-preview.html`, SHA-256 `5bb03e1219276a01459f2a44be6da44dce71271feb8a17c15a2083e6db397db9`.

The authenticated `/clients` response uses that document's original renderers with a pinned integration hook and a separately built native API adapter. It waits for authorized records before rendering and does not read, write or reset the offline Demo's browser store. Glass ’07 is the initial appearance; later theme choices still work. Existing authentication, SSO, recovery, sessions and logout remain native.

An Owner's first load imports the eight fictional clients and ten programs using reserved identities and insert-only, retry-safe writes. Existing clients and work are not replaced. Reference people are historical names, not authentication accounts, assignees or approvers. No placeholder evidence bytes, missing policy approval support, AI screening answers or historical audit events are invented. Newly created clients use normal allocated identities and native onboarding, then rehydrate into the approved page.

The adapters connect client/profile/enrollment saves, approved guided interviews, shared tools and iVenture setup, review occurrences/checklists, findings/actions, risks, policies, vendors, AI, evidence and CMMC workbooks to native writers and version checks. Approved interview drafts remain private per actual actor; adopting implementation text does not itself make an assessment or verification decision. Required review checks and support remain enforced. SSP/POA&M/SPRS and supported Reports downloads use saved native materials and audit receipts. Report choices that cannot be translated safely link to the selected client's native Reports workbench.

Source-only layout is retained. The authenticated clock uses the current local calendar day; date-only scheduling retains its day through reload. Three already-existing native HIPAA scope/dependency assessment units are visible with their catalog guidance, rather than silently hiding retained native rows. They remain unassessed until an operator evaluates them. The offline reference is unchanged.

Access scope is deliberate: this entry is for authorized internal administrators and source-marked clients. `/existing` retains the ordinary native directory, all earlier records, other role workflows and full paginated Audit Log. Recent native tenant audit summaries are projected into the approved page. The integration does not claim that every existing unmarked client or customer role has been restyled.

Local verification on November 26: optimized authenticated build; focused adapter/domain tests; isolated native hosting/import/guide/report/evidence tests; actual signed-in compiled browser using a disposable database. The browser opened all eight client calendars at desktop and phone widths, saved/moved the same occurrence through reload, created/edited an action, rejected unanswered review completion, uploaded/downloaded identical evidence bytes, saved profile notes, downloaded the native SPRS workbook and completed a new client's onboarding with generated policies/reviews. Receipts are in the sibling `governara-v3-qa` directory, particularly `native-browser-final-20261126-c.json`. The fixture browser substitutes in-memory Mongo and serial workbook reads; real replica-set snapshot durability is a separate existing gate. Full platform/security QA and product-owner acceptance remain open.

Deployment receipt: product commit `fbc4fd5c77b72b1ed6480db48c074cbdda231c63` is Live on the existing Render service `srv-db1s0cugekts73f72reg`, deployment `dep-dc43fup5efls73cv70jg`, finished `2026-11-26T13:47:56Z`. It was manually deployed by exact SHA; the service branch remains main with Auto-Deploy off. No production release or main merge occurred. The earlier live build was `d1d6beb5`, deployment `dep-dc30d8m1egvs738279l0`.

Hosted checks: public health returned 200; the served reference retained the approved SHA above. The Linux-built integration bundle returned 200 with SHA-256 `805893cdd4aceb22bb9c99d331b12f3fbf59a665d3e4d9688ae2496ec130089f`; its hash differs from the local Windows build and is recorded separately. A real existing administrator session loaded all eight imported clients. Sign out followed by normal saved-credential sign-in opened the approved portfolio with Glass ’07, the real actor and eight clients. All eight live Calendar links showed the correct client and a 969px grid inside a 981px workspace at the observed browser width. Existing records showed all 16 clients (the prior eight plus the approved eight). The browser was left on the approved portfolio after fresh sign-in, with no observed console errors in the inspected window. Hosted native mutation/recovery and full platform/security acceptance were not repeated; workflow mutation checks above used the disposable local database. No CI run was reported for this commit (the branch is outside the workflow's push trigger). Full qualification remains separate.

The user-facing staging link is https://omnisciente-staging.onrender.com/login. The next step is Robb's visual/workflow review, followed by the deferred full QA campaign. Preserve the source and all records while addressing confirmed review findings.

## Historical exact HTML staging delivery, November 24

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
