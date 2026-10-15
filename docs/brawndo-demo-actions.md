# Brawndo Explore demo Action Items

Branch: `codex/brawndo-demo-actions-20261015`, based on fetched dashboard PR84
`d7e693613845973ee5600ad3cf4dfc4a49e9ce73` (tree `8387505a87f076627604248074612def223d1317`).
The current open-PR stack preserves Portfolio PR83, Security domains, Calendar and
Reviews. This separate checkout never changes their branches or pending acceptance
files. Coordination messages were sent before editing and publication.

## Authorized scope and superseding workflow rule

Visual redesign only for resolved active `demo_brawndo` on `/action-items` in Explore
demo, requiring both trusted demo-mode signals and the actual authorized client.
Loading, errors, archived/unresolved clients, signed-in Brawndo, other/new clients,
lookalikes and other routes never activate this presentation. Same-identity editors
are concealed during native client access rechecks, retaining drafts; actor, mode,
client or denied-access changes drop the old presentation.

Robb's October15 superseding clarification relayed by the parent coordination chat
prohibits changing native workflows, adding editor steps or new operational actions.
It overrides conflicting package/mockup language. The prototype's requested bulk
reassignment, selection and selected CSV were removed because these controls were
absent from the working Action Items baseline. The introduced extra Finding-editor
button and dispatch bypass were also removed. A conservative confirmation for merely
browsing an origin was removed: the native tracked-dirty-only rule remains.
These removals happened before any PR publication; excluded code is not shipped.

Input references are the Desktop Codex prompt and Brawndo-Demo-Actions-Reference.html.
START_HERE.txt, IMPLEMENTATION.md, ACCEPTANCE.md, REFERENCE_NOTES.md and a second
Actions HTML were named but not supplied/found. Their acceptance cannot be claimed.
The unrelated Dashboard package is not substituted.

## Native contracts

| Concern | Preserved authority |
| --- | --- |
| Opening | Same `RecordDrawer` dispatch to full `RemediationTicketDrawer`; row clicks and original direct source links pass exact native record and initialValues, including Review occurrence/vendor assurance context. |
| Identity | Existing `unifiedActions` / `ticketRecords`: `finding:<id>` with all linked Actions, otherwise `task:<id>`. Valid explicit primary or unique same-client legacy child only. No migration or fixture import. |
| Fields | Primary Action owns title/assignee/date/priority/plan/resolution. Finding owns issue/origin/decisions. Finding-only and ambiguous fallback plus every child's distinct fields and diagnostics remain as native baseline. |
| Lifecycle | Original versioned Task saves, completion receipts, authenticated completion actors, all-child readiness, explicit required-rationale Finding validation/acceptance and native reopening. Work never changes control implementation, Review completion or Risk resolution. |
| Permissions | Native role/field/ownership/assignment/approval rules and server enforcement remain. Existing New Finding/New Action forms, evidence, comments, activity, relationships and original source drawers are reused. |
| Owner health | Additive read-only `assignment_eligible` member signal: active account and actual native client access, independent of caller's candidate-picker rights. Historical assignments/actors remain intact; no account/grant changes. |
| Refresh | Native write/portfolio/ticket refresh events remain. Pilot-only retention preserves same-client drafts on failed refresh; details become read-only until reload. Confirmed save versus refresh failure is explicit. Dismissed drawers never reopen from a deferred URL update. |
| Safety | No replacement editor/database, new persisted Task states, fixture imports, missing validation inventions, destructive Undo, dependency additions or wider rollout. |

The reference's compact summary/runway/register are presentation around those native
contracts. Full drawer is 680px to retain all native fields, linked Actions, evidence,
comments and history. Saves stay per Action, with native Cancel/dirty-close behavior.
Current shared feather/branding/font/theme and native navigation/badges remain;
the reference's older tagline does not replace the shared shell. The actual native
Demo storage notice remains because it truthfully describes persistence. Prototype
sample/session/reset/About/tutorial controls were not imported.

## Metric, date and link contract

Summary and due runway use all authorized Active unique tickets independently of
search/source/page. Active excludes only completed/accepted/cancelled ticket outcomes;
outstanding Actions keep historically accepted/closed issues Active, with explicit
acceptance context. Completed contains genuine completion; All records retains other
terminal outcomes. Blocked/critical work and legacy diagnostics stay visible.

High severity counts Active tickets with High/Critical Findings, not standalone task
priority. Needs-owner uses canonical owner IDs and actual eligibility, including
missing/disabled/removed/inactive owners; it never matches display names.

Local planning date-only windows are disjoint: overdue <today, today..14 inclusive,
15..30,31..60,later>60, plus Unscheduled for missing/invalid dates. These sum to Active.
The separate dashboard UTC clock is unchanged. Chart colors remain reference-local;
other colors inherit native light/dark tokens.

Search/source/quick filters/sort apply before ten-row pagination. Original q/view/
owner/unassigned/id/finding_id links remain; typed task_id/finding_id remove legacy
ID ambiguity. view=all includes every outcome. Browser Back/Forward within the
register uses native tracked-dirty close protection before changing tickets. Keep
editing restores a separate typed history entry; closing cannot revive the drawer.

## Verification and boundaries

Focused native/controller/metrics/owner-scope tests and both optimized configured
builds are recorded in the final delivery receipt. Backend two-worker configured
campaign passed33 tests plus175 subtests (native remediation, eligibility and client
reads). New test is classified in the existing offline CI registry. No test budgets,
workers, assertions, dependency locks or workflow gates changed.

Earlier pre-correction tests/builds and bulk browser checks are superseded, not final
workflow acceptance. Native local Demo owner/status/date saves and reload were
exercised on disposable browser-session data; this is not hosted MongoDB durability.
A normal cookie login into a separate loopback mocked-database standard build verified
that even signed-in canonical demo_brawndo retains the original register with zero
pilot wrappers. Real customer/accounts/grants and shared staging sessions were untouched.

Independent AI source review compared actual command bodies and paths with d7e6936;
it is not human peer approval. Corrected issues include URL dirty-close/repeated Back,
Close revival, lost-refresh drafts, and restoration/removal of workflow deviations.
Earlier red receipts include nonexistent test paths, new-test classification and a
Windows temporary-directory permission error; corrected commands and a project-local
pytest basetemp passed. Full exact-candidate CI, browser matrix, hosted review and
Robert's acceptance remain distinct and must not be inferred from focused tests.

## Recovery and next step

Gate-only rollback: set `BRAWNDO_DEMO_ACTIONS_ENABLED=false` in brawndoDemoActions.js.
Native records, evidence, history, commands and all other pilots remain. No main
merge, production publication, new hosting or account/grant changes are authorized.
Finish exact-head release verification and coordinated review acceptance before any
deployment/readiness claim. The missing package documents remain an explicit limit.
