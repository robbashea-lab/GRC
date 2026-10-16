# Brawndo Explore demo dashboard

## Superseding visual correction — October 16, 2026

The six-surface request supersedes the earlier native-font/palette/layout exception.
Dashboard now follows the pinned `visual-targets/dashboard.html` appearance
(SHA256 `5e824ee4a878d5dee2914db05fd8643c72249b10c706ea20f7459162f3c9d8a9`).
The working cumulative baseline is `847bceacc84f93355ae15c01fc051c6c7a2f90d2`.
Dashboard's first focused correction is `53d9217f99c3392666adcca267f6722d4df3c222`:
page typography, summary, controls, native work-row structure and container reflow.
The shared history owner supplies the target inline composition and concise copy;
this page does not replace history math, provenance or native queue controllers.
Native summary → Open item → full native record remains the opening contract.

Six focused suites / 55 tests pass, including native saves, historical occurrences,
mode/client changes and late responses. A separate AI source review found no
actionable finding. These are component/controller checks, not rendered acceptance.
Agent007 owns common-environment target/candidate font, cascade, geometry, both-theme
and breakpoint comparisons, integrated native journeys and exact-head release.
No new staging deployment or visual acceptance is claimed for this correction.
The earlier delivery notes below are historical evidence, not current completion.

## Scope and recovery checkpoint — October 15, 2026

This candidate implements the supplied dashboard package in the native application.
Branch: `codex/brawndo-demo-dashboard-20261015`. Integration parent is Portfolio
PR83, `4abf774ea9313721eaf434fa567eace27ddb4864` (tree
`990189eb009a9bc2e7a05ed7e0bfcbaf29cf9503`). The isolated worktree preserves the
Portfolio, assessment, Reports and Security domains work. No dependency changes.
This is a draft review candidate, not release readiness or Robert's acceptance.
The PR delivery receipt identifies the candidate commit; this document cannot
include its own eventual commit hash.

Package review found three material integration constraints before implementation:
the current Portfolio branch is required; native queue previews are incomplete
for global sorts; and a hosted unmerged review requires the existing coordinated
specific-commit staging workflow. The HTML is a layout reference, not authoritative
data or permission to publish a replacement app. All eight manifest hashes match;
the separately supplied prepared HTML has the same SHA256 as the packaged reference.

## Boundary, data and behavior

`brawndoDemoDashboard.js` requires both trusted demo mode signals, a user identity,
the authorized resolved active client `demo_brawndo`, and `/dashboard`. Missing,
contradictory, archived and lookalike contexts fail closed. This is presentation
eligibility; existing API authorization remains mandatory. Mode/user/client changes
invalidate request keys and abort old reads and details. No new allowlist entry,
enrollment, role, grant, onboarding default or authenticated write is introduced.

The separate program resolver verifies the existing `demo_brawndo:cis-ig1`
enrollment, native selected/configured state, numeric IG1 configuration, assessment
client/framework/version and canonical current scope (CIS v8.1, IG1). Missing
configuration gets an unavailable state. Inline history additionally validates
client/program identity and current scope before displaying its response.

The dashboard has four summary cells, inline CIS status/history, and Priority work
with search, authoritative framework filters, five sorts and eight-row pages.
Summary badges use the complete native queue groups. Context sublines and table
sorts operate on all authorized queue detail pages (100 per read, bounded to
100,000 rows). Duplicate identities, changing totals and incomplete pagination fail
explicitly rather than displaying a silently truncated queue. Missing dates sort
last in both directions; unknown statuses/unassigned owners sort last. UTC native
calendar helpers preserve date-only values, today and inclusive today+30 semantics.

Optional `work_metadata=true` enriches existing queue rows with structured native
framework/safeguard associations. It reuses the existing membership/source ancestry
graph and leaves eligibility and Finding/Action deduplication unchanged. Both Demo
and backend project equivalent fields. Missing explicit relationship targets mark
membership unknown; only proven empty membership qualifies as Program-wide. Ordinary
search retains its original read path without additional association queries.

Row actions use DashboardItemSummary and the existing RecordDrawer, including
type-specific remediation, validation, Review occurrences, permissions, evidence,
comments, explicit saves and concurrency. There is no generic completion or Undo
bypass. After pilot saves, the selected immutable work key is reconciled against
the refreshed native queue. Removed/completed occurrences dismiss their stale
summary; surviving records acquire current queue fields. Focus falls back to the
work heading when its old row no longer exists. Background refresh uses the existing
Portfolio event/focus/visibility/60-second infrastructure and pauses for an open
native editing drawer to protect drafts.

Inline reporting reuses PortfolioReports and portfolioProgress, the native history
endpoint, denominators, scope changes, genuine positions and guarded forecast.
Work completion cannot independently grant implementation credit. Missing history
and baselines remain unavailable. The selected period survives revalidation.
The October 15 delivery retained native fonts and non-chart tokens. That visual
exception is superseded by the October 16 correction above; Portfolio has its own
independently pinned appearance and shared-history presentation variant.

## Verification and review limits

Local evidence covers focused controller, gate, queue, metadata, history, navigation,
remediation and recurring-history suites, plus backend dashboard/association suites.
Exact final test totals and build results are recorded in the PR receipt.
The new backend test file is registered in the existing offline suite classification.
An independent AI source review was used; this is not human peer approval.

Native compiled-app browser checks: canonical Brawndo 56 active work, 3 overdue,
10 due30, 1 unassigned; 32/56 implemented and 49/56 assessed, agreeing with Portfolio.
Overdue drilldown showed three rows. Native Action status save/reload refreshed the
in-progress count without changing implementation; original status restored through
native save. Enter on Implemented opened `view=addressed` for exact demo Brawndo.
View data retained genuine scope/counts. Prestige retained its original dashboard.
Desktop 1440px and mobile 390px measured no document overflow; light/dark inspected.

The date input's automated fill did not enable native Save; a status edit did.
Browser date/owner saves, every source-specific completion, restricted-role browser
journeys and the full acceptance matrix are not claimed as completed. Existing
native lifecycle regression tests provide narrower evidence. No hosted customer
record was mutated. Local browser evidence is not hosted durability evidence.

The full mandatory frontend/offline-backend/Mongo Release gate has not been run
on this candidate. A stacked PR does not automatically trigger that workflow;
dispatch Release verification against its exact SHA before release consideration.
Do not merge or deploy around a failed or missing gate. No staging, production,
Sites or replacement hosting publication has been performed. Existing staging
specific-commit delivery remains with the coordinated release owner after CI.

## Rollback and next step

Set `BRAWNDO_DEMO_DASHBOARD_ENABLED` to `false` to restore the existing dashboard.
This gate-only rollback leaves records, retained history, Portfolio and independent
pilot configuration intact. No migration or record reset is necessary.

Next: run the mandatory exact-head Release verification; finish remaining native
acceptance cases; use the existing authorized staging review path; obtain Robert's
acceptance. Broader dashboard rollout requires a later explicit decision.

Security review used [NIST SSDF publications](https://csrc.nist.gov/projects/ssdf/publications)
(1.1 final; 1.2 listed as draft at review) and
[OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
with [ASVS 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0).
These references do not establish compliance.
