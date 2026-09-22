# Framework assessment experience refinement

Scope: presentation and original operator guidance on the approved light UI. The unapproved visual candidate is excluded in a separate worktree. No catalog, schema, authorization, lifecycle, mapping or recurrence changes are intended.

## Phase 1 — CIS IG1

Reviewed all 56 current safeguard explanations and all 15 included control-group guidance entries. Added safeguard-specific evidence examples to replace repeated group-level examples while retaining the original catalog. These are optional examples, not prescribed artifacts or a substantive validation of CIS requirements.

| Before | After | Reason |
| --- | --- | --- |
| Source and explanation had limited visual separation | Restrained source-reference block with explicit original-guidance attribution | Distinguish reference from explanatory writing |
| Saved status was not visible across drawer tabs | Persistent saved conclusion beside existing previous/next navigation | Keep assessment context without confusing unsaved form changes with saved state |
| CIS evidence examples repeated by control group | 56 distinct safeguard-specific examples | Help practitioners select relevant evidence |
| Missing historical user resolved to Unassigned | Former / unavailable user, with Not recorded for absent attribution | Preserve the distinction between missing actor lookup and unassigned work |

Verification: 24 focused tests in three suites passed; targeted ESLint and diff whitespace checks passed; production build passed with the existing PlatformAdmin hook warning. The first browser run found an ambiguous new accessible label; it was corrected and the rebuilt version passed. Browser coverage: CIS assessment/save/history, evidence download/unlink/relink, Finding/Action remediation and explicit validation, previous/next, draft guard, deep links/refresh/back, search retention and keyboard tabs. The runner also verified unchanged shared Reviews, 18 routes, four viewport widths, wrong-client deep-link exclusion and no console errors in an isolated Demo session.

Build verified: main.fd36a243.js; approved CSS main.9c179479.css. No published preview or persistent backend verification is claimed.

## Phase 2 — NIST CSF 2.0

Reviewed all 106 plain-language outcomes and the implementation guidance for all 22 categories across six Functions. Existing outcome-specific explanations and category-context evidence are retained. Added default assessment context distinguishing current achievement from Target Profile decisions, with no prescribed technology, maturity score or automatic gap/status transition.

Added a rendering contract covering every item across all five current catalogs (422 items), source links, attribution, explanation, evidence disclosure and recurrence context without catalog mutation. NIST-specific test verifies the Current/Target distinction.

Verification: 30 frontend tests in four focused suites passed. Six isolated FastAPI CSF tests passed, including unauthorized and cross-client assessment/link access, profile validation, history preservation and no automatic status changes. Production build main.0825bf58.js passed with the existing warning. An early browser invocation hit the build-in-progress page and was rerun after compilation; the completed-build NIST browser flow passed, including Target Profile/gap save and reopen, shared workflow checks, 18 routes, four widths and wrong-client deep-link exclusion. This is Demo browser plus isolated API verification, not live persistent-backend verification.

## Phase 3 — HIPAA

Reviewed all 76 existing explanations and all eight guidance groups, spanning administrative, physical, technical, organizational, documentation and supporting units. Added 76 item-specific original evidence examples rather than repeating broad section-level examples. Sensitive workforce, incident and patient information is minimized; examples expressly avoid actual passwords and decryption keys. Regulatory wording, required/addressable labels, decision constraints and supporting-unit scope remain unchanged. No new legal requirement, prescribed artifact or legal interpretation is introduced.

Verification: 31 frontend tests in four suites, eight isolated HipaaTests, targeted ESLint and production build passed. Browser HIPAA gate passed, including missing addressability decision rejection, saved decision/rationale and historical visibility, evidence reuse, Finding/Action workflow, navigation and shared route/width/isolation checks. No console errors. Build main.e232bd49.js retains the approved CSS and existing unrelated hook warning.

## Phase 4 — ISO/IEC 27001:2022

Reviewed the existing 30 clause summaries/evidence examples, 93 Annex A explanations/evidence pairs and all 11 implementation groups (clauses 4–10 and Annex A families 5–8). Replaced presentation of instruction-like clause prompts with 30 original plain-language explanations; original catalog text is untouched. Added concise context distinguishing an ISMS requirement from an Annex A risk-treatment selection. Existing item-specific Annex evidence, SoA decisions, risk treatment, internal audit, management review and corrective action remain distinct.

Verification: 32 frontend tests in four suites, six isolated IsoTests, targeted lint, whitespace check and production build passed. Browser gate passed for the clause flow and Annex A: missing-justification rejection, exclusion/N/A persistence, history, deep-link reload and specialized ISO views. Shared remediation/evidence/navigation checks and route/width/client-isolation smoke checks passed without console errors. Build main.c3341483.js. No licensed source wording or new cadence was introduced; this is not substantive ISO validation.

## Phase 5 — SOC 2

Reviewed all 61 original criterion explanations/evidence pairs and all 13 implementation guidance groups, including optional categories. Retained the item-specific content. Clarified why a policy or point-in-time screenshot can support design without demonstrating operation over the observation period, and where to record coverage limits. The existing Management Controls, design/operating observations, period and population/sample notes remain authoritative. No auditor sample size, required period or audit opinion is inferred.

Verification: 37 frontend tests in five focused suites, seven isolated SocTests, targeted lint and production build passed. Browser SOC gate passed including control design/operating gap, observation period and missing-instance persistence, category selection/removal with retained history, shared assessment/remediation/evidence flow and route/width/isolation checks. No console errors. Build main.801836b6.js, approved CSS unchanged.

## Shared standard and final review

The existing shared FrameworkContext, FrameworkDrawer and operatorGuidance layer are extended, not replaced. Default content stays focused on identity/source, meaning, assessment and primary notes; implementation/evidence, governance/recurrence and ownership remain progressive disclosures. Saved conclusion stays visible across tabs without reflecting an unsaved selection. Secondary legacy notes and assessment history are retained separately. No new dependencies, persistence fields, generic content engine or framework-local operational copies were added.

The final visual pass removed a duplicated attribution sentence. Screenshots of all five default assessment views were inspected: reference, meaning and notes remain distinct, status is readable, and the approved light workspace/charcoal sidebar is preserved. Better UI and Emil Design Engineering informed the restrained hierarchy/disclosure review; Ponytail kept changes in existing shared components. No new animation or application-wide style was introduced.

| Severity | Location | Refinement | Verification |
| --- | --- | --- | --- |
| Medium | FrameworkDrawer | Persisted conclusion visible while navigating tabs; drafts remain distinct | Component tests and browser workflows |
| Medium | CIS/HIPAA guidance | Specific evidence examples instead of broad repeated lists | All 132 entries inspected and automated coverage checked |
| Low | FrameworkContext | Neutral source-reference hierarchy and explicit framework-native context | Five default-view screenshots inspected |
| Low | FrameworkDrawer history | Unknown historical user no longer labelled Unassigned | Component regression test |

Existing keyboard behavior was checked against the [WAI-ARIA APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Verification emphasizes observable DOM/browser behavior, consistent with [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/). No claim of whole-application WCAG conformance or independent accessibility audit is made.

## Final verification — executed on 2026-09-22

- **Frontend:** `craco test --watch=false --runInBand` — **389 tests / 71 suites passed**. Includes the new nine-test all-item/context suite, saved-versus-draft conclusion, historical attribution and read-only role tests, plus existing framework, Evidence, Finding, Action, onboarding, assignment and presentation regression suites.
- **Structural coverage:** all **422** current catalog items render source, explanation, progressive guidance and recurrence context without mutation: CIS 56, NIST 106, HIPAA 76, ISO 123, SOC 61. Existing utility tests also check all-item content presence and assessment-coverage fixtures at empty, partial, mostly and fully assessed levels. Structural coverage is not a claim that every record was manually assessed in the browser.
- **Backend:** **33 isolated FastAPI tests passed** across FrameworkTests (5), FrameworkProgramTests (1), CsfTests (6), HipaaTests (8), IsoTests (6), SocTests (7). These cover actual route authorization, cross-client denial, read-only constraints, native validation, immutable history, shared work and independent assessment/remediation. Tests use in-memory isolated Mongo substitutes, not a persistent staging database.
- **Per-phase browser:** each of five gates passed against its completed production build before its phase commit.
- **Final combined browser:** `framework-operator.cjs` passed all five workflows in one fresh Demo client, including primary notes/status, saved history, evidence upload/download/unlink/relink, Finding/Action creation, Action completion, separate Finding validation, manual reassessment, previous/next, dirty-state guard, deep links/refresh/back/forward, keyboard tabs and retained search.
- **Shared-record regression:** one existing Finding, Action and Evidence was linked through all five framework UIs with unchanged total counts. The 23 shared Reviews were unchanged. Framework-specific records remained distinct.
- **Visual/read-only browser:** `framework-operator-visual.cjs` passed empty search/clear, empty Evidence/History, hover/active tabs, drawer widths 1440/1280/1024/768, 10%-speed entry capture and reduced motion. All five read-only assessment/Related/Evidence views prevented mutation controls. These synthetic browser roles exercise Demo presentation; trusted authorization is separately API-tested.
- **Activation regression:** Applies/Unsure/Does Not Apply changes retained assessments and Reviews; no automatic cancellation or loss of history. Demo logout returned to blank login without creating a standard token.
- **Smoke:** Dashboard, Calendar, Reviews, Findings, Action Items, Risks, Policies, Vendors, AI Governance, Contacts, Evidence, Onboarding, Client Settings and all five framework routes loaded. Wrong-client assessment deep link was excluded. Both final browser runners reported no page/console errors.
- **Build:** final production preview build passed. Existing unrelated `PlatformAdmin.jsx:52` hook dependency warning remains. JavaScript `main.617fb5f7.js`; approved CSS `main.9c179479.css`. HTTP-served JavaScript exactly matched the build on disk: SHA-256 `6b60772661350aa310853bbf8a91128c63a24da40b7d1cebb0cc466dc96c4afe`.
- **Static review:** targeted ESLint, browser-script syntax and `git diff --check` passed. This JavaScript project has no configured TypeScript check. Final diff and added-line secret-pattern/file checks found no credentials, private keys, database connection secrets, environment files, dependencies, generated builds or unrelated source changes. This is a scoped review, not a full secret-scanner audit of Git history.

No full 36-month operating-model replay or unrelated platform-wide audit was rerun. The previous operating-model report remains the baseline; verification here targets the changed presentation and connected framework workflows.

## Semantics preserved and deliberate limitations

- CIS safeguard types, NIST Current/Target outcomes, HIPAA required/addressable decisions, ISO ISMS versus Annex A/SoA, and SOC management-control/readiness semantics remain distinct.
- Existing persisted status keys are unchanged. Absent implementation and insufficient validation remain the existing combined state, clarified by notes. No new lifecycle or automatic assessment change is introduced.
- The same source URLs, IDs, titles, mappings, regulatory wording, scope rules, review plans and cadence metadata are retained. Suggested setup cadence remains separate from actual Review scheduling. No new cadence discrepancy was established by this presentation review; substantive cadence/source validation is deferred.
- Substantive framework correctness, regulatory currency, licensed-text rights and professional validation of explanatory content remain deferred to a dedicated content-validation phase. Current source references are preserved, not independently certified current. The HIPAA supporting units are not a full Privacy Rule assessment. ISO/SOC summaries are original explanations, not licensed full standard text.
- The full source text for CIS/ISO/SOC is not reproduced. Users retain the authoritative reference link and original explanation. No compliance percentage, certification, attestation opinion or maturity score is added.
- No interview script, evidence checklist mandate, new assessment state, autosave, permanent saved view, new module or automatic issue merging was added. Field-model and broad navigation redesigns remain out of scope.
- Existing limitation: ISO/CSF view selectors use their existing refresh defaults. Draft protection covers drawer navigation/close and native unload, not every SPA browser-history path. Save before leaving through browser history; no routing rewrite was attempted.
- No backend, schema or database migration changes. No production or non-demo persistent data was reset, seeded or modified. Authentication, RBAC, memberships, approval authority and workflow logic are untouched.
- Browser verification used isolated session Demo data. Frontend-to-persistent-backend authentication, production persistence, physical devices, screen readers and independent practitioner/client usability studies are **not verified** by this work.

## Commits and preview

All phases are committed on the isolated local branch `codex/framework-assessment-refinement`, based on `facb2b15d26dabb0d7386f4eb3e139a4c4b49984`. The original worktree's unapproved visual candidate is untouched. No history rewrite, main-branch merge, GitHub push or publication was performed by this task.

| Phase | Commit |
| --- | --- |
| CIS | `5c29fe6fc8d65d458a6f0c11307db6a664f967bd` |
| NIST | `e38634d4915d683a98f3815810323890af10f839` |
| HIPAA | `c40ca21df0532cccc7f52dd7ef172fb5dfedbb17` |
| ISO | `96bb194f1808725cd74f54115242028c0c8f1827` |
| SOC 2 | `91a3f49a76621985fe6a1145178495295571e993` |

Final integration commit is reported in the handoff rather than inserting a self-referential hash. Local tested preview: `http://127.0.0.1:4182/login` (this computer only). The published private site was not updated; there is no new published version to report.

## Files changed

- `frontend/src/components/FrameworkContext.jsx` — shared source hierarchy, native semantics and evidence interpretation.
- `frontend/src/components/FrameworkDrawer.jsx` — persisted conclusion and historical-actor fallback.
- `frontend/src/lib/frameworkOperator.js` — reuse item-specific guidance keyed by existing IDs.
- `frontend/src/lib/operatorGuidance/cis.json` — 56 evidence entries.
- `frontend/src/lib/operatorGuidance/hipaa.json` — 76 evidence entries.
- `frontend/src/lib/operatorGuidance/iso.json` — 30 plain-language clause explanations.
- `frontend/src/components/FrameworkContext.test.jsx` — all-item rendering and framework distinctions.
- `frontend/src/components/FrameworkOperator.test.jsx` — saved/draft status, attribution and read-only regression.
- `frontend/src/lib/frameworkOperator.test.js` — guidance coverage and ISO explanatory-text checks.
- `frontend/scripts/qa/framework-operator-visual.cjs` — explicit local preview target, screenshots and read-only coverage.
- `docs/framework-assessment-refinement.md` — phase and final evidence report.
