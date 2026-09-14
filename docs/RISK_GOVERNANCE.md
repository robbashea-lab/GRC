# Risk governance implementation

## Authoritative records

Risks retain their existing internal `risk_id`. Assessment uses the shared
likelihood × impact matrix (15 Critical, 10 High, 5 Moderate). Text-only legacy
ratings remain unassessed; they are never assigned invented numeric values.

New assessed Risks start Assessed; legacy/unassessed creation starts Identified.
`in_progress` retains its existing stored value and is displayed as In Treatment.
Creating treatment work can move an assessed Risk into treatment. Completing work
does not close the Risk. Legacy lifecycle values remain traceable and are labeled
as legacy rather than silently rewritten. Accepted is active; Closed and legacy
Retired are historical.

## Display identifiers and rollout

`risk_ids.py` uses a MongoDB atomic counter with tenant-specific `_id` and an
atomically reserved deterministic backfill plan. Existing IDs are preserved;
missing IDs are assigned in created-date/internal-ID order. `legacy_display_id`
retains traceability. UUID relationships are unchanged. Counters survive record
removal; skipped allocations are not reused. Gaps are intentional after aborted
creation. Generic edits cannot set or change the business ID.

All Risk creation paths (normal, Finding promotion, baseline and demo seed) use
the allocator. Existing-ID backfill is resumable on register reads. Existing
scheduled Risk review obligations can be reconciled explicitly with
`backend/migrate_risk_governance.py --client-id CLIENT --actor-id ADMIN`.
This is dry-run unless `--apply` is supplied. It verifies administrator access,
reports invalid schedules/owners, retains assessments and original dates, and
does not invent completed Review occurrences. Review reconciliation is idempotent.

No production database migration was executed as part of the private demo update.
Deploy the backend and review a tenant-specific dry run before applying migration.

## Reviews and dates

One deterministic linked Review obligation references each scheduled Risk through
`risk_id`. It uses the existing Review occurrence, evidence, comments and activity
architecture. Risk updates maintain the link; Review configuration remains the
scheduled obligation. Review configuration authority is unchanged.

Created is system-generated. Acceptance and assessment edits do not stamp Last
Reviewed. Completed Review occurrences set Last Reviewed and advance Next Review
from the scheduled date, retaining calendar anchors. Late annual completion does
not drift the next due date. Historical legacy review dates remain preserved;
their existence does not imply a fabricated occurrence history.

Risk decisions and linked Review execution share a database lease. The atomic
Review history/advancement write retains before/after Risk snapshots. An
idempotent projection repairs a Risk write interrupted after Review completion
when the action is retried or a subsequent Risk mutation occurs.

## Treatment, acceptance and closure

Treatment uses existing decisions. Risk-created Action Items are ordinary Tasks
with locked Risk provenance. Existing Tasks can be linked by ID without changing
their original source. Related and Treatment views query those same records.
The drawer refreshes related work on focus and while open.

Acceptance requires existing administrator authority, rationale and future expiry.
Accepted-by/date and decision history are retained. Acceptance can bring the
single linked Review forward to the expiry; a separately relevant expiry remains
visible through existing operational alerts. It does not create a second Review.

Closure requires administrator authority and a controlled reason, with optional
note. It retains the Risk, related work, evidence and completed occurrences, and
cancels the future linked obligation. Ordinary and bulk deletion cannot remove
Risks or linked Review obligations. Reopening is intentionally not introduced.

## Register and relationships

All Active, Due for Review (overdue or within 90 days), Critical, High, Accepted
and Closed presets reuse the shared column filter capability. Assessment detail
is removed from the main table; Next Review is added. Search includes display ID.
Accepted Risks count as active. Closed/retired Risks do not inflate active cards.
Dashboard scheduling rows suppress equivalent Risk/Review deadlines; Calendar
continues to use the single Review obligation.

Sources use tenant-validated Review, Finding, Vendor or Assessment IDs, or
Manual/Internal, Annual Risk Assessment and Management classifications. Legacy
text remains available. Related assessments have a read-only detail view.
Risk Activity uses a scoped endpoint, not broader platform Audit Log access.

## Validation

- 94 frontend tests in 17 suites passed.
- 60 focused backend tests passed using isolated in-memory Mongo-compatible
  fixtures and real application routes. No live client data was used.
- Identifier concurrency, deterministic/resumable backfill, tenant sequences,
  immutable IDs, assessment/acceptance date integrity, provenance authorization,
  late cadence, closure retention and interrupted-projection retries were tested.
- Browser Risk scenario: create score 12/High, create and complete treatment work,
  reassess to score 16/Critical, complete Review, retain history, accept, close,
  and retain the same Risk/Review/Task IDs; no console errors.
- Production-build browser regressions cover Reviews, Action Items, Dashboard,
  Calendar, Risks, Policies, Vendors, Contacts, Evidence, Onboarding, Client
  Settings and HIPAA/ISO 27001/CMMC routes; tenant switching and desktop widths.
- The static preview is the explicitly isolated session demo. The FastAPI
  backend is committed but not deployed by Sites. Real MongoDB multi-worker/load
  validation remains a deployment-stage check; tests exercise atomic contracts
  with a mock database, not a production cluster.
- Five pre-existing hook-dependency build warnings remain outside this change.

No inherent/residual risk system, separate review or remediation engine,
permanent saved views, approval-chain redesign, or risk reopening was added.
