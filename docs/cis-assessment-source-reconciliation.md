# CIS 11.1, 12.2 and 17.5 source reconciliation

Verified on 2026-10-05 against the original local workbook and the current official CIS CAS v8.1 pages. This investigation changes no catalogs, checklist identities, framework membership, client records or product text.

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

The pages identify their framework as the CIS Controls Assessment Specification for Controls v8.1. The links resolve to the actual safeguard headings. This does not establish that CAS is a replacement for the supplied licensed Navigator source or that its differing words override that source. The date embedded in the export filename is not asserted to be workbook publisher metadata.

## Proposed resolution

Use the now re-verified, immutable supplied Navigator export as the canonical description and checklist basis for the supported catalog. Preserve all three official descriptions exactly and keep the genuine official CAS links. Record the differences here and in the source mapping; do not claim literal identity between the embedded workbook wording and the linked CAS paragraph.

- **11.1:** Preserve documented recovery process, recovery scope, recovery prioritization, backup-data security and the stated documentation review/update timing. Keep detailed backup procedures as possible supporting implementation material, not an added checkbox obligation.
- **12.2:** Preserve the exact workbook example sentence and require an actual designed and maintained secure architecture covering segmentation, least privilege and availability. Assessment guidance should evaluate policy/design and implemented architecture rather than treating a diagram alone as satisfactory; do not turn an example into a mandatory new document format or workflow.
- **17.5:** Preserve the workbook's named role population and review triggers. Third parties can participate where the actual client's response arrangement uses them; the CAS addition does not become an unconditional extra category in the canonical checklist.

No source substitution or silent catalog migration is proposed. A future change to canonical source authority should use a separately approved content/version decision, retain historical selections and assessment evidence, and explicitly identify which publication supplies the revised obligations. This investigation verifies provenance and exact textual differences; it does not independently inspect a licensing agreement or claim whole-framework conformity.
