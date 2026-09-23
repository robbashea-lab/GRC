# Substantive framework validation — phase report

Started: 2026-09-22. Baseline: `304779a578a802609f11c62934303f76da0a0256`.
Branch: `codex/framework-substantive-validation`.

## Status

**CIS, NIST and HIPAA content passes and automated phase gates completed; ISO and SOC 2 in progress. CIS product-use authorization confirmed by the user on 2026-09-22.** The former licensing blocker is resolved for the existing Omnisciente commercial product/use case. Qualified scope limitations remain in the phase ledgers. Earlier engineering tests are not evidence of substantive correctness.

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
