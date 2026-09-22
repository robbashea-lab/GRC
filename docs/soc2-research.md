# SOC 2 Type 2 readiness research

Research date: 2026-09-22. Catalog version: 2017 Trust Services Criteria, revised points of focus 2022.

## Primary sources and limitations

- [AICPA current criteria resource](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022): confirms edition and publisher; its direct download requires a free account. No account was created and no access gate was bypassed.
- [AICPA SOC 2 guide](https://www.aicpa-cima.com/cpe-learning/publication/soc-2-reporting-on-an-examination-of-controls-at-a-service-organization-relevant-to-security-availability-processing-integrity-confidentiality-or-privacy-OPL): design and operating effectiveness, management's system description and internal readiness versus external examination.
- [AICPA-authored TSP 100, current revision, hosted copy](https://gccertification.com/wp-content/uploads/2024/06/AICPA-TSP-Section-100-Trust-Services-Criteria-2022.pdf): Notice to Readers and paragraphs .03–.11 distinguish criteria, management-designed controls and points of focus. This is a third-party-hosted copy of the primary document, not publisher-authenticated distribution.
- [Earlier AICPA-hosted TSP 100](https://assets.ctfassets.net/rb9cdnjh59cm/72xv4p67HVXKp6CjWmjkPk/1cdbfa19f6307e2720396b66a6194dc9/trust-services-criteria-updated-copyright.pdf): explicitly includes March 2020 updates, not the 2022 point-of-focus revision. Used only to cross-check criterion identifiers; the 2022 notice confirms criteria themselves did not change.

No full criteria or points-of-focus text is embedded in Omnisciente. The catalog uses original short topic summaries and implementation prompts, with publisher references. Detailed interpretation requires the source and professional judgment.

## Dataset and scope

61 criteria: 33 Common Criteria, 3 Availability, 2 Confidentiality, 5 Processing Integrity and 18 Privacy. CC1–CC9 grouping remains native. Optional categories are never implicitly selected. Common Criteria remain the application's foundational scope; this does not assert that every possible attestation must be titled a Security examination.

New clients initialize the 33 Common Criteria. Explicit scope expansion inserts additional assessments without overwriting prior responses. Removing a category retains history and linked operational records but removes those criteria from current-scope counts. The workspace offers a clearly labelled retained/out-of-scope view.

System boundary, service commitments and a chosen program evidence period are client-scoped configuration. The application sets no minimum audit period.

## Controls and operating evidence

Management records criterion-level control descriptions, frequency, internal design and operating conclusions, dated observations, optional expected/collected instance counts, population context and testing notes. These are assessment annotations, not another operational control register.

Instance gaps are max(expected minus collected, zero) only when both counts are entered. They are reported management counts, not file counts, auditor samples or an effectiveness score. Changing the program period does not rewrite prior control observations. Assessment history retains earlier descriptions and periods.

No control or Evidence completion silently changes criterion status, another framework's status or a certification claim. AICPA points of focus are not seeded as additional mandatory requirements. Privacy interpretation must consider controller/processor roles and actual service commitments.

Eight recommended Review plans reuse authoritative risk, access, vulnerability, vendor, backup, incident, policy and awareness work. Cadences remain management choices; Omnisciente's defaults are not AICPA mandates. Supporting policy mappings are partial subject relationships, not exact equivalence.

Auditor request management is not invented: the existing Evidence, Comments, Findings and Actions remain the record/work channels. No CPA opinion or external attestation workflow is implemented.
