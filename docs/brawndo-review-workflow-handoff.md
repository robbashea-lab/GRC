# Brawndo Review detail and Finding creation presentation

## Scope and integration

This presentation is limited to an existing native Review in the trusted active
canonical Brawndo Explore demo. The main Review retains the centered native
full-record geometry. Its Raise Finding creation sheet retains native right-side
geometry. New Review creation, saved Finding/Action editors, standard sign-in,
other clients, compact previews and parent pages are outside scope.

The isolated branch is `codex/brawndo-review-workflow-20261019`, initially based on local
`40b38754ad186eec11b05e034b9e6cae5e2818c1` (the same tree as published
`df396399c72c558f476abab0d49d1ac047e7aec3`). Agent 007 integrates source, owns
browser verification and coordinates release. Supporting agents authored only
the separately owned new cards/fields/tests; no other source owner was active
in the inspected current roster. No shared branch reset or concurrent release.

The October 19 updated workflow ZIP and Finding addendum supersede the original
Finding appearance freeze only. The native command, permissions, optional due
date, nullable owner, default Medium severity, request/occurrence identity and
dirty/replay behavior remain authoritative. No prototype controller was imported.

## Design decisions

- `ReviewDrawer` retains its native state, requests, handlers, concurrency checks,
  opener-specific pilot branches, six tabs, evaluation and complete source guides.
- Presentation requires the existing full-record eligibility check plus exact
  existing and loaded Review identity. Historical selection additionally requires
  matching Review/client identity. Finding styling requires a writable, current,
  non-frozen occurrence and has its own portal class.
- Local CSS specificity defeats older shared popup appearance rules without
  changing those rules or geometry. Both new families use the existing approved
  local Inter asset. No theme provider or portal-wide tokens were changed.
- Source cards reuse native requirement/cadence read models. Support does not
  imply an external mandate. Only a comparable active explicit source interval
  can produce the narrow configured-cadence comparison; unknown remains unknown.
- The occurrence strip retains independent overdue and native Needs Scheduling
  states. A visual Not started label is never a persisted status or reset command.
- Date shortcuts reuse native calendar-day helpers and change only the current
  optional Finding draft field. The existing single command creates both records;
  Action assignment remains `assignee_id`, distinct from Finding `owner_id`.

## Verification checkpoint

Eight focused suites passed 99 tests, including real preview-adapter save/start,
explicit configuration save, direct completion branches, dirty/discard protection,
native Finding/Action creation, assignment/date propagation and negative scope.
Earlier failed assertions were retained in the local evidence: React 19 removed
the old test Simulate API, SSR split adjacent text with comments, and the native
Action assignment field is assignee_id. Assertions were corrected to exercise
the real events and native contract; no runtime contract or timeout was weakened.

Independent AI source review found two status presentation regressions, both
corrected with targeted cases: overdue in-progress and valid-date Needs Scheduling.
Source review of the updated Finding integration is clear within its stated scope.

The final focused implementation passed 8 suites / 99 tests; existing CIS,
Reviews, preview history, replay and remediation regressions passed 5 / 58.
Standard compiled builds passed. No dependencies, backend code, native API
commands, permission model or shared page/theme styles changed.

Executed local browser journeys include explicit Review Save and reload;
Finding + Action creation with default Medium, an eligible default owner and
no due date; another real creation with Unassigned and a quick-chip due date;
Policy Start, native completion confirmation, anchored next occurrence,
actual completion actor/history, frozen historical view, native comments and
activity. These are local Explore operations, not hosted server verification.
The attempted programmatic clearing of a quick-chip date did not update the
controlled draft: the first created record correctly retained that date. Do not
report that attempt as a passed browser date-clear check. Blank date creation
and controlled component date-clear coverage are separate passing evidence.

At 1363 x 936 the main Review and Finding sheet retain exactly the baseline
outer bounds. At 390 x 800 the native main Review is 366 x 768 at (12,16),
and the Finding sheet is 390 x 800; the scrollable form body has no horizontal
overflow and Save/Cancel remain visible. Controls use 14px text and native-sized
40px inputs with 84px / 76px description/remediation areas. A browser dark-theme
check found the existing portal uses data-brawndo-portal rather than data-theme;
the two local token selectors were corrected to that actual native attribute.
Final compiled dark verification passed with the native portal attribute; both surfaces use the intended dark tokens and readable controls. Final standard assets: main.35c1d31a.js / main.1ab6c057.css.

Independent AI source review is clear, with no claim of human approval.
Current work has not been merged or deployed. Earlier CI214 / df396 staging
proof applies only to the previous baseline, never this new implementation.

## Evidence and limitations

Local receipts and original/candidate captures are under
`outputs/Review-Workflow-20261019` in the integrating chat workspace. Reference
packages remain separate from source. Actual browser journeys must be reported
separately from adapter/component results; Explore data is session-local and does
not prove authenticated server persistence or tenant isolation. Actual glyph-face
identity and true 200 percent browser zoom require tools that support those checks;
computed family or a narrow viewport alone must not be reported as that evidence.

Publication base: rebase only this isolated new change onto the current published df396399 baseline before pushing; its tree is identical to the original local baseline. Full CI, hosted journeys, exact original Google font identity, true browser 200 percent zoom, cross-page paired pixel checks, upload/download, and authenticated failure/tenant checks are not certified by this delivery.

## PR87 staging verification follow-up - 2026-10-19

The exact concept font resource is now available from its observed Google Fonts URL and packaged unmodified in inter-review-latin.woff2, with hash/license provenance in Inter-review-source.txt. The prior Dashboard opsz face is no longer used inside these Review surfaces. Native keyboard clearing must clear all date segments: one missing segment correctly causes browser badInput validation. Clearing month/day/year produced a valid empty draft and accepted Finding/Action creation with No due date; the earlier programmatic-clear attempt remains retained, but is no longer an unresolved app defect. No date/controller change was necessary.

Run215 on f1a9b03 was canceled intentionally before qualification because the font correction requires a new candidate. Final-head Release verification and specific-commit staging deployment remain required. No new access, credentials or provider settings are authorized or needed.
