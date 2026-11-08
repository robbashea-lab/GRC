# Enhanced Portfolio candidate — 2026-10-20

Status: local candidate, not release-ready or user-accepted. Robb resolved the monitoring-policy question at 21:25 UTC: omit Gone quiet and scheduling-gap indicators for now. Isolated branch publication and one unchanged CI dispatch are authorized by Agent 007 after local qualification; merge, deployment, account changes, onboarding changes and signed-in rollout remain outside this lease.

## Authority and ownership

Robb's 20:02 UTC authorization to begin was relayed to Agent 420 (`01a15ad5-ebb9-7cc0-8c94-4b9880bded46`). The assigned Desktop enhanced HTML and enhancement prompt are the current visual/scope authority. Earlier package `START_HERE.txt`, `IMPLEMENTATION.md`, `ACCEPTANCE.md`, and original HTML were inspected. Their older global rollout does not override the enhanced Explore/canonical-Brawndo pilot. Native data, authorization, operations, and history truth remain authoritative.

Agent 007 (`01a14053-f52f-7d71-aff9-6c8359f81e05`) confirmed the isolated Portfolio lane, proportionate local tests/builds, and own browser tab. It separately acknowledged the canonical Demo monitoring projection, shared history hook export, and default-off stacked-history presentation option. Agent 007 retains sole integration/release ownership. Shared checkouts, user staging tabs, and their unsaved drafts were untouched.

Base: published `da3c54de6e5b132215aa0fde3191f9eb75d592ce`, tree `f5e23dfd1daf8e5fe127cb9fbb257f820ee5b063`. The clean integration checkout's local `182e197d1aaeb0497fb4c4ec4e0dba8c1417f3d1` was independently verified to have that same tree. Work is isolated in `do-x20/work/portfolio-enhancement`; do not substitute the older original `work/GRC` checkout.

## Implementation contract

- `ClientDirectory` branches only under trusted Preview/Explore mode, an internal Demo actor, exact `/clients` route, active authorized canonical Brawndo selection, matching loaded Org identity, and no loading/error mismatch. Identity/role/mode/grant changes remount the enhanced tree and discard responses. The existing signed-in Portfolio remains its original branch.
- `EnhancedPortfolio` combines existing batched reporting and native directory work populations; it checks operational coverage before rendering. Search, identity-based assignment, framework and KPI filters feed the same Clients/By lead populations. Missing programs retain native work access. Native record URLs use immutable record/client IDs.
- `EnhancedPortfolioHistory` reuses the existing identity-checked history reader, calendar/window comparison, scope notes, chart and forecast helpers. Four fixed native range reads support independent 1/3/6/12-month comparisons. Default 3 months follows the enhanced HTML. No history positions, completion events, IDs, denominators, or saves are synthesized.
- Existing native forecast eligibility remains unchanged: genuine same-scope daily positions, at least three distinct UTC dates spanning 60 days in the trailing 90 days, freshness/current reconciliation and positive net implementation progress. The enhanced fixture's looser forecast implementation is not transplanted.
- Shared chart `stackedHistory=false` adds only presentation. The enhanced caller opts in; existing callers retain their default. Unknown continuity remains a gap. The option does not enable scenario eligibility or alter provenance.
- Normal native dialog geometry is retained under the prompt's geometry exception. Native shell, branding, authentication, other module layouts and workflows remain intact.

## Additive native Demo projection

Only authorized active `demo_brawndo` in a trusted Demo actor receives `client.monitoring` from the read-only directory projection:

```
{
  onboarding: 'complete' | 'in_progress' | 'unknown',
  latest_completion: null | {
    kind, id, title, at, occurrence_id?, type, label
  },
  recurring_scheduled: number,
  completion_history_coverage: 'partial'
}
```

Completion uses retained Review occurrence history and currently completed native Actions; invalid/future timestamps and foreign-client data are excluded. A reopened Action is not a current completion. Recurrence uses native active definitions, valid dates and recurrence rules. No monitoring cadence, expectation or complete coverage is inferred. Existing directory consumers tolerate additive fields; signed-in/backend consumers are unchanged.

Unknown onboarding cannot prove “not started.” The aggregate is unavailable when any filtered client's onboarding state is unknown. Gone quiet and scheduling-gap indicators are omitted entirely by Robb's decision. No cadence, gap classification, counter, filter or unavailable placeholder remains. Actual latest retained completion and scheduled recurring-review counts appear as facts in native work previews; partial completion history is labeled. Other attention reasons and native scheduling workflows remain unchanged.

## Resolved focused question

Async question `call_2800d65cc30b41b0aaab17abf1bce403` was resolved by Robb's direct response `Sentinel_1443751f97048191b817e19644da70ea`, relayed at 21:25 UTC: omit this feature from the process and return to it later. Implementation removes the indicator and rejects stale saved KPI selections. Native completions, schedules, permissions, records and unrelated attention reasons are preserved. No further policy answer is needed for this scope.

## Verification and evidence boundary

- First focused campaign: 9 suites / 121 tests passed. Subsequent AI-review fixes were then made; this is historical evidence only.
- Revised focused campaign: 9 suites / 123 tests passed, including existing Portfolio/history/forecast/navigation and new scoped gating, native monitoring, filters, work navigation, missing-program behavior and default-off/gapped stacked history.
- A later operational-coverage review finding added a missing/malformed response guard and targeted regression cases. Record its affected-test result and final build below before handoff; the earlier 123-test receipt alone does not qualify the final candidate.
- An intermediate production preview build passed (`main.a68e9a61.js`, `main.6be46867.css`); subsequent changes make that historical, not final-tree proof.
- Own local browser: fresh native Explore entry; Brawndo row 32/56 = 57.1%, assessed 49/56; native Action drill-in `demo_brawndo_cis_action_14.1`, existing editable status/evidence/activity/Save controls and clean close; search/KPI totals agree with By lead; history table exposes historical vectors/timestamps and typed illustrative provenance; all-status history preserves unknown gaps.
- Background local developer server: `127.0.0.1:4219`. Reference copy server: `127.0.0.1:4210`. These are local developer previews, not hosted deployment receipts. Port 4211 was already occupied and was left untouched.
- Paired local screenshots are in the chat's `outputs/portfolio-local-evidence`. Counts/history differ from the standalone fixtures because actual native data is used. Visual parity is not accepted.
- A separate 390px embedded-frame harness reached login, but the browser tool could not activate its child-frame control. This is not a candidate mobile pass. Top-level 390px, true 200% zoom, dark/mobile modal/table coverage and full native manual/guided-save/permission/fault journeys remain unverified.
- AI reviewer `/root/portfolio_contract_review` performed read-only contract and implementation review, then implemented only the explicitly delegated monitoring projection/tests and helper tests. Separate read-only review passes identified permission-cache, no-program access, forecast presentation, hidden tooltip-anchor and operational-coverage issues. This is AI review, not human peer approval.

## Next step and rollback

Complete missing rendered/native gates and bind final source/tests/build/CI to one exact candidate before Agent 007 considers a release. The reported previous staging baseline is not evidence that this candidate is deployed. No deployment lease is reserved.

Gate-only rollback: set `ENHANCED_PORTFOLIO_ENABLED=false`; existing native Portfolio resumes without changing records, history, grants or other pilots. Remove the additive read-only projection only if separately needed; no migration or data rollback exists.

## Latest local checkpoint

- Affected operational-response regressions: `EnhancedPortfolio.test.jsx`, 7/7 passed after the guard, including three missing/malformed coverage cases. Existing eight unaffected suites retain their prior passing result; no claim of a second full nine-suite campaign after that guard.
- Latest production preview compilation succeeded: `main.1bab6a60.js`, `main.6245a0ae.css`. The emitted JS was checked to include the final operational-response guard. Source behavior was unchanged afterward; documentation/tests were checkpointed. Build output retains the existing bundle-size advisory.
- JS SHA256: `17f4813146539dfb1e28b9cc3da0425829733bd35a33cd9e8f021af9f9d08c83`.
- CSS SHA256: `10fda657e077820e494cf9cc8182acd282b6247825f07cb601e4bbf92c9ba63f`.
- `git diff --check` passed after EOF cleanup. Required remote CI, standard authenticated production compilation, final integrated build/browser, hosted deployment and human acceptance remain outstanding.
- Parent status-message attempt returned `invalid turn/start params: AbsolutePathBuf deserialized without a base path`. The relay explicitly retrieved/routed the actual focused question and instructed no retry was needed; no approval answer or delivery success was inferred from that failure.

## Subsequent native/browser milestone

The isolated local native CIS Save journey committed Safeguard 1.1 from its original Not Implemented status to Implemented: workspace33/56=58.9%, Portfolio33/56=58.9%, preview33/56 and table/typed Saved demo activity agreed. Selecting the original status then canceling/discarding the unsaved draft preserved33/56. A subsequent native Save restored Not Implemented, workspace/Dashboard/Portfolio32/56=57.1%, original narrative and independent Gap identified verification. Browser reload retained the restored state. The two genuine local status-save audit positions remain; they were not backdated, erased or promoted to historical coverage. Applicability was untouched. This proves local Demo behavior, not hosted persistence or the separate guided final-save campaign.

The dark desktop preview was inspected. Computed styles exposed shared native portal rules overriding reference font/background/padding. A scoped high-specificity correction now binds only `.ep-history`: measured background rgb(13,23,41), text rgb(238,243,251), GoverNara Portfolio Inter14px, chart#3fb37f, body padding18px22px26px. Native normal dialog geometry remains760px. Earlier build hashes above precede this CSS correction; a refreshed candidate build is required before referring to them as final-code evidence.

## Navigation-context correction

The enhanced page now reuses the existing identity-scoped `usePortfolioView` preference mechanism instead of a second local filter store. Common search/assignment/framework state retains the established native behavior; enhanced sort/view/KPI choices remain in the same actor entry across record navigation. Existing helper implementation and signed-in schema were not changed. Empty Assigned to me results have a distinct Show all clients recovery. Enhanced page plus unchanged preference-helper regression suites passed13 tests after these corrections.

The exact2119cbb source preview build passed `main.1bab6a60.js` / `main.0f364d9f.css`. Subsequent navigation-context changes require a refreshed build before final candidate qualification. Browser Escape restored focus to the Brawndo history opener. Keyboard Home/End inspected the earliest typed scenario and latest genuine restored saved position; the dark last-point tooltip stayed inside the modal and showed32/56 with every status share.

## Post-decision qualification

The clean2911941 candidate passed all nine bounded suites /128 tests and both preview (`main.c01a12bd.js`, `main.0f364d9f.css`) and standard authentication (`main.2dd441f1.js`, `main.559e60bf.css`) production compilations. These qualify that historical candidate, before the monitoring-feature omission.

After the explicit omission, all nine suites /129 tests passed, including removal of the card, recovery from its retained preference and preservation of completion/schedule facts. No push or CI dispatch was made for the superseded2911941 candidate. Build and remote receipts for the next frozen commit belong in the output checkpoint so recording CI does not itself change the qualified source head.
