# Release-gate remediation working ledger

Started 2026-09-23. Baseline inspected, not inferred: clean `main` at
`afecba1bff2d3f8486c7f928be8864bb22fc1cfb`; preceding application commit
`0611f49869bd353f7d5555a76717e8153a44f52b`. The successor changes only
`docs/engineering-health-audit.md`. Separate visual-candidate checkout remains
untouched. This ledger is in progress, **not a release approval**.

## ENG-04 create inventory

Identical business content is allowed for distinct intents in each ordinary
create below. Request identity is not a uniqueness rule for titles or names.

| Surface | Classification | Primary and subsequent writes | Retry boundary |
| --- | --- | --- | --- |
| Client | Generic, multi-step | Primary Contact, Client, scoped admin membership, audits, relationship projection | New durable request receipt and stable primary IDs; retain partial Contact for same-intent recovery, never delete existing data |
| Reviews | Generic, multi-step | Review, Policy date projection, audit | New receipt; deterministic primary insertion; current projection recomputed |
| Findings | Generic | Finding, audit | New receipt; original post-insert audit-failure reproduction |
| Actions | Generic, multi-step | Action, Finding readiness transition, audit, related Vendor/Risk events, Risk treatment state | New receipt; atomic pending-event marker on conditional Finding transition; pending audit recovery |
| Risks | Generic, multi-step | Display counter, Risk, audit, deterministic Risk Review, Vendor event | New receipt; existing primary reused before allocating another display ID |
| Vendors | Generic, multi-step | Vendor, audit, deterministic Reviews | New receipt; preserve existing generated-Review identity |
| Policies | Generic | Policy, audit | New receipt |
| Contacts | Generic | Contact, audit | New receipt; not a platform account |
| Assets, exceptions, requirements | Generic | Record, audit | Same affected generic infrastructure and new receipt |
| Evidence | Generic, multi-step | File document, upload/source audits | New receipt; bytes omitted from replay response, authorization rechecked |
| Review -> Finding + Action | Existing request ID, multi-step | Finding, audit, deterministic remediation Action, Review events, notifications | Existing occurrence/request identity; separate audit recovery not yet closed |
| Finding -> Action | Existing stable ID, multi-step | Deterministic Action, Finding status, audits, notifications | Existing stable `_id`; early-return partial recovery needs review |
| Framework Finding + Action | Existing stable request ID, multi-step | Finding upsert, Action, conditional audits | Existing stable `_id`; conditional audit recovery needs review |
| Framework reconciliation | Existing stable IDs | Requirement assessments and shared Reviews via upserts/link additions | Preserve existing stable IDs; no new framework content |
| AI inventory create | Separate generic, multi-step | Counter, AI record, audit | Same required-key receipt added to this separate route; form retains intent |
| Comments | Additive, multi-step | Comment, mention notifications | Still under review; intentionally separate comments can have identical text |
| Review completion, Policy decision | Conditional domain transition | Existing occurrence/submission history and related projections/events | Preserve stronger existing domain identities; not ordinary creates |
| Onboarding/configuration | Stable configuration/reconciliation | Existing baseline/configuration and deterministic work | Mutation/concurrency phase; not ordinary register creation |
| User provisioning/invitations | Separate security workflow | Identity/invitation/audit/email | No invitation/auth redesign in this program; not generic register creation |

## Request identity and audit decision

Affected generic, Client and Evidence APIs require `Idempotency-Key` (16–128
ASCII letters/digits/underscore/hyphen). Identity is hashed with actor, client and
route; canonical payload fingerprint detects changed-data reuse. Authorization
precedes replay. A pending request returns conflict while another lease owns it.
The existing Mongo `_id` uniqueness boundary protects primary insertion; no new
index prerequisite or replica-set transaction requirement is introduced.

Completed receipts replay the original result, not a fresh mutation. Distinct
keys may create same-title records. Receipts do not expire automatically: TTL
would permit an old retry to duplicate. Storage/retention must be included in
the persistent-capacity assessment; no cleanup/reset is performed here.

Failure after the primary write remains a failure (503 with same-key retry
instruction), not false success. The primary is retained. Audit IDs are stable
inside the create operation; recorded pending audits are repaired on retry even
when a related conditional transition is now a no-op. This is **not** a claim of
cross-document transaction atomicity or proof of arbitrary process-crash recovery.
For the conditional Action-to-Finding transition, a pending-event marker is
stored atomically with the Finding status. Retrying repairs that event even if
the audit receipt itself could not be written; the marker is removed only after
successful audit persistence. A focused failure-before-audit test covers this.

Shared register, Review and Client forms retain their intent after uncertain
failure and prevent changed-data reuse; successful creates start a fresh intent.
The transport also assigns a key for other affected create callers and retains
an existing key when the request config is replayed. Browser reload/unmount loses
in-memory form intent: durable draft recovery and every upload UI retry path
remain to be verified before closure. Keys do not authenticate users.

Mongo's single-document conditional write/unique-index behavior is the design
basis: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/
(consulted 2026-09-23). Isolated mock tests cannot prove persistent crash,
write-concern, lease-expiry or replica-set behavior.

## Evidence so far

- Original unmodified characterization reproduced two Findings after failed
  audit plus fresh retry. It is now a regression asserting one for the same key.
- Focused API tests exercise distinct intents, replay, post-write audit failure,
  pending related audit repair, 5/10/50 requests, malformed/changed keys,
  authorization, all ten generic types, Evidence and Client/Primary Contact.
- Test transport supplies a new key for each distinct create intent, matching
  the frontend. Retry scenarios explicitly reuse one key; this is not title
  deduplication hidden in the fixture.
- A fault-injection test patched an instance accessed by attribute, whereas the
  new shared helper accesses collections by name. It was updated to inject the
  actual collection-class write boundary, retaining the failure assertion.
- Initial frontend failures identified missing Web Crypto in the Jest runtime
  and the newly required request-header assertion. Tests now use Node Web Crypto
  and assert the header; no insecure production random fallback was added.

### Phase 1 verification checkpoint

- Complete offline backend runner: **304 passed, 244 subtests**, eight existing
  FastAPI lifespan warnings. Includes the original regression and real overlapping
  50-request test while the first request is paused at its audit boundary.
- Complete frontend: **411 tests / 73 suites passed**.
- Production build passed: `main.b57265b8.js`; existing PlatformAdmin hook warning.
- Focused lint: zero errors, 19 existing RecordDrawer warnings; introduced hook
  warnings corrected rather than suppressed.
- Core Demo browser script passed against that exact bundle (SHA-256
  `0d8e8a4850106faf410629d79bc2f1e7bfa31c5b9fce98804f772e4dc7cb602d`):
  Review/create/start/evidence/comment/Finding/Action/completion/history/calendar,
  separate validation, Risk score, second-client exclusion. This is not persistent
  authenticated backend browser proof.
- `git diff --check` passed. No runtime dependency or framework catalog changed.

ENG-04's reproduced generic-create duplication is corrected and isolated-test
verified. Persistent durability and reload/unmount recovery of frontend create
intent are **NOT VERIFIED**. Existing stable-ID related-create routes have not
been upgraded to general transactional audit recovery. These limitations remain
explicit; this checkpoint is not a full release-gate or pilot approval.
