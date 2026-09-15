# Reviews visual design pilot

Date: 2026-09-15. Status: local implementation for design review, not published or propagated.

## Scope and design guidance

Used the installed better-ui and emil-design-eng skills and inspected the [reference application](https://sales-crm-kargulstudio.vercel.app). Borrowed density, restrained surfaces and hierarchy, not CRM structure. Existing navigation, forms, workflows, authentication, permissions, scheduling, API contracts and data models remain unchanged.

## Design-system audit

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | Register surface | Toolbar band plus inset bordered card; competing gutters | Continuous canvas, shared 24px gutter, unboxed table | Table becomes the main working surface |
| MEDIUM | Dates and rows | Date labels could wrap over three lines; first baseline row 70px | No-wrap date stacks; standard row 48px | Scan more records without losing dates or titles |
| MEDIUM | Quick filters and owners | Dominant selected tabs and amber uppercase Unassigned pills | Quiet selected controls; neutral owner icons/text | Reserve semantic color for operational status |
| LOW | Typography | Mixed monospace metadata and raw stored type labels | 13px table text, 12px metadata, tabular date numerals, existing configured labels | Consistent hierarchy without changing stored values |
| LOW | Header and actions | Taller header, different control sizes | 22px title, 32px controls, wrapping actions at small widths | More usable table space and consistent alignment |
| LOW | Record focus | Title relied on mouse-clickable row | Focusable title button delegates to the existing row action | Keyboard access to the same authoritative drawer |

At 1440px the table begins at y=176 instead of y=224. Sidebar width remains 232px. Long titles wrap rather than truncate. Status labels and existing semantic colors remain; small dots replace heavy badge surfaces. No new animation, request, package or scheduling logic was introduced.

### Authoritative primitives and remaining inconsistencies

- Retain PageHeader, Button, Input, Checkbox, StatusBadge, TableLoadingRow, ColumnControl, TableFilterChips and existing portaled Radix menus/drawers. Do not replace them with a second component system.
- Added `register-design.css`: reusable, opt-in density and palette tokens plus compact variants of those existing primitives. Rules are guarded by the compact register/shell attributes. Reviews is the only consumer.
- Layout observes the router pathname solely to apply/remove the pilot palette during client-side navigation. Sidebar structure and behavior are unchanged.
- `reviewPresentation.js` obtains display labels from the existing schema. Filters, sorting, search, values and CSV behavior are unchanged.
- The audit found overlapping base/override definitions in index.css and design-system.css (header size, gutters, radii and sidebar dimensions). Consolidate only after approval, not during this pilot.
- Other registers and custom Risk/Vendor dialogs retain inconsistent field spacing, control sizing and surface treatment. These were inspected, not restyled.
- Existing focus/reduced-motion behavior is reused; loading and empty components remain authoritative. No shimmer, blur or decorative entrance animation was added.

## Validation

Final production assets: `main.aa942e7f.js`, `main.47db1ef8.css`; main JS SHA-256 `ddb8c9fe047916aae544d194cef9fced001fdb42021e306a359c8d23217eccbd`.

- Frontend: 167 tests in 32 suites passed on the final implementation.
- Lint: 168 JS/JSX files, zero errors; four existing exhaustive-dependency warnings in Calendar, ClientDirectory, Evidence and PlatformAdmin. Final build succeeds with those same warnings.
- Added presentation, scope and contrast tests. Candidate dark text tokens meet 4.5:1 across candidate surfaces; input boundary meets 3:1. This is not a claim of a full application accessibility audit.
- Browser: title A–Z/Z–A; type OR combinations; owner Unassigned; cross-column AND; search plus filters; individual chips; Clear all; quick presets/counts; date/recurrence filters; filtered empty state; history; selection/bulk toolbar; existing row actions; keyboard record opening.
- Browser: Escape/outside dismissal, focus restoration, visible focus, keyboard-initiated instant menus, reduced motion, and menu motion inspected at 10% playback speed.
- Browser: clean document layout at 768, 1024, 1280 and 1440px; horizontally scrollable table retains all columns and menus stay within the viewport. Also inspected 390px: compact header actions wrap, but the unchanged Demo banner reset control extends about 8px past the viewport. Full phone-shell redesign is outside this pilot.
- Dark/light screenshots reviewed. Light theme inherits existing semantic tokens and hover treatment; only the dark palette is proposed for replacement.
- Brawndo and Initech checked; switching clients does not retain prior owner filters. A full before/after session-data comparison confirms sorting/filtering/viewing did not mutate operational records.
- Client-side navigation confirms the Reviews palette is removed on Dashboard and restored on Reviews. Dashboard, Calendar, Action Items, Risks, Policies, Vendors and Evidence smoke checks retain their original styling.
- Full browser workflow passed against the exact final JS asset: Review creation/start, evidence/comment, Finding plus one remediation Action, completion/recurrence, historical occurrence reopening, separate Finding validation, Risk scoring/reassessment, Vendor review dates, and Policy review dates without lifecycle changes. No browser console/page errors in that workflow.
- AST comparison confirms all 28 RecordListPage event handlers and its non-render logic are unchanged. All seven Layout handlers are unchanged; the only added non-render statement reads router pathname for visual scoping.
- Diff review and whitespace check passed. Sensitive-literal scan of changed files and nine build assets returned no findings. No backend, environment, credential or dependency files changed.

### Performance findings and limits

No API requests were added; no new libraries, effects or data processing were introduced. Main JS grew approximately 0.7kB gzip and CSS approximately 1.2kB gzip relative to the baseline. The measured filtered table DOM grew from 323 to 351 nodes (accessible title buttons and owner icons).

Seven-sample local browser probes used the same seeded client and blocked third-party analytics in the test harness only. Earlier controlled medians: navigation 217ms before / 242ms after; search 88ms / 89ms. Final quiet-run medians: navigation 101ms / 137ms; search 29ms / 45ms. These are Playwright click/assert timings, not field INP or a statistically controlled benchmark. They show a modest local timing increase, so this report does **not** claim proven zero regression. Interactions remained prompt in the inspected browser. Repeat profiling on the intended staging device before platform-wide rollout; do not remove unrelated analytics or rewrite working behavior to manipulate measurements.

Not verified: live backend/standard authentication (unchanged and deferred), production performance, screen-reader traversal, exhaustive light-theme contrast, real network-delayed loading appearance, all modules at all breakpoints. No published-preview QA is claimed for this build.

## Review artifacts and release state

Local preview: http://127.0.0.1:4174/login — Explore Demo, choose a client, then Reviews.

Screenshots in the parent work directory: reviews-before-1440.png, reviews-after-1440.png, reviews-after-initech.png, reviews-after-768.png, reviews-focus-check.png, reviews-light-check.png and reviews-slow-motion-menu.png. They are local review artifacts, not application assets or committed demo data.

No commit, push or publish was performed for this visual pilot. The existing published v29 preview remains unchanged. Design approval is pending.

## Recommended rollout after approval

1. Confirm this Reviews direction and resolve the performance measurement caveat.
2. Promote approved tokens/compact variants into the existing authoritative design system, removing overlapping definitions carefully.
3. Apply to shared registers in small batches: Action Items/Findings, then Policies/Contacts; separately validate specialized Risks/Vendors.
4. Align forms and drawers using existing components, then consider portfolio/dashboard surfaces without changing their information architecture.
5. Keep before/after screenshots, keyboard/responsive tests, workflow regressions and performance comparisons for every batch. Mobile shell and legacy light-theme issues require a separately approved scope.

Visual audit disposition: **Approve** for the inspected Reviews desktop pilot to proceed to user design review, not authorization to publish or roll out. No HIGH-severity visual issue remains in that inspected scope; the limitations above remain explicit.
