# Release verification matrix

This is the bounded finish line from the requested continuation, not a new feature backlog.
`Pending` is not a pass. Automated, published-browser and real-database evidence are separate.
Synthetic clients and controlled test clocks must never change the host clock or real client data.

## Identified release

- Initial GitHub/Sites source: `6cc52ad4794fa1846923647dc42471c2c6a138b1`.
- Candidate: merged PR [#12](https://github.com/robbashea-lab/GRC/pull/12), commit `82f69722763ee63b241947f29822026d99903825`, private published version **87**. Native deployment succeeded; saved source provenance matches. Main bundle `main.3546a288.js`, SHA256 `35ca7e404e6ceb910d9669145a05c386876a9e2ea6d662c10944753ad6ca5d90`. Browser verification follows below.
- Corrected application release: merged PR [#14](https://github.com/robbashea-lab/GRC/pull/14), source commit `1103be245404ca1dc5594e74804c7a6cb5d94fa6`, private version **88**. Native deployment succeeded and saved source provenance matches. Main bundle `main.3911441a.js`, SHA256 `55da7d16af6046eccbf8d9fc08c94f191a37fc5cdaff9225abcc35d9ee701303`. Corrected-release Demo browser rechecks are complete within the explicit scope and limitations below.
- Site: https://iventure-grc-code-preview.mr-robbashea.chatgpt.site (preserve existing audience).
- Static Demo browser results do not verify standard authentication, backend persistence or production configuration.
- Remaining production prerequisites include authenticated staging/browser personas, a representative production migration dry-run/backup validation, and the targeted dependency advisory/reachability review in [dependency-workflow.md](dependency-workflow.md). The current dependency inventory is not a clean security scan. None of these are replaced by a successful static Demo publication.
- Machine-readable evidence and artifact hashes: [release-88-verification.json](evidence/release-88-verification.json). The closing verification-only change contains documentation/evidence and one QA assertion correction, not deployed application changes. Version 88 remains the identified application release; a later main documentation/QA commit is not a different deployed build.

## Established-client operator journeys (sequential)

At every applicable row verify required versus optional information, responsible owner,
due date, evidence needed, unresolved work and next action. Count reconciliation uses
the underlying records, not another summary. A completed Review or Action is not proof
of implemented/verified Controls. Preserve unassessed, unassigned and pending-validation work.

| Scenario | Required outcome | Brawndo CIS | Dunder ISO | Prestige SOC |
|---|---|---|---|---|
| E01 Dashboard / Program Health | Counts, drilldowns, readiness and unresolved work agree | v88 pass | v88 pass | v88 pass |
| E02 Framework workspace | Scope/assessment/implementation/verification remain distinct; evidence and history visible | v88 pass | v88 pass | v88 pass; new-client scope/history also passed |
| E03 Reviews | Create/edit/assign/start/complete/reopen where supported; current and completed occurrence selection | v88 pass | v88 pass | v88 pass |
| E04 Finding → Actions | Raise/link, complete Action, retain pending validation, validate/reopen with history | v88 pass | v88 pass | v88 pass |
| E05 Independent Findings | No Action stays visible; linking existing work preserves source | v88 pass* | v88 pass* | v88 pass* |
| E06 Risks | Unassessed/assessed, treatment, acceptance expiry, reassessment, closure and related work | v88 + clock-test pass | v88 + clock-test pass | v88 + clock-test pass |
| E07 Policies | Presence, owner, approval, versions and recurring Review remain distinct | v88 pass | v88 pass | v88 pass |
| E08 Vendors | Due diligence, owner, reassessment, contract dates, termination and retained history | v88 scoped pass | v88 scoped pass | v88 scoped pass |
| E09 Evidence | Upload/link/retrieve, immutable version/history and tenant-scoped related records | v88 scoped pass | v88 scoped pass | v88 scoped pass |
| E10 Calendar / cadence | Due work matches registers; late and missed Reviews do not shift anchored cadence | v88 UI + cadence pass | v88 UI + cadence pass | v88 UI + cadence pass |
| E11 Contacts / roles | Responsible contact versus authenticated assignee; departure/reassignment and denied actions | v88 Demo pass; partial** | v88 Demo pass; partial** | v88 focused rerun pass; partial** |
| E12 Systems / scope / settings | Valid scope edits, required fields and applicable modules; no cross-client leakage | v88 pass | v88 pass | v88 pass |
| E13 AI governance where enabled | Linked authoritative Reviews/Risks/Findings/Evidence and Program Health | v88 pass | v88 pass | v88 pass |
| E14 Drawer interaction | Draft retention, Save & next, validation, failed save/retry, keyboard/focus | v88 pass | v88 pass | v88 pass |
| E15 Presentation | Light/dark; desktop/tablet; readable status and no obstructed controls | v88 visual pass | v88 visual pass | v88 visual pass |
| E16 Persistence / isolation | Refresh/reopen/session behavior truthfully described; tenant and role denial | v88 Demo pass; partial** | v88 Demo pass; partial** | v88 focused rerun pass; partial** |

RC means identified published version 87, not the corrected final release. `*` Independent Findings and new linked corrective Actions were exercised, including reopening and two validation decisions. The existing Finding drawer has no existing-Action picker; no unsupported relinking UI is claimed. `**` Contact/account distinction and eligibility were exercised in Demo. Real authenticated browser role, revocation and cross-session checks are blocked by missing staging/accounts; server authorization and persistent-database recovery have separate automated evidence. Demo contexts are session-local and disposed after each scenario.

Browser scope: automatic Risk acceptance expiry is controlled-clock command evidence,
not an elapsed-time browser check. E07 verifies exact Policy approval versions and
separate recurring Reviews, not multi-person approval delegation or external-document
retrieval. E08 verifies service/owner validation, assurance capture, recurring Review,
unchanged legal renewal date and retained offboarding history; active-relationship
due-diligence and replacement assurance versions were not separately browser-exercised.
E09 verifies exact upload/download bytes and supporting-link removal; binary replacement
is not an in-place Evidence Library operation and is not claimed as tested. E15 is a
bounded visual/overflow/interaction review, not measured WCAG conformance.

## New-client simulation (sequential CIS → SOC → ISO)

Create each synthetic client through the supported command/API. Advance only a controlled
test clock. Preserve commands, checkpoints and unexpected-result evidence. Direct insertion
of successful historical records is not simulation evidence.

| Scenario | CIS IG1 only | SOC 2 scoped categories | ISO 27001 |
|---|---|---|---|
| N01 Onboarding exact scope, required/optional, owners and missing information | RC pass | v88 pass (default Security) | RC pass |
| N02 Framework semantics: IG1 vs optional; SOC three guidance tiers; ISO ISMS/SoA/Annex A/audit distinction | RC pass | v88 guidance + explicit scope pass | RC pass |
| N03 36 months: early/on-time/late/missed/catch-up, month-end/leap/year boundaries | API + Demo pass | API + Demo pass | API + Demo pass |
| N04 Owner changes/departure, policy revisions, vendor termination, risk expiry | API + Demo command pass | API + Demo command pass | API + Demo command pass |
| N05 Findings without Actions, pending validation, reopening, historical evidence | API + Demo command pass; E05 browser | API + Demo command pass; E05 browser | API + Demo command pass; E05 browser |
| N06 Failed dependencies/writes, same-intent retry, stale edits and concurrency | Focused-suite pass* | Focused-suite pass* | Focused-suite pass* |
| N07 Scope/configuration changes, refresh/session persistence and isolation | RC reload + command scope pass** | v88 category expansion/shrink/history + reload pass** | RC reload + command scope pass** |
| N08 Periodic summary/list/calendar reconciliation; no false readiness | Three RC checkpoints pass | Three RC checkpoints pass | Three RC checkpoints pass |
| N09 Published browser checkpoints and synthetic-only cleanup | Pass; contexts disposed | Pass; contexts disposed | Pass; contexts disposed |

`*` Duplicate same-intent commands occur in each timeline. Fault injection/stale/concurrent cases are separately exercised through `test_create_requests.py`, `test_review_recovery.py`, `test_onboarding_recovery.py`, `test_engineering_reliability.py`, Demo `commandRequests`, `onboardingReplayContract` and `governanceLifecycleContract`. The real-Mongo recovery runner tests database reconnect replay; it is not a browser-login or full server-restart test. `**` Demo same-session refresh is verified; closing the isolated context discards Demo edits by design. Real authenticated cross-session verification remains blocked as described above. Final command exports explicitly include account departure (December 2028), Finding reopening (January 2029) and a second independent validation (December 2029). The original decision, completed Action and occurrence snapshots remain unchanged. Finding-without-Action is in the backend timelines and published E05; the Demo timeline does not claim that separate event.

The nine published annual checkpoints retain their original RC87 fixture hashes.
They are not browser evidence for the later expanded departure/revalidation exports;
those final-source events have API, actual-Mongo and Demo-command evidence. E05
separately verifies Finding reopening and two validations through the published UI.

## Automated and infrastructure evidence

| Check | Evidence / outcome |
|---|---|
| Initial backend baseline | 458 passed, 579 subtests; eight existing FastAPI lifecycle warnings |
| Initial frontend baseline | 161/165 suites, 917/924 tests passed; seven investigated failures in population assumptions, seed cadence and compressed-history comparisons |
| Review command recovery | Focused API tests cover missing/changed identity, audit failure, lost task acknowledgement, concurrency, authorization and history |
| Onboarding recovery | Focused API and Demo tests cover partial writes, uncertain completion, immutable snapshots, concurrency and denied replay |
| Candidate MongoDB recovery and lifecycle | MongoDB 8.0.28, loopback-only disposable databases: `backend/scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27087 --include-program-lifecycle`; 47 tests passed (86.309 seconds), including reconnect replay, alias migration/interleaving/rollback, shortcut authorization/input validation, immutable retry audits and three-year CIS/SOC/ISO commands. Corrected-release rerun is recorded separately below |
| MongoDB package verification | Official archive SHA256 `a6573419fc1d8767b7a86911c4a1b832fa408d4b8bd32d281f049b87a30073cf`; no service/global installation; synthetic database per check removed afterward |
| Shared contracts | `shared/contracts/`: capabilities, governance lifecycle; both backend and Demo execute the same cases |
| Candidate regression / builds | Ordinary frontend: 176 suites / 984 tests / one snapshot passed (271.835 seconds); separate default-five-year: three passed (265.359 seconds). Standard build passed. Corrected-release ordinary and long-running results are recorded separately below |
| Final combined backend | `python -m pytest -c backend/pytest.ini -q backend/tests`: 534 passed, 671 subtests passed, eight existing FastAPI lifecycle warnings (188.88 seconds) |
| Sequential backend clock isolation | Three-year then ten-year suites with `-n0`: four tests plus three subtests passed (144.37 seconds); ten-year report records 510 completions, 115 late, 407 Evidence records, 48 validated Findings/completed Actions, six cross-client denials and no reported cadence/history/orphan discrepancy |
| Candidate/pre-storage-fix ten-year Demo lifecycle | Seven tests passed (1,034.788 seconds): 1,405 completions including 298 late, 210 validations, 214 completed Actions, 1,168 uploads; 1,405 occurrences and 317 assessment snapshots retained exactly; no reported unexpected rejection, reconciliation discrepancy, orphan or record-scope leak. File-payload loss and capacity limits are recorded in the next row |
| Ten-year storage limitation | This pre-fix characterization uses unlimited test storage. It crossed its diagnostic 5,242,880-character budget on 2030-09-23 and ended at 10,978,246 characters; compaction evicted 69 bytes of other-client file content while retaining metadata. It was not rerun after the storage correction and is not a final-code or browser-capacity pass. Final focused storage regressions, bounded three-/five-year commands and published cross-client upload/reload checks provide the corrected-source evidence; all nine candidate three-year browser checkpoints passed |
| Independent diff review | Agent cross-reviews covered frontend controllers/readiness/navigation, onboarding/alias/migration boundaries, and Review command authority/recovery. Reproduced actor-ID collision, assignment bypass, malformed shortcut input, mutable retry-audit identity and stale migration receipt; smallest fixes plus red-green regressions integrated. Final combined backend and Mongo reruns passed. This is not external independent security assurance |
| Final visual-branch follow-ups | Compatible `fce1dbd`/`a2dd220` fixes integrated: omitted ISO history on save, scoped readiness explanations, dark primary actions and keyboard focus return. New regressions reproduced the defects before correction. Post-port cold run: 13 suites, 122 tests, one snapshot passed (31.699 seconds); standard production build passed with the existing large-bundle advisory. Earlier full-suite results above precede this narrow port |
| Production data migration | Not attempted; no representative production dataset supplied. Fixture dry-run/recovery evidence is not production validation |
| Corrected-release ordinary frontend | Cold run: 182 suites / 1,012 tests / one snapshot passed (249.720 seconds), excluding only separately executed `frameworkFiveYear` and `brawndoTenYear`. Standard production build passed (`main.b8e238d4.js`, 545.93 kB gzip); existing large-bundle advisory remains. RegisterDrawers' Radix title warning reproduced on clean candidate `82f6972` (five tests pass): its plain-h2 SheetTitle mock omits Radix title context while mounting real DialogContent. Production uses the proper Radix Title primitive; unmocked Sheet/Review checks pass 14 tests without warning. No suppression or application patch applied |
| Expanded per-framework 36-month commands | Sequential backend + Demo CIS, then SOC, then ISO: all six focused runs passed. Backend times 7.533 / 3.261 / 7.733 seconds; Demo 34.899 / 16.729 / 38.775 seconds. Exports under `work/qa-final-command-lifecycle/{framework}` retain 154 / 68 / 86 occurrences, two validation decisions and an open unassigned departure handoff Action. Persisted file payloads: 65,520 UTF-16 bytes each, below the actual 64 KiB aggregate cap |
| Updated default-five-year regression | The same modified Demo test was rerun without the three-year override, sequential CIS / SOC / ISO: all three passed (80.874 / 21.652 / 54.531 seconds), retaining 248 / 102 / 132 occurrences. Separate exports: `work/qa-final-command-lifecycle-five-year/{framework}`. Same first-decision/history and actual 64 KiB storage assertions retained |
| Final application diff review | Independent agent review found no concrete blocker across storage, managed Risk fields/drafts, SOC scope guards/history, canonical AI capabilities, focus and attribution; no dependency/lockfile/config changes. This is not external security assurance |
| Corrected-release real MongoDB | Loopback MongoDB 8.0.28 rerun: 47 tests passed (93.668 seconds), now including each framework's account departure and reopened-Finding second validation in the three-year API sequence. Only disposable databases were used and removed by the runner |
| Last scoped visual-branch reconciliation | Reviewed through `7df4276`: `d05d62c` visible-heading fallback applied with a red-green regression (three suites / 14 tests passed). `7df4276` recurrence fix is superseded by the already integrated canonical-anchor correction; no narrower reset exception imported. `bf84c3c` parent timeout was not imported without a reproduced defect; existing unmount/Next focus safeguards remain. Main remained `82f6972`; no unrelated branch redesign imported |
| Corrected-release publication | PR #14 head `d762fe0` was mergeable/clean; no configured required checks, rulesets, review requirements, check runs or statuses existed. Expected-head merge produced `1103be2`. Normal Sites workflow built and pushed/verified that exact source, then hit Windows Bash packaging failure. Validated fresh staging plus bundled preparation and `tar.exe` packaged the unchanged output; private native deployment succeeded as version 88. No force push, access change or production backend deployment |
| Disposable database cleanup | After final tests, the dedicated MongoDB executable/PID/port were revalidated. No `test_grc_quality_*` databases remained. Graceful shutdown completed; PID 27696 and the port 27087 listener were confirmed absent. Evidence/archive files remain available; no shared database or user service was touched |

## Release gates

### Final version 88 disposition (2026-10-02)

- Root ran the established clients sequentially: Brawndo, Dunder, Prestige, then a focused Prestige Contact retry and the new SOC scope journey. No overlapping browser workstreams or deployments occurred. Each fresh context verified the exact final bundle hash before writes; all writes were browser-local synthetic Demo records.
- Brawndo and Dunder each passed all 14 recorded result groups with no browser errors. Prestige passed the framework/Review chain, Risk, Policy, Vendor, Evidence, Systems, Finding reopening, AI and presentation checks. Its first Contact filter check failed a harness immediate-state assertion even though the failure screenshot showed the checked filter and archived Contact. One UI click followed by a retrying checked-state assertion corrected the QA harness, not the application. The focused retry passed E11, E05, E13, presentation and final reload/isolation with no browser errors. Original failure evidence remains retained.
- Dashboard reconciliation on the final bundle: Brawndo 56 applicable / 32 implemented / 49 assessed / 7 unassessed and three material Findings/three work rows; Dunder 121 / 94 / 117 / 4 and two/two; Prestige 38 / 27 / 36 / 2 and two/two. Completed Reviews and Actions did not change framework implementation/verification conclusions. Pending validation and independent Findings remained separate from corrective Actions.
- **RC87-01 resolved:** final upload/link/unlink/download and cross-client isolation checks passed. The 64 KiB aggregate inline budget was not raised; existing persisted content is reserved before new uploads. Temporary document-local content remains explicitly labeled and is not promised to survive reload.
- **RC87-02 resolved:** Dunder's accepted Risk opened and completed its authoritative Review, preserved acceptance/rating history, and closed without erasing completed occurrences. Guarded draft/managed-field regression coverage remains intact.
- **RC87-03 resolved:** the final new SOC client began with 33 unassessed Security criteria. Availability and the 2027 observation period saved/reloaded with 36 criteria. After an A1.1 narrative/history save, shrinking to Security restored 33 active criteria while retaining all three Availability records and the saved history. The onboarding baseline and other clients were unchanged; narrative entry did not manufacture an assessment conclusion.
- **RC87-04 resolved:** Prestige AI creation and authoritative Review dates, existing Finding/Action links, shared Evidence and material-change history passed twice on the final bundle. No Brawndo-only approval capability was exposed or added to standard clients.
- **RC87-05 and visible-heading focus resolved:** final screenshots distinguish product attribution (`By Prestige Worldwide`) from selected client identity; final framework Save & next, close/focus, draft guard and reload checks passed in all three established clients. All 17 normal screenshots per client were inspected across desktop/tablet and light/dark captures; no concrete new visual blocker was observed. The restored Prestige Contact screenshot was additionally inspected after its passing rerun.
- Available Demo verification is complete. E11/E16 authenticated browser personas, revocation and persistent new-session checks remain genuinely blocked by the missing disposable authenticated environment/accounts. Unsupported or unexercised browser subpaths are explicitly listed above, not silently marked covered. This is not whole-application security, production-readiness or framework-compliance assurance.
- Final raw browser artifacts: sibling `work/qa-final88-{brawndo,dunder,prestige,prestige-retry,new-soc}` directories. Candidate annual checkpoint and final command artifact locations/hashes are retained in the evidence JSON. Browser contexts were closed, discarding only synthetic session data; established seeds and real backend data were not modified. The disposable MongoDB process was gracefully stopped after confirming no test databases remained. Local evidence and archives were retained.

### Candidate 87 observations (historical; final dispositions above)

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

1. Completed implementation/diff review, remote reconciliation and available repository checks before PR #12.
2. Merged and published candidate 87 from the identified SHA.
3. Executed the bounded E/N matrix sequentially, retaining failures and external blockers.
4. Integrated observed fixes/regressions, merged PR #14 and published corrected version 88.
5. Completed available final Demo rechecks and synthetic cleanup; retained evidence and the explicit authenticated-browser/production prerequisites above. Verification-only closure does not alter the published application bundle.

## Relevant engineering references

- [MongoDB write atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/): single-document conditional writes are atomic; a multi-record workflow needs explicit recovery.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): recheck authorization on every request, including receipt replay.
- [MongoDB package integrity](https://www.mongodb.com/docs/v7.0/tutorial/verify-mongodb-packages/): compare the downloaded artifact against the official SHA256 file before execution.
- [Playwright clock](https://playwright.dev/docs/clock): bundled Playwright 1.62.1 uses `page.clock.setFixedTime` for isolated checkpoint dates without changing the host clock or stopping UI timers.
- [Playwright best practices](https://playwright.dev/docs/best-practices): isolated browser contexts and observable user-facing actions; the published QA scripts keep credentials on stdin and restrict network requests to the identified Site origin.
- [Playwright assertions](https://playwright.dev/docs/test-assertions): retry the observable state assertion after one user action. The final Prestige Contact filter recheck uses one click plus `toBeChecked()` for the router-controlled checkbox; it does not add a sleep, retry the mutation or bypass a failed outcome.
