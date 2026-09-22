# NIST CSF 2.0 — substantive validation

**Phase 2 gate complete.** 100 unchanged item interpretations verified; 6 corrected, including one shorthand title and its derived prompts. Six backend CSF tests and 36 frontend tests across five suites passed. Targeted ESLint and diff whitespace checks passed. Production build passed (`main.655fa0ed.js`), retaining the unrelated PlatformAdmin hook warning. No live browser or persistent staging backend exercised; no publication. The following register retains the pre-implementation research record.

Phase 2 in progress. Source: [NIST CSWP 29](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf), NIST, 2024-02-26, accessed 2026-09-22. Official public framework; Appendix A supplies the Core, sections 1–4 explain outcomes, Profiles and informative implementation guidance. No certification or universal numeric cadence is established by CSF. This validates represented version 2.0, not a silent upgrade.

## Corrections recorded before implementation

Existing titles are Omnisciente shorthand, not claims of verbatim official outcome wording. Six operator explanations omit an important qualification. Preserve IDs, assessments and historical links.

| ID | Previous explanation | Corrected explanation | Source |
| --- | --- | --- | --- |
| ID.RA-09 | Consider whether acquired hardware and software are authentic and trustworthy before relying on them. | Assess authenticity and integrity of hardware and software before acquisition and use. | CSWP 29 Appendix A, ID.RA-09 |
| ID.RA-10 | Assess critical suppliers using the risks their products, services and access introduce. | Assess critical suppliers before acquisition, considering the risks introduced by their products, services and access. | CSWP 29 Appendix A, ID.RA-10 |
| PR.AA-04 | Protect identity claims exchanged between systems so an attacker cannot easily forge or misuse them. | Protect, convey and verify identity assertions exchanged between systems. | CSWP 29 Appendix A, PR.AA-04 |
| PR.AA-05 | Limit permissions to justified needs and review them as roles and circumstances change. | Define permissions in policy, enforce least privilege and separation of duties, and manage and review entitlements. | CSWP 29 Appendix A, PR.AA-05 |
| RS.AN-06 | Record investigation actions so decisions and the sequence of work can be understood later. | Record investigation actions and preserve the integrity and provenance of those records. | CSWP 29 Appendix A, RS.AN-06 |
| RC.RP-04 | Restore critical mission and business functions while accounting for remaining risks. | Use critical mission functions and cybersecurity risk considerations to establish post-incident operating norms. | CSWP 29 Appendix A, RC.RP-04 |

The RC.RP-04 shorthand title also needs correction from `Restore critical mission functions` to `Establish post-incident operating norms`; its existing catalog question/guidance derive from that title and will be updated consistently. This is reference content, not a change to assessment state.

Nine existing Review defaults remain product recommendations (D), with no source minimum. Add explicit cadence provenance classification in existing plan metadata, retaining defaults and schedules. Underlying outcomes can involve repeated, continuous or event-driven activities; D describes the recommended governance Review, not all underlying operations.

## Item ledger

All 106 identifiers and category/function placement compared with Appendix A. Shorthand titles are original labels rather than quotations. `framework_outcome` is the correct primary classification; `state`/`event` are local presentation classifications and are not statements that monitoring need not operate continuously. Generic catalog prompts, 106 operator explanations, 22 category implementation notes, and 22 category evidence examples were inspected. Evidence suggestions remain illustrative and category-scoped, not mandatory artifacts. No missing or duplicate Core outcome identified.

All items retain source cadence `CSF specifies outcomes, not a fixed implementation cadence.` Existing scheduled Reviews are listed below separately. No automatic recurring obligation is inferred from an outcome.

| ID | Existing title (corrected where noted) | Local type | Explanation result | Implementation / evidence | Authoritative section |
| --- | --- | --- | --- | --- | --- |
| GV.OC-01 | Mission informs cyber risk | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OC-01 |
| GV.OC-02 | Stakeholder needs and expectations | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OC-02 |
| GV.OC-03 | Legal regulatory and contractual obligations | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OC-03 |
| GV.OC-04 | Services others depend on | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OC-04 |
| GV.OC-05 | External dependencies understood | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OC-05 |
| GV.RM-01 | Agreed risk objectives | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-01 |
| GV.RM-02 | Risk appetite and tolerance | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-02 |
| GV.RM-03 | Integration with enterprise risk | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-03 |
| GV.RM-04 | Risk response direction | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-04 |
| GV.RM-05 | Cyber risk communication | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-05 |
| GV.RM-06 | Consistent risk methodology | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-06 |
| GV.RM-07 | Positive risk opportunities | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RM-07 |
| GV.RR-01 | Leadership accountability | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RR-01 |
| GV.RR-02 | Communicated roles and authorities | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RR-02 |
| GV.RR-03 | Risk-aligned resources | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RR-03 |
| GV.RR-04 | Cybersecurity in HR practices | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.RR-04 |
| GV.PO-01 | Establish and enforce policy | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.PO-01 |
| GV.PO-02 | Review and update policy | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.PO-02 |
| GV.OV-01 | Review strategy outcomes | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OV-01 |
| GV.OV-02 | Review strategy coverage | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OV-02 |
| GV.OV-03 | Evaluate risk management performance | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.OV-03 |
| GV.SC-01 | Supply chain risk program | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-01 |
| GV.SC-02 | Supplier roles and coordination | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-02 |
| GV.SC-03 | Integrate supply chain risk | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-03 |
| GV.SC-04 | Prioritize suppliers | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-04 |
| GV.SC-05 | Contractual security expectations | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-05 |
| GV.SC-06 | Pre-engagement due diligence | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-06 |
| GV.SC-07 | Lifecycle supplier risk management | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-07 |
| GV.SC-08 | Suppliers in incident planning | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-08 |
| GV.SC-09 | Monitor supply chain practices | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-09 |
| GV.SC-10 | Post-relationship provisions | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / GV.SC-10 |
| ID.AM-01 | Hardware inventory | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-01 |
| ID.AM-02 | Software services and systems inventory | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-02 |
| ID.AM-03 | Network and data flow representations | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-03 |
| ID.AM-04 | Supplier services inventory | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-04 |
| ID.AM-05 | Asset criticality and classification | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-05 |
| ID.AM-07 | Data and metadata inventory | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-07 |
| ID.AM-08 | Asset lifecycle management | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.AM-08 |
| ID.RA-01 | Identify and validate vulnerabilities | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-01 |
| ID.RA-02 | Receive threat intelligence | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-02 |
| ID.RA-03 | Identify internal and external threats | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-03 |
| ID.RA-04 | Assess likelihood and impact | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-04 |
| ID.RA-05 | Understand inherent risk | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-05 |
| ID.RA-06 | Plan and track risk responses | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-06 |
| ID.RA-07 | Assess changes and exceptions | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-07 |
| ID.RA-08 | Vulnerability disclosure process | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-08 |
| ID.RA-09 | Verify acquisition authenticity | state | CORRECTED — register above | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-09 |
| ID.RA-10 | Assess critical suppliers | state | CORRECTED — register above | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.RA-10 |
| ID.IM-01 | Evaluation-driven improvement | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.IM-01 |
| ID.IM-02 | Exercise-driven improvement | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.IM-02 |
| ID.IM-03 | Operational improvement | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.IM-03 |
| ID.IM-04 | Maintain incident and cyber plans | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / ID.IM-04 |
| PR.AA-01 | Manage identities and credentials | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AA-01 |
| PR.AA-02 | Identity proofing and binding | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AA-02 |
| PR.AA-03 | Authenticate people services and hardware | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AA-03 |
| PR.AA-04 | Protect identity assertions | state | CORRECTED — register above | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AA-04 |
| PR.AA-05 | Least privilege and permission review | state | CORRECTED — register above | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AA-05 |
| PR.AA-06 | Risk-based physical access | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AA-06 |
| PR.AT-01 | General workforce awareness | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AT-01 |
| PR.AT-02 | Specialized role training | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.AT-02 |
| PR.DS-01 | Protect data at rest | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.DS-01 |
| PR.DS-02 | Protect data in transit | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.DS-02 |
| PR.DS-10 | Protect data in use | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.DS-10 |
| PR.DS-11 | Create protect and test backups | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.DS-11 |
| PR.PS-01 | Configuration management | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.PS-01 |
| PR.PS-02 | Software lifecycle maintenance | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.PS-02 |
| PR.PS-03 | Hardware lifecycle maintenance | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.PS-03 |
| PR.PS-04 | Generate monitoring logs | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.PS-04 |
| PR.PS-05 | Prevent unauthorized software | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.PS-05 |
| PR.PS-06 | Secure development practices | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.PS-06 |
| PR.IR-01 | Protect networks and environments | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.IR-01 |
| PR.IR-02 | Environmental protection | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.IR-02 |
| PR.IR-03 | Resilience mechanisms | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.IR-03 |
| PR.IR-04 | Resource capacity | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / PR.IR-04 |
| DE.CM-01 | Monitor networks and services | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.CM-01 |
| DE.CM-02 | Monitor physical environment | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.CM-02 |
| DE.CM-03 | Monitor personnel and usage | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.CM-03 |
| DE.CM-06 | Monitor service providers | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.CM-06 |
| DE.CM-09 | Monitor computing environments and data | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.CM-09 |
| DE.AE-02 | Analyze adverse events | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.AE-02 |
| DE.AE-03 | Correlate information | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.AE-03 |
| DE.AE-04 | Understand event impact and scope | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.AE-04 |
| DE.AE-06 | Provide event information | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.AE-06 |
| DE.AE-07 | Integrate threat context | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.AE-07 |
| DE.AE-08 | Declare incidents against criteria | state | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / DE.AE-08 |
| RS.MA-01 | Execute coordinated response | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MA-01 |
| RS.MA-02 | Triage and validate reports | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MA-02 |
| RS.MA-03 | Categorize and prioritize incidents | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MA-03 |
| RS.MA-04 | Escalate incidents | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MA-04 |
| RS.MA-05 | Apply recovery initiation criteria | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MA-05 |
| RS.AN-03 | Establish incident cause | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.AN-03 |
| RS.AN-06 | Record investigation actions | event | CORRECTED — register above | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.AN-06 |
| RS.AN-07 | Preserve incident data and provenance | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.AN-07 |
| RS.AN-08 | Validate incident magnitude | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.AN-08 |
| RS.CO-02 | Notify relevant stakeholders | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.CO-02 |
| RS.CO-03 | Share designated information | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.CO-03 |
| RS.MI-01 | Contain incidents | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MI-01 |
| RS.MI-02 | Eradicate incidents | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RS.MI-02 |
| RC.RP-01 | Execute recovery plan | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.RP-01 |
| RC.RP-02 | Prioritize recovery actions | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.RP-02 |
| RC.RP-03 | Verify restoration assets | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.RP-03 |
| RC.RP-04 | Establish post-incident operating norms | event | CORRECTED — register above | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.RP-04 |
| RC.RP-05 | Verify restored systems | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.RP-05 |
| RC.RP-06 | Declare recovery complete | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.RP-06 |
| RC.CO-03 | Communicate recovery progress | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.CO-03 |
| RC.CO-04 | Approved public recovery updates | event | VERIFIED — concise outcome interpretation | VERIFIED as nonexclusive supporting examples | CSWP 29 Appendix A / RC.CO-04 |

## Review and policy mapping validation

All nine Review mappings are VERIFIED supporting governance mechanisms, not exhaustive operation of their mapped outcomes. All default intervals are D (Omnisciente recommended), no exact NIST interval/minimum. Source: CSWP 29 sections 1 and 4; cited outcome sections for each relationship.

| Plan | Mapped outcomes | Default | Class | Scope limitation |
| --- | --- | --- | --- | --- |
| csf-management-review | GV.OV-01, GV.OV-02, GV.OV-03 | annual | D | Strategy evaluation supports Profiles; no automatic Target achievement. |
| csf-risk-assessment | GV.RM-06, ID.RA-01, ID.RA-04, ID.RA-05, ID.RA-06 | annual | D | Risk assessment supports response decisions, not their completion. |
| csf-user-access | PR.AA-01, PR.AA-05 | quarterly | D | Entitlement review does not replace access provisioning/enforcement. |
| csf-vendor | GV.SC-04, GV.SC-07, GV.SC-09 | annual | D | Periodic supplier oversight does not replace lifecycle monitoring. |
| csf-policy-review | GV.PO-01, GV.PO-02 | annual | D | Scheduled review does not defer necessary policy changes. |
| csf-awareness | PR.AT-01, PR.AT-02 | annual | D | Governance review does not itself deliver training. |
| csf-vulnerability | ID.RA-01, ID.RA-08, PR.PS-02 | quarterly | D | Governance review does not perform vulnerability response. |
| csf-backup | PR.DS-11, RC.RP-03, RC.RP-05 | annual | D | Exercises inform recovery; event-driven integrity checks still apply. |
| csf-incident-response | ID.IM-02, ID.IM-04, RS.MA-01, RS.CO-02, RC.CO-03 | annual | D | Exercises inform incident readiness; do not constitute real incident response. |

All 17 policy mappings remain PARTIAL/supporting policy areas. This is an implementation interpretation, not a NIST-mandated list of separately titled documents. Each existing linkage was compared to its Appendix A topic; no unsupported association identified.

| Policy | Outcomes | Result |
| --- | --- | --- |
| policy-information-security-policy | GV.PO-01, GV.PO-02, GV.RR-02 | VERIFIED — PARTIAL |
| policy-risk-management-policy | GV.RM-01, GV.RM-02, GV.RM-06, ID.RA-05, ID.RA-06 | VERIFIED — PARTIAL |
| policy-access-control-identity-management-policy | PR.AA-01, PR.AA-05 | VERIFIED — PARTIAL |
| policy-acceptable-use-policy | PR.AA-05, PR.AT-01 | VERIFIED — PARTIAL |
| policy-change-management-policy | ID.RA-07, PR.PS-01 | VERIFIED — PARTIAL |
| policy-vendor-third-party-risk-management-policy | GV.SC-01, GV.SC-05, GV.SC-07, GV.SC-10 | VERIFIED — PARTIAL |
| policy-data-classification-handling-policy | ID.AM-05, ID.AM-07, PR.DS-01, PR.DS-02, PR.DS-10 | VERIFIED — PARTIAL |
| policy-data-retention-secure-disposal-policy | ID.AM-08 | VERIFIED — PARTIAL |
| policy-asset-management-policy | ID.AM-01, ID.AM-02, ID.AM-04, ID.AM-08 | VERIFIED — PARTIAL |
| policy-vulnerability-patch-management-policy | ID.RA-01, ID.RA-08, PR.PS-02 | VERIFIED — PARTIAL |
| policy-configuration-management-policy | PR.PS-01, PR.PS-05 | VERIFIED — PARTIAL |
| policy-security-awareness-training-policy | PR.AT-01, PR.AT-02 | VERIFIED — PARTIAL |
| policy-incident-response-policy | ID.IM-04, RS.MA-01, RS.CO-02, RS.MI-01 | VERIFIED — PARTIAL |
| policy-cryptography-key-management-policy | PR.DS-01, PR.DS-02 | VERIFIED — PARTIAL |
| policy-business-continuity-disaster-recovery-policy | PR.IR-03, RC.RP-01, RC.RP-04 | VERIFIED — PARTIAL |
| policy-backup-restoration-policy | PR.DS-11, RC.RP-03, RC.RP-05 | VERIFIED — PARTIAL |
| policy-physical-environmental-security-policy | PR.AA-06, PR.IR-02 | VERIFIED — PARTIAL |

## Cross-framework and history boundaries

Three CIS relationships have both endpoints validated (see CIS ledger). Remaining HIPAA/ISO/SOC relationships await the corresponding phase's authoritative-source check. None is an official crosswalk or automatic-completion rule. Profiles, assessments, recurrence, owners, Evidence and historic occurrences are not mutated by these reference-content changes.

Currency: [NIST's current CSF publication page](https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20) and [CSF hub](https://www.nist.gov/cyberframework), accessed 2026-09-22, still identify CSF 2.0. Supplementary guidance/drafts do not silently replace the Core. No claim of certification, mandatory universal controls, or legal applicability is added.
