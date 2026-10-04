# Unified remediation tickets — implementation and verification

## Scope and baseline

Authorized: implementation, isolated verification, branch push and reviewable PR.
No merge, publication, production mutation, certificate installation or trust changes.
Initial remote main was e3753e9481e10d9d91198a60397a97f1443f6078. Before application
edits, main advanced through PR #28 to 58dd66a (framework workspace cleanup); this
branch fast-forwarded to it. PR #27 (CIS IG2/Initech) then merged to main at
`95b574b0efef1bf1cf22297d6a54ea7266e818c2`; integration commit `d90c8b3`
preserves both CIS configuration recovery and framework ticket creation recovery.
The final remote refresh still identified that main commit.
Worktree: `grc-unified-tickets`; branch: `codex/unified-remediation-tickets`.

## Contract (implement before changing projections)

- Remediation identity is `finding:<finding_id>` throughout its lifecycle. A linked
  Task URL resolves to that same ticket. Standalone or orphan Action identity is
  `task:<task_id>`; a dangling/foreign relationship is reported, never guessed.
- New paired creation records an explicit `primary_task_id`. A legacy unique
  same-client Action is unambiguous and can be projected without migration. Multiple
  Actions without an explicit valid primary are reported as ambiguous: never select
  an active/first/title-matching Action. Preserve every Action inline in the ticket.
- For an unambiguous pair, the primary Action owns action title, assignment, due
  date, planned work and actual resolution. Finding owns issue description, origin
  and validation/acceptance decisions. These authorities never switch on completion.
  Finding-only and ambiguous legacy groups retain their Finding-level coordinator,
  date and recorded remediation title (legacy Finding title fallback), with all
  conflicting Action values visible. No speculative migration or automatic merge.
- One derived lifecycle: outstanding work is Open/In progress/Blocked; finished
  remediation awaits validation; validated Finding is Completed. Acceptance and
  cancellation are distinct. Existing independent Actions remain standalone.
- Resolution is separate from planned work. Evidence remains in existing storage;
  aggregate references and history from the Finding and every linked Action.
- Reopening does not mutate historical completed Actions or their completion
  timestamps, resolution or evidence. It retains decisions and creates new corrective
  work only when no outstanding Action remains. Existing authorized non-lifecycle
  edits are still available; this is not an immutable evidence snapshot.
- All entry points share the ticket drawer and unique-ticket projection. Assignment,
  validation, tenant and evidence authorization remain server-enforced. Assessment
  implementation/verification conclusions are never changed by ticket completion.
- Creation, validation and audit-item association use existing durable command
  receipts. A request identity represents an immutable payload, not a content hash
  used to merge independent business records. Optimistic versions remain required.
- Audit ticket creation persists only the exact item relationship, not unrelated
  workpaper draft edits. Retained source IDs never redirect to another occurrence.

## Checklist

- [x] Read request and instructions; isolate branch; inspect current main and PRs.
- [x] Establish current-main regression baseline and reproduce integrity defects.
- [x] Implement shared contract and non-destructive compatibility diagnostics.
- [x] Repair deletion, retry/audit recovery, validation and audit-item association.
- [x] Implement shared drawer, lifecycle, creation and unique register/source rows.
- [x] Verify Demo separately from persistent backend, including failure injection.
- [x] Run meeting scenario and framework/new-client/added-framework cases.
- [x] Check keyboard/focus, responsive light/dark, permissions, builds/regressions.
- [x] Fetch main again, reconcile integrated changes and review the complete diff.

## Evidence and limitations

### Resolved review findings

The actual issue description is shown under the Action title. Existing Task and
Finding links resolve to the same drawer and stable identity, including links from
Evidence. Completing work saves edits and actual resolution together. Validation,
acceptance and reopening remain in that drawer with platform-role authorization.
Pending validation remains active. Accepted issues with outstanding Actions remain
active; acceptance and cancellation are labelled separately from remediation.

Assessment and Review creation remain one command with optional eligible assignment
and date. Creation does not save the assessment narrative or workpaper notes.
The ISO command now links the exact audit item durably; an unfinished command blocks
advancing its occurrence. Saved confirmation and the unsaved-assessment warning can
be visible together. Sidebar overdue counts use the same unique-ticket projection
as Action Items. No framework implementation or verification conclusion is inferred.

Finding deletion now rejects remediation relationships, retained decisions,
comments, audit history and evidence references. Completed Actions retain their
existing deletion protection. Pending Action commands cannot be deleted.
Task saves, decisions and reopening reuse the existing command receipts and audit
deduplication. Partial writes return failure until required effects finish; replay
does not append duplicate decisions or overwrite later completed receipts.
Payload conflicts and stale versions are tested. New ticket saves/decisions retain
the original intent in actor/client/record-scoped session storage until confirmed,
including across reload. This is tab-session recovery, not cross-device recovery;
the server receipts remain authoritative and recheck authorization.
Contributors retain existing self/unassigned assignment capabilities. An exact
actor-bound retry can recover its own unassignment after an audit failure; current
role and client membership remain required. Changed payloads and new unassigned
edits are denied. Normal API, Demo and disposable Mongo regressions cover this.

### Legacy compatibility diagnostic

No migration is required or run. The existing `migrate_record_contracts.py` report
mode now includes `remediation_tickets`; it does not add ticket repairs or silently
select a primary. Use its explicit database/client/actor arguments on an authorized
target, without `apply`, to inspect real legacy records.

Synthetic diagnostic fixture verified by `test_ticket_diagnostics_preserve_ambiguous_assignments_without_repair`:

| Ticket | Diagnostic | Retained work |
| --- | --- | --- |
| finding:f | ambiguous_primary_action | Action one: owner a, done; Action two: owner b, blocked; one outstanding |
| finding:empty | no_action | Finding retained, no invented Action |
| finding:bad | primary_action_unavailable | Stored foreign primary retained and flagged |
| task:orphan | linked_finding_unavailable | Action retained; missing Finding identity retained |

Single-Action compatibility and explicit-primary selection are separately tested.
Every historical Action appears within the shared ticket with its own assignment,
date, plan, resolution and status. No title matching, first-active selection or
record merging occurs. Missing Review occurrences are unavailable rather than
redirecting to the current occurrence. Fresh Demo seed ID remapping also updates
the explicit primary pointer; persisted production records are not rewritten.

### Verification commands and evidence

Baseline before implementation: backend 47 passed plus 31 subtests; frontend
6 suites / 36 tests passed. Five new regressions failed before their fixes
(contradictory retry, source audit recovery, validation audit recovery, retained
Finding deletion and stale validation).

Backend focused final run:

```text
python -m pytest tests/test_remediation_tickets.py tests/test_framework_governance.py tests/test_review_recovery.py tests/test_action_items.py tests/test_iso_audit_program.py tests/test_record_integrity.py tests/test_cis_ig2.py tests/test_auth_boundaries.py tests/test_edit_versions.py -q
```

99 tests and 41 subtests passed. Includes normal FastAPI routes, assignment,
cross-tenant reads/writes/decisions, stale tokens, acceptance and recovery.
Acceptance still requires an explicit version token. Its missing-token regression
disables the existing fresh-editor fixture hook so the test cannot silently supply
the missing precondition. Existing FastAPI lifecycle deprecation warnings remain.

Persistent verification:

```text
python scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27792 --include-program-lifecycle --include-cis-ig2 --include-remediation-tickets
```

72 checks passed against MongoDB 8.0.28 on loopback. Each check used a generated
disposable database and removed only that database afterward. Includes reconnect,
injected audit/acknowledgement failures, 36-month CIS/SOC/ISO operations, CIS IG2
scope recovery and ISO five-year audit history. Expected injected ERROR logs are
not unexpected test failures.
After the final assignment-recovery and pending-deletion guards, rerunning with
`--include-remediation-tickets` (without the two program flags) passed all 64
checks, including the new contributor recovery regression and ISO audit history.

Frontend uses the repository CRACO/Jest runner with `CI=true`,
`--watchAll=false --runInBand`. Long-running lifecycle suites are run separately
from the remaining regression suite; no assertions or timeout gates were relaxed.
Final broad run with `--testPathIgnorePatterns='brawndoTenYear|frameworkFiveYear|cisGreenfield24Month'`:
**196 suites, 1,338 tests and one snapshot passed** (445.7 seconds). This includes
the multi-framework five-year suite. The earlier broad run exposed four obsolete
two-drawer/identity-changing assertions; those were replaced with one-ticket
outcome assertions and the complete broad run above passed. A DialogTitle warning
is still emitted by RegisterDrawers tests; no whole-application accessibility
conformance is claimed.
The separate Brawndo ten-year and CIS 24-month suites passed. The five-year
CIS/SOC/ISO suite initially timed out in its CIS case during concurrent heavy
verification; its isolated rerun passed all three cases in 131 seconds with the
original timeouts unchanged.
Normal `craco build` and `node frontend/scripts/preview.cjs build` passed.
Both retain the existing oversized-bundle advisory; no dependency changes.
The configured read-only `node scripts/dependency-audit.cjs` queried npm advisories
for 1,304 installed public package names. It reported matches in unchanged Axios
1.18.0, braces 3.0.3 and legacy SVGO 1.3.2 (the installed nested SVGO 2.8.4 is
also listed in the inventory, not necessarily affected by each match). This is
not a clean dependency scan or a reachability assessment. Separate dependency
triage is required; this ticket PR does not introduce or upgrade dependencies.

Browser reproducibility: start the Demo with
`node frontend/scripts/preview.cjs start --host 127.0.0.1 --port 4387`, then run
`frontend/scripts/verify-remediation-tickets.cjs` and
`frontend/scripts/verify-ticket-sources.cjs` with Playwright available to Node.
These use isolated browser storage, synthetic records and loopback-only requests.
Reports: `unified-ticket-browser.json`, `unified-ticket-sources.json`.
Screenshots: `unified-ticket-mobile.png`, `unified-ticket-dark.png`.

The meeting scenario passed ten consecutive CIS assessments, three tickets with
different owners/dates and an unassigned ticket, source/register completion,
in-ticket validation, actual resolution versus planned work, evidence retention,
refresh, exact origins, reopen and standalone completion. Counts stayed unique.
Representative source cases passed SOC 2, ISO clause 4.1, Annex A A.5.1, Initech
CIS IG2 safeguard 1.3, ISO audit-item association after discarding unrelated notes,
historical Review occurrence, new-client onboarding and later ISO activation.
Mobile checks cover viewport bounds, internal overflow and keyboard focus; dark
screenshots use the app theme and wait for animation completion.

### Boundaries and review

Authenticated browser E2E is **not verified**: the local Demo configuration disables
standard sign-in and there is no deployed authenticated test environment in this
execution. Normal backend behavior was tested separately through real routes with
isolated identities and Mongo, not represented as identity-provider/TLS/browser
assurance. No certificate, machine trust, production backend or real client data
was changed. No published preview was updated.

The old tests expecting two drawers, identity-changing rows or separate Finding
validation were replaced with observable unified-ticket assertions, not dropped.
The implementation follows the existing assignment, evidence, concurrency and
Review receipt mechanisms (Ponytail: reuse rather than introduce a workflow engine).
Review references consulted: [Google's code-review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
(design/functionality/tests), [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
(least privilege and every-request checks), and [Playwright best practices](https://playwright.dev/docs/best-practices)
(isolated user-visible tests).

This is self-reviewed implementation and automated/browser verification, not
independent security assurance. The PR should receive normal independent review
before any separately authorized merge or publication.
