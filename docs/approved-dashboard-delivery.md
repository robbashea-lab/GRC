# Approved dashboard delivery

Baseline: remote main `bb9bcbfe5b7a36b4fb16ff98226adb3913a5ce41`, October 5, 2026. Isolated branch `codex/approved-shared-dashboard`. Reference: user-supplied approved-dashboard-mockup.html; sample data and navigation popovers are illustrative only.

Ownership: coordinator owns ClientWorkDashboard, FrameworkProgramCard, read-only summary, Dashboard, backend work-queue adapter, shared navigation and integration. CIS/SOC/ISO agents own respective contract test files; no separate dashboard implementations. Framework Workflow owns assessment tabs/PR36. Bigger Picture coordinates the deployment slot. This task is authorized to manually deploy the final merged source to the existing Render staging service, without infrastructure, provider setting, plan or production changes.

Checklist:
- [x] Fetch baseline and inspect current dashboard, mockup and authorization boundaries.
- [x] Identify Demo-only queue support and missing ISO cross-tab count destinations.
- [x] Shared approved layout and read-only item summary.
- [x] Normal server queue support with exact count/detail population.
- [x] Framework status/attention links and donut accessible percentages.
- [ ] Regression tests, normal/Demo builds and isolated browser acceptance.
- [x] Separate focused review against approved design and requirements.
- [ ] Reconcile current main, rerun affected checks, merge protected PR.
- [ ] Publish existing owner-private preview with exact source provenance.
- [ ] Manually deploy exact merged source to existing Render Free staging and verify hosted workflows.

References consulted proportionately: WAI-ARIA APG modal-dialog pattern (focus containment, Escape, focus return); Testing Library guiding principles (observable DOM outcomes). Existing Radix dialog is reused. Verification evidence and unresolved blockers are appended as work completes.

## Integration and local evidence

October 5: fetched main again and reconciled PR37, `e8f600da3996f6a7f757152e7e176bb7de6b645e`, by fast-forward and reapplying the isolated dashboard edits; no conflicts. Preserved the users `updated_at` projection and identity lifecycle regression. Framework Workflow retains ownership of assessment-tabs PR36; shared FrameworkWorkspace changes here are limited to dashboard count destinations, applicability/search and browser-history filters. No separate dashboard implementations.

Independent ISO agent reviewed the complete change against the approved reference and requirements. Findings corrected: exact Risk/Vendor/Acceptance navigation, visible rejected-link feedback, filter page/history isolation, matching ISO donut denominator, N/A search and status selection after dashboard arrival, bounded dialog scrolling and fourth attention row. Re-review reported no remaining material defects. Browser verification found and corrected the Demo dark header inheriting an unrelated light table background. An undocumented origin is omitted rather than inferred as manual.

Local normal-mode browser acceptance used a new loopback Mongo 8.0.28 process, a unique disposable test database, and clearly labelled synthetic records. Three clients exercise CIS IG1/2/3, with IG3 also using ISO and SOC2. Actual password login, API creation, 32 work rows per client, exact counts (12 past due, 13 due within 30 days, 11 unassigned), 25+7 pagination, browser Back, Escape/focus return, read-only summary, exact Action destination and persistent save after reload passed. ISO Implemented link showed 31 matching requirements across clauses and Annex A. Demo actual Finding purpose and safeguard 11.4 source navigation passed. Demo operational editing left clients, tasks, assessments, requirements, users and audit collection byte-equivalent to the pre-edit database snapshot. No customer data or Atlas records used. These results are local, not hosted acceptance.

Initial focused frontend checks passed 15 suites/80 tests; subsequent origin/filter/search regressions are covered by the final run recorded below. Work-queue backend routes passed 4 tests; preserved identity lifecycle checks passed 16 tests. Both initial builds succeeded; final corrected builds and full frontend run are in progress. Existing large-bundle and Node fs.F_OK advisories remain outside this scope.

Release gates still pending: final builds/browser refresh, current-main reconciliation, protected PR merge, exact-source owner-private preview and manual Render staging deployment, hosted workflow verification. No finished rollout is claimed before these gates. Hosted normal acceptance must use an existing authorized account; no additional persistent QA login is created.
