# Visual inventory and correction plan

Initial inventory base: PR #53 `55c394001d26b6b998996f142dd5fafa8fc05a61`, including PR #52 `5fd3fd310c2e38e360a9123baeb04e9f26e7be18`. Latest combined base at this checkpoint: #53 `f67944f03e9e03aefd83dd9c63d5fa53c7a6cd5e`. Final verification uses the rebased revision, not the initial head. The fixed-clock local Demo capture records actual computed typography, weights, line heights, counts, statuses, owners, table density, surfaces, borders, geometry and both themes per route. `frontend/scripts/qa/visual-consistency.cjs` produces the machine inventory and screenshots; release evidence is delivered separately and on PR #54.

## Reference and content freeze

Brawndo Reviews and Dashboard are read-only references. Current Reviews uses its approved 25px/500 title exception, 12px table content, wrapped rows, shared dates/owners and status dots. The current dashboard component is shared across all clients: its 28px title and existing programme cards are retained, with no forced content uniformity. Documentation's generic 22px title token applies to non-reference page titles. Existing CSS capitalization is preserved because changing it would change visible wording; no new transforms are introduced.

| Inspected area | Current presentation / deviation | Intended correction | Owner |
| --- | --- | --- | --- |
| Client Portfolio | 30px title; independent imported fonts; 32px metrics; red/amber count circles; combined Critical / High alarm tone; 12px card radius | Existing approved font stack, shared title/count tokens, neutral count surfaces with restrained semantic rail, amber combined severity and neutral Unassigned, preserve every value/click | BrawndoPortfolio.css; ClientDirectory presentation map |
| All client dashboards | Shared ClientWorkDashboard / BrawndoDashboard.css; matching programme cards and typography, framework vocabulary differs intentionally | Preserve both files exactly against the stacked base; computed title/status/count/table/card inventory must match | Existing shared dashboard |
| All Reviews | Shared reference implementation, 25px/500 title, 12px content, variable row heights for content; status/date/owner grammar already shared | Protect styles/geometry/content with baseline comparisons | Reviews reference |
| Action Items / Findings redirect | High inherits red background from global Risks selector; Pending Validation defaults neutral | Remove leaking local badge override; map existing pending_validation to amber; no route changes | BrawndoRisks.css; StatusBadge |
| Risks | High numeric/level labels red; Accepted forced green; local badge overrides leak to sibling modules | High amber, Accepted neutral; reuse semantic tokens and shared badge | BrawndoRisks.css |
| Calendar | Event-type metadata uses urgent/positive hues and long event titles are clipped | Neutral type metadata, preserve urgent overdue rail, wrap existing titles; no event/date/drag logic change | BrawndoCalendar.css |
| Policies / Vendors / Evidence / Contacts / Systems / AI Governance | Existing BrawndoSurface/ClientSurface, shared register primitives; generic title overrides at 30px | Use approved shared page-title token; preserve controls, tables, data and per-module structure | ClientSurface.css / shared page CSS |
| CIS IG1 / IG2; ISO; SOC | Separate framework vocabulary and content; assessment pills show attention red and N/A blue; 30px headings | Coordinated amber incomplete assessment, neutral N/A, shared title size, dark input boundary; no content/rules/Omni edits | CisStatus.jsx / BrawndoCisOverview.css |
| Action Items / Client Profile | Local title exceptions override shared size at 25px/30px | Remove Action Items override and consume shared 22px token in Profile; preserve all content and layout | BrawndoActionItems.css / BrawndoProfile.css |
| Administration / account | #53 AdminSurface already consumes ClientSurface and shared page CSS | Shared CSS compatibility and tests only; no direct owned page edits | #53; indirect CSS dependency |
| IG3 / other frameworks | Not necessarily configured in current seeded clients | Record configured route coverage; run existing framework regression tests; do not add seeded content | Framework owners |

## Route and client matrix

Discover current clients from the running Demo store, including its existing migration additions. Initial source catalog has three clients, but the initialized store contains Brawndo, Dunder Mifflin, Prestige Worldwide and Initech. Inspect each client's Dashboard, Reviews, Calendar, Findings, Action Items, Risks, Policies, Vendors, Evidence, Contacts, Systems, AI Governance, Client Profile and its configured framework workspace. Inspect Portfolio, Administration clients/users/roles/security/audit and account separately.

Every route is captured in light and dark at 1440, 1024 and 768 CSS pixels. Preserve visible text, labels, headings, navigation, accessible names, controls, values, rows, cards and columns against the same fresh seed and fixed clock. Browser screenshot evidence is separate from behavior verification and hosted backend assurance.

## Verification design

- Fixed clock: 2026-10-07 12:00 America/New_York; fresh isolated Demo browser storage; loopback only, external requests blocked.
- Capture route content and accessibility snapshots before and after; unexplained differences block acceptance.
- Protect the Brawndo references' computed styles and screenshots. Changed shared semantic styling must be explicitly accounted for.
- Verify source behavior through AST comparison: event handlers, API calls, function bodies, labels and computations stay intact; only explicit tone-map values and the portfolio tone-class expression may change.
- Run focused and full frontend tests, owner regressions, configured static analysis, production-equivalent and Demo builds, then refresh/rebase and repeat final checks.
- Accessibility engineering target: [WCAG 2.2](https://www.w3.org/TR/2024/REC-WCAG22-20241212/), selected contrast/focus/reflow checks only; no whole-application conformance claim. Clock handling follows [Playwright Clock](https://playwright.dev/docs/clock).

Initial focused baseline: 7 suites, 49 tests passed. Baseline Demo build compiled successfully. Intermediate corrected comparison: 126 route/theme captures / 378 screenshots per revision; all content/accessible snapshots equal, no document overflow at 1440/1024/768; Brawndo Reviews and Dashboard computed inventories equal. Intermediate browser workflows: 230 observations, including 720 CSS-pixel reflow equivalents. Intermediate standard frontend run: 230 suites / 1682 tests / one snapshot passed, excluding the separately long five/ten-year simulations. These intermediate results are not final-head claims. Final-head checks, two production builds, CI, source preservation, screenshots and deployment status are recorded in the handoff evidence.

An early capture harness incorrectly wrote client selection to localStorage. It was corrected to the application's actual sessionStorage key and now asserts client identity. All mislabeled early captures are excluded from delivery. External font requests are blocked in the controlled browser harness; computed font stacks and fallback rendering are verified, external font delivery is not. 720 CSS-pixel reflow is a 1440-at-200% equivalent, not a native browser zoom test. No screen-reader or whole-application accessibility claim.

Read-only installed dependency inventory found existing advisories for braces, postcss-selector-parser, svgo and sprintf-js. No manifest, lockfile or dependency changes belong to this visual diff; reachability/remediation is outside scope and no security clearance is claimed.
