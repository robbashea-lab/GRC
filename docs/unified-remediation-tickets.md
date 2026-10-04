# Unified remediation tickets — implementation and verification

## Scope and baseline

Authorized: implementation, isolated verification, branch push and reviewable PR.
No merge, publication, production mutation, certificate installation or trust changes.
Initial remote main was e3753e9481e10d9d91198a60397a97f1443f6078. Before application
edits, main advanced through PR #28 to 58dd66a (framework workspace cleanup); this
branch fast-forwarded to it. PR #27 (CIS IG2/Initech) remains independent until merged.
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
- Historical completed Actions remain immutable. Reopening a ticket preserves them
  and its decisions; subsequent corrective work belongs to the same stable ticket.
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
- [ ] Establish current-main regression baseline and reproduce integrity defects.
- [ ] Implement shared contract and non-destructive compatibility diagnostics.
- [ ] Repair deletion, retry/audit recovery, validation and audit-item association.
- [ ] Implement shared drawer, lifecycle, creation and unique register/source rows.
- [ ] Verify Demo separately from persistent backend, including failure injection.
- [ ] Run meeting scenario and framework/new-client/added-framework cases.
- [ ] Check keyboard/focus, responsive light/dark, permissions, builds/regressions.
- [ ] Fetch main again, reconcile integrated changes, review diff and open PR.

## Evidence and limitations

Pending implementation. The prior review's passing tests are not acceptance evidence
for this branch. Record actual commands/results here as work proceeds.
