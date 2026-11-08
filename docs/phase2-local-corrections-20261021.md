# Phase 2 local corrections

Authorized scope: enhanced Portfolio availability, whole program-tile activation,
native wide Portfolio preview, and canonical Brawndo annual Policy Review coverage.
This change does not authorize publication, deployment, or shared-data migration.

Isolated branch: `codex/phase2-corrections-20261021`, based on local commit
`dd0324db7f4f752ff51c362a32e7143a4163ae5b` (tree
`54da4dbbc2ed24cf5b0ff37d647817bbd1846ccf`). The audit's published baseline
`4e308e8f5a409da53c236433656b0bd29fde9fff` is a different commit with that same tree.

## Domain decisions

Portfolio presentation follows the existing internal administrator route and
server-returned client cohort. It no longer depends on the selected client or
Explore mode. Operational module rollout gates remain separate. History must
match the requested client, program, and available framework/catalog/group scope;
missing data remains unavailable.

Annual Policy coverage belongs only to the canonical `demo_brawndo` program
Review with `baseline_key=policy-review` and no individual `policy_id`. A title
match cannot confer this behavior. Annual is the new default; existing scheduled
due dates remain the anchors. Existing explicit schedules and historical
completions are not rewritten. A stored quarterly canonical Review must be
explicitly reconciled to annual before completing the annual set.

Coverage freezes exact approved subject/version identities at completion cutoff,
including an effective approved version beneath a pending replacement draft.
Approval actors, dates, signatures, and draft content remain authoritative and
unchanged. Native inactive, retired, archived, missing, and future-effective
records are excluded. The current model has no independent revocation or
effective-date-range registry: coverage cannot certify information absent from
the native lifecycle and approval records.

The server retains a private pending journal before covered writes. An interrupted
completion remains open and retries its frozen request, membership, actor, and
cutoff. Covered child occurrences and policy history are replay-safe; the annual
occurrence commits only after reconciliation succeeds. Valid later edits and
independent completions must be retained. Cancellation is a coverage relation,
not an invented completed child. Pending records cannot be deleted. Public
responses must omit the private recovery journal.

Catch-up advances from scheduled calendar anchors to the first following date
after cutoff. Skipped dates are schedule metadata, never fabricated completed
occurrences. Single-policy completion remains independent. Demo uses its
existing atomic browser-store write rather than a second server journal.
Recovery preserves a later definition's actual anchor; a Calendar move retains
the original cycle. Changing cadence to one-time ends the completed definition
without fabricating a following occurrence. Activity dates use the schedule
actually persisted, including Demo catch-up.
The existing annual Policy card prefers this canonical program Review, including
before membership is first recorded. An earlier independent draft-policy
obligation must not replace its identity, completion date, or annual anchor.

## Migration and rollback

No shared-data migration is included or executed. Before any later rollout,
inventory canonical definitions, explicit due dates/cadences, immutable approval
subjects, duplicate linked annual obligations, and pending recovery journals.
Resolve conflicting dates or missing approval identities explicitly; do not infer
approval from a status label or manufacture an annual date. Test a backed-up
copy and obtain the separate release/data-change authorization.

For rollback before publication, discard this isolated branch. For a future
deployed rollback, retain completed occurrence/version coverage and recovery
journals. Finish or repair pending executions with compatible code before
reverting the implementation; dropping journals or restoring an older database
would lose genuine committed history. A code rollback is not a data rollback.

## Evidence boundary

The coordinating chat saves execution receipts under
`outputs/Phase2-20261021` in its workspace. Component, native Demo adapter,
authenticated server-route, compiled-browser, and durable-storage evidence are
reported separately. The frozen Phase 1 audit retains its 45-row denominator.
Passing local checks does not establish hosted acceptance or human approval.
