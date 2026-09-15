# Review remediation lifecycle correction

## Findings and rules

Reviews already create separate Findings and Tasks with occurrence provenance. `remediated` is the existing stored status displayed as Pending Validation. The existing validation endpoint requires a platform-level role and rationale, and records validation/closure actor, timestamps and decision history. No replacement approval workflow was added.

The backend synchronized readiness on Task updates but not generic Task creation. Creating additional remediation after readiness could therefore leave a stale Pending Validation status (validation itself still rejected outstanding work). Demo already synchronized both paths. Backend creation and updates now share `remediation.synchronize`, using an uncapped outstanding-work existence query rather than inspecting only the first 2,000 tasks.

- Linked actionable work keeps an open Finding In Remediation.
- All linked work done/cancelled permits Pending Validation. Cancelled work continues to be treated as no longer required, preserving existing semantics.
- Only explicit validation closes the Finding; completing a Review or unrelated Action does not.
- Closed/accepted Findings are not automatically reopened by this synchronization.
- Active Action Items means status is not done, as requested, including cancelled records. Existing Dashboard/Calendar cancellation semantics remain unchanged.
- Completed is the explicit completed-work view. Legacy All links resolve to Active.
- Review Related defaults to excluding done Tasks and closed Findings. A compact Show completed / closed records control restores their visibility, including record links. Nothing is deleted or reparented.

## Verification

- Frontend: 188 tests / 34 suites passed.
- Backend: 110 isolated offline API/unit tests passed.
- New Demo lifecycle test runs against every configured Review type: AI governance, asset, software, access, vendor, policy, risk, vulnerability, BCP/DR, incident, awareness, requirements, management, data, configuration, penetration test and backup.
- The shared tests exercise multiple remediation tasks, unrelated task completion, Review completion/recurrence without premature closure, separate validation and original occurrence relationships.
- Backend regression explicitly creates more work after Pending Validation, verifies readiness resets, prevents validation while work remains and preserves all three tasks after closure.
- Browser: Access Review create/start/evidence/comment/Finding/Action, completion and recurrence, historical links, Action Active/Completed counts, separate validation, active Related hiding and history visibility. Also Risk, Vendor and Policy Review completion, Calendar linkage and tenant exclusion.
- Dashboard browser suite: five clients, exact card/drill-down counts, authoritative links, framework scope, keyboard/Escape and responsive widths.
- Production build passed; lint zero errors with four pre-existing hook warnings. No CSS, auth, permission, schema or scheduling changes in this correction.

Browser verification used isolated Demo. The two-action lifecycle was automated-test verified, not independently repeated through browser controls. Persistent standard-backend browser operation, simultaneous cross-worker validation/mutation races and exhaustive failure injection were not verified. Existing concurrency architecture was not expanded.

The previously approved visual rollout remains separate from this targeted correction. No hosted publication is implied by the local QA.
