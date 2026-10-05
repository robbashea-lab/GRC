# SOC 2 approved assessment content mapping

Verified 2026-10-05 against the supported 2017 Trust Services Criteria with revised Points of Focus (2022).

Source: [AICPA publication](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) and [official PDF](https://assets.ctfassets.net/rb9cdnjh59cm/5jT1narHNQNzt4JGlkd1gr/248661d08e42531329d147782a6f8854/Trust-services-criteria.pdf). Criterion rows, not Points of Focus, define the checklist scope. Paragraphs .03–.07 distinguish criteria outcomes from selected controls and contextual Points of Focus. Checklist text is authored paraphrase, not official quotation.

## Official wording conflict

The approved layout requests an official requirement paragraph. This SOC catalog remains reference-only: no product redistribution authorization for full official text was found, and no official_text is embedded. Existing authored summaries must retain their authored classification. The authorized-text mechanism can display official wording if an authorized catalog is supplied. The official source link opens the complete publisher PDF; it does not claim to target an individual criterion.

## Stable response preservation

The 129 legacy v1 items remain unchanged, including IDs, text, tiers, and provenance. They remain valid for historical selections but are not displayed as current requirement-only obligations. The new assessment_criteria array holds 148 concise criterion-only items for all 61 IDs, using distinct <criterion>-assessment-v1-<number> identities. Equivalent entries are appended to items solely to reuse existing backend and Demo ID validation. Existing practical summary/review/outcome text is unchanged.

Normal saves must preserve legacy selections when toggling a current item. No migration or automatic semantic mapping is appropriate. The maximum combined catalog size is 12 selectable IDs per criterion, below the existing 30-selection ceiling; no API limit increase is needed. Responses do not change status, verification, narratives, evidence, reviews, findings, or readiness calculations.

## Timing and links

Trigger strings paraphrase timing or event conditions in the criterion itself. Null means no separate explicit cadence/trigger line; it does not mean the control never operates. No annual, quarterly, monthly, universal retention period, or testing interval is invented. P6.4 retains periodic/as-needed meaning; P8.1 retains periodic monitoring and prompt correction. Before-credential, before-collection, before-disclosure, request, and incident conditions remain distinct. Timing from Points of Focus is not promoted to a universal obligation.

## Item-level source mapping

All items in a row map to that criterion’s official row on the printed PDF page shown. Splits separate independently satisfiable verbs, objects, or qualifications; selected methods, artifacts, products, and Points of Focus remain review guidance. CC1.2 preserves the small-entity governance qualification in source footnote 15.

| Criterion | Printed page | Stable items | Trigger |
| --- | ---: | --- | --- |
| CC1.1 | 14 | CC1.1-assessment-v1-1, CC1.1-assessment-v1-2 | None separately specified |
| CC1.2 | 15 | CC1.2-assessment-v1-1, CC1.2-assessment-v1-2, CC1.2-assessment-v1-3 | None separately specified |
| CC1.3 | 16 | CC1.3-assessment-v1-1, CC1.3-assessment-v1-2 | None separately specified |
| CC1.4 | 17 | CC1.4-assessment-v1-1, CC1.4-assessment-v1-2, CC1.4-assessment-v1-3 | None separately specified |
| CC1.5 | 18 | CC1.5-assessment-v1-1 | None separately specified |
| CC2.1 | 19 | CC2.1-assessment-v1-1, CC2.1-assessment-v1-2 | None separately specified |
| CC2.2 | 21 | CC2.2-assessment-v1-1, CC2.2-assessment-v1-2 | None separately specified |
| CC2.3 | 22 | CC2.3-assessment-v1-1 | None separately specified |
| CC3.1 | 24 | CC3.1-assessment-v1-1, CC3.1-assessment-v1-2 | None separately specified |
| CC3.2 | 27 | CC3.2-assessment-v1-1, CC3.2-assessment-v1-2 | None separately specified |
| CC3.3 | 28 | CC3.3-assessment-v1-1 | None separately specified |
| CC3.4 | 29 | CC3.4-assessment-v1-1, CC3.4-assessment-v1-2 | Assess changes that could significantly affect internal control. |
| CC4.1 | 30 | CC4.1-assessment-v1-1, CC4.1-assessment-v1-2 | Perform ongoing or separate evaluations. |
| CC4.2 | 31 | CC4.2-assessment-v1-1, CC4.2-assessment-v1-2 | Evaluate and communicate internal-control deficiencies promptly. |
| CC5.1 | 31 | CC5.1-assessment-v1-1, CC5.1-assessment-v1-2 | None separately specified |
| CC5.2 | 32 | CC5.2-assessment-v1-1, CC5.2-assessment-v1-2 | None separately specified |
| CC5.3 | 33 | CC5.3-assessment-v1-1, CC5.3-assessment-v1-2 | None separately specified |
| CC6.1 | 34 | CC6.1-assessment-v1-1 | None separately specified |
| CC6.2 | 36 | CC6.2-assessment-v1-1, CC6.2-assessment-v1-2, CC6.2-assessment-v1-3 | Register and authorize users before issuing credentials or granting access; remove credentials when access is no longer authorized. |
| CC6.3 | 36 | CC6.3-assessment-v1-1, CC6.3-assessment-v1-2, CC6.3-assessment-v1-3, CC6.3-assessment-v1-4 | Modify or remove access when roles, responsibilities, or system design change. |
| CC6.4 | 37 | CC6.4-assessment-v1-1, CC6.4-assessment-v1-2 | None separately specified |
| CC6.5 | 37 | CC6.5-assessment-v1-1, CC6.5-assessment-v1-2 | Reduce recoverability before ending protection of physical assets. |
| CC6.6 | 38 | CC6.6-assessment-v1-1 | None separately specified |
| CC6.7 | 38 | CC6.7-assessment-v1-1, CC6.7-assessment-v1-2 | Protect information during transmission, movement, or removal. |
| CC6.8 | 39 | CC6.8-assessment-v1-1, CC6.8-assessment-v1-2 | Act when unauthorized or malicious software is introduced. |
| CC7.1 | 40 | CC7.1-assessment-v1-1, CC7.1-assessment-v1-2 | Identify configuration changes introducing vulnerabilities and susceptibility to newly discovered vulnerabilities. |
| CC7.2 | 40 | CC7.2-assessment-v1-1, CC7.2-assessment-v1-2 | None separately specified |
| CC7.3 | 41 | CC7.3-assessment-v1-1, CC7.3-assessment-v1-2 | Take action when security events could cause or have caused failure to meet objectives. |
| CC7.4 | 42 | CC7.4-assessment-v1-1, CC7.4-assessment-v1-2, CC7.4-assessment-v1-3, CC7.4-assessment-v1-4 | Respond to identified security incidents. |
| CC7.5 | 44 | CC7.5-assessment-v1-1, CC7.5-assessment-v1-2 | Recover from identified security incidents. |
| CC8.1 | 45 | CC8.1-assessment-v1-1, CC8.1-assessment-v1-2, CC8.1-assessment-v1-3, CC8.1-assessment-v1-4, CC8.1-assessment-v1-5, CC8.1-assessment-v1-6, CC8.1-assessment-v1-7, CC8.1-assessment-v1-8 | None separately specified |
| CC9.1 | 47 | CC9.1-assessment-v1-1, CC9.1-assessment-v1-2 | None separately specified |
| CC9.2 | 48 | CC9.2-assessment-v1-1, CC9.2-assessment-v1-2 | None separately specified |
| A1.1 | 50 | A1.1-assessment-v1-1, A1.1-assessment-v1-2, A1.1-assessment-v1-3 | None separately specified |
| A1.2 | 50 | A1.2-assessment-v1-1, A1.2-assessment-v1-2, A1.2-assessment-v1-3, A1.2-assessment-v1-4, A1.2-assessment-v1-5, A1.2-assessment-v1-6, A1.2-assessment-v1-7, A1.2-assessment-v1-8 | None separately specified |
| A1.3 | 52 | A1.3-assessment-v1-1 | None separately specified |
| C1.1 | 52 | C1.1-assessment-v1-1, C1.1-assessment-v1-2 | None separately specified |
| C1.2 | 52 | C1.2-assessment-v1-1 | None separately specified |
| PI1.1 | 53 | PI1.1-assessment-v1-1, PI1.1-assessment-v1-2, PI1.1-assessment-v1-3 | None separately specified |
| PI1.2 | 54 | PI1.2-assessment-v1-1, PI1.2-assessment-v1-2, PI1.2-assessment-v1-3 | None separately specified |
| PI1.3 | 54 | PI1.3-assessment-v1-1 | None separately specified |
| PI1.4 | 55 | PI1.4-assessment-v1-1, PI1.4-assessment-v1-2, PI1.4-assessment-v1-3, PI1.4-assessment-v1-4 | None separately specified |
| PI1.5 | 56 | PI1.5-assessment-v1-1, PI1.5-assessment-v1-2, PI1.5-assessment-v1-3, PI1.5-assessment-v1-4 | None separately specified |
| P1.1 | 57 | P1.1-assessment-v1-1, P1.1-assessment-v1-2, P1.1-assessment-v1-3 | Update and communicate notice promptly when privacy practices change. |
| P2.1 | 58 | P2.1-assessment-v1-1, P2.1-assessment-v1-2, P2.1-assessment-v1-3, P2.1-assessment-v1-4, P2.1-assessment-v1-5 | None separately specified |
| P3.1 | 59 | P3.1-assessment-v1-1 | None separately specified |
| P3.2 | 60 | P3.2-assessment-v1-1, P3.2-assessment-v1-2 | Obtain required explicit consent before collecting personal information. |
| P4.1 | 60 | P4.1-assessment-v1-1 | None separately specified |
| P4.2 | 60 | P4.2-assessment-v1-1 | None separately specified |
| P4.3 | 61 | P4.3-assessment-v1-1 | None separately specified |
| P5.1 | 61 | P5.1-assessment-v1-1, P5.1-assessment-v1-2, P5.1-assessment-v1-3, P5.1-assessment-v1-4 | Provide copies on request; explain access denials where required. |
| P5.2 | 62 | P5.2-assessment-v1-1, P5.2-assessment-v1-2, P5.2-assessment-v1-3 | Communicate corrections where committed or required; explain denied correction requests. |
| P6.1 | 63 | P6.1-assessment-v1-1 | Obtain explicit consent before third-party disclosure. |
| P6.2 | 63 | P6.2-assessment-v1-1, P6.2-assessment-v1-2 | None separately specified |
| P6.3 | 64 | P6.3-assessment-v1-1, P6.3-assessment-v1-2 | None separately specified |
| P6.4 | 64 | P6.4-assessment-v1-1, P6.4-assessment-v1-2, P6.4-assessment-v1-3 | Assess third-party compliance periodically and as needed; take corrective action where necessary. |
| P6.5 | 65 | P6.5-assessment-v1-1, P6.5-assessment-v1-2, P6.5-assessment-v1-3 | Report and act on notifications of actual or suspected unauthorized disclosures. |
| P6.6 | 65 | P6.6-assessment-v1-1, P6.6-assessment-v1-2 | Notify relevant recipients of breaches and incidents according to privacy objectives. |
| P6.7 | 65 | P6.7-assessment-v1-1, P6.7-assessment-v1-2 | Provide an accounting of information held and disclosures on request. |
| P7.1 | 66 | P7.1-assessment-v1-1, P7.1-assessment-v1-2, P7.1-assessment-v1-3, P7.1-assessment-v1-4 | None separately specified |
| P8.1 | 66 | P8.1-assessment-v1-1, P8.1-assessment-v1-2, P8.1-assessment-v1-3, P8.1-assessment-v1-4 | Monitor privacy compliance periodically; address identified deficiencies promptly. |

## Verification

The standard-library comparison against baseline 27746e5 verified all catalog IDs, unchanged legacy item definitions, unchanged practical text, unique new IDs, criterion provenance, and the 30-item ceiling. Frontend content tests cover the same identity/persistence contract and explicit timing boundaries. Browser, API, and full regression verification belong to the combined implementation handoff.
