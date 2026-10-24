# CIS Risks Concept Parity

Updated October 24, 2026. Implementation owner: Agent Fook Yu. Sole integration/release owner: Agent 007.

## Current state

Source implementation and meaningful regression tests are prepared in the isolated checkout `C:/Users/RobbA/Documents/Codex/2026-10-24/you-x20-2/work/CIS-Risks-Concept-GRC`, branch `codex/cis-risks-concept-parity-20261024`.

- Base commit: `45b5f09b49c62a8a1dee92f4483ffb5b4f2d363f`
- Base tree: `1fb4e15e74b504264dd9063efcb8e153ad11fe9b`
- Local implementation candidate: the milestone commit containing this handoff on the branch above; exact commit/tree are recorded in the accompanying source checkpoint. No push is authorized yet.
- PR/push/merge/deployment: none for Risks. Risks is excluded from the current PR95 release.
- Focused test run 1: completed October 24 at 19:32 UTC, exit 1, 207.91 seconds. Twelve suites: ten passed, two failed; 179 tests: 174 passed, five failed. All new model/component/integration suites and native Risk review/workflow suites passed. The failed assertions were one task-identity mock and four obsolete timeline selectors/fixtures. Source-only corrections retain all exact-ID, abort, late-response, single-drawer and no-write assertions; rerun remains queued.
- Focused test run 2: completed October 24 at 19:43 UTC, exit 1, 96.894 seconds. Twelve suites: eleven passed, one failed; 179 tests: 178 passed, one failed, no skipped cases. The five run-1 failures and all new regressions passed; the option warning is absent. The unchanged native `RecordDrawerRiskReview` Review-after-acceptance journey exceeded its original 5,000ms timeout (it passed run 1). This failure is preserved. The focused gate has not passed as a whole.
- Isolated native Review diagnostic: completed at 19:46 UTC, exit 0, four of four tests passed in 14.735 seconds; the acceptance-to-Review journey completed in 2,971ms with its original 5,000ms limit. No source, assertion, or timeout changes. All 1,117 source hashes still match. This is supplemental evidence; it does not replace the failed full campaign or establish the timeout's root cause. The test mounts unchanged RecordDrawer on non-CIS demo_dunder, without the new page/concept.
- Both exact CI builds passed with `CI=true`: authenticated staging (`node scripts/staging.cjs`) at 19:54:31–19:55:49 UTC; isolated Demo preview (`node scripts/preview.cjs build`) at 19:55:49–19:57:18 UTC. No scripts, locks, or dependencies changed. Build logs include the fs.F_OK deprecation and large-bundle advisories; compilation succeeded. Standalone lint/security scans have not run.
- Staging artifact: all 20 files hashed under `deploy/cloudflare/dist`; entry assets `static/js/main.5f1a1aec.js` and `static/css/main.b8d82b9b.css`. Preview artifact: all 25 files hashed under `build`; entry assets `static/js/main.2dd2d804.js` and `static/css/main.3f132d30.css`. The artifacts have different authentication modes and must not be substituted.
- Independent AI artifact review checked every file hash/size, exact membership, manifest references, HTML entrypoints, the identical licensed Inter font, and all 1,117 source hashes: no missing/extra files, zero source drift, no material finding. Staging contains no source maps; preview contains five. This review does not prove browser behavior, deployment, or human acceptance.
- CPU was explicitly returned to 007 after each check; both builds returned at 19:57:46 UTC within the four-minute grant. No test/build process remains. A before/after SHA-256 comparison of all 1,117 frontend/shared source files found zero drift for run 2, its isolated diagnostic, and both builds; inventory SHA-256 `cb4adbbd6669a17166cf9ba5e30d4f064bf392e6605a1a40d6c12d266740e885`.
- Browser/server/hosted writes: none. No UI or server lease has been granted.

The root checkout has another owner's unpublished guided-entry test change. It was not copied, edited, staged, or adopted. Reviews/Actions confirmed disjoint Risk file ownership. Shared eligibility, QuarterlyProgramTimeline, native RecordDrawer, backend/schema/data/permission rules, and unrelated pages remain outside this lease.

## Inputs and authority

Robb supplied the local prompt and `GoverNara-CIS-Risks-Concept-Parity-Handoff-20261024.zip` directly. All package documents and the meaningful approved HTML source were read; actual supplied PNG pixels were inspected. Embedded font payload was hash-verified. All 13 manifest entries match the actual extracted files; the standalone prompt equals packaged CODEX_PROMPT.txt.

| Input | SHA-256 |
| --- | --- |
| ZIP | `7fdd12e2fe7dc6b7bcf702288730b3a2d3b50fb2c55121d012b4f1fd3c5f728f` |
| Prompt, 8,934 bytes | `8a730afbaea2cfa28bc9cf2d4ab72e9132b5ec7556586c56013d7d6e739695f6` |
| Approved HTML, 188,429 bytes | `c875a7aa47e445189f74711e16dee840425078173bdfddd02e2c74bd6671984d` |
| Secondary PNG, 1,583,076 bytes | `2da32422a4995fc22c1746981117b617a0ee6c6bbdf50e2c7c581bfa9f49ad14` |

The HTML is primary page-body visual authority. The PNG is generated context, not a browser capture. No reference bytes were edited. The exact embedded font matches existing `inter-dashboard-latin.woff2`, SHA-256 `2c295d99e26dcf357d4d01bcf270fd6924b600c9a13dd8c363ef114f4c6976fa`; the existing OFL remains with the asset.

The prior explicit browser file-scheme denial remains in force. Reference interaction/rendered target comparison is BLOCKED; no rehosting/server/indirect workaround was attempted. Source and PNG inspection do not establish exact rendered parity.

## Approved exceptions

Robb answered both direct questions in this chat:

1. **"Retain all native controls inside Filters"**: preserve Category, Next review/Last reviewed date ranges, multiselects, and ascending/descending sorts within the existing Filters panel. Existing table.setFilter/table.setSort handlers remain authoritative. No new page button or business behavior.
2. **"Keep native membership; label Retired distinctly"**: retain native Closed-view membership, display `Retired (legacy)`, and support exact retired Status selection. Stored status, IDs, history, and native commands remain unchanged. Native grouped Open/In Treatment filters stay grouped; retired is a distinct filter value.

Robb answered the dense-date question: **"Keep dense layout on hold"**. The approved 23px-per-event same-date algorithm exceeds a 500px plot at 22 events and places the group partly outside it. The proposed wrapping change is NOT authorized and is not implemented. Preserve the supplied ordinary-group algorithm, retain all identities in date lists/View data, and report oversized same-date usability as an unresolved acceptance limit. No exact-parity/full-acceptance claim may include this held case.

No missing workflow button was added or approved.

## Implementation decisions

- Eligible CIS Risks use a scoped concept component and reference-derived CSS. Existing program-aware eligibility, route/client/loading guards, shell, and complete native editors remain authoritative. Non-CIS presentation remains on its existing branch.
- Cards retain native metric predicates, including days 1–30 (excluding today) for the existing upcoming metric and recorded valid/unexpired acceptance requirements. Quarter selection never redefines totals.
- Matrix uses actual assessed likelihood × impact and existing 5×5 bands. Empty cells open truthful lists; member selection opens the full native Risk. Unrated records remain in the register without the removed caption.
- Quarter events reuse native quarterlyRiskEvents. Saved reviews, treatment deadlines, and acceptance expiries remain distinct, with exact IDs and native openers.
- The old Risk `/related` query caps linked Actions at 200. The new projection reads the complete authorized `/tasks` collection and applies the verified native link rule (`task.risk_id`, source `risk.task_id`, or `risk.related_task_ids`). Invalid/foreign data and collection failures remain explicit. Native bounded APIs still fail rather than return partial collections above their limits.
- Native export remains the existing complete-row exporter. New risk, Save/Cancel, Review/Close automatic save-before-command, acceptance, evidence/history, and Action completion stay in existing native controllers.
- Actual native Risk collection has no pagination interface; no phantom pagination was added.

## Source lease

New concept JSX/CSS/component test, pure model/unit test, new integration test, narrow RiskRegister integration, this handoff. 007 additionally approved migration of existing BrawndoDemoRisks.test.jsx selectors/presentation assertions while retaining equivalent native async/focus/record/context assertions and original deadlines. RiskRegisterLinkedClose was migrated only after four actual selector failures in run 1; its complete /tasks fixture now carries the native Risk relation and its dispatcher mock chooses identity by record kind. No shared core/source expansion is implied.

Baseline SHA-256 before edits:

- RiskRegister.jsx: `5f31507ac0288a011e34b353ef197ebfca623201e991eff395fafcd73699d205`
- BrawndoDemoRisksOverview.jsx: `0cabc6d6a3a688a0242b00918f5b16476e098a64cbe7beb0a7367a46adb2ab89`
- brawndoDemoRisks.js: `b7e59c12c8ea688e8bc3b6f13f805e47c2634c6ae0c0e8bd1270b7f093b8777c`

## Source review checkpoint

Independent AI source review identified and checked corrections for Action assignee display, owner-name sorting, grouped Status semantics with distinct Retired access, current async event lists, Filters keyboard focus, and suspension during native New Risk/scale overlays. Those new regression suites passed run 1. A development-only invalid option-child warning exposed a dynamic fallback sort label; it now uses a single string expression and awaits rerun. A later independent source pass found misleading Active tab/footer wording for explicit all-status historical filters. The concept now leaves tabs unselected for view=all and uses a generic filtered-risk count; Closed/Retired regression assertions await rerun. No lifecycle or data changes were made. This is AI source review, not human peer approval or runtime acceptance.

Nine protected files were byte-compared against the agreed base: native Risk/Action drawers/panels, scoring, eligibility, shared event model, and backend/server lifecycle files are unchanged. The source checkpoint records exact hashes; unchanged source does not prove workflow behavior. The nine-row rollout ledger remains pending, with automated, browser, and persistence evidence separated. Local tests use bundled Node 24.19.0; required CI uses Node 22 and has not qualified this candidate.

## Next steps and evidence limits

Independent review confirmed the historical-filter correction in source, and its regression passed run 2. The unchanged native Review suite passed in isolation with its original deadline; retain the full campaign failure and require exact-candidate CI. Both exact CI build commands passed locally. Deliver the clean local commit/tree, complete artifact manifests, and independent reconciliation to 007. He remains sole integration/release/server/fixture owner. Wait for the exact integrated candidate, verified served staging artifact, finite browser window, and safe native fixture window before staging review. No competing server, release, push, or fixture changes are authorized.

All visual screenshots/overlays/diffs/geometry/typography, interactive reference checks, actual native browser create/edit/review/accept/close/treatment/reload journeys, Demo versus authenticated persistence, rollout matrix execution, protected-surface comparisons, full exact-candidate CI, PR, staging/provider/served revision and hosted QA remain unverified. Local builds and frontend tests do not establish these claims. Actual zoom, physical touch, and Robb's human acceptance are not claimed.
