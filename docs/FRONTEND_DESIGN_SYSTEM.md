# Omnisciente interface system

## Philosophy and source of truth

Charcoal-first operational software. Prioritize registers, quick triage, legible
data and contextual editing over decorative panels. No workflow or data changes.
The existing Segoe UI/system font and Lucide icon library remain in use.

`frontend/src/index.css` defines base styles and the retained light palette.
`frontend/src/design-system.css` defines the default charcoal theme and shared
operational component styles. `frontend/tailwind.config.js` exposes semantic
surface, ink, line, interaction and status tokens. These files are authoritative.
Apply `light` to the document element to use the retained light variant. There
was no theme-switching UI; this iteration does not add navigation/preferences.

## Surfaces and color

Canvas #181D23; sidebar #1E2630; work surface #222A33; hover #29323D.
Use `bg-surface-app/card/subtle`, `text-ink-primary/secondary/help` and
`border-line`. Do not introduce page-specific white/slate utilities or hexes.
Semantic color reinforces visible text, never replaces it. Critical/overdue:
red; high: muted warm red; moderate/due soon: amber; current/completed: green;
upcoming/in progress: blue; accepted: restrained violet; low/not assessed:
neutral. StatusBadge owns label-to-tone presentation, not business status.

## Type, spacing and density

Page titles 24px; section titles 16–20px; operational text 13–14px;
secondary metadata 12px. Use a 4px spacing rhythm, 24px page inset, 20px
section rhythm, and compact 6px corners. Preserve horizontal table scrolling.
Numbers use tabular figures; existing meaningful numeric/date alignment stays.

## Shared primitives

- Use the existing Button variants: default primary, outline/secondary,
  ghost/link and destructive. Default 36px, compact 32px. Primary foreground
  and background must be paired; never hardcode a white label on theme primary.
- Existing Input/Select/textarea and Radix menus use shared tokens. Operational
  controls are 36px with visible input borders. Preserve labels, helper text,
  required indicators, validation and disabled states.
- `PageHeader` is compact and retains client context. `register-toolbar`
  unifies search, quick presets, counts and actions without changing handlers.
- `tbl-head`, `tbl-cell`, `row-hover`, TableControls and TableFilterChips
  remain the shared register pattern. Column menus stay portalled; filtering,
  sorting, counts and tenant-scoped session behavior are unchanged.
- `record-drawer`, `drawer-tab`, `record-fields` and `record-field-wide`
  govern existing contextual forms. Preserve Radix focus/Escape behavior,
  existing scrolling, tabs, completion actions and parent register state.
- Empty/loading/error content retains its original meaning and actions and uses
  shared ink/surface tokens. Toasts use the same elevated surface and typography.
- Dashboard KPI cards are compact; measures and drill-through targets stay
  unchanged. Evidence upload is compact and keyboard-operable; files, links,
  permissions and upload behavior remain unchanged.

## Accessibility and maintenance

Maintain a visible focus outline and readable selected/hover states. Native
date inputs inherit color-scheme. Metadata and semantic badge text are tested
against charcoal surfaces at WCAG AA 4.5:1. Honor reduced motion via the shared
CSS rule. Preserve text labels and Radix keyboard/focus semantics.
Use browser QA for light/dark, 1366/1440/1920 widths, drawers, dropdowns,
search/filter state and empty results. Contrast tests supplement visual review;
they are not a complete accessibility certification.

Framework routes retain configured placeholders: no CIS safeguards, mappings,
metrics, SOC 2 functionality, or other framework content are invented.
