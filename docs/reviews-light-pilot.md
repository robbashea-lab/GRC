# Controlled Reviews light-first pilot

Historical design/QA record. The user subsequently approved platform-wide propagation on 2026-09-15. The pilot stylesheet has been consolidated into `frontend/src/design-system.css`; the authoritative current contract is [design-system.md](design-system.md). References below to route-only scope, waiting for approval, and stopping before propagation describe the earlier pilot, not the current release.

## Approved-direction density refinement

The user approved the overall direction and requested one limited polish pass. This pass changes only pilot CSS and its regression test; it does not propagate to other modules.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM resolved | frontend/src/reviews-pilot.css | 1,056px table minimum clips trailing columns at 1280px | 936px minimum, flexible Title, 118px Next Due, slightly tighter gutters | All columns and row actions fit at common desktop widths |
| LOW resolved | frontend/src/reviews-pilot.css | 48px minimum rows, table begins at y176 | 44px minimum rows; supporting lines may grow naturally; table begins at y164 | Stronger density without hiding information |
| LOW resolved | frontend/src/reviews-pilot.css | Inactive hover blends into canvas | Neutral surface/border hover and pressed feedback; restrained red Overdue text/count | Discoverable controls without permanent pills; selected All unchanged |
| LOW resolved | frontend/src/reviews-pilot.css | Lime icon and lime outline compete with active rail | Lime glyph with quiet neutral outline; active rail retained | One clear navigation brand accent |

Sidebar measurement was 232px at desktop widths before this pass, already narrower than the requested 250–275px target. It was preserved rather than widened. Owner remains 128px to prevent unnecessary wrapping. No navigation labels or structure changed.

Final browser measurements: all columns visible without table scrolling at 1280, 1366, 1440, 1536 and 1920px. At 1440px, Title expands from 402px to 420px; Next Due from 110px to 118px. At 1280px, the table now fits its 1006px container instead of overflowing. At 1024px and below the complete table remains available through contained horizontal scrolling; no columns are hidden.

Validation: 192 frontend tests / 35 suites passed; production build passed with the same four existing hook warnings. JavaScript bundle hash is unchanged from the approved light pilot (1ff58710062506f506db53986e964348d74be2d239f19b8d02813243435abaf3). Browser suites passed density/containment, unchanged selected All, hover/keyboard feedback, search/filter/sort/selection/history/actions, CSV download, portal/drawer, reduced motion, 10% motion capture, unchanged demo data, client switching and restoration of non-Review palettes. No browser console/page errors. The dedicated overflow check passed 390–1920px; small widths retain intentional internal table scrolling. Loading/error injection, physical-device and assistive-technology testing were not repeated for this CSS-only pass.

Disposition: Approve for the inspected refinement scope. Updated local preview only; stop before any propagation or publication.

---

This pilot supersedes the graphite-only direction **on Reviews only**. It is a candidate for visual approval, not approval to roll out to other modules.

## Scope and implementation

`frontend/src/reviews-pilot.css` supplies a scoped token layer, imported after the shared design system. Every rule requires the existing `.register-surface[data-layout="reviews"]` marker via `:root:has(...)`. This includes the shell, Radix menus and drawers while Reviews is open. Navigating elsewhere removes the scope automatically. No theme preference, route, context, persistence or authentication code changed.

`StatusBadge` gains only a `data-status` attribute; stored values, labels and tone mappings are unchanged. The pilot can make Upcoming neutral without changing In Progress or applying brittle text matching. Related record drawers opened within Reviews inherit the pilot; those same modules opened as pages retain their existing theme.

## Visual rules

- Canvas #F7F9FA, table/drawers #FFFFFF, header #F1F3F6, dividers #E4E8ED.
- Sidebar #293039, selected navigation #3E4852, 3px lime #A3DB33 rail. Lime remains separate from completion/success.
- Primary/secondary/supporting/disabled text: #293039 / #4A545E / #666D74 / #A8ABB3.
- Charcoal primary actions, white outlined secondary actions; link blue #2A55C8; focus #4172F4 with 2px outline and offset.
- Selected rows #EFF4FF with blue rail; no whole-row overdue tint. Compact red Overdue label; red/amber due dates; neutral owner, recurrence and Upcoming labels; informational blue In Progress.
- Existing 22px title, 13px register content, 12px supporting text, 32px controls, 48px minimum rows and restrained radii retained. No new motion, dependencies or images.
- Existing product-name/ownership labels were deliberately preserved; this task does not rename the product.

## Review

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM resolved | frontend/src/reviews-pilot.css:4 | Similar dark weight across sidebar/workspace/table | Dark navigation + light working surface | Surface hierarchy is visible before reading |
| MEDIUM resolved | frontend/src/reviews-pilot.css:94 | Neutral selected navigation with no brand rail | Controlled lime rail, neutral dark fill | Separate product identity from operational state |
| LOW resolved | frontend/src/components/StatusBadge.jsx:94 | Upcoming and In Progress share blue emphasis | Upcoming neutral in this pilot | Reduce schedule noise without hiding labels |

Disposition: Approve within inspected implementation scope; visual direction still awaits user approval. Do not propagate.

## QA and limitations

- 191 frontend tests across 35 suites pass, including new scope and contrast tests. Text/semantic pairs meet 4.5:1 on the specified working surfaces; input/focus boundaries meet 3:1 against white. Disabled content is deliberately separate.
- Production build passes with four existing hook-dependency warnings (Calendar, ClientDirectory, Evidence, PlatformAdmin). A strict CI build treats those pre-existing warnings as errors and fails; no unrelated warning cleanup was made.
- Browser: search, AND/OR column filters, quick presets/counts, A–Z/Z–A, dates/recurrence, clear/empty state, history, row selection/actions, keyboard drawer opening, focus, Escape/outside dismissal, reduced motion and a 10% menu-animation capture.
- Dedicated pilot browser check: exact surface colors, neutral Upcoming, selected-row color, white portalled menu, drawer, actual CSV download, and unchanged operational session data after read/export/filter interactions. No page/console errors. No document overflow at 390/768/1024/1280/1440px; wide tables intentionally scroll inside their own frame.
- Eight non-Review routes restore the original dark palette. Shared CSS tests also assert every pilot rule is scoped.
- Core browser workflow checks create/start/complete a Review, Finding/Action remediation and validation, retained evidence/comments/history, Risk/Vendor/Policy recurrence and Calendar links. These exercise isolated Demo, not persistent standard authentication.
- No backend files, handlers, data models, calculation helpers, recurrence logic or scheduling changed. Backend tests were not rerun for this CSS/attribute-only pilot.
- Physical-device and screen-reader testing, exhaustive loading/error injection and legacy browsers without CSS :has support were not verified. Those browsers retain the existing theme.
- Local preview is the review artifact; the previously published version is unchanged unless separately published.
