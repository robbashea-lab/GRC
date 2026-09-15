# Omnisciente approved visual system

The approved Reviews implementation is the visual reference, not a universal page template. Preserve its layout, density and hierarchy. Do not introduce an alternative module theme.

## Authoritative implementation

`frontend/src/design-system.css` owns the shared palette and primitives. The former route-specific Reviews stylesheet has been consolidated into it. Use existing tokens and components rather than local color overrides.

- App/table/header: #181818; sidebar: #151515; surface: #1C1C1C; subtle: #202020; hover: #292929; selected: #303030.
- Text: primary #F2F2F2, secondary #D0D0D0, supporting #ABABAB, disabled #808080.
- Dividers #343434; strong boundary #606060; input boundary #747474; active boundary #888888.
- Titles 22px; register content 13px; supporting metadata 12px; controls 32px; control radius 5px; register rows minimum 48px; desktop gutter 24px.
- Red communicates critical/overdue/destructive state; amber attention; blue information/in-progress/focus; green success. Ordinary structure stays neutral.

Shared classes include page-content, page-gutter, register-table-frame, register-search, register-toolbar, register-body, quick-filters, ui-control, ui-tabs-list, column-control and the existing status, floating menu and drawer primitives. Reviews alone retains its approved fixed column geometry through data-layout="reviews". Other registers may wrap and horizontally scroll inside their own container.

## Intentional composition differences

Dashboard retains management panels; Calendar retains its grid; onboarding retains its stepper; framework pages retain assessment/detail structure; Evidence retains upload and relationship views. Login retains its existing entry composition. Drawers retain function-specific fields, widths and action placement. These are not new themes.

## Validation of this rollout

- Approved/current Reviews comparison: no differences across the sampled computed styles and geometry.
- Frontend: 169 tests, 32 suites passed.
- Offline backend: 109 tests passed using isolated test data. Historical remote-environment suites were not run against uncertain databases.
- Lint: 168 JS/JSX files, zero errors; four existing hook-dependency warnings in Calendar, ClientDirectory, Evidence and PlatformAdmin.
- Production build passed. JS gzip 269.45 kB; CSS gzip 17.58 kB. No new dependencies, requests or decorative animations. Bundle changes are small; this is not a measured end-user latency guarantee.
- AST comparison with the approved source snapshot: 257 existing event handlers and non-render logic unchanged across 23 changed JS/JSX files. Exceptions are removal of the obsolete route-only theme hook and a presentation-only needs_scheduling status-tone mapping.
- Browser checks: five demo clients and their principal module routes; platform/admin sweep; core Review/Finding/Action/Risk/Vendor/Policy workflows; AI Governance and CIS onboarding/assessment workflows; dashboard drill-downs; Reviews sorting/filtering/search/history; logout and deferred standard sign-in.
- Keyboard focus, Escape/outside dismissal, reduced motion and representative desktop/tablet widths checked. No console/page errors in the executed browser suites.

## Boundaries and remaining verification

Backend authentication, source models, API contracts, RBAC and operational calculations were not changed. Browser QA exercised isolated Demo, not a deployed persistent standard backend. All possible error/loading branches, assistive technologies and physical mobile devices were not exhaustively exercised. Existing light mode was smoke-tested; graphite dark mode is the approved reference.

No new functional defects were repaired as part of this propagation. Existing module-specific content and metadata remain. Publication is separate from local validation; this document does not assert that the hosted preview has been updated.

## Design review

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Resolved | Shared surfaces | Approved graphite scoped to Reviews | One shared graphite palette | Consistent workspace identity |
| Resolved | Registers and controls | Mixed density and boundaries | Shared compact primitives | Preserve the approved hierarchy |
| Resolved | Forms and overlays | Inconsistent visual treatment | Shared typography, surfaces and control tokens | Cohesion without workflow redesign |

Disposition: Approve within the inspected scope. Future visual changes should preserve this baseline and run registerDesign and ReviewsPresentation tests plus browser comparison.
