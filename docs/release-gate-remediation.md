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

## Phase 2 — ENG-14 bounded Dashboard

Contract v2 returns full-population counts and 25 minimal references per preview,
not full register/history snapshots. `detail`, `offset`, and bounded `limit`
(maximum 100) page through the exact same contributing populations. The existing
drawer shows the total and page position; opening a row fetches the authoritative
record through its existing authorized endpoint. Demo uses the same contract.
No source records, lifecycle rules, business metrics, or framework content change.

Mongo reads project only calculation inputs. Repeated Finding/Action and linked
Review membership scans now use lookup sets/maps; the legacy critical-Finding
selection no longer compares full objects in a quadratic list-membership loop.
The shared cross-record obligation calculation remains authoritative. This is
not a wholesale Mongo aggregation rewrite: projected population input and sorting
still scale with client size, including for detail pages. Real Mongo explain plans,
read instrumentation, and persistent capacity remain unverified.

Same `engineering_probe.py` fixtures, ASGI + Mongo mock, tracemalloc enabled:

| Fixture | Before bytes | After bytes | Before ms | After ms |
|---|---:|---:|---:|---:|
| Medium | 17,309,238 | 104,958 | 13,698.6 | 2,917.5 |
| Large | 66,988,251 | 104,979 | 151,470.0 | 11,285.2 |

Medium: 500 Risks, 500 Vendors, 2,000 Reviews, 2,000 Findings, 4,000 Actions,
1,000 Evidence records. Large: 1,000/2,000/2,000/10,000/20,000/2,000 respectively.
Every returned KPI is unchanged: Past Due 8,000/32,000, material Findings
2,000/10,000, overdue Actions 4,000/20,000, overdue Reviews 2,000/2,000,
Unassigned 8,500/33,000; due-window and significant-risk counts zero in these
fixtures (unassessed Risks are not upgraded based on stale stored labels).
These are single-run isolated diagnostics, not an SLA or real-Mongo benchmark.

Large payload attribution before: 52,081,821 bytes in metric item arrays and
14,900,246 in the complete snapshot, with 110,000 embedded record copies for
35,000 distinct records. After: 26,756 bytes in metric previews, 71,900 in posture,
275 bounded minimal references, 99 distinct references. No complete snapshot.
Engineering response target: below 256 KB on these fixtures, with previews
bounded independently of record population; source record data loads on demand.

Verification:

- Offline backend: 308 cases plus 244 subtests passed; includes shared authoritative
  scenarios, all 1,105 detail records traversed without truncation, read-only read,
  cross-client denial, malformed pagination, framework applicability, active
  accepted/closed Risks, omitted large descriptions/history, no mutation on read.
- Frontend: 414 tests / 74 suites passed. The former full-list Demo assertion now
  explicitly verifies the v2 bounded preview/count/no-snapshot contract.
- Production build passed (`main.88aef76a.js`, SHA-256
  `e78fead2a5b3c22980fadfae208f9ddcf716bf3e90f0cb07a11fd0874da23977`),
  with the existing PlatformAdmin hook warning.
- Actual production-bundle Demo browser: 26-item total, 25-item first page,
  second page, authoritative Action drawer, reopening, second-client exclusion,
  zero page errors. Core Review/Evidence/Finding/Action/history/Risk flow passed.
- Initial browser fixture assumed numeric ordering of unpadded string IDs; fixed
  the fixture to use zero-padded IDs. Existing row action button, not plain title
  text, is the actionable control and is what the final browser check exercises.

ENG-14 payload defect: corrected and locally API/test/Demo-browser verified.
Persistent authenticated browser and real-Mongo latency remain NOT VERIFIED.

## Phase 3 — ENG-02 mutation inventory and remediation

Original P1: optional snapshot guards protected some forms but legacy callers and
separate routes could replace a newer edit. A lease prevents simultaneous writes,
not a form loaded before another writer's successful save.

Concurrency classes: A = editor snapshot required; B = conditional domain
transition; C = serialized multi-record operation; D = additive/set operation;
E = deliberately last-write-wins for non-operational preferences.

| Mutation surface | Model and correction |
|---|---|
| Client details/status/relationships | A: required `expected_updated_at`, conditional update, monotonic version; shared dialog and archive controls submit the loaded version. |
| Contact, Review, Finding, Action, Risk, Vendor, Policy, Asset, Exception, Requirement PATCH | A: token is now mandatory (428 missing, 409 stale); existing editable-field and authorization rules retained. Full-form and inline callers supply their snapshot. |
| Assignment / Calendar scheduling / bulk register edits | A: same generic boundary. Bulk checks every supplied record version before writes, then each individual conditional mutation; no transaction claim. |
| Generic / bulk deletion | A plus existing history-retention rules; conditional delete cannot remove a newer version. Batch operations can partially finish if a conflict occurs after preflight. |
| Review start/complete/amend | B/C/D: existing occurrence identity, conditional state, execution lease, immutable completed occurrence and additive amendments retained. No replacement by generic version semantics. |
| Finding validation / remediation | B/C: validation condition includes current version and pending-validation state. Finding-scoped lease also covers generic remediation creates/edits/deletes, acceptance, quick remediation and raising Risk. Paused mid-request test proves validation is rejected while remediation is being created. |
| Risk accept/close | A/C: loaded Risk version plus existing Risk lease and decision history; a stale acceptance cannot revive a closed Risk. Review execution keeps its stronger domain rules. |
| Vendor scheduling/retirement | A/C: loaded version, existing Vendor lease and retained Review semantics. Scheduling returns the updated Vendor so the drawer advances only its own successful version. |
| Policy source, authority, submit, verify | A: explicit loaded version; transport field never stored as business metadata. Approval/rejection/return retain B: approval request identity, immutable basis and conditional state. Approval authority is unchanged. |
| Framework assessment | A: `expected_last_assessed` mandatory, conditional update and history append retained. |
| SOC scope / program applicability | A/C: separate configuration version or Requirement version, client configuration lease for reconciliation; no automatic cancellation of recurring Reviews. |
| Onboarding draft/finalize | A/C: draft version; finalization also compares the Policy/Requirement/Review identities and versions loaded with setup, so a later register edit is not silently replayed over. Child writes are conditional. |
| Legacy onboarding finalize/policy-responses | A/C: per-entry versions required for existing records, preflight followed by conditional writes; library/state exposes versions. No current production UI callers use these legacy routes. |
| AI inventory/intake | A/C: loaded versions, conditional update; existing AI lease retained. First intake creation uses a unique stable primary ID. |
| AI material-change / scheduling / links | D/C: explicit new material-change event with retained audit note and latest-event projection; existing scheduled Review reused; set-add relationships. Not a replacement of arbitrary stale form fields. |
| Account administration/membership | A: loaded version and existing role/member conditions, no broadened account scope. |
| Contact account association | A/B: expected prior linked identity plus conditional association; invitations retain existing account/link checks. No permission changes. |
| Self profile/password | A/B: profile version; password hash must still equal the hash verified by the request before replacement. Existing hashing/session behavior retained. |
| Preferences/favorites/notification read | E/D: latest explicit personal preference wins; favorites add/remove and read markers are set/idempotent operations. No GRC operational record is affected. |
| Evidence | Immutable artifact metadata; new version/upload rather than snapshot replacement. Existing retention/archive and relationship semantics retained. |
| Comments, evidence/record/framework links, baseline additive creation | D: append/set/stable identity semantics, not arbitrary full-record replacement. Existing authorization remains authoritative. |

UI conflicts leave the form/draft intact and display the backend's reload message;
no arbitrary field auto-merge or silent version refresh is added. Onboarding's
queued autosaves advance only from their own successful response. Demo adapters
honor supplied versions, but legacy Demo-only test calls still allow omitted
tokens; the real backend rejects omission. Demo is not authorization proof.

Tests deliberately disable the fresh-editor fixture hook for missing/stale/racing
versions. Existing lifecycle tests have a fixture hook supplying versions for
fresh edits; this hook is test-only and must never be copied into production.
New coverage includes all ten generic kinds, Client, disjoint fields, ten racing
editors, missing tokens, stale bulk edits/deletes, AI first-create race, account
association, profile, legacy/current onboarding, SOC configuration, applicability,
Risk closure and in-flight remediation/validation. Existing Policy concurrent
decision and Review lifecycle regressions remain in the complete offline suite.

Verification: 326 backend cases and 254 subtests passed; frontend suite
414 tests/74 suites passed after the final setup-source-token addition. Production
build passed (`main.6e0852c8.js`, SHA-256
`8d1b91714dc157f70d8fcff1b41b05dd2afecd3fe9a9baf0c38075589f089240`)
with only the existing PlatformAdmin hook warning. Demo stale Finding browser
retained draft and newer record; core Review/Evidence/Finding/Action/Risk chain,
onboarding (four widths, client switching, source drawers) and Policy approval
(external and uploaded versions, unchanged original history) passed. Persistent Mongo,
two authenticated browsers against that Mongo, worker interruption and lease
expiry remain NOT VERIFIED. Multi-document reconciliation is not crash-atomic;
audit failures outside ENG-04 receipts are not claimed recovered transactions.

ENG-02: implementation and isolated tests substantially extended; full release
gate remains NEEDS ATTENTION until the connected two-session and durability checks.
