# Substantive framework validation — phase report

Started: 2026-09-22. Baseline: `304779a578a802609f11c62934303f76da0a0256`.
Branch: `codex/framework-substantive-validation`.

## Status

For the latest closure results, see **Closure integration — 2026-09-22** below; the earlier phase narrative is retained as an audit trail.

**All five phases processed; CIS, NIST and HIPAA source-comparison passes completed with the scoped caveats below. ISO and SOC 2 full substantive validation remains incomplete because exact authorized sources were unavailable. Final engineering regression and local Demo content checks passed.** CIS commercial product-use authorization is resolved. Passing tests do not establish normative completeness, client compliance or independent assurance.

The repository represents CIS v8.1 IG1. CIS's official IG1 page confirms a 56-safeguard scope for v8/v8.1. This confirms the aggregate count only, not the stored membership, titles, explanations, cadence, policy/review mappings or cross-framework relationships. The official Navigator and assessment specification provide public research material, but public access does not establish commercial product-use permission.

## Resolved licensing checkpoint — CIS-LICENSE-001

**Resolution (2026-09-22):** the user explicitly confirmed applicable CIS authorization for commercial content use within Omnisciente and directed continuation. No agreement, credentials, keys or confidential terms were requested or obtained. Preserve minimal necessary reproduction and flag specific uses outside that scope. The following records the earlier checkpoint, not a continuing blocker.

- **Finding:** the official assessment-specification terms identify a non-commercial/no-derivatives public license and state that commercial CIS Controls use requires prior CIS approval. The official commercial-use page describes separate commercial licensing options.
- **Repository evidence:** the inspected documentation describes identifiers, titles, authored guidance and source/cadence metadata. No product-use license grant was located in the inspected repository documentation. Absence here is not proof that the organization lacks an agreement elsewhere.
- **Unresolved question:** whether Omnisciente has authorization covering its intended embedding, display and distribution of CIS-derived catalog/mapping material, including permitted adaptations. An internal-use membership cannot be assumed to cover that scope.
- **Classification:** REQUIRES AUTHORIZED SOURCE / PRODUCT-USE PERMISSION CLARIFICATION. This is not a legal finding of infringement, nor a claim that reading public material is prohibited.
- **Decision:** preserve existing content and stop before importing or correcting CIS-derived product content under the user's explicit licensing-uncertainty stop condition. Do not treat CIS as passed or advance to the next phase.
- **Needed to resume:** confirmation of applicable product-use authorization and its relevant scope, or an authorized/legal determination of permitted use for this implementation. Do not provide passwords, membership keys or other credentials. If no permission is available, a research-only/non-distributed audit is a separate scope decision for the user.

## Source research ledger — preliminary

All sources below were accessed on **2026-09-22**. No publication/effective date was visible on the inspected pages unless noted. URLs are official; full copyrighted text has not been copied into this checkpoint.

| ID | Organization / title | URL | Version / relevant section | Type / access | Supported conclusion and limits |
| --- | --- | --- | --- | --- | --- |
| CIS-S01 | Center for Internet Security — CIS Critical Security Controls Implementation Group 1 | https://www.cisecurity.org/controls/implementation-groups/ig1 | v8 and v8.1; IG1 scope | Official public framework summary | IG1 has 56 safeguards; count alone does not validate repository entries. |
| CIS-S02 | Center for Internet Security — CIS Controls Navigator v8.1 | https://www.cisecurity.org/controls/cis-controls-navigator | v8.1 selected; safeguard inventory | Official public interactive catalog; authorized product use confirmed separately | Used for 56-item identity, scope and cadence comparison; concise conclusions in the CIS ledger. |
| CIS-S03 | Center for Internet Security — Terms of Use, CIS Controls Assessment Specification | https://cas.docs.cisecurity.org/en/latest/source/terms-of-use/ | Assessment Specification for Controls v8.1; public license and commercial use | Official public license statement; page revision date unavailable | Public licensing has non-commercial/no-derivatives restrictions; commercial use needs prior approval. Does not establish Omnisciente's agreement status. |
| CIS-S04 | Center for Internet Security — Commercial Use & CIS Supporters | https://www.cisecurity.org/cis-controls-supporters | Commercial use; vendor/consulting/hosting categories | Official public licensing information; not an individual license grant | Commercial options exist; eligibility or membership must not be inferred to grant this product's required rights. |
| CIS-S05 | Center for Internet Security — Download CIS Critical Security Controls v8.1 | https://learn.cisecurity.org/cis-controls-download | v8.1 download page | Official public landing page; download registration not submitted | Confirms the v8.1 publication is offered by CIS. No identity submitted or gated download agreement accepted. |

## Validation coverage and change control

### Controlled corrections (C01/C02 recorded before implementation)

| Change | Item / field | Existing wording | Proposed correction | Basis / reason |
| --- | --- | --- | --- | --- |
| CIS-C01 | 1.1 guidance | Record authorized devices, ownership and network identifiers; reconcile inventory changes. | Inventory all enterprise assets, including regularly connected assets outside enterprise control; record ownership, identifiers and authorization status, and reconcile changes. | CIS-S02 safeguard 1.1; authorization status is an inventory attribute, not a reason to exclude unauthorized assets. |
| CIS-C02 | 6.2 guidance | Remove access promptly while preserving needed audit history. | Revoke access immediately on termination, rights revocation or role change; retain disabled accounts when needed to preserve audit history. | CIS-S02 safeguard 6.2; restore the explicit event timing rather than weaken it to promptly. |

Both corrections are implemented. Neither changes IDs, framework version, assessment records, stored history, recurrence or permissions. Catalog explanations are live reference content; existing assessment history stores assessment fields, not historical copies of catalog explanations. Git and this register retain the previous wording. CIS-C03 adds cadence provenance to the 12 existing plans; see the phase ledger for old/new fields and rationale.

The [CIS item ledger](cis-substantive-validation.md) records all 56 item comparisons: 54 VERIFIED as concise authored guidance and 2 CORRECTED. It includes the 12-plan cadence matrix, ten policy mappings, three PARTIAL cross-framework mappings and limitations. Full standard text is not imported. No missing/duplicate or non-IG1 item was identified. These conclusions concern catalog content, not client conformity.

Sources include the v8.1 Navigator and the catalog's linked CIS Controls Assessment Specification control pages (1–12, 14, 15, 17). All accessed 2026-09-22; publisher CIS; official public framework/assessment material; page publication dates unavailable. The individual ledger links identify the precise safeguard sections. `latest` URLs are mutable; no silent framework-version migration was made. NIST CSWP 29 Appendix A was consulted only for the three existing CIS cross-framework relationships at this stage.

Ponytail kept changes in existing catalog metadata and tests rather than introducing a validation service. No operational or usability redesign was repeated. Existing assessments, recurrence, history, permissions and the separate unapproved visual candidate remain untouched.

### Phase 1 QA evidence

- Backend: `test_framework_governance.FrameworkTests` — 7 passed. Includes identifier/mapping integrity, content regression, cadence-source provenance, isolated real FastAPI routes, assessment persistence/history, Evidence, Finding/Action, Review reuse/occurrences, read-only and cross-client denial. Database boundary is an isolated Mongo mock, not a persistent staging database.
- Frontend: five targeted suites (`preview/frameworks`, `frameworkMappings`, `frameworkOperator`, `FrameworkContext`, `FrameworkOperator`): 38 passed. Includes Demo persistence/relationships, cadence warning and presentation.
- Production preview build: passed; JS `main.77a7d42d.js`, unchanged approved CSS `main.9c179479.css`. Existing `PlatformAdmin.jsx:52` hook dependency warning remains outside scope.
- No live-browser, persistent-backend or independently reviewed assurance is claimed for this content phase. No push or publication performed.
- Targeted ESLint on shared framework consumers: passed. `git diff --check`: passed. Final application diff contains only two explanations and additive provenance; tests/documentation contain no credentials or environment values.

## Phase 2 — NIST CSF 2.0

CIS commit: `f9a373862a07913805c080bd1fbd56e0887341b9`. The staged CIS check identified an extra trailing report blank line; cleaned up in Phase 2, with no application impact. [NIST ledger](nist-substantive-validation.md): all 106 items, nine recommendation-only Review defaults and 17 supporting policy mappings inspected; six operator explanations corrected, with the RC.RP-04 title and derived catalog prompts aligned. Explicit D cadence metadata added, without a source minimum or changed schedules.

Phase 2 gate: 6 backend tests, 36 frontend tests (5 suites), targeted ESLint and production build passed; existing PlatformAdmin warning retained. Build `main.655fa0ed.js`, unchanged CSS. API tests use isolated Mongo mocks. No live-browser/staging-backend, push or publication claims. HIPAA research has begun; ISO/SOC and final cross-framework gate remain pending.

## Phase 3 — HIPAA

NIST commit: `f0c4cfc8c99dded5719f06d2ef0ea548bfe9486e`. [HIPAA ledger](hipaa-substantive-validation.md): all 76 current units inspected against current eCFR; 74 VERIFIED as bounded summaries, two CORRECTED. The corrections restore the exact-copy/addressability context for equipment movement and periodic documentation review. Eight existing numerical Review defaults are explicitly D recommendations; no legal minimum or stored schedule changed. The vendor mapping to group-plan duties remains a qualified RELATED association requiring client-scope SME review, not proof of those duties being discharged.

Phase 3 gate: 8 backend tests, 38 frontend tests (5 suites), targeted ESLint and production build passed. Build `main.af9a5b57.js`, unchanged CSS and existing PlatformAdmin warning. Isolated API persistence/history, Evidence/Finding/Action/Review, read-only and tenant tests passed; not a live persistent-backend/browser test. IDs, catalog version, source regulatory text and client records are unchanged. No push or publication.

## Phase 4 — ISO/IEC 27001

HIPAA commit: `ab9ca9f37542526f73d6cd4b708cdb125b9f9f19`. [ISO ledger](iso-substantive-validation.md) inventories all 123 entries. Version and climate-amendment portions are verified from official public sources; exact normative completeness remains REQUIRES AUTHORIZED SOURCE for all 123. This is a bounded inspection with a documented source limitation, not a substantive phase pass. No ISO normative content is newly imported. Ten numerical Review defaults receive explicit D provenance and a regression test; all existing authored guidance and schedules are preserved.

Phase 4 engineering gate: 6 backend tests, 38 frontend tests (5 suites), targeted ESLint and production build passed (`main.c36378b5.js`; unchanged CSS and existing PlatformAdmin warning). JSON indentation subsequently aligned without semantic changes. Isolated API/history/relationship/authorization tests are not live-browser or persistent-staging verification. Continue SOC 2 and final regression without treating the ISO source limitation as resolved.

## Phase 5 — SOC 2

ISO commit: `0c7f85da4c470c4d29ad4c543e9c54dbd226c934`. [SOC ledger](soc-substantive-validation.md) covers inspection of all 61 current entries, eight Review plans and 14 policy mappings. AICPA confirms the represented resource identity but requires account access for the criteria document; the original official PDF URL redirects to that gate. Exact criterion/points-of-focus completeness remains REQUIRES AUTHORIZED SOURCE for all 61. No third-party mirror or gate bypass used, no copyrighted criterion text imported, and no unsupported content correction made.

Eight existing recommended numerical Review defaults receive explicit D metadata. Phase 5 engineering gate: 7 backend tests, 38 frontend tests (5 suites), targeted ESLint and production build passed (`main.0bcd42e3.js`; unchanged CSS and existing PlatformAdmin warning). This is not a substantive source-validation pass or live persistent-backend verification. Final cross-framework regression follows.

## Final review correction — F01 (recorded before implementation)

The six existing mappings targeting ISO/SOC show the same generic provenance basis as source-verified CIS/HIPAA relationships. Previous basis: `Comparison of the cited source and target references; not an official crosswalk, exact equivalence or automatic assessment rule.` Replace only those six displayed basis strings with `Authored topic association; exact target-source validation requires an authorized source. This is not an official crosswalk, exact equivalence or automatic assessment rule.` Rationale: I01/S01 access limits above must be visible where users inspect mapping provenance, not hidden solely in this report. Preserve endpoints, PARTIAL relationship, notes, assessment independence and history. No mapping or authorization is broadened.

## Consolidated result

| Framework | Current items inspected | Unchanged bounded interpretation verified | Corrected items | Exact-source validation incomplete | Phase commit |
| --- | --- | --- | --- | --- | --- |
| CIS v8.1 IG1 | 56 | 54 | 2 | 0 | f9a373862a07913805c080bd1fbd56e0887341b9 |
| NIST CSF 2.0 | 106 | 100 | 6 | 0 | f0c4cfc8c99dded5719f06d2ef0ea548bfe9486e |
| HIPAA current represented scope | 76 | 74 | 2 | 0 | ab9ca9f37542526f73d6cd4b708cdb125b9f9f19 |
| ISO/IEC 27001:2022 + Amd 1:2024 | 123 | 0 | 0 | 123 | 0c7f85da4c470c4d29ad4c543e9c54dbd226c934 |
| SOC 2 / 2017 TSC, revised 2022 points of focus | 61 | 0 | 0 | 61 | 15c055bfaac391b9602900f36a45ae034acd93d8 |
| Total | 422 | 228 | 10 | 184 | Final provenance/report commit follows these five |

Verified means appropriate concise interpretation and supporting examples against cited sources, not an exhaustive substitute for those sources. Counts do not count a correction twice. ISO's version/climate subset and SOC's version/readiness boundary have narrower public-source confirmation, but this does not move their whole items into VERIFIED. HIPAA has one separately flagged group-plan/vendor association requiring client-specific SME review.

### Cadence and mapping results

- All 47 existing Review plans now carry explicit cadence metadata: 11 A source-interval drivers (CIS), 36 D numerical product recommendations. Each A driver has its mapped safeguard, interval and source URL. D does not claim a source minimum.
- Operational timing, event-triggered work, state requirements, source periodicity and management-defined frequency remain distinct from governance Review recurrence. CIS weekly backup/unauthorized-asset handling, monthly patching, inactivity settings and immediate revocation are not delayed to a governance Review.
- HIPAA periodic duties, six-year document retention and event-driven notification deadlines do not become annual/quarterly legal mandates. No proposed rule was imported.
- 71 policy mapping rows inspected; support relationships do not mandate a separately named document. Six CIS/HIPAA cross-framework relationships have both source endpoints compared; six ISO/SOC relationships remain source-qualified. All 12 are PARTIAL; no equivalence or automatic assessment transfer.
- No numerical cadence default, source minimum, requirement ID, catalog version identity, policy mapping, cross-framework endpoint or operational schedule changed.

### Final QA actually executed

1. Backend: 35 tests passed in the six framework suites (`FrameworkTests`, `CsfTests`, `HipaaTests`, `IsoTests`, `SocTests`, `FrameworkProgramTests`). Real FastAPI routes with isolated Mongo mocks; includes configuration/reconfiguration, stable IDs, assessment history, Evidence reuse, Finding/Action independence, recurring Review history, read-only denial and cross-client denial. Not a persistent database or full-backend-suite claim.
2. Frontend: `craco test --watch=false --runInBand` — all 71 suites / 394 tests passed after F01. Covers shared framework presentation, Demo persistence and broader existing workflow regressions.
3. Targeted ESLint on framework helpers, changed tests, Context and Drawer passed. One attempted command named nonexistent `FrameworkOperator.jsx`; corrected to actual `FrameworkDrawer.jsx` and rerun successfully. No standalone TypeScript check is configured for this JavaScript project.
4. Production preview build passed after final application changes: `main.ff3513eb.js`, unchanged approved `main.9c179479.css`. The existing `PlatformAdmin.jsx:52` missing-hook-dependency warning and runtime deprecation notice remain; no unrelated fix.
5. Headless Edge browser against the exact final local build at `http://127.0.0.1:4182`: 12 targeted content/drawer/deep-link refresh checks across five frameworks passed, including all ten corrected items. All six qualified ISO/SOC mapping notices were visible in Related tabs. Five canonical Demo clients loaded; a fresh fictional client generated 394 assessments (SOC starts with 33 Common Criteria). Opening guidance did not change its assessments or Reviews. Wrong-client assessment deep link was excluded; no page/console errors. External analytics requests were fulfilled locally in this isolated QA session.
6. Catalog comparison against baseline confirmed stable version strings, requirement IDs, all policy mappings and every operational plan field apart from the new provenance fields. Final diff/whitespace checks passed. Added-line credential-pattern check returned no matches; manual application diff inspection found no added secrets, credentials, environment values, dependencies, migrations or unrelated application changes.

Added seven regression tests: two backend CIS tests, four operator/cadence tests and one qualified-mapping test. Existing assertions were not weakened. Browser smoke helper and production build are outside Git, not committed debugging artifacts. Browser Demo isolation is not server authorization proof; that is separately covered by the isolated API tests.

### Historical data and architecture

The existing shared JSON catalogs, operator guidance and tests were extended; no new service, scheduling engine or schema was introduced. Ponytail guided reuse of these existing structures. Stable version/IDs prevent assessment regeneration. No persistent database was connected, seeded, deleted or migrated. Existing reconciliation uses insert-only initialization for assessment state; tests confirm histories and recurring work survive reconfiguration. Framework deactivation still preserves recurring Reviews until explicitly cancelled.

Assessment histories retain prior assessment-field snapshots, not frozen catalog wording. The old/new explanation register and Git history preserve changed reference text. This is a stated limitation, not a claim that historic UI descriptions are immutable snapshots.

### Remaining limitations and next input

- ISO: obtain an authorized 2022 standard plus Amd 1:2024 for clause/control completeness and cadence qualifications; public metadata and educational notes are insufficient. Existing Annex register alone is not a complete custom organization-specific SoA.
- SOC: obtain authorized access to the 2017 TSC with 2022 revised points of focus. The publisher account gate was respected. No account or confidential license information is requested by this report.
- HIPAA: qualified client-scope review of group-health-plan duties versus business-associate/vendor governance. No legal applicability or certification conclusion is made.
- Full normative validation of the 184 restricted items and six restricted mappings remains NOT VERIFIED. No blanket all-framework substantive pass, independent SME review, persistent-staging authentication test or whole-application security assurance is claimed.
- No push, merge to main or publication performed. All work is on `codex/framework-substantive-validation`; the separate unapproved visual worktree remains untouched. The local preview is not an updated published preview.

## Closure integration — 2026-09-22

Continued from `e46ca3707e5f92a267fde2141efd7ee1201a8757`; no restart of CIS/NIST validation. This section supersedes earlier unresolved-status statements where expressly noted.

| Framework | Current disposition | Closure scope |
| --- | --- | --- |
| CIS v8.1 IG1 | SUBSTANTIVELY VALIDATED WITH DOCUMENTED LIMITATIONS | Prior 56-item pass retained; concise implementation guidance is not the complete source or client assurance. Licensing checkpoint remains resolved. |
| NIST CSF 2.0 | SUBSTANTIVELY VALIDATED WITH DOCUMENTED LIMITATIONS | Prior 106-item pass retained; outcomes do not mandate product Review intervals. |
| HIPAA | SUBSTANTIVELY VALIDATED WITH DOCUMENTED LIMITATIONS | Prior 76-item pass retained; group-plan/vendor catalog flag resolved narrowly. Client legal applicability remains separate. |
| ISO 27001 | PARTIALLY VALIDATED — AUTHORIZED SOURCE ACCESS REQUIRED | Official preview supports topic-level comparison for 12 units in clauses 4–6; 111 other units lack exact text. Full normative completeness remains unverified for all 123. |
| SOC 2 | PARTIALLY VALIDATED — AUTHORIZED SOURCE ACCESS REQUIRED | All 61 entries remain exact-source limited; publisher metadata does not substitute for revised criteria/points of focus. |

### Decisions and corrections

- HIPAA HC01/HC02: two existing reason strings now distinguish PARTIAL business-associate support from RELATED sponsor-agent safeguards under 164.314(b)(2)(iii). All linked IDs and artifact classifications remain unchanged. The [HIPAA ledger](hipaa-substantive-validation.md) records old/new values, OFR/GPO and HHS sources, access date and rationale. No unresolved global catalog SME flag remains; a specific client's legal duties still require qualified judgment.
- ISO: legitimate SIST preview discovered in existing research references, read without importing source text. The [ISO closure addendum](iso-substantive-validation.md) identifies exact available pages and all 12 bounded conclusions. No unsupported catalog correction or completeness upgrade. Additional necessary controls outside the Annex register remain a documented product scope limitation.
- SOC: official revised-2022 resource still account-gated; no authorized local copy found. The [SOC closure addendum](soc-substantive-validation.md) records the source-access gate. No third-party or older edition substituted, no account created and no confidential licensing material requested.
- [Final cadence matrix](framework-cadence-closure.md): all 47 plans, mapped IDs, current default, A–G distinction, numerical drivers and context. Counts: 12 CIS, 9 NIST, 8 HIPAA, 10 ISO, 8 SOC; 11 A and 36 D. No stored or default recurrence changed.
- [Targeted mapping check](framework-mapping-closure.md): all 12 existing cross-framework edges remain PARTIAL; six ISO/SOC targets remain explicitly source-qualified. Eleven requested topics inspected without creating a new crosswalk, claiming equivalence or transferring assessment status.

### Verification and integrity

New regressions: HIPAA API reconfiguration/history/link preservation; HIPAA relationship scope presentation; shared 47-plan cadence source/mapped-definition contract. No existing assertions were weakened.

- Backend: 36 tests passed across the six explicit framework test classes. FastAPI routes with isolated Mongo mocks, not persistent staging. Covers histories, stable IDs, scope, source-record reuse and authorization/tenant denials. Earlier ISO/SOC module run passed 17 tests including imported fixtures; it is not 17 distinct ISO/SOC-only cases.
- Frontend: all 71 suites / 396 tests passed with `craco test --watch=false --runInBand`. Targeted ESLint passed for both changed frontend test files. No standalone TypeScript check is configured.
- Production build passed: `main.bdf7819a.js`, approved CSS unchanged at `main.9c179479.css`. Existing `PlatformAdmin.jsx:52` hook dependency warning and Node `fs.F_OK` deprecation remain, not introduced or suppressed here.
- Exact-build local content browser QA passed: 12 guidance/deep-link refresh checks, six visible restricted-source mapping notices, both new HIPAA relationship descriptions, no assessment/Review changes on inspection, wrong-client link excluded, no console/page errors. Five canonical Demo clients loaded. Browser data is isolated session Demo data, not server authorization proof.
- Full operator browser regression passed all five frameworks: assessment save/history, Evidence upload/download/unlink/relink, Finding/Action completion and validation without automatic assessment changes, ISO SoA justification/history, SOC management controls/period and category retention, HIPAA addressability, CSF Profiles, deep links/refresh/back, keyboard tabs and draft protection. Shared existing Evidence/Finding/Action reuse produced no duplicate records; recurring Reviews remained identical. All 18 module routes and 1440/1280/1024/768 widths passed; wrong-client deep link excluded; no console/page errors. This used a fresh local Demo session with outbound analytics fulfilled locally, not a live persistent backend.
- Two earlier operator runs timed out at the search/open/Escape/reopen sequence (at different frameworks). The script issued Escape without asserting the drawer had mounted. Added visible/closed assertions; the complete rerun passed. No application behavior or acceptance assertion was weakened. `node --check` passed. Additional CRA ESLint over this existing standalone QA script reports its existing line 106 `innerWidth` restricted-global use; presence at baseline `e46ca370` was confirmed. That standalone-script lint check is NOT a pass. Targeted changed component/helper test lint and production build results above remain accurate.
- Structural comparison against `e46ca370` passed for all five complete catalogs after excluding only the two intended HIPAA reason changes. IDs, versions, mappings, actual plan configuration and cadence remain identical. Existing historical assessment values and recurring Reviews survived the API regression; catalog wording is not stored as immutable historic snapshots.
- Diff inspection and added-line secret-pattern check found no introduced secrets, credentials, environment values, dependencies, schema changes, migrations, authentication/RBAC changes or unrelated application modifications. No persistent data was accessed, reseeded or deleted. QA helpers/build output remain outside Git. These checks are not independent security assurance.

### Closure changeset and remaining gates

1. HIPAA closure: `dc0acfa` — two scope clarifications and focused tests.
2. ISO closure: `24d560a` — bounded-source comparison and explicit remaining gate.
3. SOC closure: `0dc98e4` — source-access disposition.
4. Final integration: the commit containing this section, the cadence/mapping matrices and shared test. A report cannot include its own final commit hash; resolve with `git log -1` or the task handoff.

No new migrations or deployment steps. The final integration also corrects a documentation-only SOC plan count from ten to eight; catalog data never changed.

Still required for full substantive closure: authorized full ISO 2022/amendment content and authorized 2017 TSC with revised 2022 points of focus. No blanket five-framework normative pass, certification, persistent-backend browser verification or independent SME assurance is claimed. Proposed HIPAA changes were not imported. No new material ambiguity requiring product decisions was introduced.

Branch remains `codex/framework-substantive-validation`. No push, merge, publication, deployment or infrastructure provisioning performed. The separate visual worktree remains untouched.
