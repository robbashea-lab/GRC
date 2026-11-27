# Risk workflow implementation handoff — 2026-10-20

Baseline: `a4c93084`; branch `codex/brawndo-new-workflows-20261020`. Working tree only, no commit/release from this owner. Root owns shared RecordDrawer integration. Other module owners' changes are present and were not edited.

Reference read: all 612 lines of risk-workflow-original.html plus RISKS.md, VISUAL_AUTHORITY.md, USER_DECISIONS.md and IMPLEMENTATION.md. Exact original receipt: SHA256 df323fda209a3dd8d89cd003bf515fb06667358d25bff92142c85da48698a1bb. Browser/reference interaction, screenshot image inspection and rendered visual acceptance were not performed by this owner.

## Implemented and integration contract

- RiskRegister NewRiskDialog keeps its native controller, POST, required rating validation, create lock, failure retention, actual created refresh and discard guard. The trusted full-record gate plus exact `/risks` route selects the new three-section presentation; all landing markup remains unchanged. Optional Owner remains optional and is omitted from POST when empty.
- BrawndoRiskWorkflow.jsx owns only presentation: five tabs, draft scales/matrix, description and metadata, Details, native schedule/assignee controls, treatment plan and linked Action operations, actual completed Review occurrence table/rating history and real audit timeline. Parent callbacks retain save/permission/linked destination commands.
- New CSS uses scoped selectors, bundled Inter bytes under its own family, exact light/dark tokens, reference measurements and narrow reflow. Native popup shell remains. Source and schedule native helpers gain optional workflow styling only; source clearing/requests and cadence/manual-date behavior remain.
- Root wires saved component in RecordDrawer only under the trusted eligible Risk gate, with native record, form/setForm, tab/setTab, heading ref, permissions, related tasks/history/activity/loading/errors and existing onOpen/onOpenOccurrence/onLinkAction/save/close callbacks. `decisionControls` moves native operations into the approved decision area. Parent retains native nested command dialogs. No RecordDrawer edits performed by this owner.

## State matrix

| Reference selector/state | Native binding | Candidate status | Rendered receipt |
| --- | --- | --- | --- |
| New `.secn`, `.grid`, `.scale`, `.calc`, footer | native NewRiskDialog form/save | Implemented; required L/I amendment from received user decision | Pending |
| New pristine/unrated/invalid/dirty/error/retry | same native controller; inline validation and first error focus | Implemented; focused tests prepared | Pending |
| New source record conditional | RiskSourceFields real same-client source fetch/clearing | Implemented native Explore sources, including Other | Pending |
| Saved `.mh`, `.tabs`, `.two`, Details | parent record/draft and permissions | Component ready; root integration | Pending |
| `.mm.on/.was`, assessment scales | draft L/I; native assessedRisk; prior record cell | Component ready; no writes from scales | Pending |
| `.dec`, plan, `.lnk-row` | native treatment and notes; task create/link/open callbacks | Component ready; native Explore proposed Accept retained | Pending |
| `.decide` | native Review/Accept/Close callbacks | Root integration; approved native-flow adaptation | Pending |
| `.banner.acc/.cls` | actual acceptance/closure fields | Component ready | Pending |
| `#hist` | actual completed occurrence risk_after, actor, notes, native opener | Component ready | Pending |
| `#act` | actual scoped audit events; actual score metadata/changed fields | Component ready | Pending |
| Dark/narrow/focus/disabled | local tokens; native dialog focus/guards | CSS implemented, unverified rendered | Pending |

## Decisions and remaining limitations

Received via root: keep required L/I; native linked Review; authenticated approver read-only; native closure reasons and optional note; preserve Review/Close save-before. Owner optional was already explicit. Native ordinary Save closes.

Corrected current evidence: the standard backend is not the active Explore adapter contract. frontend/src/preview/risks.js ensureRiskReview explicitly supports source Other for canonical demo_brawndo and validates/retains source_other/category_other. frontend/src/preview/decisions.js guardEdit permits proposed treatment Accept for that Risk pilot. Existing frontend/src/preview/brawndoRisks.test.js verifies both paths and distinguishes proposed treatment from formal acceptance. Source Other and proposed Accept are therefore resolved by native implementation evidence, not a new user decision. The scoped presenter retains their existing draft/create/save paths; no backend or command change was made. Earlier source/proposal-blocker language was incorrect for Explore and is withdrawn.

Real same-client source and framework-assessment openers are implemented in the metadata card through the parent related prop and native onOpen callback, including original Review occurrence context. Root must pass related={related}. No old Related tab is restored. Existing meaningful legacy treatment_plan and per-axis rationale are retained readably without overwriting canonical notes/general rationale. Compensating-controls data remains; its existing editing command belongs in the retained native acceptance operation.

## Checks

Babel parser: RiskRegister.jsx, RiskGovernanceFields.jsx, BrawndoRiskWorkflow.jsx and BrawndoRiskWorkflow.test.jsx parsed successfully. CSS parsed with PostCSS; all seven lucide icon exports verified; tracked diff whitespace check passed (line-ending normalization warning only). Tests prepared in frontend/src/pages/BrawndoRiskWorkflow.test.jsx cover required ratings, draft-only scale changes, canonical POST/optional Owner, failed creation/retry, duplicate lock/discard and negative scope controls. No test/build process launched under another owner's CPU lease. No browser, hosted or deployment proof claimed.

Next: root integrate shared shell/commands and resolve held controls; acquire CPU lease and run focused behavior tests; compare exact reference/candidate state pairs and execute actual native journeys before any acceptance claim.

Reviewer P2 correction: commandPending now locks background draft fields, scales, schedules, owner picker, tabs, Re-assess, source/framework/Action/occurrence openers, retry and footer controls while the parent native decision body stays usable. This restores the former nested-dialog isolation. Tests prepared; not yet executed.
