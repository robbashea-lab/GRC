# Public-source operating baseline — 2026-09-26

Internal research/engineering record, not product UI or an assurance opinion.
This supplements the dated item ledgers in `iso-substantive-validation.md` and
`soc-substantive-validation.md`; it does not relabel their exact-text comparisons
as complete. No unauthorized copies, account bypass, or full standard reproduction.

## Confidence and acceptance

- **V** — VERIFIED — PRIMARY PUBLIC SOURCE, for the bounded concept identified.
- **H** — HIGH CONFIDENCE — CORROBORATED by consistent primary/professional material.
- **W** — WORKING INTERPRETATION — MANUAL VERIFICATION RECOMMENDED; reversible
  operating support only, without a compliance conclusion.
- **I** — INSUFFICIENT EVIDENCE; not implemented as a requirement.

Operational product validation is Pass/Fail based on exercised workflows. Content
validation is Publicly Verified / High Confidence / Manual Verification Recommended
/ Blocked. Counts, an assessment conclusion or an uploaded artifact are not an
audit opinion. Product history/versioning is an engineering means of supporting
auditor traceability, not a claimed framework-prescribed database design.

## Live source register

All sources accessed/researched 2026-09-26. Publication information is distinguished
from access date. Links below are publisher/professional sites, not document mirrors.

| Source | Source type; version/date; bounded use |
| --- | --- |
| [I1 ISO edition record](https://www.iso.org/standard/27001) | Primary metadata; edition 3, 2022. Version identity only. |
| [I2 ISO amendment record](https://www.iso.org/standard/88435.html) | Primary metadata; Amd 1:2024, 23 February 2024. |
| [I3 ISO/IAF communiqué](https://iaf.nu/iaf_system/uploads/documents/Joint_ISO-IAF_Communique_re_Climate_Change_Amds_to_ISO_MSS_Feb_2024_Final.pdf) | Primary, 22 February 2024; climate relevance and interested-party considerations; explicitly lists ISO/IEC 27001:2022. |
| [I4 SIST official preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf) | National standards-body preview; October 2022; substantive clauses 4–6 only. Contents listing does not verify absent text. |
| [I5 SC27-hosted SoA practices note](https://committee.iso.org/files/live/sites/jtc1sc27/files/resources/ISO-IECJTC1-SC27-WG1_N3298_Auditing%20Practices%20Note%20-%20SoA.pdf) | Committee-hosted educational interpretation, September 2022; not endorsed normative ISO guidance. Corroborates necessary vs reference controls. |
| [I6 BSI client guide](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/27001-iso-client-guide.pdf) | Standards-body professional guidance, copyright 2025; pp. 8–9, management-system operation and SoA. |
| [I7 Schellman internal audit](https://www.schellman.com/blog/iso-certifications/iso-27001-requirements) | Certification-body interpretation; published December 2022, updated February 2026. Audit scope, criteria, independence and results. |
| [I8 Schellman ISO overview](https://www.schellman.com/blog/iso-certifications/iso-27001-overview) | Professional interpretation, current public page. Support, evaluation, corrective action and improvement. |
| [I9 Schellman management role](https://www.schellman.com/blog/iso-certifications/iso-27001-role-of-top-management) | Professional interpretation; management review inputs/outputs, leadership. Do not promote recommended intervals to normative requirements. |
| [I10 BSI 2022 change summary](https://www.bsigroup.com/globalassets/localfiles/en-th/iso-27001/resources/iso-iec-27001-2022-whats-changed-th.pdf) | Publisher search-indexed guidance; 93 controls, four themes, new planning-of-change clause. Indexed access only; not used for exact control wording. |
| [S1 AICPA TSC resource](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) | Primary public landing page, 30 September 2023; 2017 criteria/revised 2022 points of focus. Full download account-gated. |
| [S2 AICPA SOC suite](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services) | Primary overview; links 2017/2022 TSC and 2018/2022 Description Criteria. No product cadence mandate. |
| [S3 AICPA reporting guide metadata](https://www.aicpa-cima.com/cpe-learning/publication/soc-2-reporting-on-an-examination-of-controls-at-a-service-organization-relevant-to-security-availability-processing-integrity-confidentiality-or-privacy-OPL) | Primary publication metadata; updated 15 October 2022; description, control design and effectiveness. Full guide not obtained. |
| [S4 Schellman SOC 2 service guidance](https://www.schellman.com/services/soc-compliance-and-attestations/soc-2) | Professional guidance; Type 1 point-in-time vs Type 2 period operation. Typical periods are not minimum legal rules. |
| [S5 Schellman scoping guidance](https://www.schellman.com/blog/soc-examinations/how-to-scope-a-soc-2-audit) | Professional guidance; system/services, selected categories, operating period and evidence population. |
| [S6 Schellman period guidance](https://www.schellman.com/blog/soc-examinations/how-to-determine-soc-reporting-period-report-validity) | Professional guidance; events must relate to the chosen period; provider treatment and scope decisions. |
| [S7 Schellman jumpstart](https://www.schellman.com/services/soc-compliance-and-attestations/soc-2/soc-2-jumpstart-guide) | Supporting interpretation; corroborates 33 Common Criteria and 18 Privacy. Availability/Processing Integrity counts appear reversed versus the repository; not authoritative enough to change IDs. |
| [S8 AICPA AI TQA notice](https://www.aicpa-cima.com/resources/download/tqa-section-9561-soc-examinations-effect-of-the-service-organizations-use-of-ai-on-soc1-and-soc2-examinations) | Primary current change notice, 11 September 2026; Q&A 9561 concerns AI use in examinations, not a replacement TSC catalog. Full Q&A not evaluated. |

Some older BSI implementation-guide/self-assessment PDF URLs redirected to generic
pages. Search snippets helped discovery but are not treated as full-text access.
The older 2016 internal-audit article's annual management-review phrasing was not
adopted as a mandatory interval. Newer guidance and source context take precedence.

## ISO working requirements and implementation impact

Version: ISO/IEC 27001:2022 + Amd 1:2024. Expectations below are concise paraphrases,
not official text. Framework applicability and client-specific control selection
are distinct. Default annual/quarterly Reviews remain product recommendations.

| IDs / concept | Working expectation | Sources / confidence | Omnisciente operating record and validation impact |
| --- | --- | --- | --- |
| 4.1–4.2 context / parties | Identify relevant issues and obligations, including climate relevance. | I3/I4 V | Profile/scope and clause narratives; retain decisions and changed context. |
| 4.3 scope | Document boundaries and dependencies. | I4 V | Systems & Scope, supporting scoped artifact; later scope cannot rewrite prior evidence. |
| 4.4 ISMS | Maintain interacting management processes. | I4 V | Clause assessment plus linked authoritative operational records. |
| 5.1 leadership | Leadership supports and directs the ISMS. | I4 V | Owners, decisions, resources and management-review evidence. |
| 5.2 policy | Establish appropriate security policy. | I4 V | Existing Policy lifecycle and approval evidence, not a second policy object. |
| 5.3 responsibility | Assign and communicate ISMS accountability. | I4 V | People/roles; contacts do not gain account permissions. |
| 6.1.1 planning | Address risks/opportunities and evaluate actions. | I4 V | Linked Risks, treatment Actions and Review occurrences. |
| 6.1.2 risk method | Use repeatable assessment and acceptance criteria. | I4 V | Risk methodology artifact, assessed Risks and historical decisions. |
| 6.1.3 risk treatment / SoA | Choose necessary controls, justify selections/exclusions and treatment. | I4 V; I5/I6 corroboration | Annex applicability is separate from implementation. Additional necessary controls need retained supporting SoA documentation; a 93-row register alone is not enough. |
| 6.2 objectives | Establish objectives and implementation plans. | I4 V | Clause narrative, owner, measurement evidence and follow-up work. |
| 6.3 change | Plan ISMS changes. | I4 V | Change rationale and historical scope/assessment snapshots. |
| 7.1–7.4 support | Resource the ISMS; support competence, awareness and communication. | I6/I8 H | Training/communications evidence, responsibilities, operational Reviews. No prescribed file checklist. |
| 7.5 documented information | Control required records and their changes/access. | I6/I8 H | Policies, Evidence versions, record/history access; preserve original attribution. |
| 8.1–8.3 operation | Run planned processes, reassess risk and execute treatment. | I6/I8 H | Risks and dated Reviews; event-driven changes must not wait for the next recommended annual Review. |
| 9.1 measurement | Evaluate ISMS performance. | I6/I8 H | Measurement evidence and linked decisions; assessment coverage is not conformity. |
| 9.2.1–9.2.2 audit | Maintain an audit program with scope, objective evaluation and results. | I6/I7 H | Shared Reviews/occurrences; record scope/criteria, auditor independence and findings in narrative/evidence. Product assignment does not prove independence. |
| 9.3.1–9.3.3 management review | Management evaluates the ISMS and records decisions. | I8/I9 H | Shared Review history, inputs/results artifact, decisions and Actions. Exact full input/output checklist remains manual verification. |
| 10.1 improvement | Improve the ISMS based on results. | I6/I8 H | Independent reassessment and retained decisions; no automatic implemented status. |
| 10.2 correction | Address nonconformities and evaluate corrective action. | I7/I8 H | Finding → Action → independent validation; record cause, correction and effectiveness, not merely task completion. |
| A.5/A.6/A.7/A.8 | Four themes, 93 reference controls; applicability follows necessary-control analysis. | I6/I10 H for structure; I4 V for selection principle | 37/8/14/34 existing IDs retained. Individual authored intent/mappings remain W until exact-source comparison; never universally mandatory. |

Artifact names and storage layouts in the impact column are product design choices,
not prescribed ISO document titles. Prior state must remain inspectable through
assessment history and retained evidence; a new status must not erase old rationale.

## SOC 2 working concepts and implementation impact

Baseline: 2017 Trust Services Criteria with revised 2022 points of focus; 2018
Description Criteria with revised 2022 guidance. No newer replacement catalog was
established from current AICPA listings. The September 2026 AI Q&A is supplemental.

| Concept / identifier scope | Working expectation | Sources / confidence | Omnisciente operating record and validation impact |
| --- | --- | --- | --- |
| TSC vs controls | Criteria evaluate organization-designed controls; they are not one universal control library. | S1/S3 V | Preserve management control descriptions separately from criterion assessments. Shared Reviews/Evidence can support several criteria without shared conclusions. |
| Security / selected categories | Deliberately scope Security/Common Criteria and relevant optional categories. | S1/S2 V for categories; S4/S5 H for operation | Keep existing category selection; deselection retains history. Exact optional inventory remains manual verification, not fabricated correction. |
| Description / boundary | Describe scoped system and service commitments. | S2/S3 V; S5 H | Client configuration plus retained system-description evidence. Plain scope text is not an issued examination report. |
| Type 1 / Type 2 | Point-in-time design differs from operation across a period. | S3/S4/S5 H | Current product is Type 2 readiness; no new attestation or Type 1 conclusion inferred. |
| Design / implementation / ownership | Document who operates the organization's control and how. | S3/S5 H | Criterion control descriptions and linked Review/Policy owners; do not infer effective operation from adequate design. |
| Cadence | Control frequency follows the organization's design and commitments. | S3/S5/S6 H | Product-suggested Reviews remain recommendations; record actual selected recurrence and occurrences. |
| Period evidence | Support operating history across the relevant observation period. | S4/S5/S6 H | Evidence links retain period/occurrence; later program dates cannot rewrite original observations. File count does not equal a valid sample population. |
| Exceptions / remediation | Evaluate gaps, corrective work and subsequent operation. | S3/S5 H | Findings and Actions; readiness status is separately reassessed, not automatically passed. |
| Providers / subservices | Dependencies and their treatment affect scope and evidence. | S5/S6 H | Vendor records and scope evidence; no automated carve-out/inclusive decision. |
| Historical control changes | Earlier design/operation needs to remain reviewable. | S3/S5/S6 H for period concept; W for product representation | Existing control observation snapshots and immutable Review occurrences; annual evidence must not silently move periods. |
| Individual CC/A/C/PI/P mappings | Existing authored paraphrases are working aids, not verified complete criteria/points of focus. | S1 metadata only; W | Retain 61 IDs and original language distinction. No score/certification or universal mandatory artifact list. |

## Licensed-source verification list for Robb

Only material checks, not a list of every catalog row:

| Framework | Item to verify | Current working interpretation / confidence | Why it matters |
| --- | --- | --- | --- |
| ISO | Detailed clauses 7–10, especially 9.3 inputs/results and 10.2 effectiveness | Core lifecycle H; exact checklist W | Could require additional assessment prompts or validation evidence, not a new parallel workflow. |
| ISO | Annex A authored intent and partial policy/Review mappings | IDs/structure H; detailed mapping W | Scope/qualification errors could affect applicability or suggested operational coverage. |
| ISO | Client-specific full SoA, including necessary controls beyond Annex A | Selection principle V; complete organization SoA must be supplied | Annex register alone cannot establish all necessary controls are documented. |
| SOC 2 | Full criteria and revised points of focus, especially optional category inventory | Operating model H; exact catalog completeness W | Secondary count disagreement is not grounds to alter the catalog; verify A1/PI1 and exceptions against AICPA. |
| SOC 2 | Description Criteria and examination-specific period/sampling/subservice treatment | General model H; engagement-specific application W | A readiness workspace must not be mistaken for an adequate system description or audit sampling decision. |
| SOC 2 | Applicability of September 2026 AI TQA 9561 to a client's scoped system | Notice V; detailed impact not established | Potential examination guidance for AI-using service organizations; no unsupported automatic requirement added. |

No universal numerical cadence or newly mandatory artifact is established by this
research. Source confidence does not waive any unexecuted operational test gate.
