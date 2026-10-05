# ISO assessment source inputs still required

Inventory checked 2026-10-05 for the approved assessment layout / PR #36.
This is a bounded source inventory, not a conformity opinion. No UI or catalog
change is made by this document.

## Availability actually established

The current criteria catalog has 123 stable definition IDs: 12 verified public
clause units with 96 checks, and 111 pending units (18 clause units and 93 Annex A
references). Pending means requirement-checklist completeness is unverified;
it does not mean the organization has no corresponding obligation.

The complete public clause 4–6 comparison is recorded in
[iso-assessment-criteria.md](iso-assessment-criteria.md). Source comparison of all
12 available units / 96 checks is closed after three qualifier corrections,
with all criterion identities retained. Official-paragraph reproduction remains
a separate conditional question, not a blocker to that completed comparison. The
111 pending units keep their existing guidance, applicability, save behavior,
links and history. Their missing source does not require disabling those workflows.

| Input | Available content | Permitted engineering use / remaining limitation |
| --- | --- | --- |
| [ISO edition metadata](https://www.iso.org/standard/27001) | Publication identity: ISO/IEC 27001:2022, edition 3; amendment listed | Edition identity only; no full clauses or control wording |
| [SIST publisher preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf) | Public preview ends after clause 6.3; clauses 4–6 exposed | Existing clause 4–6 check mapping; contents headings do not verify the absent clauses or Annex A |
| [ISO/IAF amendment communication](https://www.iso.org/files/live/sites/isoorg/files/standards/popular_standards/management_systems/ISO-IAF%20Joint%20Communique%20Feb%202024.pdf) | Climate-context change and interested-party note, including ISO/IEC 27001 | Amendment context already applied to 4.1/4.2; no replacement for the missing base-standard content |
| `shared/catalogs/iso27001.json` | All 30 clause units / 93 Annex A IDs, authored topic summaries, source metadata, Review and policy mappings | Reuse IDs, hierarchy and authored guidance; not proof of complete requirement decomposition |
| `shared/catalogs/iso27001Staging.json` | Authored clause profiles, recurring-obligation matrix, program architecture | Reuse architecture and explicitly classified operational suggestions; no normative-text authority |
| `shared/catalogs/operatorGuidance/isoRequirementGuide.json` | Per-ID original explanation, review prompts, evidence examples and expected outcomes | Reuse as authored guidance; examples do not become required documents or checklist obligations |
| `frontend/src/lib/operatorGuidance/iso.json` | Earlier authored topic/evidence guidance | Supporting guidance only, not a complete primary-source checklist |
| `shared/catalogs/isoAuditProgram.json` | User-supplied audit-methodology transcription; provenance names `ISMS Internal Audit Program(1).xlsx` and SHA-256 `5167a4293482381603a422a75fdbd565187cd27bdb3d20f4869c1cf7957902fa` | Preserve package/item keys and audit guidance; the workbook's methodology is not official ISO text |
| Repository source manifests / validation ledgers | Prior research links and explicit licensed-source limitations | Evidence of the prior limitations; dated `verified_on` is not a complete normative comparison |

Local checks covered tracked repository source/document paths, the current task's
`work/` tree for ISO/ISMS PDF, DOCX, XLSX or TXT source candidates, and the supplied
attachment directory `3e284623-21b7-41e6-8bfe-75971d1893e3`. The approved layout is
available separately at `C:/Users/RobbA/Downloads/approved-assessment-mockup.html`
and has been rendered for the coordinator's visual comparison; it is not an ISO
source document. No full ISO standard, source workbook or licensed
excerpt was found in those checked locations. No unrelated directories, accounts,
repositories or customer records were searched. A workbook filename/hash in the
catalog identifies provenance; it does not establish that the original file is
currently available or grant rights to an unrelated standard.

## Exact missing clause units

Provide legitimate access to the complete **ISO/IEC 27001:2022 clauses 7–10**,
including every subordinate normative paragraph, condition, required record and
explicit trigger. Full excerpts for those sections are sufficient if complete and
authorized; a whole licensed standard is also suitable. Titles below are the
existing product's authored titles, not asserted verbatim ISO headings.

| Definition ID | Existing product topic |
| --- | --- |
| 7.1 | ISMS resources |
| 7.2 | Role competence |
| 7.3 | Workforce awareness |
| 7.4 | ISMS communications |
| 7.5.1 | Required records |
| 7.5.2 | Document creation and revision |
| 7.5.3 | Document protection and availability |
| 8.1 | Controlled operational processes |
| 8.2 | Risk assessment execution |
| 8.3 | Treatment execution |
| 9.1 | Performance measurement |
| 9.2.1 | ISMS audit coverage |
| 9.2.2 | Internal audit program |
| 9.3.1 | Management review operation |
| 9.3.2 | Management review inputs |
| 9.3.3 | Management review decisions |
| 10.1 | Ongoing ISMS improvement |
| 10.2 | Nonconformity correction |

Internal-audit workpaper checklists resolve through these same definition IDs;
the supplied audit methodology cannot fill missing source requirements. Planned
intervals must remain planned intervals wherever the actual source specifies
them. An operational annual/quarterly schedule cannot substitute for source text.

## Exact missing Annex A references

Provide the complete **ISO/IEC 27001:2022 Annex A** reference-control text, including
official identifiers, titles and control statements. The 93 existing product IDs
are listed explicitly below. The product's `A.` prefix remains its stable namespace.
Annex A comparison is required by risk treatment; every reference control is not
automatically necessary for every organization. The SoA retains those decisions,
their justification and implementation state, including necessary non-Annex controls.

- Organizational (37): A.5.1, A.5.2, A.5.3, A.5.4, A.5.5, A.5.6, A.5.7, A.5.8, A.5.9, A.5.10, A.5.11, A.5.12, A.5.13, A.5.14, A.5.15, A.5.16, A.5.17, A.5.18, A.5.19, A.5.20, A.5.21, A.5.22, A.5.23, A.5.24, A.5.25, A.5.26, A.5.27, A.5.28, A.5.29, A.5.30, A.5.31, A.5.32, A.5.33, A.5.34, A.5.35, A.5.36, A.5.37.
- People (8): A.6.1, A.6.2, A.6.3, A.6.4, A.6.5, A.6.6, A.6.7, A.6.8.
- Physical (14): A.7.1, A.7.2, A.7.3, A.7.4, A.7.5, A.7.6, A.7.7, A.7.8, A.7.9, A.7.10, A.7.11, A.7.12, A.7.13, A.7.14.
- Technological (34): A.8.1, A.8.2, A.8.3, A.8.4, A.8.5, A.8.6, A.8.7, A.8.8, A.8.9, A.8.10, A.8.11, A.8.12, A.8.13, A.8.14, A.8.15, A.8.16, A.8.17, A.8.18, A.8.19, A.8.20, A.8.21, A.8.22, A.8.23, A.8.24, A.8.25, A.8.26, A.8.27, A.8.28, A.8.29, A.8.30, A.8.31, A.8.32, A.8.33, A.8.34.

## Edition, amendment and rights boundaries

The source must identify the 2022 edition. A 2013 control list, draft, redline or
unattributed internet checklist is not interchangeable with the missing 2022 text.
The 2024 amendment is relevant to 4.1/4.2 and already supported by the public
primary communication. Its complete authorized text may be used for a final
edition check; it does not supply the absent clauses 7–10 or Annex A.

Access for comparison, permission to reproduce official wording in the product,
and permission to distribute a source document are distinct. A supplied file or
purchased copy does not by itself establish product redistribution rights. Confirm
the source's applicable terms before copying official text into the catalog or
publishing a source file. Requirement checks remain clearly authored paraphrases;
no new official-wording reproduction is authorized by this source-input inventory.
Do not place a purchased full standard in Git or the hosted preview merely to
enable verification. Existing authored guidance is reusable repository content;
it cannot be relabeled as verified official wording.

**ISO/IEC 27002 is not required to finish requirement-only ISO/IEC 27001 checks.**
The missing authoritative inputs are the applicable 27001 clauses and Annex A.
27002 is companion implementation guidance and would be relevant only to a
separately scoped detailed guidance review; its examples and implementation
advice must not become extra mandatory 27001 checklist obligations.

## Completion evidence once source access is available

Compare every pending unit with its entire applicable source section, author
separate checks for independently satisfiable obligations, and record source
section plus edition for each item. Verify conditions, scope/applicability,
documented-information duties and explicit timing without adding a numerical
cadence. Preserve stable identities and existing historical selections; do not
translate a new checklist into automatic status, applicability or audit results.
Then run the existing focused source/persistence/UI checks and document exactly
which of the 111 pending units have been closed. This document does not claim
those missing-source comparisons, publication rights or delivery gates are closed.

## Consolidated owner inputs

The single remaining input list is maintained in
[assessment-layout-inputs.md](assessment-layout-inputs.md): legitimate access to
the 111 missing ISO units, plus the separate conditional question of applicable
official-paragraph reproduction permission/terms. The approved HTML is available;
no additional layout artifact is requested. The completed public-source comparison
of 12 units / 96 checks is not reopened by either remaining input.

These inputs do not replace technical verification. The public-source check
comparison and existing automated UI/persistence checks can proceed within
their bounded scope; missing inputs remain explicit delivery gates rather than
an invented requirement or a claim that everything has been verified.
