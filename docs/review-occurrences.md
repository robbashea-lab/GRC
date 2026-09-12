# Reviews: stable obligations, immutable executions

## Lifecycle and implementation

Review remains the existing Mongo document and authoritative obligation ID. Its
root due date/status/owner continue feeding Calendar, Dashboard, Action Items,
onboarding and compliance links. Completion appends an immutable execution
snapshot to occurrences and advances the root in **one atomic update**. It never
creates a second Review. One-time completions remain accessible through the
register's compact Review history link.

backend/review_occurrences.py and frontend/src/lib/reviewOccurrences.js contain
calendar scheduling/projection helpers. Monthly, quarterly, semiannual and annual
increments use the scheduled due date, with a persistent day/month-end anchor.
January 30 → February 28 → March 30 does not drift; September 30 quarterly advances
to December 31. Late completion preserves the original scheduled period. Custom
day recurrence remains supported without introducing new recurrence values.

ReviewDrawer specializes the existing RecordDrawer entry point and reuses its
Sheet, fields, badges and nested live record drawer. Tabs remain Overview, Related,
Evidence, Comments, Activity. History is a compact Overview section. No scope,
follow-up or mandatory questionnaire is required to complete. The existing shared
table controls remain; reviewMatches is the shared operational predicate for
quick presets and column status constraints.

All is the default active register, ordered by due date (empty dates last).
Overdue and In Progress overlap. Upcoming is due today through 90 days. Missing
scheduling information is not silently treated as scheduled. Historical and
cancelled records are not active obligations.

## Record relationships and audit

New Findings and Tasks retain client_id, review_id, occurrence_id and
finding_id as appropriate. Evidence and Comments are tagged with occurrence ID.
The active Review's Related tab queries real records across its occurrences;
historical views filter by the selected execution. No statuses are copied into
the Review. Tabs refresh when opened, after nested saves, on window focus, and
every ten seconds while Related/Activity is visible.

Task completion records completed_by and completed_at. Existing Finding
workflow remains: completed remediation → remediated (Pending validation), then
an administrator validates with a rationale → closed, with attribution and
closure timestamps. Existing audit logs hold major Review, evidence, Finding,
Task and schedule events, tagged to their occurrence. Current Activity covers the
obligation; historical Activity is occurrence-scoped.

## Integrity and permissions

- Existing writable roles perform reviews. Only super_admin / platform_admin
  configure them. Occurrence/next date/history fields are never generic writes.
- Start/Complete and occurrence attachments require the displayed occurrence ID.
  Notes/configuration updates carry expected_occurrence_id; stale updates fail.
- Completion retries return the same stored outcome. Raise Finding uses a
  per-submission request ID; remediation Task creation uses a deterministic ID.
- A database lease serializes Review mutations across workers. Operations time
  out before the lease expires; release is conditional on the owner token.
  A concurrent action returns a retryable conflict rather than advancing twice.
- All record/occurrence/evidence/comment/activity lookups authorize the parent and
  constrain results to its client. Review owners must have access to that client.
- Completed snapshots and referenced evidence cannot be deleted through normal
  or bulk APIs. Calendar carries the occurrence ID for safe administrator
  rescheduling; reviewer roles cannot alter Review schedules through Calendar.

## Existing data and rollout

No destructive migration or production data rewrite is performed. Existing
records without occurrence IDs are projected as occ_<review_id> until changed.
Untagged legacy evidence/comments/findings/tasks belong only to that initial
execution, never to future recurrences. Historical evidence bytes and hashes are
retained; execution snapshots preserve actual notes, timestamps and identifiers.

Explicit parent_review_id chains provide legacy history without matching titles
or inventing completions. The existing active leaf becomes the stable obligation
going forward. Completed legacy records with incomplete metadata remain marked
legacy; missing outcomes/actors are not fabricated. Ambiguous duplicate chains or
completed legacy obligations without an active successor are not automatically
merged or restarted. They remain available for administrator reconciliation.

The owner-private Sites publication is the existing browser-session demo.
Deploy the matching FastAPI code to the production backend separately before
using the updated production frontend against it. This delivery does not run a
production migration, change production credentials, or deploy FastAPI to Sites.

## Validation

- Frontend suite: existing regressions plus recurrence anchors, scheduled labels,
  occurrence linkage and overlapping status/date predicates.
- Isolated FastAPI/Mongo-mock tests: BCP/DR → missing BIA → linked Task; completion
  while remediation remains open; late Q3 completion; stable IDs; history and
  evidence/comment retention; task completion and administrative validation;
  one-time completion; Calendar/current obligation; tenant/role restrictions;
  retry idempotency, concurrent completion and stale lease recovery.
- Browser workflow on the built demo: notes, evidence, comments, Raise Finding,
  complete, work/complete Task in Action Items, validate Finding, live Related and
  occurrence Activity/history; one-time history; quick and column filters/search,
  filtered empty state/clear; contributor read-only metadata; client switching;
  desktop widths 1100/1440; no console errors.
- Route smoke: Dashboard, Calendar, Reviews, Action Items, Risks, Policies,
  Vendors, Contacts, Evidence, Onboarding, Client Settings, HIPAA, ISO 27001, CMMC.

Known limits: no saved views/custom workflow builder; no production-database
load test; history is embedded and uses Mongo's existing document-size ceiling;
cross-tab external edits refresh on focus/poll rather than WebSocket push; legacy
records retain only the completion information actually recorded.
