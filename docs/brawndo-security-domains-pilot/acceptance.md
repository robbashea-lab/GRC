# Brawndo Demo CIS IG1 Security Domains technical specification

This file defines the Demo-only feature contract and its 40 verification requirements. It is not an execution receipt, release approval, deployment announcement or acceptance claim. Every checklist row starts at **NOT TESTED** in this specification; the integration owner keeps actual results, exact candidate/CI/provider receipts, evidence and decisions in the external acceptance ledger. Historical implementation or authenticated-workspace results do not qualify a Demo-target successor.

## Eligibility and isolation

Security domains may appear only when every condition below is satisfied. Missing, malformed or mismatched context fails closed.

| Contract | Required value |
| --- | --- |
| Presentation flag | `enabled === true` in `shared/catalogs/brawndoSecurityDomainsPilot.json` |
| Native workspace identity | `user.workspace_mode === 'demo'`; an intentional existing Demo session |
| Public Demo client identity | Exact `demo_brawndo`; never a display-name comparison |
| Framework key and version | Route/data key `cis-ig1`, catalog version `8.1` |
| Implementation group | Native configuration numeric `1`; string coercion is not eligibility |
| Native program state | `selected === true` and `configured === true` |
| Native program namespace | `implementation_position.program_id === 'demo_brawndo:cis-ig1'` |
| Source integrity | Complete, unique native IG1 definitions/records and consistent native implementation position |

The gate must remain off for every authenticated workspace, including authenticated clients named Brawndo and legacy test clients; other Demo clients; other frameworks; CIS IG2/IG3; unconfigured, missing or malformed programs; and new-client defaults. There is no authenticated-client or legacy-fixture allowlist. The UI gate does not replace existing native client/program authorization. Broader rollout, authenticated activation, production promotion and record changes are outside this feature's scope.

Implementation references are [the pilot config](../../shared/catalogs/brawndoSecurityDomainsPilot.json), [the gate/model](../../frontend/src/lib/brawndoSecurityDomains.js) and [the native workspace](../../frontend/src/pages/FrameworkWorkspace.jsx). Verify the actual session/user and native program response as well as source; a route label or loaded asset alone is insufficient.

## Native presentation and persistence

Place Security domains immediately beneath unchanged Assessment Progress within the existing Program Snapshot presentation. Preserve native branding, wording, spacing, themes, chart/legend behavior, calculations, applicable denominators, verification semantics, Controls order, search/status meanings and click behavior. Respect the current native structure; do not add a Snapshot accordion solely because the concept uses the word expanded.

The approved [mapping](../../shared/catalogs/brawndoSecurityDomains.json) is a presentation taxonomy: 11 domains, 56 unique IG1 safeguards and 15 controls, ordered 1-12, 14, 15, 17. It does not add records or establish risk, maturity, certification or broader framework coverage. Derive domain counts from existing native records/status/applicability logic. Partial receives no invented credit; Not assessed stays unknown. Incomplete or inconsistent source must not imply implementation health.

Every safeguard shortcut must pass the exact existing native row to the same `openRecord`, route, editor and save lifecycle as Controls. In particular, Asset & Software Management -> 1.1 must be identical to Control 1 -> 1.1. Reuse native guides, implementation, Items, findings, Evidence, owners, drafts, history, permissions and Omnibot. Preserve the existing intentional Demo adapter and session-local persistence; Demo requests must retain their existing isolation from authenticated HTTP data. The concept HTML is reference material, not a source of records, guides, editor code or local save behavior. Do not reset/reseed Demo state, migrate records or rewrite authenticated data to activate the section.

Domain selection is local presentation state. View mapped controls intersects the existing native filters. Clearing the domain removes only that selection, retaining native status/search meanings and returning focus to an available native control when a row disappears.

## Known shared limitation

A shared Omnibot exclusive-choice handling defect remains **unfixed and deferred**; its fix is held outside this Demo-target change. The domain feature must not change shared answer-selection or persistence behavior. Record the defect's observed effect and every unverified Omnibot path in the external ledger. Do not claim all Omnibot journeys pass, or imply that a gate correction or native-editor reuse fixes this issue. Any newly introduced preservation, isolation, permission or persistence regression still blocks release.

## Verification requirements

Use one integration/deployment owner and one exact reviewed candidate. Run full required tests, both applicable builds and the exact candidate's required CI. Use actual native Demo browser sessions locally and on the authorized hosted target; component tests, mocked API journeys and source review are distinct proof layers. Preserve current records and mode/session state, using only approved isolated QA activity. Capture meaningful baseline, both-entry native persistence, Omnibot, restricted-role/context isolation, keyboard/focus, theme/mobile and unchanged authenticated-workspace proof. Do not create accounts, expand permissions or reset records to manufacture a result.

The table preserves all 40 checks as requirements. **NOT TESTED** here means this source file asserts no execution result. The external ledger must use PASS / FAIL / NOT TESTED with proof, limitations, known defects and any explicit sequencing decision; a partial proof layer is not a complete check.

| ID | Required verification | Specification status |
| --- | --- | --- |
| A1 | Record the actual current source/target and native Demo baseline before changes; keep source, runtime and mode distinct. | NOT TESTED |
| A2 | Verify exact `demo_brawndo`, Demo mode, CIS v8.1, numeric IG1 and available native program namespace; fail closed on uncertainty. | NOT TESTED |
| A3 | Verify other Demo clients/programs/frameworks, every authenticated client including legacy test clients, IG2/IG3 and new-client defaults have no domain section. | NOT TESTED |
| A4 | Preserve native colors, fonts, wording, branding, navigation and layout; add the section beneath Assessment Progress in the existing Program Snapshot structure. | NOT TESTED |
| B1 | Match all 11 domains and 56 unique safeguards exactly once to the approved mapping across controls 1-12, 14, 15, 17, with no extras. | NOT TESTED |
| B2 | Derive counts from current native Demo client/program records, with no concept data or fixed status totals. | NOT TESTED |
| B3 | Reconcile each domain with native statuses and the unchanged overall calculation. | NOT TESTED |
| B4 | Confirm Partial has no invented credit and Not assessed remains unknown. | NOT TESTED |
| B5 | Confirm fully unassessed domains say so and missing/loading/error/inconsistent source never implies healthy implementation. | NOT TESTED |
| B6 | Verify readable counts/denominators, native applicable scope, verification and applicability semantics without broader coverage claims. | NOT TESTED |
| B7 | Confirm no risk, maturity, certification score or broader framework coverage claim is introduced. | NOT TESTED |
| C1 | Expand/collapse every domain and verify all safeguard IDs, native titles and statuses; collapsed rows are not exposed. | NOT TESTED |
| C2 | Exercise pointer/keyboard shortcuts, accessible names, Enter/Space and focus behavior in an actual browser. | NOT TESTED |
| C3 | Verify View mapped controls reuses native navigation/filter meanings and clearing the domain preserves native status/search state. | NOT TESTED |
| C4 | Compare unchanged Controls IDs/order, counts, columns, filters/search/clicks and normal entry paths against the same native records. | NOT TESTED |
| C5 | Compare native chart, legend, metrics, denominator, tooltips and existing click actions with the same-record baseline. | NOT TESTED |
| C6 | Verify supported desktop/mobile layouts, Light/Dark themes and keyboard/focus in an actual browser; record unsupported tooling without inferring a pass. | NOT TESTED |
| D1 | Exercise all 56 domain and Controls paths; require identical native record, opener/route and editor for every pair. | NOT TESTED |
| D2 | Compare native guide, implementation, status, verification, Items, findings, Evidence, ownership and history through both paths. | NOT TESTED |
| D3 | Confirm no duplicate record, alternate write endpoint, concept editor/guide, record copy or replacement save path is introduced. | NOT TESTED |
| D4 | Domain -> Asset & Software Management -> 1.1 -> native save -> Control 1 -> 1.1 -> reload retains exact native fields/state. | NOT TESTED |
| D5 | Save 1.1 through Control 1, then reopen through its domain and compare the same native state. | NOT TESTED |
| D6 | Exercise 1.2 and a multi-control domain in the correct native Demo client/program from both entry directions. | NOT TESTED |
| D7 | Verify draft/final, cancel, manual text, reconciliation, Items/findings/Evidence, history and stale-write protections; distinguish stored bytes from browser delivery proof. | NOT TESTED |
| D8 | Verify native save refreshes derived domains and original progress through existing invalidation/calculation paths. | NOT TESTED |
| D9 | Verify close/cancel retains origin context and filtered-row removal returns focus to an available native control. | NOT TESTED |
| E1 | Exercise Omnibot group save, Save & next, resume, final summary, reconciliation, prioritization, cancel and manual-text protection from both contexts; disclose the held exclusive-choice defect and unverified paths. | NOT TESTED |
| E2 | Verify save/reload and native Demo session re-entry persistence without changing mode or resetting state; preserve native authenticated logout/login behavior as a regression requirement. | NOT TESTED |
| E3 | Preserve native restricted/read-only edit behavior through domain links wherever supported; verify authenticated workspace controls remain untouched, without account/grant changes. | NOT TESTED |
| E4 | Verify mode/client/program context isolation and existing authorization; no cross-context content or writes, and no reliance on the presentation gate as authorization. | NOT TESTED |
| E5 | Preserve scheduling, authentication, audit/history and automation; keep existing records unchanged by implementation and clean up only approved test activity through native recoverable procedures. | NOT TESTED |
| F1 | Run full required tests, both applicable builds and all required CI jobs for the exact Demo-target candidate; prior authenticated-target results are insufficient. | NOT TESTED |
| F2 | Obtain independent scope/preservation review and completion from every assigned agent for that exact candidate. | NOT TESTED |
| F3 | Use one integration/deployment owner to release one tested candidate only to the existing authorized staging target. | NOT TESTED |
| F4 | Record the actual prior release and qualify the executable Demo-identity gate-disable/rollback procedure without record restoration. | NOT TESTED |
| F5 | Require successful deployment and provider-reported full source equal to the exact tested candidate, with fresh hosted assets/native context. | NOT TESTED |
| F6 | Execute actual hosted Demo Brawndo domain/native safeguard and Omnibot save/reopen/resume journeys, preserving existing native session state and recording known limitations. | NOT TESTED |
| F7 | Verify another Demo client/program and authenticated workspaces retain their original experience and have no pilot activation. | NOT TESTED |
| F8 | Keep the final external report of full SHA, branch/review, target, deployment, CI, hosted proof, isolation/preservation, remaining work and rollback. | NOT TESTED |
| F9 | State deployment completion separately from user acceptance; claim no authenticated rollout, production promotion or broader rollout. | NOT TESTED |

Operational receipts, checklist execution results, internal identifiers and local incident/test history belong in the owner's external ledger, not in this technical specification. This file does not claim the mode correction is deployed. See [rollback.md](rollback.md) for the enduring gate-only recovery procedure.
