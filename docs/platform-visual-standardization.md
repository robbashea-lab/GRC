# Shared approved workspace presentation

Source of truth: Render staging's approved Brawndo pilot, commit
`60ebe3f83e03c17bbb84b2921a8c8d9c1fc2dd1b`, PR #56, based on integrated main
`5a57a2e69b386147a5d90b21b43b01af234e9355`. This branch includes that pilot;
it does not merge main or change production, accounts, security settings or data.

The existing branded shell and tokens now default to every selected client and
the portfolio, account and Administration surfaces. Native record components,
permissions, configured framework navigation and persistence remain authoritative.
The portfolio retains separate operational counts rather than a combined score.
New clients do not need names, IDs, configuration or copied Brawndo records.

The shared root owns the light/dark preference across routes and portalled UI.
The historical local-storage preference key is retained to preserve user settings.
The approved dark portal palette and primary-button treatments remain shared. The reference's
Inter headings/header and Segoe UI table/body font stacks are retained.

## Frameworks

CIS uses real applicable IG1/2/3 records; SOC 2 and ISO use the same horizontal
snapshot with their own labels, denominator and tooltip nouns. An empty applicable
denominator remains undefined in the ring. ISO preserves Overview, Statement of
Applicability, ISMS Requirements, Annex A Controls and Internal Audit in that order.
SoA decisions, clause/control structures and audit records retain their own views.
Other catalogued programs inherit the shared shell and native tokens; applicability
only programs are not represented as assessment catalogs.

Safeguard searches retain exact ID/title management actions alongside control
navigation. Dashboard summaries open native records in place and refresh the
current queue after saving without discarding the originating selection.

## Omni boundary

`brawndoWorkspacePilot` and its stable identity configuration remain the approved
Omni artwork, free-drag and guide-window gate. Global presentation uses the separate
`isWorkspacePresentation` predicate. AI approval behavior and the existing task
ownership exception still use the original identity gate.

Existing vendor creation/editing and priority choices retain their original
Brawndo/Prestige workflow boundary through `isReferenceWorkflow`. Sharing the
theme does not remove Category, required assurance records, contributor fields
or Critical priority from other clients' existing native editors.
Vendor projections retain existing active statuses and contract-date fallbacks.
Extra native Vendor columns and the sortable AI table remain where needed to
preserve existing filtering and sorting; their typography, palette and controls
inherit the same theme. Review completion and configuration keep their original
workflow gate. These are functional differences, not alternate design systems.

Legacy guided CIS functionality was already available to other selected CIS
clients across supported groups. That availability and saved interview versions,
answers and revision checks remain intact. This rollout does not upgrade those
clients to Brawndo's character/window or add Omni to other programs.

## Verification matrix and delivery

| Surface | Client/data scope | Themes / widths | Evidence status |
|---|---|---|---|
| Approved baseline modules | Real staged Brawndo | Light / dark; observed browser size | Captures retained under outputs/platform-standardization/baseline |
| Shared modules and configured programs | Four existing Demo clients | Light / dark; 1440 / 1024 / 768 | Local browser matrix passed; final correction rerun required |
| Portfolio, account, Administration | Isolated Demo | Light / dark; 1440 / 1024 / 768 | Local browser matrix passed; final correction rerun required |
| New onboarding / multiple frameworks / CIS transition | Fresh synthetic client, all six supported framework routes | Both themes | Local browser lifecycle passed; final correction rerun required |
| Summary → native record → save/cancel → return | Actual native components | Both themes | Local ticket save/discard/context verification passed |
| Approved and legacy Omni | Both Brawndo identities; existing/future clients | Shared theme enabled | Focused regression passed |
| Hosted authenticated save / onboarding | Authorized staging administrator | Representative clients | Pending staged candidate |

Checks follow user-visible outcomes and isolated data per
[Playwright best practices](https://playwright.dev/docs/best-practices), with changed
interfaces targeted against [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/).
These checks are not a whole-application accessibility or security conformance claim.

Authorized targets: existing Render staging `srv-db1s0cugekts73f72reg` at
https://omnisciente-staging.onrender.com/ and existing owner-private canonical Demo
`appgprj_6a9cafcbde888191ae1b350224562554` at
https://iventure-grc-code-preview.mr-robbashea.chatgpt.site/.
The separate visual-consistency agent preview is not a delivery target.

Rollback references before this rollout: Render pilot commit `60ebe3f` / deployment
`dep-db3agpvlk1mc739vn2rg`; canonical Demo version 123 / source
`fbced4588381f4d4cdbc5b907956b8cb1ee5e6d3`. Roll back the application only;
never reset or reseed MongoDB. Render is still configured from main after CI checks;
until an authorized integration reaches main, a later main deployment could replace
this staged branch. This task does not change that release policy.
