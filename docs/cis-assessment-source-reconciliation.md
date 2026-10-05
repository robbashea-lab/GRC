# CIS 11.1, 12.2 and 17.5 source reconciliation

Verified on 2026-10-05 against the original local workbook and the current official CIS CAS v8.1 pages. The initial source comparison changed no catalogs. The approved bounded checklist corrections and preserved historical identities are recorded below; framework membership, official descriptions and client records remain unchanged.

## Exact workbook and verification

- File: `C:\Users\RobbA\Downloads\CIS-Controls-Navigator-Export-2026-10-04T17_39_50.xlsx`.
- SHA-256: `ba40e13de102075e8f12534f45acffd7ad53ce5dcfe7a9334cddccf0b45ea9ee`.
- Worksheet name: `Worksheet`; package part: `xl/worksheets/sheet1.xml`.
- Columns: A = Control; B = safeguard identifier; C = title; E = minimum implementation group; F = official description.
- Supported framework: repository CIS Controls **v8.1**. The workbook is the exact Navigator export previously used by the catalog: its hash matches the prior comparison ledger in `cis-six-year-coverage.json` and `cis-pr33-final-corrections.md`. The export does not have `docProps/core.xml` or `docProps/app.xml`, and no independent workbook version/publisher metadata was found. Its v8.1 attribution therefore rests on the established supplied-export provenance and the repository's supported version, rather than an invented metadata field.

Read-only command from repository root:

```powershell
& 'C:\Users\RobbA\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' backend/scripts/compare_cis_workbook.py 'C:\Users\RobbA\Downloads\CIS-Controls-Navigator-Export-2026-10-04T17_39_50.xlsx' --output '..\cis-workbook-source-recheck.json'
```

Result: exit code **0**; **153 reference rows and 153 catalog rows**, zero duplicates, zero missing or unexpected identifiers, and exact cumulative populations **56 / 130 / 153**. All Controls, minimum groups, normalized titles and **raw official descriptions** match the workbook. The three disputed descriptions match exactly, including the embedded newline in 11.1. This is a current re-verification of the actual file, superseding the earlier limitation that only the prior ledger had been inspected. The comparison was run with repository HEAD `56dca744dd3e7b62be1eada43cb99e8aa65a5f5a`; the scratch result remains outside Git.

## Exact conflicting excerpts

| Safeguard | Verified workbook cell | Workbook / canonical excerpt | Current CAS difference | Result |
| --- | --- | --- | --- | --- |
| 11.1 | `Worksheet!F88` (`B88` identifier; `C88` title; `E88` = 1) | First sentence: “Establish and maintain a documented data recovery process.” | CAS inserts “that includes detailed backup procedures” before the first sentence ends. | The workbook does not impose that added phrase. Scope, recovery prioritization, backup-data security and annual/significant-change documentation review are common to both. |
| 12.2 | `Worksheet!F94` (`B94` identifier; `C94` title; `E94` = 2) | Last sentence: “Example implementations will not solely include documentation, but also policy and design components.” | CAS instead says: “Example implementations may include documentation, policy, and design components.” | The required secure architecture and its minimum segmentation, least-privilege and availability attributes match; the implementation-example treatment differs. |
| 17.5 | `Worksheet!F146` (`B146` identifier; `C146` title; `E146` = 2) | Named-role list ends: “human resources, incident responders, and analysts.” | CAS ends the list with “incident responders, analysts, and relevant third parties.” | The workbook omits the added third-party category. Assigned internal role population and annual/significant-change review otherwise match. |

Official CAS v8.1 pages accessed on 2026-10-05:

- [Safeguard 11.1](https://cas.docs.cisecurity.org/en/latest/source/Controls11/#111-establish-and-maintain-a-data-recovery-process). Fetched page SHA-256: `64b9fc7dbd72ca64f77263a3253bccd64f658cfd626a18dd543020fb8171c94f`.
- [Safeguard 12.2](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#122-establish-and-maintain-a-secure-network-architecture). Fetched page SHA-256: `b86c7314f9857ee4afd9acad5661b3a82b1f8b43c6c0d91165de0b14b6531e53`.
- [Safeguard 17.5](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#175-assign-key-roles-and-responsibilities). Fetched page SHA-256: `a6dcca0952c7f7b3c5fd75c759ea550966b498275e2e955d804b3d61d116e575`.

The pages identify their framework as the CIS Controls Assessment Specification for Controls v8.1. The links resolve to the actual safeguard headings. This does not establish that CAS is a replacement for the supplied Navigator source or that its differing words override that source. The date embedded in the export filename is not asserted to be workbook publisher metadata.

## Resolved source authority

The user confirmed that the supplied Navigator workbook is the catalog authority. The now re-verified, immutable supplied export therefore remains the canonical description and checklist basis for the supported catalog. All three official descriptions remain exact and the genuine official CAS links remain. The differences are recorded here and in the source mapping; literal identity between the embedded workbook wording and the linked CAS paragraph is not claimed. The 11.1/12.2/17.5 source-authority question is resolved and requires no further owner decision.

- **11.1:** Preserve documented recovery process, recovery scope, recovery prioritization, backup-data security and the stated documentation review/update timing. Keep detailed backup procedures as possible supporting implementation material, not an added checkbox obligation.
- **12.2:** Preserve the exact workbook example sentence and require an actual designed and maintained secure architecture covering segmentation, least privilege and availability. Assessment guidance should evaluate policy/design and implemented architecture rather than treating a diagram alone as satisfactory; do not turn an example into a mandatory new document format or workflow.
- **17.5:** Preserve the workbook's named role population and review triggers. Third parties can participate where the actual client's response arrangement uses them; the CAS addition does not become an unconditional extra category in the canonical checklist.

No source substitution or silent catalog migration is proposed. A future change to canonical source authority should use a separately approved content/version decision, retain historical selections and assessment evidence, and explicitly identify which publication supplies the revised obligations. This investigation verifies provenance and exact textual differences; it does not independently inspect a licensing agreement or claim whole-framework conformity.

## Bounded all-safeguard checklist verification

At HEAD `5f7a6fdd1ddbca8ad7d396f3b502391934dade78`, every current checklist assertion was reread against all **153 actual workbook descriptions**. The existing comparison command was rerun successfully: all 153 raw official descriptions, titles, Controls and implementation groups still match the original workbook, with cumulative populations 56/130/153. CAS wording was not substituted.

Three demonstrated checklist discrepancies were corrected within the approved scope:

| Safeguard | Demonstrated discrepancy | Correction and history preservation |
| --- | --- | --- |
| 7.1 | Old `7.1-c1` described a documented process without explicit maintenance; `7.1-c2` required review but omitted the workbook's documentation update operation. | Archive both original IDs/text unchanged. New stable `7.1-c3` covers establishment/maintenance of the documented vulnerability-management process; `7.1-c4` covers review/update annually or when significant enterprise changes could affect the safeguard. |
| 4.12 | `4.12-c4` and `4.12-c5` made application/data separation distinct mandatory checks, although the workbook supplies those details as implementation examples. | Archive both IDs/text unchanged. Keep the supported-mobile enterprise-workspace requirement `4.12-c1`. The implementation examples remain available in existing practical/review guidance. |
| 3.7 | `3.7-c5` promoted the workbook's optional label/classification implementation sentence to a universal operational assertion. | Archive `3.7-c5` and its exact prior text. Keep the mandatory overall classification scheme and review/update requirements. Existing explanatory guidance remains available. |

After correction, the catalog contains **480 current source-supported criteria and 291 archived historical assertions**. All original baseline identities and the newly archived response identities remain available to the existing save validator and historical-response display. No selection is remapped or used to confirm a replacement assertion. Every current-plus-historical per-assessment union remains within the actual **20-selection** bound; the largest union is 20.

`cis-assessment-workbook-verification.json` records all 153 workbook cells, exact source-description hashes, current item identities, source-scope review dispositions and union bounds. This is a bounded source-completeness review: after the three corrections, no further demonstrated unsupported mandatory assertion or omitted mandatory source facet remains. It is not an assessment of client implementation or whole-framework assurance. The semantic completeness judgment is a manual review; automated raw-source identity, structural and regression checks provide supporting evidence and are not described as independent proof of every paraphrase.
