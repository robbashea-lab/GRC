# Internal Client Portfolio reporting

This additive implementation supersedes the marketing-style portfolio. The native
client register, operational metric drills, search, filters, sort, archives, client
switching and portal routes remain authoritative. The approved reference is the
supplied `GoverNara_Internal_Portfolio_Interactive_Mockup.html`; its numbers and
events are illustrative and are never copied into customer records.

The loose Agent 1 and Agent 2 prompts were available. The separate packaged
`START_HERE.md`, data/history contract, `OPEN_MOCKUPS.html` and acceptance-matrix
files were not supplied in this workspace. Their contents are not claimed as read.

## Source and metric contract

| View | Authoritative source and meaning |
| --- | --- |
| Total clients | The complete filtered, authorized register cohort; archives are opt-in. |
| Active frameworks | Finalized native onboarding and active applicable program Requirements, grouped by actual program configuration. Supported partial records retain their program identity; unavailable native tracking is disclosed separately. CIS IG1/2/3 are distinct configured programs. |
| Framework progress | Saved native `framework_assessments` conclusions, existing catalogs and scope rules. `addressed` is implemented, `in_progress` partial, `needs_attention` not implemented, `not_assessed` not assessed. Guided drafts are excluded. |
| Recent changes | Actual committed Assessment/Control/Review, Finding, Risk, Policy, Evidence and Scope changes. The card and paginated feed share eligibility, authorization and a frozen cutoff. |

The implementation measure is versioned `native-implementation-v1`. Its numerator
is implemented native items and its denominator is native included implementation
items. Exclusions are shown separately. Zero denominators, unknown conclusions,
duplicate/missing records and invalid applicability do not produce a healthy
percentage. Round only for display. No blended cross-framework score is created.

CIS uses cumulative v8.1 IG populations (56, 130, 153 safeguards) and preserves
recorded justified Not Applicable decisions. ISO retains mandatory ISMS clauses,
included Annex A controls and the full Statement of Applicability as separate
components; undetermined/excluded Annex A does not silently become applicable.
SOC 2 retains its selected Trust Services Categories and category components.
Other native supported catalogs use their actual specification/applicability rules;
unsupported programs show unavailable tracking. Implementation is separate from
assessment resolution, verification, certification, Findings and Risk exposure.

## History and scope

Month ranges use calendar months with UTC day clamping; 30 days is a rolling
30-day window. A baseline must be an actual sample on or before the requested
start. Its actual date is retained, including when older than the selected period.
No sample after the start is substituted. The panel can show an explicitly labeled
current authorized source read before any retained history exists.

Complete historical program scope and ordered opening positions are not retained
by the current source contracts. Individual assessment histories cannot establish
past activation/configuration for an entire program. No historical implementation
positions are reconstructed or backdated. History begins at the first successful
prospective capture for each client/program. Missing intervals remain unavailable.

Snapshots retain catalog/configuration, requirement identities, source versions,
applicability, measure version, counts and source references. Equal totals do not
establish equal scope. Every observed scope transition is retained. Genuine scope
or applicability events between samples also suppress like-for-like deltas, including
change-and-reversion. Event-time markers have no invented implementation counts.
Daily chart observations are discrete; gaps never imply a continuously unchanged
state. View data and snapshot inspection use the same report payload.

## Automatic capture and additive rollout

Existing FastAPI startup initializes the reporting indexes and starts the collector;
shutdown cancels it before closing Mongo. No reporting GET writes source or derived
records. The collector runs every 300 seconds, obtains a shared Mongo lease for
240 seconds and has a 230-second sweep timeout. It reconciles activity/deletions
and captures authorized native source positions without requiring a portfolio visit.
One client failure does not prevent other clients from being captured. Coverage
shows actual first/last captures, last successful sweep, delayed/incomplete status.

Two agreeing source reads and cutoff checks reject a crossed observation for retry.
One unchanged position is retained per UTC day, plus every observed state transition.
Snapshot identity includes client, stable framework family, predecessor, day and
state fingerprint; sequence preserves same-day A-to-B-to-A reversions. Acknowledged
or uncertain repeats cannot create duplicate unchanged observations.

Ordinary native writers atomically store a minimized event envelope with their
source change. After the native audit is durable, the writer idempotently projects
and acknowledges only that exact envelope; concurrent pending facts and the last
event identity remain intact. Failed projection or acknowledgement stays available
to reconciliation. Native responses omit the introduced technical fields while
internal concurrency/replay reads retain them. Identity includes actual business values through a hash, without
storing free text. Failed/no-op writes, technical retries and Evidence link mirrors
do not produce extra business events. Historical actor names and event times are
frozen. Deletion receipts retain pending facts through committed physical removal;
leased takeover, source-token checks and abandoned-intent retirement prevent ghosts.

Retained successful business audits are reconciled in bounded batches from the
last 91 days. That source is explicitly partial: missing before/after facts are
never inferred. Metadata saves need recorded changed values; submitted field names
alone do not prove a business change. Same-value scope receipts are excluded.
Receipt acknowledgement makes retries and late repair idempotent.
Security and access audits keep their existing ownership and are not exposed raw.

Deploy the compatible tested application revision through the existing staging
owner. Initialization is a repeatable additive migration: new reporting collections,
indexes and schema/collector state, reusing native source identity indexes or adding
nonunique identity lookup indexes where absent; no source rewrite, timestamp repair, seed,
retention deletion, destructive rollback or provider setting is required. Failures
leave facts available for a later sweep/restart. Preserve derived collections if
application code must be reverted. Monitor existing database capacity and the
collector's real coverage before claiming operational freshness.

## Access and bounds

Reporting retains internal-role and verified client-scope checks before aggregation.
An empty filtered cohort stays empty. Source navigation reloads the normal authorized
record; absent/archived/inaccessible targets remain unavailable. Activity exposes
only safe enums/counts/scope facts and generic descriptions, never Evidence contents,
notes, credentials or raw audit metadata. Every current source sharing an ID must
belong to the event's client, otherwise access fails closed.

Views are bounded to 500 clients, 10,000 historical observations/scope markers,
and activity pages of at most 100. Over-limit history fails visibly. Activity counts
are independent of page size; cursors bind user authorization, cohort, filters and
cutoff. Client/request changes discard old responses and cancel obsolete requests.
Browser Demo reports use only committed browser-local records and clearly disclose
their provenance; they are not authenticated hosted evidence.

The per-request authorization and minimized output decisions follow the
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
Replay identities rely on Mongo's existing unique `_id` contract and additive
[MongoDB indexes](https://www.mongodb.com/docs/manual/core/index-unique/).
These selected design decisions do not establish whole-application security assurance.

## Verification and release boundary

The three offline portfolio suites cover native scopes/date boundaries, actual
routes, authorization, no-op/failed/duplicate writes, automatic collection, sparse
history and interrupted projection/deletion recovery. Existing native Control,
Review, Risk, Policy, Evidence, framework, remediation and onboarding suites provide
connected regression checks. `verify_mongo_recovery.py --include-portfolio-reporting`
adds the reporting suite to the existing disposable loopback MongoDB harness; the
release workflow runs it against Mongo 8.0 with the existing gates intact.

Frontend checks cover compact cards/register preservation, reporting states,
scope treatment, data inspection, filtering and browser-local parity. Independent
review must keep source/isolated, compiled, local-browser, CI and authenticated
hosted results distinct. Exact results, candidate SHA, CI and staging disposition
belong in the final handoff; this document does not assert a release occurred.

No main merge, production/Sites publication, new hosting, account/grant change,
protected showcase edit or held authentication/fault test is authorized. If the
existing shared staging slot remains held, deliver the tested candidate and its
precise owner dependency instead of overwriting the slot.
