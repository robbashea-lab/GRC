# Record contracts and relationship ownership

## Writable data

`server._editable_patch` remains the trusted allowlist for normal and bulk writes.
The Pydantic entity model determines available fields; that function separately
rejects protected decision/history fields, invalid lifecycle changes, derived
values, client moves and unknown fields. Dedicated decision endpoints retain
their authorization and transition checks. Demo's write path normalizes the same
legacy aliases from `shared/catalogs/recordAliases.json`.

An explicit canonical edit also updates its compatibility alias if that alias
already exists. This prevents clearing a date from reviving an old fallback;
unrelated edits leave historical aliases unchanged. Existing audit history
retains the prior values. No compatibility fields are removed by migration.

| Domain | Canonical input/state | Compatibility behavior |
| --- | --- | --- |
| Vendor service | `service` | A legacy `services` input maps to `service`; differing values supplied together are rejected. Existing `services` data remains stored and readable. |
| Vendor contract | `contract_expiration` | `contract_end` input maps to `contract_expiration`, with the same conflict rule. Existing fallbacks remain readable. |
| Action assignment | `assignee_id` | Existing `owner_id` remains a read fallback; new direct `owner_id` writes are not added to the API. |
| Vendor lifecycle | `onboarding`, `under_review`, `active`, `offboarding`, `inactive` | Existing `terminated` projects as `inactive` with `legacy_status`; it is not offered as a new lifecycle value. The existing domain validator controls transitions. |
| Risk lifecycle | New Risks derive `identified`/`assessed`; treatment uses `in_progress`, acceptance and closure use their decision actions | Existing `open`, `treated`, `escalated` and `retired` values remain compatible. They are not silently mapped into different business meanings. |
| Policy state | Lifecycle and reported/verified presence remain distinct | Existence is not approval. Dedicated verification/approval actions own their metadata. |
| Review state | Lifecycle, schedule anchor, occurrence ID and immutable occurrence history | Period/next date are derived. Completion/advancement is a command, not an editable status value. |

The shared `grcRules.json` remains the vocabulary used by existing operational
queries. This work does not infer numerical Risk scores from old text ratings or
fabricate approval, acceptance, completion or verification metadata.

## Relationship authority

| Relationship | Owner and read behavior |
| --- | --- |
| Recurring work and completed executions | Review and its `occurrences` history. Policy, Risk and Vendor dates are projections; Calendar reads authoritative records. |
| Finding origin | Finding's direct Review/occurrence, Risk and framework assessment references. Historical execution links do not follow a Review's later current occurrence. |
| Action origin | Task's direct Finding/Review/occurrence and `source_type`/`source_id`. `action_items.prepare` validates new links and protects the original provenance on edits. |
| Framework Review drivers | Review driver/mapping metadata establishes framework contribution. Assessment `related_links` also retains intentional supplemental links; explicit assessment provenance takes precedence over inherited Review applicability. |
| Evidence upload provenance | Evidence's `linked_type`, `linked_id` and occurrence reference. Its `relationships` array owns explicit supporting links. |
| Vendor assurance/contract Evidence | Vendor artifact and contract Evidence references; the Evidence browser discovers these through its existing resolver. |
| Policy approval document | Policy approval subject and immutable decision history, including the version of Evidence used in the decision. |
| Organizational control and ISO audit Evidence | Control current/history snapshots and ISO audit Review/occurrence snapshots respectively. |
| Historical reverse-link compatibility | Existing Risk task arrays, assessment links and negative Evidence overrides remain readable. Conflicts are reported for review; the checker does not choose a winner. |

`record_integrity.inspect_client` reports malformed or missing relationships,
cross-tenant references, unknown Review occurrences, conflicting explicit source
references, duplicate identities, invalid edit versions and contradictory legacy
aliases. It checks direct, supplemental and the supported immutable Evidence
references. It never rewrites relationships, merges records or deletes history.
No compatibility read has been removed.

## Dry run, apply, recovery and rollback

The new maintenance command requires explicit connection-variable, database,
client and actor arguments. It does not import `server` or implicitly load a
configured application database. Example with a disposable fixture database:

```powershell
python backend/migrate_record_contracts.py --mongo-url-env GRC_TEST_MONGO_URL --database isolated_contract_check --client-id synthetic-client --actor-id synthetic-admin
```

Reporting is read-only. The only proposed repairs backfill a missing canonical
Vendor service/expiration or Task assignee from its exact legacy value. The alias
is retained. Contradictory pairs and ambiguous relationships require a human
decision and are never repaired automatically.

Applying requires `--mode apply --run-id <stable-16-plus-character-id>` plus
`--confirm-database isolated_contract_check`. Writes are restricted to explicitly
confirmed database names beginning `isolated_` or `test_`. The tool rechecks an
active program administrator's client membership for every invocation, including
recovery and rollback.

Before writing, a durable `record_contract_migrations` receipt records the exact
plan and original field presence/values. Conditional writes check those values
and the original edit version. The receipt and per-record marker recognize lost
write acknowledgments. Retry the same apply command/run ID to finish pending
repairs. A conflicting operator edit is reported and preserved.

`--mode rollback` with the same scope/run ID restores only the fields added or
changed by that run. Its conditional after-image check refuses to overwrite
subsequent edits. The original legacy fields and all record identities remain.
Rollback itself is repeatable, and a run that began rollback cannot be reapplied.
Its retained receipt is the recovery record; it must not be deleted mid-recovery.

The synthetic fixtures exercise dry run, application, exact replay, interrupted
write recovery, rollback, concurrent-edit protection, tenant boundaries and
authorization. `shared/contracts/record-aliases.json` supplies identical alias
inputs and expected outcomes to backend and Demo tests. The disposable loopback
Mongo recovery runner also executes the migration scenarios on real Mongo.

Representative stored tenant data has not been supplied for migration review.
That remains a release gate for any broader data change: inspect a sanitized
representative export, review every reported conflict, retain a backup, and
independently review the explicit target and recovery plan. This task never
runs the maintenance command against shared or production data.
