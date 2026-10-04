# CIS cumulative coverage and six-year lifecycle verification

Baseline: `c470229fbcba3dadb2d3b80ce9c979c1d3b1bfe7`, fetched October 4, 2026. Branch: `codex/cis-six-year-verification`. Delivery is a reviewable PR only; no merge, publication, deployment or permanent client.

## Durable checklist

- [x] Inspect current main and ongoing work. No open PRs; CIS IG3 owner idle after PR #30 merge. Existing content and mechanics are reused.
- [x] Isolate implementation in a separate worktree. No shared data or machine clock changes.
- [x] Confirm release declaration: IG1/IG2 released; IG3 content present but unavailable. Preserve release gate.
- [x] Read unchanged supplied workbook; compare exact IDs, Controls, minimum groups, titles and requirement wording.
- [x] Review all 153 safeguards and grouped Review prompts; record individual findings in supporting matrix.
- [x] Fresh onboarding for released groups, plus explicitly isolated IG3 mechanics.
- [x] Simulate 2027–2032 via supported commands, controlled clock, synthetic evidence and disposable persistence.
- [x] Check both upgrades, inherited identities/dates/relationships/snapshots, repeated requests and interruption recovery.
- [x] Verify denials, stale writes, affected regression suites, normal and Demo builds, and the IG1 → IG2 local browser workflow only.
- [x] Fetch/reconcile main, review complete diff and remove task-owned temporary resources. Branch/PR delivery is recorded in the final handoff.

## Boundaries

The workbook is supplied reference material, preserved unchanged. Repository documentation records prior explicit full v8.1 content permission; no new rights are inferred from this upload. The original implementation displayed authored summaries only; no full official wording was supplied inside the assessment. This focused follow-up populates the existing LICENSED_TEXT / official_text contract for all 153 safeguards directly from the unchanged workbook. What CIS Requires now displays the official wording with whitespace preserved, followed by the separately labeled Requirement summary · Omnisciente. The existing guidance remains separate. Raw official-text equality is enforced by the workbook comparison; no tab, setup flow or lifecycle rule was added.

IG3 cannot currently be selected through the released configuration interface. Any IG3 simulation uses an explicit test-only availability override and cannot demonstrate released IG3 availability. The follow-up requests proper IG3 availability under review, with release checks resolved by the existing IG3 owner. No test override is used as evidence that the released interface offers IG3.

Normal backend persistence, Demo adapter behavior and browser observations will be reported separately. A six-year simulated lifecycle does not establish technical effectiveness or six years of operational assurance.

## Direct answer

IG1 → IG2 works through the existing Client Profile interface without resetting inherited work. IG2 → IG3 preservation and initialization passed independently through the same backend configuration command with a test-only release gate. A practitioner **cannot yet select IG3 through the released interface**: the declaration still permits only groups 1 and 2. Therefore this verifies the supported progression mechanics, but does not certify an end-to-end released IG3 experience. The complete IG1 → IG2 → IG3 browser journey remains unfinished pending the IG3 owner’s release disposition and the two missing isolated browser cases.

## Membership and content matrix

The unchanged supplied workbook identifies itself as CIS Critical Security Controls v8.1. SHA256: `ba40e13de102075e8f12534f45acffd7ad53ce5dcfe7a9334cddccf0b45ea9ee`.

| Population | Exact ID comparison | Minimum-group additions | Controls represented |
|---|---|---:|---:|
| IG1 | 56 expected = 56 actual; no missing/unexpected IDs | 56 | 15 |
| IG2 cumulative | 130 expected = 130 actual; no missing/unexpected IDs | 74 | 18 |
| IG3 cumulative | 153 expected = 153 actual; no missing/unexpected IDs | 23 | 18 |

All 153 source Control numbers, minimum groups and final titles match. No duplicate source or catalog IDs were found. The supplied sheet does not contain Control names; catalog names were cross-checked with the [CIS Controls list](https://www.cisecurity.org/controls/cis-controls-list). Controls 13, 16 and 18 correctly have no IG1 safeguards.

All 153 authored summaries differ from the workbook; they remain clearly labeled explanations. All 153 new official_text fields match the workbook descriptions exactly, including punctuation, whitespace and paragraph breaks. The existing assessment renders official text separately from the authored summary and practical guidance. Full component coverage checks both fields for every safeguard; Local browser confirmation on the unchanged IG2 assessment interface shows the complete 1.1 wording and separately labeled explanation; no assessment write was made during this focused presentation check.

[`cis-six-year-coverage.json`](cis-six-year-coverage.json) contains every safeguard in IG1, IG2-addition, IG3-addition order: workbook cell, exact membership/title comparisons, authored summary, timing explanation, all assessment questions, evidence examples, all five guide fields, stable criterion IDs, mapped Review plans and correction notes. Content review considered required action, scope, review/confirmation, timing/events, evidence and gap identification together; this is a source-informed engineering review, not independent CIS validation. Existing equivalent evidence is allowed; no mandatory artifact set was introduced. All 153 are reachable in grouped briefs; the regression compares the full non-repeated prompt array for every mapped safeguard, not just its first question.

## Demonstrated corrections

| Safeguard / area | Defect or inconsistency | Correction |
|---|---|---|
| 1.4 | Guidance did not make all DHCP/IPAM log sources explicit | Restore complete source coverage and weekly inventory use in summary, assessment, guide and existing criterion |
| 3.8 | Explanation omitted the enterprise data-management-process basis | Tie internal/provider flows to that process and retain annual/significant-change review |
| 3.11 | Title capitalized “At” differently from supplied reference | Match “at” |
| 11.1 | Review question implied detailed backup procedures were part of this safeguard's minimum | Keep recovery scope, prioritization and backup security; identify detailed backup procedures as optional supporting material |
| 12.2 | Generic prompt did not expose all architecture dimensions | Make segmentation, least privilege, availability and policy/design visible |
| 12.7 | Summary, starting step and evidence focused on remote access alone | Cover end-user device access paths and authentication prerequisites across the stated scope |
| 15.4 | Generic contract prompt did not expose policy consistency | Compare security terms with provider policy and annual contract review |
| IG3 cadence labels | Missing plan references displayed explicit source intervals as recommended | Add references for 1.5, 2.7, 6.8, 13.11, 15.5, 17.9 and 18.5; do not change stored/custom schedules or enable optional templates |
| Existing tests | Criteria fixture still expected 130/292; IG1 lifecycle fixture enabled optional custom templates without required configuration | Update to current 153/361 catalog and select only applicable default IG1 plans; preserve behavioral assertions |

The three original failing tests reproduced on untouched main: outdated criteria totals, the actual cadence-label defect, and the obsolete greenfield template fixture. They are not attributed to this branch. No framework lifecycle logic, permission model, new setup step, dependency or data migration was introduced.

Scope discrepancies were checked against primary CIS material: [Control 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/), [Control 3](https://cas.docs.cisecurity.org/en/latest/source/Controls3/), [Control 12](https://cas.docs.cisecurity.org/en/latest/source/Controls12/), and [Control 15](https://cas.docs.cisecurity.org/en/latest/source/Controls15/). The online CAS page and supplied sheet differ in 12.2 example wording and 12.6 title wording; the online 12.5 heading also appears malformed. The supplied version-matched workbook remains the comparison reference. These differences were not used to silently replace its text. Existing IG3 guidance separates CAS-informed assessment prompts and authors' operational planning interpretations from safeguard wording.

## Six-year simulation and preservation

The primary client was created with `POST /clients` and finalized with ordinary `POST /onboarding/baseline` at IG1. All assessment writes, uploads/downloads, Findings/Actions, validation, Review start/completion and upgrades use supported routes. Only isolated bootstrap identities and clock replacement are setup fixtures. No completed primary history or green status is inserted directly into the database. Mongo storage is a unique disposable database for each test on a task-owned loopback server.

| Simulated year | Scope | Safeguards worked | Review executions | Cumulative immutable snapshots | Observed open gaps at year end |
|---|---|---:|---:|---:|---:|
| 2027 | IG1 | 56 | 42 | 42 | 3 |
| 2028 | IG1 | 56 | 48 | 90 | 0 |
| 2029 | IG2 | 130 | 62 | 152 | 3 |
| 2030 | IG2 | 130 | 65 | 217 | 0 |
| 2031 | IG3, test gate | 153 | 65 | 282 | 3 |
| 2032 | IG3, test gate | 153 | 65 | 347 | 0 |

All inherited safeguards are reassessed in later years. There are 678 uploaded/downloaded assessment dossiers, 347 occurrence-specific Review evidence records, and nine Findings corrected through linked Actions and supported validation. At the end of each two-year phase all active assessments have the satisfactory synthetic conclusion, all Findings are closed, all generated Actions are done and no scheduled Review remains due within that year. The final paginated Evidence Library exposes all 1,025 retained records, including the population beyond the legacy list limit. The controlled Python clock never changes the machine clock.

One Review uses a client-selected 42-day schedule and is completed eight days late in year 1. Every following due date advances from the original scheduled date by 42 days, rather than drifting from completion.

| Upgrade | Inherited assessments retained | Additional unassessed rows | Existing Reviews retained | Duplicate Reviews |
|---|---:|---:|---:|---:|
| IG1 → IG2 | 56 | exactly 74 | 12, then 15 total | 0 |
| IG2 → IG3, test gate | 130 | exactly 23 | 15, still 15 total | 0 |

Each upgrade deep-compares assessment identity, implementation/status/verification, original last-assessed date, assessor, owner, notes, history, operating context and criteria. Existing links remain; additive Review links are permitted. Evidence records and dates, Findings and Actions remain equal before/after. Review identity, description, owner, due date, recurrence, custom interval, anchor and occurrences remain equal. Every saved occurrence snapshot is deep-compared through year 6. Foreign-client/framework assessment rows remain unchanged. New rows have no assessment date or verified conclusion, implementation, owner, history, satisfied criteria or Evidence/Action/Finding links. Exact addition IDs are compared, not just counts. Annual saves preserve the entire history prefix and append one snapshot; retained assessment and occurrence Evidence payloads are redownloaded and hash-compared after upgrades and at the final check.

Both upgrades inject a failure after reconciliation and before publication: the response is 503 and the visible active scope remains the previous group. Retrying the original intent and idempotency key completes it; replay returns the same receipt. Companion real-Mongo suites cover permission denials, cross-client isolation, stale writes, conflicting/repeated intents, reductions/restoration, exports, ticket associations and recovery after a fresh database connection.

Machine-readable timelines: [`cis-six-year-api-mongo.json`](cis-six-year-api-mongo.json) and [`cis-six-year-api-mock.json`](cis-six-year-api-mock.json). These are synthetic outputs, not customer records.

## Actual verification and limits

- Real MongoDB 8.0.28: **86 tests passed**, including the strengthened follow-up assertions (210.744 seconds). Command from backend: `python scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27954 --include-cis-ig2 --include-cis-ig3-scope --include-remediation-tickets --include-cis-six-year`. This includes the final evidence-preservation/pagination assertions.
- Isolated API mock: **2 tests passed**, including the strengthened follow-up assertions (79.184 seconds). `python -m unittest discover -s tests -p test_cis_six_year.py`; the same primary lifecycle and released fresh onboarding are exercised separately.
- Frontend: **14 suites / 341 tests passed** across CIS content/criteria/cadence/operations, IG2/IG3 Demo scope, 24-month Demo operation, onboarding handoff, Review briefs, program settings, assessment and shared FrameworkWorkspace. The focused follow-up reran those 14 suites in two batches: 10 suites / 320 tests and 4 suites / 21 tests passed. Initial invocations used four incorrect test paths; the corrected repository paths passed without application/test changes to remedy those invocation errors.
- Builds: ordinary CRA/CRACO build (`REACT_APP_PREVIEW=false`, standard sign-in enabled) and `node frontend/scripts/preview.cjs build` for Demo. No hosting operation is part of either build.
- Local browser: ordinary client creation/onboarding, all 17 policy responses “Unsure,” 56 initially unassessed/unverified safeguards, 12 visibly unscheduled/unowned Reviews, assessment save/reopen, Client Profile IG2 confirmation, 130 total/129 unassessed after one inherited partial assessment, 15 unscheduled Reviews, inherited implementation/date/status/identity retained, “IG1 baseline” versus “Added in IG2,” and corrected 1.4 guide with all sources/weekly timing. The released selector has no IG3 option. Changes exist only in local session Demo storage.
- Browser interaction used the existing interface. Existing regression suites additionally exercise draft protection, navigation/Save & next and shared workspace behavior. A successful automated component/API test is not reported as a separate manual keyboard or accessibility audit.

Authenticated normal-backend browser checks were **not performed in this task**. Real persistence was exercised through the ASGI API harness with test authentication identities; it is not a deployed-network/browser sign-in test. No certificates, trust settings or security controls were altered. IG3 browser operation remains unavailable under the unchanged release gate. The current owner disposition, completed older checks and remaining browser CSV capture gap are detailed below; the old unchecked checklist is not treated as proof those checks were never performed.

External technical activity is represented by explicitly synthetic, source-specific dossiers (asset populations, methods, stated cadences and sampled role/service/incident/test triggers). The harness does not execute real scans, backups or penetration tests, nor record every daily/weekly external job independently. Event evidence is sampled narrative; the application's demonstrated event workflow is Finding → Action → remediation → validation. This verifies platform storage, follow-up, recurrence and preservation, not technical effectiveness or exhaustive fulfillment of every external activity. The synthetic satisfactory state must not be reused as a real-client assurance claim.

## Delivery provenance

Remote main was fetched again after implementation and remains `c470229fbcba3dadb2d3b80ce9c979c1d3b1bfe7`; no intervening changes required reconciliation. The complete diff is limited to CIS content, regression fixtures/tests, workbook comparison, the opt-in Mongo runner and this evidence. Final branch commit and PR URL are recorded in the PR handoff; use its head SHA to identify the exact reviewed snapshot rather than embedding a self-referential commit hash in this file.

No shared preview, production, permanent demo client or hosted version was modified. Temporary databases were dropped by the test runner. Before stopping the owned Mongo process the only remaining databases were `admin`, `config` and `local`. The temporary browser tab was closed, the development server and owned Mongo process stopped, and the owned database data directory removed. Local logs and the readonly baseline worktree remain as review evidence. The branch is delivered for review only.

## Focused follow-up and independent review

The IG3 owner inspected c470229f and confirmed that the active [1,2] declaration is a retained availability restriction, not missing licensed content or missing 23 safeguard definitions. Recorded completed checks already cover all 23 additions, 115 guide answers, authenticated upgrades/reductions, Evidence/Action links, responsive/keyboard behavior and disposable-Mongo regressions. The older draft/no-publication checklist statements are stale because PR30 was subsequently merged and preview107 published. The remaining verification gap is browser CSV download capture: HTTP export was checked, but a browser download-event timeout did not establish capture. Those older checks also do not cover PR33's later corrections. The IG3 owner retains enablement ownership; it has requested a direct human instruction in its chat before preparing the availability patch. This branch does not bypass that release gate.

A separate reviewer inspected f66e9ed and independently passed the exact workbook membership/title/Control/minimum-group comparison and the two original mock tests (60.664 seconds). It found three actionable issues: 12.7 incorrectly made devices rather than users the authentication actor; annual saves did not prove lifetime history retention; upgrade metadata equality did not prove Evidence file-byte retention. Its isolated negative control truncated history on 678 saves and corrupted 589 retained payloads during upgrades, yet the original test passed (56.566 seconds). Those original results therefore do not establish the stronger lifetime/file claims.

The correction restores user authentication across the summary, criterion, plain-language guide and Review prompt. The six-year test now retains a history ledger and checks an unchanged prefix plus exactly one appended snapshot after each annual save. It records hashes of both assessment and occurrence Evidence and redownloads retained files after each upgrade and at the final population check. It also checks exact new safeguard IDs, empty implementation/owner/history/criteria and no Evidence/Action/Finding links, derives annual open-gap counts from actual Findings, and requires remediation Actions to be done. Independent negative controls now fail at their intended assertions: history truncation is rejected at the 2028 1.1 history-prefix check after 57 saves (2.605 seconds); retained Evidence corruption is rejected at the first upgrade hash check after 202 corrupted records (6.890 seconds). Each produced one AssertionError and zero setup/runtime errors. The reviewer reported no remaining material findings within this focused scope. The updated mock simulation passes both tests in 79.184 seconds.

The primary six-year simulation uses supported application commands for client creation, assessment saves, Evidence uploads, Findings/Actions, validation, Reviews and configuration changes. Its assigned satisfactory statuses are explicitly synthetic user decisions, not technical assurance inferred by the tests. Bootstrap inserts only isolated identities/initial client fixtures. Some companion mechanics tests directly seed synthetic histories; the entire regression collection is not described as command-generated history. Test token setup and optimistic-write hooks are not a browser sign-in/concurrency test.

- [x] Existing requirement section contains licensed official wording and separately labeled authored explanations.
- [x] Independent original review and negative controls performed; identified corrections implemented.
- [x] Independently verify strengthened assertions detect history loss and file corruption.
- [ ] Integrate IG3 owner’s genuine availability patch after release-check disposition.
- [ ] Browser: fresh IG3 onboarding using the implementation under review.
- [ ] Browser: Client Profile IG2 → IG3 with inherited answers, dates, Evidence, tickets and history retained; exactly 23 additions unassessed.

PR33 remains unmerged and unpublished. The missing browser journey is not marked complete.

Follow-up cleanup: all temporary test databases were dropped (only admin/config/local remained), the owned Mongo server was shut down with its normal administrative command, and the temporary browser/dev server were closed. Automatic approval review rejected the combined filesystem/process cleanup command with only "blocked by policy"; temporary Mongo files/logs are therefore retained outside Git. No cleanup bypass was attempted.
