# ISO assessment check coverage

The assessment layout uses `operatorGuidance/isoAssessmentCriteria.json` as the
single check catalog for ISMS assessment records and internal-audit workpapers.
Selections are assessor records, never automatic implementation or audit results.

## Sources and limitations

Checked on 2026-10-05 against the [ISO publication metadata](https://www.iso.org/standard/27001),
the [SIST public preview](https://preview.sist.si/sist-preview/82875/726bcf58250e43d9a666b4d929c8fbdb/ISO-IEC-27001-2022.pdf)
and the [ISO/IAF amendment communication](https://www.iso.org/files/live/sites/isoorg/files/standards/popular_standards/management_systems/ISO-IAF%20Joint%20Communique%20Feb%202024.pdf).
The preview ends after clause 6.3; clauses 7–10 and Annex A are unavailable.
No full licensed standard was supplied. Existing original implementation prompts
are useful guidance but do not establish complete requirement coverage.

All 12 catalog units in clauses 4–6 have repository-authored paraphrases derived
from the complete publicly available units: 96 separate checks. Their `coverage`
is `verified` for this scoped content mapping, not a claim of independent
conformity verification. The other 111 units (18 in clauses 7–10 and 93 Annex A
controls) remain `pending`, with empty criteria; do not infer that those units
have no requirements. New clause 5–6 checks also identify their specific source
subpoint. Clause 6.1.3 separately covers necessary-control selection/comparison,
SoA inclusion/implementation/exclusion, treatment plans, approval and residual
risk acceptance. Additional necessary controls are included in that assessment;
Annex A is not treated as the complete necessary-control universe.
Select only verified checks. Do not convert example evidence into required documents.
No fixed review frequency is invented. Contextual triggers are retained only for
ISMS planning in 6.1.1, appropriate objective updates in 6.2 and ISMS changes in 6.3.

## Bounded substantive comparison

Reopened the public preview and amendment communication on 2026-10-05 and compared
all 96 checks in the 12 available units against the complete exposed unit text.
The review started from `5f7a6fdd1ddbca8ad7d396f3b502391934dade78` and included
conditions, subjects, alternative formulations, required documented information,
source-derived timing and separation of independently satisfiable obligations.
Three authored paraphrases needed qualifier corrections; their IDs were retained.

| Unit | Checks | Result of the bounded comparison |
| --- | ---: | --- |
| 4.1 | 2 | Corrected purpose relevance; climate consideration matches the amendment |
| 4.2 | 3 | Covered; amendment note does not create a separate climate-program obligation |
| 4.3 | 5 | Covered |
| 4.4 | 4 | Covered |
| 5.1 | 10 | Covered |
| 5.2 | 7 | Covered |
| 5.3 | 3 | Covered |
| 6.1.1 | 11 | Corrected prevention/reduction purpose |
| 6.1.2 | 20 | Covered |
| 6.1.3 | 14 | Corrected appropriate option selection; SoA decisions remain separate |
| 6.2 | 16 | Covered |
| 6.3 | 1 | Covered |

No unsupported additional obligation was identified in this bounded comparison.
The three corrections preserve all existing criterion IDs and stored selections;
they clarify existing obligations without adding fields, changing conclusions,
or altering the 111 pending units. This is source comparison of authored checks,
not certification, independent professional conformity assurance or permission
to reproduce full official paragraphs. Framework `coverage: verified` records
this scoped mapping only.

Official-paragraph reproduction rights remain separate from the authored-check
comparison. No official paragraphs or full source files were added. That rights
question does not prevent reviewing authored checks against legitimately
accessible public source content, exercising UI/persistence behavior, or
preserving existing guidance and history for unavailable units.

## Persistence

`iso_assessment_checks` stores up to 30 unique stable criterion IDs on an ISO
assessment and its new history entries. `assessment_checks` stores up to 30 IDs
on the existing audit package/item/current occurrence. Audit criteria resolve via
the item's existing definition ID. Unavailable criteria cannot be newly selected.
Previously saved IDs remain accepted only on that same record/item, so catalog
changes do not erase history. An omitted field retains existing selections.

The normal tenant authorization, assignment, concurrent-save tokens, immutable
audit occurrences, evidence links and Finding workflows remain authoritative.
Checklist selection does not complete audit work or change implementation status.
No data migration or new initialization is required.
