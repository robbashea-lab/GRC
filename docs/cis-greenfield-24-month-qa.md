# CIS IG1 greenfield onboarding and 24 month lifecycle QA

Executed September 30, 2026. This is a product acceptance exercise using synthetic data, not a compliance opinion. It covers normal Demo onboarding, every IG1 safeguard in the browser, and a controlled-clock integration simulation from September 30, 2026 through September 30, 2028. No merge or deployment is part of this QA task.

## A. Executive Summary

**Greenfield onboarding works, and the tested operating lifecycle preserves schedules, relationships and history. Unconditional product acceptance is not yet justified.** The new-client experience intentionally lacks Brawndo-only assessment criteria and editable verification controls. Framework-origin Findings do not collect a target date at creation. Policy scheduling and operational controls still require explicit setup. These are not quietly repaired and counted as onboarding output.

The final simulation retained 94 completed Review occurrences, 98 Evidence records, nine Findings, ten Action Items and four Risks. Four Findings remain in remediation; four Actions are overdue. No tested recurrence drift, duplicate occurrence, duplicate remediation pair, overwritten historical snapshot or cross-client mutation was found. One assessor-name display defect was fixed with frontend and backend regression tests.

The broader frontend suite also reproduces a pre-existing five-year multi-framework Demo storage-capacity failure. Passing this smaller 24-month simulation does not establish unlimited Demo durability or production readiness.

## B. Test Client

Two isolated test instances deliberately separate human-visible browser QA from accelerated integration testing:

| Instance | Identification | Location |
|---|---|---|
| Browser | CIS Lifecycle QA — Disposable; `clients_demo_muom38jc_7zddrid5` | Local Demo at `http://127.0.0.1:4179`, retained in the QA browser tab |
| Automated | CIS Lifecycle QA — 24 Month Automation; final exported ID `clients_demo_muo69q80_0iflmkdl` | Controlled-clock test and exported synthetic store |

Both use CIS IG1 only, twelve enabled framework Reviews, first due date October 31, 2026, and all seventeen policy questions answered with a mixture of Yes, No and Unsure. Other frameworks are explicitly marked not applicable; none is activated. Optional general GRC Reviews were not selected.

The browser client was created and onboarded through the actual UI. Automated program records were created through the normal Demo API adapter, including `/onboarding/baseline`, not by inserting a finished program. Only two synthetic active account fixtures were inserted for isolated owner-lifecycle testing because Demo invitations do not provide a real acceptance flow. This exception does not validate real email delivery or account activation.

## C. Onboarding Baseline

| Source record | Count and initial state |
|---|---|
| CIS safeguards | 56, all Not Assessed, all unassigned |
| Controls containing IG1 safeguards | 15 |
| Stored explicit verification | 56 not recorded; no automatic verification conclusion |
| Recurring Reviews | 12; all due October 31, 2026; all unassigned |
| Policies | 17; 6 need creation, 11 need verification; no automatic approval |
| Calendar entries | 12 current Review obligations in the baseline query window |
| Findings / Actions / Risks / Vendors / Evidence | 0 each |
| Framework applicability records | 6; only CIS applies |
| Other framework assessments | 0 |
| Evidence folders | Logical views, not precreated file copies; initially empty |

Repeating finalization retained the same twelve Review IDs and seventeen Policy IDs. The immutable onboarding baseline remained unchanged at months 12 and 24. No policies, owners, files or historical completion records were invented to make the baseline look mature.

## D. Onboarding Gaps

- Owners and dates are optional. This test supplied every first due date; ownership remained explicitly unassigned until operational assignment. Whether onboarding must require an owner is a product decision.
- Seventeen policy records represent the application's baseline, not seventeen universally mandated CIS policy titles. Missing/uncertain policies do not automatically create Action Items in this baseline workflow.
- Policy records have no individual review cadence or next-review date after intake. Framework governance Reviews exist, but an individual policy review must be configured separately where desired.
- Significant-change, new-hire, access-change and other event-driven activities are not all generated as separate scheduled Calendar obligations. A recurring governance Review does not replace those operational processes.
- The generic Review detail shows the configured schedule and expandable framework source context, but its separate client rationale can remain “not recorded.” The framework plan provenance itself is retained. No invented management rationale was added.
- First due dates persisted correctly through onboarding, retrieval and browser display. An initial browser automation date-fill issue was corrected in the test interaction; it was not an application defect.

## E. CIS Cadence Matrix

All first due dates were client-selected as **2026-10-31**. “Pass” below means the configured Review matches its stated purpose and provenance, not that every linked operational obligation is fulfilled merely by completing that Review. Public CIS sources were consulted September 30, 2026. Source language is paraphrased.

| Review | CIS Source | Cadence | Cadence Provenance | First Due Date | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|
| Enterprise Asset Inventory | [1.1–1.2](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) | Semiannual | Explicit six-month inventory review; weekly unauthorized-asset handling is separate | 2026-10-31 | One inventory Review, not proof of weekly handling | One Review | Pass with operational distinction |
| Software Authorization & Support | [2.1–2.3](https://cas.docs.cisecurity.org/en/latest/source/Controls2/), 9.1, [12.1](https://cas.docs.cisecurity.org/en/latest/source/Controls12/) | Monthly | Explicit support/unauthorized-software review; covers the less frequent inventory review | 2026-10-31 | One shared Review | One Review | Pass |
| Data Management & Inventory | [3.1–3.6](https://cas.docs.cisecurity.org/en/latest/source/Controls3/) | Annual | Explicit annual process/inventory review; other safeguards are supporting context | 2026-10-31 | Annual plus significant-change response where applicable | Annual Review; change response remains operational | Pass with event caveat |
| Secure Configuration Process | [4.1–4.2](https://cas.docs.cisecurity.org/en/latest/source/Controls4/) | Annual | Explicit documentation review and significant change | 2026-10-31 | One shared process Review | One Review | Pass with event caveat |
| Account Authorization & Access | [5.1–5.4](https://cas.docs.cisecurity.org/en/latest/source/Controls5/), 6.1–6.5 | Quarterly | Explicit authorization validation under 5.1; access changes and inactivity threshold remain separate | 2026-10-31 | One shared authorization Review | One Review | Pass |
| Vulnerability & Remediation Process | [7.1–7.4](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) | Monthly | Monthly remediation-process review; annual process documentation and operational patching remain distinct | 2026-10-31 | Monthly governance with linked context | One monthly Review | Pass |
| Audit Log Management Process | [8.1–8.3](https://cas.docs.cisecurity.org/en/latest/source/Controls8/) | Annual | Explicit annual/change documentation review under 8.1 | 2026-10-31 | Annual process Review, not a claim of annual-only log operation | One Review | Pass |
| Data Recovery Governance | [11.1–11.4](https://cas.docs.cisecurity.org/en/latest/source/Controls11/) | Annual | Annual process review; weekly backups are operational | 2026-10-31 | Annual governance; backup execution separate | One Review | Pass with operational distinction |
| Security Awareness Program | [14.1–14.8](https://www.cisecurity.org/controls/cis-controls-navigator) | Annual | Annual content review/training; hire/change triggers remain separate | 2026-10-31 | One program Review | One Review | Pass with event caveat |
| Service Provider Inventory | [15.1](https://cas.docs.cisecurity.org/en/latest/source/Controls15/) | Annual | Explicit inventory review/change trigger; not a universal vendor-assurance mandate | 2026-10-31 | One inventory Review | One Review | Pass |
| Incident Reporting & Contact | [17.1–17.3](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) | Annual | Explicit personnel/contact/reporting-process review | 2026-10-31 | One shared Review | One Review | Pass with event caveat |
| Endpoint Protection Validation | 4.3–4.7, 9.2, 10.1–10.3 | Quarterly | **Omnisciente recommendation**, not an explicit CIS human-review interval | 2026-10-31 | Clearly recommended validation | One recommended Review | Pass |

No iVenture-specific frequency was inferred. Weekly backups, automatic updates, session locking and inactive-account thresholds must not be interpreted as the cadence of these human governance Reviews. No new cadence or framework mapping was implemented.

## F. Policy and CIS Mapping Review

All seventeen records initially have **no individual policy cadence/date**. The ten mapped policies have CIS supporting relationships; seven remain general baseline records without automatic CIS mappings. A mapping does not prove that a document contains the required operating process.

| Policy | CIS mappings | Assessment |
|---|---|---|
| Information Security | 8.1 | Conditional support only; reasonable if it references the actual logging process |
| Risk Management | None | General baseline; no invented IG1 policy mandate |
| Access Control & Identity Management | 5.1, 6.1, 6.2 | Reasonable account/access-process support |
| Acceptable Use | None | General baseline; potential support depends on actual content |
| Change Management | None | General baseline; no automatic claim |
| Vendor / Third-Party Risk Management | 15.1 | Reasonable provider-inventory support; not an IG1 mandate for this exact title |
| Data Classification & Handling | 3.1, 3.2 | Reasonable if it actually contains the data-management process/inventory responsibilities |
| Data Retention & Secure Disposal | 3.1, 3.4, 3.5 | Reasonable supporting relationship |
| Asset Management | None | Candidate missing support for 1.1/2.1; inspect document content before adding mappings |
| Vulnerability & Patch Management | 7.1–7.4 | Reasonable; documented process and patch execution remain distinct |
| Configuration Management | 4.1, 4.2 | Reasonable if actual secure-configuration processes are documented |
| Security Awareness & Training | 14.1 | Reasonable program support |
| Incident Response | 17.1–17.3 | Reasonable for personnel, contacts and workforce reporting; not all incident-policy content is IG1-required |
| Cryptography & Key Management | None | Possible support for encryption safeguards requires content review; no automatic mapping added |
| Business Continuity & Disaster Recovery | None | Possible recovery-process support depends on content; existing Backup policy already mapped |
| Backup & Restoration | 11.1–11.4 | Reasonable when the document contains the actual recovery/backup process |
| Physical & Environmental Security | None | General baseline, no unsupported IG1-specific mapping |

No broad or demonstrably incorrect mapping was silently changed. “Required Document” metadata on some mappings must be read with its stored rationale: CIS calls for documented processes, not necessarily these standalone policy names. Exact source checks are linked in section E.

## G. Initial CIS Assessment Distribution

The automated client contained 34 Implemented, 10 Partially Implemented, 6 Needs Attention, 5 Not Assessed and 1 N/A. Verification was 17 Verified, 17 Needs Validation, 16 Not Verified and 6 Gap Identified. The N/A fixture was 4.4 for a synthetic endpoint/SaaS-only scope with no enterprise-managed servers; this tests the application's rationale handling, not a universal applicability decision.

The separate browser pass saved all 56 safeguards with varied states. Its resulting distribution after the incident Finding is 39 Implemented, 8 Partial, 2 Needs Validation, 6 Not Assessed and 1 N/A. Different counts reflect separate fixtures, not drift between the same dataset.

Every safeguard opened with its identifier, title, summary and official Control reference. Save/Save & next traversed all 56; Previous/Next, N/A validation, close/reopen, route return, refresh and unsaved-navigation protection were exercised. Generic clients expose “What to verify” guidance and derived verification indicators, **not** Brawndo's editable CIS Assessment Criteria/verification controls or breadcrumb pattern. Those requested checks are recorded as unavailable, not passed.

## H. Finding and Action Item Lifecycle Results

Six initial safeguard Findings covered asset, software, account, configuration, patch and access gaps. Repeating each creation with the same request identifier returned the same Finding and exactly one Action. Ownership followed the assessment's eligible owner. Client and originating assessment relationships remained intact.

Framework-origin creation does not support a target-date input in its UI/model. A supplied extra Demo payload field did not populate either record. The test recorded this gap, then scheduled the records explicitly through ordinary updates. That scheduling is operational work, not a claim that creation preserved a date.

Review-origin Finding creation **does** preserve the selected target date on both records. Browser QA confirmed October 15, 2026 on the Finding and Action, including the historical H2 2026 Review origin. Completing an Action moved its Finding to Pending Validation; separate validation then closed it and retained rationale/history. The unresolved incident-reporting Finding remains open in the browser client.

## I. Recurrence Results

| Cadence | Test | Result |
|---|---|---|
| Weekly | Custom 7 days, December 31 due | January 7 next, independent of early/on-time/late completion |
| Monthly | December 31 due | January 31 next |
| Quarterly | December 31 due | March 31 next |
| Semiannual | December 31 due | June 30 next |
| Annual | December 31 due | December 31 next year |
| Custom 45 days | December 31 due | February 14 next |

Each case tested completion on December 20, December 31 and February 10. The scheduled due date, not completion date, determined the next cycle. There is no named Weekly option in the current UI; custom seven-day recurrence is the supported equivalent.

Missed-month test: a September 1 obligation completed November 10 advances to October 1, then November 1, then December 1 after each successive completion. No obligation is silently skipped or duplicated. Only the current outstanding occurrence and completed history exist; the application does not precreate every missed/future period. Whether to expose the entire backlog at once is a business-rule decision, not changed here.

Browser QA independently completed the October 31, 2026 semiannual asset Review early on September 30. History retained both dates separately and the next due date was April 30, 2027, followed by October 31, 2027. It did not shift to March 30.

## J. 24 Month Timeline

| Period | Operations and preserved state |
|---|---|
| Month 0 | Normal intake, 56 assessments, six safeguard Findings, linked remediation, initial evidence; four Risks and one Vendor added as explicit operational work |
| Months 1–3 | 21 completed Review occurrences; one initial Finding validated; policy and vendor Review Findings created |
| Months 4–6 | 30 cumulative occurrences; further corrective work validated; five total Findings closed |
| Months 7–9 | 40 occurrences; owner changes, one account disabled without record loss, one Action explicitly unassigned |
| Months 10–12 | 48 occurrences; annual assessment update; original assessment snapshots and onboarding baseline unchanged |
| Months 13–15 | 69 occurrences; second annual framework cycle; new unsupported-application Finding and in-progress Action |
| Months 16–18 | 78 occurrences, including leap-year February; monthly and semiannual operations continue |
| Months 19–23 | 93 occurrences; unresolved/overdue work remains visible |
| Month 24 | 94 occurrences; one monthly Review deliberately left due today; four overdue Actions; four unresolved Findings; second annual assessment history check passes |

First framework due dates were one month after intake, so annual framework executions occur in months 1 and 13 rather than pretending they occurred at months 12 and 24. Annual policy operations were separately scheduled in December and executed twice. Checkpoints remain at months 12 and 24.

## K. Calendar Results

Every simulated month queried Calendar and compared Review event keys with the live scheduled record and preserved historical occurrences in that month. Keys were unique and client-scoped. Changes required no separate synchronization. Review, policy, Risk, Vendor, assurance and contract schedules use their real source relationships; Action due dates remained source-driven.

This validates current/history projection, not a full forecast of every unmaterialized future recurrence. Vendor/assurance/contract dates were independent. No claim is made that a single annual inventory Review supplies evidence of all weekly or event-driven operational activities.

## L. Dashboard Results

At every month, overdue Review and Action totals were independently counted from source records. Open Finding totals were independently checked. Past Due, Due within 30, Due 31–90 and Unassigned totals matched their unique, client-scoped metric detail populations. This is not a separately hardcoded demo counter.

Final values: Past Due 6, Due within 30 days 1, Due 31–90 days 11, Unassigned 3, Overdue Reviews 0, Overdue Actions 4, Open Findings 4, High/Critical Findings 1, Significant Risks 0. The unfinished monthly Review is due **today**, so it correctly is not overdue. Past Due also includes other dated governance obligations; it is not simply the sum of Review and Action lateness.

The browser overview labels assessment coverage and implementation separately and explicitly disclaims a compliance percentage. Final automated assessment state is 33 Implemented, 11 Partial, 6 Needs Attention, 5 Not Assessed and 1 N/A.

## M. Policy Results

The test explicitly created an annual Information Security Policy Review after onboarding. It produced a Finding/Action, retained evidence and origin, completed twice on its scheduled cycle, and preserved remediation and occurrence history. Its policy-to-CIS relationship remained available. This does not mean the baseline automatically schedules all seventeen policy reviews or that uploading a policy establishes implementation.

## N. Risk Results

Four synthetic Risks exercised assessed/open work, acceptance, treatment in progress and justified closure. Risk Reviews and Calendar relationships were exercised. Completing the privileged-access treatment Action did not automatically close its Risk. Accepted Risk retained a future expiry and monitoring; retirement closure retained its stated reason. Final states: one closed, one in progress, one accepted, one assessed.

## O. Vendor Results

No Vendor was created by CIS onboarding. A synthetic managed-service Vendor was added explicitly. Its Vendor Review, separate security-assurance Review/date and contract renewal were distinct. The Vendor Review generated a Finding/Action; remediation was validated without collapsing assurance or contract obligations into that Review. Three distinct `vendor_purpose` values were asserted.

## P. Evidence Results

The simulation created evidence from safeguard, Review occurrence, Finding, Action and Policy contexts. There are 98 authoritative Evidence records at month 24. One file was linked to two assessments; repeated linking did not duplicate it. Search returned that file once. Library total matched authoritative records. Folder/program counts represent overlapping logical references, so they must not be summed as unique-file totals.

Browser QA uploaded `incident-reporting-sample.txt` through safeguard 17.3. After refresh it remained linked, appeared once in Library search, and its origin opened the same assessment. It contains a visible synthetic-data warning. Original uploaded bytes are not a claim of durable real-client object storage: Demo file-content retention follows its existing lightweight/session behavior.

## Q. History and Auditability Results

Each completed occurrence was snapshotted and compared unchanged during every later month. Original due dates and actual completion dates remained distinct. Months 12/24 preserved each initial assessment-history entry and the onboarding baseline. Recreated API access read all 94 retained occurrences. Comments persisted. Browser historical Review details were read-only and retained the Finding outcome.

This is local Demo/session persistence plus isolated backend tests, not a test of MongoDB restart durability, object-store retention, real user sessions or 24 months of production audit retention. Reconstructing the Axios client is a fresh read, not a browser restart; browser refresh was tested separately on the UI client.

## R. Duplicate Prevention Results

Pass for repeated onboarding finalization, same-request safeguard Finding creation, one corresponding Action, same-occurrence Review completion replay, recurring occurrence keys, Calendar keys and repeated Evidence linking. No data was copied between clients.

These tests do not establish universal POST idempotency, network-failure recovery for every endpoint, or true concurrent double-click/race safety. No unsupported blanket claim is made.

## S. Minor Defects Fixed

**Assessor displayed as Former user despite an existing active account.** The client-member projection included other actor fields but omitted `assessed_by`. A global Demo assessor therefore was not returned unless separately assigned to the client.

Added `assessed_by` to the existing actor-field list in Demo and backend. No membership, assignment eligibility, role or permission rule changed. The frontend regression failed before the fix and passed after it. Backend regression verifies an assessor label is returned only for the authorized client's records, client roles do not receive email, membership remains unchanged and another client's endpoint is denied. Browser refresh now shows Demo Explorer correctly.

## T. Significant Issues Requiring Approval

1. Decide whether to extend Brawndo's criteria/verification UI to newly onboarded CIS clients. It remains deliberately pilot-gated. This QA did not enable it elsewhere.
2. Decide whether framework-origin Finding creation should collect owner/target date and propagate them to its Action. Existing Review-origin creation already supports dates. Adding new creation fields is not hidden inside this QA.
3. Decide whether onboarding must require ownership and individually schedule policy work or create missing-policy Actions. Current optional setup is explicit, not silently repaired.
4. Decide whether missed recurring obligations should be materialized and displayed as a full backlog instead of the current sequential model. Current implementation retains the dates but exposes one active occurrence at a time.
5. Determine how weekly, automatic and event-driven operational execution should be substantiated alongside human governance Reviews. The tested twelve plans alone cannot prove every CIS operating obligation occurred.
6. Address long-horizon Demo storage capacity separately. The existing five-year multi-framework suite fails near the browser storage ceiling; do not erase history or enlarge the test quota merely to make it pass.

Candidate policy mappings require review of real document content, not blanket additions based on title.

## U. Test Results

- New controlled-clock suite: **8 passing tests**, including the 24-month lifecycle, six cadence cases with three completion timings each, and missed-period backlog.
- Focused frontend identity suite: **8 passing tests**; one new regression demonstrated the original display failure.
- Backend lifecycle/onboarding/framework/Risk/Vendor/Evidence selection: **99 passing tests plus 12 passing subtests**.
- Backend identity lifecycle selection after the fix: **15 passing tests**, including scoped assessor-name regression.
- Optimized local Demo build: **passed** via `node scripts/preview.cjs build`. Existing PlatformAdmin hook dependency, bundle-size and Node deprecation warnings remain. No dependency or schema changes.
- Broader frontend suite: **817 passed, 1 failed; 150 suites passed, 1 failed** in 626 seconds. The pre-existing `multiFrameworkLifecycle.test.js` quota failure reproduced near 4,973,751 stored characters. `tenYearLifecycle.test.js` was explicitly excluded; the separate existing `brawndoTenYear.test.js` did run and pass. Neither result is a blanket claim of ten-year production acceptance.
- Browser: actual client creation/onboarding; all 56 safeguards opened/saved sequentially; status/narrative/N/A validation; Previous/Next, unsaved warning, save/reopen/refresh; owner selection; safeguard Finding/Action; evidence upload/search/origin return; Review creation date, completion/history/next recurrence; dated Review Finding/Action; separate remediation validation; CIS search and status filtering. Related dialogs returned focus and preserved parent context in the exercised paths. The final captured browser error/warning log was empty.
- Not fully verified: every field on every safeguard after separate reload, forced failed-save/network scenarios in this new client, all keyboard paths, screen-reader conformance, real invitation delivery, real backend 24-month persistence, browser restart recovery, and all dashboard calculations through an independent mathematical oracle. These limits are not presented as passes.

Reproduce the new suite from `frontend` with `node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --testPathPattern=cisGreenfield24Month.test`. Set `CIS_QA_OUTPUT_DIR` to an isolated output directory to retain the JSON report and synthetic store. It never writes test program records into production storage.

## V. Final Assessment

**A new CIS-only client can be onboarded and operated through the tested lifecycle without manually reconstructing its relationships. It cannot yet be described as a fully automatic or unqualified 24-month CIS program.** Ownership, individual policy scheduling and operational execution still require deliberate configuration. Framework-origin target dates and the Brawndo-only criteria/verification experience remain gaps against this request's full acceptance list.

The strongest evidence is the preserved 94-occurrence lifecycle, source-derived Calendar/Dashboard checks, remediation separation, repeat-operation checks and actual browser onboarding. It does not establish compliance, real production durability or independent assurance.

## W. Branch Status and Retained Evidence

- Branch: `codex/cis-greenfield-24-month`, based on published refinement commit `e90927ad3918eae18527de5ddb10f28e965190dd`.
- QA commit and final working-tree state: recorded in the handoff after committing this report.
- GitHub `main` remains `20a02a9f64fe4d418dbce8d60955b7d0baedec1e`; the older local `main` ref is `94e3b84265571efe8f3f3eef9dac05de832fcb43`. Neither was changed by this task.
- No QA merge, ChatGPT publication, backend deployment or production change.
- Previous separately authorized Brawndo refinement is already pushed/published at the existing ChatGPT preview URL; this QA correction is not on that hosted build.
- Local browser client remains at `http://127.0.0.1:4179` in the retained QA tab. Demo data is browser-session local; opening another browser/origin does not guarantee the same store.
- Durable local evidence: workspace `outputs/cis-greenfield-qa/24-month-report.json`, `24-month-store.json`, and `incident-reporting-sample.txt` (outside the repository under the parent task workspace). The exported store is labeled synthetic; it is a review artifact, not an automatic production import.

Files changed: `backend/server.py`, `backend/tests/test_identity_lifecycle.py`, `frontend/src/preview/identityLifecycle.js`, `frontend/src/preview/identityLifecycle.test.js`, `frontend/src/preview/cisGreenfield24Month.test.js`, and this report. No Brawndo baseline reset, unrelated client data mutation, dependency update, broad mapping change or schema migration.
