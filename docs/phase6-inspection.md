# Phase 6 inspection and scope

## Frameworks (before implementation)

All six catalog programs use finalized client requirement applicability and the existing client-specific `/compliance/<key>` route. Unsure is not Applies. Client Settings adjusts applicability without replaying intake.

| Program | Actual capability | Recorded statuses | Existing Dashboard consumption |
| --- | --- | --- | --- |
| CIS Controls v8.1 IG1 | 56 safeguard definitions; intentionally initialized assessments, mapped Reviews, explicit Finding/Action/Evidence links and assessment history | Not Assessed, In Progress, Addressed, Needs Attention, Not Applicable | None; placeholder-only `complianceProgress` |
| HIPAA | Configured workspace only | No assessment records | Placeholder |
| NIST CSF 2.0 | Configured workspace only | No assessment records | Placeholder |
| ISO/IEC 27001 | Configured workspace only | No assessment records | Placeholder |
| CMMC | Configured workspace only; no separately implemented Level 2 assessment workspace in this checkout | No assessment records | Placeholder |
| SOC 2 Type 2 | Configured workspace only | No assessment records | Placeholder |

CIS Addressed requires recorded implementation text; N/A requires rationale. Neither Evidence nor Review completion automatically changes assessment status. Framework relationships include direct assessment links, mapped Reviews, Findings from those Reviews, and their corrective Actions. These remain separate from assessment state. No scoring methodology is approved, so this phase displays counts only, including N/A as its own recorded status, with no compliance/readiness percentage or denominator.

## Calendar (before implementation)

- The existing page is an operational monthly planning Calendar: due-dated Reviews, Findings and Action Items, with drag-to-reschedule instructions. It is not an audit timeline.
- Risk, Policy, Vendor assurance/renewal and other recurring obligations appear through their authoritative Reviews when configured. No additional due-date engine or duplicated Vendor/Policy/Risk events should be added.
- Backend and Demo use the current `due_date` only. The endpoint includes terminal items, omits the embedded completed Review occurrence snapshots, and returns no terminal distinction. Backend has a silent 5,000-row cap per kind; Demo returns larger/full records. Date-string comparisons can exclude date-only boundary entries.
- Stored statuses: Reviews Completed/Cancelled are terminal; Actions use Done/Cancelled; Findings Closed/Accepted. Pending Validation is stored as Remediated and remains active. A completed Action does not mean its Finding is closed.
- Current chips omit visible status, say Tasks rather than Action Items, and all advertise dragging to writable users. Review start logic blocks some drags, but its visual affordance does not. Vendor Contract Renewal Reviews have source-controlled dates and reject direct schedule edits.
- Generic backend updates enforce existing client scope/write roles. Review configuration requires platform administrators; completed Reviews and contract-controlled schedules have additional guards. General authorized record editing is not identical to Calendar operational rescheduling and will not be globally rewritten.
- Record opening fetches the authoritative entity but currently cannot select a historical Review occurrence. In-flight Calendar loads also lack client-generation protection. The non-interactive `+ more` text hides entries from opening.

## Smallest coherent implementation

Add one bounded client-scoped framework summary read model using existing statuses and structured relationships; consume it in the existing Dashboard cards. Keep placeholder programs and framework selection truthful. Do not change Phase 1 metrics.

Extend the existing Calendar read model with explicit Active / Completed & Closed / All scope, minimal projections, bounded date-window history and stable occurrence keys. Keep scheduled/due dates, original record links and lifecycle values. Show status/type in chips, make overflow entries accessible, preserve eligible active dragging and the existing drawer's non-drag date-edit alternative. Reject stale/foreign loads in the view. No source record is changed by reading summaries.

## Applicable guidance

- [W3C WCAG 2.2 Understanding SC 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html): retain a non-drag pointer alternative through the authoritative record drawer. This is selected accessibility guidance, not a whole-application conformance claim.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): authorize client-scoped reads on the server and return only necessary fields. No new permissions or directory access.
