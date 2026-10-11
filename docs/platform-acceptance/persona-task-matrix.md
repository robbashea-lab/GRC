# Product and persona acceptance inventory

Baseline `28b806716024ec149af2ec5da621a5a618c669d5` on `codex/acceptance-product-personas-20261011`. Source inspection only; no browser, hosted request, application-suite run or record mutation. No source presence is a task pass.

**78 tasks**: 60 framework/persona rows (12 × five configurations) and 18 shared operating rows. Client-role rows are blocked; other functional tasks remain not tested in this workstream.

## Framework pins

| Configuration | Version | Active inventory | Normal route |
| --- | --- | ---: | --- |
| CIS-IG1 | 8.1 | 56 | `/compliance/cis-ig1` |
| CIS-IG2 | 8.1 | 130 | `/compliance/cis-ig1` |
| CIS-IG3 | 8.1 | 153 | `/compliance/cis-ig1` |
| ISO27001 | 2022 + Amd 1:2024 | 123 | `/compliance/iso-27001` |
| SOC2 | 2017 TSC, revised points of focus 2022 | 38 | `/compliance/soc-2` |

SOC canonical catalog is 61; primary Security/Availability/Confidentiality is 38. CIS groups share one route and cumulative IDs. ISO 30 ISMS + 93 Annex A = 123. JSON records controls, authoritative records, source files, existing tests and separate execution boundaries.

## Task matrix

| ID | Persona | Task and current controls | Acceptance |
| --- | --- | --- | --- |
| CIS-IG1-business_owner-inventory | Business/product owner | Establish truthful enabled-program inventory: Portfolio → client → program; Client Profile → Program Configuration; program cards/search | not_tested |
| CIS-IG1-business_owner-portfolio | Business/product owner | Trace a high-level result to its source: Portfolio tiles/filters → client Dashboard → work/program count → authoritative drawer | not_tested |
| CIS-IG1-business_owner-history | Business/product owner | Reconstruct a prior decision and hand it over: Native requirement Activity / History; Review History; source Evidence; existing CSV exports | not_tested |
| CIS-IG1-ciso-assurance | CISO/vISO | Separate implementation from verification and operating evidence: Program overview → native requirement; implementation/verification fields and supporting Controls | not_tested |
| CIS-IG1-ciso-material_work | CISO/vISO | Determine exposure, gaps, treatment and next obligation: Dashboard work filters → Risks / Action Items / Reviews → source-linked drawer | not_tested |
| CIS-IG1-ciso-scope | CISO/vISO | Inspect actual scope and a supported scope change: Client Profile → Program Configuration; program scope/retained-record controls; ISO SoA/audit views | not_tested |
| CIS-IG1-analyst-guide | GRC analyst/team member | Complete/resume the safeguard-specific interview: Program OmniBot invitation → recommended native requirement → guide → groups → Save & next → summary | not_tested |
| CIS-IG1-analyst-save | GRC analyst/team member | Save/update exact reviewed Current Implementation: Summary editable field → Save assessment / Update assessment / Save & close → confirmation → native field/refresh | not_tested |
| CIS-IG1-analyst-chain | GRC analyst/team member | Execute the connected operating cycle: Native Related/Reviews/Evidence → Review → Raise Finding → Action Item → independent validation → native reassessment | not_tested |
| CIS-IG1-client_user-assigned | Client user | Find permitted assigned work unaided: Normal client landing → Dashboard / Reviews / Action Items → owner filter/source link | blocked |
| CIS-IG1-client_user-contribute | Client user | Provide answers/evidence and return to progress: Assigned native requirement / Review / Action Item → editable fields/Evidence/Comments → save/reopen | blocked |
| CIS-IG1-client_user-denial | Client user | Verify read-only and wrong-client denial: Real Reader UI and approved valid synthetic direct requests to permitted/forbidden fixtures | blocked |
| CIS-IG2-business_owner-inventory | Business/product owner | Establish truthful enabled-program inventory: Portfolio → client → program; Client Profile → Program Configuration; program cards/search | not_tested |
| CIS-IG2-business_owner-portfolio | Business/product owner | Trace a high-level result to its source: Portfolio tiles/filters → client Dashboard → work/program count → authoritative drawer | not_tested |
| CIS-IG2-business_owner-history | Business/product owner | Reconstruct a prior decision and hand it over: Native requirement Activity / History; Review History; source Evidence; existing CSV exports | not_tested |
| CIS-IG2-ciso-assurance | CISO/vISO | Separate implementation from verification and operating evidence: Program overview → native requirement; implementation/verification fields and supporting Controls | not_tested |
| CIS-IG2-ciso-material_work | CISO/vISO | Determine exposure, gaps, treatment and next obligation: Dashboard work filters → Risks / Action Items / Reviews → source-linked drawer | not_tested |
| CIS-IG2-ciso-scope | CISO/vISO | Inspect actual scope and a supported scope change: Client Profile → Program Configuration; program scope/retained-record controls; ISO SoA/audit views | not_tested |
| CIS-IG2-analyst-guide | GRC analyst/team member | Complete/resume the safeguard-specific interview: Program OmniBot invitation → recommended native requirement → guide → groups → Save & next → summary | not_tested |
| CIS-IG2-analyst-save | GRC analyst/team member | Save/update exact reviewed Current Implementation: Summary editable field → Save assessment / Update assessment / Save & close → confirmation → native field/refresh | not_tested |
| CIS-IG2-analyst-chain | GRC analyst/team member | Execute the connected operating cycle: Native Related/Reviews/Evidence → Review → Raise Finding → Action Item → independent validation → native reassessment | not_tested |
| CIS-IG2-client_user-assigned | Client user | Find permitted assigned work unaided: Normal client landing → Dashboard / Reviews / Action Items → owner filter/source link | blocked |
| CIS-IG2-client_user-contribute | Client user | Provide answers/evidence and return to progress: Assigned native requirement / Review / Action Item → editable fields/Evidence/Comments → save/reopen | blocked |
| CIS-IG2-client_user-denial | Client user | Verify read-only and wrong-client denial: Real Reader UI and approved valid synthetic direct requests to permitted/forbidden fixtures | blocked |
| CIS-IG3-business_owner-inventory | Business/product owner | Establish truthful enabled-program inventory: Portfolio → client → program; Client Profile → Program Configuration; program cards/search | not_tested |
| CIS-IG3-business_owner-portfolio | Business/product owner | Trace a high-level result to its source: Portfolio tiles/filters → client Dashboard → work/program count → authoritative drawer | not_tested |
| CIS-IG3-business_owner-history | Business/product owner | Reconstruct a prior decision and hand it over: Native requirement Activity / History; Review History; source Evidence; existing CSV exports | not_tested |
| CIS-IG3-ciso-assurance | CISO/vISO | Separate implementation from verification and operating evidence: Program overview → native requirement; implementation/verification fields and supporting Controls | not_tested |
| CIS-IG3-ciso-material_work | CISO/vISO | Determine exposure, gaps, treatment and next obligation: Dashboard work filters → Risks / Action Items / Reviews → source-linked drawer | not_tested |
| CIS-IG3-ciso-scope | CISO/vISO | Inspect actual scope and a supported scope change: Client Profile → Program Configuration; program scope/retained-record controls; ISO SoA/audit views | not_tested |
| CIS-IG3-analyst-guide | GRC analyst/team member | Complete/resume the safeguard-specific interview: Program OmniBot invitation → recommended native requirement → guide → groups → Save & next → summary | not_tested |
| CIS-IG3-analyst-save | GRC analyst/team member | Save/update exact reviewed Current Implementation: Summary editable field → Save assessment / Update assessment / Save & close → confirmation → native field/refresh | not_tested |
| CIS-IG3-analyst-chain | GRC analyst/team member | Execute the connected operating cycle: Native Related/Reviews/Evidence → Review → Raise Finding → Action Item → independent validation → native reassessment | not_tested |
| CIS-IG3-client_user-assigned | Client user | Find permitted assigned work unaided: Normal client landing → Dashboard / Reviews / Action Items → owner filter/source link | blocked |
| CIS-IG3-client_user-contribute | Client user | Provide answers/evidence and return to progress: Assigned native requirement / Review / Action Item → editable fields/Evidence/Comments → save/reopen | blocked |
| CIS-IG3-client_user-denial | Client user | Verify read-only and wrong-client denial: Real Reader UI and approved valid synthetic direct requests to permitted/forbidden fixtures | blocked |
| ISO27001-business_owner-inventory | Business/product owner | Establish truthful enabled-program inventory: Portfolio → client → program; Client Profile → Program Configuration; program cards/search | not_tested |
| ISO27001-business_owner-portfolio | Business/product owner | Trace a high-level result to its source: Portfolio tiles/filters → client Dashboard → work/program count → authoritative drawer | not_tested |
| ISO27001-business_owner-history | Business/product owner | Reconstruct a prior decision and hand it over: Native requirement Activity / History; Review History; source Evidence; existing CSV exports | not_tested |
| ISO27001-ciso-assurance | CISO/vISO | Separate implementation from verification and operating evidence: Program overview → native requirement; implementation/verification fields and supporting Controls | not_tested |
| ISO27001-ciso-material_work | CISO/vISO | Determine exposure, gaps, treatment and next obligation: Dashboard work filters → Risks / Action Items / Reviews → source-linked drawer | not_tested |
| ISO27001-ciso-scope | CISO/vISO | Inspect actual scope and a supported scope change: Client Profile → Program Configuration; program scope/retained-record controls; ISO SoA/audit views | not_tested |
| ISO27001-analyst-guide | GRC analyst/team member | Complete/resume the safeguard-specific interview: Program OmniBot invitation → recommended native requirement → guide → groups → Save & next → summary | not_tested |
| ISO27001-analyst-save | GRC analyst/team member | Save/update exact reviewed Current Implementation: Summary editable field → Save assessment / Update assessment / Save & close → confirmation → native field/refresh | not_tested |
| ISO27001-analyst-chain | GRC analyst/team member | Execute the connected operating cycle: Native Related/Reviews/Evidence → Review → Raise Finding → Action Item → independent validation → native reassessment | not_tested |
| ISO27001-client_user-assigned | Client user | Find permitted assigned work unaided: Normal client landing → Dashboard / Reviews / Action Items → owner filter/source link | blocked |
| ISO27001-client_user-contribute | Client user | Provide answers/evidence and return to progress: Assigned native requirement / Review / Action Item → editable fields/Evidence/Comments → save/reopen | blocked |
| ISO27001-client_user-denial | Client user | Verify read-only and wrong-client denial: Real Reader UI and approved valid synthetic direct requests to permitted/forbidden fixtures | blocked |
| SOC2-business_owner-inventory | Business/product owner | Establish truthful enabled-program inventory: Portfolio → client → program; Client Profile → Program Configuration; program cards/search | not_tested |
| SOC2-business_owner-portfolio | Business/product owner | Trace a high-level result to its source: Portfolio tiles/filters → client Dashboard → work/program count → authoritative drawer | not_tested |
| SOC2-business_owner-history | Business/product owner | Reconstruct a prior decision and hand it over: Native requirement Activity / History; Review History; source Evidence; existing CSV exports | not_tested |
| SOC2-ciso-assurance | CISO/vISO | Separate implementation from verification and operating evidence: Program overview → native requirement; implementation/verification fields and supporting Controls | not_tested |
| SOC2-ciso-material_work | CISO/vISO | Determine exposure, gaps, treatment and next obligation: Dashboard work filters → Risks / Action Items / Reviews → source-linked drawer | not_tested |
| SOC2-ciso-scope | CISO/vISO | Inspect actual scope and a supported scope change: Client Profile → Program Configuration; program scope/retained-record controls; ISO SoA/audit views | not_tested |
| SOC2-analyst-guide | GRC analyst/team member | Complete/resume the safeguard-specific interview: Program OmniBot invitation → recommended native requirement → guide → groups → Save & next → summary | not_tested |
| SOC2-analyst-save | GRC analyst/team member | Save/update exact reviewed Current Implementation: Summary editable field → Save assessment / Update assessment / Save & close → confirmation → native field/refresh | not_tested |
| SOC2-analyst-chain | GRC analyst/team member | Execute the connected operating cycle: Native Related/Reviews/Evidence → Review → Raise Finding → Action Item → independent validation → native reassessment | not_tested |
| SOC2-client_user-assigned | Client user | Find permitted assigned work unaided: Normal client landing → Dashboard / Reviews / Action Items → owner filter/source link | blocked |
| SOC2-client_user-contribute | Client user | Provide answers/evidence and return to progress: Assigned native requirement / Review / Action Item → editable fields/Evidence/Comments → save/reopen | blocked |
| SOC2-client_user-denial | Client user | Verify read-only and wrong-client denial: Real Reader UI and approved valid synthetic direct requests to permitted/forbidden fixtures | blocked |
| SHARED-business_owner-onboard | Business/product owner | Create one client without fabricated organizational facts: Client Management → Add Client → Create client → Open Client Profile → four-step onboarding | not_tested |
| SHARED-business_owner-scope_expansion | Business/product owner | Add a program later/reuse a mixed-framework practice: Client Profile → Program Configuration → Applicability → Confirm program change | not_tested |
| SHARED-business_owner-archive | Business/product owner | Archive/reactivate an authorized disposable client: Client Management → Archive / Restore → confirmation | not_tested |
| SHARED-business_owner-reporting | Business/product owner | Reconcile portfolio and supported exports: Portfolio filters/drilldowns; Audit Log Export CSV; register Export CSV. Existing Board Report API, with UI entry separately unverified. | not_tested |
| SHARED-ciso-reviews | CISO/vISO | Inspect scheduled work and immutable occurrence history: Reviews filters → Review History; Calendar exact chip → source | not_tested |
| SHARED-ciso-risk | CISO/vISO | Record acceptance/deferral and later reassessment: Risks → Treatment/decision/linked Review; supported Exceptions records | not_tested |
| SHARED-ciso-policy | CISO/vISO | Inspect issued version and independent approval: Policies → Policy → workflow/approval/version/evidence | not_tested |
| SHARED-ciso-vendor | CISO/vISO | Trace vendor assurance and central Review: Vendors → Assurance / Contract → linked Review; register filters | not_tested |
| SHARED-ciso-evidence | CISO/vISO | Reconstruct prior evidence and links: Evidence Library folders/search → file → Activity/links/Download/Include archived | not_tested |
| SHARED-analyst-review_execute | GRC analyst/team member | Start/document/complete/repeat a Review: Reviews → New Review → Start Review → Evidence/Comments → Complete Review | not_tested |
| SHARED-analyst-remediate | GRC analyst/team member | Create one Finding/multiple Actions; validate or reject: Action Items New Finding/New Action Item; source Raise Finding; ticket validation | not_tested |
| SHARED-analyst-calendar | GRC analyst/team member | Reschedule permitted work without changing recurrence: Calendar Month/Week/Day → scheduling popup/allowed drag → Save date | not_tested |
| SHARED-analyst-handoff | GRC analyst/team member | Reassign existing authorized user; preserve old actor: Contacts/access context; owner controls; Activity/History | not_tested |
| SHARED-analyst-systems | GRC analyst/team member | Maintain supported Systems & Scope/Controls: Systems & Scope register; native Controls; existing AI Governance references | not_tested |
| SHARED-client_user-landing | Client user | Enter permitted tenant and locate assigned responsibility: Normal sign-in → Dashboard; permitted selector; Reviews/Action Items owner filters | blocked |
| SHARED-client_user-return | Client user | Return after actual refresh/logout/login: Existing sign-out/sign-in; native Resume; saved question groups | blocked |
| SHARED-client_user-download | Client user | Download authorized evidence/export: Evidence Download; register Export CSV; approved direct authorization request | blocked |
| SHARED-client_user-task | Client user | Complete assigned remediation without altering assurance: Action Items → Start Work/Complete Action Item → Finding pending validation | blocked |

## Report-only concerns

### RP-01: report_only_discoverability

Findings are intentionally inside Action Items; normal client sidebar has no Findings entry and /findings redirects. High / Critical Findings is an existing filter.

Impact: Unaided discovery of pending validation is untested; a known deep link does not establish acceptable client usability.
Disposition: Evaluate with a permitted real client participant; any navigation/copy remedy needs separate interface authorization.

Source: `frontend/src/components/BrawndoSidebar.jsx:16`, `frontend/src/components/BrawndoSidebar.jsx:109`, `frontend/src/pages/BrawndoActionItems.jsx:20`, `frontend/src/pages/BrawndoActionItems.jsx:26`

### RP-02: report_only_wording

SOC OmniBot calls addressed Addressed (Readiness); inherited native options call the same code Implemented.

Impact: Possible confusion of readiness/implementation with independent operating assurance; actual comprehension not tested.
Disposition: Preserve existing mapping; visible wording change requires separate approval.

Source: `frontend/src/components/SocGuidedAssessor.jsx`, `frontend/src/components/PrestigeSocAssessment.jsx`

### RP-03: framework_source_assurance_gap

ISO inventory and working guide do not establish full normative-source completeness; authorized licensed comparison gaps remain documented.

Impact: Unqualified ISO source completeness/readiness not established.
Disposition: Retain current ISO reviewer disposition; obtain authorized normative material for pending comparisons without rewriting guidance under this mandate.

Source: `docs/framework-source-manifest.md`, `docs/iso-substantive-validation.md`

### RP-04: unsupported_capability_or_rule

No operational Backlog status/control found. Historical missed-occurrence backlog is sequential outstanding work, not an enabled unscheduled/unassigned Backlog state.

Impact: Cannot claim Backlog promotion coverage; cannot reinterpret needs_scheduling as approved backlog semantics.
Disposition: Not applicable unless a current approved source supplies such a feature; execute existing unscheduled/sequential catch-up behavior.

Source: `frontend/src/lib/schemas.js:47`, `frontend/src/lib/brawndoReviews.js:10`, `backend/review_occurrences.py:18`, `docs/cis-greenfield-24-month-qa.md:128`

### RP-05: unsupported_capability_or_rule

Review enums support none, monthly, quarterly, semiannual, annual and custom(days). Weekly can be custom7 only when configured. Continuous/event-driven are requirement/practice types, not native recurrence enums.

Impact: No periodic completion should be invented for continuous/event-driven practice.
Disposition: Exercise supported custom7 separately and existing state/event context using approved requirement meaning.

Source: `frontend/src/lib/schemas.js:47`, `backend/review_occurrences.py:5`, `frontend/src/lib/frameworks.js`

### RP-06: report_only_discoverability_and_untested_reporting

Existing `GET /api/reports/board` produces the Board Report PDF and an audit event; CSV registers and Audit Log export also exist. No visible Board Report control was found in the inspected current frontend, and `Dashboard.test.jsx` deliberately excludes that wording.

Impact: The report API is supported but unexecuted here. Its normal unaided UI entry/discoverability remains unverified; API success would not prove users can find the report.
Disposition: Exercise existing report generation and reconcile its source totals; trace any UI entry separately without adding a button or route. No full audit-package capability is inferred.

Source: `backend/server.py:4778`, `backend/server.py:4897`, `frontend/src/pages/Dashboard.test.jsx:21`, `frontend/src/pages/AdminAudit.jsx:36`, `frontend/src/pages/AdminAudit.jsx:190`

## Minimal uncovered checks

- Normal UI onboarding/default inventory on five distinct primary clients; authoritative IDs/configuration captured.
- At least one complete native/Omni exact-text/resume/replacement/stale scenario for each five primary configurations; definition and placement inventories separately tracked.
- Connected Review → evidence → Finding → multiple Actions → independent validation → native reassessment; counts/drilldowns reconcile for each applicable framework.
- Actual permitted Contributor/Reader tasks and wrong-client server responses; admin/Demo/mocked role evidence cannot close them.
- Actual human logout/login/pointer operation; preserve administrator session until readiness.
- Independent ten-year execution via actual service transitions, approved recurrences and yearly source reconciliation; source inspection cannot close it.
- Matching viewport/theme/fixture/role/route screenshots plus static-copy/source diff for each functional correction.

## Existing local harness boundaries

- `frontend/scripts/qa/operating-core.cjs`: Loopback-only Demo; roles/sessionStorage manipulated; external requests blocked. Interaction example only, not live authentication/authorization proof.
- `frontend/scripts/qa/framework-operator.cjs`: Loopback-only Demo; old generic drawer selectors and historical counts. Compare current approved shell before reuse.
- `frontend/scripts/qa/visual-preservation.cjs`: Historical gate allows named color-map/CSS changes prohibited now. Do not use unchanged as current freeze gate.

No product/CSS/static-copy change. No runtime defect reproduced. Source inspection does not establish functional readiness, unaided usability, actual authorization or hosted persistence.

## Reproducible freeze source capture

`scripts/platform-acceptance-freeze.cjs` captured 430 current immutable source files, 4,009 JSX/static-copy/accessibility tokens and 27,439 conservative source string/template segments. Its small extractor self-checks passed; baseline-to-baseline changes are zero. Styles, artwork, fonts and catalogs are hashed; JSX visible text/attributes and named copy/message properties are retained with source lines.

```text
node scripts/platform-acceptance-freeze.cjs --baseline 28b806716024ec149af2ec5da621a5a618c669d5 --candidate <exact-sha> --dependencies <existing-frontend-package-root> --out <candidate-report.json>
```

No install is needed. The already-installed parser used here was under the existing security-remediation-closeout frontend package root. The extractor is partial: dynamic/computed copy can be missed; conservative strings include non-visible technical/API keys and require diff review. It does not inspect backend static messages or replace matching deployed screenshots. Its nonzero exit flags frozen asset/catalog or visible-token changes, rather than claiming every other change preserves behavior. Do not overwrite the approved source baseline to accept a candidate.

Normal creation requires the actual Platform Owner role; provider administration alone cannot POST a new client. Role and allowed memberships remain server-authoritative.

Source inventory correction INV-CORRECTION-01: earlier RP-06 overclassified Board Report as unsupported. The existing API is now explicitly recorded; it is not a new tested result or UI discovery pass. No runtime change.
