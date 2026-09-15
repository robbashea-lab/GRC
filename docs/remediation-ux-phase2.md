# Phase 2 — Finding / Action / validation UX

## Lifecycle inspection before implementation

Inspected 2026-09-15 after Phase 1, before component changes.

1. Review `create-finding` takes the selected occurrence ID, a request ID, Finding title and corrective-action title. It creates one authoritative Finding and invokes the idempotent first-Action helper. Retrying the same request does not create another pair.
2. The Action stores `finding_id`; Finding stores `review_id` and `occurrence_id`; Action inherits both, including a historical occurrence when applicable. Later Actions use the existing generic task creation route with a Finding source.
3. Stored source type on older Review-origin remediation can be `review` even when `finding_id` is set. This is valid provenance, but the Action overview repeats the Review title instead of explaining the initiating Finding.
4. Backend task creation/update uses `remediation.synchronize`; Demo uses the same readiness rule on writes. Open/in-progress/blocked linked work leaves the Finding In Remediation. All linked work done/cancelled gives stored `remediated` (display Pending Validation). Cancelled work remains not required under existing semantics. Closed/accepted Findings are not automatically reopened.
5. Completing an Action does not validate or close a Finding. Validation requires a platform-level role, Pending Validation, no outstanding linked Actions, and rationale. It records validated/closed actor and timestamps, decision history and audit events. This authorization and lifecycle are preserved.
6. Actions start Open, can move through In Progress/Blocked or Cancelled under existing rules, and completion stamps actor/time. Completed Actions remain historical and cannot be reopened through ordinary editing. Active/Completed filters already separate done records; cancellation behavior is unchanged.
7. Review Related reads current authoritative linked records, not copied mutable Action/Finding statuses. Grouping by Finding ID and client ID already exists. Completed Actions stay nested under an unresolved Finding. Closed Findings are hidden by default and retrievable with the history toggle.
8. Current Review Related spans its occurrences; selecting a historical occurrence scopes the query to that occurrence. Review history preserves execution evidence/outcome. Linked remediation statuses remain current, not point-in-time snapshots; explicit labels and originating-period context are missing.
9. Review Related refreshes on tab selection, nested save/close, focus and a short interval. Finding drawer refreshes readiness after nested Action updates. Normal module navigation reloads records. No persistent duplicate status store was found. Existing React form copies are edit state, not another authority.
10. Existing endpoint/readiness tests already cover multiple Actions, recurrence, explicit validation and source-tenant rejection. Browser verification for the exact Phase 2 scenarios remains required.
11. Existing validation UI shows a rationale field without Finding description or the Actions' completion actor/date. Action save closes the drawer with a generic Saved toast, so removal from Active lacks a next-step explanation.
12. Related also contains Policies, Vendors, Risks and framework records. Keep the broader Related tab, adding explicit Findings & Remediation hierarchy within it rather than renaming the whole container.
13. Evidence storage/retrieval, Phase 1 metrics, recurrence generation, permissions and source relationships require no redesign. Historical statuses must be labelled current; no snapshot status fields will be introduced.

## Focused implementation plan

| Severity | Location | Before | Intended after | Why |
|---|---|---|---|---|
| Medium | ReviewDrawer Related | Groups lack clear originating period and current-status wording | Existing groups under Findings & Remediation, explicit origin and current status | Preserve historical meaning and business hierarchy |
| Medium | ActionItemFields overview | Review title repeated; Finding hard to locate | Authorized source chain with Review occurrence, Finding and Action context | Explain why the work exists without changing provenance |
| Medium | RecordDrawer completion | Generic Saved followed by disappearing active row | Completion acknowledgement with actual Finding state and optional View Finding | Explain the handoff without forced navigation |
| Medium | RecordDrawer validation | Rationale alone | Finding and all corrective Actions, status/completion provenance, then rationale | Distinguish work completion from validation |
| Medium | Finding actions | First-action helper disabled when one exists | Existing Action creation form for additional corrective work | Support multiple Actions without duplicate issues |

Use existing buttons/drawers/tokens; no new animation or visual-system change. UI-polish skills guide hierarchy and restrained feedback only. Runtime QA and release results belong in the delivery report; this inspection is not proof of a passing workflow.

## Implementation and verification

- Implemented the presentation plan above using shared `CorrectiveActions` and `ActionSourceChain` components and small remediation presentation helpers. Existing lifecycle values, source relationships, permissions and validation endpoints are preserved.
- The Review create-Finding response now returns the authoritative post-Action status. Review/Finding Related queries no longer truncate corrective Actions or Findings at 200. Unrelated Related populations retain their existing limits.
- Assessment source links use the existing authorized Related response; no assessment endpoint or permission model was invented.
- Frontend: 220 tests in 42 suites pass. Backend: 120 isolated unittest/ASGI tests pass. Production preview build passes, with four existing hook-dependency warnings in Calendar, ClientDirectory, Evidence and PlatformAdmin. There is no separately configured lint/type-check script. The legacy live-backend/pytest suites were not run.
- Local Demo browser: tested the exact NO ISP / MAKE AN ISP flow; three MFA corrective Actions completed sequentially; Q3 Review advancement to Q4 with remediation still outstanding; separate validation and closure; retained Q3 history; standalone Action completion; reload persistence; Risk/Vendor source links; Comments and Activity; retained Evidence; CIS relationships; Portfolio and Dashboard direct-record opening; Calendar; keyboard activation and Escape. Final build was reloaded and its completion/validation copy exercised again.
- Browser QA used isolated session Demo data. It does not validate a persistent standard backend/database, which remains deferred. No source records, seeds or credentials were added to Git by browser QA.
- No unresolved product decision is required for this scope. Evidence architecture, design system, Phase 1 metrics, authentication, recurrence rules and workflow/RBAC redesign remain out of scope. Historical remediation labels intentionally describe current authoritative status, not a new point-in-time status snapshot.
