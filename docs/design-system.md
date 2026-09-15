# Omnisciente approved visual system

The user-approved, density-refined Reviews page is the visual reference. On 2026-09-15 the user authorized propagating it across the platform. This supersedes the previous graphite workspace: **light operational workspace, charcoal navigation, restrained lime navigation rail**. Do not redesign the reference or turn every module into a Reviews page.

## Authoritative implementation

`frontend/src/design-system.css` owns palette, density and shared component treatment, including native controls and portalled menus/drawers. `index.css` retains fonts and existing layout utilities; superseded palette defaults were removed. There is no route-specific theme stylesheet, route inspection, theme state or new dependency.

- Canvas #F7F9FA; working surfaces #FFFFFF; table heads/subtle surfaces #F1F3F6; dividers #E4E8ED; stronger dividers #D5DAE1; input/active boundaries #8C949E.
- Text: primary #293039, secondary #4A545E, supporting #666D74, disabled #A8ABB3.
- Sidebar #293039, hover #333C46, selected #3E4852; selected text white. Lime #A3DB33 is limited to the brand glyph and 3px active-navigation rail; the logo outline is neutral.
- Primary buttons charcoal; secondary buttons outlined white. Blue is reserved for links, focus and meaningful informational states. Red means critical/overdue/error; amber attention; green success. Upcoming remains a neutral label.
- Titles 22px; register content 13px; metadata 12px; controls 32px; control radius 5px; rows minimum 44px with 5px vertical padding and natural growth for wrapping content; desktop gutters 20px.
- Sidebar remains 232px on desktop (already below the earlier 250–275px requested target); existing narrower responsive widths remain.
- Selected quick filters retain the approved outlined-white treatment. Inactive hover/pressed states use neutral surfaces/borders, not permanent pills. Existing active-filter chips and visible focus remain.

Shared classes include page-content, page-gutter, register-table-frame, register-search, register-toolbar, register-body, quick-filters, ui-control, ui-tabs-list, column-control and the existing status/menu/drawer primitives. Existing module handlers, labels, columns and workflows are unchanged.

Reviews alone retains fixed column geometry through `data-layout="reviews"`: 936px minimum table width, flexible Title, 118px Next Due, 128px Owner. Other registers keep their existing column composition and contained scrolling; no columns are hidden. Dark login/sidebar controls use inverse text and surfaces, avoiding white-on-white text when standard login is enabled later.

## Module coverage and intentional differences

Client portfolio and management, platform users/roles/security/audit, Dashboard, Calendar, Reviews, Findings, Action Items, Risks, Policies, Vendors, AI Governance, Contacts & Roles, Evidence, onboarding, client settings, account and applicable framework pages consume the shared system.

Dashboard retains management panels; Calendar retains its grid; onboarding retains its stepper; framework pages retain assessment/detail structure; Evidence retains upload and relationship views. Login retains its existing dark entry composition and deferred standard sign-in. Drawers retain function-specific fields, widths and action placement. No module-specific workflow is replaced by a visual template.

## Verification record

The final local production preview is served at http://127.0.0.1:4174. The approved Reviews build was preserved separately and compared against the rollout at 1440px: **zero differences** across sampled component geometry and computed styles (header, title, subtitle, toolbar, search, selected filter, table cells/heads, title/date/owner/status and navigation).

Desktop density checks cover 1280, 1366, 1440, 1536 and 1920px: all Reviews columns and row actions fit. At 1440px Title is 420px and Next Due 118px; at 1280px Title is 260px and table/container are 1006px. Rows are 44px; table begins at y164. At smaller widths complete tables remain available through contained scrolling, with no hidden columns.

Automated regression and browser coverage:

- Frontend: 193 tests across 35 suites passed, including shared token contrast checks. Production build passed. Lint: 172 JS/JSX files, zero errors and the four existing warnings listed below. There is no separate TypeScript check configured in this JavaScript project.
- Isolated backend regression tests (110 tests); no connection to a production or uncertain development database.
- Browser platform/admin/module sweep, all five Demo clients across principal routes, their actual configured framework links, client switching, refresh and deferred sign-in/logout.
- Reviews sorting, AND/OR filtering, search, quick filters, chips/clear, filtered empty state, history, selection, row actions, CSV export, record drawer and unchanged source data.
- Review → Finding → Action completion and separate validation; occurrence history/evidence and risk/vendor/policy review cadence.
- CIS onboarding/assessment/action/finding/evidence/reconfiguration and AI Governance workflows, including tenant separation.
- Dashboard drill-down/count and framework-view regression checks.
- Keyboard focus, Escape/outside dismissal, reduced motion, 10%-speed menu inspection and representative desktop/tablet widths. No page/console errors in the executed suites.

The JavaScript runtime bundle remains byte-identical to the approved light Reviews preview: `main.a550cab4.js`, SHA-256 `1ff58710062506f506db53986e964348d74be2d239f19b8d02813243435abaf3`. This propagation changes presentation, not business logic. The frontend build retains four existing hook-dependency warnings (Calendar, ClientDirectory, Evidence, PlatformAdmin); unrelated hooks were not refactored.

Final CSS artifact: `main.9aa546a9.css` (16.92 kB gzip). Runtime JavaScript is 269.62 kB gzip. AST comparison with GitHub main confirms 250 existing event handlers and non-render logic unchanged across 21 modified existing JS/JSX files; the status-tone mapping and configured-label presentation helper were reviewed separately. Diff/path/credential-pattern checks passed. These are regression and safety checks, not a security certification.

## Design review — shared-surface consistency

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM resolved | frontend/src/design-system.css:1 | Light Reviews pilot alongside older graphite modules | One approved shared palette | Consistent surfaces without route-dependent styling |
| MEDIUM resolved | frontend/src/index.css:6 | Superseded fallback palette alongside the current system | Fonts/layout remain; palette is centralized | Prevent future contradictory theme edits |
| LOW resolved | frontend/src/design-system.css:90 | Uneven register density across modules | Shared 44px minimum rows, 32px controls and 20px gutters | Preserve the approved information density |
| LOW resolved | frontend/src/components/StatusBadge.jsx:30 | Upcoming shared informational emphasis | Explicit status hook, neutral Upcoming, existing state unchanged | Match the reference without brittle label matching |

## Boundaries

No backend/authentication/model/API/RBAC/data/scheduling/scoring changes. No secrets, environment values, generated builds or temporary QA artifacts belong in the commit. Standard authentication remains deferred; browser QA exercises isolated Demo, **not** a deployed persistent standard backend.

Not verified: every possible loading/error branch, physical touch devices, screen-reader combinations, full browser-engine matrix and persistent-backend standard authentication. Publication is separate from local validation; this document does not assert that the hosted preview is updated.

Disposition: **Approve for the inspected scope.** Preserve this baseline and run approvedLightSystem, registerDesign, ReviewsPresentation and the browser comparison before future visual changes.
