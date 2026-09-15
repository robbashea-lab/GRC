# Shared UI polish — September 15, 2026

## Scope and design standards

Applied the published [better-ui](https://github.com/jakubkrehel/skills/tree/main/skills/better-ui) and [emil-design-eng](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng) guidance to the existing product. This is a presentation and interaction pass, not a redesign or a new animation framework.

Preserved the palette, table density, page structure, navigation destinations, auth architecture, permissions, calculations, lifecycle values, framework configuration, data relationships, and APIs. No backend or demo-adapter changes are included.

## Shared architecture

- `design-system.css`: shared radius, elevation, easing, timing, focus, viewport constraints, filter indicators, and onboarding selection treatments. Structural table/input borders remain. Existing consumer-defined dialog maximum widths remain intact.
- Existing Radix Button, Input, Textarea, Select, DropdownMenu, Popover, Tooltip, Dialog, AlertDialog, Sheet, and Tabs primitives remain authoritative. No new dependencies.
- Pointer button feedback uses scale 0.96 over 150 ms, with a `static` opt-out. Disabled controls and keyboard activation cannot trigger that press transform.
- Menus use 160 ms; dialogs 180 ms; drawers 240 ms. Exits are shorter. CSS animations are retained for Radix mount/unmount presence, while repeatable control feedback uses interruptible transitions.
- `interactionModality.js` tracks only current input modality on the document, never account or workspace state. `useSurfaceRef.js` captures entry modality on a mounted portal so switching input devices cannot replay an entrance. Keyboard-opened surfaces appear immediately. Reduced-motion disables surface animations and button transforms.
- `TableLoadingRow` replaces six duplicated register loading-row implementations, including the shared Reviews/Findings/Policies/Contacts register. It announces a quiet loading status without fictitious rows or moving skeletons.
- `StatusPill` shares sizing and shape across existing semantic badges, Risks, Vendors, and Users & Access. Existing labels and tone decisions are retained.

## Before / after review, grouped by principle

All findings below were addressed. Locations are relative to the repository.

### Motion and interruption

| Severity | Location (path:line) | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | frontend/src/components/ui/sheet.jsx:29 | Independent 500 ms entrance / 300 ms exit | Shared 240 ms entrance / 180 ms exit | Faster repeated record inspection |
| High — caught and fixed during QA | frontend/src/lib/useSurfaceRef.js:5 | Initial polish implementation could replay entry when changing from keyboard to pointer | Entry modality captured once per mounted surface | Prevents a moving click target and missed record navigation |
| Medium | frontend/src/design-system.css:169 | Generated animation utilities could override token timing | State-qualified shared timing selectors | Actual computed timing now matches the design contract |
| Low | frontend/src/components/ui/button.jsx:7 | No shared pointer-press contract | Scale 0.96, static opt-out, no keyboard transform | Clear but restrained feedback |

### Surfaces, states, and readability

| Severity | Location (path:line) | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | frontend/src/pages/AdminSecurity.jsx:25 | Charcoal icons on charcoal surfaces | Theme-aware secondary ink | Visible icons without decorative color |
| Medium | frontend/src/pages/ClientDirectory.jsx:359 | Hovered client names could turn dark on dark | Theme-aware link hover | Preserve readability during interaction |
| Low | frontend/src/components/TableControls.jsx:42 | Small header target and inconsistent chip geometry | Compact 28 px targets, active tint plus underline, shared chip radius | Easier precision filtering without large controls |
| Low | frontend/src/components/TableLoadingRow.jsx:2 | Repeated loading markup and spacing | Shared quiet status row | Consistent, accessible feedback |
| Low | frontend/src/pages/Onboarding.jsx:45 | Current step differentiated mainly by text weight | Underline/surface current-step treatment and checked program surfaces | Clearer position and selections; same steps and behavior |

## Validation

- Frontend: 149 tests in 29 suites passed. New tests cover input modality, retained surface-entry modality, forwarded refs, Button static/disabled/asChild behavior, motion contracts, and existing theme contrast.
- Backend: 107 self-contained unittest executions passed, covering auth/initialization, tenant checks, Reviews/history, Actions, Risks, Vendors, onboarding, AI, CIS, relationships, and audit. These exercise the existing ASGI/mock-database harness, not a persistent staging deployment.
- Production build passed. CRA lint and a standalone React Hooks lint across 164 JS/JSX files reported zero errors and the same four existing dependency warnings in Calendar, ClientDirectory, Evidence, and PlatformAdmin.
- There is no configured TypeScript project/type-check command. JSX compilation and tests passed; no TypeScript verification is claimed.
- Secret scan of changed source and built browser assets reported no findings. Diff review found presentation/test/documentation changes only; no backend, authentication, tenant rules, metrics, seed data, or API logic changes.

Browser validation uses the actual production build in headless Microsoft Edge, with isolated disposable demo sessions. Screenshots and temporary browser runners are outside Git.

### Browser coverage

- Login: blank disabled standard fields, clear unavailable notice, stale-token rejection, credentialless Demo entry, logout and reload; no standard authentication claim.
- All five canonical clients across Dashboard, Calendar, Reviews, Findings, Actions, Risks, Policies, Vendors, Contacts, Evidence, and Onboarding: route smoke, current client context, no page errors or unintended API traffic.
- Dashboard: four metric counts equal drill-down rows for all five clients; source records open; keyboard/Escape; Top 5; program views and no-program state; desktop widths 768/1024/1280/1440.
- CIS: UI onboarding, 56 assessments and 12 mapped Reviews, cadence warning, narrative, owner, Evidence, comments, refresh, Review completion/history, Finding/Action workflow, validation, manual Addressed, and reconfiguration/tenant separation.
- Framework choices: none, HIPAA, CIS, ISO + SOC 2, CMMC; Back/Next persistence, sidebar, N/A rationale, deselection with retained history, Audit Log.
- AI: register creation, vendor/owner selection, screening, Review history, Finding/Action, policy relationship, Evidence upload, material change, retirement, two-client isolation, intake, and responsive widths.
- Shared UI pass: platform portfolio, client management, users, roles, security, audit, and client modules; menus, selected filters/chips, outside dismissal, focus return, pointer press, keyboard-opened menus/drawers, reduced motion, light-palette inspection, dialog viewport containment and responsive layouts. Chromium animation playback was set to 10% via DevTools Protocol for drawer motion inspection; this is not a claim of manually using the DevTools Animations panel.

## Limits

- No physical touch device, Safari, Firefox, or screen-reader certification. Those are not verified.
- Light-palette inspection does not introduce or validate a new theme-switch feature.
- Tooltip adjacent-hover timing and every possible nested submenu combination were inspected in code, not exhaustively exercised in the browser.
- Browser workflows run the isolated demo implementation. Standard authentication remains intentionally unavailable in the preview; persistent frontend/backend authentication and production RBAC are not browser-validated by this pass.
- Existing framework placeholders, role-model roadmap, and four lint warnings are unchanged.
- Approval applies to the inspected surfaces and documented test coverage, not an assertion that every possible application state was exhaustively tested.

Review verdict: **Approve for the inspected scope.** No unresolved high-severity UI issue found in that scope.
