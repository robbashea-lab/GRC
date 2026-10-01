# Framework source and version manifest — 2026-09-26

One place to answer "which version of which framework does Omnisciente carry, from what source, and how far has it been checked". It summarizes the catalogs in `frontend/src/lib/*.json` and the substantive-validation records in `docs/*-substantive-validation.md`. It was compiled from the repository only. Live re-verification during this program was blocked by network policy (`www.ecfr.gov`, `csrc.nist.gov` and `nvlpubs.nist.gov` were refused; AICPA and ISO pages were not reachable). Nothing below claims a fresh comparison against the source.

| Program | Catalog file | Version carried | Entries | Source of record | `verified_on` | Substantive validation status |
| --- | --- | --- | ---: | --- | --- | --- |
| CIS Controls IG1 | `cisIG1.json` | 8.1 | 56 safeguards | CIS Controls v8.1 (cisecurity.org) | 2026-09-15 | Item content verified in `cis-substantive-validation.md` |
| ISO/IEC 27001 | `iso27001.json` | 2022 + Amd 1:2024 | 30 clause units + 93 Annex A | ISO/IEC 27001:2022 (licensed; iso.org) | 2026-09-22 | **Incomplete.** Entries are marked REQUIRES AUTHORIZED SOURCE; normative comparison needs a licensed copy |
| SOC 2 (Trust Services Criteria) | `soc2.json` | 2017 TSC, revised points of focus 2022 | 61 criteria | AICPA/ASEC 2017 TSC (2022 PoF) | 2026-09-22 catalog; 2026-10-01 scoped review | **Partial by scope.** CC1.1–CC9.2, A1.1–A1.3 and C1.1–C1.2 were compared to the AICPA-hosted revised-2022 PDF on 2026-10-01; PI and Privacy remain unreviewed in that pass. See `soc2-content-quality-review.md` |
| HIPAA Security Rule | `hipaaSecurityRule.json` | 45 CFR 164 as of 2026-09-18 | 76 | eCFR, 45 CFR Part 164 Subpart C | 2026-09-22 | Closure recorded in `hipaa-substantive-validation.md`; client-specific use still requires SME review |
| NIST CSF 2.0 | `nistCSF2.json` | 2.0 | 106 subcategories | NIST CSWP 29 | 2026-09-22 | Phase 2 gate complete: 100 items verified, 6 corrected |
| CMMC | `frameworkDefinitions.json` (applicability only) | — | — | — | — | **Placeholder.** Applicability can be recorded, but there is no assessment catalog and no tracking. No Demo client uses it since the scope change |

## How to read this

- **`verified_on` is a research date, not proof of a normative comparison.** This is why the requirement drawer now says "Catalog researched <date>".
- **Titles and guidance are Omnisciente's own shorthand and operator guidance.** No licensed ISO or AICPA wording is embedded.
- **Program progress and readiness are internal measures.** They are never certification, a SOC 2 opinion or a determination of compliance.
- **Cross-framework mappings are Omnisciente's.** They are not official crosswalks, and a relationship never marks another framework compliant (`framework-mapping-closure.md`).

## To close the open items

1. Obtain a licensed ISO/IEC 27001:2022 (+ Amd 1:2024) copy and complete `iso-substantive-validation.md`.
2. Complete the same AICPA-source comparison for SOC 2 Processing Integrity and Privacy if those optional categories enter approved scope.
3. Re-check HIPAA and NIST CSF against the live sources from a network that allows them.
4. Update `verified_on` only for entries that were actually compared.
5. Decide whether CMMC gets an assessment catalog or stays applicability-only.
