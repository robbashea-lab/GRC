# Interface audit — 2026-09-15

Recorded before implementation. Scope: visual consistency only; routes, data,
authorization, filters, scoring and lifecycle handlers remain authoritative.

## Baseline inspected

Shared CSS/Tailwind tokens, PageHeader, Layout, TableControls, StatusBadge,
RecordDrawer, ReviewDrawer, UI primitives, toast placement and route definitions.
Existing built preview visited: Portfolio, Dashboard, Reviews, Action Items,
Risks, Vendors, Policies, Contacts, Evidence, Onboarding, Calendar, Client
Management, Users, Roles, Security, Audit, Client Settings and CIS placeholder.
Baseline screenshots captured for Portfolio, Reviews and Dashboard outside Git.

## Main inconsistencies

- Light-only application tokens coexist with charcoal sidebar tokens. There is
  no active theme provider or light/dark switch. Preserve the light palette as
  an explicit theme variant; make the shared default charcoal.
- 199 literal neutral/semantic Tailwind color references remain in components
  and pages. White translucent toolbars, pale dividers and slate text bypass
  the existing surface/ink tokens, especially in old drawers and registers.
- Page headers and table controls use different vertical spacing. KPI cards
  spend excessive height on icon containers and gaps before operational work.
- Metadata ranges from 10 to 13px; sidebar labels and table date hints are
  notably small. Raise undersized labels while retaining operational density.
- Medium severity is blue while moderate is amber; accepted is visually
  identical to ordinary informational states. Correct presentation mappings,
  not stored status or severity values.
- Inputs have central tokens but legacy CSS hardcodes pale borders. Header
  cells, demo notice and page header also contain hardcoded light colors.
- Evidence upload area dominates the register. Compact it, keeping the exact
  upload behavior and adding keyboard activation to its existing affordance.
- Existing Radix menus/dialogs provide focus, Escape and portal behavior:
  preserve these instead of replacing working interaction primitives.
- CIS and other framework routes use the existing configured placeholder;
  no safeguard implementation is present to redesign or fabricate.

## Implementation order

Tokens and shared styles; reusable controls; shell; register toolbars;
drawers/forms; compact dashboard; remaining modules/framework/admin/auth;
dark/light, responsive, interaction and regression QA.

## Visual thesis

A charcoal operational workspace: closely related layered neutral surfaces,
legible compact typography, quiet dividers, consistent controls and restrained
semantic status color. Registers remain registers; workflows remain unchanged.

## Validation notes

The standalone CRA lint configuration reports 26 errors and 104 warnings on
both the original committed source and this update. These pre-existing findings
include global confirm calls, test act conventions and unused declarations.
The production build's configured lint reports four existing hook dependency
warnings. No lint suppression or unrelated business-logic cleanup was added.
This JavaScript application has no separate TypeScript/typecheck script.
