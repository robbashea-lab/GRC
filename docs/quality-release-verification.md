# Release verification matrix

This is the bounded finish line from the requested continuation, not a new feature backlog.
`Pending` is not a pass. Automated, published-browser and real-database evidence are separate.
Synthetic clients and controlled test clocks must never change the host clock or real client data.

## Identified release

- Initial GitHub/Sites source: `6cc52ad4794fa1846923647dc42471c2c6a138b1`.
- Candidate: merged PR [#12](https://github.com/robbashea-lab/GRC/pull/12), commit `82f69722763ee63b241947f29822026d99903825`, private published version **87**. Native deployment succeeded; saved source provenance matches. Main bundle `main.3546a288.js`, SHA256 `35ca7e404e6ceb910d9669145a05c386876a9e2ea6d662c10944753ad6ca5d90`. Browser verification follows below.
- Final commit / PR / published version: pending published workflow verification.
- Site: https://iventure-grc-code-preview.mr-robbashea.chatgpt.site (preserve existing audience).
- Static Demo browser results do not verify standard authentication, backend persistence or production configuration.

## Established-client operator journeys (sequential)

At every applicable row verify required versus optional information, responsible owner,
due date, evidence needed, unresolved work and next action. Count reconciliation uses
the underlying records, not another summary. A completed Review or Action is not proof
of implemented/verified Controls. Preserve unassessed, unassigned and pending-validation work.

| Scenario | Required outcome | Brawndo CIS | Dunder ISO | Prestige SOC |
|---|---|---|---|---|
| E01 Dashboard / Program Health | Counts, drilldowns, readiness and unresolved work agree | RC pass | RC pass | RC pass |
| E02 Framework workspace | Scope/assessment/implementation/verification remain distinct; evidence and history visible | RC pass | RC pass | RC87-03; recheck pending |
| E03 Reviews | Create/edit/assign/start/complete/reopen where supported; current and completed occurrence selection | RC pass | RC pass | RC pass |
| E04 Finding → Actions | Raise/link, complete Action, retain pending validation, validate/reopen with history | RC pass | RC pass | RC pass |
| E05 Independent Findings | No Action stays visible; linking existing work preserves source | RC pass* | RC pass* | RC pass* |
| E06 Risks | Unassessed/assessed, treatment, acceptance expiry, reassessment, closure and related work | RC pass | RC87-02; recheck pending | RC pass |
| E07 Policies | Presence, owner, approval, versions and recurring Review remain distinct | RC pass | RC pass | RC pass |
| E08 Vendors | Due diligence, owner, reassessment, contract dates, termination and retained history | RC pass | RC pass | RC pass |
| E09 Evidence | Upload/link/retrieve, immutable version/history and tenant-scoped related records | RC87-01; recheck pending | RC pass | RC87-01; recheck pending |
| E10 Calendar / cadence | Due work matches registers; late and missed Reviews do not shift anchored cadence | Cadence pass; final UI recheck pending | Cadence pass; final UI recheck pending | Cadence pass; final UI recheck pending |
| E11 Contacts / roles | Responsible contact versus authenticated assignee; departure/reassignment and denied actions | Partial** | Partial** | Partial** |
| E12 Systems / scope / settings | Valid scope edits, required fields and applicable modules; no cross-client leakage | RC87-01 isolation failure | RC pass | RC87-01 isolation failure |
| E13 AI governance where enabled | Linked authoritative Reviews/Risks/Findings/Evidence and Program Health | RC87-01 isolation failure | RC pass | RC87-04; recheck pending |
| E14 Drawer interaction | Draft retention, Save & next, validation, failed save/retry, keyboard/focus | RC pass; final focus recheck pending | RC pass; final focus recheck pending | RC pass; final focus recheck pending |
| E15 Presentation | Light/dark; desktop/tablet; readable status and no obstructed controls | RC pass | RC pass | RC pass |
| E16 Persistence / isolation | Refresh/reopen/session behavior truthfully described; tenant and role denial | RC87-01; partial** | Partial** | RC87-01; partial** |

RC means identified published version 87, not the corrected final release. `*` Independent Findings and new linked corrective Actions were exercised, including reopening and two validation decisions. The existing Finding drawer has no existing-Action picker; no unsupported relinking UI is claimed. `**` Contact/account distinction and eligibility were exercised in Demo. Real authenticated browser role, revocation and cross-session checks are blocked by missing staging/accounts; server authorization and persistent-database recovery have separate automated evidence. Demo contexts are session-local and disposed after each scenario.

## New-client simulation (sequential CIS → SOC → ISO)

Create each synthetic client through the supported command/API. Advance only a controlled
test clock. Preserve commands, checkpoints and unexpected-result evidence. Direct insertion
of successful historical records is not simulation evidence.

| Scenario | CIS IG1 only | SOC 2 scoped categories | ISO 27001 |
|---|---|---|---|
| N01 Onboarding exact scope, required/optional, owners and missing information | RC pass | RC pass (default Security) | RC pass |
| N02 Framework semantics: IG1 vs optional; SOC three guidance tiers; ISO ISMS/SoA/Annex A/audit distinction | RC pass | Guidance pass; RC87-03 scope recheck pending | RC pass |
| N03 36 months: early/on-time/late/missed/catch-up, month-end/leap/year boundaries | API + Demo pass | API + Demo pass | API + Demo pass |
| N04 Owner changes/departure, policy revisions, vendor termination, risk expiry | API + Demo command pass | API + Demo command pass | API + Demo command pass |
| N05 Findings without Actions, pending validation, reopening, historical evidence | API + Demo command pass; E05 browser | API + Demo command pass; E05 browser | API + Demo command pass; E05 browser |
| N06 Failed dependencies/writes, same-intent retry, stale edits and concurrency | Focused-suite pass* | Focused-suite pass* | Focused-suite pass* |
| N07 Scope/configuration changes, refresh/session persistence and isolation | RC reload + command scope pass** | RC87-03 category recheck pending** | RC reload + command scope pass** |
| N08 Periodic summary/list/calendar reconciliation; no false readiness | Three RC checkpoints pass | Three RC checkpoints pass | Three RC checkpoints pass |
| N09 Published browser checkpoints and synthetic-only cleanup | Pass; contexts disposed | Pass; contexts disposed | Pass; contexts disposed |

`*` Duplicate same-intent commands occur in each timeline. Fault injection/stale/concurrent cases are separately exercised through `test_create_requests.py`, `test_review_recovery.py`, `test_onboarding_recovery.py`, `test_engineering_reliability.py`, Demo `commandRequests`, `onboardingReplayContract` and `governanceLifecycleContract`. The real-Mongo recovery runner tests database reconnect replay; it is not a browser-login or full server-restart test. `**` Demo same-session refresh is verified; closing the isolated context discards Demo edits by design. Real authenticated cross-session verification remains blocked as described above. Final command exports explicitly include account departure (December 2028), Finding reopening (January 2029) and a second independent validation (December 2029). The original decision, completed Action and occurrence snapshots remain unchanged. Finding-without-Action is in the backend timelines and published E05; the Demo timeline does not claim that separate event.

## Automated and infrastructure evidence

| Check | Evidence / outcome |
|---|---|
| Initial backend baseline | 458 passed, 579 subtests; eight existing FastAPI lifecycle warnings |
| Initial frontend baseline | 161/165 suites, 917/924 tests passed; seven investigated failures in population assumptions, seed cadence and compressed-history comparisons |
| Review command recovery | Focused API tests cover missing/changed identity, audit failure, lost task acknowledgement, concurrency, authorization and history |
| Onboarding recovery | Focused API and Demo tests cover partial writes, uncertain completion, immutable snapshots, concurrency and denied replay |
| Real MongoDB recovery and lifecycle | MongoDB 8.0.28, loopback-only disposable databases: `backend/scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27087 --include-program-lifecycle`; final 47 tests passed (86.309 seconds), including reconnect replay, alias migration/interleaving/rollback, shortcut authorization/input validation, immutable retry audits and three-year CIS/SOC/ISO commands |
| MongoDB package verification | Official archive SHA256 `a6573419fc1d8767b7a86911c4a1b832fa408d4b8bd32d281f049b87a30073cf`; no service/global installation; synthetic database per check removed afterward |
| Shared contracts | `shared/contracts/`: capabilities, governance lifecycle; both backend and Demo execute the same cases |
| Combined regression / builds | Final ordinary frontend: 176 suites / 984 tests / one snapshot passed (271.835 seconds); separate default-five-year: three passed (265.359 seconds). Final standard build passed. Preview build runs from the merged candidate in the publication workflow |
| Final combined backend | `python -m pytest -c backend/pytest.ini -q backend/tests`: 534 passed, 671 subtests passed, eight existing FastAPI lifecycle warnings (188.88 seconds) |
| Sequential backend clock isolation | Three-year then ten-year suites with `-n0`: four tests plus three subtests passed (144.37 seconds); ten-year report records 510 completions, 115 late, 407 Evidence records, 48 validated Findings/completed Actions, six cross-client denials and no reported cadence/history/orphan discrepancy |
| Ten-year Demo lifecycle | Seven tests passed (1,034.788 seconds): 1,405 completions including 298 late, 210 validations, 214 completed Actions, 1,168 uploads; 1,405 occurrences and 317 assessment snapshots retained exactly; no reported unexpected rejection, reconciliation discrepancy, orphan or tenant leak |
| Ten-year storage limitation | The characterization uses unlimited test storage. It crossed its diagnostic 5,242,880-character budget on 2030-09-23 and ended at 10,978,246 characters; compaction evicted 69 bytes of other-client file content while retaining metadata. This is not a browser-capacity pass. The bounded three-year snapshots require actual published-browser checks |
| Independent diff review | Agent cross-reviews covered frontend controllers/readiness/navigation, onboarding/alias/migration boundaries, and Review command authority/recovery. Reproduced actor-ID collision, assignment bypass, malformed shortcut input, mutable retry-audit identity and stale migration receipt; smallest fixes plus red-green regressions integrated. Final combined backend and Mongo reruns passed. This is not external independent security assurance |
| Final visual-branch follow-ups | Compatible `fce1dbd`/`a2dd220` fixes integrated: omitted ISO history on save, scoped readiness explanations, dark primary actions and keyboard focus return. New regressions reproduced the defects before correction. Post-port cold run: 13 suites, 122 tests, one snapshot passed (31.699 seconds); standard production build passed with the existing large-bundle advisory. Earlier full-suite results above precede this narrow port |
| Production data migration | Not attempted; no representative production dataset supplied. Fixture dry-run/recovery evidence is not production validation |
| Corrected-release ordinary frontend | Cold run: 182 suites / 1,012 tests / one snapshot passed (249.720 seconds), excluding only separately executed `frameworkFiveYear` and `brawndoTenYear`. Standard production build passed (`main.b8e238d4.js`, 545.93 kB gzip); existing large-bundle advisory remains. RegisterDrawers' Radix title warning reproduced on clean candidate `82f6972` (five tests pass): its plain-h2 SheetTitle mock omits Radix title context while mounting real DialogContent. Production uses the proper Radix Title primitive; unmocked Sheet/Review checks pass 14 tests without warning. No suppression or application patch applied |
| Expanded per-framework 36-month commands | Sequential backend + Demo CIS, then SOC, then ISO: all six focused runs passed. Backend times 7.533 / 3.261 / 7.733 seconds; Demo 34.899 / 16.729 / 38.775 seconds. Exports under `work/qa-final-command-lifecycle/{framework}` retain 154 / 68 / 86 occurrences, two validation decisions and an open unassigned departure handoff Action. Persisted file payloads: 65,520 UTF-16 bytes each, below the actual 64 KiB aggregate cap |
| Updated default-five-year regression | The same modified Demo test was rerun without the three-year override, sequential CIS / SOC / ISO: all three passed (80.874 / 21.652 / 54.531 seconds), retaining 248 / 102 / 132 occurrences. Separate exports: `work/qa-final-command-lifecycle-five-year/{framework}`. Same first-decision/history and actual 64 KiB storage assertions retained |
| Final application diff review | Independent agent review found no concrete blocker across storage, managed Risk fields/drafts, SOC scope guards/history, canonical AI capabilities, focus and attribution; no dependency/lockfile/config changes. This is not external security assurance |
| Corrected-release real MongoDB | Loopback MongoDB 8.0.28 rerun: 47 tests passed (93.668 seconds), now including each framework's account departure and reopened-Finding second validation in the three-year API sequence. Only disposable databases were used and removed by the runner |
| Last scoped visual-branch reconciliation | Reviewed through `7df4276`: `d05d62c` visible-heading fallback applied with a red-green regression (three suites / 14 tests passed). `7df4276` recurrence fix is superseded by the already integrated canonical-anchor correction; no narrower reset exception imported. `bf84c3c` parent timeout was not imported without a reproduced defect; existing unmount/Next focus safeguards remain. Main remained `82f6972`; no unrelated branch redesign imported |

## Release gates

### Candidate 87 observations (verification in progress)

- Published bundle identity matched the saved candidate SHA/hash in a fresh browser context.
- Brawndo: E01 counts/drilldown; assessment draft/save/history/Save & next/focus/reload; Review failure/retry and Finding → Action → validation; independent Finding reopening; Risk assessment/treatment/acceptance/Review/closure; Policy versions; Vendor offboarding all exercised successfully.
- **RC87-01 — Demo file retention:** uploading a small Brawndo Evidence file caused previously persisted Dunder file content to become temporary; a later AI Evidence upload affected a Prestige payload. E09/E11/E12/E13 isolation assertions correctly failed even though their individual business steps passed. Shared storage correction and published recheck are required. Synthetic isolated context only; no persistent backend/client data was touched.
- Harness-only corrections: Windows stdin CR termination, shared catalog path, and completion of presentation checks before the final failure gate. These are not application defects or evidence of an application pass.
- Dunder: dashboard/ISO assessment/Review chain, Policy, Vendor, Evidence, Contacts, Systems and presentation checks exercised. A duplicate Finding-link selector initially blocked E06/E05 and the dependent E13; the narrowed primary-record selector allowed E05/E13 to pass on retry.
- **RC87-02 — Dunder Risk Review:** after assessment, treatment and acceptance, the visible Review Risk action did not open the authoritative Review. The non-pilot shortcut sent managed decision fields through a generic patch. The local correction reuses the guarded save path without weakening validation, preserves drafts/acceptance controls and aborts navigation on stale writes. Red-green regressions and five suites / 23 tests passed; published recheck pending.
- **RC87-03 — SOC scope editor:** component regression and published Prestige inspection confirmed the existing scope/category/period editor was hidden from configured SOC workspaces. The local correction restores that editor with its permission/history guards (three suites / 83 tests passed); published scope-change recheck pending.
- Prestige: E01 reconciled 38 applicable criteria, 27 implemented, 36 assessed and two unassessed; assessment/Review/Finding reopening, Risk, Policy and Vendor paths passed. The shared file-retention isolation defect repeated. Light/dark and desktop/tablet screenshots were inspected; no document overflow was detected.
- **RC87-04 — Prestige AI creation:** the published form sent Brawndo-only pilot fields and failed with `Unknown or read-only AI fields`. The local correction separates presentation from supported capability, preserves API field/approval protections, and passes four cold suites / 18 tests. Independent code review found no blocker; published recheck pending.
- **RC87-05 — product attribution:** new-client screenshots showed `Prestige Worldwide` above the correctly selected client. The existing brand component establishes this as product attribution. The smallest correction adds `By`, retaining the selected-client label and existing appearance; arbitrary-client/platform regressions passed.
- New CIS client: published UI onboarding and framework edit/history passed with exactly 56 unassessed safeguards, 17 unanswered-policy records and unassigned/undated Reviews. Candidate-source 36-month API (7.898 seconds) and Demo (31.836 seconds) command runs passed; all three published checkpoints passed with 51/107/154 historical occurrences, exact dashboard/work counts and December Calendar identities.
- New SOC client: published onboarding/three-tier guidance passed with 33 default Security criteria. Explicit category editing is blocked by RC87-03, not claimed as passed. Candidate-source API (2.239 seconds) and Demo (11.846 seconds) runs passed; all three published checkpoints passed with 25/51/68 occurrences and exact source reconciliation.
- New ISO client: published onboarding passed with 30 ISMS clauses, 93 Annex A reference controls and all 93 necessity decisions still undetermined. API (6.341 seconds) and Demo (29.450 seconds) runs passed; three published checkpoints passed with 31/63/86 occurrences. SoA exclusion then inclusion changed the applicable denominator 122→123 without claiming implementation; 122 items remain unassessed at the final checkpoint.
- Verification artifacts are local under `work/qa-rc87-{brawndo-02,brawndo-presentation,dunder,dunder-retry,prestige,new-cis,new-soc,new-iso}`. Command-generated fixture/report directories are `work/qa-rc87-lifecycle/{cis-ig1,soc-2,iso-27001}`. Each browser result records candidate commit/version and each checkpoint records the fixture SHA256. UI onboarding and command-simulation clients are separate disposable contexts; all simulated history comes from application commands.
- Authenticated browser roles remain blocked by the absence of a disposable authenticated staging URL/test personas. Existing preview has standard sign-in disabled; Demo Explorer and backend negative tests are reported separately.

1. Complete implementation and combined diff review; fetch/reconcile current main; required checks/approvals.
2. Commit, push, PR, merge; publish and identify candidate SHA/version.
3. Execute E01–E16 then N01–N09 sequentially against the identified candidate; record defects without speculative scope growth.
4. Integrate demonstrated fixes, regressions and cross-framework rechecks; merge and republish once.
5. Verify final version and all three established clients, preserve evidence, remove only disposable synthetic records, finalize.

## Relevant engineering references

- [MongoDB write atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/): single-document conditional writes are atomic; a multi-record workflow needs explicit recovery.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): recheck authorization on every request, including receipt replay.
- [MongoDB package integrity](https://www.mongodb.com/docs/v7.0/tutorial/verify-mongodb-packages/): compare the downloaded artifact against the official SHA256 file before execution.
- [Playwright clock](https://playwright.dev/docs/clock): bundled Playwright 1.62.1 uses `page.clock.setFixedTime` for isolated checkpoint dates without changing the host clock or stopping UI timers.
- [Playwright best practices](https://playwright.dev/docs/best-practices): isolated browser contexts and observable user-facing actions; the published QA scripts keep credentials on stdin and restrict network requests to the identified Site origin.
