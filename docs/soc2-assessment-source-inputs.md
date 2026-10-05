# SOC 2 assessment source inputs for PR 36

Inspection date: 2026-10-05. Repository commit inspected: `56dca744dd3e7b62be1eada43cb99e8aa65a5f5a`. This document records source and rights inputs; it does not approve content redistribution or claim an auditor opinion.

## Source availability and edition

The supported edition is AICPA/ASEC **TSP Section 100, 2017 Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy, with revised Points of Focus (2022)**. The [publisher resource](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) currently shows a free-account access form. Its existing [publisher-hosted PDF](https://assets.ctfassets.net/rb9cdnjh59cm/5jT1narHNQNzt4JGlkd1gr/248661d08e42531329d147782a6f8854/Trust-services-criteria.pdf) was readable without signing in during this inspection: 75 pages. No account was created, access gate bypassed, or third-party mirror substituted.

All 61 supported criterion row identifiers and their printed-page mappings were checked against that PDF. The inventory matches the repository: 33 Security/Common Criteria, three Availability, two Confidentiality, five Processing Integrity, and 18 Privacy criteria. Older source-access notes saying PI/Privacy are unreviewed do not describe the later all-category review recorded in `soc2-requirement-guide-desktop-review.md`.

Relevant source sections:

- Notice to Readers, printed pages 2–3: identifies the edition and distinguishes the 2022 Points-of-Focus revision from unchanged 2017 criteria.
- Paragraphs .03–.07, printed pages 4–5: criteria describe outcomes; management selects controls; Points of Focus are contextual characteristics, not an independently mandatory checklist.
- Paragraphs .09–.11, printed pages 6–7, and .14–.15, printed page 9: Common Criteria and selected category-specific criteria remain separate structures.
- Paragraph .16, printed pages 9–10: design and operation over a specified period are distinct; the application must not infer a CPA opinion from checklist selections.
- Paragraphs .18–.19, printed page 11: service commitments and system requirements provide applicable context.
- Paragraph .29, printed page 14 onwards: authoritative criterion rows used by the existing item-to-criterion mappings below. CC1.2 footnote 15, printed page 16, qualifies governance arrangements for smaller entities.
- Final PDF page: AICPA copyright notice dated 2024 and reservation of rights. This is not a different TSC edition.

## Existing usable content and preserved history

`shared/catalogs/soc2.json` supplies stable criterion IDs, hierarchy, scope, authored titles, and publisher references. It has no embedded official-text entries. `socRequirementGuide.json` supplies the 61 authored requirement summaries; `socAssessmentGuidance.json` supplies criterion-specific review guidance and expected outcomes for every supported ID. `socAssessmentPresentation.json` supplies checked publisher URLs and criterion-supported trigger paraphrases or null. No universal annual/quarterly cadence or numeric retention period is inferred.

The current 148 criterion-only `assessment_criteria` items are authored paraphrases mapped to criterion rows. Their technical source is available; there is no missing-document blocker for reviewing the checklist across any supported SOC category. Existing mappings and practical text can be reused without recreating 61 independent catalogs. Their substantive review is distinct from authorization to commercially redistribute source text or derivative content.

All 129 historical v1 item definitions remain unchanged against baseline `27746e5`: IDs, text, tier, and provenance. They include Points-of-Focus interpretations and operational/assurance suggestions and must not be relabeled current mandatory obligations. Current items have separate `<criterion>-assessment-v1-<number>` IDs appended to the existing validation catalog. Historical selections must remain attached to their original definitions. The maximum old-plus-current selectable set is 12, within the existing limit of 30. This source-input task does not change selections, status, narrative, verification, scope, history, or catalogs.

## Official wording and product rights: unresolved input

**All 61 IDs below are affected by the missing official-wording input.** An accessible PDF and a substantive comparison do not establish a right to embed its complete criterion paragraphs in Omnisciente, the frontend bundle, exports, or the owner-private hosted preview. No product-specific AICPA redistribution permission or licensing agreement was located in the reviewed repository evidence. Permission status is unresolved; this is not a legal determination that no exception or existing agreement could apply.

The [AICPA Terms & Conditions, version 4](https://www.aicpa-cima.com/help/terms-and-conditions), sections 2.1–2.3, reserve intellectual-property rights and distinguish limited personal/noncommercial use from written consent for commercial copying, modification, distribution, and display. Their Copyright Requests section identifies the Permissions Department and [IP licensing route](https://www.aicpa-cima.com/resources/landing/licensing-for-teams). No request was submitted.

Needed before embedding official wording: an applicable existing license or written rights-holder permission covering the exact TSP 100 edition, the requested 61 criterion paragraphs, product storage/display and distribution to the intended users, hosted preview and client deployment, and required attribution/notices. If relying on another lawful basis, its applicability must be established by the responsible rights owner or qualified reviewer. A purchased/downloaded copy, an account login, or task implementation approval alone does not demonstrate these rights. COSO-origin portions and any required third-party notices must also be accounted for in the applicable grant.

Keep these questions separate:

| Question | Current evidence | Remaining input |
| --- | --- | --- |
| Can the supported criteria be inspected and source-mapped? | Publisher PDF readable; all 61 rows/pages checked; existing authored content covers all categories. | No missing SOC document for this review. |
| Can full official criterion wording be embedded and redistributed? | No applicable product grant found; source/catalog currently reference-only. | Applicable license, written permission, or established alternative basis. |
| Are existing authored paraphrases automatically rights-cleared because they are not verbatim? | No. Substantive correctness and original wording are separate from commercial-use/derivative-content rights. | Product owner review of the applicable terms and any existing grants; preserve current content while resolving that question. |
| Does software validation establish source rights or attestation? | No. | Keep those claims outside test results. |

Until resolved, existing authored summaries remain visibly attributed and cannot be relabeled official requirement text. Do not overwrite them with a bulk official-text import. Do not assume that permission for review includes permission for reproduction.

## All affected criterion IDs and existing source mappings

The table lists criterion-row references, not a reproduction of the standard. Each current checklist item maps to its row; detailed existing item identities and trigger mappings remain in `soc2-approved-assessment-content.md`.

| Criterion | Category | Printed PDF page | Current checks | Preserved historical items |
| --- | --- | ---: | ---: | ---: |
| CC1.1 | security | 14 | 2 | 4 |
| CC1.2 | security | 15 | 3 | 3 |
| CC1.3 | security | 16 | 2 | 3 |
| CC1.4 | security | 17 | 3 | 4 |
| CC1.5 | security | 18 | 1 | 3 |
| CC2.1 | security | 19 | 2 | 4 |
| CC2.2 | security | 21 | 2 | 3 |
| CC2.3 | security | 22 | 1 | 3 |
| CC3.1 | security | 24 | 2 | 2 |
| CC3.2 | security | 27 | 2 | 4 |
| CC3.3 | security | 28 | 1 | 2 |
| CC3.4 | security | 29 | 2 | 3 |
| CC4.1 | security | 30 | 2 | 3 |
| CC4.2 | security | 31 | 2 | 3 |
| CC5.1 | security | 31 | 2 | 2 |
| CC5.2 | security | 32 | 2 | 2 |
| CC5.3 | security | 33 | 2 | 4 |
| CC6.1 | security | 34 | 1 | 4 |
| CC6.2 | security | 36 | 3 | 5 |
| CC6.3 | security | 36 | 4 | 4 |
| CC6.4 | security | 37 | 2 | 2 |
| CC6.5 | security | 37 | 2 | 3 |
| CC6.6 | security | 38 | 1 | 4 |
| CC6.7 | security | 38 | 2 | 4 |
| CC6.8 | security | 39 | 2 | 3 |
| CC7.1 | security | 40 | 2 | 4 |
| CC7.2 | security | 40 | 2 | 5 |
| CC7.3 | security | 41 | 2 | 4 |
| CC7.4 | security | 42 | 4 | 4 |
| CC7.5 | security | 44 | 2 | 3 |
| CC8.1 | security | 45 | 8 | 4 |
| CC9.1 | security | 47 | 2 | 3 |
| CC9.2 | security | 48 | 2 | 4 |
| A1.1 | availability | 50 | 3 | 3 |
| A1.2 | availability | 50 | 8 | 4 |
| A1.3 | availability | 52 | 1 | 5 |
| C1.1 | confidentiality | 52 | 2 | 2 |
| C1.2 | confidentiality | 52 | 1 | 3 |
| PI1.1 | processing_integrity | 53 | 3 | 0 |
| PI1.2 | processing_integrity | 54 | 3 | 0 |
| PI1.3 | processing_integrity | 54 | 1 | 0 |
| PI1.4 | processing_integrity | 55 | 4 | 0 |
| PI1.5 | processing_integrity | 56 | 4 | 0 |
| P1.1 | privacy | 57 | 3 | 0 |
| P2.1 | privacy | 58 | 5 | 0 |
| P3.1 | privacy | 59 | 1 | 0 |
| P3.2 | privacy | 60 | 2 | 0 |
| P4.1 | privacy | 60 | 1 | 0 |
| P4.2 | privacy | 60 | 1 | 0 |
| P4.3 | privacy | 61 | 1 | 0 |
| P5.1 | privacy | 61 | 4 | 0 |
| P5.2 | privacy | 62 | 3 | 0 |
| P6.1 | privacy | 63 | 1 | 0 |
| P6.2 | privacy | 63 | 2 | 0 |
| P6.3 | privacy | 64 | 2 | 0 |
| P6.4 | privacy | 64 | 3 | 0 |
| P6.5 | privacy | 65 | 3 | 0 |
| P6.6 | privacy | 65 | 2 | 0 |
| P6.7 | privacy | 65 | 2 | 0 |
| P7.1 | privacy | 66 | 4 | 0 |
| P8.1 | privacy | 66 | 4 | 0 |

## Verification scope

This pass checked live source availability, all 61 row/page mappings, the 148/129 inventory, and exact historical-definition preservation against baseline 27746e5. It changed this document only. It did not run authenticated application or Mongo browser acceptance. Earlier isolated Demo/browser and automated persistence evidence in assessment-layout-delivery.md remains software evidence; it does not establish live authentication, production readiness, source permissions, or a CPA conclusion.
