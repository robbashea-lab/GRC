# Phase 5: onboarding to operations

## Inspected lifecycle (before implementation)

- Current v3 wizard has four steps: **Compliance & Requirements**, Policies & Governance Documents, Recurring Reviews, Review & Create. Compliance intentionally comes first to supply CIS context to later steps; keep this legitimate exception to the proposed order.
- Program checkboxes default to Does Not Apply. Persisted Unsure is supported but the checkbox cannot express it. AI intake is an existing separate optional component.
- Every one of 17 Policy questions requires Yes / No / Unsure. Only the final screen flags omissions. The server validates responses at finalization. Unsure is valid.
- Each change, including step navigation, queues a client-scoped baseline save. v2 drafts migrate to v3 step order. Completion remains true on later saves.
- Generic Reviews are opt-in in a fresh v3 draft. CIS contributes configured mapped Reviews (default cadence, optional date, no owner). Existing records retain dates, recurrence, ownership and history. Generic Reviews start with no date, recurrence or owner: Needs Scheduling.
- Finalize upserts 17 baseline Policies, six applicability records, selected generic Reviews and (if selected) CIS assessments/mapped Reviews. Stable backend IDs and existing Demo matching prevent repeat generation in normal retries. No People/account generation in this path. The older six-step endpoint remains for historical callers and is not the current UI.
- Reported Policy existence is not verification. Verified Existing / Not Applicable and meaningful lifecycle state are retained. A missing Policy does not create a Finding or Action.
- Only CIS has populated requirement assessments. Other programs are placeholders. Applicability navigation reads finalized requirement baseline keys/responses, gated by completed onboarding, not titles or draft selections.
- Existing completion redirects to CIS or Dashboard; revisiting displays an editable wizard. Client Settings points back to onboarding, although the Requirements register can edit obligation details.
- Primary Contact and GRC Lead are independently configured in Client Management. Neither, client accounts, schedules nor owners block onboarding. Contact-only is valid. Phase 4 eligibility and explicit access remain authoritative.
- Demo uses sessionStorage baseline and operational collections. Backend stores baseline on the client and operations in Mongo collections. Both baseline implementations are currently mutable configuration; ordinary operational edits do not alter intake. Phase 5 will expose the saved intake as read-only in the UI and keep later program changes separate.

## Scoped design

Earlier inline required-response feedback; exact create/retain preview using the existing matching rules; completed route becomes a live operational handoff with a read-only baseline. A minimal, authorized, client-scoped read model feeds shared UI selectors. Counts are derived from current records, never stored. Existing modules own the follow-up; no new tickets, people, permissions, metrics or scheduling engine.

Client Settings will provide explicit program applicability adjustments without replaying Policy intake. The existing CIS reconciler is reused unchanged; only supported framework configuration is activated. Source histories remain intact.

## Reference decisions

- [W3C WAI Forms: validating input](https://www.w3.org/WAI/tutorials/forms/validation/): identify omissions in text at the relevant step; retain server validation.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): authorize each client read/write on the server, minimize returned fields, reject unauthorized scope. These are selected implementation principles, not an ASVS certification or independent review.
