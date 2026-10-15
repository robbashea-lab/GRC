# Brawndo Explore demo Risks visual pilot

Owner: local Risks chat `01a14116-9e44-72f3-9a7a-392b6de811f0`.
Branch: `codex/brawndo-demo-risks-20261015`.
Native working baseline: `4abf774ea9313721eaf434fa567eace27ddb4864` (Portfolio PR83).
Integration parent: `a455f5e314b101c6d4ad3394ea35a2e30110d3ac` (Actions PR85,
on Dashboard PR84 `d7e693613845973ee5600ad3cf4dfc4a49e9ce73`).

The user authorized execution of the Risks prompt with its HTML and coordination
audit. The package owner supplied WORKFLOW_PRESERVATION, START_HERE,
IMPLEMENTATION, ACCEPTANCE and REFERENCE_NOTES. The native workflow freeze governs
every conflicting mock behavior. No fixture rows or schedules were imported.

## Scope and implementation

The new presentation requires AuthContext workspaceMode and user.workspace_mode
both demo, an identified actor, resolved authorized active currentClientId and
currentClient.client_id both demo_brawndo, and exact /risks pathname. Provider
loading/errors, archived/mismatched clients and old response scopes fail closed.
This is presentation gating; native API authorization is unchanged.

RiskRegister retains its native controller, seven view chips, search, sortable
columns, category/level/owner/status filters, query aliases, Portfolio significant
entry, full export handler and direct full RecordDrawer opening. The new overview
uses the current native pre-cell cohort for its 5x5 matrix and the complete loaded
authorized register for summary counts. Native assessedRisk/riskLevel/riskCoordinates
and the executing riskMatches predicates remain authoritative. Unrated access,
due-today/overdue versus strictly-future +30, and current acceptance validity stay.

Coming up is a read-only projection of active Risks' saved next_review and recorded
acceptance expiries, plus every outstanding linked Action deadline returned by the
existing /related contract. Up to four relationship requests run concurrently;
partial failures are visible as unavailable. Foreign child identities are excluded.
The display horizon is today through six calendar months, clamped at month end;
it never schedules work. Every event retains its risk/source identity and date.
Event opening re-reads the canonical record and checks exact ID/client/current
scope. Opening or closing another native dialog invalidates pending event openers.

The overview, four-band palette, row bars and metadata are under a unique gated
wrapper. Non-chart tokens/fonts and the existing shell are reused. The only shared
shell change is the same exact route gate selecting BY PRESTIGE WORLDWIDE.
No global predicate, drawer style/default, backend, schema or dependency changes.

## Native workflow preservation and mock deviations

The full Risk drawer and six tabs remain Overview, Assessment, Treatment, Related,
Review History, Activity. Assessment remains a draft until native Save or existing
save-before-command. Review Risk still opens a real Review; native completion,
outcomes, evidence and cadence/history remain. Accept/renew/close forms, versions,
permissions, linked Action independence, evidence bytes and demo persistence remain.

No reduced editor, selector autosave, review-today shortcut, quarterly assumption,
Undo, sensitivity advice, bulk action, replacement CSV or background writes added.
The genuine native Demo storage/recovery notice is retained, unlike prototype
banner text. Last Review and all native controls remain despite mock omissions.
Coming up is scrollable without truncating entries. Risk/Action dialogs keep their
current presentation, including nested source/occurrence paths.

## Verification and current delivery state

Before edits: six focused native suites / 23 tests passed on unchanged Risk sources.
The same six passed after initial integration. New gate/projection/caller tests
cover unknown/negative scopes, UTC/month-end dates, unrated/clear behavior, same-day
distinct Actions, partial/cancelled reads, no chart writes and exact record opening.
An independent AI reviewer found a new delayed-opener draft replacement race;
it was corrected and regression-tested, including close/revival, actor changes,
New Risk and Risk Scale. Final independent source review found no further action.
This is AI review, not human approval.

Local browser comparison against a separate exact 4ab baseline verified direct full
drawer/tabs, draft Cancel/discard, native Review execution and confirmation, actual
Review completion/history and scheduled next date 2027-03-19 from 2026-12-19.
Candidate dirty Review action retained the native pre-save and real Review flow.
Local browser data is disposable Explore demo state, not staging/customer writes.

Current source checkpoint requires exact-head cumulative CI/build and hosted
verification before release claims. Subsequent receipts belong with the PR and
the Risks output handoff. Do not treat inherited module receipts as cumulative CI.

CI188 passed all 327 frontend suites (9,560 tests), both frontend builds and the
Mongo gate. Its two backend attempts lost a Python worker with SIGSEGV midway
through the 60-second timed faulthandler dump, then exceeded the unchanged
30-minute deadline. Different active tests failed when their worker disappeared;
neither attempt established an application assertion failure or a root cause.
CPython issue https://github.com/python/cpython/issues/116008 describes a similar
watchdog dump failure and recommends calling dump_traceback while holding the GIL.
The test-only replacement uses a one-shot Python Timer per test in each worker,
with worker/test labels and the same 60-second diagnostic threshold. Fatal-signal
handling, the worker-loss observer, every classified test, two workers/loadscope,
dependencies and the 30-minute gate remain unchanged. This is a controlled
diagnostic correction, not proof of crash attribution; fresh full CI is required.
A native hang holding the GIL may prevent the callback from running. Cancellation
prevents callbacks that have not passed the active check; an already-running
callback may outlive its bounded one-second teardown join. Earlier session/module
fixture setup is outside the per-test diagnostic lifetime. No locals are captured.
CI189's full backend campaign passed (1,014 tests / 16,250 subtests), but log review
found pytest's fd capture could hide the periodic output. Configuration now owns
a duplicate of the original stderr destination, passed explicitly to each worker's
watchdog and closed at unconfigure. This also preserves Windows execnet's retained
stderr descriptor. An ordinary-capture xdist probe now exposes the actual blocked
frame and worker/test marker in the run log. The follow-up still requires fresh
exact-head full CI; the prior backend pass is historical evidence only.
Manual binary evidence round trips, every role/cadence combination and authenticated
staging durability require their own evidence; source retention is not execution.

## Coordination, release and rollback

Agent007 owns Portfolio; Agent Poop owns Dashboard; Agent Pee Pee owns Actions.
No separate active Calendar/Reviews owner was identified. Their existing scopes
and sources are preserved. The Risks owner is the single cumulative staging
release owner under the user's later explicit staging grant relayed by the hub.
Deploy only the tested exact commit to existing omnisciente-staging
srv-db1s0cugekts73f72reg via Manual Deploy / specific commit. Preserve Free plans,
Auto-Deploy Off, credentials, database, accounts and service settings. No main
merge, production, new hosting, account or grant changes. Wider rollout stays off.

Gate-only rollback: set BRAWNDO_DEMO_RISKS_ENABLED=false. This restores the retained
native Risks presentation without changing records/history or the other pilots.
The previous verified cumulative hosted baseline is 4abf774; provider rollback
changes application code only and must never reset data.
