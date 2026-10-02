# Release verification matrix

This is the bounded finish line from the requested continuation, not a new feature backlog.
`Pending` is not a pass. Automated, published-browser and real-database evidence are separate.
Synthetic clients and controlled test clocks must never change the host clock or real client data.

## Identified release

- Initial GitHub/Sites source: `6cc52ad4794fa1846923647dc42471c2c6a138b1`.
- Candidate commit / PR / published version: pending integration and checks.
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
| E01 Dashboard / Program Health | Counts, drilldowns, readiness and unresolved work agree | Pending | Pending | Pending |
| E02 Framework workspace | Scope/assessment/implementation/verification remain distinct; evidence and history visible | Pending | Pending | Pending |
| E03 Reviews | Create/edit/assign/start/complete/reopen where supported; current and completed occurrence selection | Pending | Pending | Pending |
| E04 Finding → Actions | Raise/link, complete Action, retain pending validation, validate/reopen with history | Pending | Pending | Pending |
| E05 Independent Findings | No Action stays visible; linking existing work preserves source | Pending | Pending | Pending |
| E06 Risks | Unassessed/assessed, treatment, acceptance expiry, reassessment, closure and related work | Pending | Pending | Pending |
| E07 Policies | Presence, owner, approval, versions and recurring Review remain distinct | Pending | Pending | Pending |
| E08 Vendors | Due diligence, owner, reassessment, contract dates, termination and retained history | Pending | Pending | Pending |
| E09 Evidence | Upload/link/retrieve, immutable version/history and tenant-scoped related records | Pending | Pending | Pending |
| E10 Calendar / cadence | Due work matches registers; late and missed Reviews do not shift anchored cadence | Pending | Pending | Pending |
| E11 Contacts / roles | Responsible contact versus authenticated assignee; departure/reassignment and denied actions | Pending | Pending | Pending |
| E12 Systems / scope / settings | Valid scope edits, required fields and applicable modules; no cross-client leakage | Pending | Pending | Pending |
| E13 AI governance where enabled | Linked authoritative Reviews/Risks/Findings/Evidence and Program Health | Pending | Pending | Pending |
| E14 Drawer interaction | Draft retention, Save & next, validation, failed save/retry, keyboard/focus | Pending | Pending | Pending |
| E15 Presentation | Light/dark; desktop/tablet; readable status and no obstructed controls | Pending | Pending | Pending |
| E16 Persistence / isolation | Refresh/reopen/session behavior truthfully described; tenant and role denial | Pending | Pending | Pending |

## New-client simulation (sequential CIS → SOC → ISO)

Create each synthetic client through the supported command/API. Advance only a controlled
test clock. Preserve commands, checkpoints and unexpected-result evidence. Direct insertion
of successful historical records is not simulation evidence.

| Scenario | CIS IG1 only | SOC 2 scoped categories | ISO 27001 |
|---|---|---|---|
| N01 Onboarding exact scope, required/optional, owners and missing information | Pending | Pending | Pending |
| N02 Framework semantics: IG1 vs optional; SOC three guidance tiers; ISO ISMS/SoA/Annex A/audit distinction | Pending | Pending | Pending |
| N03 36 months: early/on-time/late/missed/catch-up, month-end/leap/year boundaries | Pending | Pending | Pending |
| N04 Owner changes/departure, policy revisions, vendor termination, risk expiry | Pending | Pending | Pending |
| N05 Findings without Actions, pending validation, reopening, historical evidence | Pending | Pending | Pending |
| N06 Failed dependencies/writes, same-intent retry, stale edits and concurrency | Pending | Pending | Pending |
| N07 Scope/configuration changes, refresh/session persistence and isolation | Pending | Pending | Pending |
| N08 Periodic summary/list/calendar reconciliation; no false readiness | Pending | Pending | Pending |
| N09 Published browser checkpoints and synthetic-only cleanup | Pending | Pending | Pending |

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
| Ten-year storage limitation | The characterization uses unlimited test storage. It crossed its diagnostic 5,242,880-character budget on 2030-09-23 and ended at 10,978,246 characters; compaction evicted 69 other-client file payloads while retaining metadata. This is not a browser-capacity pass. The bounded three-year snapshots require actual published-browser checks |
| Independent diff review | Agent cross-reviews covered frontend controllers/readiness/navigation, onboarding/alias/migration boundaries, and Review command authority/recovery. Reproduced actor-ID collision, assignment bypass, malformed shortcut input, mutable retry-audit identity and stale migration receipt; smallest fixes plus red-green regressions integrated. Final combined backend and Mongo reruns passed. This is not external independent security assurance |
| Production data migration | Not attempted; no representative production dataset supplied. Fixture dry-run/recovery evidence is not production validation |

## Release gates

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
