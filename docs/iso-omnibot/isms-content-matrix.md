# ISO OmniBot ISMS interview content matrix

Research and content preparation: 2026-10-11. Catalog: `shared/catalogs/guidedIsoIsms.json`.
Contract: `version: iso27001-omni-1`, `framework_id: iso-27001`, native-ID `definitions` object.

## Coverage and meaning

All 30 native leaf-level ISMS units in clauses 4–10 have original practical interviews,
with 123 groups and 239 questions:
227 select questions, eight conditional context questions and four optional text notes.
Native titles and `isms_clause` specifications are preserved. Question/group IDs
are ISO-prefixed and stable within this version; existing criteria IDs, catalogs
and historical selections are not replaced.

This is full **unit and practical-topic coverage**, not full normative verification.
The legitimate SIST preview exposes the 12 units in clauses 4–6. Current public
publisher guidance supports original usable inquiries for all 18 units in clauses
7–10, but their complete exact requirements remain unresolved. No unauthorized
full PDF was obtained, and no exact normative paragraphs are reproduced.
ISO's current publication records still identify the 2022 edition with the 2024
climate amendment; this content makes no certification or conformity conclusion.

Every question has one matrix row below. Source IDs resolve through the ledger.
For clauses 7–10, a clause-number pointer identifies the **intended mapping**;
where only a broad BSI chapter or repository topic was available, it does not
represent access to that numbered normative paragraph. Partial ANAB/SGS comparison
rows provide stronger support for the explicitly identified dimensions only.
Confidence describes source support for the inquiry, not verification of a
client's answer or certainty that every licensed qualification is captured.

## Interview and applicability rules

- Select choices are exactly Yes / Partially / No / Not sure.
- Context choices are exactly Relevant / Not relevant here / Not sure. The engine
  must require a substantive reason for Not relevant here. It scopes only the
  named activity; it cannot exclude an ISMS clause or alter SoA applicability.
- A conditional child uses `condition: {id, equals: "Relevant"}` pointing to a
  context question in the same definition. An unknown context remains material
  uncertainty; hidden children must not produce an automatic success conclusion.
- Every unit retains an unconditional substantive question. Readiness questions
  for triggered duties discuss the response arrangement when no example exists;
  they do not manufacture operational evidence or declare the clause N/A.
- Optional notes about examples, tools or contacts use `type: text`, no choices
  and empty remediation. Empty notes or unknown tool/contact names do not affect
  status. Required assignment of responsibility, risk-owner approval and delivery
  responsibility are assessed separately.
- Examples in help are alternatives, not prescribed document titles, products,
  committees, certifications or numerical schedules. Planned intervals stay
  organization-planned intervals. Where/as-appropriate qualifiers remain visible.
- The 4.1 climate decision is always asked. A reasoned not-relevant determination
  can answer it positively; a skipped climate assessment cannot. The 4.2 climate
  note is guidance within determining actual relevant stakeholder requirements,
  not an invented standalone climate-program obligation.
- Necessary-control selection, Annex A comparison, SoA justification,
  implementation state, treatment-plan approval and residual-risk acceptance
  remain separate. Clause interviews never exclude Annex A controls, accept risk,
  complete audit work or change Findings/Actions automatically.

## Source ledger

All public sources listed below were accessed through web tools on 2026-10-11.
Dates in source descriptions distinguish publication/copyright from access.
Repository sources were inspected in this isolated worktree.

| Source ID | Source | Accessed section and authority boundary |
| --- | --- | --- |
| ISO-EDITION | [ISO/IEC 27001:2022 edition record](https://www.iso.org/standard/27001) | Official current publication metadata; edition 3, published October 2022. Identity only, not detailed clause coverage. |
| ISO-AMENDMENT | [ISO/IEC 27001:2022/Amd 1:2024 record](https://www.iso.org/standard/88435.html) | Official current amendment metadata; published 23 February 2024. Confirms climate amendment applies to the 2022 edition. |
| ISO-PREVIEW | [SIST official ISO/IEC 27001:2022 preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf) | Legitimate member-body preview. Printed pp.1–5 expose clauses 4–6; Scope on p.1 disallows exclusion of clauses 4–10 for conformity. Clauses 7–10 appear in contents only, without their body text. |
| ISO-CLIMATE | [ISO/IAF climate communiqué, 22 February 2024](https://www.iso.org/files/live/sites/isoorg/files/standards/popular_standards/management_systems/ISO-IAF%20Joint%20Communique%20Feb%202024.pdf) | Official public communication, section 2.1 pp.1–2 and intent section 2.2 p.2. Confirms climate relevance decision in 4.1 and the interested-party climate note in 4.2; explicitly lists ISO/IEC 27001:2022 on p.3. |
| ISO-SOA-NOTE | [SC27-hosted Auditing Practices Note — SoA](https://committee.iso.org/files/live/sites/jtc1sc27/files/resources/ISO-IECJTC1-SC27-WG1_N3298_Auditing%20Practices%20Note%20-%20SoA.pdf) | Educational note dated September 2022, introductory questions and relationship discussion pp.1–3 (after cover). Explicitly not ISO/SC27-endorsed normative guidance. Corroboration only; not the authority for a mandatory question. |
| BSI-IMPLEMENTATION | [BSI ISO/IEC 27001 implementation guide](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/27001_implementation_guide.pdf) | Publisher guidance linked by BSI's current 2022-standard page. Printed p.6 covers Support; p.7 covers Operation, Performance evaluation and Improvement. Broad interpretation, not the complete normative sections. Publication date was not established; incidental 2013 training text is not used as current requirements. |
| BSI-SELF-ASSESSMENT | [BSI ISMS self-assessment checklist](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/self-assessment-questionnaire.pdf) | Copyright 2025, linked as a 2022 questionnaire by BSI. p.6 items 17–23 cover support/operation; p.7 items 24–29 cover evaluation/correction. Guidance only: duplicated items, BCMS text and marketing scoring are not adopted. |
| BSI-CLIENT | [BSI 27001 client guide](https://www.bsigroup.com/siteassets/pdf/en/insights-and-media/insights/brochures/27001-iso-client-guide.pdf) | Copyright 2025. pp.8–9 corroborate management-system themes and SoA including additional controls. Broad guidance only; not a detailed clause checklist. |
| ANAB-CHANGES | [ANAB ISO/IEC 27001:2013 and 2022 comparison](https://blog.ansi.org/anab/iso-iec-27001-2013-2022-comparison/) | Accreditation-body authored comparison; page shows March 2023 and July 2025 dates. Matrix rows support selected changes in 7.2, 7.4, 7.5.1/3, 8.1, 9.1, 9.2, 9.3.3 and 10.2. It is a comparison, not all unchanged requirements. |
| SGS-CHANGES | [SGS comparison of 2022 and 2013](https://www.sgs.com/-/media/sgscorp/documents/corporate/brochures/sgs-kn-iso-27001-2013-2022-guidance-doc-en.cdn.en-LV.pdf) | Certification-body authored guidance; section 3.1 p.3 clarifies 7.4 and 8.1; p.4 clarifies 9.1 and changes in interested-party needs under 9.3.2; p.5 covers external provision and available result information. Not the complete normative clauses. |
| REPO-NATIVE | [Native ISO catalog](../../shared/catalogs/iso27001.json) | Existing authorized product IDs, authored titles and specification. Current work preserves its 30 clause units and does not modify it. |
| REPO-GUIDE | [Existing original requirement guidance](../../shared/catalogs/operatorGuidance/isoRequirementGuide.json) | Per-ID original practical interpretation and nonexclusive evidence examples; supports original interview design, not normative completeness. |
| REPO-CRITERIA | [Existing assessment-criteria catalog](../../shared/catalogs/operatorGuidance/isoAssessmentCriteria.json) | 96 separate authored checks in 12 exposed clause units, checked in existing documentation. Existing 18 clause units in 7–10 remain pending; this new interview does not change that flag. |
| REPO-CRITERIA-DOC | [Existing criteria coverage record](../iso-assessment-criteria.md) | Bounded comparison of exposed clauses 4–6, including prior qualifier corrections. No fixed cadence or evidence artifact titles become obligations. |
| REPO-LIMITS | [Existing substantive validation](../iso-substantive-validation.md) | Exact-source and reproduction limitations, including bounded public-preview addendum. |
| REPO-INPUTS | [Existing missing-source inventory](../iso-assessment-source-inputs.md) | Identifies missing complete clauses 7–10 and distinction between comparison access and official-wording distribution. |
| BSI-PUBLISHER | [BSI current standard resource page](https://www.bsigroup.com/en-SG/products-and-services/standards/iso-iec-27001-information-security-management-system/) | Current publisher page linking the BSI guides and questionnaire above as ISO/IEC 27001:2022 resources. Provenance of public guidance; no full standard downloaded. |

The SC27 SoA note is explicitly non-endorsed educational interpretation. Mandatory
SoA dimensions here are grounded in the exposed 6.1.3 preview, not that note.
The current ISO/IEC Directives page was also inspected, but it identifies the
2026 edition; it was not substituted for the 2022 information-security standard.

## Matrix legend

| Mark | Meaning |
| --- | --- |
| M | Original interview for a mandatory dimension supported by an exposed clause 4–6 unit or official climate communication. |
| C | Original interview for a condition/qualifier in an exposed clause; the clause itself remains mandatory. Includes direct qualified questions and event-context gates. |
| M* | Original inquiry into an expected mandatory dimension in a clause 7–10 unit. Public guidance or a partial comparison supports the topic; complete exact licensed requirements have not been checked. |
| C* | Original inquiry into an expected conditional/qualified duty in clauses 7–10, or the actual event-context gate. Full exact qualifiers remain pending. |
| G | Optional original explanatory note. No additional mandatory requirement and no status effect. |
| high | Direct exposed-unit or official-amendment support; for G, clear original optional guidance. |
| medium | Public publisher interpretation or a partial comparison corroborates the inquiry; exact full unit is unavailable. |
| low | Fine-grained original inquiry mainly supported by existing repository interpretation and broad public chapter coverage; confirm exact normative detail. |
| P0 | No missing body text for the mapped dimension within the accessed preview/official climate communication. Not a completeness claim for other units or redistribution rights. |
| G0 | Optional practical context only; no unresolved mandatory duty is created by this note. |
| Lx | Exact licensed-source gap for unit x, detailed in the gap ledger below. |

## Source-to-question matrix

| Question ID | Native unit | Source / section or intended mapping | Mandatory / conditional / guidance | Confidence | Unresolved exact licensed requirements |
| --- | --- | --- | --- | --- | --- |
| ISO-4.1-internal | 4.1 | ISO-PREVIEW: 4.1 | M | high | P0 |
| ISO-4.1-external | 4.1 | ISO-PREVIEW: 4.1 | M | high | P0 |
| ISO-4.1-climate-decision | 4.1 | ISO-CLIMATE: Amd 1:2024, 4.1; communiqué section 2.1 | M | high | P0 |
| ISO-4.1-context-note | 4.1 | REPO-GUIDE: 4.1 practical explanation | G | high | G0 |
| ISO-4.2-parties | 4.2 | ISO-PREVIEW: 4.2 a | M | high | P0 |
| ISO-4.2-requirements | 4.2 | ISO-PREVIEW; ISO-CLIMATE: 4.2 b; Amd 1:2024 4.2 note | M | high | P0 |
| ISO-4.2-response | 4.2 | ISO-PREVIEW: 4.2 c | M | high | P0 |
| ISO-4.3-boundary | 4.3 | ISO-PREVIEW: 4.3 opening | M | high | P0 |
| ISO-4.3-context | 4.3 | ISO-PREVIEW: 4.3 a | M | high | P0 |
| ISO-4.3-requirements | 4.3 | ISO-PREVIEW: 4.3 b | M | high | P0 |
| ISO-4.3-interfaces | 4.3 | ISO-PREVIEW: 4.3 c | M | high | P0 |
| ISO-4.3-documented | 4.3 | ISO-PREVIEW: 4.3 closing | M | high | P0 |
| ISO-4.4-processes | 4.4 | ISO-PREVIEW: 4.4 | M | high | P0 |
| ISO-4.4-interactions | 4.4 | ISO-PREVIEW: 4.4 | M | high | P0 |
| ISO-4.4-implementation | 4.4 | ISO-PREVIEW: 4.4 | M | high | P0 |
| ISO-4.4-maintenance | 4.4 | ISO-PREVIEW: 4.4 | M | high | P0 |
| ISO-4.4-improvement | 4.4 | ISO-PREVIEW: 4.4 | M | high | P0 |
| ISO-5.1-policy | 5.1 | ISO-PREVIEW: 5.1 a | M | high | P0 |
| ISO-5.1-objectives | 5.1 | ISO-PREVIEW: 5.1 a | M | high | P0 |
| ISO-5.1-alignment | 5.1 | ISO-PREVIEW: 5.1 a | M | high | P0 |
| ISO-5.1-integration | 5.1 | ISO-PREVIEW: 5.1 b | M | high | P0 |
| ISO-5.1-resources | 5.1 | ISO-PREVIEW: 5.1 c | M | high | P0 |
| ISO-5.1-communication | 5.1 | ISO-PREVIEW: 5.1 d | M | high | P0 |
| ISO-5.1-outcomes | 5.1 | ISO-PREVIEW: 5.1 e | M | high | P0 |
| ISO-5.1-people | 5.1 | ISO-PREVIEW: 5.1 f | M | high | P0 |
| ISO-5.1-managers | 5.1 | ISO-PREVIEW: 5.1 h | M | high | P0 |
| ISO-5.1-improvement | 5.1 | ISO-PREVIEW: 5.1 g | M | high | P0 |
| ISO-5.2-purpose | 5.2 | ISO-PREVIEW: 5.2 a | M | high | P0 |
| ISO-5.2-objectives | 5.2 | ISO-PREVIEW: 5.2 b | M | high | P0 |
| ISO-5.2-requirements | 5.2 | ISO-PREVIEW: 5.2 c | M | high | P0 |
| ISO-5.2-improvement | 5.2 | ISO-PREVIEW: 5.2 d | M | high | P0 |
| ISO-5.2-documented | 5.2 | ISO-PREVIEW: 5.2 e | M | high | P0 |
| ISO-5.2-internal | 5.2 | ISO-PREVIEW: 5.2 f | M | high | P0 |
| ISO-5.2-external | 5.2 | ISO-PREVIEW: 5.2 g | C | high | P0 |
| ISO-5.3-assigned | 5.3 | ISO-PREVIEW: 5.3 opening | M | high | P0 |
| ISO-5.3-communicated | 5.3 | ISO-PREVIEW: 5.3 opening | M | high | P0 |
| ISO-5.3-conformity | 5.3 | ISO-PREVIEW: 5.3 a | M | high | P0 |
| ISO-5.3-reporting | 5.3 | ISO-PREVIEW: 5.3 b | M | high | P0 |
| ISO-5.3-contact-note | 5.3 | REPO-GUIDE: 5.3 practical explanation | G | high | G0 |
| ISO-6.1.1-context | 6.1.1 | ISO-PREVIEW: 6.1.1 opening | M | high | P0 |
| ISO-6.1.1-requirements | 6.1.1 | ISO-PREVIEW: 6.1.1 opening | M | high | P0 |
| ISO-6.1.1-risks | 6.1.1 | ISO-PREVIEW: 6.1.1 opening | M | high | P0 |
| ISO-6.1.1-opportunities | 6.1.1 | ISO-PREVIEW: 6.1.1 opening | M | high | P0 |
| ISO-6.1.1-outcomes | 6.1.1 | ISO-PREVIEW: 6.1.1 a | M | high | P0 |
| ISO-6.1.1-effects | 6.1.1 | ISO-PREVIEW: 6.1.1 b | M | high | P0 |
| ISO-6.1.1-improvement | 6.1.1 | ISO-PREVIEW: 6.1.1 c | M | high | P0 |
| ISO-6.1.1-actions | 6.1.1 | ISO-PREVIEW: 6.1.1 d | M | high | P0 |
| ISO-6.1.1-integration | 6.1.1 | ISO-PREVIEW: 6.1.1 e 1 | M | high | P0 |
| ISO-6.1.1-implementation | 6.1.1 | ISO-PREVIEW: 6.1.1 e 1 | M | high | P0 |
| ISO-6.1.1-evaluation | 6.1.1 | ISO-PREVIEW: 6.1.1 e 2 | M | high | P0 |
| ISO-6.1.2-defined | 6.1.2 | ISO-PREVIEW: 6.1.2 opening | M | high | P0 |
| ISO-6.1.2-applied | 6.1.2 | ISO-PREVIEW: 6.1.2 opening | M | high | P0 |
| ISO-6.1.2-documented | 6.1.2 | ISO-PREVIEW: 6.1.2 closing | M | high | P0 |
| ISO-6.1.2-acceptance | 6.1.2 | ISO-PREVIEW: 6.1.2 a 1 | M | high | P0 |
| ISO-6.1.2-acceptance-maintained | 6.1.2 | ISO-PREVIEW: 6.1.2 a 1 | M | high | P0 |
| ISO-6.1.2-assessment-criteria | 6.1.2 | ISO-PREVIEW: 6.1.2 a 2 | M | high | P0 |
| ISO-6.1.2-assessment-maintained | 6.1.2 | ISO-PREVIEW: 6.1.2 a 2 | M | high | P0 |
| ISO-6.1.2-consistent | 6.1.2 | ISO-PREVIEW: 6.1.2 b | M | high | P0 |
| ISO-6.1.2-valid | 6.1.2 | ISO-PREVIEW: 6.1.2 b | M | high | P0 |
| ISO-6.1.2-comparable | 6.1.2 | ISO-PREVIEW: 6.1.2 b | M | high | P0 |
| ISO-6.1.2-confidentiality | 6.1.2 | ISO-PREVIEW: 6.1.2 c 1 | M | high | P0 |
| ISO-6.1.2-integrity | 6.1.2 | ISO-PREVIEW: 6.1.2 c 1 | M | high | P0 |
| ISO-6.1.2-availability | 6.1.2 | ISO-PREVIEW: 6.1.2 c 1 | M | high | P0 |
| ISO-6.1.2-scope | 6.1.2 | ISO-PREVIEW: 6.1.2 c 1 | M | high | P0 |
| ISO-6.1.2-owners | 6.1.2 | ISO-PREVIEW: 6.1.2 c 2 | M | high | P0 |
| ISO-6.1.2-consequences | 6.1.2 | ISO-PREVIEW: 6.1.2 d 1 | M | high | P0 |
| ISO-6.1.2-likelihood | 6.1.2 | ISO-PREVIEW: 6.1.2 d 2 | M | high | P0 |
| ISO-6.1.2-levels | 6.1.2 | ISO-PREVIEW: 6.1.2 d 3 | M | high | P0 |
| ISO-6.1.2-comparison | 6.1.2 | ISO-PREVIEW: 6.1.2 e 1 | M | high | P0 |
| ISO-6.1.2-priorities | 6.1.2 | ISO-PREVIEW: 6.1.2 e 2 | M | high | P0 |
| ISO-6.1.3-defined | 6.1.3 | ISO-PREVIEW: 6.1.3 opening | M | high | P0 |
| ISO-6.1.3-applied | 6.1.3 | ISO-PREVIEW: 6.1.3 opening | M | high | P0 |
| ISO-6.1.3-options | 6.1.3 | ISO-PREVIEW: 6.1.3 a | M | high | P0 |
| ISO-6.1.3-necessary | 6.1.3 | ISO-PREVIEW: 6.1.3 b | M | high | P0 |
| ISO-6.1.3-annex-comparison | 6.1.3 | ISO-PREVIEW: 6.1.3 c | M | high | P0 |
| ISO-6.1.3-omissions | 6.1.3 | ISO-PREVIEW: 6.1.3 c | M | high | P0 |
| ISO-6.1.3-soa-controls | 6.1.3 | ISO-PREVIEW: 6.1.3 d | M | high | P0 |
| ISO-6.1.3-soa-inclusion | 6.1.3 | ISO-PREVIEW: 6.1.3 d | M | high | P0 |
| ISO-6.1.3-soa-implementation | 6.1.3 | ISO-PREVIEW: 6.1.3 d | M | high | P0 |
| ISO-6.1.3-soa-exclusions | 6.1.3 | ISO-PREVIEW: 6.1.3 d | C | high | P0 |
| ISO-6.1.3-plan | 6.1.3 | ISO-PREVIEW: 6.1.3 e | M | high | P0 |
| ISO-6.1.3-approval | 6.1.3 | ISO-PREVIEW: 6.1.3 f | M | high | P0 |
| ISO-6.1.3-residual-acceptance | 6.1.3 | ISO-PREVIEW: 6.1.3 f | M | high | P0 |
| ISO-6.1.3-documented | 6.1.3 | ISO-PREVIEW: 6.1.3 closing | M | high | P0 |
| ISO-6.2-levels | 6.2 | ISO-PREVIEW: 6.2 opening | M | high | P0 |
| ISO-6.2-policy | 6.2 | ISO-PREVIEW: 6.2 a | M | high | P0 |
| ISO-6.2-measurability | 6.2 | ISO-PREVIEW: 6.2 b | C | high | P0 |
| ISO-6.2-requirements | 6.2 | ISO-PREVIEW: 6.2 c | M | high | P0 |
| ISO-6.2-assessment | 6.2 | ISO-PREVIEW: 6.2 c | M | high | P0 |
| ISO-6.2-treatment | 6.2 | ISO-PREVIEW: 6.2 c | M | high | P0 |
| ISO-6.2-monitoring | 6.2 | ISO-PREVIEW: 6.2 d | M | high | P0 |
| ISO-6.2-communication | 6.2 | ISO-PREVIEW: 6.2 e | M | high | P0 |
| ISO-6.2-updates | 6.2 | ISO-PREVIEW: 6.2 f | C | high | P0 |
| ISO-6.2-available | 6.2 | ISO-PREVIEW: 6.2 g | M | high | P0 |
| ISO-6.2-retained | 6.2 | ISO-PREVIEW: 6.2 middle | M | high | P0 |
| ISO-6.2-work | 6.2 | ISO-PREVIEW: 6.2 h | M | high | P0 |
| ISO-6.2-resources | 6.2 | ISO-PREVIEW: 6.2 i | M | high | P0 |
| ISO-6.2-responsibility | 6.2 | ISO-PREVIEW: 6.2 j | M | high | P0 |
| ISO-6.2-completion | 6.2 | ISO-PREVIEW: 6.2 k | M | high | P0 |
| ISO-6.2-evaluation | 6.2 | ISO-PREVIEW: 6.2 l | M | high | P0 |
| ISO-6.3-planning | 6.3 | ISO-PREVIEW: 6.3 practical inquiry into triggered duty | C | high | P0 |
| ISO-6.3-change-context | 6.3 | ISO-PREVIEW: 6.3 trigger | C | high | P0 |
| ISO-6.3-execution | 6.3 | ISO-PREVIEW: 6.3 | C | high | P0 |
| ISO-7.1-needs | 7.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.1 resource determination; BSI p.6 Clause 7 | M* | medium | L7.1 |
| ISO-7.1-provided | 7.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.1 resource provision; BSI p.6 Clause 7 | M* | medium | L7.1 |
| ISO-7.1-tools-note | 7.1 | REPO-GUIDE: 7.1 implementation examples | G | high | G0 |
| ISO-7.2-needs | 7.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.2 competence determination; BSI p.6 Clause 7 | M* | medium | L7.2 |
| ISO-7.2-competent | 7.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.2 competence basis; BSI p.6 Clause 7 | M* | medium | L7.2 |
| ISO-7.2-action-arrangement | 7.2 | ANAB-CHANGES; BSI-IMPLEMENTATION; REPO-GUIDE: 7.2 competence actions; ANAB comparison row 7.2 | C* | medium | L7.2 |
| ISO-7.2-action-context | 7.2 | REPO-GUIDE: 7.2 competence-action context | C* | medium | L7.2 |
| ISO-7.2-actions | 7.2 | BSI-IMPLEMENTATION; ANAB-CHANGES; REPO-GUIDE: 7.2 competence actions | C* | medium | L7.2 |
| ISO-7.2-effectiveness | 7.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.2 action effectiveness | C* | low | L7.2 |
| ISO-7.2-record | 7.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.2 competence evidence | M* | low | L7.2 |
| ISO-7.3-policy | 7.3 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.3 policy awareness; BSI p.6 Clause 7 | M* | medium | L7.3 |
| ISO-7.3-contribution | 7.3 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.3 contribution; BSI p.6 Clause 7 | M* | medium | L7.3 |
| ISO-7.3-benefits | 7.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.3 contribution benefits | M* | low | L7.3 |
| ISO-7.3-implications | 7.3 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.3 implications; BSI p.6 Clause 7 | M* | medium | L7.3 |
| ISO-7.4-subject | 7.4 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.4 a; ANAB comparison row 7.4 | M* | medium | L7.4 |
| ISO-7.4-timing | 7.4 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.4 b; ANAB comparison row 7.4 | M* | medium | L7.4 |
| ISO-7.4-audience | 7.4 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.4 c; ANAB comparison row 7.4 | M* | medium | L7.4 |
| ISO-7.4-method | 7.4 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.4 d; SGS p.3 section 3.1 | M* | medium | L7.4 |
| ISO-7.4-contact-note | 7.4 | SGS-CHANGES; REPO-GUIDE: 7.4 operational contact guidance; SGS p.3 section 3.1 | G | high | G0 |
| ISO-7.5.1-required | 7.5.1 | ANAB-CHANGES; REPO-GUIDE: 7.5.1 a; ANAB comparison row 7.5.1 | M* | medium | L7.5.1 |
| ISO-7.5.1-necessary | 7.5.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.5.1 organizational documentation; BSI p.6 Clause 7 | M* | medium | L7.5.1 |
| ISO-7.5.2-identification | 7.5.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.2 identification and description | M* | low | L7.5.2 |
| ISO-7.5.2-format | 7.5.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.2 format | M* | low | L7.5.2 |
| ISO-7.5.2-medium | 7.5.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.2 medium | M* | low | L7.5.2 |
| ISO-7.5.2-review | 7.5.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.2 review | M* | low | L7.5.2 |
| ISO-7.5.2-approval | 7.5.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.2 approval | M* | low | L7.5.2 |
| ISO-7.5.3-availability | 7.5.3 | BSI-IMPLEMENTATION; REPO-GUIDE: 7.5.3 availability | M* | low | L7.5.3 |
| ISO-7.5.3-suitability | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 suitability | M* | low | L7.5.3 |
| ISO-7.5.3-protection | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION; ANAB-CHANGES: 7.5.3 protection: confidentiality | M* | low | L7.5.3 |
| ISO-7.5.3-improper-use | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION; ANAB-CHANGES: 7.5.3 protection: improper use | M* | low | L7.5.3 |
| ISO-7.5.3-integrity | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION; ANAB-CHANGES: 7.5.3 protection: integrity | M* | low | L7.5.3 |
| ISO-7.5.3-distribution | 7.5.3 | REPO-GUIDE; ANAB-CHANGES: 7.5.3 distribution | C* | low | L7.5.3 |
| ISO-7.5.3-access | 7.5.3 | REPO-GUIDE; ANAB-CHANGES: 7.5.3 access; ANAB comparison note 7.5.3 | C* | low | L7.5.3 |
| ISO-7.5.3-retrieval | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 retrieval | C* | low | L7.5.3 |
| ISO-7.5.3-use | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 use | C* | low | L7.5.3 |
| ISO-7.5.3-preservation | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 storage and preservation | C* | low | L7.5.3 |
| ISO-7.5.3-legibility | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 preservation: legibility | C* | low | L7.5.3 |
| ISO-7.5.3-changes | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 change control | C* | low | L7.5.3 |
| ISO-7.5.3-retention | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 retention and disposition | C* | low | L7.5.3 |
| ISO-7.5.3-external-context | 7.5.3 | REPO-GUIDE: 7.5.3 external-document context | C* | low | L7.5.3 |
| ISO-7.5.3-external-identification | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 external information identification | C* | low | L7.5.3 |
| ISO-7.5.3-external-control | 7.5.3 | REPO-GUIDE; BSI-IMPLEMENTATION: 7.5.3 external information control | C* | low | L7.5.3 |
| ISO-8.1-criteria | 8.1 | ANAB-CHANGES; BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 opening; ANAB comparison row 8.1 | M* | medium | L8.1 |
| ISO-8.1-operation | 8.1 | ANAB-CHANGES; BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 opening; ANAB comparison row 8.1 | M* | medium | L8.1 |
| ISO-8.1-records | 8.1 | ANAB-CHANGES; REPO-GUIDE: 8.1 documented information; ANAB comparison row 8.1 | M* | medium | L8.1 |
| ISO-8.1-planned-arrangement | 8.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 planned-change control; BSI p.7 Clause 8 | C* | medium | L8.1 |
| ISO-8.1-planned-context | 8.1 | REPO-GUIDE: 8.1 planned-change context | C* | medium | L8.1 |
| ISO-8.1-planned-control | 8.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 planned changes; BSI p.7 Clause 8 | C* | medium | L8.1 |
| ISO-8.1-unintended-arrangement | 8.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 unintended changes; BSI p.7 Clause 8 | C* | medium | L8.1 |
| ISO-8.1-unintended-context | 8.1 | REPO-GUIDE: 8.1 unintended-change context | C* | medium | L8.1 |
| ISO-8.1-unintended-review | 8.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 unintended-change review | C* | medium | L8.1 |
| ISO-8.1-unintended-response | 8.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.1 necessary mitigation | C* | medium | L8.1 |
| ISO-8.1-external-context | 8.1 | ANAB-CHANGES; REPO-GUIDE: 8.1 external-provision context; ANAB comparison row 8.1 | C* | medium | L8.1 |
| ISO-8.1-external-control | 8.1 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 8.1 external provision; ANAB comparison row 8.1; SGS p.5 | C* | medium | L8.1 |
| ISO-8.2-intervals | 8.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.2 planned assessment; BSI p.7 Clause 8 | M* | medium | L8.2 |
| ISO-8.2-trigger-arrangement | 8.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 8.2 significant-change trigger | C* | low | L8.2 |
| ISO-8.2-change-context | 8.2 | REPO-GUIDE: 8.2 significant-change context | C* | low | L8.2 |
| ISO-8.2-change-assessment | 8.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 8.2 change-triggered execution | C* | low | L8.2 |
| ISO-8.2-criteria | 8.2 | REPO-GUIDE; ISO-PREVIEW; BSI-IMPLEMENTATION: 8.2 criteria linkage | M* | low | L8.2 |
| ISO-8.2-results | 8.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.2 results; BSI p.7 Clause 8 | M* | medium | L8.2 |
| ISO-8.3-implementation | 8.3 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.3 treatment execution; BSI p.7 Clause 8 | M* | medium | L8.3 |
| ISO-8.3-results | 8.3 | BSI-IMPLEMENTATION; REPO-GUIDE: 8.3 treatment results; BSI p.7 Clause 8 | M* | medium | L8.3 |
| ISO-9.1-subject | 9.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 9.1 monitoring subject; BSI p.7 Clause 9 | M* | medium | L9.1 |
| ISO-9.1-measurement-method | 9.1 | ANAB-CHANGES; REPO-GUIDE: 9.1 b; ANAB comparison row 9.1(b) | M* | medium | L9.1 |
| ISO-9.1-evaluation-method | 9.1 | ANAB-CHANGES; REPO-GUIDE: 9.1 b; ANAB comparison row 9.1(b) | M* | medium | L9.1 |
| ISO-9.1-comparable | 9.1 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 9.1 b; ANAB comparison row 9.1(b); SGS p.4 | M* | medium | L9.1 |
| ISO-9.1-reproducible | 9.1 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 9.1 b; ANAB comparison row 9.1(b); SGS p.4 | M* | medium | L9.1 |
| ISO-9.1-collection-timing | 9.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 9.1 monitoring timing; BSI p.7 Clause 9 | M* | medium | L9.1 |
| ISO-9.1-collection-responsibility | 9.1 | BSI-SELF-ASSESSMENT; REPO-GUIDE: 9.1 monitoring responsibility; BSI self-assessment p.7 item 24 | M* | medium | L9.1 |
| ISO-9.1-analysis-timing | 9.1 | ANAB-CHANGES; REPO-GUIDE: 9.1 e; ANAB comparison row 9.1(e) | M* | medium | L9.1 |
| ISO-9.1-analysis-responsibility | 9.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.1 evaluation responsibility | M* | low | L9.1 |
| ISO-9.1-records | 9.1 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 9.1 results; ANAB comparison row 9.1; SGS p.5 | M* | medium | L9.1 |
| ISO-9.1-performance | 9.1 | ANAB-CHANGES; BSI-IMPLEMENTATION; REPO-GUIDE: 9.1 closing; ANAB comparison row 9.1 | M* | medium | L9.1 |
| ISO-9.1-effectiveness | 9.1 | ANAB-CHANGES; BSI-IMPLEMENTATION; REPO-GUIDE: 9.1 closing; ANAB comparison row 9.1 | M* | medium | L9.1 |
| ISO-9.2.1-intervals | 9.2.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 9.2.1 audit timing; BSI p.7 Clause 9 | M* | medium | L9.2.1 |
| ISO-9.2.1-own-requirements | 9.2.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.2.1 organizational requirements | M* | low | L9.2.1 |
| ISO-9.2.1-standard-requirements | 9.2.1 | ANAB-CHANGES; REPO-GUIDE: 9.2.1 a 2; ANAB comparison row 9.2.1(a)(2) | M* | medium | L9.2.1 |
| ISO-9.2.1-implementation | 9.2.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.2.1 effective implementation | M* | low | L9.2.1 |
| ISO-9.2.1-maintenance | 9.2.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.2.1 effective maintenance | M* | low | L9.2.1 |
| ISO-9.2.2-program | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening; ANAB comparison row 9.2.2 | M* | medium | L9.2.2 |
| ISO-9.2.2-implementation | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening; ANAB comparison row 9.2.2 | M* | medium | L9.2.2 |
| ISO-9.2.2-maintenance | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening; ANAB comparison row 9.2.2 | M* | medium | L9.2.2 |
| ISO-9.2.2-frequency | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening frequency; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-methods | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening methods; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-responsibilities | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening responsibilities; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-planning | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening planning; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-reporting-arrangements | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 opening reporting; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-importance | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 program priorities; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-previous-results | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 previous results; ANAB comparison | C* | medium | L9.2.2 |
| ISO-9.2.2-criteria | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 a; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-scope | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 a; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-objectivity | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 b; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-impartiality | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 b; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-management-report | 9.2.2 | ANAB-CHANGES; REPO-GUIDE: 9.2.2 c; ANAB comparison | M* | medium | L9.2.2 |
| ISO-9.2.2-program-records | 9.2.2 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 9.2.2 closing; ANAB comparison; SGS p.5 | M* | medium | L9.2.2 |
| ISO-9.2.2-audit-records | 9.2.2 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 9.2.2 closing; ANAB comparison; SGS p.5 | M* | medium | L9.2.2 |
| ISO-9.3.1-management | 9.3.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.1 top-management review | M* | low | L9.3.1 |
| ISO-9.3.1-intervals | 9.3.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 9.3.1 review timing; BSI p.7 Clause 9 | M* | medium | L9.3.1 |
| ISO-9.3.1-suitability | 9.3.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.1 suitability | M* | low | L9.3.1 |
| ISO-9.3.1-adequacy | 9.3.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.1 adequacy | M* | low | L9.3.1 |
| ISO-9.3.1-effectiveness | 9.3.1 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.1 effectiveness | M* | low | L9.3.1 |
| ISO-9.3.2-previous-actions | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 previous actions | C* | low | L9.3.2 |
| ISO-9.3.2-internal-changes | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 context changes | M* | low | L9.3.2 |
| ISO-9.3.2-external-changes | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 context changes | M* | low | L9.3.2 |
| ISO-9.3.2-party-changes | 9.3.2 | SGS-CHANGES; REPO-GUIDE: 9.3.2 c; SGS p.4 section 3.1 | M* | medium | L9.3.2 |
| ISO-9.3.2-nonconformity-trends | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 performance: nonconformities | M* | low | L9.3.2 |
| ISO-9.3.2-corrective-action-trends | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 performance: corrective actions | M* | low | L9.3.2 |
| ISO-9.3.2-measurement-trends | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 performance: monitoring and measurement | M* | low | L9.3.2 |
| ISO-9.3.2-audit-trends | 9.3.2 | ANAB-CHANGES; REPO-GUIDE: 9.3.2 d 3; ANAB comparison row 9.3(c)(3) | M* | medium | L9.3.2 |
| ISO-9.3.2-objective-trends | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 performance: objective fulfillment | M* | low | L9.3.2 |
| ISO-9.3.2-feedback | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 interested-party feedback | M* | low | L9.3.2 |
| ISO-9.3.2-risk-results | 9.3.2 | ANAB-CHANGES; REPO-GUIDE: 9.3.2 f; ANAB comparison row 9.3(e) | M* | medium | L9.3.2 |
| ISO-9.3.2-treatment-status | 9.3.2 | ANAB-CHANGES; REPO-GUIDE: 9.3.2 f; ANAB comparison row 9.3(e) | M* | medium | L9.3.2 |
| ISO-9.3.2-opportunities | 9.3.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 9.3.2 improvement opportunities | M* | low | L9.3.2 |
| ISO-9.3.3-improvement-decisions | 9.3.3 | ANAB-CHANGES; REPO-GUIDE: 9.3.3 decisions; ANAB comparison row 9.3.3 | M* | medium | L9.3.3 |
| ISO-9.3.3-change-decisions | 9.3.3 | ANAB-CHANGES; REPO-GUIDE: 9.3.3 decisions; ANAB comparison row 9.3.3 | M* | medium | L9.3.3 |
| ISO-9.3.3-records | 9.3.3 | ANAB-CHANGES; SGS-CHANGES; REPO-GUIDE: 9.3.3 closing; ANAB comparison; SGS p.5 | M* | medium | L9.3.3 |
| ISO-10.1-suitability | 10.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.1 suitability; BSI p.7 Clause 10 | M* | medium | L10.1 |
| ISO-10.1-adequacy | 10.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.1 adequacy; BSI p.7 Clause 10 | M* | medium | L10.1 |
| ISO-10.1-effectiveness | 10.1 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.1 effectiveness; BSI p.7 Clause 10 | M* | medium | L10.1 |
| ISO-10.2-arrangement | 10.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.2 response readiness; BSI p.7 Clause 10 | C* | medium | L10.2 |
| ISO-10.2-event-context | 10.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 10.2 occurrence trigger | C* | medium | L10.2 |
| ISO-10.2-correction | 10.2 | ANAB-CHANGES; BSI-IMPLEMENTATION; REPO-GUIDE: 10.2 a 1; ANAB comparison row 10.2(a)(1) | C* | medium | L10.2 |
| ISO-10.2-consequences | 10.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.2 consequences; BSI p.7 Clause 10 | C* | medium | L10.2 |
| ISO-10.2-review | 10.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 10.2 review of nonconformity | C* | low | L10.2 |
| ISO-10.2-causes | 10.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.2 causes; BSI p.7 Clause 10 | C* | medium | L10.2 |
| ISO-10.2-similar-existing | 10.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.2 similar issues; BSI p.7 Clause 10 | C* | medium | L10.2 |
| ISO-10.2-similar-potential | 10.2 | BSI-IMPLEMENTATION; REPO-GUIDE: 10.2 potential similar issues; BSI p.7 Clause 10 | C* | medium | L10.2 |
| ISO-10.2-action-need | 10.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 10.2 corrective-action need | C* | low | L10.2 |
| ISO-10.2-necessary-action | 10.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 10.2 implementation of necessary action | C* | low | L10.2 |
| ISO-10.2-proportionality | 10.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 10.2 appropriateness of corrective action | C* | low | L10.2 |
| ISO-10.2-effectiveness | 10.2 | BSI-SELF-ASSESSMENT; REPO-GUIDE: 10.2 action effectiveness; BSI self-assessment p.7 item 29 | C* | medium | L10.2 |
| ISO-10.2-isms-changes | 10.2 | REPO-GUIDE; BSI-IMPLEMENTATION: 10.2 necessary ISMS changes | C* | low | L10.2 |
| ISO-10.2-nature-record | 10.2 | ANAB-CHANGES; REPO-GUIDE: 10.2 f; ANAB comparison closing row 10.2 | C* | medium | L10.2 |
| ISO-10.2-action-record | 10.2 | ANAB-CHANGES; REPO-GUIDE: 10.2 f; ANAB comparison closing row 10.2 | C* | medium | L10.2 |
| ISO-10.2-result-record | 10.2 | ANAB-CHANGES; REPO-GUIDE: 10.2 g; ANAB comparison closing row 10.2 | C* | medium | L10.2 |

## Exact-source gap ledger

Each L-code applies to the complete corresponding unit. A stronger partial
comparison for a particular question does not close the unit's other paragraphs,
conditions, records or timing. Pending coverage in the old criteria catalog
remains unchanged.

| Gap | Unresolved comparison |
| --- | --- |
| L7.1 | Complete 7.1: verify exact resource-determination/provision qualifications across establishment, operation, maintenance and improvement. |
| L7.2 | Complete 7.2: verify personnel scope, competence bases, where-applicable action and effectiveness qualifiers, and exact retained-information duty. Public comparison exposes examples, not the whole unit. |
| L7.3 | Complete 7.3: verify awareness scope and the full contribution/benefits/implications list. BSI corroborates broad topics; the benefit detail has lower confidence. |
| L7.4 | Complete 7.4: verify full current communication requirements. Use the compared 2022 what/when/with-whom/how list; optional contact notes do not recreate the removed 2013 item. |
| L7.5.1 | Complete 7.5.1 and all cross-referenced record duties: determine the exact standard-required record set and organizational-necessity qualifiers. No mandatory artifact-name list is inferred. |
| L7.5.2 | Complete 7.5.2: verify identification/description, format/media, review and approval qualifications. Detailed dimensions are original low-confidence inquiries supported by prior product guidance, not freshly compared normative text. |
| L7.5.3 | Complete 7.5.3: verify exact availability/protection subjects, as-applicable distribution/access/retrieval/use/storage/preservation/change/retention/disposition list, external-information rules and any unexposed qualifications. Do not assume another ISO standard's extra record protections apply. |
| L8.1 | Complete 8.1: verify planned/unintended-change qualifications and necessary mitigation, plus full operational criteria and record requirements. ANAB/SGS corroborate 2022 external processes/products/services; no event is inferred from a provider relationship. |
| L8.2 | Complete 8.2: verify proposed/occurring significant-change trigger wording, criteria linkage and exact results-retention duty. Broad planned-interval execution is corroborated by BSI. |
| L8.3 | Complete 8.3: verify the precise treatment-plan implementation and result-retention duties. Approval and residual acceptance remain separate 6.1.3 decisions. |
| L9.1 | Complete 9.1: verify all measurement subjects, methods, collection/evaluation roles and timing, and result-information duties. Comparison supports validity/comparability/reproducibility changes but does not expose the whole unit. |
| L9.2.1 | Complete 9.2.1: verify all conformity and effective-implementation/maintenance subjects and planned-interval qualifications. These inquiries are not complete audit criteria. |
| L9.2.2 | Complete 9.2.2: verify the full program, priority, audit criterion/scope, objectivity/impartiality, reporting and information duties beyond the public comparison. |
| L9.3.1 | Complete 9.3.1: verify top-management scope and continuing suitability/adequacy/effectiveness evaluation. Broad planned timing is supported by BSI, not a universal numerical interval. |
| L9.3.2 | Complete 9.3.2: verify the entire input and trend list, especially previous actions, internal/external issues, nonconformity/corrective-action trends, measurements, objectives, stakeholder feedback and opportunities. SGS supports changed interested-party needs; ANAB supports audit and risk/treatment inputs. No complete source comparison is claimed. |
| L9.3.3 | Complete 9.3.3: verify all review-result and available-information qualifications. ANAB/SGS corroborate improvement/change decisions and result records; no mandatory minute template is inferred. |
| L10.1 | Complete 10.1: verify exact suitability, adequacy and effectiveness improvement duty. BSI corroborates these dimensions; no quota, tool or cadence is imposed. |
| L10.2 | Complete 10.2: verify all triggered response, cause, similar/potential recurrence, necessary-action, effectiveness, proportionality, ISMS-change and record duties and qualifications. Public guidance/comparison supports selected dimensions; absence of an event only scopes examples. |

## Material interpretation boundaries

The public 2022 communication comparison supports what, when, with whom and how;
SGS expressly describes removal of the older separate communicator/process items.
ANAB's narrative around that row is internally inconsistent with its displayed
2022 list. The inquiry follows the displayed list corroborated by SGS; contact
details are optional text. This avoids turning an operational convenience into an
extra status obligation.

Detailed document-handling dimensions and much of the management-review input
list have lower confidence because complete normative text was not accessed.
The questions expose each practical topic separately so exact-source review can
correct qualifications without silently certifying completeness. Other ISO
management-system standards and the 2026 generic Directives were not used to fill
the missing ISO/IEC 27001:2022 paragraphs.

For first audits/reviews, no changes, no competence actions or no nonconformities,
answers can explain the actual absence where the question is qualified. Readiness
of the ongoing arrangement remains separately asked. Only the eight explicit
context gates hide event/activity-specific children; none hide a whole unit.

Implementation tools, policy titles, document formats, owner contact names,
evidence suggestions and independent-validation roles are not invented mandatory
requirements. The original guidance supports practical internal readiness;
verification of operation and independent assurance remain separate activities.

## Focused verification scope

Content validation checks the exact 30 native units/titles/specifications, the
part's version/framework keys, globally distinct ISO-prefixed question/group IDs,
two to six groups per unit, question fields and choice sets, same-unit context
references, unconditional substantive coverage, optional text behavior, source
reference resolution and one matrix row per question. Engine behavior and
browser/persistence/security integration belong to the main agent's separate
scope. No commits, pushes, deployments or browser/session operations are part of
this content work.

Executed 2026-10-11: a local Node.js `node:assert/strict` self-check passed for
all 30 native units, 123 groups, 239 questions and 239 matrix rows. It checked
the version/framework contract, exact native titles/specifications, global ID
uniqueness, group bounds, required fields, exact choice sets, same-unit context
references, reason prompts, unconditional substantive coverage, source-ledger
resolution and optional-text shape. `git diff --check` reported no diagnostics
for the two scoped paths. Both files are new and uncommitted.
