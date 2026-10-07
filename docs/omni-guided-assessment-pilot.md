# Omni guided-assessment pilot

## Full CIS v8.1 expansion checkpoint — 2026-10-07

This checkpoint supersedes the Control 1-only implementation scope below, not its historical verification evidence. PR #52 stays draft and unmerged. This expansion is local/branch work only: no main merge, Render deployment, Sites publication or production change is authorized or performed. Previous hosted Control 1 results do not validate the expanded hosted program.

### Coverage and version compatibility

| Control | IG1 cumulative | IG2 cumulative | IG3 cumulative |
| --- | ---: | ---: | ---: |
| 1 | 2 | 4 | 5 |
| 2 | 3 | 6 | 7 |
| 3 | 6 | 12 | 14 |
| 4 | 7 | 11 | 12 |
| 5 | 4 | 6 | 6 |
| 6 | 5 | 7 | 8 |
| 7 | 4 | 7 | 7 |
| 8 | 3 | 11 | 12 |
| 9 | 2 | 6 | 7 |
| 10 | 3 | 7 | 7 |
| 11 | 4 | 5 | 5 |
| 12 | 1 | 7 | 8 |
| 13 | 0 | 6 | 11 |
| 14 | 8 | 9 | 9 |
| 15 | 1 | 4 | 7 |
| 16 | 0 | 11 | 14 |
| 17 | 3 | 8 | 9 |
| 18 | 0 | 3 | 5 |
| **Total Safeguards** | **56** | **130** | **153** |

One definition per canonical Safeguard, not separate copies per group or client. `guidedCisProgram.json` contains 148 additional, safeguard-specific profiles for Controls 2–18. Runtime compiles their reviewed obligation rows into the existing select/matrix/text interview model; it does not generate framework content or call an AI. Matrices contain at most five rows. Actual thresholds, frequencies, alternatives and source conditions remain visible in those rows. Optional team/process/evidence context cannot create additional mandatory tools or artifacts. Conditional exclusions require an explanation before an unqualified recommendation; unconditional rows do not offer exclusion.

Control 1 keeps `cis-v8.1-control1-2` and its original question structures/rules. The new profiles use `cis-v8.1-program-1`; legacy `brawndo-cis-pilot-1` remains readable. Default question-set selection is per Safeguard so expansion does not force a Control 1 draft transition. Existing archival, revision conflict checks, replacement protection, native Save/Save & next and history attribution are reused. No destructive schema migration, seeded answers, dependency or environment-variable change.

The overview uses one authorized workspace query for the current user's draft revision/completion summaries, rather than fetching up to 153 complete interviews. Summaries contain no answers or narrative; both client and user identity are scoped server-side. Opening a Safeguard still loads its normal authoritative draft. Safeguard ordering compares the two numeric identifier components, avoiding decimal misordering of 13.10 and 13.9.

### Source comparison and content traceability

Reviewed inputs: canonical `cisIG1.json` (historical filename, all 153 Safeguards), operator criteria revision `2026-10-05`, and evidence guidance revision `2026-10-04`. `node scripts/build-guided-cis-program.cjs --check` verifies the committed static profiles match those reviewed inputs and explicit source corrections. The script prints content unless `--check` is requested; it never writes application data.

Actual public-source comparison inspected all 18 [official CIS v8.1 CAS Control pages](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) and all 153 identifiers/group mappings on 2026-10-07. CAS assessment metrics/procedures are not new Safeguard obligations. `node scripts/verify-cis-guided-sources.cjs` is a release-time network comparison, not a runtime service; its nonzero result intentionally reports exact wording/title differences for review, not a passing exact-text match.

The comparison found 23 non-identical descriptions/titles: 4.4, 5.5, 6.8, 8.9, 11.1, 12.2, 12.5, 12.6, 13.1, 13.5, 13.7, 13.8, 14.5, 14.7, 15.1, 15.3, 15.7, 16.10, 16.11, 17.5, 17.9, 18.2 and 18.5. Most are articles, examples, grammar or presentation differences; the public CAS 12.5 heading is visibly malformed and 13.8 uses a plural title. Canonical IDs/titles and historical assessments were not overwritten to copy those defects. Two material guide details were added explicitly: [11.1 detailed backup procedures](https://cas.docs.cisecurity.org/en/latest/source/Controls11/#111-establish-and-maintain-a-data-recovery-process) and [17.5 relevant third parties](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#175-assign-key-roles-and-responsibilities). No exact byte-for-byte canonical text equivalence is claimed.

### Executed verification and limits

- Full isolated backend suite: 650 tests and 698 subtests passed before the final additional exhaustive schema test. Latest guided backend suite: seven tests passed, including all 148 expanded answer schemas, 153-definition applicability at all three groups, real FastAPI authentication/authorization routes with an isolated Mongo mock, per-user summary privacy, cross-client/read-only denial and unauthenticated GET/PUT rejection. These are not persistent hosted database tests.
- Focused latest frontend engine/component suite: five suites, 205 tests passed. Every expanded Safeguard exercises fully addressed, partial, missing and unknown paths; additional checks cover source-conditioned exclusions, thresholds, distinct row-level gaps/unknowns, failed-save draft retention, replacement protection and no eager interview fan-out. Broader CIS/onboarding/Demo results are recorded in the final PR comment.
- Demo provisioning tests cover fresh 56/130/153 clients, IG1→IG2→IG3 and direct IG1→IG3, stable assessment identities/history and unchanged native records, clean newly applicable interviews and no copied client answers. The existing scope regressions also cover IG2→IG3 and Review schedule/relationship preservation.
- Actual local browser: Brawndo IG1 (56), Initech IG2 (130) upgraded to IG3 (153); correct interviews opened from all 18 Controls. Mixed partial/unknown 2.1 saved/exited/refreshed/resumed, required replacement approval, Apply and normal Save & next, Previous and refresh. Full 18.5 IG3-only result used a synthetic operator narrative, applied/saved/reopened, and survived Demo sign-out/re-entry. Verification remained unchanged. This is Demo session re-entry, not normal hosted credential authentication.
- Light/dark appearance, 1440/1024/768 viewport screenshots and DOM bounds checks showed no document horizontal overflow; keyboard Tab stayed inside Omni and Escape restored focus to the launcher. No captured browser warnings/errors in these flows. Existing docking component tests passed; physical drag was not repeated for this content expansion.
- Normal authenticated and isolated Demo optimized builds passed; final rebuild results are recorded in the PR comment. Existing Node/toolchain deprecations, FastAPI lifecycle deprecations and large-bundle advisory remain. Versioned static content adds about 24 kB gzip to the main bundle; no new runtime dependency.

Not executed for this expansion: hosted deployment, normal hosted sign-out/sign-in, persistent Mongo restart/recovery tests, hosted restricted-account adversarial testing, screen-reader audit, OS reduced-motion emulation, or every possible answer combination in the browser. Automated coverage of every Safeguard is not a claim of exhaustive manual or independent content assurance. No production-readiness, evidence verification or CIS-compliance conclusion is made. Scope remains CIS v8.1 only.

## Control 1 checkpoint — 2026-10-07

This section supersedes the original two-safeguard checkpoint below. PR #52 remains draft and unmerged. Only existing Render staging is authorized for this release; main, Sites and production are not release targets.

The dashboard cleanup is separately committed as `6030ad0`. CIS no longer shows the unapproved next-work prose or Export program CSV. Other dashboard content and calculations are preserved; the new priority content appears only inside Omni.

### Canonical content and scope

| Safeguard | Requirement elements covered | Implementation groups |
| --- | --- | --- |
| 1.1 | Inventory, asset coverage, required attributes, six-month maintenance | 1, 2, 3 |
| 1.2 | Unauthorized-asset process, weekly response, permitted disposition alternatives | 1, 2, 3 |
| 1.3 | Active discovery, coverage, daily operation | 2, 3 |
| 1.4 | DHCP logging OR IPAM, coverage, weekly inventory updates | 2, 3 |
| 1.5 | Passive discovery, coverage, weekly inventory updates | 3 |

Source: [official CIS v8.1 assessment specification, Control 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/). CAS assessment procedures and optional operational examples are not additional safeguard obligations. Related/prerequisite context does not create a new mandatory tool or automatically satisfy another safeguard.

`shared/catalogs/guidedControl1.json` defines metadata/applicability; the unchanged legacy pack supplies inherited 1.1/1.2 question structures, with explicitly versioned current rules. `guidedControl1Additional.json` supplies independently reviewed 1.3–1.5 questions and requirement-specific rules. Current version: `cis-v8.1-control1-2`. No duplicated question sets per implementation group. No Control 2+, ISO or SOC activation.

The feature gate uses authorized client context, CIS configuration and implementation-group applicability, not Brawndo's identity. Existing/new CIS clients receive applicable definitions on demand and clean state; no answers are seeded or copied. Assessment saves record the question-set version. Native IG upgrades retain inherited records and add newly applicable safeguards.

### History and safety

The original `brawndo-cis-pilot-1` definitions/rules remain available. Completed old drafts retain their saved narrative and answers; the UI offers a new review instead of silently rewriting them. Beginning a current-version review or restarting a completed interview archives the original record idempotently in `guided_assessment_history` before replacing its current draft. Demo implements the same archive behavior. This is an additive collection, not a destructive schema migration.

Confirmed gaps and unknowns are separate. Optional tool/team context does not force a deficient implementation recommendation. Hidden branch answers cannot contribute to the current result. Apply changes only unsaved native assessment fields, with explicit existing-text replacement confirmation. Normal assessment save remains authoritative; verification, Findings, Actions and evidence-review state are not changed by the interview.

### Interaction and verification evidence

Inline SVG/CSS provides eight text-labelled states without external assets or new dependencies. Cosmetic session greetings, contextual dismissal and docking preferences contain no assessment answers. Pointer movement is constrained to three snap zones with keyboard alternatives/reset. Assessment launchers occupy a dedicated row away from form actions; dashboard docking checks visible critical controls on resize. Reduced motion removes nonessential motion. Omni shows at most three deterministic next items plus View all, using existing work metadata; the only shared metadata addition is the earliest linked upcoming Review due date.

Local evidence at this checkpoint: 649 backend tests plus 698 subtests passed (eight existing FastAPI lifecycle deprecation warnings); 80 focused frontend tests passed before the additional priority assertion. Normal staging and Demo builds passed. The full frontend suite is still running its existing ten-year lifecycle fixture; it is not reported as passed here. Final exact-commit CI and hosted results belong in the PR release comment.

Actual local browser checks include Brawndo IG1 and Initech IG2, save/exit and refresh resume, unknown-vs-gap results, replacement protection, successful Apply plus native Save & next, clean cross-client interviews, keyboard activation/Escape/focus return, docking/reset, dark/light appearance and 1440/1024/768 layouts without horizontal overflow. These are synthetic Demo checks, not real Mongo/authentication evidence. Independent content review found no remaining concrete blocker after the contextual-field and hidden-answer corrections. No screen-reader audit or interaction recording has been completed.

### Files outside the guided feature

- `BrawndoCisOverview.jsx` and `FrameworkWorkspace.jsx`/tests: specifically authorized CIS dashboard cleanup and Omni integration; existing ISO/SOC next-work behavior retained.
- `frameworkWorkspace.js` and `backend/framework_governance.py`: additive upcoming linked Review date for Omni priority ordering; no new schedule/cadence or dashboard score.
- `preview/frameworks.js`/tests: Demo persistence, applicability, archival, clean provisioning and upgrade regression coverage using the existing adapter.
- This document: current boundary, content matrix and evidence classification. The remainder is retained as historical checkpoint documentation, not current scope.

## Historical two-safeguard checkpoint

## Release boundaries

Branch: `codex/brawndo-guided-assessor`. Base: `79fb270910b818afd179d593b07b3c87a57d37b7`.
Only Brawndo (`demo_brawndo`), configured CIS IG1, dashboard, and safeguards 1.1/1.2.
No other client, safeguard, SOC 2, ISO, or global activation. No main merge or Render/backend deployment.
The existing private Sites publication is the static synthetic Demo, not real authentication/Mongo proof.

## Character and presentation

`OmniCharacter.jsx` is original inline SVG: silver body, dark lens, expressive face and four colored ring segments representing frameworks, evidence, risks and controls. No remote asset, raster concept board, new dependency, external service, AI call, key, or tracking.
The temporary artwork was replaced rather than retained as a hidden asset. Earlier development captures were moved outside the repository; repository screenshots show Omni only.
Generic component names remain; the visible interface uses Omni consistently. The application logo/name is unchanged.
The two supplied PNG references informed the lens/ring and compact-panel treatment. The new Omni HTML/ZIP was not received at implementation time; exact prototype equivalence is therefore not claimed.

| State | Static indication | Motion |
| --- | --- | --- |
| Idle | Neutral lens; blue/teal segments; accessible available text | 2px float over 6 seconds |
| Helpful | Brighter segments; “Guided review active” | No opening delay |
| Thinking | Thoughtful face; “Preparing the next step” | Small controlled segment movement only while a save/transition is pending |
| Gap | Amber ring; “Gap identified” | Restrained two-cycle pulse |
| Needs verification | Question indicator; “Needs verification” | Static |
| Complete | Illuminated teal ring/check; “Assessment complete” | Static |
| Minimized | 48px reachable launcher; saved progress retained | Same applicable static state |

Completed results with confirmed gaps/unknowns retain the corresponding visual warning alongside “Review complete. Your recommendation is ready.” Completion never means compliance.
Reduced-motion CSS disables nonessential animation/transform while keeping labels and static state.
An Omni illustration also remains visible in the open panel header; it does not overlap interview actions.
UI polish/design-engineering guidance informed reuse of surface tokens, restrained motion and explicit static feedback rather than a workspace redesign.

## Definitions and rules

Single shared versioned source: `shared/catalogs/guidedAssessmentPilot.json`, question set `brawndo-cis-pilot-1`.
Each definition has unique question ID, safeguard ID, requirement element, prompt/help/type/choices, critical flag, conditional follow-up metadata, status impact, narrative/gap contribution, evidence guidance and version.
Runtime uses `guidedAssessment.js` for visible questions, bounded answer validation and deterministic recommendation/narrative generation.
Omni consumes transient per-question signals from the same decisions; it does not introduce a second status calculation.
The character replacement did not modify the question catalog, branching, recommendation rules, narrative templates or persistence contract.

Safeguard 1.1 examines existence, authoritative/reconciled sources, owner/provider responsibilities, nine coverage classes/connection models, six required attributes, additions/removals, cadence, last complete review, reconciliation, evidence and gaps.
No/unknown existence branches to existing information, evidence and gaps without forcing detailed inventory questions.
Safeguard 1.2 examines process existence, usable inventory dependency, detection/systems, owner/provider responsibilities, response cadence, permitted alternatives, disposition, response confirmation, exceptions, inventory reconciliation, unresolved assets, evidence and gaps.
It never changes 1.1 automatically.

Rules: foundational No → Not Implemented; foundational unknown → Not Assessed; existing process/inventory with confirmed critical gaps or critical unknowns → Partially Implemented; all material elements reported present → Implemented recommendation. No generic percentage.
1.1 review age uses six calendar months with month-end clamping; annual/ad-hoc or future/invalid/stale dates prevent Implemented.
1.2 response must be weekly or more frequent. Remove, deny remote access, or quarantine are alternatives: one effective permitted response is sufficient, not all three.
Applicability exclusions need a rationale. Unknown coverage is separate from confirmed missing coverage.
These cadences and response alternatives were verified against [CIS Controls Assessment Specification v8.1, Control 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/).
Interview disposition, reconciliation and confirmation questions operationalize the requested pilot; they do not invent mandatory document names or evidence formats.
Narrative uses recorded answers only, identifies reported versus unknown facts, and makes no compliance/evidence-review claim.

## Persistence and authorization

Backend GET/PUT `/framework_assessments/{aid}/guided-assessment` reuse authenticated, authorized parent-record and client scope checks.
PUT retains existing write-role/assignment restrictions. Route/tenant changes cannot select unrelated answers.
New isolated `guided_assessment_pilot` collection uses assessment ID + authenticated user ID as its unique `_id`, with canonical client ID, bounded known answers, version, step, completion, narrative, revision and server timestamps.
Optimistic revision predicates and duplicate-key handling reject concurrent replacement with 409. Extra fields/invalid selections/oversized text are rejected.
No migration or change to existing assessment/evidence/history rows is required for drafts.
Continue and Save and exit save the interview independently; unfinished input participates in existing beforeunload/leave protection. Restart resets the interview only.
Cosmetic launcher preferences use per-user browser storage; real assessment answers use the backend.
The static Demo adapter mirrors the contract in existing synthetic session storage. Demo storage is not suitable for real client data, cross-device persistence or authorization assurance.

## Apply and history

Review exposes recommendation, editable narrative, basis, confirmed gaps, unknowns, next steps, evidence alternatives and driving answers.
Existing narrative requires explicit replacement confirmation.
Apply changes Current Implementation and Implementation Status in the existing unsaved form, adds guided-origin metadata, and follows the existing CIS rule to unconfirm operating-arrangement acknowledgement after implementation text changes.
Verification, evidence-reviewed state, evidence links, findings, actions and Last Assessed are not changed by Apply.
Normal Save/Save & next remains authoritative for assessment persistence/date/history.
Server validates version/revision/generation timestamp against that user's completed interview, then snapshots origin, answers and reviewer identity into normal history.
Manual subsequent narrative/status edits remove current guided-origin attribution while preserving historical snapshots.
Ordinary later saves do not reapply historical provenance against a newer/restarted interview.
Gaps/unknowns/next steps remain in the saved assistant result; no unrelated assessment fields were added.

## Verification

- Complete affected frontend set: 19 suites, **402 tests passed**, including existing CIS assessment, draft protection, framework workspace/access, native verification, authorization and Demo workflows.
- Configured isolated/offline backend runner: **643 tests passed, 698 subtests passed**. New endpoint isolation, per-user separation, CAS conflicts, bounds, scope gates and history attribution are included.
- Normal production build and isolated preview build succeeded. Existing large-bundle warning remains; no package/lockfile/dependency changes.
- `git diff --check` passed.

Frontend command (from frontend):

```powershell
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --testPathPattern='(guidedAssessment|GuidedAssessor|BrawndoCis|AssessmentShell|AssessmentLayout|AssessmentHistory|FrameworkDrawer|FrameworkWorkspace|FrameworkRecordAccess|cisAssessment|cisRequirement|cisCoverage|cisCadence|cisVerification|authorization|frameworks\.test|frameworkWorkspace\.test)'
node scripts/preview.cjs build
```

Backend uses `tests/run_isolated.py` and the classified offline registry, preserving configured pytest parallelization. No production database tests were run.
An initial plain unittest discovery invocation used the wrong import scope and failed; the configured isolated run above replaced it.
The unrelated full frontend multi-year simulation run was stopped; it is not reported as passing. Complete affected suites above passed; repository CI remains separate.
An existing mocked-dialog test emits an unknown-handler warning; browser console checks returned no errors.

### Browser evidence (local static Demo, built preview)

- Completed 1.1 with partial department data and unknown IoT coverage: Partial recommendation, gaps/unknowns separate, replacement confirmation, Apply, normal Save & next, unchanged Gap Identified verification.
- Completed 1.2 with weekly response and quarantine alternative: Implemented recommendation, Apply and normal Save, unchanged Needs Validation verification.
- Omni dashboard, direct Resume, restored completed results, edited answers, Not sure state, long follow-up answer, Save and exit, reload/resume, question transitions.
- Keyboard Enter/Space activation, Escape, focus return, minimize/reopen; native leave-draft warning and Keep editing preserve unfinished answers.
- 1440/1024/768 widths in light/dark: contained scrollable panel, no horizontal overflow; launcher does not overlap Save/Save & next; visible close control.
- Exclusion checks: next nonpilot Brawndo safeguard, Prestige SOC 2, Initech CIS IG2 have no Omni. Unit tests also cover 1.3, ISO and other clients.
- Browser console: no captured errors.
- State-text contrast: existing secondary token on white or dark surface; accessible names, aria-expanded and decorative SVG verified in DOM. Static state does not rely on color.
- Restart, per-user/tenant authorization and detailed history snapshot attribution have automated coverage; not all were repeated through the browser after the visual replacement.
- Reduced-motion override is code/test verified, not OS-preference browser-emulated. No physical touch-device/screen-reader run, slow-motion DevTools replay, independent security review, or recording was performed.

Screenshots are in `docs/guided-pilot-screenshots/`: dashboard, guided open, gap result, complete result, applied assessment and light/dark responsive views.

## Manual test paths

Enter Demo and select Brawndo first; client context follows the existing authorized workspace selection rather than a new URL client override.

- Dashboard: `/compliance/cis-ig1`
- 1.1: `/compliance/cis-ig1?assessment=fw_demo_brawndo_assessment_1.1&guided=pilot`
- 1.2: `/compliance/cis-ig1?assessment=fw_demo_brawndo_assessment_1.2&guided=pilot`

Private publication uses this branch's exact source commit; the Omni pilot is not merged to main or deployed to Render. The PR/release handoff records the final SHA, saved preview version and deployment outcome.

## Concurrent dashboard coordination

The user explicitly requested preservation of the running Dashboard agent's changes over any competing dashboard edits.
That agent confirmed PR #51 / `codex/client-dashboard-priority-filters` at `686ca7277d1a6af0d0920a6d3de1d75dd6b5fce3`.
Its shared client dashboard, framework cards, priority filtering/counts/search/retry work does not edit Omni's FrameworkWorkspace or CIS assessment surfaces.
Integration retains the dashboard commit without overwriting its files. This pilot is not merged to main or deployed to Render.
The Dashboard agent has the shared Sites publication slot until its separately authorized main release is delivered; Omni publication must wait for explicit handoff and include the delivered dashboard source.

Dashboard PR #51 subsequently merged as main `7b9455bd64b6f6494786396e0d1c9de67504882b`; this main revision was brought into the pilot without changing its product tree.
Combined frontend verification: **23 suites / 436 tests / one snapshot passed**, including the Dashboard agent's priority filters, native framework cards and shared dashboard regressions.
Both combined normal and Demo builds passed. Browser verification of the combined client dashboard confirmed native framework cards above Priority overview, the new filters/search, and unchanged workspace links; the CIS IG1 destination still exposes Omni.
The combined classified offline backend run passed **647 tests and 698 subtests**. It used `python backend/tests/run_isolated.py` from the repository root.
The pilot has draft PR #52 and remains unmerged. Any main/Render delivery described by the Dashboard agent is that separately authorized dashboard release, not deployment of Omni.
