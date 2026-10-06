# Approved Risks and Policies layouts

Baseline: `efa5059eb430a2768d6f786d4ad30c2990f2f574`.
Reconciled main/PR #49: `1d5e26eebf5f6ae67052e63479bd43f87d91779e`.

The approved register and existing wide record-dialog presentation now apply
to every client, including new clients. Risk category remains stored/searchable;
Policy version remains available in its record. Neither appears beneath register
names. Policy Requirements & Alignment follows Overview; the existing approval
workflow and immutable approval subject/history are retained in Evidence.

Risk Due for review includes dates through today. Review due in 30 days includes
strictly future dates through day 30; the existing 90-day utility is unchanged.
Policy upcoming retains its existing today-through-day-30 behavior, with Overdue
reviews covering earlier dates. Stored dates, recurring Reviews, Calendar and
backend lifecycle/authorization rules are unchanged.

Independent cross-reviews identified and corrected authenticated Risk linking,
normal Policy terminal-record metadata editing and sorting regressions. Adopting
the existing Risk dialog also exposed acceptance clearing unrelated drafts; its
server-result rebasing now preserves those drafts without implicit pre-saving.
Browser acceptance found Policy row dates were reversed beneath the newly ordered
headers. Header/body order now shares one rule, with a cell-position regression.

## Verification before release

- Integrated `04f477cefdc14df2cf7a983201fcd9f881e9c304`: 9 focused frontend
  suites / 46 tests passed; authenticated and isolated Demo production builds
  compiled successfully. Builds report the existing large-bundle advisory.
- Date-column correction `0726c19`: 3 Policy suites / 25 tests passed.
- 20 offline backend Policy approval/provenance and Risk lifecycle tests passed.
- Disposable loopback MongoDB 8.0.28: 81 recovery, authorization, ticket and
  generic-save tests passed. No staging/Atlas connection was used.
- Real bcrypt login, authenticated API-created synthetic clients/records and
  normal browser Risk/Policy edits persisted in a separate UUID Mongo database.
  Risk future filter excluded today/overdue/day31 and included day10/day30.
  Policy draft-close protection retained edits; Evidence disabled approval while
  ordinary edits were unsaved. These are local results, not hosted acceptance.
- 18 existing Risk lifecycle and Policy approval/provenance cases also passed
  against separate real Mongo databases, including cross-client denials, restricted
  roles, stale/concurrent decisions, retained document snapshots and recovery.
- Browser Risk Review completion advanced the annual anchor, retained its completed
  occurrence, acceptance rejected missing data, and authorized closure persisted
  as read-only after reload. Mongo assertions confirmed the exact stored decision
  history, cancelled future Review and unchanged Policy draft/version.
- Existing and newly UI-created browser-local Demo clients exercised both layouts,
  Policy creation and Risk scoring/save/reload. Same-origin Demo edits remained
  absent from real Mongo; normal administrator/session/client survived reload.
- Two implementation agents independently reviewed opposite feature/shared dialog
  changes. Review caught footer CSS visual ordering differing from keyboard order;
  buttons now follow the approved order in the DOM, retaining their handlers.
- Approved desktop field/summary columns and readable two-column Policy alignment
  sections are scoped to these dialogs. Temporary 390x844 viewport override was
  initially accepted by the browser tool but existing tabs retained their default
  dimensions; that attempt was not responsive verification. In the fresh browser
  session, actual DOM measurements confirmed 600 and 390 CSS pixels. Normal Risk
  and Policy dialogs fit without horizontal overflow; Policy alignment becomes one
  column, forms stack, and keyboard focus reveals horizontally scrolling tabs.
  Summaries follow the mockup's two-column rule below 470 pixels.
- Candidate `48b2183`: 5 affected suites / 30 tests and both builds passed. Native
  review found no major issues. Four earlier review findings were corrected and
  checked in the actual isolated authenticated browser. Policy basis save, submit
  and approval retained the captured subject and history; pending context edits
  were disabled. Final CI correctly failed six obsolete layout assertions across
  three suites (219 other suites / 1,617 tests passed); corrected tests retain
  exact save payloads, legacy categories, filters/counts, draft guards and themes.
  Required final-candidate CI and hosted acceptance remain pending.

## Coordinated delivery

PR #49 completed its acceptance handoff and released the exclusive staging and
publication slot to this coordinator. This release must follow required
review/Release gate. Reconcile intervening main before merge; verify actual main
CI and automatic Render deployment, then separately publish the same source to
the existing owner-private preview. Deployment and final hosted results remain
pending; this document does not claim rollout completion. The exact merge,
automatic Render deployment, private-preview version and final hosted acceptance
will be recorded in the repository's [PR #50 acceptance handoff](https://github.com/robbashea-lab/GRC/pull/50).

Follow [Render release operations](render-release-operations.md). Application
rollback must preserve Mongo/Atlas data and does not roll back the database.
Keep Render/Atlas Free, backend DEMO_MODE false and existing accounts/URLs/access.

Evidence-download byte delivery, email delivery, Atlas backup/restore and hosted
restricted-user/tenant browser verification remain gaps. Administrator browsing
does not prove tenant isolation; isolated negative authorization tests are
separate evidence. The 111 unfinished ISO comparisons remain content dependencies.
