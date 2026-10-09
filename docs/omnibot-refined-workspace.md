# Focused Omnibot refinement

This refines the existing Brawndo CIS IG1 pilot's Omnibot surfaces. It does not redesign the surrounding program, Control 1 list, or native safeguard assessment. The existing trusted-client gate, framework/configuration gate and safeguard allowlist remain authoritative. Only safeguards 1.1 and 1.2 receive the grouped interview.

## Source and ownership

- Approved reference: `Omnibot_Only_Current_Workspace_Interactive_v2.html`.
- SHA-256: `c21898398cb65a56a0b7770401445219d466e64ccf962a30a61ee9eac909171b`.
- Pilot source baseline: `0739c01aea1b4b62ea088f5570ca4d35e84dd53c`, existing draft PR #61.
- Agreed main baseline when work began: `911706cebc7a70c0443f500fcd4bc19260c1db60`.
- Refinement branch: `codex/omnibot-refined-workspace`.
- Shared ownership discussion: PR #57, comment `6084088476`. One owner handles source, verification and the staging deployment.

The attached HTML's title identifies the refined design. Its fixed native-page images, fictional examples and simplified scoring are presentation references, not production data or a replacement assessment engine.

## Interaction changes

The program and safeguard invitations use the approved wording, with a single X. The existing character opens the guide. Existing invitation suppression preferences remain readable; opening or dismissing an invitation does not save an assessment. Focused positioning menus are removed; character dragging and arrow keys remain available.

The guide keeps minimize, maximize/restore and close, pointer resize handles, and viewport clamps. Its focusable heading accepts arrow keys to move and Alt+arrow keys to resize. Keyboard instructions are in the accessible description rather than a visible placement menu. Closing with unsaved answers or edited prose opens the existing dialog primitive's save/discard choice. Minimize retains mounted interview state.

Program cards use actual saved titles and implementation statuses. Unassessed records get one sentence. Reasons use answers attached to the saved native assessment and authorized linked work, not an unfinished or unapplied interview. They are deduplicated and limited to five. Missing authorized context is reported as unavailable.

## Question-to-field mapping

No catalog question, criterion, option, version or evaluator is changed. Presentation groups select the existing visible questions. The stored step remains the production question index, not a group number.

The [question-by-question matrix](omnibot-refined-question-matrix.md) records each production ID, presented wording/group, retained value/condition, persistence field, summary section and regression coverage.

### Safeguard 1.1 — `cis-v8.1-control1-3`

| Group | Production answer IDs | Optional contextual detail key |
| --- | --- | --- |
| Inventory | `inventory`, `existing`, `system`, `sources`, `owner` | `inventory_detail` |
| Asset coverage | `coverage`, `scope_reason` | `coverage_detail` |
| Inventory details | `attributes` | `attributes_detail` |
| Keeping it current | `maintenance`, `maintenance_detail` | `maintenance_detail_detail` |
| Review and reconciliation | `frequency`, `last_review`, `reconciled`, `evidence`, `gaps`, `unknowns` | `evidence_detail` |

`sources_detail` retains the explanation for the two existing multiple-source choices. Switching to a single source hides this field and excludes its inactive explanation from the generated summary without deleting it. The maintenance note uses the existing detail extension of the `maintenance_detail` question; it must never overwrite the separate update-process answer.

### Safeguard 1.2 — `cis-v8.1-control1-2`

| Group | Production answer IDs | Optional contextual detail key |
| --- | --- | --- |
| Current process | `process`, `existing`, `system`, `owner` | `process_detail` |
| Identification | `inventory_dependency`, `detection` | `detection_detail` |
| Response | `frequency`, `actions`, `disposition`, `confirmation` | `actions_detail` |
| Exceptions and reconciliation | `exceptions`, `reconciled`, `unresolved` | `exceptions_detail` |
| Review and confirmation | `evidence`, `gaps`, `unknowns` | `evidence_detail` |

The saved 1.1 inventory context remains read-only context for 1.2. No answer is imported and neither native assessment is changed by viewing it. Conditional groups follow the existing catalog. Unknowns, exclusions and required explanations retain their existing meaning.

## Save, summary and compatibility

Save & next writes the interview before moving. Save & close closes only after a successful interview write. Failures and concurrency rejections retain local input and report the failure. Root answers are never defaulted to Yes; multiple-source explanations must be recorded before continuing that group.

Summary Back returns to the last active interview group, matching the reference, without discarding answers or edited summary wording.

The summary wraps the existing deterministic evaluator. It records reported facts in an opening and labeled breakdown, distinguishes deficiencies from confirmation needs, and includes attributed contextual notes without inventing a scoring rule. It does not verify evidence, complete a Review, set Last Assessed, or create linked work.

Edited summary wording survives answer changes and incomplete checkpoints through the existing narrative field. After reopening an incomplete checkpoint, that wording requires explicit review or refresh before use. Existing native prose requires explicit reconciliation and replacement acknowledgment. A native form change while the interview save is pending prevents stale application.

Use summary durably saves the reviewed interview and stages the implementation, proposed status and new interview revision in the native form. The existing Save assessment remains the authoritative native save. Interview CAS, assessment lineage/scope comparison, attribution and history remain intact.

Older supported interviews retain their original question set and recorded results. They are not silently converted to these presentation groups. Existing explicit restart/version controls remain available. This change adds no backend schema, migration, dependency, expiry, retention rule, numerical urgency threshold or automatic verification behavior.

## Verification and release evidence

Local evidence is retained under `outputs/omnibot-refined/`, including original tests, diagnostic failure logs, subsequent regression logs, build logs and reference/current screenshots. Diagnostic runs made while implementation was changing are not exact-commit release proof.

The focused tests cover separate interview saving, reopening, source explanations, note-field independence, dates, failures/retries, concurrent native edits, read-only controls, unsaved close protection, comparison conflicts and retained history. Existing nonpilot assessor, native workflow, evaluator, lifecycle and window-boundary suites remain applicable. Tests for removed per-answer native staging and invitation menus are replaced with the requested Save & next → reviewed Use summary behavior.

The final release must also record exact-head CI, both builds, fresh Render source/ownership checks, deployed SHA/ID, matching closed-native-page comparisons and actual hosted authenticated persistence results. Local Demo data proves browser behavior only.

Target service: `omnisciente-staging` (`srv-db1s0cugekts73f72reg`). Target navigation: `https://omnisciente-staging.onrender.com/compliance/cis-ig1` → Brawndo → Control 1 → safeguards 1.1/1.2. Do not merge main to trigger deployment. Keep production, separate Demo/Sites publication, provider settings and wider pilot activation outside this release.

Recovery uses a tested compatible writer at the prior pilot baseline or a forward fix. Preserve current interviews, native history and additive detail fields. Do not revert to a pre-pilot writer or reset/reseed the database.

Browser verification follows [Playwright's user-visible behavior and isolation guidance](https://playwright.dev/docs/best-practices). The save/discard dialog reuses the established dialog primitive; focus and Escape checks follow the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). These selected checks do not establish whole-application accessibility conformance.
