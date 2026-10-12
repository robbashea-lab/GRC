# Controlled consistency candidate — 2026-10-12

## Source and ownership

Dedicated branch `codex/controlled-consistency-20261012` starts at
`ce98ea63a7b6dac5847a33f095ab5b90a657edd4` (Prism Login, PR71), including
PR70 `09e5d9855146790eb235fc887e37caedc96cb9fd`. Remote main at reconciliation:
`28b806716024ec149af2ec5da621a5a618c669d5`; it is not the compatible runtime base.
Coordinator ownership was acknowledged in
[PR57](https://github.com/robbashea-lab/GRC/pull/57#issuecomment-6130244444).
The sole integration/deployment owner is this workstream. Login is excluded;
no main merge, production, Sites, credentials, settings, migrations or client-scope changes.
Tab5 and other owners' sessions remain held. Local disposable fixtures only for writes.

Retained audit: `C:/Users/RobbA/Documents/Codex/2026-10-12/brawndo-consistency-audit`.
The recording was not decoded; retained source and screenshots are the reference.
The local audit is evidence of observed states, not universal coverage.

## Work ledger

| Finding | Affected surface | Approved target / change | Protected behavior | Acceptance |
| --- | --- | --- | --- | --- |
| R01 | CIS, ISO, SOC final guide summary | Successful authoritative Save/Update closes guide only | Exact narrative, status keys, writer/history, replacement and draft guards; progress saves remain progress-only | Success/failure/cancel/conflict/duplicate/update tests; native readback |
| R02 | AssessmentShell / OmniWindow | One Escape handles topmost eligible layer | Native stays open under guide; native-only Escape and nested dialogs still work | Real Radix capture-phase regression, focus and dirty guard checks |
| R03 | FrameworkDrawer + ISO/SOC guide mount | Reproduce context-refresh failure; retain same-identity guide only if confirmed | No stale-client eligibility or writes when context unavailable | Context-failure/identity-change tests, draft retention and retry |
| R04 | SOC native pills, choices, navigator/program labels | Use established SOC readiness vocabulary for identical stored statuses | No catalog/evaluator, numeric or historical changes | Label/value assertions and normal save regression |
| R05 | ISO/SOC native workspace | Remove empty launcher flow band through existing placement pattern | Dock geometry, questionnaire, focus, state | DOM order / layout measurements in themes and widths |
| R06 | ISO/SOC native workspace | Existing guidance/checklist inline disclosure instead of separate tab | All checklist IDs, stored responses, history, SoA and prerequisites | Content-access / selection preservation tests |
| R07 | ISO native saved-state header | Investigate only; no fabricated verification conclusion | Existing ISO capability boundary and Last Assessed | Source disposition; no new writer/capability |
| R08–R09 | Brawndo dashboard/ticket baseline exceptions | Leave unchanged: Brawndo reference protected except R01/R02 | Existing fields, wording, lifecycle, counts | Scope diff proves unchanged |
| R10 | Vendor register capability differences | Preserve columns/actions and existing workflow gates; not a styling defect | Evidence/comments/create/detail contracts | No gate changes |
| R11 | Nonpilot Vendor dialog description | Correct wrong Task/Finding purpose via existing Vendor description | Same visible content, title, actions and record workflow | Accessible-purpose regression and representative dialog |

Watch items W01–W09 require either unobserved write states, unsupported narrow
layouts or product decisions. They are not blanket implementation mandates.

## File ownership

- Coordinator: AssessmentShell, OmniWindow, BrawndoCisSafeguard scoped dismissal,
  FrameworkDrawer context retention, integrated tests/docs/browser/release.
- Guide worker: GuidedAssessor, IsoGuidedAssessor, SocGuidedAssessor final-save paths and tests.
- Framework worker: FrameworkAssessmentWorkspace, PrestigeSocAssessment,
  PrestigeSocNavigator, BrawndoCisOverview's existing presentation props,
  FrameworkWorkspace's SOC caller and affected tests.
- Operational worker: RecordDrawer's Vendor description and test.
- Independent reviewer: read-only final integrated candidate after freeze.

No worker commits, merges or deploys. Shared extensions must be additive,
identity-scoped and preserve fail-closed native saving. Installed Radix source
is authoritative for capture ordering; WAI-ARIA APG dialog keyboard/focus guidance
informs dismissal checks without claiming whole-application conformance.

## Verification status

R01/R02/R03/R04/R05/R06/R11 implementation frozen for independent review.
No dependencies, schemas, backend, catalogs, global CSS, Login, Brawndo dashboard
or ticket changes. The existing reusable presentation props/components are used.

### Necessary wording / structure exceptions

| Location | Before | After | Evidence / preserved meaning |
| --- | --- | --- | --- |
| SOC stored `addressed` display | Implemented | Addressed (Readiness) | R04: same saved key as canonical operatorStatuses and Omni summary; counts/writer unchanged |
| SOC stored `in_progress` display | Partially Implemented | Partially Addressed | R04: same key, filter value, outcome and history |
| SOC stored `needs_attention` display | Not Implemented | Needs Remediation / Validation | R04: existing SOC canonical meaning, not a new decision |
| ISO/SOC native navigation | Separate Assessment criteria tab | Existing Assessment guidance & working checklist disclosure | R06: all existing content, checks, historical IDs and working responses retained; no new requirement |
| ISO/SOC guide placement | Before native layout | After native layout, as CIS | R05: no empty launcher band before primary work; launcher/window styling unchanged |
| Nonreference Vendor accessible description | Task/Finding purpose | Existing Vendor purpose: Manage the vendor relationship, assurance documents and independent review and contract schedules. | R11: correct resource purpose; visible content/columns/tabs/permissions unchanged; styling alone cannot correct accessible meaning |

R07 remains deferred: no invented ISO verification value or capability.
R08/R09 are confirmed baseline exceptions but excluded by the Brawndo protection.
R10 has differing real workflow contracts, not permission to flip feature gates.
W01–W09 remain bounded future items, not new implementation requirements.

### Executed evidence before independent freeze

- R02 real Radix capture-phase tests: 3 passed (guide-only close, dirty guard,
  nested confirmation, busy handling, native-only Escape and focus return).
  An intermediate nested-test failure was a wrong test selector; corrected
  selection proved no additional nested defect. No warning was suppressed.
- R03 regression reproduced same-identity guide unmount for ISO A.8.11, ISO 6.2
  and SOC CC1.1. After correction: 4 passed, including failed context writes,
  retry retaining the same mounted answer and identity separation. The test
  also exposed a SOC callback attempting a write without live context; the
  shared native callback now requires identity-matching live context for all three.
- Guide worker: 549 tests / 6 focused suites; delayed authoritative success,
  cancellation, failures, conflicts, duplicate clicks, prerequisites, exact text
  and progress-only paths. Mock callbacks are not hosted persistence evidence.
- Framework worker: 149 tests / 6 suites, one unchanged CIS snapshot; read-only
  guidance, preserved checks/history/SoA, labels, raw filter values and counts.
- Vendor worker: 34 tests / 4 suites; no writes, workflow tabs unchanged.
- Local browser `localhost:4232` uses an isolated Demo build and normal entry/onboarding.
  Only disposable `Consistency Local QA 20261012` was written, ID
  `clients_demo_mv5lomcw_q6lsxd3i`; CIS 56, ISO 123, SOC Security 33 were created
  through supported onboarding, with unknown governance responses and no users.
  CIS 1.1 final Save and confirmed Update, cancellation, progress/resume, dirty
  Escape/nested Escape, exact multiline text and refresh readback passed.
  ISO 4.1 progress-only Save, guide-only Escape, resume, final Save and exact
  refresh readback passed. SOC CC1.1 negative fixture final Save and refresh
  retained exact text and `needs_attention`, with verification Not verified and
  no linked Finding created. None is a conclusion about protected clients.
- Normal optimized build succeeded before final presentation-test freeze;
  final-source build and CI are recorded separately below when complete.

Fresh provider read-only inspection in this workstream confirmed existing staging
still Live `ce98ea6`, `dep-db6ggsbbc2fs73c2cnk0`, service
`srv-db1s0cugekts73f72reg`; automatic deployment is disabled. No settings changed.
Root acknowledged a new isolated staging tab for bounded read-only smoke; no
hosted fixture is released for writes. Original held Tab5 remains untouched.
Hosted writes, conflicts and failure injection remain unverified without an
approved isolated hosted fixture/session; local checks do not satisfy them.

Relevant references: installed Radix Dialog 1.1.11 / DismissableLayer capture
implementation and [WAI-ARIA APG Dialog Keyboard and Focus](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
No whole-application accessibility or security conformance claim is made.

## Final integration corrections

- `f164a377c7aaa5c3ceb9bb5a2f9615d0817f47dd`: R02 also routes Escape from
  native controls to the open contained guide before native dismissal. A failing
  regression exposed that remaining case; after correction, 188 tests in six
  affected suites passed. The event listener is on that guide element, not a
  global keyboard listener; its existing dirty/busy guard remains authoritative.
- R04 responsive regression: the full Needs Remediation / Validation label in
  a near-right tooltip increased page width to 787 at a 768 viewport and 1031
  at 1024. The existing SOC stylesheet aligns that near-right tooltip to its
  segment's right edge. No wording, first/last tooltip, Brawndo CSS or color change.
  Actual browser after correction at 768: page width 758 (inside viewport),
  focused tooltip right edge 691.094, full label/count retained and visible.
- The initial viewport capability remained bound to an older tab; filenames
  alone are not acceptance evidence. `*-fresh-capability` / `*-final` captures
  record actual verified viewport dimensions after acquiring the current tab's
  supported capability. Transient/misnamed captures are retained but excluded
  from responsive acceptance. Screenshot raster height can be shorter than DOM
  viewport height; that is not by itself evidence of clipped application content.
- An implementation-time full local suite completed 108 suites before output
  stopped advancing; three observed failures were obsolete SOC label expectations,
  corrected and included in the final focused 188-test / one-snapshot pass.
  That pre-freeze run was stopped through normal session Ctrl+C and is NOT final
  full-suite acceptance. It was not relabeled a pre-existing test failure or pass.
  Only the run-owned process ancestry was inspected; no unrelated process was killed.

Independent and exact composite CI/build/deployment evidence is recorded in the
final report. Separately owned approved Login source may be integrated without
editing or taking ownership of that design; record its provenance explicitly.
