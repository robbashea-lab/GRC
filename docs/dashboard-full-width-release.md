# Full-width dashboard release evidence

Status: implemented on PR #42; merge, deployment and hosted acceptance pending.

## Scope and reference

Approved reference: `approved-full-width-dashboard-mockup.html`, SHA256 `905863c64148db1fea9f1de0c35200089b4d588f6e149b0839abe8a09460353a`.
Application candidate: `acaf48fd1625f0ee9d2f703c9de50188e9230ac1`; starting main `0e1494247be98fe3f329f19ed03f51e1ec5c0c3b`.

The existing shared program cards follow the four summary tiles and precede the full-width Priority overview. Desktop proportions follow the approved three-column layout,104px donut, existing progress metrics/statuses/attention links and existing framework qualification wording. Framework configuration remains authoritative; no client-name branch, combined score, selector, catalog text, stored-data, authorization or lifecycle change. Existing unknown/unconfigured program behavior remains available.

## Local verification

- Focused dashboard command: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --testPathPattern='FrameworkProgramCard|ClientWorkDashboard|DashboardItemSummary|dashboardWorkQueue|dashboardPrograms|Dashboard.test|loadClientDashboard|complianceProgress'`:9 suites,57 tests and1 snapshot passed.
- Demo authorization and five-year multi-framework lifecycle:2 suites,4 tests passed. This supplements layout testing; it is not hosted verification.
- Demo and staging builds passed via `node frontend/scripts/preview.cjs build` and `node frontend/scripts/staging.cjs`. Existing bundle-size advisory remains; no dependencies changed.
- Optimized Demo browser checks: Brawndo,Initech,Prestige Worldwide,Dunder Mifflin at1440/900/560/390/320px,light/dark;40 cases passed full-width/order/page-overflow assertions with no page errors. Every existing workspace/status/attention link reached its exact existing URL; donut percentage/count titles remain present. Summaries remain read-only; Escape returns focus to the item opener.
- Separate normal-authentication loopback application uses real disposable Mongo,`DEMO_MODE=false`, isolated synthetic clients and multiple synthetic local users. CIS IG1/IG2/IG3 dashboards show56/130/153 scoped assessment populations; multi-framework renders its existing separate CIS/SOC/ISO cards. Queue counts12/13/32/11 and tile filter URLs verified. Read-only summary and focus return verified in the browser.
- Normal API onboarding of a newly created synthetic client produced56 CIS records; adding SOC2 and ISO produced33/123 records while retaining the saved CIS implementation and assessment history. Browser confirmed all three configured cards automatically appear.
- Operational link opens the existing unified ticket. A normal browser planned-action edit persisted after reload. A separate Demo browser edit persisted locally, emitted no backend write requests and left cookies unchanged. An uninterrupted before/after Mongo snapshot confirmed Demo left clients,tasks,assessments,requirements,users and audit data unchanged.
- Real Mongo contributor checks: own queue200; foreign queue,task and assessment403. These local identities never touched staging.
- Independent scoped code and visual review found one390px metric compression issue; fixed by stacking metrics below the donut. Subsequent desktop/narrow visual review found no additional change-related issue.

## Boundaries and remaining delivery work

The fixed existing sidebar leaves very little workspace width at320px. Cards do not cause page overflow, but the retained sidebar and narrow Priority table remain compressed. Overflow assertions do not establish whole-application mobile usability. Sidebar/navigation redesign is outside this layout change.

Before merge: reconcile current main including PR #41 release gating and PR #39 CIS subtitle fix; rerun affected checks and normal GitHub gates. The starting-main backend registry rejects the unclassified `test_dashboard_work_queue.py`; preserve the registry correction from PR #41 instead of bypassing it.

Coordinate the authenticated staging-session handoff and final release order with the release agent. Exactly one real staging login remains enabled; no staging logout,account creation or redeployment has been performed by this change.

After authorized merge: use the established Render pipeline,update the existing owner-private ChatGPT preview preserving URL/access,and record exact merged/deployed SHAs,preview version and actual hosted results here. No provider,credential,plan or deployment-trigger modification belongs to this PR.

The111 source-pending ISO units and outstanding official-text permissions remain documented in `assessment-layout-inputs.md`; this dashboard release does not perform normative content verification.