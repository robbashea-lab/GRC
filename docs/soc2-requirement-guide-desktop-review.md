# SOC 2 Requirement guide and desktop workspace

Reviewed 2026-10-02 against current GitHub main `88b663fe2e14c70c2829a81ab9c433fc29353276` (PR 19 approved CIS layout). Shared content revisions: `soc-requirement-guide-v1`, `soc-guidance-v3`.

## Catalog inventory and source boundary

The catalog contains 61 assessable Trust Services Criteria: 33 Common Criteria, 3 Availability, 2 Confidentiality, 5 Processing Integrity, and 18 Privacy. These are the assessment records. The 129 retained v1 checklist definitions are supporting criterion/Point-of-Focus interpretations, operational guidance, or enhanced assurance, not another 129 official controls or assessment records.

Each criterion has five individually authored static answers in `shared/catalogs/operatorGuidance/socRequirementGuide.json`. Classification is operational_guidance; the criterion's ID is the stable mapping key. Framework version is unchanged: 2017 TSC with revised Points of Focus (2022). The guide contains no assessment state, narrative analysis, network requests, draft generation, scores, or auditor conclusions.

Source checked: [AICPA publication](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) and its [75-page TSC document](https://assets.ctfassets.net/rb9cdnjh59cm/5jT1narHNQNzt4JGlkd1gr/248661d08e42531329d147782a6f8854/Trust-services-criteria.pdf). Page references below use printed page numbers. Paragraphs .03-.07 describe application and Points of Focus; .14-.15 address category combinations; .16 distinguishes Type 1/Type 2; .18-.19 connect objectives with commitments and system requirements. Criterion-specific rows and applicable interpretive context informed each answer.

No license granting this product verbatim redistribution was found. The UI uses authored summaries and a supported AICPA reference, keeping official wording conditional on the existing authorized-text mechanism. It does not label generated text official. Points of Focus inform meaning but are not mechanically promoted to independently mandatory controls.

## Substantive content decisions

- Preserve the 38 reviewed CC/A/C practical entries, without unnecessary rewriting. Add source-checked practical summaries and review/evidence/outcome/operational guidance for the 23 PI/Privacy records that previously fell back to unreviewed generic text.
- CC1.1: no mandatory policy title; ethical commitment and actual conduct follow-through matter.
- CC1.2: governance objectivity is contextual, including the source's small-entity governance qualification; do not require a particular board structure.
- CC6.2 vs CC6.3: registration/removal of credentials vs role-based entitlement changes are different purposes.
- CC6.5 vs C1.2 vs P4.3: protection before retiring physical assets, confidential-information disposal, and personal-information disposal are not interchangeable mappings.
- CC7.2 vs CC7.3: identify/analyze anomalies, then evaluate security events and their effect. CC7.4 response and CC7.5 recovery remain distinct.
- CC7.5/CC9.1: relevant incident recovery and disruption mitigation remain within Common Criteria even if Availability is not selected. A1.2 protection/backup infrastructure and A1.3 recovery testing address availability objectives, not a universal backup checklist.
- PI1.1 specifications; PI1.2 inputs; PI1.3 execution; PI1.4 outputs/delivery; PI1.5 storage: no blanket program checklist copied to all five.
- P3.2: required explicit consent precedes collection; refusal consequences matter.
- P6.1: do not weaken the criterion's explicit-consent-before-disclosure outcome into a generic lawful-basis statement. The source includes interpretive consent context; applicable legal constraints require the privacy owner to evaluate actual facts, not a blanket product exception.
- P6.3 concerns recording unauthorized disclosures; CC7 incident handling and P6.6 notification have separate purposes.
- P6.4 requires periodic/as-needed evaluation in the criterion itself, but no annual/quarterly/monthly number is universally prescribed.
- P6.7 accounting covers information held AND disclosures, not just incident/sharing logs.
- P1.1 notice ownership depends on controller/processor circumstances (source footnote 21); no assumption that an MSP owns client notices.
- Evidence examples are alternatives, not upload requirements. Review frequencies depend on risk, commitments, and adopted controls. Type 2 operation needs dated history, exceptions, and follow-through across the selected period; no universal period or sample size.
- Enhanced Assurance is omitted when additional material is not useful (including P3.2/P6.3). All categories remain suggestions except where activities are adopted controls or needed for commitments. A Finding, Action, or risk acceptance does not change assessment status automatically.
- Original spreadsheet corrections and CC/A/C provenance remain in the earlier SOC practical-guidance review notes; this task adds a source-checked guide rather than treating spreadsheets as authoritative.

## Criterion-by-criterion coverage

R/E/O counts are review, evidence, and outcome bullets; Op/EA are the two additional guidance categories. All five guide answers were checked for criterion-specific meaning, provider/client boundaries, relevant evidence alternatives, concrete gaps, and unsupported prescriptions. No category is enabled merely by catalog coverage.

| Criterion | AICPA page | Guide answers | R/E/O | Op | EA | Authored outcome summary |
| --- | ---: | --- | --- | ---: | ---: | --- |
| CC1.1 | 14 | 5 / 5 | 2/2/1 | 1 | 1 | Demonstrate integrity and ethical conduct in practice. |
| CC1.2 | 15 | 5 / 5 | 2/2/1 | 1 | 1 | Governance provides independent oversight of the control environment. |
| CC1.3 | 16 | 5 / 5 | 2/1/1 | 1 | 0 | Assign structure, authority, and responsibilities that support objectives. |
| CC1.4 | 17 | 5 / 5 | 2/2/1 | 1 | 1 | Develop and retain people capable of meeting control responsibilities. |
| CC1.5 | 18 | 5 / 5 | 2/1/1 | 1 | 1 | Hold people accountable for their control responsibilities. |
| CC2.1 | 19 | 5 / 5 | 2/2/1 | 1 | 1 | Use reliable, relevant information to support controls. |
| CC2.2 | 21 | 5 / 5 | 2/2/1 | 1 | 1 | Communicate internally so people can carry out controls. |
| CC2.3 | 22 | 5 / 5 | 2/2/1 | 1 | 0 | Exchange control-relevant information with external parties. |
| CC3.1 | 24 | 5 / 5 | 2/1/1 | 1 | 0 | Define objectives clearly enough to assess related risks. |
| CC3.2 | 27 | 5 / 5 | 2/2/1 | 1 | 1 | Identify and analyze risks that could prevent achieving objectives. |
| CC3.3 | 28 | 5 / 5 | 2/1/1 | 1 | 0 | Consider fraud when assessing risks to objectives. |
| CC3.4 | 29 | 5 / 5 | 2/1/1 | 1 | 1 | Assess changes that could materially affect controls. |
| CC4.1 | 30 | 5 / 5 | 2/2/1 | 1 | 1 | Evaluate whether controls are present and working. |
| CC4.2 | 31 | 5 / 5 | 2/1/1 | 1 | 1 | Evaluate control deficiencies and communicate them for corrective action. |
| CC5.1 | 31 | 5 / 5 | 2/1/1 | 1 | 0 | Select controls that reduce risks to acceptable levels. |
| CC5.2 | 32 | 5 / 5 | 2/1/1 | 1 | 0 | Technology controls support the organization's objectives. |
| CC5.3 | 33 | 5 / 5 | 2/2/1 | 1 | 1 | Turn policy expectations into operating control procedures. |
| CC6.1 | 34 | 5 / 5 | 2/2/1 | 1 | 1 | Protect information assets through logical access safeguards. |
| CC6.2 | 36 | 5 / 5 | 2/2/1 | 1 | 1 | Authorize credentials before granting access; revoke obsolete credentials. |
| CC6.3 | 36 | 5 / 5 | 2/2/1 | 1 | 1 | Keep permissions aligned with roles and appropriate separation. |
| CC6.4 | 37 | 5 / 5 | 2/1/1 | 1 | 0 | Limit physical access to authorized people. |
| CC6.5 | 37 | 5 / 5 | 2/1/1 | 1 | 0 | Sanitize retired assets before releasing their protections. |
| CC6.6 | 38 | 5 / 5 | 2/2/1 | 1 | 1 | Protect system boundaries against externally originating threats. |
| CC6.7 | 38 | 5 / 5 | 2/2/1 | 1 | 1 | Authorize and protect information as it moves. |
| CC6.8 | 39 | 5 / 5 | 2/2/1 | 1 | 1 | Prevent or detect and address unauthorized or malicious software. |
| CC7.1 | 40 | 5 / 5 | 2/2/1 | 1 | 1 | Find new vulnerabilities and vulnerability-producing configuration changes. |
| CC7.2 | 40 | 5 / 5 | 2/2/1 | 1 | 1 | Detect anomalies and determine whether they are security events. |
| CC7.3 | 41 | 5 / 5 | 2/1/1 | 1 | 1 | Evaluate security events and act on incident impact. |
| CC7.4 | 42 | 5 / 5 | 2/2/1 | 1 | 1 | Execute a defined response to identified security incidents. |
| CC7.5 | 44 | 5 / 5 | 2/1/1 | 1 | 1 | Restore operations following security incidents. |
| CC8.1 | 45 | 5 / 5 | 2/2/1 | 1 | 1 | Control changes through authorization, testing, approval, and implementation. |
| CC9.1 | 47 | 5 / 5 | 2/1/1 | 1 | 1 | Develop mitigations for potential business disruption. |
| CC9.2 | 48 | 5 / 5 | 3/2/1 | 1 | 1 | Assess and manage risks from vendors and partners. |
| A1.1 | 50 | 5 / 5 | 2/1/1 | 1 | 1 | Manage system capacity against demand. |
| A1.2 | 50 | 5 / 5 | 2/2/1 | 1 | 1 | Operate environmental, backup, and recovery protections. |
| A1.3 | 52 | 5 / 5 | 2/1/1 | 1 | 1 | Test recovery procedures against recovery objectives. |
| C1.1 | 52 | 5 / 5 | 2/2/1 | 1 | 0 | Identify and maintain information designated confidential. |
| C1.2 | 52 | 5 / 5 | 2/1/1 | 1 | 1 | Dispose of confidential information appropriately. |
| PI1.1 | 53 | 5 / 5 | 1/1/1 | 1 | 1 | Define and communicate the information and processing specifications needed to meet processing objectives. |
| PI1.2 | 54 | 5 / 5 | 1/1/1 | 1 | 1 | Process inputs consistently with defined requirements for completeness and accuracy. |
| PI1.3 | 54 | 5 / 5 | 1/1/1 | 1 | 1 | Execute processing according to specifications and address processing errors. |
| PI1.4 | 55 | 5 / 5 | 1/1/1 | 1 | 1 | Deliver complete, accurate, and timely outputs to intended recipients according to specifications. |
| PI1.5 | 56 | 5 / 5 | 1/1/1 | 1 | 1 | Preserve inputs, in-process data, and outputs in storage according to processing specifications. |
| P1.1 | 57 | 5 / 5 | 1/1/1 | 1 | 1 | Give notice of privacy practices and update affected people when those practices change. |
| P2.1 | 58 | 5 / 5 | 1/1/1 | 1 | 1 | Communicate privacy choices and consequences and handle consent consistently with privacy objectives. |
| P3.1 | 59 | 5 / 5 | 1/1/1 | 1 | 1 | Collect personal information consistently with privacy objectives. |
| P3.2 | 60 | 5 / 5 | 1/1/1 | 1 | 0 | Obtain required explicit consent before collection and explain the consequences of refusal. |
| P4.1 | 60 | 5 / 5 | 1/1/1 | 1 | 1 | Use personal information for identified purposes consistent with privacy objectives. |
| P4.2 | 60 | 5 / 5 | 1/1/1 | 1 | 1 | Retain personal information consistently with privacy purposes and applicable obligations. |
| P4.3 | 61 | 5 / 5 | 1/1/1 | 1 | 1 | Dispose of personal information securely when retention purposes end. |
| P5.1 | 61 | 5 / 5 | 1/1/1 | 1 | 1 | Provide authenticated individuals appropriate access to their personal information and explain applicable denials. |
| P5.2 | 62 | 5 / 5 | 1/1/1 | 1 | 1 | Handle corrections or amendments to personal information and communicate appropriate changes or denials. |
| P6.1 | 63 | 5 / 5 | 1/1/1 | 1 | 1 | Obtain explicit consent before third-party disclosure of personal information in accordance with privacy objectives. |
| P6.2 | 63 | 5 / 5 | 1/1/1 | 1 | 1 | Maintain complete, accurate, and timely records of authorized personal-information disclosures. |
| P6.3 | 64 | 5 / 5 | 1/1/1 | 1 | 0 | Record detected or reported unauthorized personal-information disclosures accurately and promptly. |
| P6.4 | 64 | 5 / 5 | 1/1/1 | 1 | 1 | Obtain appropriate third-party privacy commitments, evaluate them periodically and as needed, and address failures. |
| P6.5 | 65 | 5 / 5 | 1/1/1 | 1 | 1 | Require provider reporting of actual or suspected unauthorized disclosures and act on the reports. |
| P6.6 | 65 | 5 / 5 | 1/1/1 | 1 | 1 | Notify affected people, regulators, and others of breaches or incidents according to privacy objectives and applicable obligations. |
| P6.7 | 65 | 5 / 5 | 1/1/1 | 1 | 1 | Provide a requested accounting of personal information held and its disclosures. |
| P7.1 | 66 | 5 / 5 | 1/1/1 | 1 | 1 | Keep personal information accurate, current, complete, and relevant for its intended use. |
| P8.1 | 66 | 5 / 5 | 1/1/1 | 1 | 1 | Address and communicate privacy complaint resolutions, monitor privacy objectives, and correct identified deficiencies. |

## Presentation and data preservation

The guide is collapsed by default above the criterion and keyed to client + criterion, resetting disclosure and selection during navigation. Shared question UI is extracted from the approved CIS component; its wrapper retains identical CIS content, labels, behavior, and styling. SOC owns its own versioned answers and scoped layout styles.

On wide screens, review/evidence/outcome use three readable columns; Implementation Status sits beside Current Implementation. Findings and Raise Finding follow the narrative; existing related records, evidence links, history, breadcrumbs, footer actions, draft guards, and focus behavior remain. Narrow screens stack at the existing approved breakpoints.

No backend, catalog scope, metrics, authorization, assignment, recurrence, lifecycle, migration, or schema changes. No assessment data is rewritten. All 129 legacy checkbox definitions retain exact IDs/text/provenance, verified with their existing SHA-256 golden hash. Unknown historical IDs remain visible. New PI/Privacy entries create no new checkbox response values.

Existing framework configuration already selects the SOC workspace for all SOC clients in Demo and standard mode, with an explicit record/client guard. No Prestige-only gate needed removal; no client data or names are embedded in the guide. New and later-enabled clients receive the same source automatically.

## Verification

Initial focused checks: 120 frontend tests passed in 4 suites. Broader CIS/ISO/framework regressions: 104 tests and one snapshot passed in 10 suites. SOC backend isolated harness: 10 tests passed (including source authorization and configured scope retention). Preview build passed, with the existing large-bundle advisory and Node/dependency deprecation notices.

The framework-governance backend harness also passed 15 tests covering concurrency, assessment history, replay-safe Finding/Action creation, linked evidence, and tenant boundaries (25 backend tests total).

Browser checks used the isolated localhost Demo, not production records. Prestige retained its existing scope, narratives, and readiness metrics. A newly onboarded Security-only test client received 33 blank assessments; enabling all five categories exposed all 61 with the same shared guide. A separate general-GRC test client subsequently enabled SOC 2 and received the same Security workspace without copying Prestige records or the other test client's Finding.

Verified guide expansion/question selection, clean-close without draft creation, question/disclosure reset on criterion navigation, keyboard access and focus return, narrative edits, N/A validation failure with retained draft, Keep editing, successful retry, Save & next, reopen, assessment history, Finding/Action creation and originating-record navigation. Findings did not automatically change implementation or verification. Representative CC, A, C, PI, and Privacy criteria rendered; P3.2's empty Enhanced Assurance section was absent. Linked-record/evidence preservation is covered by component and backend tests; a real persistent-backend evidence download was not browser-verified.

Wide light-mode and narrow/wide dark-mode visual checks included settled 1440, 1280, 1024, 768, and 480 pixel viewports. Guidance columns and implementation fields stacked at their breakpoints, with readable labels and no settled horizontal overflow. Brawndo CIS retained its approved guide and native fields; Dunder ISO retained its native workspace without SOC guidance. No browser console errors were observed. The localhost Demo validates UI and Demo persistence only, not live authentication or Mongo persistence. Network-failure/replay behavior was tested in the isolated component/backend harnesses; the browser failure case was validation, not a simulated outage.

Release uses the normal GitHub PR/merge workflow and the existing owner-private static ChatGPT Site. Deployment metadata supplies the final merge/source SHA and Site version; production backend/data are not deployed by this task.

