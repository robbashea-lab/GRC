# Reviews dark palette refinement

2026-09-15. Color-only follow-up to the approved Reviews layout direction.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | frontend/src/register-design.css:4 | Blue-gray surfaces, borders, text and inherited portal colors | Neutral charcoal/graphite tokens, including portalled menus and drawers on Reviews | Remove the pervasive blue cast while retaining semantic color |

Palette: app/table/header #181818, sidebar #151515, surface #1C1C1C, subtle/control #202020, hover #292929, navigation/row selection #303030, dividers #343434. Text uses neutral #EBEBEB / #BFBFBF / #A6A6A6. Input boundary #747474 preserves contrast.

The dark-only root selector observes the existing Reviews pilot attribute using CSS :has(), allowing existing portalled controls to inherit the same tokens. No JavaScript, layout, typography, spacing, component structure, motion, permissions, data or workflow changes in this pass. Other routes and the light theme retain their palettes. Blue focus, links and meaningful informational states, plus red/amber/green status tokens, remain unchanged.

Guidance: better-ui and emil-design-eng; used their restraint and surface-consistency principles without adding animation or redesigning controls.

Validation: 168 frontend tests in 32 suites pass, including neutral RGB/HSL assertions and contrast checks. Production build passes with the same four existing hook warnings. Main JS remains main.aa942e7f.js; CSS is main.1df54e11.css (+121 bytes gzip). Browser checks confirm neutral app/sidebar/menu/drawer/selection colors; table y=176 and row height=48 remain identical; empty/clear filters, record drawer, client-side route scoping and light-theme exclusion work. No page errors in the palette check. Main screenshot visually inspected: ../reviews-neutral-charcoal.png (outside repository).

No new performance claim is made: earlier pilot profiling caveat remains. Real-backend authentication, screen-reader traversal and delayed-network loading appearance were not verified in this color-only pass. Existing 390px Demo-banner overflow remains outside scope. No commit, push, publish or platform-wide rollout performed.

Disposition: **Approve** for the inspected Reviews palette; broader rollout still requires separate approval.
