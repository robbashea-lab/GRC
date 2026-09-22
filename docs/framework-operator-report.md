# Framework operator experience program

Scope: usability of the existing working datasets. This is not a framework-correctness, legal, licensing or certification audit. No requirement identifiers, lifecycle values, authorization rules, recurrence schedules or source records are migrated.

## Phase 1 — CIS IG1

Established the shared operator pattern using all 56 existing safeguards. Each opens directly to reference, plain-English meaning, assessment state and a single primary Assessment notes narrative. Implementation/evidence guidance is contextual to the CIS control family; source semantics remain safeguard-specific. Expanded governance details distinguish source cadence, recommended setup cadence and the actual linked Review. No Reviews are created by viewing or assessing an item.

The primary narrative uses the existing `implementation` field. Existing `notes` remain editable in a secondary disclosure and readable in History; no migration or silent merging. Existing status values remain unchanged. Display labels explain partial implementation and the existing combined absent/unvalidated state rather than inventing new persistence states.

Finding creation retains source context and prefills editable titles and the saved narrative. The existing API still creates one Finding and one remediation Action. Evidence remains one authoritative Library artifact. Evidence relinking resets the selector so unlink/relink is repeatable. Related records open in nested existing drawers without leaving the assessment.

Navigation uses client-scoped assessment deep links, Previous/Next within current results, retained search when closing and the existing session-scoped table filters. The shared drawer warns before discarding an unsaved assessment, Finding draft or discussion comment. Browser refresh warns through the native before-unload mechanism. Saved record selection derives from the URL and current results, avoiding a competing stale selection cache.

Browser gate: CIS assessment, notes, partial state, upload/download/unlink/relink, Finding and Action, remediation completion, separate Finding validation, manual reassessment, two historical decisions, Previous/Next, draft keep/discard, direct link/refresh/back/forward, keyboard tabs, search retention. Passed. Eighteen module routes and four desktop/tablet widths exercised, shared Reviews unchanged, wrong-client assessment excluded, no console errors.

Accessibility: reused the existing Radix tabs and alert dialog rather than custom keyboard logic; source/reference links and disclosure headings have readable names. Consulted the [WAI-ARIA APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) for arrow-key/focus semantics. This is not a whole-application accessibility conformance claim.

## Phase 2 — NIST CSF 2.0

Replaced repeated title-based prompts in presentation with 106 distinct original explanations and practical guidance for all 22 Categories. The existing source identifiers, titles, Functions and Category structure are unchanged. Guidance is explicitly Omnisciente summary, not quoted NIST text; the authoritative reference remains adjacent. Current Profile uses Assessment notes; Target and gap decisions stay separate and do not automatically create Reviews, Findings or Actions.

Gate: 11 focused automated tests passed; production build and targeted lint passed. Browser operator lifecycle passed for NIST, including Current/Target explanation, saved target, high-priority explicit gap and gap view. Eighteen-route smoke test, four widths, wrong-client exclusion and unchanged shared Reviews passed. No console errors. NIST screenshot reviewed; native outcome terminology retained.

## Phase 3 — HIPAA

Separated the existing regulatory wording from 76 original plain-English explanations. Short regulatory passages appear open; longer passages are expandable without removing the source. Practical implementation and evidence guidance is grouped by the existing regulatory section. Specification labels are visible near the citation. Addressable is explicitly not optional; the existing decision/rationale workflow and server validation are untouched.

Gate: 13 focused automated tests, targeted lint and production build passed. Browser operator lifecycle passed, including an additional addressable specification: absent decision rejected, as-written decision/rationale saved and retained in History. Eighteen routes, four widths, unchanged Reviews and wrong-client exclusion passed with no console errors. HIPAA screenshot reviewed. No recurrence, regulatory dataset or copyright/licensing status change.

## Phase 4 — ISO/IEC 27001:2022

Kept the 30 existing ISMS explanations and added 93 distinct original Annex A explanations with item-specific evidence examples. Shared practical guidance follows the ISMS clause/control family. Specification labels distinguish ISMS requirements from Annex A/SoA. Existing SoA applicability, justification and status constraints remain authoritative. No licensed standard text was added or removed; concise summaries and source references remain explicit.

Gate: 13 focused automated tests and production build passed. Browser operator lifecycle passed for an ISMS requirement; Annex A additionally exercised 93-control view, missing-justification rejection, documented exclusion/N/A, direct-link refresh and historical rationale. Internal Audit, Management Review, Risk Treatment and Corrective Actions views loaded. Eighteen-route regression, four widths, unchanged Reviews and wrong-client exclusion passed without console errors. ISO screenshot reviewed. The isolated backend suite also passed: 199 tests across 32 modules, including framework lifecycle and authorization tests.

## Phase 5 — SOC 2

Added distinct explanations and evidence examples for all 61 existing criteria. Management-designed controls remain separate from the AICPA criterion, with existing design readiness, operating observations, periods and management-entered instance counts preserved. Readiness-specific display labels avoid calling a criterion itself an implemented technical control. No auditor sampling, required period or audit opinion is inferred. No copyrighted full criterion text was added.

Gate: 13 focused automated tests, targeted lint and production build passed. Browser operator lifecycle passed plus management-control design/operating-gap recording, frequency and observation-period persistence, missing-instance count, optional Availability selection/removal and retained criteria. Eighteen routes, four widths, unchanged Reviews and wrong-client exclusion passed without console errors. SOC screenshot reviewed. Separate isolated client-management authorization tests passed (2).

## UI review

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | FrameworkDrawer.jsx | Context and assessment split into separate tabs | Primary assessment screen; secondary guidance disclosures | Less navigation during client discussion |
| Medium | FrameworkWorkspace.jsx | Closing clears search; no assessment deep link | Preserved search and client-scoped URL selection | Retain investigation context |
| Medium | FrameworkDrawer.jsx | Little save feedback; notes absent from history | Unsaved/saved feedback and both historical narratives | Make persistence and attribution understandable |
| Low | FrameworkContext.jsx | Unstructured cadence details | Source, suggestion and actual Review distinguished | Avoid implying every item is scheduled |

Reviewed screenshots for all five frameworks and tested keyboard tabs and the draft dialog. Existing 180 ms overlay / 240 ms drawer motion is retained. A separate browser run slowed entry playback to 10%, captured each framework, and exercised reduced motion, hover/active tabs and 1440/1280/1024/768 px drawer widths. No actionable high-severity polish finding remains in the inspected surfaces. **Approve** for this inspected scope, not for whole-application accessibility conformance. No application-wide visual redesign.

## Shared UX standard and friction

| Task | Before (code-inspected path) | After (browser exercised) |
| --- | --- | --- |
| Reach assessment notes/status from register | Open item, then Implementation tab | Open item; assessment is immediately available |
| Move to adjacent item | Close drawer and locate another row | One Previous/Next action within current results |
| Raise a contextual Finding | Enter both titles and description manually | Editable source-specific titles and saved narrative are prefilled |
| Return from remediation | Existing nested record pattern | Close nested record; original assessment remains in place |
| Reuse Evidence after unlinking | Selected value could remain stale | Selector resets; the same Library item can be linked again |
| Inspect earlier notes | Implementation only shown in history | Primary and previously recorded additional notes are readable |

These are interaction-path observations, not a timed productivity study. Implementation guidance and Evidence examples share one disclosure; recurrence has one separate disclosure. No interview questions or internal assessor scripts are added to the primary page. Discussion remains a separate chronological collaboration channel, not a second required assessment narrative.

Not standardized away: HIPAA addressability, ISO SoA and ISMS scope, NIST outcome/Profile semantics, SOC control-design and operating observations, CIS safeguard activity types. Existing five persisted statuses are retained; absent implementation and insufficient validation remain a combined state requiring narrative clarification. Separating those into database states is deferred rather than changing business logic for a visual goal.

## Final verification

- Full frontend: **371 tests, 69 suites passed**, using the configured CRACO/Jest runner (`test --watch=false --runInBand`). Includes read-only rendering, failed loading/save behavior, history, guidance completeness and empty/partial/mostly/fully assessed aggregate fixtures across all catalogs.
- Backend: **199 tests in 32 isolated modules passed**, plus **2 isolated ClientManagementTests passed**. FastAPI authorization, tenant scope, framework lifecycle, Evidence relationships and non-destructive activation are exercised with isolated test persistence. No backend code was changed by this program.
- Production preview build passed (`node frontend/scripts/preview.cjs build`). Final JavaScript asset: `main.b7f7d214.js`. Existing unrelated `PlatformAdmin.jsx` hook-dependency warning remains; no suppression or dependency upgrade was introduced.
- Targeted ESLint passed on changed JSX/JS components, utilities and unit tests. No configured TypeScript check exists in this JavaScript project. Browser script syntax was checked with Node.
- Five per-phase browser operator gates passed, followed by a **single combined five-framework run** using a fresh fictional Demo client. It starts with 394 assessments and 23 shared Reviews. Optional SOC category testing deliberately initializes and retains three additional criteria.
- For each framework: context/guidance, primary notes, partial assessment, Evidence upload/download/unlink/relink, Finding plus Action, Action completion, separate Finding validation, manual reassessment, historical traceability, Next/Previous, draft guard, deep links/refresh/back/forward, keyboard tabs and search retention passed.
- Framework-specific browser checks passed: NIST Target/gap persistence; HIPAA addressability denial and rationale; ISO SoA exclusion/justification and specialized views; SOC control observations, period, counts and optional/retained criteria.
- Separate visual/empty-state browser run passed for all five. Clear filters, empty Evidence/History, hover/active tabs, reduced motion, 10%-speed entry and four drawer widths were exercised. Screenshots were reviewed locally and excluded from Git.
- All five Applies/Unsure/Does Not Apply toggles retained initialized assessments and Reviews. Eighteen routes smoke-tested: Dashboard, Calendar, Reviews, Findings, Action Items, Risks, Policies, Vendors, AI Governance, Contacts, Evidence, Onboarding, Client Settings and five frameworks. No console/page errors occurred.
- Wrong-client assessment deep link excluded. Backend authorization verified by isolated tests, not merely frontend hiding. Demo logout returned to blank login fields without a standard token.
- Final diff reviewed for source-data changes, dependencies, secrets, accidental environment values and unrelated modifications. None were introduced. Normal Git history is preserved.

The browser gates run through the isolated Demo adapter. **Real frontend-to-persistent-backend authentication is not browser verified** and remains intentionally deferred. Legacy tests configured to call an external development service were not run against an uncertain database. No production or non-demo records were reset, seeded, deleted or overwritten.

## Reproducing browser QA

With the tested production build served locally at `127.0.0.1:4174`, provide Playwright through the verification environment and optionally set `QA_BROWSER` to a local Chromium-family executable and `QA_ARTIFACTS` to a temporary screenshot directory:

```
node frontend/scripts/qa/framework-operator.cjs
node frontend/scripts/qa/framework-operator-visual.cjs
```

The operator runner accepts a framework key to execute a single phase. Both scripts restrict navigation to the local preview and create only fictional data in a fresh Demo browser session. They do not contain credentials or connect to a persistent database.

## Safety, constraints and deferred work

No schema changes or migrations. No changes to authentication, RBAC, client memberships, workflow transitions, Policy approval, risk scoring, framework activation rules, scheduling engine or source catalogs. New guidance is presentation-only and keyed to existing identifiers. Authoritative APIs and linked record drawers are reused; no framework-local copies of operational records exist.

Existing HIPAA regulatory text is retained separately from explanations. CIS, NIST, ISO and SOC summaries are labelled as Omnisciente guidance with source references; no new verbatim licensed ISO/AICPA material is reproduced and no licensing status is invented. Content correctness, legal/regulatory completeness, source currency and professional validation of the new explanations remain for the separate framework-content review. This program issues no compliance, certification or attestation conclusion.

Remaining limitations: this was an engineering/operator simulation, not an independent practitioner or client usability study. Assessment coverage at fully assessed scale is automated-test verified; representative states and lifecycles were browser tested, not manual assessment of every catalog item. No physical-device testing or screen-reader audit. Search is retained while closing/navigating within the workspace; column filters use existing session persistence. ISO/CSF view selectors still reset to their existing defaults on a full refresh. Draft confirmation covers drawer close/Previous/Next and native page unload, not every single-page browser-history navigation. Save explicitly before leaving through browser history. No permanent saved views, new assessment states, autosave or internal working-paper system was introduced.

## Phase commits

GitHub and local/Sites histories have different parent commit IDs from earlier work. For every phase, the complete Git source tree was verified identical before preparing the GitHub commit; neither history was rewritten.

| Phase | GitHub commit | Local / Sites commit |
| --- | --- | --- |
| CIS | `762148fc23fe9526bbbbae5437876f7862b5adaf` | `a383c6507227e60c1d98092f7ede9135e8d1649e` |
| NIST | `c257c9c05bf1d555905066b3c14e4a3583e6eaa7` | `c519677d6d6ab63dd9f1ac99a8cc3e7b781c37d6` |
| HIPAA | `15adf52a7f37f93f50273f38c49dc6ac27ec74be` | `a3e2950f79388b608c4045e441598f2391a36b20` |
| ISO | `adeaf39021637142e8b14f7c00913c492e7a1c37` | `8858dd0299f4e1dfd92b653ab2c2449734a3e133` |
| SOC | `a7172cbb6f79c64be0e1f2fa4f3ce9eb39b9b8e7` | `1aad10e0196dad036d22c7225ae7ff94a8ac4f18` |

Final integration commit and confirmed private publication are reported in the handoff, avoiding a self-referential commit hash here.

## Files changed

- `docs/framework-operator-report.md`
- `frontend/scripts/qa/framework-operator.cjs`
- `frontend/scripts/qa/framework-operator-visual.cjs`
- `frontend/src/components/CsfProfile.jsx`
- `frontend/src/components/FrameworkContext.jsx`
- `frontend/src/components/FrameworkDrawer.jsx`
- `frontend/src/components/FrameworkOperator.test.jsx`
- `frontend/src/lib/frameworkOperator.js`
- `frontend/src/lib/frameworkOperator.test.js`
- `frontend/src/lib/operatorGuidance/cis.json`
- `frontend/src/lib/operatorGuidance/hipaa.json`
- `frontend/src/lib/operatorGuidance/iso.json`
- `frontend/src/lib/operatorGuidance/nist.json`
- `frontend/src/lib/operatorGuidance/soc.json`
- `frontend/src/pages/ComplianceWorkspace.test.jsx`
- `frontend/src/pages/FrameworkWorkspace.jsx`
