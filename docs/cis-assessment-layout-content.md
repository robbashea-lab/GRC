# CIS assessment content for the approved layout

The content uses the existing CIS Controls v8.1 namespace and canonical licensed descriptions. Cumulative populations remain 56 safeguards for IG1, 130 for IG2 and 153 for IG3. No canonical descriptions, membership, Review plans, client assessments or framework lifecycle rules are changed here.

## Content and history

`cisAssessmentCriteria.json` now has 483 current source-based checklist assertions covering all 153 safeguards. The audit read every canonical paragraph and all 361 baseline assertions. It replaces generic evidence-inspection, reconciliation, exception-resolution and invented-schedule tasks with actual safeguard obligations. Independent obligations are separated where a combined selection could mask partial implementation. A focused follow-up separates individual inventory/account/log attributes, named policy/process requirements and independently satisfiable mandatory scopes. Alternatives, examples and conditional qualifiers remain intact. Optional tools, implementation examples, CAS metrics and evaluator methods do not become additional checklist obligations.

All 361 baseline IDs remain accepted content identities. Materially changed, unsupported or split assertions move into `legacy_criteria` with their original ID and exact original text; 286 historical assertions are retained there. Fresh assertions use previously unused `-cN` IDs. Equivalent wording corrections retain identity. Historical selections must remain stored and displayed separately; an old selection does not automatically confirm a replacement assertion. Current checklist counts exclude these historical entries, and neither group changes assessment conclusions or ticket state. Every current-plus-historical per-assessment union fits the existing 20-selection bound; the largest union has exactly 20 items.

`cisAssessmentPresentation.json` contains one entry per safeguard, with a verified official safeguard link and either concise explicit timing/trigger/duration text or `null`. Its 76 non-null entries distinguish operation, review, inactivity, retention and events. For example, 8.10 describes 90-day retention rather than review frequency; 15.5 retains the source's annual-or-contract wording; 16.13 has no invented annual application-test interval. Organizational Review defaults are not used.

The existing requirement-guide `plain` answer, assessment-guidance `review` and `outcome`, canonical official description and these two catalogs are reusable in the coordinator's common drawer. This content work creates no separate CIS UI.

## Source verification and exact limits

`cis-assessment-layout-source-audit.json` records the baseline, all 361 historical assertions, every current item-to-safeguard mapping, immutable canonical-description hashes, 18 fetched official-page hashes and all 153 verified deep-link anchors. All 153 official safeguard paragraphs were fetched on 2026-10-05 from the official CIS CAS v8.1 site. After punctuation/whitespace normalization, 132 match canonical descriptions exactly; the 21 differences are individually recorded. Most change articles, conjunctions or examples.

Three distinctions require explicit treatment:

- **11.1:** Live CAS adds “includes detailed backup procedures.” Canonical descriptions and the prior exact comparison with the user-supplied licensed v8.1 workbook omit that phrase. PR33 expressly preserved recovery scope, prioritization and backup-data security without imposing detailed backup procedures. This task preserves that supported canonical scope.
- **12.2:** Live CAS presents documentation, policy and design as possible examples; canonical wording says examples do not solely include documentation. Checklist obligations require actual secure architecture, segmentation, least privilege and availability, without mandating a particular document or process format.
- **17.5:** Live CAS includes “relevant third parties” in the named role population; canonical licensed descriptions omit the phrase. This task preserves the canonical role population and records the difference rather than changing official wording silently.

The source links are genuine official safeguard headings; claiming that every linked paragraph is byte-for-byte identical to the embedded canonical text would be incorrect. The licensed workbook was not re-opened during this content task; its prior exact comparison is documented in `cis-pr33-final-corrections.md`. These CAS/workbook discrepancies need independent source review before literal source-identity assurance. Existing license confirmation is reused; no agreement was independently inspected.

## Verification

Focused command from `frontend`:

```powershell
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --runTestsByPath src/lib/cisAssessmentCriteria.test.js src/lib/cisAssessmentPresentation.test.js src/lib/cisAssessmentGuidance.test.js src/lib/cisIG3Content.test.js src/lib/cisCoverageRegression.test.js
```

Result: five suites, 94 tests passed against the final catalogs. The focused suites verify all identifier populations and source-link structures, all historical identities and exact archived text, the union of current and historical items against the actual 20-selection bound, independent inventory attributes, key source qualifications and obligation splits, and distinctions between source timing and organization defaults.

Focused backend command with the existing project Python runtime and `PYTHONPATH=backend;backend/tests`: `python -m pytest backend/tests/test_cis_ig3_content.py backend/tests/test_cis_ig2.py -q`. Result: 13 passed; existing FastAPI lifecycle deprecation warnings remain.

Automated content assertions supplement the paragraph-by-paragraph audit; they do not independently establish framework conformity. Complete integration, builds and browser verification are coordinator-owned and reported separately.
