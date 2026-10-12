# GoverNara platform presentation

## Authority and baseline

The user adopted `AGENT1_MASTER_PROMPT.txt` in the GoverNara Platform Implementation Handoff as controlling scope for this phase. ZIP SHA256: `500512ab87507321e959ac5a6a7953810ef5ac0f1a7f6fcd314aa664554c0c69`. All three HTML references were opened with supported browser controls; their sample data and preview handlers are not application authorities.

Integration branch: `codex/governara-platform-alignment`, descended from `b852a0cc3fb01cfa12d1f64467d3a78a17faf2d8`. That combined Login/Nara/controlled-consistency baseline passed CI148 (`38301841843`) and is Live at Render deployment `dep-db6k7aavcj2c738a1d10`. Main remains outside this release.

Agent 2 explicitly transferred integration/staging custody after the baseline deployment. Agent 1 is the sole next deployment owner. Agent 2 continues independent rolling QA. Shared coordination: PR57, comment `6132298626`. The original held Tab5 and administrator/restricted-account readiness restrictions remain unchanged.

## File ownership

| Package | Owner | Boundary |
| --- | --- | --- |
| Canonical semantic palette/fonts, shared shell/brand, portal inheritance | Shared-workflow agent | Presentation only; storage, auth, routes and navigation behavior unchanged |
| Approved Portfolio and client Dashboard presentation | Portfolio/dashboard agent | Named local structural exceptions; real authorized data and navigation |
| Local operational/framework/assistant styling | Coordinator | Palette/font inheritance only; native geometry, wording and workflows unchanged |
| Source inventory and final scope review | Independent reviewer | No product edits |
| Render/session integration and release | Coordinator | Exact passing composite only; staging only |

## Contract decisions

- Keep the completed Login and exact Nara artwork. No new animation or assistant behavior.
- Canonical operational dark colors follow the Brawndo contract: canvas `#071321`, panel `#0c1b30`, border `#263c58`, primary text `#edf3ff`, secondary text `#a8bad5`. Light/dark/system preferences retain their existing behavior. Semantic status colors remain distinct from primary actions.
- Existing native geometry, section order, charts, labels, actions and field meanings are frozen outside the named Portfolio/Dashboard exceptions. Remove conflicting local color/font definitions rather than layering a second theme over them.
- Scenic imagery is scoped to Login and `/clients`. No workspace, framework, account or administration scene.
- Portfolio Priority Risks uses the existing `significant_risks` directory value. Active Frameworks uses actual distinct configured framework keys, preserving CIS group identities. Full Open Work and Recent Changes event counts are not supplied by the current directory contract; represent them as unavailable, not zero or repurposed due-soon/latest-timestamp values. No new API or calculation system.
- Preserve all existing portfolio search/sort/assignment/archive/default/filter/pagination capabilities, including prototype omissions, through native compact controls. Open Portal uses existing client context and route directly.
- Preserve native assessment writers/readers, versions, manual narratives, final-save/Escape corrections, histories, verification and linked records. No business-state writes are necessary to theme a page.

## Work and acceptance register

| Item | State | Evidence or dependency |
| --- | --- | --- |
| Exact compatible base and staging ownership | Complete | b852 / CI148 / explicit Agent 2 handoff |
| Reference package provenance and live browser inspection | Complete | External extraction receipt, three normal reference pages |
| Canonical theme/shell implementation | In progress | Owned shared package |
| Portfolio and dashboard implementation | In progress | Owned local presentation package |
| Operational/framework overrides | Implemented, review pending | CSS aliases; no runtime/data changes |
| Route/renderer inventory and matched before/after checks | In progress | Separate application evidence; prototype checks excluded |
| Independent integrated review | Pending | Stable composite required |
| Final exact-source tests, both builds and CI | Pending | Final composite required |
| Controlled new-phase staging deployment | Pending | Passing gates and frozen composite required |
| Real account/MFA/logout-return and recovery delivery | Unverified | Existing authorized human readiness/access; no secrets requested |
| Existing restricted-user and fault acceptance gates | Retained pending | Presentation publication does not waive them |

## Evidence boundaries

Before artifacts were copied read-only from the frozen Agent 2 b852 builds: authenticated build and explicitly isolated Demo build. The Demo build resides in repository-root `build`, as defined by `frontend/scripts/preview.cjs`; the previously reported `frontend/build` path was absent. No baseline rebuild or Agent 2 worktree mutation occurred.

Fresh hosted b852 public Login checks: served `main.6e12afaa.js` / `main.84930724.css`; Governance → Risk → Compliance content, Escape closure/focus return and `/forgot-password` navigation verified. Navigation is not authentication or recovery-email proof. Actual explicit Demo entry is recorded separately as browser-storage Demo evidence when its destination is confirmed.

No main merge, production/Sites publication, hosting/settings changes, new accounts/grants, data reset or protected assessment writes are authorized in this phase. Final acceptance of the wider platform/security assignment remains open.
