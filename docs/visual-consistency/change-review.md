# Visual-only change review

All application paths below are relative to `frontend/src/`. Backend, catalogs, dependency manifests/lockfile, permission models, APIs, handlers, calculations, controls and visible strings have no visual-workstream diff against the stacked base.

| File | Narrow reason | Connected workflows |
| --- | --- | --- |
| design-system.css | Existing High becomes amber and Accepted neutral; shared title/metric tokens, readable amber text | Shared badges/registers/metrics, both themes |
| components/StatusBadge.jsx | Missing pending validation/due soon/attention/partial/validated tone mappings | Existing labels and caller values retained |
| components/StatusBadge.test.jsx | Updated approved tone expectations | No behavior expectations weakened |
| components/SemanticPresentation.test.jsx | Regression checks for tone, exact labels, CSS leak, portfolio surfaces, framework styling | Component and source presentation checks |
| pages/BrawndoRisks.css | Remove broad High/Accepted overrides leaking into sibling routes; High rating amber | Risks and all shared badges |
| pages/BrawndoPortfolio.css | Shared 22px title / 25px neutral totals; remove independent font import/count bubbles; tabular counts, restrained rails, readable neutral zeros and input boundary | Search/filter/drill-down existing behavior |
| pages/ClientDirectory.jsx | Tone map and existing tile class expression only | Mixed Critical/High amber, Unassigned neutral; totals unchanged |
| components/BrawndoPage.css | Shared 22px generic title and readable dark input boundary | Non-reference register headers and existing controls |
| components/ClientSurface.css | Shared 22px title and existing input boundary token | Client modules, Administration and account indirectly |
| components/CisStatus.jsx | needs_attention amber, not_applicable neutral | CIS/ISO/SOC existing status labels and progress bars |
| components/BrawndoCisOverview.css | Shared 22px heading; incomplete-assessment attention amber; dark input boundary | Framework headers/overview only; coordinated overlap |
| components/BrawndoProfile.css | Shared 22px title and dark input boundary | Existing Client Profile settings/content |
| pages/BrawndoActionItems.css | Remove 25px/500 override; inherit shared title | All client Action Items and existing Findings redirect |
| pages/BrawndoCalendar.css | Neutral event-type metadata; shared overdue colors; wrap existing event titles | Calendar navigation/date/drag controls unchanged |

Outside `src/`: `.openai/hosting.json` selects the newly authorized independent private preview; `frontend/scripts/qa/visual-consistency.cjs` captures text/AX/computed styles/screenshots; `visual-preservation.cjs` compares AST and CSS to exact base; `visual-workflows.cjs` operates fresh loopback-only synthetic Demo searches, portfolio drill-down, calendar, keyboard/reflow, Omni and admin dialog; this docs directory records audit, tone and ownership evidence. No new package or runtime feature.

## Cross-client acceptance matrix

Each cell means capture plus exact visible-content/control/AX comparison in both themes, at 1440/1024/768. It is synthetic Demo coverage, not a real authenticated tenant claim. Final pass/failure is in handoff evidence.

| Module | Brawndo | Dunder Mifflin | Prestige Worldwide | Initech |
| --- | --- | --- | --- | --- |
| Dashboard | Reference protected | Shared reference | Shared reference | Shared reference |
| Reviews | Reference protected | Same component | Same component | Same component |
| Action Items / Findings redirect | Capture + search | Capture + search | Capture + search | Capture + search |
| Calendar | Capture + month round trip | Capture + month round trip | Capture + month round trip | Capture + month round trip |
| Risks | Capture + search | Capture + search | Capture + search | Capture + search |
| Policies | Capture + search | Capture + search | Capture + search | Capture + search |
| Vendors | Capture + search | Capture + search | Capture + search | Capture + search |
| Evidence | Capture + search | Capture + search | Capture + search | Capture + search |
| Contacts | Capture + search | Capture + search | Capture + search | Capture + search |
| Systems & Scope | Capture + search | Capture + search | Capture + search | Capture + search |
| AI Governance | Capture + search | Capture + search | Capture + search | Capture + search |
| Client Profile | Capture | Capture | Capture | Capture |
| Configured framework | CIS IG1 | ISO 27001 | SOC 2 | CIS IG2 via existing CIS route |

Platform capture: Portfolio, Client Management, Users & Access, Roles & Permissions, Security & Auth, Audit Log and My Account. Extra browser acceptance: Portfolio search/drill-down, Omni keyboard open/Escape/focus restoration and Admin Add user open/Escape in both themes. Each client/module search is reset after the no-result check; no record creation, save, delete or permission changes. 720px reflow/focus captures are selected browser checks, not a native zoom or screen-reader audit.

## Preserved exceptions and limitations

Approved Reviews title remains 25px/500 and Dashboard 28px/600. Other page titles consume 22px/600. Existing framework identity, metric cards, table content hierarchy, labels, icons and data remain heterogeneous where intentional; no forced business-content uniformity. Dashboard's existing assessment color vocabulary remains frozen with its read-only reference. No redesign of either reference.

Only configured framework routes exist in the capture seed. IG3 and unconfigured-framework behavior is exercised by existing automated regression suites, not claimed as browser coverage. External font delivery, native browser 200% zoom, assistive technology, authenticated hosted access, backend persistence and whole-application compliance/security are not proved by this static visual preview.

CI currently excludes the stacked PR base `codex/admin-console-hardening`; owner notified. Manual dispatch of the existing release workflow is preferred over modifying the active owner's CI file. No merge or production/shared Render change is part of this work.
