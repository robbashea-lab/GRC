# Visual consistency coordination

Initial live GitHub snapshot: 2026-10-07. Implementation has not started.

| PR | Status | Head branch | Head commit | Base |
| --- | --- | --- | --- | --- |
| #52 | Open, draft, unmerged | codex/brawndo-guided-assessor | 5fd3fd310c2e38e360a9123baeb04e9f26e7be18 | main |
| #53 | Open, draft, unmerged | codex/admin-console-hardening | 55c394001d26b6b998996f142dd5fafa8fc05a61 | codex/brawndo-guided-assessor |

Visual branch: `codex/visual-consistency`, isolated checkout cloned from #53. Draft PR targets `codex/admin-console-hardening`.

## Ownership before implementation

Intended visual-owned areas: existing shared design-system CSS, StatusBadge presentation, portfolio presentation CSS, existing dashboard/register styling, presentation verification and internal documentation. Inspect all modules before choosing corrections. No application implementation changes have been made at this checkpoint.

#52 owns OmniCharacter, OmniDock, GuidedAssessor and its CSS/tests; CIS overview/safeguard, AssessmentHistory, FrameworkDrawer, FrameworkWorkspace, frameworkWorkspace and guidedAssessment helpers/tests; all guided catalogs and backend routes. #53 owns App, Layout, AdminSurface, ClientDialog, OrgContext; Administration, ClientManagement, MyAccount and ResetPassword pages; identity/assignment/authorization preview handlers and backend/security/CI changes.

Potential overlaps: shared tokens affect both workstreams indirectly; FrameworkWorkspace/CIS overview and Administration/App/Layout are direct overlaps if edits become necessary. No concurrent direct edits are planned. Shared-file changes require fetching the owner head, rebasing, posting proposed overlap, a separate strictly presentation commit, owning regression tests, and exact component/line documentation. Owner behavior remains authoritative.

No visible copy, labels, controls, data, calculations, workflow, business logic, APIs or backend will change. Omni and Administration behavior must be preserved. Brawndo Reviews and Dashboard are read-only references. No merges, main changes, Render staging changes, production changes or replacement of any existing preview are authorized. A new owner-private Site identity is required.

Before final publication: refresh both heads, rebase onto latest #53, rerun final-revision tests, and publish the exact reviewed commit. Completion evidence is pending.
