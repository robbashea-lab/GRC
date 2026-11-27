# GoverNara

Start with the [developer handoff](docs/developer-handoff.md) for the repository layout and safe test commands. For changes to v3 workflows, read the [workflow acceptance criteria](docs/v3-workflow-acceptance.md) and [native workflow handoff](docs/v3-workflow-parity.md). Use the approved mockup for layout and interactions and the acceptance criteria for saved behavior.

## Carry approved work through verification

- Keep working through implementation, tests, review findings, and verification until the requested outcome is verified or genuinely blocked. Make routine, reversible implementation decisions within the approved scope. Diagnose recoverable failures and rerun the affected checks after a fix.
- Pick the next ready item from the approved backlog when the current item is complete or blocked. Ask the owner when a product decision, required approval, or access blocker needs their input. State the specific input needed and continue with independent approved work.
- Keep changes scoped and use the existing pull request process. For reproducible defects, add focused coverage where existing tests would miss the regression. Record what was verified at the tested revision and any unresolved blockers.

## V3 staging

Follow the [staging release procedure](docs/render-release-operations.md). After a reviewed staging merge, check the release gate for the exact branch commit and verify the automatic Render deployment and hosted smoke results for that revision. Use disposable synthetic data for CI and the documented synthetic client for hosted acceptance. Main integration and production release require explicit owner approval.

## Code Review Rules

- Flag changes that can lose a save, duplicate a record or scheduled occurrence, or show a different saved result when a linked screen or export reopens it.
- Flag changes that compromise client isolation or apply a workflow to the wrong framework. Check server-side authorization for affected routes.
- Check changes to recurrence, framework scoring, POA&M, and reporting periods against the approved rules and targeted tests. Describe the expected result, the failing path, and the evidence for each finding.
