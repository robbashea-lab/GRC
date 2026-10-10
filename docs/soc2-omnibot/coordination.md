# SOC 2 OmniBot coordination ledger

## Ownership and base

- Agent 2 branch: `codex/soc2-omnibot-rollout`; isolated worktree only.
- Acknowledged Agent 1 base: `a527d4e79bfab36629b0a0b71eb10c6c018d00bb`, PR #65 (draft).
- Base application runtime: `6a4c0c7612195605c39d3285bf11c2560e15d74e`; later base commits are evidence-only.
- Agent 1 acknowledged additive hooks in `frontend/src/pages/FrameworkWorkspace.jsx`, `frontend/src/components/FrameworkDrawer.jsx`, `frontend/src/components/PrestigeSocAssessment.jsx`, `backend/guided_assessment.py`, `backend/framework_governance.py`, and the actual Demo governance path `frontend/src/preview/frameworks.js`.
- New SOC catalog, evaluator/summary, controller, tests, and SOC evidence are Agent 2 owned.
- CIS catalog/engine, Login, ISO, shared OmniCharacter/OmniDock/OmniWindow and all styles remain unchanged.
- Dependency: preserve PR #65; do not merge main. Refresh Agent 1 head before composite validation.

## Release/session boundary

Agent 1 retains the only Render deployment/authenticated browser slot. No slot has been transferred. On 2026-10-10 Agent 1 explicitly confirmed that the paused CIS checks do not grant Agent 2 a staging/session/fixture/account slot. Current reference runtime deployment is `dep-db56e2d9fdbs73bpcq50`, service `srv-db1s0cugekts73f72reg`. This is not independently verified SOC deployment evidence.

Do not reuse QA—CIS IG2, the archived QA—Closeout CIS IG3, or pending restricted-access identities. No SOC staging fixtures have been created. Local Demo browser fixtures on loopback port 4212:

- `clients_demo_mv2rvd49_hx9heqot`, **Agent 2 SOC Omni local QA 20261010**: normal fresh SOC onboarding, default 33 Security criteria, explicitly expanded to all 61 for coverage.
- `clients_demo_mv2tt1bb_upvsjkgb`, **Agent 2 Add SOC local QA 20261010**: normal CIS-only onboarding, later SOC activation, retirement and reactivation with inherited CIS narrative preserved.

Both were archived reversibly through Client Management after checks, with Restore actions confirmed. Interviews, assessments and history remain retained. No accounts/contacts/owners were created. Prestige Worldwide remained a read-only reference with unchanged 38-criterion scope and unchanged native text in every placement check.

Agent 1 additionally acknowledged the minimum SOC-only case/fixture change in `frontend/src/components/CisComprehensiveWorkflowCoverage.test.jsx`: no CIS controller, correct SOC controller, unchanged native record and no writes. All other CIS/ISO exclusions remain intact. [Acknowledgment](https://github.com/robbashea-lab/GRC/pull/57#issuecomment-6101479256).

Latest refresh retained base `a527d4e79bfab36629b0a0b71eb10c6c018d00bb`; main was `911706cebc7a70c0443f500fcd4bc19260c1db60`. Agent 1 reported exact-head CI run `38077023182` succeeded. That verifies the base, not the new SOC candidate. Agent 1's paused CIS access checks do not release the deployment/session slot or waive SOC restricted-access acceptance.

## Frozen candidate and review ownership

- Initial application commit: `94680c45bac3b14550afdd1ccf075a470df91896`; full Release verification #132 passed.
- Corrected frozen application: `b384b28d121a698f162cf4701a25e5158fed8da9`; SOC-U09 was independently reproduced, narrowly corrected, and independently retested. [Release verification #133](https://github.com/robbashea-lab/GRC/actions/runs/38082617286) passed at this exact provider SHA: frontend/full tests/both builds, backend/real-Mongo campaign and Release gate. Earlier #132 does not substitute for this corrected-head result.
- Independent content reviewer Laplace and functional/security reviewer Bacon completed and released their read-only review ownership. Agent 2 has no outstanding implementation-file reservation on Agent 1's worktree.
- Full scope, commands, case dispositions, fixture cleanup and recovery constraints are recorded in [validation.md](validation.md). Evidence-only commits do not change the frozen runtime or establish hosted acceptance.
- The isolated local Demo deliverable remains at `http://localhost:4212/compliance/soc-2?assessment=fw_demo_prestige_assessment_soc-2_CC1.1`; no Render/shared-authenticated browser slot was used.

## Evidence boundaries

Source review, automated tests, Demo/local-browser tests, hosted placement, hosted authenticated writes, and restricted-session denial are separate gates. No existing CIS test closes a SOC gate. PR remains draft while material gates are unresolved.

No production, main merge, Sites publication, provider-setting change, authentication change, external AI, or database reset is authorized.
