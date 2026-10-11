# Bounded shared scale and save-reliability contract

Authoring baseline: product tree from `28b806716024ec149af2ec5da621a5a618c669d5`.
Author: product/persona workstream. Root owns registry classification, runtime,
execution slot, integration and shared browser/staging. This contract and its new
test module are authored, not executed. No product correction is proposed.

## Exact registry entry and execution boundary

New module: `backend/tests/test_platform_scale_reliability.py`

Proposed registry category: **offline**, because all HTTP requests use the
existing in-process ASGI harness, signed isolated actors and synthetic records.
Default persistence is `mongomock_motor`. Do not classify that as real Mongo or
hosted role evidence. Root must add the module to `backend/tests/suites.json`
before normal pytest collection; the author does not own that registry file.

After root grants the slot and classifies the suite, use the configured entry:

```text
<existing test Python> -m pytest -c backend/pytest.ini -q backend/tests/test_platform_scale_reliability.py
```

No config/addopts changes, installs, full suite or builds are needed for this
focused campaign. Repository addopts retains its existing two-worker/loadscope
policy; this class remains in one worker. Report output is optional via
`PLATFORM_ACCEPTANCE_SCALE_REPORT_DIR=<run-owned evidence directory>`.

Optional real persistence uses **only**
`PLATFORM_ACCEPTANCE_SCALE_MONGO=mongodb://127.0.0.1:58749` after root separately
confirms the owned server is available. Every case creates one unique
`platform_acceptance_20261011_scale_<16 hexadecimal UUID prefix>` database. The
51-byte name is asserted at or below Mongo's 63-byte limit and a pre-existing
database is refused before fixture use or cleanup registration. The name is
checked again before cleanup, which drops only that exact owned database. It does not
start Mongo, install software, inspect old databases, change a server setting,
or contact staging. A real-storage run remains modeled-identity ASGI evidence,
not hosted restricted-user proof, authentication sign-in, or multiple workers.

## Fixed bounded workload

Interval: `[2026-01-01, 2036-01-01)`, UTC calendar dates. Read reconciliation as of
`2036-01-15T12:00:00Z` patches only `server._now`, never the shared host clock.
There is no random workload seed; identifiers and values are deterministic.
The optional run-owned Mongo database name alone uses UUID uniqueness.

Five distinct synthetic load clients represent CIS IG1/IG2/IG3, ISO and SOC.
Source inventories are independently asserted as 56, 130, 153, 123 and 38 active
definitions (SOC Security, Availability and Confidentiality). These native
records are seeded **volume only**, not proof that onboarding/default activation
or every historical assessment save executed.

Per client:

| Stored volume | Count | Meaning |
| --- | ---: | --- |
| Review records | 12 | Existing monthly-plan shape, one active execution each |
| Embedded completed Review snapshots | 1,440 | 12 plans × 12 periods × 10 years, seeded load history |
| Completed standalone Tasks | 200 | 20/year × 10 years, seeded load history |
| Current open Tasks | 40 | 10 past due; 10 day-30; 10 day-31; 10 undated |
| Retained closed Finding | 1 | Synthetic source for complete relationship lookup |
| Finding-linked completed Tasks | 205 | Tests the approved remediation path beyond an old 200-row display cap |
| Evidence metadata/artifacts | 120 | One monthly file for one plan's actual seeded occurrence IDs |
| Native assessment history | 10 per definition | Synthetic multiline load narrative, no verified evidence claim |

Total regular volume: 60 Review records, 7,200 embedded Review snapshots,
2,225 Tasks, 600 Evidence records, 500 native definitions and 5,000 native
history snapshots. Histories and task descriptions include long synthetic
narratives to catch accidental dashboard/calendar serialization of entire
records. Each Review document remains bounded to 120 snapshots. The workload
is a baseline observation; it is not a claimed maximum service capacity.

Estimated execution is 1–3 minutes with mock persistence or 3–5 minutes with
the assigned real Mongo, pending measurement. The large read case has a strict
240-second harness limit; each of the three smaller cases has a 60-second
limit (420 seconds combined method time). Root should bound the complete
pytest subprocess to 600 seconds including fixture setup, worker startup and
cleanup. Crossing a harness limit is an incomplete execution requiring cause
analysis, not a confirmed application-performance defect. These resource
limits do not add a latency SLA or weaken any existing acceptance assertion.

Separate cap-only cases deliberately create 10,001 small Assets or 5,001 small
Tasks. These are exact documented capacity boundaries, not plausible ten-year
operation or business workflow execution. They use isolated clients/databases.

## Actual route assertions to execute

| Test method | Independent expected result |
| --- | --- |
| `test_five_client_history_reads_pages_filters_relationships_and_reports` | Each client has 445 Task rows. Current work queue contains exactly 52 source IDs (40 Tasks + 12 Reviews), 14 past due, 14 due in 30 days and zero unassigned. Paged/filter/search IDs reconcile; closed seeded history is excluded from active work. |
| Same method: Calendar | The 2035 historical window contains exactly 144 Review occurrences + 20 completed Tasks = 164 distinct keys per client. Correct client/occurrence IDs; no reschedule rights or whole historical narratives in the response. |
| Same method: relationships/Evidence/export | All 205 Finding Actions remain present. Evidence search/paging yields exactly 120 distinct IDs and 2035 year-filter yields 12 IDs. Task CSV contains the complete 445-row source set. |
| Same method: Board Report | Real ReportLab PDF generation through existing `GET /api/reports/board`. Constructor spy delegates to original `Table`; submitted KPI row must be `4,0,0,0`, with exactly four overdue Review rows. The report records five ordinary generation audit events; other seeded business values remain byte-equivalent under read fingerprints. API success is not a discovered UI control. |
| `test_register_export_caps_fail_closed_and_export_retains_complete_set` | Register returns exactly 1,000 Assets; at 1,001 it returns 413 and no partial list. Existing export returns all 1,001; at 10,001 it returns 413 without partial CSV. |
| `test_calendar_limit_and_invalid_windows_never_return_partial_success` | Exactly 5,000 current entries are accepted; 5,001 returns 413 without partial success. Invalid/reversed/over-367-inclusive-day windows return 422. |
| `test_ordinary_record_parallel_stale_and_lost_ack_retry_are_single_writes` | Ordinary Asset audit-side failure after its primary write returns 503; same actor-bound idempotent retry yields one update event. Eight competing saves at one version yield one accepted write and seven conflicts. A stale new intent fails; replaying a completed old receipt cannot overwrite the winning new value. Exactly two total successful update events. |

The normal dashboard payload assertion reuses the **256,000-byte** budget in
`backend/tests/test_dashboard_contract.py`, rather than inventing a new budget.
Nine-row work previews, dashboard maximum page 100, register cap 1,000, CSV cap
10,000, Calendar cap 5,000 and maximum 367-day inclusive Calendar window come
from current source. Latencies/response bytes are measured per actual ASGI call;
no new latency threshold or performance certification is assigned. Three
identical work-queue reads per client provide bounded repeat observations.
The overall median/max mixes routes and is labeled a baseline, not p95 or
throughput. Default mock results cannot establish Mongo query plans/indexes.

The save failure is a scoped ordinary-record audit dependency fault; it does
not call authentication/recovery/invitation/settings/security endpoints, reset
credentials or disrupt a worker/server. No blocked authentication campaign is
rerouted. No account role/membership changes are performed. No external mail,
customer integration, browser state override or hosted fault injection occurs.
Source tracing confirmed that the Asset name-only patch invokes its existing
primary CAS, create-request receipt and ordinary `audit()` insert/upsert. The
Risk/Vendor/Review/Task side-effect branches are not taken; no notification,
SMTP, invitation, credential or scheduler action is invoked. The initial
modeled actor comes from the existing isolated harness and not a login endpoint.

## Known limits and independent review

This campaign cannot substitute for the separately owned ten-year lifecycle:
seeded completed history proves read-volume handling, not saves, approvals,
validation, recurrence catch-up, scheduler restart or human handoff execution.
UI list/filter/browser performance, actual restricted roles, actual logout/login,
fault/tampering facilities and multiworker/server-dispatched ambiguity remain
their existing separate acceptance dispositions.

Independent reviewer should check expected ID sets/caps against the approved
operating contract, inspect optional Mongo guard/cleanup, confirm no source
handler is mocked away, and independently execute the focused cases when a
slot is available. Any failure stays an observed result until the cause is
reproduced and root assigns the exact application file to correct; no product
change or expectation weakening is authorized merely to get green tests.
