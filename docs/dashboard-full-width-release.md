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

Current main `1b9691d7dc51bc7b5577fc49304d6422135f3889` (PR #41 CI gate and PR #39 CIS subtitle correction) reconciled without conflicts at `62d2ec498b1647fdc508efd915c2d2a08f79e190`. Both changes are preserved. The formerly unclassified backend dashboard suite now runs through the normal registry: 40 dashboard/source tests passed. Expanded affected frontend regressions passed: 11 suites,70 tests,1 snapshot. Both builds compiled on the reconciled revision. Before merge: fetch again, preserve intervening changes and require the protected Release gate.

Coordinate the authenticated staging-session handoff and final release order with the release agent. Exactly one real staging login must remain enabled; no staging logout,account creation or redeployment has been performed by this change.

After authorized merge: use the established Render pipeline,update the existing owner-private ChatGPT preview preserving URL/access,and record exact merged/deployed SHAs,preview version and actual hosted results here. No provider,credential,plan or deployment-trigger modification belongs to this PR.

The111 source-pending ISO units and outstanding official-text permissions remain documented in `assessment-layout-inputs.md`; this dashboard release does not perform normative content verification.

## Release-gate handoff

PR #41 merged as `2d13a3e`; PR #39 merged as `1b9691d7dc51bc7b5577fc49304d6422135f3889`. Earlier queued-PR41 status is superseded. PR #42 now runs the inherited Release gate on its reconciled head. Independent scoped code review approved `62d2ec498b1647fdc508efd915c2d2a08f79e190`; refreshed visual checks and final hosted acceptance remain separately tracked. The release owner is verifying the PR39 automatic deployment and will explicitly hand over the sole staging session. No staging login/logout or deployment from this task occurs during that acceptance window.

The earlier pending release-owner acceptance is superseded by the explicit exclusive PR42 handoff in GitHub comment6016966761 on2026-10-06. Owner verified main/Render `382d10f03a6eda3139e484cdff9d7cf60b577120` and owner-private preview version114, including fresh administrator login and exactly one enabled real staging account. PR42 source remains unpublished; its own hosted acceptance remains pending.

## Final-main reconciliation

Fetched current main `382d10f03a6eda3139e484cdff9d7cf60b577120` and merged cleanly at `badaaff95b192547ad13de0bb33b545a2d2979ea`. CI gate, CIS subtitle, PR46 Demo selection isolation and PR47 Review-close guards/tests are preserved. Independent scoped code review approved this revision; only the six intended dashboard files differ from main.

Affected frontend checks passed16 suites,94 tests,1 snapshot, including client-selection, workspace-mode, authentication and linked-Review regressions. Focused backend40 checks passed. Both builds passed: Demo `main.7f1fe52e.js` / `main.6d1aa478.css`; normal `main.67486db3.js` / `main.6b2e54e7.css`. Existing bundle-size advisory remains.

Refreshed local browser checks passed40 Demo viewport/theme/client cases, all existing program link destinations/tooltips/read-only summaries/focus return, and30 real disposable-Mongo authenticated viewport/theme/group cases plus new-client/multi-framework behavior. Demo test helpers now use the authoritative tab-local session selection; authenticated selection remains localStorage. Browser-local Demo edit/save/reload produced no backend writes or cookie changes, and uninterrupted disposable-Mongo before/after hashes matched. These are local results, not PR42 hosted acceptance.

Required final-head GitHub gate, protected merge, exact-main push gate, automatic Render deployment, separate same-URL owner-private preview publication and PR42 hosted acceptance remain pending. Evidence-download bytes, email, Atlas backup/restore and hosted restricted-identity checks remain unverified;111 ISO source comparisons remain content dependencies. No additional design or content input is required for this layout release.
