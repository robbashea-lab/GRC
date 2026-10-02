# Shared SOC 2 practical guidance review

Content review date: 2026-10-02. Catalog version: `soc-guidance-v2`.

This review covers 38 individual criteria: 33 Security/Common Criteria, three Availability criteria, and two Confidentiality criteria. The practical content explains review, evidence, and satisfactory outcomes without changing the criterion identifiers, introducing a score, or representing an auditor opinion. Processing Integrity and Privacy remain outside this content rewrite.

## Source methodology

The following five user-provided workbooks were reviewed as practical reference material, not authoritative SOC 2 requirements:

| Short name used below | Workbook |
| --- | --- |
| Security | `SOC 2 Security TSC(20261002-131713).xlsx` |
| Availability | `SOC 2 Type2 Availability TSC(20261002-131734).xlsx` |
| Confidentiality | `SOC 2 Type 2 Confidentiality TSC(20261002-131729).xlsx` |
| Baseline | `SOC 2 Program Baseline Review (1).xlsx` |
| Consolidated | `SOC 2 (Security, Availability And Confidentiality Consolidated)(5).xlsx` |

The full relevant activity descriptions, evidence suggestions, desired outcomes, and cadence fields were considered. Broad program activities were split by their actual purpose rather than copied into every criterion named in a spreadsheet row. The baseline workbook's scope, system-boundary, system-description, and responsibility preparation informs shared program context; it is not an additional TSC control checklist.

Criterion meaning and mappings were checked individually against [AICPA's 2017 Trust Services Criteria with revised Points of Focus, 2022](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022), using its [published PDF](https://assets.ctfassets.net/rb9cdnjh59cm/5jT1narHNQNzt4JGlkd1gr/248661d08e42531329d147782a6f8854/Trust-services-criteria.pdf). The mappings below record the printed pages inspected. Introductory paragraphs .03–.07, pages 4–5, clarify the distinction between criteria, selected controls, and contextual Points of Focus. Paragraph .16, pages 9–10, informs the Type 2 distinction between design and operation over a period. Paragraphs .18–.19, page 11, inform the relationship to service commitments and system requirements.

The catalog uses authored summaries and explanatory guidance, not licensed verbatim reproduction or mechanically copied Points of Focus. The short practical `summary` is an editorial explanation, not a quotation. AICPA source references support the criterion meaning; workbook mappings support the adapted practical material. Neither source type predetermines a client's assessment conclusion.

System-description preparation remains separate program context. AICPA publishes separate [SOC 2 description criteria](https://www.aicpa-cima.com/resources/download/get-description-criteria-for-your-organizations-soc-2-r-report); its publication page was consulted, not reproduced as additional TSC control requirements.

### Overlap and source artifacts

- Corresponding substantive Consolidated rows match the standalone workbook text in their first four cells. Identical rows are one input, not independent corroboration.
- Consolidated Monthly rows 9 and 10 repeat only four unique cell values through column XFD. The repeated cells are spreadsheet artifacts, not additional activities.
- Confidentiality Event-Based row 3, covering changes in confidential-data handling, is absent from Consolidated. Its standalone content was still considered for CC8.1 and C1.1.
- `Lists` sheets contain dropdown values, not additional substantive activities. Weekly placeholder rows do not impose a control or exempt an organization from an adopted weekly obligation.

## Coverage and content structure

| Category | Criteria | Review bullets | Evidence alternatives | Outcome bullets | Operational bullets | Enhanced bullets |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Security/Common Criteria | 33 | 67 | 53 | 33 | 33 | 25 |
| Availability | 3 | 6 | 4 | 3 | 3 | 3 |
| Confidentiality | 2 | 4 | 3 | 2 | 2 | 1 |
| Total | 38 | 77 | 60 | 38 | 38 | 29 |

The established categories remain SOC 2 Criterion Requirements, Operational Practices, and Enhanced Assurance. Within the first category, practical content is organized as **What to review and confirm**, **Examples of supporting evidence**, and **What good looks like**. These prompts help assess the criterion; they are not additional official requirements. Operational and enhanced content addresses useful implementation or validation without duplicating the entire review checklist.

Enhanced Assurance is intentionally empty for CC1.3, CC2.3, CC3.1, CC3.3, CC5.1, CC5.2, CC6.4, CC6.5, and C1.1. Empty guidance is preferable to artificial symmetry. These categories are neither maturity levels nor three mandatory stages.

## Criterion-by-criterion source map

`A`, `Q`, `M`, and `E` denote the Annual, Quarterly, Monthly, and Event-Based sheets, followed by an exact row number. They are source locators, not prescribed review frequencies. Baseline row numbers refer to its `SOC 2 Program Baseline Review` sheet. Page numbers are the PDF's printed, one-based pages. Rows listed as inputs may contain broader material; the mapping decision states the portion used.

### CC1–CC5

For this table, Security and Consolidated share the same indicated sheet/row numbers.

| Criterion | Security and Consolidated rows | Baseline rows | AICPA pages | Mapping decision |
| --- | --- | --- | --- | --- |
| CC1.1 | A3, A7 | 5 | 14–15 | Conduct expectations and management response. Governance ownership belongs primarily in CC1.3/CC1.5; a handbook is an evidence alternative, not proof of ethical behavior or a mandatory title. |
| CC1.2 | Q4 | 4 | 15–16, including footnote 15 | Meaningful oversight and challenge, not merely receipt of reports. Small-entity governance nuance is retained without imposing a fixed board composition. |
| CC1.3 | A7, A8, A16 | 4 | 16–17 | Roles, reporting, authority, and provider handoffs; separate from actual accountability under CC1.5. |
| CC1.4 | A9, A18 | 16 | 17–18 | Skills and capacity, including provider capability. Generic awareness completion does not establish competence for specialized work. |
| CC1.5 | A7; Q17 | 4 | 18–19 | Performance of responsibilities and response to missed work; assigning an owner alone does not demonstrate accountability. |
| CC2.1 | A11; Q5 | 3, 8, 17 | 19–20 | Information quality, source, scope, and information actually used in reviews. An evidence repository is not itself the outcome. |
| CC2.2 | A3, A17, A18; Q5 | 3, 5, 14, 16 | 21–22 | Internal communication of responsibilities, changes, and reporting routes. Acknowledgements are examined when adopted, not universally required. |
| CC2.3 | A10, A16 | 3, 14, 15, 30, 31 | 22–24 | Incoming and outgoing communication and shared responsibilities. Confidentiality commitments apply according to scope and actual obligations. |
| CC3.1 | A12 | 3, 6 | 24–27 | Objectives sufficiently clear for risk assessment. System description and scope supply context, not a substitute for the outcome. |
| CC3.2 | A5, A13 | 6, 15 | 27–28 | Environment-specific risk analysis and dependencies. Register format and scoring method remain organization-defined. |
| CC3.3 | A14 | 6 | 28–29 | Deliberate misuse and fraud. Accidental-error lists or vulnerability scans alone do not address intentional abuse. |
| CC3.4 | Q13 | 3, 6, 15 | 29–30 | Significant business, provider, leadership, technology, and threat changes; not merely the technical approvals in CC8.1. |
| CC4.1 | A2, A11; Q4, Q5, Q17, Q18; E3 | 12, 14, 17 | 30–31 | Evaluation of whether controls work. Security-event monitoring can inform this but does not replace it; provider reports are an evidence alternative. |
| CC4.2 | Q18; E3 | 17 | 31 | Evaluate and communicate deficiencies and assess correction. An Action, exception, or risk acceptance cannot automatically satisfy the affected outcome. |
| CC5.1 | A3, A7, A13; Q17 | 4, 6 | 31–32 | Control selection and risk reduction. Communications/training map primarily to CC2.2/CC1.4, not automatically to CC5.1. |
| CC5.2 | A3; Q17 | 4, 7, 9, 13, 15 | 32–33 | Technology dependencies and supporting controls, without duplicating detailed access, operations, and change criteria. |
| CC5.3 | A3; Q5, Q17 | 4, 5, 17 | 33–34 | Policies deployed through usable procedures and actual execution. Documents alone do not demonstrate operation across a Type 2 period. |

### CC6–CC9

Unless separately listed, Security rows have identical Consolidated counterparts.

| Criterion | Primary workbook inputs | Consolidated equivalents | Baseline rows | AICPA pages | Mapping decision |
| --- | --- | --- | --- | --- | --- |
| CC6.1 | Security A4; Q9–12, Q14–16 | Same Security rows | 3, 7, 9 | 34–35 | Asset/access coverage, authentication, service credentials, and keys. Examine MFA/encryption when selected or needed for commitments; no universal product mandate. |
| CC6.2 | Security Q2, Q6, Q11, Q19 | Same Security rows | 9 | 36 | Authorization and credential lifecycle for client-administered users, including provider handoffs. Privilege suitability is separately emphasized in CC6.3. |
| CC6.3 | Security Q2, Q6, Q11, Q19 | Same Security rows | 9 | 36–37 | Effective permissions, role changes, least privilege, and incompatible access. Removes the spreadsheet's CC6.5 attribution for privileged/shared accounts. |
| CC6.4 | Security Q3, Q19 | Same Security rows | 10 | 37 | Physical restrictions and removals. Evaluate outsourced responsibility and assurance; cloud use alone does not establish non-applicability. |
| CC6.5 | Security A15, disposal portion | A15, disposal portion | 8, 10 | 37–38 | Sanitization and custody before physical assets leave protection. Security Q10's credential/secret content is remapped to CC6.1. |
| CC6.6 | Security A4; Q9, Q14, Q21 | Same Security rows | 3, 9 | 38 | External access paths and boundary protection. Ordinary user lifecycle under Q19 alone is insufficient. Workbook boundary content is limited; the draft narrows its examples to the verified purpose. |
| CC6.7 | Security A15; Confidentiality Q4 | A15; Q24 | 8, 28 | 38–39 | Authorized transfer and movement. Disposal is separated into CC6.5 or C1.2 where applicable. No blanket DLP product requirement. |
| CC6.8 | Security M6; Q15–16 | Same Security rows | 7 | 39 | Software restrictions, protection health, and action on detections; installed agents or subscriptions alone do not establish operation. |
| CC7.1 | Security Q12, Q14–16; M2, M5 | Same Security rows | 7, 11 | 40 | Vulnerability discovery, configuration drift, coverage, and follow-through. Patch/retest examples do not impose a universal deadline. |
| CC7.2 | Security M3, M7; Q15 | Same Security rows | 12 | 40–41 | Monitoring coverage, tool health, anomaly analysis, and client/provider handoffs. Monthly summaries do not replace actual monitoring obligations. |
| CC7.3 | Security M3, M7 | Same Security rows | 12, 14 | 41–42 | Event-to-incident evaluation, impact, escalation, and supported closure; distinct from collecting logs or full response execution. |
| CC7.4 | Security A6; M7; E2–3 | Same Security rows | 14 | 42–44 | Execution of the response program. Exercises are labeled simulated; actual response is not inferred from a plan. |
| CC7.5 | Security A6; M4; E3 | Same Security rows | 18 | 44–45 | Recovery remains relevant to Security-only scope. Examine backups where relied upon; successful jobs are not proof of recovery. |
| CC8.1 | Security Q14, Q20–21; Confidentiality E3 | Security same rows; no Confidentiality E3 counterpart | 13 | 45–47 | Change lifecycle includes data, procedures, and provider changes. Emergency handling is not a universal exemption from authorization/testing. |
| CC9.1 | Security A13; Q7, Q18 | Same Security rows | 6, 18, 21, 24 | 47–48 | Narrows generic risk-treatment material to disruption risk. Security-only clients retain relevant continuity considerations; no mandated insurance or document title. |
| CC9.2 | Security A2, A5, A16; Q8; Confidentiality Q5; Availability A4 | A2, A5, A16, A25; Q8, Q25 | 15, 24, 31 | 48–50 | Relevant provider risk, assurance applicability, and customer-side responsibilities. No particular report/questionnaire is universally required or sufficient. |

### Availability and Confidentiality

| Criterion | Primary workbook inputs | Consolidated equivalents | Baseline rows | AICPA pages | Mapping decision |
| --- | --- | --- | --- | --- | --- |
| A1.1 | Availability Q3; M3; A4; Q2 capacity context | Q27; M10; A25; Q26 capacity context | 19, 23, 24 | 50 | Corrects the workbook's A1.2 capacity attribution. Commitments inform targets; uptime reporting alone is not capacity assessment. |
| A1.2 | Availability Q4–5; M2; A4; E2 | Q28–29; M9; A25; E5 | 20, 22, 24 | 50–51 | Environmental safeguards, backup operation, and recovery infrastructure. Adds environmental context omitted by the workbook's service-health emphasis. |
| A1.3 | Availability A3; E3 | A24; E6 | 20–21 | 52 | Recovery procedure testing. Actual recovery events are not automatically a substitute; no universal test interval or recovery target. |
| C1.1 | Confidentiality A2–5; Q2 retention portion; E3 | A19–22; Q22 retention portion; no Confidentiality E3 counterpart | 25–26, 29–30 | 52 | Identification, retention, and preservation. Access, encryption, transfers, vendor oversight, and response connect to relevant Common Criteria rather than being repeated wholesale. |
| C1.2 | Confidentiality Q2 disposal portion; A4–5 disposal context | Q22 disposal portion; A21–22 disposal context | 29–31 | 52–53 | Disposal, retained copies, and provider execution. Masking, access revocation, or DLP monitoring alone does not demonstrate deletion. |

## Substantive corrections to the reference material

1. **Frequency and document prescriptions:** Annual, quarterly, monthly, and weekly workbook labels are not universal SOC 2 mandates. Policy names, acknowledgements, evidence formats, report types, and products are examples. Once the organization adopts a control or needs it for a commitment, its timing and execution remain assessment obligations regardless of guidance category.
2. **Broad program checklists:** Security Annual 3's policy list is divided by purpose, with policy-to-procedure operation primarily in CC5.3, conduct in CC1.1, and internal communication in CC2.2. Annual 7 governance ownership does not itself establish ethical behavior, accountability, or sound control selection.
3. **Objectives and baseline readiness:** Security Annual 12 and Baseline row 3 inform system context, while CC3.1 assesses clarity of objectives. System-description preparation is not invented as a mandatory artifact under each related criterion.
4. **Communication and competence:** Security Annual 17's acknowledgement expectations are conditional on the chosen controls. Annual 18's training completion does not alone demonstrate role-specific competence. CC1.2 retains real oversight and challenge while recognizing the AICPA small-entity governance context.
5. **Evidence and closure:** Security Quarterly 17's evidence-collection framing is replaced with what records should demonstrate. Quarterly 18's remediation-or-risk-acceptance wording does not create automatic satisfaction of an unmet outcome. Opening an Action, recording an exception, or accepting risk is not proof of effective operation.
6. **Capacity attribution:** Availability Q3/M3 and Consolidated Q27/M10 incorrectly emphasize A1.2 for capacity. Capacity is addressed in A1.1. Availability commitments and general uptime reports are context, not substitutes for evaluating capacity against demand.
7. **CC6.5 attribution:** Security and Consolidated Q6/Q10/Q11 map privileged, shared-account, or secret management to CC6.5. Those topics belong under CC6.1–CC6.3 according to purpose. CC6.5 addresses sanitizing physical assets before protection ends.
8. **Movement versus disposal:** Security Annual 15 combines transfer, storage, retention, and disposal under CC6.7. Movement authorization/protection remains there; physical sanitization belongs in CC6.5, and confidential-information disposal in C1.2 when configured.
9. **Confidentiality overmapping:** Nearly every Confidentiality row names both C1.1 and C1.2. The rewrite does not treat C1.2 as a general encryption, sharing, incident, or vendor criterion. These activities map to Common Criteria by purpose; C1.1 and C1.2 keep their distinct focus.
10. **Security recovery and disruption:** Baseline rows 20–24's conditional Availability label does not remove Security-relevant recovery and disruption mitigations in CC7.5/CC9.1. Security A6/M4 and Baseline row 18 continue to inform Security-only guidance.
11. **Recovery evidence:** Availability Event-Based row 3 / Consolidated E6 describes actual recovery, not necessarily planned recovery testing. A written plan or successful backup job is not equivalent to testing recovery procedures. Environmental safeguards are included in A1.2 rather than letting generic service-health content displace them.
12. **Provider reliance:** Vendor reports, bridge letters, and questionnaires are alternatives, not mandatory or self-proving artifacts. Where used, assess scope, period, findings, and customer responsibilities. An MSP/MSSP's involvement does not establish that a control operated or that the client fulfilled its retained duties.

## Shared data, provenance, and preservation

The authoritative guidance source is `shared/catalogs/operatorGuidance/socAssessmentGuidance.json`, keyed by stable criterion IDs. Content is framework-owned, not client-owned. The existing scope configuration determines which category-specific criteria a client receives; onboarding is not needed to refresh shared guidance.

The catalog declares `version: "soc-guidance-v2"`, `framework: "soc-2"`, source metadata, the existing tier definitions, shared `context`, and `legacy_items_version: "soc-guidance-v1"`. Each criterion retains its source reference and page, existing review note, and original `items`; the new practical presentation is stored in `criteria[id].practical`:

| Field | Shape | `practical_provenance` classification | Presentation |
| --- | --- | --- | --- |
| `summary` | String | `criterion_summary` | Short authored explanation |
| `review` | String array | `assessment_guidance` | What to review and confirm |
| `evidence` | String array | `evidence_examples` | Examples of supporting evidence |
| `outcome` | String array | `assessment_guidance` | What good looks like |
| `operational` | String array | `operational_guidance` | Operational Practices |
| `enhanced` | String array, possibly empty | `enhanced_assurance` | Enhanced Assurance when meaningful |

The existing v1 checkbox item IDs, text, tier assignments, and per-item source provenance are retained rather than relabeling a previously selected generic item as an official requirement. Existing `soc_assessment_checks` responses remain associated with those definitions. New readable guidance is not a replacement set of checkbox identifiers and requires no destructive response migration.

The content/presentation update does not reinterpret stored narratives, implementation status, verification, evidence, links, assignments, scope choices, or historical assessment snapshots. Guidance categories and their completion are not readiness scores, maturity levels, automatic conclusions, or auditor opinions. Existing historical checklist information remains distinct from the new guidance text; changing the catalog does not claim to revise a past assessment.

## Interpretation boundaries and uncertainty

- The UI retains **Internal readiness, not an auditor opinion.** The reviewer evaluates client facts rather than receiving an automated conclusion from the guidance.
- Criterion outcome, selected controls, commitments, suggested methods, and organization-defined frequencies are separate concepts. An Operational or Enhanced label does not make an adopted control optional.
- Type 2 readiness distinguishes a documented design from consistent operation through the review period. Relevant dated records, completion history, exceptions, and follow-up can support this assessment. A current policy or screenshot alone does not establish historical operating effectiveness; a simulation is not an actual incident record.
- Evidence bullets are alternatives, not a requirement to supply every artifact or use a particular format. They explain what records should demonstrate and do not instruct users to upload documents.
- The workbooks do not establish any client's actual obligations, controls, provider arrangements, system population, retention periods, or review/test frequency. Those remain facts to determine. No universal sample sizes, observation-period lengths, or automatic auditor conclusions are supplied.
- AICPA material supported a criterion-specific treatment for every targeted ID. CC6.6's workbook coverage is limited and A1.2's environmental emphasis is sparse; both were corrected using their verified purpose instead of inventing additional checklist requirements. Points of Focus are contextual guidance, not individually mandatory controls.
- This content review is not independent audit assurance or a production-readiness determination.

## Implementation verification

Work started from GitHub main `3dbdb9da60ceb4c2d27a7c7ffa3a42f88aada960`, including the concurrent CIS practical guidance and visual-consistency work. No dependencies, authorization rules, backend persistence logic, readiness calculations, or other-framework components were changed.

- Frontend: 8 suites / 148 tests passed. The focused run included `PrestigeSocAssessment`, `socPracticalGuidance`, `newSocClient`, `assessmentVerification`, `prestigeWorkflowIntegrity`, `socFramework`, `BrawndoCisAssessment`, and `cisAssessmentGuidance` with CRACO/Jest (`CI=true`, `--watchAll=false --runInBand`). Tests cover all 38 rendered criteria, source classifications, hidden empty tiers, unchanged legacy item definitions, response retention, manual conclusions, failed-save navigation, shared clients, and Processing Integrity/Privacy fallback.
- Backend: `python -m pytest backend/tests/test_assessment_verification.py backend/tests/test_soc_framework.py backend/tests/test_framework_governance.py backend/tests/test_iso_framework.py -q` passed 55 tests plus 24 subtests. Eight FastAPI lifespan deprecation warnings remain; no backend files were changed.
- Demo build: `node frontend/scripts/preview.cjs build` compiled successfully. The existing bundle-size advisory remains; this task did not attempt a performance refactor.
- Browser: `node scripts/qa/soc-guidance.cjs` from `frontend`, using the available Playwright runtime and installed Edge against loopback port 4181, passed all four requested scenarios: Prestige, newly onboarded Security-only, newly onboarded Security/Availability/Confidentiality, and an existing disposable ISO client subsequently enabling SOC 2. All records were isolated synthetic Demo session data.
- The browser run inspected every targeted criterion, preserved previous checked responses and a pre-existing directly linked evidence record, saved/reloaded narratives and manual conclusions, appended history without changing prior snapshots, exercised Save & Next, and checked category deselection/re-enablement without deleting records. A linked Finding's evidence upload, download, and metadata after reload were also verified. Creating its Action did not change assessment conclusions. Existing ISO assessments remained identical when SOC 2 was enabled.
- Light/dark screenshots and overflow assertions covered 1440, 1280, 1024, and 768 pixels. Representative screenshots were visually inspected. Breadcrumbs, Escape, focus return, empty Enhanced sections, and zero browser console/page errors were checked.
- `git diff --check` and `node --check frontend/scripts/qa/soc-guidance.cjs` passed. Two browser-selector assumptions were corrected to match existing behavior: the onboarding label is “SOC 2 Type 2”, and the navigator retains its previous group until its root breadcrumb is selected. No application behavior was changed to satisfy those tests.

The browser run validates the static Demo implementation, not real authentication or persistent FastAPI/Mongo operation. The focused backend tests complement it but are not a full production end-to-end test. Merge and publication identifiers are recorded in the delivery handoff rather than predicted here.
