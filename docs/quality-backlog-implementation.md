# Code-quality backlog implementation

## Baseline and workflow

- Initial remote main: `6cc52ad4794fa1846923647dc42471c2c6a138b1` (2026-10-01).
- Working branch: `codex/quality-backlog-implementation`, isolated worktree based on remote main.
- GitHub PR inventory: no open PRs at initial inspection. Prior PRs 1–11 were merged.
- Initial `origin/claude/cross-client-visual-consistency` had three unmerged commits (`f4db298`, `13aec7f`, `6623800`); it later advanced through `a2dd220`. Reviewed compatible presentations and follow-ups are integrated, not a wholesale branch merge.
- Existing worktrees and uncommitted changes are outside this task's worktree.
- Continuation authorizes merge after repository checks/approvals and publishing the existing Demo preview. Production rollout/destructive real-data operations remain out of scope.

## Initial revalidation (before implementation)

| Backlog area | Current evidence | Status |
|---|---|---|
| Framework capabilities | Backend/Demo still gate assessment criteria, verification and guidance by seeded client ID | Still present |
| Review Finding/Action replay | UI now retains request_id within open form; backend request_id remains optional and multi-step command lacks durable receipt | Partially resolved |
| Cadence on late completion | Current backend/Demo tests cover scheduled cadence rather than completion date | Already resolved; retain regression coverage |
| Canonical recurrence | Onboarding helper and preview workflow local date arithmetic still exist | Still present |
| Immutable Review history | Snapshot model exists; verify edits to definition preserve it | Under verification |
| Onboarding | Deterministic child IDs and config lease exist; retry precondition can reject partial completion | Partially resolved |
| Backend structure | server.py retains unused legacy onboarding and workflow orchestration | Still present |
| Frontend structure | RecordDrawer remains large; Action Items controller duplicated | Still present |
| Shared catalogs | Backend reaches into frontend; onboarding JSON duplicated | Still present |
| Offline test classification | Runner allowlist can omit new offline test files | Still present |
| Relationship ownership | Multiple historical relationship forms remain | Still present; preserve compatibility |
| Canonical fields/aliases | Legacy aliases and lifecycle vocabularies coexist | Still present; inventory/migration required |

## Implementation checklist

- [x] Record complete initial backend/frontend baseline and investigate failures.
- [x] Framework capabilities/configured workspaces; arbitrary-tenant authorization and parity tests.
- [x] Review Finding/Action durable replay; same caller request across retries; failure injection.
- [x] Canonical recurrence at affected scheduling entry points; cadence/history regressions.
- [x] Onboarding resumable deterministic commands, concurrent submissions and failure recovery; combined and persistent-database reruns passed.
- [x] Remove verified unused onboarding implementation.
- [x] Executable backend/Demo contract matrix: recurrence, stale writes, replay, tenant scope, capabilities, projections, persistence failure.
- [x] Coherent backend workflow extraction.
- [x] Domain drawer panels and shared register controller; focused behavior tests pass, published visual verification pending.
- [x] One framework/onboarding catalog source consumed by both builds; backend packaging checks and standard frontend build pass.
- [x] Explicit offline/environment test classification and unclassified-test gate.
- [x] Document authoritative relationship ownership; invariant checks and dry-run repair report.
- [x] Canonical writable fields/lifecycle values; contradiction rejection and compatible legacy reads.
- [x] Safe migration tooling with fixtures, dry-run and recovery provisions; no shared data mutation.
- [x] Backend/frontend regression suites and production/preview builds; exact counts and limits in release matrix.
- [ ] Browser QA across Brawndo, Prestige, Dunder, newly created client; themes/responsive/keyboard/retry/isolation.
- [x] Fetch main again, reconcile changes, rerun affected checks (main remains `6cc52ad`; visual follow-ups through `a2dd220` integrated).
- [x] Candidate diff review, coherent commits, branch push, PR #12 merged, private Demo version 87 published from `82f6972`. Final release remains gated by published workflow matrix.

## Verification log

- Initial focused onboarding baseline: 41 passed, 21 subtests; eight FastAPI lifecycle deprecation warnings.
- Full initial backend baseline: 458 passed, 579 subtests, eight existing FastAPI lifecycle warnings (267.87 seconds).
- Full frontend baseline runs in a separate unchanged checkout at the initial main commit.
- Focused untouched frontend adapter baseline: three stale assertions expected two clients; current main has three. Updated checks retain historical two-client fixtures while excluding new Dunder rows from the legacy comparison, and reconcile current portfolio totals against all current client rows. 17 focused Demo contract/adapter tests pass.
- First combined backend run: 504 passed, 630 subtests passed, three failures. Two were distinct-occurrence request identity and a stale simulation snapshot after starting an ISO Review; one was the registry detecting new files while another slice was being added. Correct fixtures/registry, then rerun the frozen combined tree.
- Actual MongoDB 8.0.28 loopback recovery and three-year CIS/SOC/ISO commands: 37 tests passed (120.155 seconds); every case uses a fresh disposable database and production indexes, including connection replacement, migration recovery/rollback, reference validation, and standalone Finding/Action audit repair.
- Standard production build with `CI=true`: passed; existing bundle-size notice remains. PlatformAdmin hook warning was corrected with scope-change regression coverage, not suppressed.
- Release and scenario evidence: [quality-release-verification.md](quality-release-verification.md). No candidate published yet.
- Complete pristine frontend baseline: 161/165 suites, 917/924 tests passed (1,778.04 seconds). Seven failures: three stale adapter population assertions, one seeded cadence boundary, one portfolio population assertion, and two comparisons against compressed rather than restored occurrence history. The assertions were retained or corrected to the intended population/representation, not disabled.
- Current ordinary frontend rerun: 171 suites / 958 tests passed (387.245 seconds), excluding only the separate default-five-year and ten-year simulations. Latest default-five-year run: three passed. Final ten-year and post-reconciliation regression evidence pending.
- Full backend before fixture corrections: 523 passed, 652 subtests, one ten-year failure. Reproduction identified a leaked simulated clock and reused request identity for different catch-up occurrences. Scoped clocks and occurrence-specific intent IDs corrected the fixtures without lowering lifecycle thresholds. Final full backend: 524 passed, 652 subtests passed (253.39 seconds). Sequential three-year then ten-year with `-n0`: four tests plus three subtests passed (144.37 seconds), including 510 ten-year completions.
- Re-fetch: remote main remains `6cc52ad`; cross-client branch advanced to `d54195b`. Reconcile its reviewed dashboard/consolidated Findings routing/readiness/keyboard/theme changes with this branch's capabilities, recovery and shared controllers. Its storage-history test correction and Demo-only Dunder migration guard are ported with focused 26-test evidence.
- Completed visual-branch disposition: shared framework cards/all-Demo dashboards, consolidated Findings navigation/high-critical reconciliation, dark primary tokens, keyboard ISO tabs, readiness explanations and empty denominators are retained. Capability metadata supersedes the new SOC client's seeded-ID gate. Combined UI port verification: 19 suites / 182 tests / one retained snapshot; standard build passed. A reproduced ISO donut mismatch now reuses the same applicability summary as its percentage.
- Independent cross-review found and corrected command actor-ID collisions, shortcut assignment-rule bypass, malformed Action input, mutable retry-audit identity and stale migration-receipt state. New regression tests first reproduced each issue; final combined and persistent-database reruns remain a release gate.
- Ten-year Demo run: seven tests passed (1,034.788 seconds). Unlimited-storage characterization reached 1,405 completions and retained history exactly, but exceeded the diagnostic storage budget and compacted some file payloads. It is not a browser-storage capacity claim; see the release matrix for exact limits.
- Final candidate gates: ordinary frontend 176 suites / 984 tests / one snapshot (271.835 seconds); backend 534 tests / 671 subtests (188.88 seconds); actual Mongo 47 tests (86.309 seconds); standard build passed. Separate default-five-year three tests passed. No dependency/lockfile changes. Preview build and published scenarios remain separate gates.

## Release and full program continuation

Operator clarity is part of each workflow checkpoint: required/optional, owner, due date, evidence needed, unresolved state and next action. Reconcile summaries with underlying lists; keep unassessed, pending-validation and unassigned work visible. Activity completion must not imply control implementation/verification. Add UI copy/steps only for observed ambiguity. One coordinated integration/publish sequence; the agreed coverage matrix is the finish line.

- [x] Review combined backlog implementation, reconcile main, pass checks, merge PR #12.
- [x] Publish Demo release candidate 87; verify deployed `82f6972` and exact bundle hash.
- [ ] Sequential browser operator journeys: Brawndo CIS, Dunder ISO, Prestige SOC; record workflow coverage, themes/widths, keyboard, isolation, persistence.
- [ ] New CIS IG1-only client: accurate onboarding plus 36 months via real commands and controlled test clock.
- [ ] New SOC 2 client: scoped categories/tiered guidance plus 36 months.
- [ ] New ISO 27001 client: ISMS/SoA/audit/management review plus 36 months.
- [ ] Correct demonstrated failures with regression tests; recheck affected frameworks.
- [ ] Final diff/regressions/reconciliation, merge fixes, republish and verify all three established clients.
- [ ] Remove only disposable synthetic records; preserve evidence and established clients.

## Data validation gate

No representative production database has been provided. Migration/invariant tooling will be verified with isolated fixtures. Any production dry-run, backup validation, or apply operation remains a separate explicitly targeted operation.
