# Omni guided-assessment pilot

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

Private publication uses this branch's exact source commit; main and Render are untouched. The PR/release handoff records the final SHA, saved preview version and deployment outcome.

## Concurrent dashboard coordination

The user explicitly requested preservation of the running Dashboard agent's changes over any competing dashboard edits.
That agent confirmed PR #51 / `codex/client-dashboard-priority-filters` at `686ca7277d1a6af0d0920a6d3de1d75dd6b5fce3`.
Its shared client dashboard, framework cards, priority filtering/counts/search/retry work does not edit Omni's FrameworkWorkspace or CIS assessment surfaces.
Integration retains the dashboard commit without overwriting its files. This pilot is not merged to main or deployed to Render.
The Dashboard agent has the shared Sites publication slot until its separately authorized main release is delivered; Omni publication must wait for explicit handoff and include the delivered dashboard source.
