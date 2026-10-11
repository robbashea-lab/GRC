# Shared lifecycle acceptance inventory

Recorded 2026-10-11. This is source inspection and a proposed execution contract,
not a test pass or a readiness verdict. No application changes, test execution,
browser actions, staging writes, account changes, commits or deployments occurred
in this inventory pass.

## Baseline and ownership

- Repository: `robbashea-lab/GRC`.
- Checkout: `platform-acceptance/shared-lifecycle`.
- Branch: `codex/acceptance-shared-lifecycle-20261011`.
- Inspected source: `28b806716024ec149af2ec5da621a5a618c669d5`.
- The coordinator owns shared backend changes, integration, staging and the
  authenticated browser. This workstream initially owns only this inventory and
  its JSON counterpart. Runtime/test files below are proposed ownership, not an
  existing file reservation.
- No repository `AGENTS.md` was found. The user's engineering instructions and
  interface/static-copy freeze apply. Existing history and newer work must survive.

## Authoritative contracts discovered in source

| Area | Current contract and authoritative paths | Existing focused coverage |
|---|---|---|
| Reviews | Stable obligation ID; one atomic document write appends a completed snapshot and advances the current occurrence. The next due date comes from the scheduled period, not completion time. `backend/review_occurrences.py:19`, `backend/server.py:3875` | `test_review_occurrences.py`, `test_review_lifecycle.py`, `test_review_recovery.py`, `test_review_audit_recovery.py` |
| Recurrence | `monthly`, `quarterly`, `semiannual`, `annual`, positive integer `custom_recurrence_days`; `none` is one-time. Persistent day/month-end anchor. A Calendar move stores `recurrence_due_date` for the original anchor; an explicit recurrence-definition change may reset it. `review_occurrences.py`, `shared/contracts/governance-lifecycle.json` | Boundary contract covers Jan 31, fixed Jan 28, Feb 29 annual return, September quarter-end, custom days, invalid/extreme dates |
| Missed work | No generated queue of all missing/future occurrences. Each explicit completion advances exactly one scheduled period; the next can remain overdue. Calendar GET is read-only. `docs/cis-greenfield-24-month-qa.md:128`, `server.complete_review`, `calendar_view.read` | Three-year harness explicitly completes missed April/May periods in June; old ten-year harness performs weekly catch-up |
| Scheduler | No autonomous recurrence scheduler was found. Existing external cron handlers enqueue only overdue/weekly notification digests. `/api/cron/overdue-reminders`, `/api/cron/weekly-my-work`; `_send_overdue_digest`, `_send_weekly_digest` in `server.py` | Notification tests must be isolated with a captured send boundary. No cron secret or email provider should be used; no real mail is authorized |
| Findings / Actions | Linked outstanding actions keep an eligible Finding `in_remediation`; all done/cancelled permit `remediated` (Pending Validation). Explicit authorized validation with rationale closes; no implicit control verification. Multiple actions and original occurrence links remain. Closed/accepted Findings do not auto-reopen. `backend/remediation.py`, `remediation_commands.py`, `server.py` | `test_review_lifecycle.py`, `test_remediation_tickets.py`, `test_create_requests.py`, Demo `remediationLifecycle.test.js` |
| Risks | Linked Review is authoritative for reassessment history/projection. Risk completion records before/after snapshots. Acceptance requires a rationale and future expiry, records a decision, and does not erase exposure. Closure is an explicit action, not ordinary reassessment. `risk_lifecycle.py`, `management_obligations.py`, `server.py` | `test_risk_lifecycle.py`, `test_risk_ids.py`, governance contract and three-year harness |
| Policies | Review completion updates last/next dates without approving the Policy. Approval is separately bound to source/version and authority. Existing approval snapshots/bytes are retained. `policy_reviews.py`, `policy_provenance.py`, `policy_approval.py` | `test_policy_provenance.py`, `test_policy_approval.py`, governance contract |
| Vendors | Vendor Review obligations and immutable occurrences retain purpose/provenance. Vendor dates may be derived read-only Calendar entries, suppressed when represented by linked Reviews. Inactive/terminated records are retained; an upload or completion does not establish assurance. `vendor_governance.py`, `calendar_view.py` | `test_vendor_governance.py`, `test_operating_model.py`, old ten-year reconciliation |
| Evidence | POST makes a new immutable file record/hash, currently `version: 1`; there is no discovered in-place bytes replacement/version-family workflow. Metadata/supporting links have concurrency tokens. Original upload provenance cannot be unlinked. Completed Review/Policy/Control evidence is retained; unlinking supporting links is not deletion. `evidence_library.py`, `evidence_context.py`, `server.py:1853` | `test_evidence_library.py`, `test_evidence_context.py`, `test_policy_provenance.py`; four-quarter test retains four original file records |
| Dashboard | Existing predicates distinguish underlying record populations, eligible ownership, accepted/closed status, date buckets and representation by actions. Detail pages are derived from the same model but must be checked against independent expected identities. `dashboard_contract.py`, `management_obligations.py`, `server.py:2279` | `test_dashboard_contract.py`, `test_dashboard_work_queue.py`, `test_client_dashboard_sources.py` |
| Calendar | Bounded active/history/all projections, occurrence keys, tenant scoping and vendor-derived dates. Read never advances recurrence. History is unwound/projected server-side. `calendar_view.py` | `test_operating_model.py`, `test_review_occurrences.py`, governance/three-year harness |
| Record integrity | Diagnostic reads identify orphaned and cross-client references, malformed containers and ticket inconsistencies. `record_integrity.py` | `test_record_integrity.py`, `test_remediation_tickets.py` |

These are the existing application rules, not newly imposed framework criteria.
Not every safeguard is recurring; state/event/operational requirements must not
receive arbitrary annual Reviews.

## Framework configuration reconciliation

The three CIS views all use canonical `framework_key=cis-ig1` with the client's
`implementation_group`. Separate `cis-ig2`/`cis-ig3` backend keys would be wrong.
`framework_catalog.active_definitions` and `active_plans` are the source bindings.

| Primary configuration | Pinned catalog version | Active definitions | Applicable catalog plans | Important default boundary |
|---|---|---:|---:|---|
| CIS IG1 | 8.1 | 56 | 12 | 7 annual, 2 monthly, 2 quarterly, 1 semiannual |
| CIS IG2 | 8.1 | 130 | 15 | 8 annual, 3 monthly, 3 quarterly, 1 semiannual |
| CIS IG3 | 8.1 | 153 | 20 | Five IG3 additions are optional; existing fresh-client test expects 15 enabled Reviews, not 20 |
| ISO/IEC 27001 | 2022 + Amd 1:2024 | 123 (30 ISMS + 93 Annex A) | 10 | 9 annual, 1 quarterly; organization-defined defaults are not ISO-mandated cadence |
| SOC 2 Security / Availability / Confidentiality | 2017 TSC, revised points of focus 2022 | 38 (33 + 3 + 2) | 8 | 7 annual, 1 quarterly; optional categories remain excluded |

IG3 `passive-discovery-reconciliation` already represents weekly operation using
`custom_recurrence_days=7`, for 1.5, optionally configured by the client. Do not add
a new weekly enum or enable optional plans without the documented synthetic
scenario choosing them. The SOC catalog contains 61 definitions; the primary
38-criterion configuration must not be confused with an all-category derivative.

## Existing longitudinal execution paths

1. `backend/tests/test_ten_year_operation.py`: one CIS IG1 client, weekly operation
   from 2026-09-28 to 2036-09-29; actual ASGI application routes over Mongo mock.
   Deterministic seed `20260928`, module clocks, real-time synthetic tokens. It
   uses a Brawndo reference starting profile and therefore is not a fresh-client
   five-framework acceptance run. Its old recorded totals are historical only.
2. `backend/tests/test_framework_three_year.py`: normal client/onboarding/API
   commands; CIS IG1, SOC Security 33, ISO 123; 2027–2029, monthly/quarterly probe,
   policy approval, vendor/risk work, owner departure, finding reopening, evidence,
   ISO audit packages and yearly reconciliation. It is tied to the 36-month
   `shared/contracts/program-lifecycle.json`; changing that contract globally
   would alter unrelated existing tests.
3. `backend/tests/test_cis_six_year.py`: controlled 2027–2032 operation through
   normal routes, cumulative CIS configuration, saved payload/evidence integrity,
   repeated activation and retained scope-reduction records. Useful derivative
   scenarios; not five independent ten-year primary clients.
4. `frontend/src/preview/frameworkFiveYear.test.js` and
   `brawndoTenYear.test.js`: actual Demo adapter operations with fake clocks.
   Useful independent adapter comparison, but not server storage/authentication.
5. `backend/scripts/verify_mongo_recovery.py`: explicit credential-free loopback
   Mongo origin validation, generated database names, indexed actual Motor/Mongo
   storage, cleanup limited to owned databases. It can run the existing
   three-year and CIS six-year suites. Do not automatically run its bundled
   authentication/recovery campaigns: their authority and safety disposition
   remains separate from this workstream.

The common `ClientDashboardSourcesTests` hook fills fresh-editor idempotency keys
and concurrency tokens. That is valid for ordinary lifecycle submissions, but it
must be disabled for stale/missing-token tests; otherwise it repairs the request
before the application can reject it. Synthetic harness sign-in is not actual
hosted restricted-user or logout/login proof.

## Smallest proposed ten-year addition

Reserve a new `backend/tests/test_platform_ten_year_lifecycle.py` after coordinator
approval. Reuse the existing clock and ordinary route helpers, not a parallel
assessment or scheduling implementation. Keep the original three-year contract
and all completed evidence unchanged.

- Fixed interval: `[2027-01-01, 2037-01-01)`, scheduled-date boundaries inclusive
  of 2027 and exclusive of 2037; yearly checkpoints at Dec 31. UTC clock at
  14:00, with separate display/offset boundary probes for America/New_York and
  Pacific/Auckland. No host clock or live date alteration.
- Five primary clients created through `/clients` and `/onboarding/baseline`,
  one configuration each from the table above; fixtures are distinctive and
  synthetic. Only starting identities/configuration and documented scale volume
  may be seeded; successful occurrences/approvals/closure/history must come from
  commands. Do not use protected staging showcase data.
- Exercise each enabled catalog Review according to its existing configured
  cadence throughout all ten years, not one completion followed by a time jump.
  Maintain operator-event ledgers and verify every completed snapshot annually.
- Add a documented synthetic organization-selected probe cohort for supported
  recurrence boundaries. Independent standard-library date enumeration may use
  `calendar.monthrange` but must not call `review_occurrences.schedule` or mirror
  its output as the expected answer.
- Independent fixed probes: Jan-31 monthly = 120; Jan-31 quarterly = 40;
  Jan-31 semiannual = 20; Jan-31 annual = 10; custom 7 days first Jan-08 = 521;
  Jan-31 one-time = 1, across the chosen interval. These are fixture choices,
  not new source obligations. Continuous/event-based requirements have no
  automatic occurrence count; explicitly selected event dates and ordinary
  supported operator commands determine their count.
- For each year, assert exact expected/actual due dates and IDs, original anchor,
  history hashes, same-client references, duplicate/orphan counts, native
  assessment history, evidence hashes/links, Review-derived source dates,
  independent dashboard totals/paged drill-down identities and Calendar keys.
  Counts remain pending until executed; no assumed zero discrepancy.

### Required annual themes and safe fixture boundaries

| Year | Existing paths to exercise | Limitation / disposition |
|---|---|---|
| 1 | Onboarding; native assessment; evidence; Review start/complete; Finding + multiple Actions; explicit validation; reports | OmniBot browser behavior belongs to framework owners; native workflow does not prove guided-save UI |
| 2 | Late completion and sequential missed-period catch-up; partial remediation; repeated sourced findings | No invented auto-skipping or bulk future occurrence creation |
| 3 | Synthetic owner disable/reassignment; reviewer handoff; retained attribution | Local isolated identities only; live privilege changes require separate authority |
| 4 | New evidence IDs, old completed evidence/hash retained; new Policy approval subject/version; Vendor change | No invented in-place Evidence replacement feature |
| 5 | CIS cumulative upgrade derivative; SOC category derivative; program addition/replay | Primary baseline configuration stays stable; framework-owner scope tests are reused |
| 6 | Risk acceptance/expiry/closure; approved exception decisions; reopen and independently revalidate | Date projection and stored status are distinct; do not invent automatic expiry workflow |
| 7 | Supported client archive/restore; inactive Vendor/Review cancellation/reactivation | Do not erase fixture history; unsupported offboarding effects are report-only |
| 8 | Long operator gap then individual catch-up; duplicate command; failed projection/audit and retry | Notification job delivery is not Review generation. Durable notification-job retry semantics are not specified |
| 9 | Two stale editors with original tokens; simultaneous Review completion; boundary dates; interrupted command | Disable fresh-token hook for conflicts. In-memory pass is not multiworker/driver cancellation proof |
| 10 | Another full operating cycle; handoff; existing exports; first-year reconstruction | Compare original snapshots/bytes/actors, not only counts |

Weekly custom, month ends, leap days, DST boundaries, year boundaries, schedule
cancel/reactivation and operator catch-up are executable using existing state.
No structured Backlog state/promotion workflow was discovered in current runtime;
the documentation's “missed-occurrence backlog” means sequential overdue periods.
Do not implement an unscheduled work Backlog feature under this assignment.

## Bounded scale campaign and actual current limits

No capacity or performance tests ran in this inventory pass. Proposed load is
five independent primary clients, ten years of executed history, plus a separate
explicit volume fixture. Seed only volume records, clearly distinguish them from
executed lifecycle history. Record hardware, Python/Motor/Mongo versions, storage,
indexes, fixture counts, request/query count, warm/cold labels, response bytes,
sample count, median/tail/range and observed errors. No service-level threshold
has been approved; report measurements rather than arbitrary performance passes.

| Surface | Source-inspected boundary | Minimum additional check |
|---|---|---|
| Generic entity register | Above 1,000 records fails 413; no partial results | Exactly 1,000/1,001, preservation, error handling, existing export path |
| Legacy `/evidence` list | Above 1,000 records fails 413 (old ten-year truncation note is stale) | 1,000/1,001; ensure picker remains truthful; compare paged catalog |
| Evidence catalog | Paged results but scans/enriches all matching metadata to compute facets/counts | 100/1,000/5,000 records, first/last page, filter counts, bounded response, measured query growth |
| Upgraded framework workspace sources | Scalar bounded collection reads, 10,000 limit | Relevant volume below/at/above bound, 413 instead of partial status/counts |
| Calendar | 5,000 per source/history/derived Vendor limit; at most 367-day period | Boundary records, short-window narrowing; no silently partial results |
| Review history | Embedded occurrences grow with lifetime; regular register includes full history | Weekly 521/monthly 120 snapshots; BSON size and read bytes; no Mongo-size conclusion from mocks |
| Dashboard / portfolio | Source scans and relation lookups; paged detail is after populations are computed | Count reconciliation at volume, measured query count/latency, compare total and drill-down IDs |
| Audit / exports | Audit API pages; existing CSV export joins further pages | First-year records still recoverable, complete export, no duplicates or tenant mixing |

Potential issues above are coverage gaps/capacity boundaries, not reproduced
application defects. A real loopback Mongo execution using the existing approved
owned-process mechanism can add persistence/index/query-plan evidence after the
coordinator allocates it. It still does not establish hosted access, live worker
disruption, email delivery, production capacity or actual human usability.

## Ownership requested next

1. New ten-year test and isolated fixture/ledger only; no existing contract or
   product source change initially.
2. Optional new scale test with measured results, reusing existing paged surfaces.
3. Coordinator-managed real-Mongo runner integration only after its bundled suite
   and blocked-campaign exclusions are agreed. No broad runner reuse by default.
4. Any demonstrated shared defect gets a separate reproduction and exact file
   handoff before correction; reviewer must independently execute or review the
   changed behavior. No appearance/static-copy edits.

## Prototype execution update (not final acceptance)

The new test is `backend/tests/test_platform_ten_year_lifecycle.py`. Its initial
CIS IG1 Mongo-mock prototype completed ten years with 1,142 occurrences, but its
then-weaker cohort assertions are not the final acceptance evidence. Later
source review strengthened the test, so that result retains its original scope.

The stronger actual Motor/Mongo prototype executed Calendar date-only boundaries
and reconciled CIS IG1 years 2027–2032 with exact annual expected/actual occurrence
counts 115, 229, 343, 457, 571 and 686. It stopped on a harness expectation error
in the Year-7 inactive Vendor rejection: the outer historical-record guard
returns 409 before the inner stage validator. This was not a product defect.
Original partial ledgers and red logs remain in the external shared-lifecycle
evidence folders; no application correction was made.

Other corrected harness mistakes were a private unittest-loop attribute, a
Mongo child database name longer than 63 characters, unsupported generic Review
reactivation, and skipping required Vendor stages. These errors are not counted
as product findings. Source now follows active → offboarding → inactive and
verifies rejected reactivation leaves records/history untouched. Client archive
and restore remains the supported reactivation scenario.

The current draft pins independent catalog inputs, exact Review and record
cohorts, independently enumerated due dates, expected occurrence totals,
captured relationship intents and raw reference existence/client scope. It adds
post-expiry dashboard checks, explicit denied/stale no-effect comparisons,
bounded iteration/progress, source-specific offboarding, exact evidence unlink
and byte retention, and first-year actor/event CSV reconstruction at Year 10.
Runtime diagnostics supplement these independent checks.

Expected record IDs are added only from acknowledged creation of the actual
target, never GET/PATCH reference fields. Initial definition counts/IDs,
requested enabled Review plans and all 17 baseline Policy keys have independent
catalog contracts. Other initial populations are an observed starting graph
used to detect later loss/duplication; this is not an exhaustive proof of their
provisioning rules. Year-6 Finding reopening uses the dedicated `/reopen`
command, checks its new Action receipt/idempotency and preserves old completed
Actions, instead of treating a generic status edit as the normal ticket flow.

Real storage uses only root-owned `mongodb://127.0.0.1:58749` and fresh children
of `platform_acceptance_20261011_tenyear_`; setup ignores ambient connections and
credentials. Cleanup drops only each generated child, never the process or
shared data. The last two reported children were independently reread after
cleanup and had zero collections. Root owns the Mongo process and other suites.

The pure AST-extracted recurrence oracle passed 120/40/20/10/521/1 without
application imports or service calls. Installed Windows TimeZoneInfo validates
the independent New York offset boundary where Python IANA data is unavailable;
the API date-only check does not prove browser/user-timezone display.

Final five-framework ten-year execution, independent retest and bounded scale
interpretation remain pending. The CPU slot was returned to the coordinator;
there is no active service test or independent staging activity in this branch.
No hosted, actual sign-in, restricted-role, notification-delivery or real worker
fault claim follows from these local, modeled-identity prototypes.

Risk: partial/prototype evidence does not establish complete ten-year readiness.
