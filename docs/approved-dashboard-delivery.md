# Approved dashboard delivery

Baseline: remote main `bb9bcbfe5b7a36b4fb16ff98226adb3913a5ce41`, October 5, 2026. Isolated branch `codex/approved-shared-dashboard`. Reference: user-supplied approved-dashboard-mockup.html; sample data and navigation popovers are illustrative only.

Ownership: coordinator owns ClientWorkDashboard, FrameworkProgramCard, read-only summary, Dashboard, backend work-queue adapter, shared navigation and integration. CIS/SOC/ISO agents own respective contract test files; no separate dashboard implementations. Framework Workflow owns assessment tabs/PR36. Bigger Picture coordinates the deployment slot. This task is authorized to manually deploy the final merged source to the existing Render staging service, without infrastructure, provider setting, plan or production changes.

Checklist:
- [x] Fetch baseline and inspect current dashboard, mockup and authorization boundaries.
- [x] Identify Demo-only queue support and missing ISO cross-tab count destinations.
- [x] Shared approved layout and read-only item summary.
- [x] Normal server queue support with exact count/detail population.
- [x] Framework status/attention links and donut accessible percentages.
- [x] Regression tests, normal/Demo builds and isolated browser acceptance.
- [x] Separate focused review against approved design and requirements.
- [x] Reconcile current main, rerun affected checks, merge protected PR.
- [x] Publish existing owner-private preview with exact source provenance.
- [ ] Manually deploy exact merged source to existing Render Free staging and verify hosted workflows.

References consulted proportionately: WAI-ARIA APG modal-dialog pattern (focus containment, Escape, focus return); Testing Library guiding principles (observable DOM outcomes). Existing Radix dialog is reused. Verification evidence and unresolved blockers are appended as work completes.

## Integration and local evidence

October 5: fetched main again and reconciled PR37, `e8f600da3996f6a7f757152e7e176bb7de6b645e`, by fast-forward and reapplying the isolated dashboard edits; no conflicts. Preserved the users `updated_at` projection and identity lifecycle regression. Framework Workflow retains ownership of assessment-tabs PR36; shared FrameworkWorkspace changes here are limited to dashboard count destinations, applicability/search and browser-history filters. No separate dashboard implementations.

Independent ISO agent reviewed the complete change against the approved reference and requirements. Findings corrected: exact Risk/Vendor/Acceptance navigation, visible rejected-link feedback, filter page/history isolation, matching ISO donut denominator, N/A search and status selection after dashboard arrival, bounded dialog scrolling and fourth attention row. Re-review reported no remaining material defects. Browser verification found and corrected the Demo dark header inheriting an unrelated light table background. An undocumented origin is omitted rather than inferred as manual.

Local normal-mode browser acceptance used a new loopback Mongo 8.0.28 process, a unique disposable test database, and clearly labelled synthetic records. Three clients exercise CIS IG1/2/3, with IG3 also using ISO and SOC2. Actual password login, API creation, 32 work rows per client, exact counts (12 past due, 13 due within 30 days, 11 unassigned), 25+7 pagination, browser Back, Escape/focus return, read-only summary, exact Action destination and persistent save after reload passed. ISO Implemented link showed 31 matching requirements across clauses and Annex A. Demo actual Finding purpose and safeguard 11.4 source navigation passed. Demo operational editing left clients, tasks, assessments, requirements, users and audit collection byte-equivalent to the pre-edit database snapshot. No customer data or Atlas records used. These results are local, not hosted acceptance.

Initial focused frontend checks passed 15 suites/80 tests; subsequent origin/filter/search regressions are covered by the final run recorded below. Work-queue backend routes passed 4 tests; preserved identity lifecycle checks passed 16 tests. Both initial builds succeeded; final corrected builds and full frontend run are in progress. Existing large-bundle and Node fs.F_OK advisories remain outside this scope.

Release gates still pending: final builds/browser refresh, current-main reconciliation, protected PR merge, exact-source owner-private preview and manual Render staging deployment, hosted workflow verification. No finished rollout is claimed before these gates. Hosted normal acceptance must use an existing authorized account; no additional persistent QA login is created.

## Final pre-merge checks

Implementation revision `31bef31d17188225cfd9f5ccc0d7f8d816990d2a`: focused frontend 27 suites /155 tests /1 snapshot passed. Backend dashboard suites:11 tests passed; identity lifecycle:16 passed. Real Mongo contributor checks: own queue200, foreign queue/task/assessment403, saved browser title confirmed directly in Mongo. Both normal staging and Demo builds compiled successfully.

Expanded frontend run reported105 passing suites and two failing suites before it was stopped after prolonged execution; no whole-suite pass is claimed. The five failures in RiskRecordPanels/RegisterDrawers reproduced identically on detached current-main e8f600d (2 suites,5 failed,3 passed). Missing Web Crypto in the unchanged fixture causes the stale-write expectation to see crypto undefined and prevents PATCH calls. These unrelated fixtures were preserved.

Final independent visual review of the screenshot identified inherited mini-card styling on the two program metrics and an extra donut center subtitle. Corrected through dashboard-only CSS and percentage-only SVG center; metric calculations and operational workspace styles remain unchanged. Snapshot reviewed/updated for this approved presentation. Presentation revision `c8c25f0e5065d052048f9d4dbb725fdf785137c7`: FrameworkProgramCard 9 tests passed, both refreshed builds compiled, and independent desktop visual re-review found no remaining material discrepancies.

## Merged source and hosted delivery — October 5, 2026

PR38 merged through the normal GitHub merge operation, without bypassing protections. Exact merged source: `d2468ed13242ee4c6fbab047e7eb5fa2a38c8f4a`; its tree matches tested presentation revision c8c25f0. Both normal staging and Demo builds were run again from this merged revision and compiled successfully. A subsequent fetch confirmed remote main was still this revision. This evidence-only follow-up does not change the deployed application source.

Existing owner-private ChatGPT preview: version **110**, source `d2468ed13242ee4c6fbab047e7eb5fa2a38c8f4a`, deployment `appgdep_6ac3e7549dfc8191a7ffa55196c205df`, status **succeeded**. URL preserved: https://iventure-grc-code-preview.mr-robbashea.chatgpt.site. The private deployment operation enforced the existing owner-only audience. Native Windows packaging was used after the bundled Bash packaging step failed; the archive contained dist/index.html and dist/.openai/hosting.json.

Existing Render staging service `srv-db1s0cugekts73f72reg`: exact source `d2468ed13242ee4c6fbab047e7eb5fa2a38c8f4a`, manual specific-commit deployment `dep-db1uevei0phs73cils00`, visibly **Deploy succeeded | Live**, duration 1m21s. URL: https://omnisciente-staging.onrender.com. No provider settings, credentials, accounts, infrastructure, plan or database configuration were changed. Existing Free service was retained; no Atlas plan change. Backend DEMO_MODE configuration remains unchanged and false; this deployment did not modify environment settings.

Actual hosted browser checks on version110: approved CIS light/dark dashboard, exact Past Due three-row population and browser Back, read-only Finding/origin summary, actual safeguard11.4 assessment navigation, exact Action operational drawer, browser-local Action edit reflected on dashboard, ISO dashboard count link returning94 implemented requirements across clauses and Annex A, and SOC2 program-card vocabulary/counts passed. The static private preview remains Demo-only; it does not verify authenticated database behavior.

Actual Render browser checks: Demo entry from the normal sign-in page; approved shared dashboard; read-only Finding/origin summary; exact operational Action drawer; synthetic browser-local title edit/save reflected on dashboard. A newly opened separate tab still presented enabled normal email/password sign-in, and its independent Demo showed the original Action title, with zero matches for the other tab's synthetic edited title. This verifies hosted tab isolation; the byte-equivalent database proof is the separately documented local Mongo test, not an Atlas snapshot.

**Remaining acceptance blocker:** after the deployment, reloading the earlier authorized Staging Administrator session returned to normal sign-in. No existing credential is available to this task, and the account-owning chat declined the requested verification handoff without direct user instruction. Hosted normal password login/logout, synthetic operational save/reload persistence, dashboard summary/navigation and backend-record isolation on this exact revision are therefore **not yet verified**. No extra persistent QA account was created and no authentication bypass was attempted. User can sign into the existing staging account for this task's browser verification, or directly authorize the account-owning chat to perform and report these checks. Deployment is complete; finished rollout acceptance remains open until those checks pass.

## Authenticated acceptance resumption — October 5, 2026

Current Render state was checked before testing: the service now reports **Live** deployment `dep-db1ujr67bikc73bp7hk0`, source `0e5965a78fc47bc40f7d1e1d7faa21e3d373c35f`, rather than reported d2468ed. That commit was fetched from GitHub without changing this working branch; it includes assessment-layout work. Served login HTML references JS `/static/js/main.37310f53.js` (SHA256 `fda402af826427606eb67e617489fe3f647c1ec4c2708dd513fcb7ea046e0120`) and CSS `/static/css/main.098381cb.css` (SHA256 `07bb533d7502bf4465488700e81eed03c651ce47511892fe395b44cc7de85344`), which differ from the earlier dashboard build. Provider provenance identifies the current deployed source; no matching rebuild or independent backend revision endpoint is claimed.

Safe unauthenticated HTTP checks against `/api/tasks`, `/api/clients`, and `/api/framework-assessments` each returned **401**. These prove authentication rejection only, not tenant isolation or authorized access. Normal browser login renders enabled email/password fields. No failed credential submission occurred: this task has neither an active administrator session nor the privately held existing credential. No account creation, password reset, secret retrieval from another agent, or authentication bypass was attempted.

The existing staging login page is open for the user's private sign-in. Single action needed: sign in there using the existing administrator account. After that, current-revision authenticated tiles, framework links, summary/source navigation, save/reload and Demo/backend/session isolation remain pending; prior d2468ed local/hosted Demo results do not establish these results on the newer deployment. Restricted-user/cross-tenant hosted checks also remain pending unless an existing permitted restricted identity or equivalent safe test boundary is available. Administrator browsing alone will not be reported as tenant-isolation proof.
