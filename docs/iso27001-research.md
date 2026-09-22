# ISO/IEC 27001 research and implementation boundary

Research date: 2026-09-22. Dataset: ISO/IEC 27001:2022 with Amd 1:2024.

## Sources and decisions

- [ISO standard](https://www.iso.org/standard/27001): management-system standard, not a statutory regulation. Conformity is not established by completing this application.
- [ISO amendment](https://www.iso.org/standard/88435.html) and [ISO/IAF climate-context communiqué](https://www.iso.org/files/live/sites/isoorg/files/standards/popular_standards/management_systems/ISO-IAF%20Joint%20Communique%20Feb%202024.pdf): include climate relevance in context and relevant stakeholder considerations; do not invent a climate-control programme.
- [ISO member-body public preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf): clause identifiers and the distinction between clauses 4–10 and risk-selected Annex A controls. The SoA records selection rationale and implementation, and risk treatment can require additional controls.
- [ANAB comparison](https://blog.ansi.org/anab/iso-iec-27001-2013-2022-comparison/): accreditation-body explanation of the 2022 restructuring, including separate audit/review subsections and 10.1 improvement / 10.2 corrective action.
- [SGS comparison](https://www.sgs.com/-/media/sgscorp/documents/corporate/brochures/sgs-kn-iso-27001-2013-2022-guidance-doc-en.cdn.en-LV.pdf): certification-body guidance, not normative text.
- [ISO/IEC 27002](https://www.iso.org/standard/75652.html): implementation context only; 2022 edition, corrected March 2022. [SGS overview](https://www.sgs.com/en/news/2022/07/key-changes-in-iso-iec-27002-2022) corroborates 93 controls in four themes. Its pre-publication timing comments about 27001 are not used.

The catalog has 30 leaf-level ISMS assessment units and 93 Annex A references (37 organizational, 8 people, 14 physical, 34 technological). Parent clause headings are grouping, not duplicate assessment records. Clause 6.3 is included even though one preview contents page omits it; it appears in the body.

The catalog contains original implementation prompts and short topic summaries, not licensed ISO control text. Public previews are incomplete, and one 27002 preview returned a redline rather than the normative edition. It was not treated as a substitute for the current standard. This product assists internal readiness; detailed conformity interpretation still requires access to the licensed standard and qualified review. No independent certification review is claimed.

## Operational design

Clauses cannot use Not Applicable. Annex A decisions begin undetermined, never universally included. Both inclusion and exclusion require a justification; exclusion and Not Applicable must agree. Addressed requires inclusion and an implementation narrative. Evidence alone cannot establish status.

ISMS scope, objectives, methodology, audit plans and minutes are implementation records/Evidence attached to their actual clauses. Risks and treatment remain in Risks and Actions; corrective action remains in Findings and Actions. Additional non-Annex controls can be documented and linked through clause 6.1.3; no second control register is introduced.

Ten suggested review plans cover audits, management review, risk, objectives, SoA, corrective action, policy, access, vendors and awareness. They use existing Review types. Their annual/quarterly intervals are explicitly recommendations. Existing matching baseline Reviews are linked without changing dates, ownership or history. ISO-specific plans remain distinct. Policy mappings are partial support mappings, not prescribed titles or automatic equivalence.

## Safety

Only explicit activation initializes records. GET never seeds; toggles retain assessments, Evidence, Findings, Actions and history. No authentication, membership or role changes. The shared authorized routes validate target client scope and existing assignment rules. Standard startup and persistent non-demo data are untouched.
