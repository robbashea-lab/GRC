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

Agent 1 retains the only Render deployment/authenticated browser slot. No slot has been transferred. Current reference runtime deployment is `dep-db56e2d9fdbs73bpcq50`, service `srv-db1s0cugekts73f72reg`. This is not independently verified SOC deployment evidence.

Do not reuse QA—CIS IG2, the archived QA—Closeout CIS IG3, or pending restricted-access identities. No SOC staging fixtures have been created. Local Demo browser fixture: `clients_demo_mv2rvd49_hx9heqot`, **Agent 2 SOC Omni local QA 20261010**, created through normal onboarding on loopback port 4212; default 33 Security criteria, explicitly expanded to all 61 for coverage. No accounts/contacts/owners were created. Prestige Worldwide is read-only reference data, not a QA fixture.

Agent 1 additionally acknowledged the minimum SOC-only case/fixture change in `frontend/src/components/CisComprehensiveWorkflowCoverage.test.jsx`: no CIS controller, correct SOC controller, unchanged native record and no writes. All other CIS/ISO exclusions remain intact. [Acknowledgment](https://github.com/robbashea-lab/GRC/pull/57#issuecomment-6101479256).

Latest refresh retained base `a527d4e79bfab36629b0a0b71eb10c6c018d00bb`; main was `911706cebc7a70c0443f500fcd4bc19260c1db60`. Agent 1 reported exact-head CI run `38077023182` succeeded. That verifies the base, not the new SOC candidate. Agent 1's paused CIS access checks do not release the deployment/session slot or waive SOC restricted-access acceptance.

## Evidence boundaries

Source review, automated tests, Demo/local-browser tests, hosted placement, hosted authenticated writes, and restricted-session denial are separate gates. No existing CIS test closes a SOC gate. PR remains draft while material gates are unresolved.

No production, main merge, Sites publication, provider-setting change, authentication change, external AI, or database reset is authorized.
