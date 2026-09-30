# Brawndo AI Governance pilot

Scope: `demo_brawndo` and `workspace_mode === demo` through the existing
`isBrawndoReference` presentation gate. Other clients retain their register and
side drawer. No deployment, global migration or backend change.

## Authoritative relationships

AI inventory remains `ai_systems`. Reviews determine next/last review; files stay
in Evidence; vendor links use `vendor_id`; remediation remains in Findings and
Action Items. Neither task completion nor ordinary editing approves an AI system.
Intake remains in Client Profile, unchanged by hiding the Brawndo uncertainty banner.

## Approval decisions

The prior model had lifecycle states only, not approval decisions. The user
explicitly authorized adding scoped decisions and history for this pilot.

Optional Demo fields: environment, restrictions, data_settings and
permitted_data_types. New records receive Pending Assessment. Legacy records
without a decision display Approval not recorded; active never means approved.
Known processed data is distinct from permitted data.

The Demo adapter's administrator-only `/ai_systems/:id/approval` action checks
client access, optimistic version, allowed decision fields and rationale. Approval
requires recorded uses, environment and data scope; conditional approval also
requires documented conditions. Actor, time, rationale and a scope snapshot are
retained in append-only approval_history. Callers cannot patch approval fields or
history through ordinary edits.

Changing the covered scope or explicitly recording a material change returns the
current decision to Pending Assessment without replacing prior snapshots.
Lifecycle, screening tier and review timeliness remain separate concepts.

**This is synthetic Demo simulation, not production authorization.** The real
backend deliberately does not expose this new action. Any future non-demo rollout
requires server-side decision validation, access checks, persistence/concurrency
tests and immutable history support before enabling the UI.

## Interaction and verification

Cards retain actual record identities; no environment merging. Due for Review
requires a real date today or earlier. Unscheduled is not overdue. Secondary
inactive visibility does not include inactive records in Due for Review.

Centered details preserve form drafts across tabs and nested vendor/record views.
Save failures retain drafts. Unfinished workflow drafts block closing/saving
without explicit discard. Successful review, relationship and decision operations
persist independently, as labeled. Card data remains mounted during same-client
refresh to preserve grid position and focus targets.

Targeted tests: BrawndoAI UI tests, brawndoAI Demo adapter tests, existing
aiGovernance and authorization tests, plus existing Brawndo pilot regression suites.
The long-running brawndoTenYear suite is excluded from this targeted run.

Local browser QA used two explicitly synthetic AI records (no seeded records were
reset): create/save/reload, scope invalidation with retained decision history,
conditional approval/rejection, review scheduling, vendor navigation, draft
protection, six quick filters/search/inactive visibility, Dunder Mifflin isolation,
1440/1024/768 layouts, arrow-key tabs, Escape, focus trapping and restoration.
Evidence relationship persistence is covered by adapter tests; no claim of a new
browser file-upload/download test or physical-device/screen-reader test.

Tabs follow the [WAI-ARIA APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
for roving focus, arrow keys and panel labeling. This is not a whole-app
accessibility conformance claim.

Local preview: `http://localhost:4179/ai-governance` → Demo → Brawndo.
Build with `node frontend/scripts/preview.cjs build` from the repository root.
