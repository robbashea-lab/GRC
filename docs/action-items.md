# Action Items: one authoritative work record

## Model and migration

The Action Items register now projects only the existing tasks collection.
Reviews and Findings were previously reference rows in a combined view, not
duplicate stored tasks. Those projections were removed; no underlying Review,
Finding, task, evidence, or history was deleted or merged.

Tasks terminate rather than recur. Existing task IDs and foreign keys remain
authoritative in Action Items, Related, Dashboard, Calendar and Review history.
New optional source_type/source_id fields identify the primary origin. The
existing review_id, finding_id, policy_id fields remain; risk_id, vendor_id and
assessment_id support their existing record types. Source relationships are
validated within the task's client and locked after creation. A Review-generated
task inherits the Review's occurrence and Finding without copying the work record.
Finding-derived work preserves historical occurrence provenance after a Review advances.

Legacy source categories are inferred for display only from actual stored IDs.
Unlinked legacy text is retained, labeled Legacy source; missing provenance or
historical attribution displays Not recorded. No timestamps, actors, completion
events or source relationships are backfilled.

## Main register and shared controls

Columns: Action Item, Priority, Owner, Due, Status, Source. Priority storage stays
critical/high/medium/low, displayed as Immediate/High/Moderate/Low.
Source labels use actual linked titles without raw URLs or long internal IDs.
Existing entity drawers open supported sources; onboarding assessments remain
read-only related entries rather than a new Audit module.

Quick filters use shared pure task predicates:

- All: every authorized task, including historical work.
- Overdue: past calendar due date and not done/cancelled; overlaps In Progress.
- In Progress: in_progress.
- Open: open.
- Completed: done, not cancelled.

Default ordering: most overdue, dated In Progress, dated Open, other dated active
work, undated work, newest completed work, then cancelled. Explicit column or
top sort overrides remain user-controlled. Counts represent the authorized
client dataset per quick preset, not the narrowed search result.

The existing TableControls/tableColumns architecture handles column menus,
logical severity ordering, multi-select status/source/owner, date ranges,
AND-between/OR-within filtering, chips, clearing and tenant-scoped session state.
Search combines title, description, owner, source label and stored related IDs.
Dashboard owner/unassigned deep links initialize the same shared owner filter.

## Creation, lifecycle and audit

New Action Item starts Open, with title, optional description, existing priority,
tenant-authorized assignee or Unassigned, optional due date and structured source.
Manual/Internal and external Audit/Assessment need no related record. Existing
onboarding assessments can be selected when applicable; no Audit module is added.
Review/Finding/Risk/Vendor/Policy require a same-client record selection.

ActionItemFields is a small specialization inside the existing RecordDrawer.
Overview/Related/Evidence/Comments/Activity and the existing Evidence repository
are reused. Start Work records actor/time; Complete Action Item records actor/time
without an evidence requirement or wizard. Existing status writes and bulk
operations use the same server contract. Completed work cannot be reopened or
deleted through normal or bulk APIs. Its evidence cannot be deleted after completion.
Comments and supplementary evidence remain available; no successor task is created.

Task completion continues moving eligible linked Findings to Pending Validation
only when all remediation tasks are terminal. Authorized Finding validation is
still a separate decision. Task Activity includes creation, assignment, start,
updates, evidence upload, completion, Finding remediation state and validation.
GET /tasks/{id}/activity authorizes the task and client without granting access
to the platform Audit Log. Related/Activity refresh on open, focus, nested saves
and a ten-second poll. Async drawer responses are discarded after record/client changes.

## Security and integration

Existing roles/capabilities are unchanged. Server checks reject cross-client
source records, assignees and attachments. Contacts are not assignment accounts.
Read-only roles cannot create/edit/complete work. Optimistic concurrency prevents
simultaneous Task saves from silently replacing one another; completion retries
preserve the existing completion timestamp.

Overdue Actions counts only tasks. Reviews retain their own overdue metric and
their distinct Dashboard/Calendar entries. Existing broader GRC attention,
portfolio and upcoming-obligation calculations are not redefined.

## Validation and deliberate limits

Unit/API tests cover source resolution, client isolation, owner restrictions,
read-only roles, manual and Review-linked lifecycle, historical occurrence links,
completion retries, no-evidence completion, retention, legacy attribution,
sorting, filter combinations and corrected task KPI semantics.
Browser QA exercises manual audit/internal tasks and the Awareness Review →
HIPAA Finding → remediation Task → separate validation scenario, plus search,
presets, evidence/comments/history/activity, tenant switching and desktop widths.
Regression coverage includes the existing Reviews workflow, Dashboard, Calendar,
Risks, Policies, Vendors, Contacts, Evidence, Onboarding, Client Settings and compliance.

No task-copy reconciliation was required because the mixed rows were projections.
No saved views, Kanban, projects, subtasks, custom workflows or audit reporting.
Manual Review sources use the current occurrence; choosing a Finding preserves
its historical occurrence. Arbitrary source reassignment is deliberately unavailable.
Registers retain the existing endpoint limits; Activity returns up to 500 events.
There is no new production-database load test or WebSocket synchronization.
The private preview remains the existing browser-session demo. Production FastAPI
deployment is separate; this delivery does not deploy the backend or modify real client data.
