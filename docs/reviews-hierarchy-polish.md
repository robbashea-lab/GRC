# Reviews hierarchy/contrast polish

2026-09-15. Preserves the approved graphite surfaces, compact geometry and workflows. Limited to the Reviews pilot; not published.

## Surface and text hierarchy findings

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | frontend/src/register-design.css:24 | Secondary text and headers too similar to supporting metadata | Primary #F2F2F2, secondary #D0D0D0, tertiary #ABABAB, disabled #808080 | Four explicit neutral luminance levels; actionable information stays readable |
| MEDIUM | frontend/src/register-design.css:262 | Selected navigation and filters too quiet; column chevrons faded | Selected sidebar inset border and stronger text; #888888 active filter borders; full-opacity chevrons and neutral active header surface | Static state cues remain visible without colored structural backgrounds |
| LOW | frontend/src/register-design.css:293 | Both date lines carried equal emphasis; row actions receded | Semibold primary date, tertiary relative text and recurrence; brighter row actions with hover/open outline | Distinguish content, metadata and available actions without increasing density |

Search retains its contrast-tested #747474 resting boundary and gains #888888 hover boundary. Sidebar normal text is secondary, icons tertiary; selected text/icons are primary. Existing focus colors and motion are unchanged. Ascending sort uses the existing chevron rotated upward; descending remains downward. Filtered columns retain their underline and gain a neutral surface. Active chips and Clear all remain existing controls.

Reviews Needs Scheduling uses the existing duesoon/amber tone through a presentation-only prop. No status value or workflow changes. Overdue/error, in-progress/information and completion retain existing red, blue and green semantics. Relative date text is neutral supporting information; the primary date retains its semantic tone.

## Verification

- 169 tests / 32 suites passed; neutral-token, four-level ordering, 4.5:1 supporting-text and 3:1 active/input boundary checks included.
- Production build passed, same four existing hook dependency warnings. Assets main.e114303d.js and main.44fde55b.css. No new dependencies, requests or effects.
- Browser: exact table y=176 and row height=48, brighter header indicators, selected navigation weight, selected-tab boundary, primary/secondary date styles, neutral surfaces, portal menus/drawers, light exclusion and route scoping.
- Full existing browser presentation suite passed: sort/filter combinations, search, quick presets, active chips/clear, history, selection/actions, keyboard drawer, Escape/outside dismissal, focus, reduced motion, 10% motion capture, client switching, no operational mutations or API requests.
- Final screenshot visually reviewed: ../reviews-hierarchy-final.png outside Git. Existing responsive limitation at 390px (Demo banner overflow) remains; 768–1440 document layouts pass.
- Not verified this pass: screen-reader traversal, real network-delayed loading appearance, live backend authentication, production performance. No claim that earlier pilot timing caveats have been resolved.

The better-ui and emil-design-eng skills guided restrained static emphasis rather than new colors or motion. No platform-wide rollout, commit or publication was performed.

Disposition: **Approve** for the inspected Reviews hierarchy and contrast scope; no HIGH findings remain in that scope.
