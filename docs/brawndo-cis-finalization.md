# Brawndo CIS IG1 finalization — 2026-09-23

## Scope and evidence boundary

Six-phase follow-up to [the product review](brawndo-cis-product-review.md). The prototype remains restricted by exact client ID `demo_brawndo`, record tenant, `cis-ig1`, and Demo identity. No other framework/client was activated. Shared Sheet accessibility improvements are the explicitly permitted exception. No dependencies, schemas, seed records, permissions, scoring, mappings, or scheduling business rules changed.

Browser work used the actual local React Demo at port 4175. Mutations were synthetic session data, not seed changes or real client evidence. Brawndo was not reset. A separate `Brawndo — date finalization QA` client isolated onboarding testing. This is not non-Demo backend/staging validation, accessibility certification, or a real-client assessment.

## Phase 1 — first due date

**The previous observed date loss was reproduced as a test-input problem, not a Review-generation defect.** The browser automation's native date `fill` changed the DOM value without committing React's controlled value: immediately after fill the DOM property contained the date while the controlled value attribute remained empty; Next/Back restored empty. A native keyboard date edit committed both values. Reloading onboarding then retained the entered date.

The traced application path is:

`Onboarding` date input → `state.framework_reviews[plan.key].due_date` → queued draft/final payload → baseline validation/cloning → `reconcileCatalog` → normal Review `due_date` → session persistence/read model → `ReviewDrawer`.

No omission or default overwrite was found. Date-only values stay date-only; empty input remains null and Needs Scheduling. Do not change recurrence semantics to compensate for an uncommitted test input.

Validation:

- Browser: committed `2028-03-28`, refreshed the onboarding draft, completed setup, opened Enterprise Asset Inventory Review, saw Due date `2028-03-28`, Upcoming, H1 2028, next date 2028-09-28. Refresh and a later return during final regression retained March 28. The other eleven unset Reviews remained Needs Scheduling.
- `Onboarding.test.jsx`: entered `2028-02-29` remains visible and appears in both draft and final submitted payloads.
- `preview/frameworks.test.js`: leap day `2028-02-29`, DST-boundary date `2027-11-07`, and empty input pass draft → finalization → persisted Review → retrieval assertions.
- Demo uses the local API adapter, not an HTTP backend. Payload assertions are component tests; persistence/generation assertions exercise the Demo adapter and serialized store. Browser verification confirms the resulting UI and reload durability.

Correction to the earlier report: a scheduling defect was suspected there but not established. This investigation resolves that observation without a speculative application scheduling patch.

## Phase 2 — shared dialog accessibility

Root cause: `RecordDrawer` and the separate `ReviewDrawer` rendered Sheet content with titles but no Radix Description; several nested action dialogs did the same. Programmatically opened drawers also lack a Radix Trigger for automatic focus restoration.

- Added optional `SheetContent.description`, rendered through Radix Description with screen-reader-only styling. Existing explicit `SheetDescription` children remain supported.
- Supplied purpose-specific descriptions for the main record/Review drawers and relevant nested Finding, decision, link, risk, policy-verification and vendor-review dialogs. No meaningless generic fallback or warning suppression.
- Capture the actual opener; restore focus on close if it is still connected. Respect caller-supplied autofocus handlers and cancellation. Radix continues to own trapping, Escape and semantics.
- Four primitive tests cover title/description IDs, existing-description compatibility, Escape/Trigger return, and programmatic opener return.
- Browser checks: linked Finding, Action Item and Review descriptions; initial close-button focus; Tab into the Review; Escape back to the same linked-record opener. Findings/Reviews use their existing Evidence/Comments/Activity surfaces.
- No new missing-description warning occurred in post-fix retests. The browser log retained earlier pre-fix warnings and one development hot-refresh dependency-array warning from editing the effect; these were not suppressed and did not recur after full reload.

Implementation follows the [Radix Dialog accessibility model](https://www.radix-ui.com/primitives/docs/components/dialog) (installed package 1.1.11). This is not screen-reader or whole-application WCAG certification.

## Phase 3 — operator workflow

Worked consecutively through **1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5**, then 5.3 for an existing Not Implemented / Needs Validation case.

| Observed friction | Correction / verification |
| --- | --- |
| Closing a linked drawer refreshed context by unmounting all linked rows, losing the opener and reading position | Preserve context only for the same Brawndo prototype assessment and tenant while refreshing. Browser Escape returned to the exact linked Review/Finding button. A failed refresh clears context and disables saves. |
| Retaining context exposed a race: an evidence-options response could be overwritten by the later context response, leaving the picker loading | Merge same-record options instead of erasing them. Regression test deliberately resolves context after evidence; browser linked a second artifact and retained usable remaining options. |

No spacing or styling changes were justified by this pass. Existing comfortable reading width, fixed actions and stacked tablet layout were retained; no new decorative elements or abstractions were added.

Operator evidence:

- Implemented, Partial and Needs Validation conclusions inspected with and without evidence/Findings.
- Long narrative appended as explicitly synthetic QA text on 1.2; saved through Save & next; retained after navigation, close/reopen and browser reload. Concise QA note saved separately on 3.2.
- Existing Finding opened; new explicitly synthetic software-exception Finding on 2.3 created **one** normal Action Item. Opened the Action and verified its Finding source and safeguard relationship.
- Existing Information Security Policy evidence linked to 3.1; existing Q3 access-review artifact linked to 3.3. Search narrowed options; download invoked; relationship remained after reload/navigation. No fabricated artifact uploaded.
- Comment posted on 2.1; Save & next was disabled while the comment draft was unfinished. Posted comment survived reload.
- N/A without rationale rejected save, retained draft and did not advance. Keep editing / explicit discard worked. **No unsupported N/A conclusion was saved to canonical Brawndo merely to manufacture coverage.**
- Reviewed linked Review's actual quarterly cadence separately from the safeguard's source interval; did not change cadence, applicability or interpretations.

## Phase 4 — final regression

### Browser checks

- Brawndo Active Profile, CIS Applies, 56 safeguards and current operational records present. Historical policy/Review counts remain blank; original people remain Not designated/Unassigned. No reconstructed history.
- Search, automatic matching-section expansion, Partially Implemented filter (six matching safeguards in the QA session), reset, ordered Previous/Next, position, last-opened completed safeguard shortcut and configuration return exercised.
- Overview continued to distinguish assessment coverage from compliance/certification and operational attention from assessment status.
- Narrative, evidence, comment and Finding/Action relationships persisted through relevant Next/Previous, close/reopen, route return and refresh paths.
- Re-ran isolated onboarding Review date retrieval/reload during final regression; March 28, 2028 remained visible.
- 1440×900, 1024×768 and 768×900 screenshots inspected. Header/footer actions remained available; tablet stacked metadata below primary content; no dialog horizontal overflow (768-width dialog client/scroll widths both 742).
- Keyboard: Previous→Tab→Next, final Close→Tab wraps to Previous, Escape closes, linked drawer focus returns, focus remains inside modal. Native labeled status controls retained.
- Globo Gym CIS inspected in the browser: original Search requirements/In Progress overview and legacy drawer remained, rather than the Brawndo workspace.
- Post-fix browser retests showed no new description/runtime warnings after reload.

### Automated checks

Commands from `frontend` unless noted:

```text
CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand
node frontend/scripts/preview.cjs build  (repository root, CI=false)
git diff --check                      (repository root)
```

- **89 suites / 503 tests passed**, including ten added tests. Initial full run caught one mock-text assertion affected by adding a close button; corrected to assert source kind/title independently, then reran all tests.
- Optimized Demo build passed, main asset `main.133fbf5c.js`; +333 B gzip versus prior build. No performance claim is inferred from bundle size.
- Build lint retains the pre-existing `PlatformAdmin.jsx:53` missing `load` dependency warning; Node retains `fs.F_OK` deprecation. Neither was suppressed or changed outside scope.
- No TypeScript target in this JS project. No backend changes; real backend/staging was not dynamically retested.
- Component tests cover failed save/draft retention, unfinished related drafts, load failure, authorization UI boundaries and refresh failure. No browser network-failure injection or screen-reader test was performed.

## Phase 5 — frozen reference pattern

See [reference pattern and architecture recommendation](brawndo-cis-reference-pattern.md). Behavior is frozen as the Brawndo-only prototype, not enabled elsewhere. Preserve the separation between primary assessment work, supporting metadata and authoritative related modules. Freeze means regression-backed reference behavior, not a new shared framework migration.

## Phase 6 — architecture analysis only

Reuse existing `FrameworkWorkspace`, native `hierarchyPath`, catalog definitions, `FrameworkDrawer` controller, source/recurrence presentation, and authoritative Review/Finding/Evidence endpoints. Eventually extract small presentation slots and a draft/navigation boundary rather than replace these systems or create a universal status enum. See the companion document for interfaces, native responsibilities, risks and rollout order.

Important repository fact: `frameworkDefinitions.json` marks CMMC `implemented: false`; `ComplianceWorkspace` exposes the unconfigured-program message. There is no implemented objective/score/POA&M workspace in this checkout to claim preservation/validation of. Future CMMC work requires its own authoritative domain implementation first.

## Remaining limitations and decisions

- Original historical baseline counts remain unknown. No data fabricated.
- Native Safari/iOS, screen readers, a fully assessed manufactured program, and real authenticated staging were not tested.
- N/A rejection/draft safety tested; no domain-approved N/A Brawndo scenario was invented.
- The synthetic clients still show the portfolio's Onboarding label after setup, despite operational framework/Review creation. This separate client-lifecycle/status presentation discrepancy was observed but not changed; determine intended client-status transition before altering it.
- Official CIS content remains reference-only. No licensing grant or new official wording assumed.
- All QA changes are local synthetic session data. They are not included in the published seed dataset.

## Changed files

- `frontend/src/components/ui/sheet.jsx`, `sheet.test.jsx`
- `frontend/src/components/RecordDrawer.jsx`, `ReviewDrawer.jsx`
- `frontend/src/components/FrameworkDrawer.jsx`, `BrawndoCisAssessment.test.jsx`
- `frontend/src/pages/Onboarding.test.jsx`
- `frontend/src/preview/frameworks.test.js`
- `docs/brawndo-cis-product-review.md`, this report, `docs/brawndo-cis-reference-pattern.md`

No dependency or schema changes. Branch: `codex/brawndo-cis-assessment`. Exact commit/publication results are recorded in the final task handoff after publication. Publish only the existing synthetic Demo Site with unchanged audience and feature branch; do not update GitHub main, Railway, real-client storage or Omnisciente production.
