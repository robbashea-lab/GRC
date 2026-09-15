# Management obligation contract — Phase 1

## Inspection before implementation (2026-09-15)

- `preview/summaries.js` and `backend/routes/portfolio.py` separately count Reviews, Findings, Actions and Risks. They omit Policy, Vendor assurance/contract, Exception and Requirement dates. Backend fetches were capped at 500 clients / 10,000 source records.
- `lib/clientDashboard.js` selects eight source collections. `dashboardPosture.js` removes projected next occurrences and represented remediation/acceptance duplicates, then calculates the displayed cards from complete arrays. The Dashboard loader rejects a 1,000-row capped source response rather than claiming completeness.
- `ClientDirectory.openDrill` filters the already limited Top 15 attention queue. The 31–90 card incorrectly invokes the 0–30 handler; client-row metrics route to the Action register. Clients Requiring Attention counts two statuses but filters only Action Required.
- Backend `/dashboard` and Demo's equivalent contain another legacy KPI calculation (Reviews + Actions + some Policies for Due Next 30). Board PDF independently counts explicitly labelled Reviews, Findings and Risks, not all obligations; its overdue comparison includes time-of-day and can include due-today Reviews.
- Portfolio/standard API use UTC calendar days; the client Dashboard uses the browser's local today. Date fields elsewhere preserve their literal YYYY-MM-DD prefix. Phase 1 standardizes management today to the established service UTC day, preserves literal due dates, and returns the calculation date. No client-timezone configuration is introduced.

## Obligation matrix / intended rules

Counts represent actionable obligation events, not database documents indiscriminately. These rules consolidate existing Dashboard posture behavior and its regression tests. No source writes or new schedules occur.

| Source | Controlling date / event | Active states | Terminal exclusions | Ownership | Severity |
|---|---|---|---|---|---|
| Review | Current `due_date` | needs_scheduling, upcoming, in_progress | completed, cancelled; archived records | owner_id, then reviewer_id | None inferred |
| Action Item | `due_date` | open, in_progress, blocked | done, cancelled; legacy completed, archived | assignee_id, then owner_id | existing priority; immediate is legacy critical |
| Finding / validation | `due_date` | open, in_remediation, remediated (Pending Validation) | closed, accepted, archived | owner_id | severity |
| Risk review | `next_review` | Existing nonterminal Risk states, including accepted | closed, retired, archived | owner_id | calculated current level from existing likelihood × impact |
| Risk acceptance expiry | `acceptance_expires_at`, accepted Risks only | accepted | closed, retired, archived | owner_id | No new severity on expiry event |
| Policy review | `next_review_date` | draft, in_review, approved, needs_verification, needs_creation | retired, not_applicable, archived | owner_id, then approver_id | None |
| Vendor review | `next_review` | onboarding, under_review, active | inactive, offboarding, terminated, archived | business_owner_id, then owner_id | Criticality not treated as issue severity |
| Vendor assurance refresh | Required artifact `refresh_due` when assurance_required | Same active Vendor states; required artifact | Same terminal Vendor exclusions; optional artifact excluded | Same Vendor owner | None |
| Vendor contract | `contract_renewal`, distinct `contract_expiration`/legacy `contract_end` | Same active Vendor states | Same terminal Vendor exclusions | Same Vendor owner | None |
| Exception / acceptance | `expires_at` | approved, expired | requested/other states do not yet represent expiry obligations; revoked/closed/archived excluded | owner_id, then approver_id | None |
| Existing Requirement review | `next_review_date` | Nonterminal, applicable records | not_applicable status or applicability; archived/closed/completed | owner_id | None |

All dated events above qualify for the same three due buckets. Undated Reviews, Actions, Findings and nonaccepted Risks remain visible as current work without entering due counts. Policy/Vendor/Exception/Requirement records require a real valid date to create an obligation. Missing documents, framework selections and undated CIS assessments do not create invented deadlines. CIS/AI work already represented by linked Reviews/Actions participates through those records only.

### Representation, not title matching

- A current Review is authoritative; its projected next recurrence is not a second current obligation. Historical completed occurrences never count.
- A linked active Action represents a non-Pending-Validation Finding only if client, Finding link, calendar deadline and accountable owner match (`representedFinding` contract). Distinct deadlines/owners remain distinct; completed Actions do not hide pending validation. Findings still count separately in the material-Findings metric, which measures deficiencies rather than due work.
- Risk/Policy/Vendor dates represented by an active linked Review on the same calendar day are counted as that Review once. A configured active contract Review represents the Vendor contract milestone, including its established lead time. An inactive Vendor's still-open Review/Action remains a separate real obligation.
- A linked approved/expired Exception with the same Risk/date represents acceptance expiry once. Equal Risk review/acceptance dates count once. Contract expiration and renewal on the same day count once. Different dated obligations on one Vendor may legitimately count separately and have distinct event keys/type labels.
- No deduplication by title; two unrelated identically named records remain separate.

## Exact metric definitions

- **Past Due:** valid calendar due day < calculation day.
- **Due in Next 30 Days:** calculation day through day +30 inclusive.
- **Due in 31–90 Days:** day +31 through day +90 inclusive. Buckets do not overlap.
- **Open Critical / High Items:** distinct active High/Critical Findings + active High/Critical scored Risks (accepted included) + active High/Critical standalone Actions. Finding-linked Actions are not a second material issue. Vendor criticality and Review types do not invent severity. Dashboard's differently named Findings and Risks cards remain the respective subsets, not a combined metric.
- **Unassigned Items:** distinct source records represented by active obligations, plus active Risks whose review is represented elsewhere, with none of the source's existing owner fields set. Multiple events on one Vendor are one missing-owner item. Representation suppresses duplicate remediation ownership. Contact/User assignment rules are unchanged; an existing owner ID counts as assigned without inventing a user account.
- **Clients Requiring Attention:** existing `action_required` + `needs_attention` states. Preserve priority: inactive/archived, then onboarding; otherwise critical overdue OR at least 3 past due OR at least 3 material issues = action_required; otherwise any past due, due30, material issue, unassigned item, unscheduled Review, pending validation or unassessed nonaccepted Risk = needs_attention; else healthy. Onboarding remains a distinct status, not silently reclassified. Archived/inactive clients are excluded from portfolio totals; their own row can still explain outstanding source records.

Invalid dates are excluded from dated buckets, never coerced to today or guessed. No due date is not overdue. Reopened records participate according to their current status/date, not stale completion timestamps. Historical terminal records and archives are not edited. Owners/person scopes are applied after relationship representation within the authorized client, so scoped filtering cannot recreate suppressed duplicates.

## Consumers and verification plan

Consolidate frontend Portfolio/Dashboard on the existing Dashboard selector plus a shared management projection. Backend uses the same declarative ownership/terminal contract and equivalent event-selection rules, validated against shared JSON scenarios. Full drill populations are independent of the Top 15 queue. No new charts/cards/columns are needed; 31–90 is verified in the read model and existing Portfolio card because Dashboard has no identically named card.

Keep Board PDF's explicit Review-only labels/layout, but select its Reviews/Findings/Risks through the same projection. Do not expand it into a new report. Test the reporting selection without claiming the unavailable published reporting server runs.

The existing mutually exclusive GRC Work Status distribution gives In Progress precedence. Its remaining near-term segment is explicitly labelled **Other Due Next 30 Days**, rather than implying it is the headline's complete near-term population. Its selection and chart are unchanged; the full headline still includes in-progress due work.

The implementation also returns complete authorized source records in the existing Dashboard response, so its full read model no longer relies on capped register-list endpoints. Older server responses retain the explicit incomplete-data guard. Management source loading uses existing read-only Review/Vendor projections and Risk scoring; it never initializes or modifies operational data.

Record exact automated and browser results in the Phase 1 delivery report after implementation. This document is the pre-implementation contract, not proof that QA passed.
