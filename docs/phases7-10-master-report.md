# Omnisciente final hardening report — 2026-09-22

## Release decision

**NOT RELEASE-READY for a real-client pilot.** The implemented source passes the
practical automated and isolated Demo-browser checks, but the current backend
cannot initialize its required indexes on the existing 500 MB MongoDB volume.
Persistent privileged/multi-client browser verification and real email delivery
remain unverified. Standard Sign In remains intentionally disabled in the
published Demo preview. This is not a claim of production security assurance.

Phase 9 is **PASS WITH LIMITATIONS for safe repository/Demo continuation**.
Phase 10 concludes this program. No Phase 11 or unrelated redesign was started.

## Phase 7 — Policy approval authority

- Policy owner, named business approver Contact, and authorized approver account
  are distinct. Naming/linking a Contact conveys no permission.
- A scoped internal administrator may explicitly delegate one Policy to an
  active account already authorized for that client. Delegated read-only users
  may decide that Policy, not edit content, grant authority or gain memberships.
- Preserve existing scoped internal administrative approval; label its use and
  attribute the actual actor. No impersonation of the business approver.
- Submission round IDs and conditional single-document state/history updates
  reject stale/duplicate decisions. Return requires a reason; writers can
  withdraw a pending submission to Draft without acquiring decision authority.
- Compact personal pending list, authority explanation, current document basis,
  comments and history use the established drawer/design language.
- No pre-existing segregation-of-duties/reporting hierarchy rule was modeled.
  Existing authorized self-approval is retained, not represented as segregation.
- Automated-test verified: Contact-only, ungranted account, foreign client,
  disabled account, scoped internal admin, delegated client, duplicate/concurrent
  approval, generic/bulk escalation denial. Demo-browser persona matrix passes.
- See [authority contract](phase7-policy-approval.md) and
  [Phase 7 verification](phase7-verification.md).

## Phase 8 — Exact approval subject

- Submission freezes client/Policy, title, version, summary, owner, business
  designation and uploaded Evidence ID/hash or external document/version ID.
- Each decision carries that immutable subject plus actor, timestamp, authority
  and comment. Later identity/content changes do not rewrite old approvals.
- New content/version returns an Approved Policy to Draft. Pending content is
  locked; missing/mismatched basis prevents submission. Existing history is
  retained; legacy entries are explicitly not retroactively version-certified.
- External references are recorded, not fetched or claimed byte-verified.
  Existing uploaded-file SHA-256 is used; Demo computes real simulated-upload
  hashes. No invented checksum or cryptographic signing infrastructure.
- Policy decisions and archived Evidence remain retrievable under existing
  authorization; Policy deletion cannot erase approval history.
- Automated and Demo-browser verified: external v1/v2 reapproval, unchanged
  prior snapshots, uploaded v3 hash, archived bytes, historical actor changes,
  rejection/withdrawal, foreign tenant denial and reload.
- See [provenance contract](phase8-policy-provenance.md) and
  [Phase 8 verification](phase8-verification.md).

## Phase 9 — Runtime, authentication and authorization

Dedicated Railway project: Omnisciente Development, existing persistent MongoDB;
not the old iVenture test infrastructure. Fixed both missing backend runtime
catalogs and validated bcrypt minimum/encoded-byte bounds centrally. No changes
to role/membership architecture, no fabricated login, no privileged test bypass.

The corrected Docker image imports, but deployment
`ac8d16dc-f470-4e14-b29c-b46d5c1203c0` fails at required index creation:
233,508,864 bytes free versus 524,288,000 required. Source pin is
`da81cdeb25f6ea4b3a303e68c15b548a16662bfb`. The former backend revision remains
the serving API at inspection; do not mistake its health response for the new
release. A volume increase was requested, not performed without cost approval.

Initialization retains required indexes, disables opt-in legacy migrations for
this deployment, and only inserts a configured bootstrap account if absent.
No standard operational sample seed, record deletion, account overwrite, volume
reset or contact-to-user conversion. Demo stays session-local and separate.

A generated-credential live harness was prepared outside Git, with a new-route
precondition. It stopped on the stale deployment before registration. **No live
QA account was created; no persistent authenticated-browser pass is claimed.**
Privileged credentials were unavailable and were not guessed, bypassed or reset.
The separate local standard-auth build was not published; no CORS relaxation.

Automated route-level checks use real FastAPI authentication/authorization and
isolated Mongo mock storage: normalized login, invalid credentials, disabled
accounts, scoped membership, invitations/linking contracts, foreign-client
denial, Evidence access, policy authority and concurrent approval. These do not
establish real multi-user persistent browser behavior. More in
[Phase 9 inspection](phase9-runtime-inspection.md) and
[checkpoint](phase9-verification.md).

## Phase 10 — Personas and operating workflows

All browser results below are **isolated Demo-browser verified**, not real role
accounts. Fictional fixtures change only session data. Execution timestamps are
real; synthetic due periods are explicitly 2026/2027, not fabricated execution
history. No claims of years of actual operational use.

| Persona | Actual browser scope |
| --- | --- |
| Internal program manager / platform administrator | Client relationships, onboarding, governance setup and policy delegation using existing super-admin Demo role |
| GRC analyst | Core operating chain under an explicitly client-scoped existing platform-admin role; no new analyst role invented |
| Client IT contributor | Risk-treatment Action completion using client_contributor; Risk remains open |
| Client executive | Explicitly delegated client_readonly Policy approval/return, pending list and exact version context |
| Auditor | Read-only Finding/Action source navigation to prior Review occurrence and attached historical Evidence |
| Unauthorized/disabled users | Demo approval/assignment denial and corresponding server route tests; not persistent-browser verified |

Workflows exercised across the complementary browser scenarios:

- New client, Contact-only Primary Contact, eligible internal GRC Lead, scoped
  assignment; link/unlink, simulated invitation, disable/re-enable and membership
  removal preserve attribution and do not silently reassign work.
- Four-step onboarding, early validation, save/reload, current handoff counts,
  empty/no-framework client, selected programs, subsequent scope removal without
  deleting assessment history or rewriting original intake.
- Recurring Review creation/start, comments/uploaded Evidence, Finding + single
  corrective Action, completion to next occurrence, source navigation to frozen
  prior occurrence, separate remediation completion and Finding validation.
- Completed remediation appears as one grouped workflow, not duplicate logical
  work. Completion handoff leads directly to the Finding awaiting validation.
- Risk rating/derived score, central reassessment, treatment Action; Vendor
  creation/central annual Review, next review date; annual Policy review updates
  its schedule without approving it. Reapproval remains a separate decision.
- CIS assessment updates, exact applicable denominator/state counts, framework
  placeholders without invented scores, Calendar active/history and rescheduling,
  Dashboard reconciliation, Portfolio and neighboring-module navigation.
- Five canonical clients: Dashboard, Calendar, Reviews, Findings, Action Items,
  Risks, Policies, Vendors, AI Governance, Contacts, Evidence, onboarding and
  Settings; client-specific visible framework links. Read-only smoke compares
  the operational arrays before/after to detect source-data mutation.
- Desktop/compact widths 1440/1280/1024/768 in onboarding/Calendar/Dashboard;
  policy drawer 1280/1024; keyboard selection, Escape, focus, blank login fields,
  deferred Sign In and Demo logout with no standard token.

### Narrow Phase 10 fix

The pending-decision summary could open partial Policy data if a record was
outside the register's bounded result. It now fetches the full authorized current
record on click, shows loading/failure, and cancels stale client/unmount requests.
No new endpoint or permission. Four regression tests fail before and pass after:
full record, failure/retry, client-switch cancellation, mismatched tenant/ID.
The real Demo pending-queue approval/return browser flow passes after the change.

### Friction log

| Area / persona | Observation and impact | Severity | Action / fixed now | Verification |
| --- | --- | --- | --- | --- |
| Backend / all persistent personas | Missing shared catalogs prevented image startup | P1 | Both explicit copies and context entries fixed; discovery-based regression | Tests and container import; next failure is capacity |
| Authentication / new account | Empty/short credential accepted; oversized bcrypt input could error | P1 | Central input boundary fixed in source; not live on old serving revision | Negative and normal-auth route tests |
| Staging / all persistent personas | Existing Mongo volume lacks index-build free space | P1 release gate | Owner approval requested for 1 GB; no data removal/check bypass | Actual deployment error |
| Persistent roles / executive and client users | Legitimate privileged credentials unavailable; live approval/multi-user QA incomplete | P1 verification gate | Do not grant access for tests; finish with provisioned authorized accounts | NOT VERIFIED |
| Policy queue / executive | Partial record could open outside loaded list | P2 | Full authorized read plus failure/cancellation handling fixed | Four component tests and Demo browser |
| Publication / preview viewers | Phase 9 provider publish failed twice | P2 delivery | Saved exact version retained; final publish attempted separately | Native deployment errors; final status in handoff |
| Invitations / administrator | Real delivery integration unavailable in inspected config | P2 limitation | State/denial tested; actual delivery deferred | Automated + Demo, real email NOT VERIFIED |
| Policy / auditor | External reference cannot prove remote bytes | P2 documented boundary | Explicit recorded-reference wording; no claimed byte verification | Source tests and Demo history |

No P0 identified in the exercised scope. The P1 release gates above remain;
there is no claim that untested paths contain no defects. No optional P3 feature
expansion was added. No redesign, generic approval engine, new analytics or
additional roadmap phase.

## Verification ledger

| Check | Result and limitation |
| --- | --- |
| Backend automated | 194 tests in 26 isolated suites + 4 separate client-management tests = **198 passed** |
| Frontend automated | **322 passed**, 58 suites |
| Build / lint | Production preview build passed; existing react-hooks/exhaustive-deps warnings: ClientDirectory:189, PlatformAdmin:52 |
| Type check | No separate TypeScript check configured; JavaScript production compilation passed |
| Dependency consistency | `pip check`: no broken requirements. No dependency changes. No formal independent SAST/DAST/SCA assessment |
| Browser | Phase 4B/4C/4D, onboarding, frameworks/Calendar, approval, provenance, core persona chain and current Contact presentation pass |
| RBAC / isolation | Server-route automated tests + Demo client/persona tests pass; persistent privileged/cross-client/multi-session browser gates NOT VERIFIED |
| Policy provenance | New immutable subjects and historical bytes/actors automated + Demo verified; persistent production retrieval NOT VERIFIED |
| Evidence/audit | Historical occurrence source Evidence, uploaded hash and retained decision actor tested; independent audit/backup assurance not performed |
| Invitations/email | Invitation state, scope and duplicate/disabled rules tested; actual delivery/acceptance against persistent staging NOT VERIFIED |
| Persistent restart | NOT VERIFIED; deployment cannot initialize required indexes |
| Board PDF | Demo explicitly reports server-only limitation; no live successful PDF export claimed |
| Secrets/diff | Full change reviewed; no credentials, environment files, secrets, generated bundles or temporary QA artifacts added to Git |
| Data preservation | No operational migration or sample seed on standard startup; no real data deleted or reset |

Historical external browser scripts needed expectation updates for deliberately
changed Phase 2 Evidence/remediation wording/group counts and Phase 4D invitation
states. Application behavior was inspected before adapting these outside-Git
harnesses; no application rollback or weakened assertion was used to satisfy
obsolete expectations. Configured automated tests were not deleted or disabled.

## Commits and publication

GitHub main and Sites retain their existing separate histories. Every release
uses an equal source tree; no force push or history rewrite.

| Work | GitHub main commit | Local / Sites source commit |
| --- | --- | --- |
| Phase 7 authority | 05df77a2ec34f9284e25587f9b456eab2620196e | 2aa40bd644ca786d4ed085c1e5def2db2fcf7022 |
| Phase 8 provenance | fff9dd41bf0c45df440ddf5bd81ecfc6135a7747 | a33a6b5c2704c66b6791fd18986b5b1b27b64fc0 |
| Phase 9 onboarding catalog | f5fe00d3cb320dfe23845ca515fd46e6bc9ee91c | 02685ed671b21520692e75f98cada8f0041d718f |
| Phase 9 password boundary | b137a40307743836059b7386d3d83c1f423fff93 | be959e6e31482568946aada91e285a7d404e4aa7 |
| Phase 9 management catalog | da81cdeb25f6ea4b3a303e68c15b548a16662bfb | 460688268f11ca31319e4bbdc09a775404098d4c |
| Phase 9 checkpoint | 306f9684b9866a7de557f00c89133b00a72c65ec | 244b6fb45ad4958e327cbf7ec202032a32e09800 |
| Phase 10 | The final commit containing this report; exact SHA in handoff | Same tested tree; exact SHA in handoff |

Owner-private preview: https://iventure-grc-code-preview.mr-robbashea.chatgpt.site

- Phase 7 succeeded: `appgdep_6ab2a61b2b648191b640b665d7ee72e3`, version
  `appgprj_6a9cafcbde888191ae1b350224562554~appgver_64444d872ce881918cb440c0ac88679b`.
- Phase 8 succeeded: `appgdep_6ab2a96834848191b16906aef0517d72`, version
  `appgprj_6a9cafcbde888191ae1b350224562554~appgver_600a09452b2c81918ff8e586c73a06a4`.
- Phase 9 saved exact source, but provider publication failed; retry of that saved
  version also failed. Version:
  `appgprj_6a9cafcbde888191ae1b350224562554~appgver_a488cf2422d88191adaca3ea48850a79`.
- Final Phase 10 publication status/version belongs to the deployment result in
  the handoff, not a pre-publication success claim in this commit.
- Exact tested final browser asset: `main.a41ecc24.js`, SHA-256
  `db24d27750e1f2dbf4283ac85f16510ab6ff7a9304f2d007896483ba7f8439b9`.

The remaining steps require storage authorization, actual authorized role
credentials/integration access, persistent QA and successful hosting publication.
No further product redesign is needed to resume those steps.
