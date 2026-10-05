# SOC 2 assessment source inputs for PR 36

Inspection date: 2026-10-05. Initial source inventory commit: `56dca744dd3e7b62be1eada43cb99e8aa65a5f5a`; substantive checklist comparison: `5f7a6fd`. This document records source and rights inputs; it does not approve content redistribution or claim an auditor opinion.

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

The current 148 criterion-only `assessment_criteria` items are authored paraphrases mapped to criterion rows. Their technical source is available; there is no missing-document blocker for reviewing the checklist across any supported SOC category. Existing mappings and practical text can be reused without recreating 61 independent catalogs. Their substantive review is distinct from any future proposal to reproduce official paragraphs. No official paragraphs are proposed or embedded; the missing official-wording reproduction input does not block this authored checklist review, UI work, or testing.

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
| Does the absence of full-text reproduction permission block this authored checklist review or its UI testing? | No official paragraphs are proposed or embedded. Substantive accuracy can be reviewed against the available source. | Keep the reproduction question limited to any future official-text proposal; do not use it to defer the authored checklist comparison. |
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

## Substantive comparison of all current checklist items

Completed 2026-10-05 against the publisher-hosted PDF linked above and current catalog at `5f7a6fd`. Reviewed all 61 criterion statements and all 148 authored `assessment_criteria` items, using each mapped printed page in the inventory above. The criterion statement before its Points-of-Focus list supplies the obligation; .03–.07 supplies interpretation context. CC1.2 also uses footnote 15 on printed page 16 for the small-entity governance qualification. The official source remains a reference, not imported product wording.

**Resolved: five criteria / ten review-affected existing item IDs.** Nine authored texts were corrected; the first CC1.3 text already carried governance oversight and remains unchanged. The table below records the original findings and applied resolutions. These are substantive scope or obligation mismatches, not demands to implement every Point of Focus. None of the remaining 56 criteria has an identified unsupported or omitted criterion obligation in this comparison. That statement is a bounded editorial review, not attestation, proof of implementation, or a claim that checking boxes fulfills a criterion.

| Criterion / source | Affected current item IDs | Actual mismatch | Minimal proposed resolution (authored wording) |
| --- | --- | --- | --- |
| CC1.3, criterion row, printed p16 | `CC1.3-assessment-v1-1`, `CC1.3-assessment-v1-2` | Governance oversight qualifies management's establishment of structures, reporting lines, authorities, and responsibilities. Only the first current item carries oversight; the second could be satisfied without oversight of authority/responsibility decisions. | Retain the first item. Change item 2 to “Management establishes appropriate authority and responsibilities under governance oversight to achieve objectives.” Both checks then preserve the shared oversight condition. |
| CC1.4, criterion row, printed p17 | `CC1.4-assessment-v1-1`, `CC1.4-assessment-v1-2`, `CC1.4-assessment-v1-3` | The criterion evaluates demonstrated commitment to attracting, developing, and retaining competent people. The current imperatives instead require successful attraction/development/retention as unconditional outcomes. A commitment can be demonstrated even when an individual leaves or recruitment is incomplete. | Prefix each with “Demonstrate a commitment to” and retain its competence/objective scope: attracting people with needed competence, developing competence, and retaining competent people. Do not add a staffing success metric or mandatory training artifact from Points of Focus. |
| CC6.3, criterion row, printed p36 | `CC6.3-assessment-v1-1`, `CC6.3-assessment-v1-2` | Item 1 changes alternative/applicable access bases into a conjunctive roles/responsibilities/system-design requirement. Item 2 limits modification/removal to changes in those bases, rather than keeping authorization/modification/removal governed by the applicable bases and changes generally. The two least-privilege/segregation checks correctly preserve the criterion's consideration requirement. | Item 1: “Authorize access to protected information assets according to applicable roles, responsibilities, or system design.” Item 2: “Modify or remove that access according to applicable roles, responsibilities, system design, and changes.” Retain items 3–4 unchanged. |
| CC9.1, criterion row, printed p47 | `CC9.1-assessment-v1-1` | The criterion's identification verb applies to risk-mitigation activities. The current first item instead makes identification of disruption risks the check and leaves identification of mitigation activities implicit. Risk identification is relevant context and separately addressed by CC3.2, but is not the object of this row's identification obligation. | Replace item 1 with “Identify activities that mitigate risks arising from potential business disruptions.” Retain item 2's selection/development requirement. |
| P8.1, criterion row, printed p66 | `P8.1-assessment-v1-1`, `P8.1-assessment-v1-2` | The criterion requires implementation of a process for receiving, addressing, resolving, and communicating resolution. The current two activity checks can be fulfilled through isolated ad hoc responses without implementing that process. Periodic compliance monitoring and timely corrective action in items 3–4 are supported and complete. | Item 1: “Implement a process to receive and address privacy inquiries, complaints, and disputes from people and others.” Item 2: “Use that process to resolve those matters and communicate their resolution.” Retain items 3–4 unchanged. |

The authorized follow-up applied these corrections to current authored text and its identical validation-catalog copy. All 148 current item IDs and counts are preserved; all 129 historical definitions and saved-selection identities remain unchanged. No official text or product explanation was introduced. No data migration is required.

### Complete review disposition

Reviewed with no additional substantive mismatch identified: CC1.1–CC1.2; CC1.5; CC2.1–CC2.3; CC3.1–CC3.4; CC4.1–CC4.2; CC5.1–CC5.3; CC6.1–CC6.2; CC6.4–CC6.8; CC7.1–CC7.5; CC8.1; CC9.2; A1.1–A1.3; C1.1–C1.2; PI1.1–PI1.5; P1.1; P2.1; P3.1–P3.2; P4.1–P4.3; P5.1–P5.2; P6.1–P6.7; P7.1. Together with the five findings above this accounts for all 61 criteria and all 148 current items. Shared achievement-of-objectives context is retained by the criterion workspace and source reference; an individual split checkbox is not a standalone replacement standard.

No mandatory numeric cadence, artifact, vendor/product, or control method was found promoted from Points of Focus into the current arrays. In particular: A1.3's periodic testing examples remain guidance rather than an invented mandatory interval; P6.4's periodic/as-needed review and P8.1's periodic monitoring come from their criterion rows; CC6.3's least privilege and segregation are considerations, not a prescribed implementation; privacy controller/processor Points-of-Focus allocations are not flattened into universally mandatory checks. Review/outcome prose and legacy v1 Points-of-Focus-derived items are outside the current criterion-only obligation assertions reviewed here.

### Preservation and source verification

A read-only JSON comparison to baseline `27746e5` verifies 129/129 historical item objects unchanged (ID, text, tier, source type, reference); all 148 current item IDs are distinct and have identical text in their appended backend-validation entries. The largest combined current/historical set remains 12, below the 30-selection ceiling. The source review itself was documentation-only; the authorized follow-up changes nine current checklist labels and their validation-catalog copies. It changes no response IDs, stored selections, save logic, scopes, history, findings, or environment configuration. UI/Demo and authenticated synthetic-storage test evidence are separate from this editorial comparison; no real Mongo acceptance or CPA opinion is asserted here.


### Resolved follow-up verification

Focused check: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand src/lib/socAssessmentPresentation.test.js src/lib/socPracticalGuidance.test.js src/components/PrestigeSocAssessment.test.jsx` from `frontend`: **3 suites / 90 tests passed**. The new source-semantics regression covers the five corrected qualification/obligation distinctions; existing all-61 exact rendered-content tests, validation-copy equality, distinct IDs, selection ceiling, timing bounds, legacy content hash, save/reopen, permissions, and draft/findings protections passed. Independent JSON comparison again verified all 129 historical objects unchanged and 148 current IDs retained. No UI source or official paragraphs changed in this follow-up.
