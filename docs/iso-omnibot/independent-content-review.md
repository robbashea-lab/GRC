# Independent ISO OmniBot content review

Review date: 2026-10-11. Candidate revision: `iso27001-omni-1`, framework `iso-27001`.

This reviewer did not author the candidate. The user assignment and Ponytail instructions were read completely. This was a read-only review of the three interview catalogs, their three content matrices, and the connected evaluator/summary. The only reviewer-written file is this report. No catalog/code edits, commits, pushes, deployments, browser sessions, or client-data operations were performed.

## Disposition

All **123 definitions and 611 authored questions** were reviewed for source boundaries, intended concepts, prompts/help/remediation, conditional dependencies, and substantive scoring. There are **two reproducible P2 findings** below: one definition-level alternative-path mismatch and one universal summary-language contradiction. No P0/P1 content defect was established by this review.

122 definitions have no demonstrated local content/query defect within the stated **original practical-guidance** boundary. A.5.3 needs reconciliation before content acceptance. The universal summary finding also needs correction; its presence does not make the other 122 catalogs individually defective.

This is **not exact full licensed validation**, an exhaustive standards checklist, evidence verification, a conformity opinion, or whole-application assurance. Public normative excerpts support the represented dimensions of the 12 native units in clauses 4–6. Exact full-source comparison remains open for **18 native units in clauses 7–10 and all 93 Annex A controls: 111 definitions**. The native 30/93 inventory and authored titles establish runtime identity/assignment coverage, not complete normative obligation coverage.

## Ranked actionable findings

### F1 — P2: A.5.3 cannot express the repository's authored compensating-check alternative as addressed

Paths/IDs:

- `shared/catalogs/guidedIsoOrganizationalPeople.json:323`, `ISO-A.5.3-separation`.
- Same file, line 349, `ISO-A.5.3-exceptions`.
- `shared/catalogs/operatorGuidance/isoRequirementGuide.json:709–719`, A.5.3 gap/outcome.
- `frontend/src/lib/isoGuidedAssessment.js`, substantive `No` handling and final status selection.
- `docs/iso-omnibot/organizational-people-content-matrix.md:107–109`.

The original repository guidance describes separated duties **or** evaluated compensating checks as the authored outcome. The candidate asks actual separation as an unconditional substantive question, followed by another unconditional question acknowledging effective compensating checks where full separation is impractical. The former has no alternative branch.

Reproduction: report identified conflicts `Yes`, actual separation `No`, effective evaluated compensation `Yes`; put the alternative arrangement in the separation supporting detail. Completion succeeds, but the result is `needs_attention`, with a gap for `ISO-A.5.3-separation`. A truthful alternative cannot reach `addressed`; a `Partially` answer also cannot reach it. Supporting prose correctly does not override a substantive choice, so adding a longer explanation is not a solution.

**Action:** reconcile the interview with the approved authored treatment rule. If evaluated compensation is a supported implementation alternative, encode that alternative explicitly in the substantive question/branch, retaining necessary justification and effectiveness checks. If separation is intentionally required despite compensation, correct the conflicting guide/outcome and explain that narrower policy. Do not silently relax ISO requirements or infer that any compensating arrangement establishes conformity. The matrix expressly leaves the acceptability of particular compensating arrangements pending licensed-source review; this finding is a reproducible **local rule/query mismatch**, not proof of ISO nonconformity or permission to approve an exception. Review answer-version compatibility if question meaning changes.

### F2 — P2: optional reported gaps/unknowns contradict the all-interview “no items” sentence

Path: `frontend/src/lib/isoGuidedAssessment.js:12–13,119–125`. Applies to every definition; reproduced on A.8.13.

Reproduction: answer every A.8.13 substantive question `Yes`; supply optional `gaps = "Backup coverage is missing for the finance database."` and `unknowns = "Whether backups can be restored has not been confirmed."`. Completion succeeds. The narrative retains both notes under Additional reported context, yet ends: `No confirmation or remediation items were reported in this interview.` The returned `nextSteps`, `gaps`, and `unknowns` arrays are empty.

**Status neutrality is intentional and is not the defect.** The connected assessor explicitly tells users that optional notes do not decide readiness. Optional contact/tool names and alternative details must remain neutral. The defect is the summary's false claim about what was reported anywhere in the interview, compounded by exported answer prompts named `Confirmed gaps` and `Items requiring confirmation`.

**Action:** qualify the empty-action sentence as referring to items derived from the selected substantive answers, and make retained optional notes visibly distinct from derived signals/actions. Align exported note labels with the UI's optional-context meaning. Do not add natural-language heuristics that promote incidental or unknown names into readiness criteria. Add a regression test using the retained-note example above and preserve all existing choice-driven status behavior.

## Source verification and authority boundaries

Accessed through public web research on 2026-10-11; no interactive browser was used. Exact source text was not redistributed.

| Source | Independently accessed material | Permitted evidential use / limit |
| --- | --- | --- |
| [ISO 27001 publication record](https://www.iso.org/standard/27001), [Amd 1:2024 record](https://www.iso.org/standard/88435.html) | Edition/lifecycle/amendment identity | Metadata only; neither exposes the full requirements or Annex A. |
| [Official SIST 27001:2022 preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf) | Scope and complete exposed clauses 4–6, printed pp. 1–5; 11 PDF pages | Legitimate national-standards-body excerpt. Supports comparison of these exposed dimensions and separate necessary-control/SoA decisions. Does not contain clauses 7–10 or Annex A body text. |
| [ISO/IAF February 2024 communiqué](https://www.iso.org/files/live/sites/isoorg/files/standards/popular_standards/management_systems/ISO-IAF%20Joint%20Communique%20Feb%202024.pdf) | Climate amendment and affected-standard list | Supports the 4.1 relevance inquiry and 4.2 interested-party climate context; no universal climate programme is inferred. |
| [ISO 27002 publication record](https://www.iso.org/standard/75652.html), [official SIST 27002:2022 preview](https://preview.sist.si/sist-preview/75652/f9b90f856c0d4c3dbef74cf67374d1c5/ISO-IEC-27002-2022.pdf) | Corrected 2022-03 edition; contents pp. iii–iv with organizational/people/physical/technology topic IDs | Corroborates topic identity, not the missing control bodies. 27002 implementation guidance is not automatically an additional mandatory 27001 requirement. All 93 candidate topics fit these contents. |
| [BSI implementation guide](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/27001_implementation_guide.pdf) | Support/operation/evaluation/improvement, printed pp. 6–7 | Publisher guidance, not exact full clauses. Publication date not established; incidental older training references were not adopted as the baseline. |
| [BSI self-assessment](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/self-assessment-questionnaire.pdf), [BSI client guide](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/27001-iso-client-guide.pdf) | 2025 copyright; checklist pp. 6–7 and client guide pp. 8–9 | Broad management-system/SoA themes only. Duplicated questionnaire items, unrelated BCMS text, marketing scores and services are not normative criteria. |
| [ANAB 2013/2022 comparison](https://blog.ansi.org/anab/iso-iec-27001-2013-2022-comparison/), [SGS comparison](https://www.sgs.com/-/media/sgscorp/documents/corporate/brochures/sgs-kn-iso-27001-2013-2022-guidance-doc-en.cdn.en-LV.pdf) | Selected changed support/operation/evaluation/improvement rows | Primary accreditor/certification-body commentary and selected comparisons, not complete unchanged clauses. SGS corroborates the displayed 2022 communication dimensions; ANAB's inconsistent adjacent narrative was not used to reintroduce the older communicator requirement. |
| [NIST SP 800-53 Rev. 5 pinned final PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf), [publication metadata](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) | Targeted AC-5, CA-2, PE-6, PS-3, SA-9, SI-19 comparisons | Supplemental security-practice corroboration, not an official equivalence crosswalk or ISO requirements source. The pinned PDF is not asserted to be the latest NIST control release. This reviewer did not independently revalidate every NIST mapping in the matrices. |
| [NIST SP 800-88 Rev. 2](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf) | Sanitization-result assurance, section 4.5 | Supports removal-result inquiry; does not require one technique, vendor or disposal certificate under ISO. |
| [NIST SP 800-218, SSDF 1.1](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf) | Selected PW.7 review/analysis practices | Supplemental software-development practices, not ISO normative authority; not a full SSDF verification. |

The organizational matrix's GSO-hosted HTML was inspected for topic material, but independent store-to-host provenance was not closed. An AWS hostname alone is not authority. The official SIST preview independently corroborates those topics; no substantive/full-source conclusion relies on GSO. No suspect full-standard copy, search snippet, another management-system standard, or draft generic Directives text was used to fill missing ISO requirements. Not every ancillary author-ledger URL or interpretive note was independently validated; the primary public boundaries above were checked where material.

## Per-definition dispositions

Each row covers **all** questions/help/remediation and any conditions in that definition, matched to its matrix rows. Titles below are the authored native runtime titles, not representations of exact official headings. `Q` is the authored-question count, including context and optional notes but excluding three evaluator-added context fields.

Source codes:

- **P**: exposed 27001 clause dimensions publicly compared; amendment checked where relevant. No broader completeness claim.
- **L**: practical clause topic/selected changed dimensions corroborated by public guidance; exact full clause obligations/qualifiers remain open (`L<ID>` in the ISMS matrix).
- **T**: Annex control topic independently corroborated by official 27002 contents; practical questions are original repository/supplemental guidance. Exact 27001 Annex A and corresponding 27002 body comparison remains open for that ID.

**Accept** means no demonstrated defect within these bounded original-guidance limits, not normative sign-off. **Reconcile F1** is the local definition defect. **Accept / query open** marks specific unresolved wording priority, not a demonstrated standards violation. F2 is a universal evaluator finding and applies irrespective of row disposition. Unless a row names a context gate or optional note, its questions are unconditional substantive selects; qualified “where/if/as appropriate” wording does not introduce whole-definition N/A.

### ISMS — 30 definitions / 239 questions

Catalog: `shared/catalogs/guidedIsoIsms.json`. Matrix: `docs/iso-omnibot/isms-content-matrix.md`.

| ID / native title | Q | Source | Concept, question and condition disposition | Decision |
| --- | ---: | --- | --- | --- |
| 4.1 — Context and external issues | 4 | P | Context and climate relevance; optional context note is neutral. | Accept |
| 4.2 — Stakeholder obligations | 3 | P | Parties, requirements and ISMS treatment; no climate programme inferred. | Accept |
| 4.3 — ISMS boundaries | 5 | P | Boundaries, dependencies and retrievable scope; no outsourcing exclusion. | Accept |
| 4.4 — ISMS processes | 5 | P | Connected operation, maintenance and improvement; not mere document existence. | Accept |
| 5.1 — Leadership accountability | 10 | P | Management direction and support separated into substantive inquiries. | Accept |
| 5.2 — Security policy direction | 7 | P | Policy commitments and availability; no prescribed policy name. | Accept |
| 5.3 — Accountable ISMS roles | 5 | P | Duties, authority and reporting; contact-name note remains optional. | Accept |
| 6.1.1 — Planning risks and opportunities | 11 | P | Context-informed planning, integration and effectiveness; no extra scoring method. | Accept |
| 6.1.2 — Risk assessment method | 20 | P | Criteria, repeatability, identification, analysis, evaluation and method records. | Accept |
| 6.1.3 — Treatment decisions and SoA | 14 | P | Necessary controls and justified SoA/owner decisions remain separate. | Accept |
| 6.2 — Measurable security objectives | 16 | P | Objective qualities and delivery planning; practicability qualification preserved. | Accept |
| 6.3 — Planned ISMS changes | 3 | P | Change-event gate hides execution only; planning readiness remains scored. | Accept |
| 7.1 — ISMS resources | 3 | L | Resource determination/provision, not purchasing a prescribed tool. Tool note optional. Exact lifecycle qualifiers remain open. | Accept |
| 7.2 — Role competence | 7 | L | Relevant capabilities/bases and retained evidence; action gate controls action/effectiveness children only. No universal certificate/course. Full personnel/action qualifiers open. | Accept |
| 7.3 — Workforce awareness | 4 | L | Policy, contribution/benefits and implications, not attendance alone. Exact awareness list/personnel scope open; no annual training mandate. | Accept |
| 7.4 — ISMS communications | 5 | L | What/when/audience/how are substantive; contact note optional. Does not recreate the removed separate 2013 communicator criterion. Exact full clause open. | Accept |
| 7.5.1 — Required records | 2 | L | Standard-needed versus organization-needed information distinguished. Full cross-referenced record inventory open; no artifact-name checklist invented. | Accept |
| 7.5.2 — Document creation and revision | 5 | L | Identification, format/media, review and approval queried separately. Detailed obligations/qualifiers remain low-confidence; no mandatory template. | Accept |
| 7.5.3 — Document protection and availability | 16 | L | Availability/protection and handling lifecycle separated. External-information gate hides its identification/control only. Applicable handling qualifiers/full exact protection wording remain open. | Accept |
| 8.1 — Controlled operational processes | 12 | L | Operational criteria/control/records remain scored. Planned change, unintended change and external provision gates each affect their own children only. Provider work is not exclusion. | Accept |
| 8.2 — Risk assessment execution | 6 | L | Planned intervals, established criteria and results; significant-change gate hides change execution only. Exact proposed/occurring-change trigger open; no numerical cadence. | Accept |
| 8.3 — Treatment execution | 2 | L | Treatment execution and retained results, not merely approval. Full exact duties open; approval/residual acceptance remain 6.1.3 topics. | Accept |
| 9.1 — Performance measurement | 12 | L | Measurement subjects/methods, validity, timing, responsibilities, analysis/evaluation and records. No invented metric/target. Full qualifications and role list remain open. | Accept |
| 9.2.1 — ISMS audit coverage | 5 | L | Planned audits query conformity and effective implementation/maintenance. Full conformity subjects remain open; no certification-audit substitution or annual minimum. | Accept |
| 9.2.2 — Internal audit program | 17 | L | Program, priority, each audit's scope/criteria, objectivity/impartiality, management reporting and records separated. Exact programme qualifications open; no mandatory external auditor. | Accept |
| 9.3.1 — Management review operation | 5 | L | Top-management review, planned timing and fit/adequacy/effectiveness. Full exact scope open; no committee/minute template or numerical interval. | Accept |
| 9.3.2 — Management review inputs | 13 | L | Previous actions, changes, interested parties, trends, feedback, risks/treatment and improvement inquiries separated. Complete input/trend list and qualifiers remain low-confidence/open. | Accept |
| 9.3.3 — Management review decisions | 3 | L | Improvement/change decisions and result records, not meeting attendance. Full result/information qualifications open; no mandatory minute format. | Accept |
| 10.1 — Ongoing ISMS improvement | 3 | L | Improvement of suitability/adequacy/effectiveness, not an arbitrary number of initiatives. Exact duty open; no quota, platform or cadence. | Accept |
| 10.2 — Nonconformity correction | 16 | L | Readiness always scored; event gate controls 14 response/cause/action/effectiveness/record children. No event is not clause exclusion. Full triggered/proportionality qualifiers remain open. | Accept |

### Organizational and people — 45 definitions / 186 questions

Catalog: `shared/catalogs/guidedIsoOrganizationalPeople.json`. Matrix: `docs/iso-omnibot/organizational-people-content-matrix.md`.

All rows have source **T**. Neither ISO metadata nor the NIST topic references close exact licensed comparison. The matrix's per-ID limits remain applicable, including legal applicability and exception qualifications.

| ID / native title | Q | Source | Concept, question and condition disposition | Decision |
| --- | ---: | --- | --- | --- |
| A.5.1 — Security policy governance | 6 | T | Documentation, approval, communication/acknowledgement and planned/change review separated. Exact audiences/triggers open; no numerical review cadence. | Accept |
| A.5.2 — Security role allocation | 4 | T | Assigned/communicated duties and accountable handoffs; owner-name note optional. Outsourcing is not accountability exclusion. Exact delegation qualifications open. | Accept |
| A.5.3 — Separation of conflicting duties | 3 | T | Conflict identification, separation and compensation all scored unconditionally. Approved authored alternative cannot offset separation `No`; exact compensation validity also open. | Reconcile F1 |
| A.5.4 — Management security expectations | 3 | T | Managers require/support appropriate security behavior and respond to departures. Does not prescribe a management title. Exact personnel/expectation scope open. | Accept |
| A.5.5 — Authority liaison | 4 | T | Relevant authority contacts, use circumstances, usable route and maintenance. No universal regulator/reporting deadline invented; applicable reporting obligations require separate determination. | Accept |
| A.5.6 — Security community liaison | 3 | T | Suitable community contacts and useful information/support, not joining a named body. Exact group/contact qualifications open; no paid-membership mandate. | Accept |
| A.5.7 — Threat-informed decisions | 5 | T | Information collection, relevance, analysis and actionable use distinguished. Tool-name note optional; no feed/vendor required. Exact intelligence obligations remain open. | Accept |
| A.5.8 — Security in projects | 4 | T | Security needs, project decisions, assigned work and delivery follow-through. Existing project methods allowed; exact lifecycle scope open, no parallel project system imposed. | Accept |
| A.5.9 — Asset and information inventory | 3 | T | Relevant information/assets, ownership and usable maintenance. Not just hardware discovery. Exact inventory scope open; NIST component inventory alone is insufficient corroboration. | Accept |
| A.5.10 — Acceptable-use rules | 3 | T | Known use/handling rules and their practical application. No prescribed policy name or workstation platform. Exact identification/documentation/implementation subjects open. | Accept |
| A.5.11 — Asset return | 3 | T | Return expectations, execution and unresolved assets across relevant departures/changes. Established arrangements can be described without an actual departure. Exact scope/qualifiers open. | Accept |
| A.5.12 — Information classification | 4 | T | Relevant protection needs, classifications, decisions and current suitability. No fixed number/names of levels. Exact classification factors and consistency qualifications open. | Accept |
| A.5.13 — Classification labels | 3 | T | Appropriate identification/labels and consistent handling linked to classification. Practical alternatives accepted; exact procedure/implementation qualifiers open, no mandatory label technology. | Accept |
| A.5.14 — Protected information transfers | 4 | T | Transfer protection/arrangements scored; external-party gate adds agreement inquiry only. No external transfer does not remove internal transfer questions. Exact agreement qualifications open. | Accept |
| A.5.15 — Access rules | 3 | T | Risk/business-driven physical/logical access rules and implementation. Not a universal RBAC architecture. Exact access-rule review and subject qualifications open. | Accept |
| A.5.16 — Identity lifecycle | 4 | T | Identity creation/use/change/closure accountability, not a named identity provider. Entire authored lifecycle queried; exact identity exceptions/control scope remain open. | Accept |
| A.5.17 — Credential handling | 5 | T | Secure allocation, protection, user guidance, change/recovery and closure. No vendor/password rotation period invented. Exact authentication-information duties remain open. | Accept |
| A.5.18 — Access entitlement lifecycle | 4 | T | Provisioning, review, adjustment and removal aligned with access rules. Organization-selected review timing; no annual minimum. Exact authorization/review qualifiers open. | Accept |
| A.5.19 — Supplier security | 4 | T | Supplier-related risk, suitable controls and responsibilities/ongoing handling. Outsourcing is not exemption; no compulsory supplier certification. Exact relationship scope remains open. | Accept |
| A.5.20 — Contractual supplier safeguards | 5 | T | Relevant security terms, mutual responsibilities and enforceable handling expectations. No universal contract template/certification. Exact agreement duties/legal enforceability remain open. | Accept |
| A.5.21 — Technology supply-chain safeguards | 4 | T | ICT supply-chain dependencies, risks and suitable requirements/checks. Not mandatory provenance from one service. Full downstream obligations/qualifications open. | Accept |
| A.5.22 — Supplier service oversight | 3 | T | Actual service monitoring/review and change/security follow-up. Provider assurance can contribute, not automatic success. Exact review/change qualifications open; no fixed cadence. | Accept |
| A.5.23 — Cloud service governance | 6 | T | Cloud governance remains scored; cloud-use gate controls four acquisition/use/change/exit probes. Provider-managed safeguards still need organizational oversight. Exact control qualifiers open. | Accept |
| A.5.24 — Incident preparation | 5 | T | Roles, plans and usable response readiness; external-coordination gate controls that subpart only. No named response platform/organization. Exact external-party scope open. | Accept |
| A.5.25 — Event triage | 3 | T | Evaluate/classify events and decide incident treatment, rather than ticket existence. No specific severity scale imposed. Exact criteria/decision qualifications remain open. | Accept |
| A.5.26 — Incident response execution | 5 | T | Established response approach remains scored; incident-event gate controls execution and follow-up children. No event does not prove response operation. Exact procedure duties open. | Accept |
| A.5.27 — Incident lessons | 4 | T | Learning readiness remains scored; actual-incident gate controls lessons and improvement use. No required postmortem tool. Exact learning scope/qualifications remain open. | Accept |
| A.5.28 — Incident evidence preservation | 6 | T | Evidence identification/collection/preservation readiness remains scored; evidence-event gate controls actual handling. No legal-admissibility promise. Exact evidence duties and jurisdiction open. | Accept |
| A.5.29 — Security during disruptions | 5 | T | Protective arrangements/readiness retained; disruption gate controls actual execution only. No event/outsourcing exclusion. Exact disruption/security level qualifications remain open. | Accept |
| A.5.30 — ICT continuity preparedness | 5 | T | Business-driven recovery needs, prepared ICT and meaningful exercising. No invented recovery-time objective/annual test. Exact planning/maintenance/testing qualifications open. | Accept |
| A.5.31 — Applicable obligations | 4 | T | Identify, maintain and apply relevant legal/regulatory/contractual obligations. Intake does not decide legal applicability. Exact documented duties and jurisdictional interpretations remain open. | Accept |
| A.5.32 — Intellectual-property safeguards | 3 | T | Relevant rights/licences and protective procedures/practice. No mandatory licensing service. Exact IPR subjects/qualifications open; no legal assurance from reported answers. | Accept |
| A.5.33 — Business record protection | 7 | T | Protection from loss, damage, falsification and unauthorized access/release, with suitable retention/availability. No universal retention duration or immutable-storage vendor. Exact protection list open. | Accept |
| A.5.34 — Personal-data safeguards | 4 | T | Relevant personal information, obligations and applied safeguards. Does not infer legislation or lawful bases. Exact privacy/PII qualifications and jurisdiction remain open. | Accept |
| A.5.35 — Independent security evaluation | 6 | T | Coverage, competence/independence, planned reviews and follow-up are substantive. Change question tests reconsideration, not execution; resolve significant-change qualifier against legitimate full source (Q1 below). | Accept / query open |
| A.5.36 — Security-rule adherence | 3 | T | Check actual compliance with applicable internal rules and handle deviations. No independent certification claim. Exact review subjects and qualifiers open; no numerical review interval. | Accept |
| A.5.37 — Operating instructions | 3 | T | Appropriate documented instructions, availability and usable currency. No mandatory runbook platform/document title. Exact procedure/documentation qualifications remain open. | Accept |
| A.6.1 — Pre-employment checks | 6 | T | Proportionate lawful screening/decisions; external-personnel assurance gate adds its subpart only. No universal criminal/credit check or agency required. Personnel/legal scope remains open. | Accept |
| A.6.2 — Employment security commitments | 3 | T | Relevant security responsibilities in employment arrangements, known and maintained. No universal contract template. Exact personnel/employer responsibility and legal qualifications open. | Accept |
| A.6.3 — Workforce security learning | 4 | T | Appropriate awareness/education/training and practical effectiveness/change needs. No annual course or certification required. Exact personnel scope and updating qualifications open. | Accept |
| A.6.4 — Disciplinary handling | 3 | T | Defined, known, proportionate process for security-rule violations. No prescribed penalty. Exact formal-process/personnel/legal qualifications open; interview cannot establish lawful disciplinary action. | Accept |
| A.6.5 — Departure and role-change duties | 4 | T | Responsibilities surviving departure/change, communication and implemented handoffs. No compulsory departure event. Exact continued-duty/personnel scope remains open. | Accept |
| A.6.6 — Confidentiality commitments | 4 | T | Relevant commitments, documented agreement/acknowledgement and suitable review. Exact signing versus acknowledgement requirements need licensed comparison; no universal NDA/title or enforceability claim. | Accept / query open |
| A.6.7 — Remote-work safeguards | 5 | T | Governance retained; remote-work gate controls workspace/device/connection probes. External-provider remote work not automatically irrelevant. Exact scope/protection qualifiers open; AC-17 alone does not cover workspace issues. | Accept |
| A.6.8 — Workforce event reporting | 4 | T | Known reporting routes, prompt reporting and usable receipt. No invented number of hours, tool or mandatory regulator notification. Exact event/timing/personnel qualifiers open. | Accept |

### Physical and technology — 48 definitions / 186 questions

Catalog: `shared/catalogs/guidedIsoPhysicalTechnology.json`. Matrix: `docs/iso-omnibot/physical-technology-content-matrix.md`. All rows have source **T**; each corresponding matrix `U:<ID>` remains unresolved.

| ID / native title | Q | Source | Concept, question and condition disposition | Decision |
| --- | ---: | --- | --- | --- |
| A.7.1 — Protected site boundaries | 3 | T | Suitable perimeters/boundaries, access limits and actual effectiveness. Provider premises still relevant. Exact perimeter/design qualifiers open; no universal fence or building design. | Accept |
| A.7.2 — Controlled site entry | 6 | T | Authorized entry, visitors and effective controls; delivery gate adds relevant handling only. No prescribed badge/guard vendor. Exact special entry/delivery qualifications open. | Accept |
| A.7.3 — Protected facilities | 4 | T | Offices/rooms/facilities protected for actual information/use risks. Multiple suitable arrangements allowed. Exact facility-design/application wording open; no compulsory private datacenter. | Accept |
| A.7.4 — Physical intrusion monitoring | 3 | T | Coverage, operating detection and response asked separately. Exact continuity/qualification requires full-source resolution (Q2); PE-6/topic heading does not close it. No camera mandate inferred. | Accept / query open |
| A.7.5 — Environmental hazard protection | 3 | T | Relevant physical/environmental threats, safeguards and functioning protection. No mandatory equipment bundle. Exact threat/design/implementation qualifications remain open. | Accept |
| A.7.6 — Secure-area working practices | 3 | T | Defined, understood and applied working precautions. No compulsory surveillance/escort arrangement for every site. Exact personnel/activity qualifications remain open. | Accept |
| A.7.7 — Clear desks and screens | 3 | T | Suitable physical/screen protection and observed practice, not policy existence alone. No fixed timeout or named product. Exact media/personnel/clear-screen qualifiers open. | Accept |
| A.7.8 — Protected equipment placement | 3 | T | Placement/protection responds to access and environmental risks. No universal locked-room design. Exact siting and protection requirements remain open. | Accept |
| A.7.9 — Off-site asset safeguards | 3 | T | Asset protection away from premises, responsibilities and practical handling. Provider/mobile arrangements considered. Exact offsite scope/qualifiers open; no tracking-vendor requirement. | Accept |
| A.7.10 — Media lifecycle safeguards | 4 | T | Suitable acquisition/use/transport/disposal protection, responsibilities and lifecycle practice. No single encryption/disposal technique. Exact classification/media duties remain open. | Accept |
| A.7.11 — Utility resilience | 3 | T | Supporting-utility needs, interruptions and usable resilience. No prescribed generator/UPS or autonomy duration. Exact utility protection/maintenance qualifications open. | Accept |
| A.7.12 — Protected cabling | 3 | T | Power/data cabling risks and applied protection/inspection. No universal conduit design or contractor certificate. Exact interception/interference/damage wording remains open. | Accept |
| A.7.13 — Equipment servicing | 6 | T | Suitable maintenance and controlled service/access; offsite-service gate affects that child only. No universal servicing interval. Exact maintenance/authorized-service qualifiers open. | Accept |
| A.7.14 — Equipment retirement and reuse | 4 | T | Identify residual information, remove/protect and check result before reuse/disposal. NIST sanitization supports practice, not ISO equivalence or mandatory certificate. Exact duties open. | Accept |
| A.8.1 — Endpoint safeguards | 3 | T | Relevant endpoint policy/protection and maintained practice, including managed/provider arrangements. No antivirus/MDM vendor mandate. Exact endpoint scope and qualifiers open. | Accept |
| A.8.2 — Privileged permissions | 4 | T | Identify, restrict/authorize, review and handle powerful access. No compulsory privileged-access product. Exact allocation/use/administration qualifications remain open. | Accept |
| A.8.3 — Restricted information access | 4 | T | Access needs, restrictions, enforcement and continuing suitable entitlements. No generic matrix substituted for actual scope. Exact access-rule exceptions/qualifiers open. | Accept |
| A.8.4 — Source-code access | 4 | T | Authorized source/development access and controlled changes/protection. Hosted tooling does not remove responsibility. Exact source/tool/library scope and qualifications remain open. | Accept |
| A.8.5 — Authentication safeguards | 4 | T | Authentication suited to restrictions, protected credentials and reliable operation. No universal MFA/SSO vendor mandate. Exact authentication-technique/procedure qualifications open. | Accept |
| A.8.6 — Capacity planning | 3 | T | Capacity needs, monitoring and suitable response to future/actual demand. No arbitrary utilization target or paid tool. Exact adjustment/projection obligations remain open. | Accept |
| A.8.7 — Malware defences | 4 | T | Relevant preventive/detection/response practices and awareness, maintained for actual exposure. No product/scan interval forced. Exact detection/prevention/recovery/personnel qualifiers open. | Accept |
| A.8.8 — Vulnerability handling | 4 | T | Relevant vulnerability information, exposure/risk decisions and timely treatment. No universal patch deadline or scanner vendor. Exact assessment/treatment/time qualifications remain open. | Accept |
| A.8.9 — Secure configuration | 4 | T | Appropriate configuration standards, applied settings, change control and review. No universal hardening benchmark/profile. Exact establish/document/monitor/review duties remain open. | Accept |
| A.8.10 — Information deletion | 4 | T | Deletion decisions, applied removal and checked results across relevant copies/providers. No universal retention/deletion method. Exact no-longer-required qualifications and legal constraints open. | Accept |
| A.8.11 — Data masking | 4 | T | Protection needs and suitable masking/access/usage decisions; practical controls evaluated rather than a named product. Exact business/legal/access qualifications open; no automatic obligation to mask every field. | Accept |
| A.8.12 — Data-loss prevention | 4 | T | Relevant information/leakage paths, controls and effective operation/response. Not compulsory purchase of a DLP suite. Exact system/network/device scope and qualifiers open. | Accept |
| A.8.13 — Recoverable backups | 4 | T | Coverage, protection, workable schedules and recovery checks. No universal backup interval or vendor. Exact copy/test/retention qualifiers open; F2 reproduced here is evaluator-wide. | Accept |
| A.8.14 — Processing redundancy | 3 | T | Availability needs, suitable redundancy and functioning resilience. No universal active-active topology. Exact redundancy/availability qualifications remain open. | Accept |
| A.8.15 — Security event logs | 5 | T | Relevant events, generation, protection/retention and usable review. No universal log duration/SIEM requirement. Exact logging/analysis/retention subjects and qualifiers open. | Accept |
| A.8.16 — Activity monitoring | 4 | T | Meaningful monitored activity, abnormality detection and investigation/response. No continuous human-watch/vendor mandate. Exact abnormal-behavior scope and action qualifiers remain open. | Accept |
| A.8.17 — Aligned system clocks | 3 | T | Suitable time references, actual synchronization and problem handling. No required time vendor/tolerance invented. Exact relevant-system/reference qualifications open. | Accept |
| A.8.18 — Privileged utility use | 4 | T | Powerful utilities identified, limited, authorized and monitored. No ban on every utility or named platform. Exact overriding-control/use qualifiers remain open. | Accept |
| A.8.19 — Software installation controls | 4 | T | Suitable authorization, secure installation and controlled departures. No compulsory package-management service. Exact operational-system/procedure qualifications remain open. | Accept |
| A.8.20 — Network protection | 4 | T | Appropriate boundaries/devices, controls and usable management/protection. No firewall brand or topology prescribed. Exact network/device/service qualifiers remain open. | Accept |
| A.8.21 — Network-service safeguards | 4 | T | Relevant service needs, agreed delivery/security and actual oversight, including external services. No universal SLA figure. Exact security mechanism/service-level/management duties open. | Accept |
| A.8.22 — Network segmentation | 3 | T | Risk-appropriate separation and enforced boundaries between groups. No universal VLAN/physical-separation architecture. Exact group/service/user/system qualifiers remain open. | Accept |
| A.8.23 — Web-content controls | 4 | T | Relevant content risks, workable access controls and handled exceptions/operation. No mandatory filter vendor/category blacklist. Exact access-management/control qualifications remain open. | Accept |
| A.8.24 — Cryptographic safeguards | 5 | T | Suitable cryptographic use and managed keys queried substantively; arrangement/tool note optional. No algorithm/vendor prescribed. Exact cryptographic-rule/key-management qualifiers open. | Accept |
| A.8.25 — Secure development lifecycle | 3 | T | Established security rules and actual lifecycle application/checking. No required development methodology or gate platform. Exact software/system lifecycle qualifications open; SSDF supplemental. | Accept |
| A.8.26 — Application security needs | 4 | T | Identification, agreement, acceptance usefulness and change reconsideration. Full-source approval qualification needs checking (Q3). Procurement/services included; no mandatory requirements committee. | Accept / query open |
| A.8.27 — Secure architecture principles | 3 | T | Established principles, actual design application and consequential-change review. Full-source documentation/maintenance qualifications need checking (Q3). No universal architecture framework/redesign imposed. | Accept / query open |
| A.8.28 — Secure coding practices | 4 | T | Appropriate coding rules, use, review and defect correction. Existing languages/toolchains allowed; no named scanner required. Exact secure-coding qualifications open; SSDF supplemental. | Accept |
| A.8.29 — Security testing before acceptance | 4 | T | Relevant planned testing, meaningful execution/results and informed acceptance. No vendor/test-count requirement. Exact development/acceptance testing duties and qualifiers remain open. | Accept |
| A.8.30 — Outsourced development oversight | 4 | T | External development direction/monitoring/review and acceptance responsibilities. Outsourcing is not exemption; no vendor certification mandate. Exact oversight and contractual qualifications open. | Accept |
| A.8.31 — Separated development and production | 4 | T | Appropriate separation, access/change protection and usable operation. No universal physical separation/account topology. Exact development/test/production protection qualifications open. | Accept |
| A.8.32 — Controlled changes | 6 | T | Impact, authorization and implementation checks remain scored; urgent-change gate adds its subpart only. No required CAB/tool. Exact system/change-process duties remain open. | Accept |
| A.8.33 — Protected test information | 5 | T | Suitable selection/protection/handling retained; live-derived-data gate controls that safeguard only. No blanket requirement to copy production data. Exact information-management duties open. | Accept |
| A.8.34 — Safe audit testing | 5 | T | Agreed scope, safe access/testing and stop/closure practices. No arbitrary maintenance window/vendor. Exact audit-test planning/agreement duties open; closure details are supporting guidance. | Accept |

## Unresolved source/query priorities — not proven ISO defects

These priorities do not replace the matrices' complete per-ID source-gap ledgers.

1. **Q1 / A.5.35**, `ISO-A.5.35-change-review`, catalog line 4305: “reconsidered” measures a decision to consider review, not performance after a significant change. All-positive choices with detail that a review was reconsidered but not conducted still yield `addressed`. The same definition's timing remediation mentions carrying out reviews at significant-change triggers, while this prompt only asks reconsideration. Compare the exact legitimate licensed trigger/qualifications and then align prompt, remediation and matrix dimension. Do not assert a triggered-review obligation from a TOC heading or invent a review interval. This reviewer cannot settle the normative duty from accessed body text.
2. **Q2 / A.7.4**, `ISO-A.7.4-detection`: the authored “when protection is needed” inquiry and examples need comparison against exact continuity/coverage qualifiers. The official TOC and NIST PE-6 support the monitoring topic, not that particular ISO qualification. Preserve the existing `U:A.7.4` limitation; do not infer an obligatory 24/7 camera system.
3. **Q3 / A.8.26, A.8.27 and A.6.6**: prioritize exact approval versus agreement, documentation/maintenance of principles, and signing/acknowledgement qualifications. The current practical questions are useful but public topic/supplemental practice cannot confirm equivalence of these verbs. No omitted normative obligation is alleged without legitimate full-source comparison.
4. **Clauses 7.5.2, 7.5.3, 9.3.2 and 10.2**: detailed handling/input/action lists exceed what broad publisher guidance alone can fully validate. Keep the corresponding low-confidence/full-clause gaps open. Legal-sensitive A.5.31/A.5.34/A.6.1 additionally require applicable-law determination, not generic interview inference.

## Evaluator, alternatives and unknowns — verified behavior

The evaluator was read completely. The connected assessor's optional-context explanation was also inspected. No browser or authenticated workflow was exercised.

- **583 select questions** use `Yes / Partially / No / Not sure`; **21 context gates** use `Relevant / Not relevant here / Not sure`; **7 authored text notes** are optional. There are **44 conditional children**, all local to the same definition and activated by a context parent equal to `Relevant`. All 123 definitions retain unconditional substantive selects.
- `No` on any active substantive question yields `needs_attention`. `Partially` supplies an implementation gap; with a meaningful answer and no `No`, status is `in_progress`. Substantive uncertainty supplies confirmation items. With no meaningful substantive answer and no `No`, status is `not_assessed`; otherwise all-positive active substantive answers and resolved context yield `addressed`.
- A context choice does not count as successful implementation. `Not sure` hides its conditional children but remains an unresolved confirmation signal; it never silently establishes irrelevance. `Not relevant here` requires a nonblank reason for completion and hides only its named subpart. Neither context nor interview status edits SoA or makes an entire clause/control N/A.
- Every active substantive select remains required for completion. Empty substantive answers do not complete. All-unknown substantive answers are `not_assessed`, not `addressed`.
- Every substantive `_detail` field is contextual prose, not an alternative scoring rule. Unknown owner/tool names in those details do not penalize an affirmative practice. Alternative details also do not repair a negative substantive question: approved alternatives must be represented in query semantics (F1).
- The seven optional authored notes (`ISO-4.1-context-note`, `ISO-5.3-contact-note`, `ISO-7.1-tools-note`, `ISO-7.4-contact-note`, `ISO-A.5.2-owner-note`, `ISO-A.5.7-tool-note`, `ISO-A.8.24-arrangement-note`) do not affect status. The three evaluator-added `gaps / unknowns / evidence` fields are also unscored; F2 concerns truthful presentation, not promotion of prose to scoring input.
- The result explicitly describes reported implementation, not independent verification/certification. The existence of a record, tool or paid service is not a positive substantive answer by itself. No fixed vendor, occupational title, numerical cadence, or whole-clause exclusion was found imposed in the reviewed authored prompts/help/remediation. Exact mandatory subject/qualifier completeness remains unresolved where stated above.

## Verification performed and reproducibility

In-memory Node.js v24.19.0 checks loaded the exact evaluator source, replacing only its three build-tool catalog import declarations with the reviewed JSON content. No evaluator logic was changed and no script, fixture, generated catalog or cache file was written.

**3,182 assertion checks passed**, covering native identity/title/specification; unique question IDs; question/choice/dependency structure; unconditional substantive coverage; all-positive/empty/all-negative/all-partial/all-unknown cases; individual `Partially`, `No`, `Not sure` transitions for all substantive selects; optional/detail neutrality; every context gate's unknown/irrelevant/reason-required behavior; and exact one-to-one matrix question-row coverage. Counts independently reconciled: 30 + 45 + 48 definitions, 239 + 186 + 186 matrix question rows, 447 groups and 611 questions. An initial check-run parser incorrectly matched non-question source-ledger rows; its regex was corrected and the assertions rerun successfully. That harness mistake is not a candidate defect.

The two findings were separately rerun against unchanged reviewed hashes. From the worktree root, the following PowerShell command performs the focused reproductions entirely in memory. Expected results: F1 `needs_attention`; F2 `addressed`, both notes retained, and the contradictory no-items sentence present.

```powershell
@'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
let source = readFileSync('frontend/src/lib/isoGuidedAssessment.js', 'utf8');
for (const [binding, file] of [
  ['isms', 'guidedIsoIsms.json'],
  ['organizational', 'guidedIsoOrganizationalPeople.json'],
  ['technology', 'guidedIsoPhysicalTechnology.json']
]) {
  const declaration = `import ${binding} from '@catalogs/${file}';`;
  assert(source.includes(declaration));
  source = source.replace(declaration,
    `const ${binding} = ${readFileSync(`shared/catalogs/${file}`, 'utf8')};`);
}
const qa = await import('data:text/javascript;base64,' +
  Buffer.from(source).toString('base64'));
const positive = id => Object.fromEntries(
  qa.isoGuidedCatalog.definitions[id].groups.flatMap(g => g.questions)
    .filter(q => q.type !== 'text')
    .map(q => [q.id, q.type === 'context' ? 'Relevant' : 'Yes']));
const alternative = positive('A.5.3');
alternative['ISO-A.5.3-separation'] = 'No';
alternative['ISO-A.5.3-separation_detail'] =
  'Full separation is impractical; conflicts are assessed and independently reviewed through an effective compensating check.';
qa.validateIsoCompletion('A.5.3', alternative);
const f1 = qa.isoGuidedResult('A.5.3', alternative);
assert.equal(f1.status, 'needs_attention');
const notes = positive('A.8.13');
notes.gaps = 'Backup coverage is missing for the finance database.';
notes.unknowns = 'Whether backups can be restored has not been confirmed.';
qa.validateIsoCompletion('A.8.13', notes);
const f2 = qa.isoGuidedResult('A.8.13', notes);
assert.equal(f2.status, 'addressed');
assert.equal(f2.nextSteps.length, 0);
assert(f2.narrative.includes(notes.gaps));
assert(f2.narrative.includes(notes.unknowns));
assert(f2.narrative.includes(
  'No confirmation or remediation items were reported in this interview.'));
console.log({F1: f1.status, F2: f2.status, retainedNotes: true,
  contradictoryNoItemsSentence: true});
'@ | & 'C:/Users/RobbA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module
```

These are isolated evaluator/content checks, not a configured application test-suite result. No frontend production build, lint/type check, backend persistence/authorization test, hosted test, browser acceptance, migration, deployment or client-data validation was performed by this reviewer. Main integration/testing is a separate workstream; its results are not claimed here. Passing this content/evaluator check is not complete end-to-end or independent application-security assurance.

## Exact reviewed snapshot

The worktree was already dirty and integration was concurrent. HEAD advanced during review; the last observed HEAD before report creation was `1ba91c30c3dab074e85e3d6e09fca2f822e79184`. No commit was made by this reviewer. The seven reviewed content/evaluator file hashes remained unchanged across the review/reproduction checks. Conclusions apply to these bytes; recheck affected dispositions if integration changes them.

| File | SHA-256 |
| --- | --- |
| `shared/catalogs/guidedIsoIsms.json` | `aee5dd598d29c3c2b3488aafda5b332594029a82aa8f387c8c0daf13472edf6e` |
| `shared/catalogs/guidedIsoOrganizationalPeople.json` | `2d4760cfbbfb399064add38f5ec4f126d9ee67af1bca97a591ddca432718047e` |
| `shared/catalogs/guidedIsoPhysicalTechnology.json` | `3d3947897784586c95fa5f9e8f62cf8b7089fe07aab1c27483dd032f6bedbca2` |
| `docs/iso-omnibot/isms-content-matrix.md` | `ac915d509d1cb2047abc64a2529493b69f13ec15df2f6ed3365b047d107e2377` |
| `docs/iso-omnibot/organizational-people-content-matrix.md` | `129c3ef2d25e647a6376cf9fa37b920bfa40ad215d982f8227d3cfaec47740cf` |
| `docs/iso-omnibot/physical-technology-content-matrix.md` | `f35aea40991cfbe0f24247ccae786d363903832ce4a3733c8be07ca8da16e294` |
| `frontend/src/lib/isoGuidedAssessment.js` | `ff9e5cab4a8a0bd06f3b1cecda1a4000e0dca243a4994decf433c162ee45e1a8` |

No implementation remediation was attempted. The two demonstrated issues and all open source limits are left for the authorized integrating workstream.

## Remediation re-review — 2026-10-11

What this change does: A.5.3 now asks explicitly about actual separation **or** a justified alternative with evaluated, effective compensating checks. The generated summary and exported answer labels now distinguish optional notes from actions derived from selected substantive answers. The evaluator's choice interpretation, status calculation, dependencies and question-set structure are unchanged.

**Disposition: F1 resolved; F2 resolved for the reviewed local candidate. No new actionable defect found in this narrow re-review.** This addendum supersedes the original open F1/F2 dispositions and the A.5.3 table decision only. The original findings, per-definition review and snapshot are retained as historical evidence. All 123 definition dispositions are now acceptable within the original bounded practical-guidance scope; the exact licensed/source/query limitations are not closed.

### F1 remediation disposition

Reviewed `shared/catalogs/guidedIsoOrganizationalPeople.json:323–328`, `ISO-A.5.3-separation`, its connected `ISO-A.5.3-exceptions` question, the existing authored guide, matrix row 108, and the new regression test in `frontend/src/lib/isoGuidedAssessment.test.js:47–54`.

- Prompt/help/topic/remediation now express the justified, evaluated effective alternative directly. Help expressly rejects a merely accepted exception and disclaims approval/conformity conclusions. The matrix retains qualified licensed-source comparison of a particular arrangement.
- All three substantive A.5.3 questions remain active and required for completion. All affirmative answers, including affirmative reporting of an evaluated effective alternative, yield `addressed`. `No` on the separate exceptions question yields `needs_attention`; `Partially` or `Not sure` there yields `in_progress` when other answers are affirmative. An accepted exception with absent or unconfirmed effective checks is not converted to implementation success.
- All **64 combinations** of the three four-choice answers were independently exercised. Any substantive `No` still yields `needs_attention`; partial/unknown choices retain the existing rules. Supporting prose cannot override a selected `No`; an old literal separation `No` remains `needs_attention`. No new inference, exception-approval logic, choice, condition or whole-control N/A was introduced.
- The evaluator still relies on reported choices; it does not independently verify effectiveness or decide whether a specific arrangement satisfies ISO. Resolving this authored query mismatch does not close the licensed A.5.3 qualification gap.

The user reports that version `iso27001-omni-1` has never been hosted/deployed. Retaining that identifier is accepted for this **user-reported unpublished candidate**, not permission to reinterpret already deployed historical interviews after a meaning change. Deployment history, hosted records and the absence of persisted earlier-version answers were not independently inspected in this read-only/no-browser review. If that publication premise changes, content-version compatibility needs a separate explicit decision.

### F2 remediation disposition

Reviewed `frontend/src/lib/isoGuidedAssessment.js:12–13,119–125`, the connected assessor's existing optional-context explanation, exported answer prompts, and the new regression test in `frontend/src/lib/isoGuidedAssessment.test.js:57–63`.

- The empty-action sentence now refers specifically to actions derived from selected substantive answers. Optional reported concerns are retained in a separately labeled breakdown, with an instruction to review them separately without changing the proposed status.
- Exported gap/confirmation prompts explicitly say optional and not a status decision. Empty or unknown owner/tool/context values remain neutral. Substantive negative/partial/unknown choices still produce their normal statuses and actions; no natural-language scoring was introduced.
- Repeated the original A.8.13 reported-backup-gap/restore-uncertainty case: `addressed`, no derived gaps/unknowns/actions, both notes retained, no false all-interview no-items claim. Also checked each note separately, both together and whitespace-only notes. The new summary does not pretend optional concern text was independently reconciled or verified.
- Across **all 123 definitions**, affirmative choices plus optional concern/unknown notes retain `addressed` and explicit neutral exported labels. Changing a substantive choice to `No`, `Partially` or `Not sure` still gives the expected negative/partial/unresolved result even when optional notes are present.

### Narrow diff and verification evidence

The files are untracked in the concurrently edited worktree, so a normal Git diff against HEAD does not represent their initial reviewed versions. Instead, the exact targeted changes were reversed **in memory only** and the resulting bytes hashed against the original snapshot in this report:

- Organizational catalog: reversing only the four A.5.3 prompt/help/topic/remediation string changes reproduces original SHA-256 `2d4760cfbbfb399064add38f5ec4f126d9ee67af1bca97a591ddca432718047e` exactly.
- Evaluator: reversing only the two optional labels, optional-context heading and no-action narrative text reproduces original SHA-256 `ff9e5cab4a8a0bd06f3b1cecda1a4000e0dca243a4994decf433c162ee45e1a8` exactly. This verifies no scoring, validation, dependency, API or version logic change in that file.
- Organizational matrix: reversing only the A.5.3 topic and its remediation/source-limit explanation reproduces original SHA-256 `129c3ef2d25e647a6376cf9fa37b920bfa40ad215d982f8227d3cfaec47740cf` exactly.
- Both other catalogs and matrices remain byte-identical to the original snapshot. The complete current test file was reviewed; the original review did not record a test-file hash, so an exact historical test-file byte diff is not claimed.

Verified unchanged structure: **123 definitions (30/93), 447 groups, 611 authored questions (583 select / 21 context / 7 optional text), 44 conditional children**, native titles/specifications, globally unique question IDs, unconditional substantive coverage, local context dependencies, and one matching matrix row per question. Question/group IDs, choices, conditions, version and all non-target catalog content remain unchanged, supported by the exact reconstruction above.

Focused configured frontend test command, from `frontend`:

```powershell
$env:CI = 'true'
$env:BABEL_DISABLE_CACHE = '1'
$env:ENABLE_HEALTH_CHECK = 'false'
& 'C:/Users/RobbA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' `
  'node_modules/@craco/craco/dist/scripts/test.js' `
  --watchAll=false --runInBand --no-cache --coverage=false `
  --runTestsByPath src/lib/isoGuidedAssessment.test.js
```

**PASS: 1 suite, 128 tests, 0 snapshots; exit 0.** This includes per-definition status/context-neutrality checks and both added regression cases. Caches, coverage and snapshot updating were disabled; no dependency install or application build was performed.

Additional independent, in-memory Node v24.19.0 assertions: **PASS, 2,474 checks**, including the structural/matrix reconciliation, all 123 optional-note/export cases, negative/partial/unknown substantive changes, all 64 A.5.3 choice combinations, alternative/detail neutrality, separate exceptions decisions, and the A.8.13 retained-note cases. Only build-tool catalog imports were substituted in memory, as in the initial review. An initial supplementary-harness selector incorrectly included a substantive prompt containing the word “context”; it was corrected to exact optional-label membership and rerun. That reviewer-harness error was not a product failure.

Connected assessor and backend `result_status` were inspected for the unchanged choice-driven flow. No backend suite, permission/persistence test, browser workflow, build, lint/type check, hosted revision, historical-client-data or deployment verification was run in this narrow re-review. The original **111-definition exact licensed-validation limit**, Q1–Q3 priorities, legal-applicability qualifications and other source limitations remain open. No fresh normative conclusion or blanket ISO/NIST equivalence is asserted.

### Remediation snapshot

Observed HEAD: `1ba91c30c3dab074e85e3d6e09fca2f822e79184`; the working files below, not HEAD alone, identify the reviewed candidate. Candidate version remains `iso27001-omni-1`. No commit or deployment was performed by this reviewer. Only this report was appended; application/catalog/test/matrix files were not edited by the reviewer.

| Reviewed file | Remediation SHA-256 |
| --- | --- |
| `shared/catalogs/guidedIsoIsms.json` | `aee5dd598d29c3c2b3488aafda5b332594029a82aa8f387c8c0daf13472edf6e` |
| `shared/catalogs/guidedIsoOrganizationalPeople.json` | `3a819ec500097c7236927bbe52c00bcf5d7431ac6a96feffa73a402ce1e6484a` |
| `shared/catalogs/guidedIsoPhysicalTechnology.json` | `3d3947897784586c95fa5f9e8f62cf8b7089fe07aab1c27483dd032f6bedbca2` |
| `docs/iso-omnibot/isms-content-matrix.md` | `ac915d509d1cb2047abc64a2529493b69f13ec15df2f6ed3365b047d107e2377` |
| `docs/iso-omnibot/organizational-people-content-matrix.md` | `a52721164917673f260aff92343d43fbf6a0a9bc4a1334be50076528dba8b902` |
| `docs/iso-omnibot/physical-technology-content-matrix.md` | `f35aea40991cfbe0f24247ccae786d363903832ce4a3733c8be07ca8da16e294` |
| `frontend/src/lib/isoGuidedAssessment.js` | `34c945e9f07ff5ff49db5f96d22c5385e9a7df72e827939e68c4706ad1c90867` |
| `frontend/src/lib/isoGuidedAssessment.test.js` | `73614c640c5d8659c6042393d010b19f6af5b3f81aaf35f49262d77fd1ac814d` |

Verdict: accept these two local remediations. No remaining must-fix finding from this narrow pass; this is not a release/deployment or exact licensed-conformance sign-off.
