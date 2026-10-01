# SOC 2 content-quality and criteria-coverage review

Date: 2026-10-01
Scope: Security / Common Criteria, Availability, and Confidentiality
Branch: `codex/soc2-content-qa`
Base: `main` at `fc02c0b42bbe0ee3f6de471499d87381c0284808`

This is an Omnisciente readiness-content review, not an audit opinion, certification, legal conclusion, or claim that any client control is effective.

## A. Authoritative sources used

- AICPA/ASEC, [2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy (With Revised Points of Focus — 2022)](https://assets.ctfassets.net/rb9cdnjh59cm/5jT1narHNQNzt4JGlkd1gr/248661d08e42531329d147782a6f8854/Trust-services-criteria.pdf), accessed from the [AICPA resource page](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) on 2026-10-01.
- AICPA, [System and Organization Controls: SOC Suite of Services](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services), for the relationship between Trust Services Criteria and SOC services.
- Existing repository research and operating records: `docs/soc2-research.md`, `docs/soc2-implementation.md`, `docs/soc-substantive-validation.md`, `docs/framework-public-source-baseline.md`, and `docs/framework-operational-final-report.md`.

The AICPA-hosted revised-2022 PDF was available during this review. Omnisciente does not reproduce its criterion or points-of-focus text. The application continues to present a reference link plus separately labelled Omnisciente explanation, assessment guidance, and evidence examples. Points of focus informed the review but were not converted into mandatory standalone controls.

## B. Current SOC 2 coverage

| Category | Expected | Present | Duplicates | Result |
| --- | ---: | ---: | ---: | --- |
| Security / Common Criteria | 33 | 33 | 0 | Complete for CC1.1–CC9.2 |
| Availability | 3 | 3 | 0 | Complete for A1.1–A1.3 |
| Confidentiality | 2 | 2 | 0 | Complete for C1.1–C1.2 |
| Total reviewed | 38 | 38 | 0 | Complete for the requested scope |

Processing Integrity and Privacy remain in the catalog but were not changed or substantively reviewed in this task.

The existing client implementation, owner, notes, linked Evidence, management Controls, history and related-record workflows remain intact. The SOC-specific assessment labels remain `Not Assessed`, `Partially Addressed`, `Addressed (Readiness)`, `Needs Remediation / Validation`, and `Not Applicable`; no status automatically changes because a policy, Review, Evidence item, Finding or Action exists.

## C. Missing / incorrect criteria

No missing, duplicate, incorrectly categorized, or malformed in-scope criterion IDs were found. Existing short titles are Omnisciente-authored navigation labels rather than claimed AICPA text. No title was sufficiently misleading to justify changing persisted catalog identity.

The material content defect was generic assessment guidance: all in-scope criteria previously fell back to one group-level instruction and did not tell a Security Program Manager what to evaluate for that specific criterion.

## D. Criterion content corrections

All 38 in-scope criteria now have a distinct Omnisciente explanation, criterion-specific assessment guidance, and criterion-specific evidence examples. The table records the completed criterion-by-criterion review and the principal evaluation focus; it does not reproduce official text.

| Criterion | Existing Omnisciente title | Principal assessment focus | Result |
| --- | --- | --- | --- |
| CC1.1 | Ethical conduct | Leadership conduct, standards, adherence, deviations, relevant contractors | Guidance corrected |
| CC1.2 | Independent oversight | Governing-body independence, expertise, information, challenge and follow-up | Guidance corrected |
| CC1.3 | Roles and reporting lines | Structures, authorities, reporting, assigned and outsourced responsibilities | Guidance corrected |
| CC1.4 | Workforce competence | Competency definition, hiring, development, deficiencies and succession | Guidance corrected |
| CC1.5 | Control accountability | Ownership, performance evaluation, incentives, pressures and consequences | Guidance corrected |
| CC2.1 | Useful control information | Information needs, sources, quality, assets, locations and data flows | Guidance corrected |
| CC2.2 | Internal control communications | Internal objectives, responsibilities, changes and escalation routes | Guidance corrected |
| CC2.3 | External control communications | Commitments, boundaries, shared responsibilities and reporting channels | Guidance corrected |
| CC3.1 | Clear risk objectives | Scoped objectives, commitments, requirements and risk tolerances | Guidance corrected |
| CC3.2 | Risks to objectives | Risk scope, internal/external factors, significance, response and residual risk | Guidance corrected |
| CC3.3 | Fraud-risk consideration | Fraud scenarios, incentives, opportunity, attitudes and technology-enabled abuse | Guidance corrected |
| CC3.4 | Significant change assessment | External, business, leadership, technology, vendor and threat changes | Guidance corrected |
| CC4.1 | Ongoing and separate evaluations | Risk-based monitoring mix, competence, objectivity and supported conclusions | Guidance corrected |
| CC4.2 | Deficiency follow-up | Significance, communication, ownership, remediation and validation | Guidance corrected |
| CC5.1 | Risk-responsive control selection | Risk-to-control fit, level, preventive/detective coverage and segregation | Guidance corrected |
| CC5.2 | Technology control activities | Technology dependencies and general controls over access and life cycle | Guidance corrected |
| CC5.3 | Policy-backed control operation | Expectations, procedures, ownership, timing, exceptions and reassessment | Guidance corrected |
| CC6.1 | Logical-access protection | Asset/access inventory, architecture, authentication and risk-based protection | Guidance corrected |
| CC6.2 | Identity registration and authorization | Authorization before issuance, credential validity and disablement | Guidance corrected |
| CC6.3 | Access changes and removal | Role-based access, least privilege, segregation, changes and reviews | Guidance corrected |
| CC6.4 | Physical-access restriction | Facility/asset scope, authorization, removal, device recovery and reviews | Guidance corrected |
| CC6.5 | Retired asset information protection | Retention decision, sanitization and verification before protection ends | Guidance corrected |
| CC6.6 | External-boundary protection | External channels, remote authentication, boundary controls and exceptions | Guidance corrected |
| CC6.7 | Protected information movement | Authorized transfer/removal, secure channels, media and endpoints | Guidance corrected |
| CC6.8 | Malicious-software prevention | Installation restriction, change detection, anti-malware and response | Guidance corrected |
| CC7.1 | Configuration and vulnerability detection | Baselines, deviations, unknown components, scanning and remediation | Guidance corrected |
| CC7.2 | Anomaly monitoring | Coverage, anomalies, analysis, threat inputs and detection-tool health | Guidance corrected |
| CC7.3 | Security-event evaluation | Event-to-incident decisions, impact, escalation and corrective action | Guidance corrected |
| CC7.4 | Incident response operation | Roles, understanding, containment, remediation, communication and exercises | Guidance corrected |
| CC7.5 | Incident recovery operation | Restoration, validation, root cause, recurrence prevention and testing | Guidance corrected |
| CC8.1 | Authorized system changes | Ordinary/emergency life cycle, impact, testing, approval and deployment | Guidance corrected |
| CC9.1 | Disruption risk mitigation | Disruption scenarios, continuity, alternatives, communications and treatment | Guidance corrected |
| CC9.2 | Third-party risk oversight | Inventory, tiering, requirements, lifecycle monitoring, issues and termination | Guidance corrected |
| A1.1 | Capacity adequacy | Current/peak use, forecasts, tolerances, resilience and capacity changes | Guidance corrected |
| A1.2 | Resilient operating infrastructure | Environmental safeguards, backup, separation, failover and recoverability | Guidance corrected |
| A1.3 | Recovery validation | Scenario scope, dependencies, backup integrity, results and retesting | Guidance corrected |
| C1.1 | Confidential information lifecycle | Definition, identification, commitments, retention and premature destruction | Guidance corrected |
| C1.2 | Confidential information disposal | End-of-retention identification, coverage, destruction and exception follow-up | Guidance corrected |

## E. Assessment guidance

- Method: criterion-by-criterion comparison to the AICPA-hosted 2017 TSC / revised-2022 points of focus, then concise implementation-neutral wording written as Omnisciente program guidance.
- Reviewed: 38 criteria.
- Changed: 38 criteria.
- Official text copied into the product: 0 criteria.
- Mandatory standalone controls created from points of focus: 0.

## F. Policy mapping review

All mappings remain explicitly `recommended` and state that they are partial supporting subject relationships, not AICPA-required policy titles or automatic criterion satisfaction.

Corrections:

- Added C1.1 to Data Retention and Secure Disposal because C1.1 includes maintaining confidential information through its retention period.
- Removed CC6.8 from Vulnerability and Patch Management; that policy is not a sufficient direct proxy for malicious-software controls.
- Added CC8.1 to Configuration Management because controlled configuration change materially supports the criterion.
- Added Asset Management for CC2.1, CC6.1, CC6.5 and CC7.1.
- Added Cryptography and Key Management for CC6.1 and CC6.7.
- Removed A1.1 from Business Continuity / Disaster Recovery; a continuity policy is not a direct capacity-management mapping.

Result: 16 valid policy mappings; 4 existing rows corrected, 2 missing rows added, 0 invalid policy keys, and 0 references to nonexistent criteria. No AICPA-endorsed crosswalk is claimed.

## G. Recurring Review / cadence matrix

| Criterion | Review | Cadence | Cadence source | Assessment |
| --- | --- | --- | --- | --- |
| CC3.1–CC3.4 | SOC 2 Risk and System Scope Review | Annual default | Omnisciente/iVenture program standard | Keep; actual cadence is management-selected and change-triggered reassessment still applies |
| CC6.1–CC6.3 | Access Entitlement Review | Quarterly default | Omnisciente/iVenture program standard | Keep as partial supporting work; it does not by itself assess all access architecture |
| CC7.1–CC7.2 | Vulnerability Governance Review | Annual default | Omnisciente/iVenture program standard | Keep as partial governance support; it does not set scan or monitoring frequency |
| CC9.2; existing P6.4–P6.5 | Third-Party Security Review | Annual default | Omnisciente/iVenture program standard | Keep; Privacy associations remain outside this review |
| CC9.1, A1.2–A1.3 | Backup and Recovery Validation | Annual default | Omnisciente/iVenture program standard | Keep; backup operation follows the client control design, not this Review default |
| CC7.3–CC7.5, CC9.1 | Incident Response Exercise | Annual default | Omnisciente/iVenture program standard | Keep; actual incidents remain event-driven |
| CC5.3, CC2.2 | Security Policy Review | Annual default | Omnisciente/iVenture program standard | Keep; no AICPA annual mandate asserted |
| CC1.4, CC2.2 | Security Awareness Review | Annual default | Omnisciente/iVenture program standard | Keep; actual training and communication frequency is organization-defined |

All eight plans retain cadence class `D`, an empty authoritative cadence-reference list, `Omnisciente Recommended` basis, and explicit wording that AICPA does not prescribe the numerical interval. No new recurring Review was created: CC4 monitoring can evaluate the existing control and Review population without introducing another parallel workflow.

### Per-criterion relationship QA

`—` means no default policy or recurring Review is asserted; the organization may still use other controls and evidence. Every row uses the same AICPA reference, existing Finding → Action capability and preserved SOC readiness-status model described above.

| Criterion | Recommended policy subjects | Suggested recurring Review / provenance |
| --- | --- | --- |
| CC1.1 | Information Security | — |
| CC1.2 | — | — |
| CC1.3 | Information Security | — |
| CC1.4 | Security Awareness and Training | Security Awareness Review / program standard |
| CC1.5 | — | — |
| CC2.1 | Asset Management | — |
| CC2.2 | Information Security; Security Awareness and Training | Security Policy Review; Security Awareness Review / program standard |
| CC2.3 | — | — |
| CC3.1 | Risk Management | Risk and System Scope Review / program standard |
| CC3.2 | Risk Management | Risk and System Scope Review / program standard |
| CC3.3 | Risk Management | Risk and System Scope Review / program standard |
| CC3.4 | Risk Management | Risk and System Scope Review / program standard |
| CC4.1 | — | — |
| CC4.2 | — | — |
| CC5.1 | — | — |
| CC5.2 | — | — |
| CC5.3 | Information Security | Security Policy Review / program standard |
| CC6.1 | Access Control and Identity Management; Asset Management; Cryptography and Key Management | Access Entitlement Review / program standard |
| CC6.2 | Access Control and Identity Management | Access Entitlement Review / program standard |
| CC6.3 | Access Control and Identity Management | Access Entitlement Review / program standard |
| CC6.4 | Physical and Environmental Security | — |
| CC6.5 | Data Retention and Secure Disposal; Asset Management | — |
| CC6.6 | — | — |
| CC6.7 | Data Classification and Handling; Cryptography and Key Management | — |
| CC6.8 | — | — |
| CC7.1 | Vulnerability and Patch Management; Configuration Management; Asset Management | Vulnerability Governance Review / program standard |
| CC7.2 | — | Vulnerability Governance Review / program standard |
| CC7.3 | Incident Response | Incident Response Exercise / program standard |
| CC7.4 | Incident Response | Incident Response Exercise / program standard |
| CC7.5 | Incident Response | Incident Response Exercise / program standard |
| CC8.1 | Configuration Management; Change Management | — |
| CC9.1 | Backup and Restoration; Business Continuity and Disaster Recovery | Backup and Recovery Validation; Incident Response Exercise / program standard |
| CC9.2 | Vendor and Third-Party Risk Management | Third-Party Security Review / program standard |
| A1.1 | — | — |
| A1.2 | Physical and Environmental Security; Backup and Restoration; Business Continuity and Disaster Recovery | Backup and Recovery Validation / program standard |
| A1.3 | Backup and Restoration; Business Continuity and Disaster Recovery | Backup and Recovery Validation / program standard |
| C1.1 | Data Retention and Secure Disposal; Data Classification and Handling | — |
| C1.2 | Data Retention and Secure Disposal | — |

## H. Findings / Action integration

Current state is traceable through the existing authoritative workflow:

`Criterion assessment → Finding → Action Item → validation/closure`

The criterion drawer can create a Finding and linked remediation Action; related records, activity and evidence remain client-scoped. Completing or validating remediation does not silently change the criterion assessment conclusion. CC4.2 guidance now explicitly directs reviewers to evaluate deficiency communication, remediation tracking and validation without creating a second finding system.

No workflow or UI change was required.

## I. Significant issues requiring approval

1. Processing Integrity and Privacy were intentionally left unchanged. A separate authorized review is required before treating their current explanations as validated.
2. Omnisciente links to, but does not embed, AICPA criterion or points-of-focus text. Embedding licensed/copyrighted content or storing individual points of focus would require an explicit content-licensing and product decision.
3. No universal recurring Review was added for CC4.1/CC4.2. Add one only if iVenture adopts it as a program standard; the criteria themselves do not establish a universal calendar interval.

## J. Tests / build

- Focused frontend SOC/operator suite: **PASS**, 16 tests / 1 suite.
- Direct SOC catalog assertions: **PASS**, 38 scoped criteria, 16 valid policy mappings, 8 valid Review plans.
- Python syntax check for the updated backend test: **PASS**.
- Backend pytest suite: **NOT RUN**; this Windows host has no project Python/FastAPI/pytest environment. The bundled Python runtime lacks both `pytest` and `fastapi`.
- Full frontend suite: **817/819 tests passed across 151 suites** on the first run. The initial SOC five-year failure exposed an over-narrow Review mapping introduced during this review; the valid partial CC6.1 relationship was restored and the complete CIS/ISO/SOC five-year suite then passed (3/3 parameterized cases). The remaining independently reproduced failure is the existing multi-framework five-year Demo storage ceiling at 4,974,991 characters; it is not treated as passed or caused by this content diff.
- Production build: **PASS** in normal repository mode. It retains the existing `PlatformAdmin.jsx:53` Hook dependency warning and existing bundle-size warning. A separate `CI=true` build correctly failed because that existing Hook warning is promoted to an error; no suppression or unrelated fix was added.
- Browser verification: not required for content-only data displayed through an unchanged component; no browser claim is made.

## K. Shared files changed

| File | Reason | Conflict risk |
| --- | --- | --- |
| `frontend/src/lib/frameworkOperator.js` | Read optional criterion-specific SOC assessment text before existing group fallback | Low; one content-selection line, no visual behavior |
| `frontend/src/lib/frameworkOperator.test.js` | Verify all 38 scoped criteria have distinct assessment/evidence guidance | Low; shared test only |
| `frontend/src/lib/soc2.json` | Correct and complete partial policy mappings | Low to medium; SOC catalog only, no CIS/Brawndo data changed |
| `backend/tests/test_soc_framework.py` | Add catalog integrity, provenance, mapping and CIS-leak assertions | Low; SOC test only |
| `docs/framework-public-source-baseline.md` | Mark the prior SOC source-access limitation as superseded for the reviewed scope | Low; documentation-only, no product behavior |
| `docs/framework-source-manifest.md` | Record the current scoped SOC source-validation state | Low; documentation-only, no product behavior |

SOC-only files also changed: `frontend/src/lib/operatorGuidance/soc.json` and this report. No header, card, color, table, drawer, sidebar, theme, spacing, button, shared visual component, Brawndo behavior, or Prestige fixture was changed.

## L. Branch status

- Branch: `codex/soc2-content-qa`
- Base main SHA: `fc02c0b42bbe0ee3f6de471499d87381c0284808`
- Commit: versioned with this review; exact SHA is recorded in the final handoff
- Working tree: clean after commit
- `main`: unchanged
- Claude workflow QA branches: untouched by this work
- `codex/prestige-redesign`: untouched by this work; the separately active branch advanced to `91776cccf4ab14a7e7f643f8002ece314256281b` and has uncommitted UI work from its own agent
- `codex/brawndo-cis-assessment`: unchanged at `b5cc326499fc655fdd7193de1fc21bb3cc06629a`
- Production: unchanged; no merge, push or deployment performed
