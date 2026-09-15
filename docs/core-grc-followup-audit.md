# Core GRC workflow, form and usability follow-up audit

Audit date: 2026-09-15. Scope: Dashboard, Calendar, Reviews, Findings, Action Items, Risks, Vendors, Policies, Evidence and their connected drawers/forms. This is a targeted audit and hardening pass, not a redesign or a claim that every possible workflow is complete.

This report supplements the earlier [core GRC audit](core-grc-audit.md); it does not replace that release's findings or verification record.

## 1. Executive assessment

The tested central Review → Finding → Action → validation chain works, with persistent Review obligations, immutable occurrence history and separate remediation/validation decisions. Risk and Vendor schedules reuse central Reviews when configured. Policy Reviews synchronize dates without changing document approval state.

Five defects/usability issues were corrected below. Important remaining gaps are automatic scheduling setup for unscheduled source records, unified Evidence reuse, legacy provenance and persistent staging validation. The product should not yet be described as fully unified for every initial-setup/legacy case.

## 2. Existing behavior that was preserved

- Calendar recurrence uses the scheduled date, not the completion date. Monthly/quarterly/semiannual/annual cadence and month-end anchors retain their calendar meaning.
- Completing a recurring Review advances the same obligation, creates a new occurrence and preserves the completed occurrence. One-time completion stays historical.
- Finding creation from a Review creates one linked remediation Action in the existing combined workflow. Repeated creation requests do not create a second authoritative Action.
- Completing the Action records its actor/time and moves the Finding to Pending Validation (`remediated` internally), not Closed. Authorized validation separately records closure.
- Risk score/level remain derived from the configured matrix. Acceptance does not close a Risk; closure retains its history and stops its future Review.
- Vendor review/assurance/contract purposes retain distinct meanings and central schedules. Inactivation does not delete history.
- Policy presence, approval lifecycle and recurring review dates remain separate.
- Dashboard projections and drill-downs use source records. Existing quick filters, column controls and tenant-scoped search remain unchanged.
- Standard Sign In stays deferred. Explore Demo stays session-isolated; backend authentication, standard initialization and RBAC were not replaced.

## 3. Defects fixed

| ID | Module/workflow | Issue and impact | Fix | Validation |
| --- | --- | --- | --- | --- |
| A1 | Finding/Action → Related Review | Opening the Review jumped to its current execution after recurrence advanced, obscuring original evidence and context. | Shared `relatedReviewInitialValues` selects the matching stored occurrence. Findings now receive the occurrence label already supplied for Actions. | Browser opened Q2 history from both records after advancement to Q3; unit test covers current/missing/unrelated IDs. |
| A2 | Review Related evidence, backend | Related evidence used a broad parent query instead of the Evidence tab's occurrence projection; an old attachment appeared under a new occurrence. | Reuse the existing authorized `list_evidence` projection, including historical snapshots. | Regression failed before the fix and passed after; current/old evidence lists and live remediation status asserted. |
| A3 | Backend completion snapshot | Risk ID and Vendor purpose were omitted from the snapshot allowlist even though they identify governance provenance. | Preserve those fields in new snapshots; no rewriting of old history. | Snapshot test verifies source fields and excludes nested mutable occurrence history. |
| A4 | New Risk | Prefilled 3 × 3 ratings presented a default assessment before an intentional selection. | Blank ratings; “Needs assessment” and no score until both are chosen. Existing required assessment validation retained. | Component and browser tests; deliberate 4 × 4 produces Critical/16. |
| A5 | Risk category create/edit | Create used a separate display-text taxonomy while Edit expected canonical values; a newly created category could render blank. | Both forms use the schema options, retaining categories previously offered in either form. Existing noncanonical values remain visible as “(recorded)” and are not silently rewritten. | New/default and legacy component tests; no-category-change PATCH assertion. |

No schema migration, seed replacement, source-status bulk update or operational-data cleanup was performed.

## 4. Form audit

| Form | Human input and requiredness | Defaults / derived / read-only | Changes or remaining gap |
| --- | --- | --- | --- |
| New/Edit Review | Title/type required; owner, due date, recurrence, conditional custom days, optional linked Policy and notes. | Occurrence period, next occurrence, execution IDs and completion metadata are not arbitrary creation inputs. New Review defaults one-time; missing scheduling is explicit. | Original workflow retained. Historical navigation fixed; historical controls remain read-only. |
| Raise Finding from Review | Finding title and corrective-action title required; severity, description, owner, due date and remediation notes. | Review/occurrence IDs inherited, owner offered from Review, default Medium; Finding+Action lifecycle controlled by the existing route. | No second source selector or manual completed/created dates added. Combined “Save finding and action” flow retained. |
| Standalone Finding | Title required; severity, owner, due date, description/remediation plan. | New status is Open; privileged closure/acceptance/validation cannot be chosen as an arbitrary creation status. | Edit retains current lifecycle controls and linked-action guard. Wider source selection remains a recommendation. |
| New/Edit Action Item | Title/priority and valid source where selected; optional assignee/date/description. Source inherited and locked for contextual creation. | Open/Medium defaults; created/started/completed dates and actors displayed rather than entered. Overdue is derived. | No workflow rewrite. Related Review opens the original occurrence. |
| New/Edit Risk | Creation retains title, category, description, likelihood and impact requirements; source record required for contextual sources; owner/treatment/cadence/initial date. | Annual cadence; manual/internal source; assessed status derives from ratings. Acceptance/closure use lifecycle actions. Score and level are calculated. | Blank intentional ratings, accurate required labels, shared categories and retained legacy values. No independent score/rating input. |
| New/Edit Vendor | Name/service required; category, criticality, data handling, business owner, cadence, dates and proportional assurance details. | Onboarding lifecycle and Annual cadence; completed review/assurance facts are not manual shortcuts. | No fields added or removed. Without an initial date, automatic central Review creation remains incomplete. |
| New/Edit Policy | Title required; category, reported presence, lifecycle, version, owner/approver, review scheduling and summary. | New draft; approval/verification dates not new-record inputs. Linked Review dates become read-only projections. | No fields removed. Legacy manual dates and document verification remain separate from central execution history; universal automatic annual setup is not implemented. |
| Evidence upload | File(s), contextual parent; module-specific supporting details where present. | Client, occurrence and uploader inherited; file metadata/identity generated. | No invented expiry/status/classification fields. Broad multi-parent reuse is not implemented by this pass. |
| Dashboard/Calendar | Filters, scope and existing date interaction, not duplicate create forms. | Counts/statuses derive from source records. | No redesign or new status engine. |

No legitimate business fields were removed. New labels/blank assessment controls reduce misleading defaults rather than requiring extra data. Generic obsolete schema fields were not assumed to be visible: the actual specialized Review/Risk/Vendor drawers were inspected.

## 5. Workflow gaps

1. A Risk or Vendor saved without an initial review date does not necessarily create a Needs Scheduling Review. Configured cadence alone is not equivalent to a scheduled obligation.
2. Policy creation does not universally create an annual central Review. A separately linked Policy Review works and synchronizes correctly, but initial setup still requires the operator to create it.
3. Evidence is primarily parent/occurrence-linked. Framework and Vendor supporting relationships exist, but there is no universal attach-existing, version-aware multi-record Evidence workflow across every module.
4. Legacy records may lack occurrence IDs, actors, source details or historical assessments. The application must display missing provenance honestly rather than synthesize it.
5. The backend and session-demo implementation are separate execution paths. Both require parity tests; a working Demo does not demonstrate a running persistent backend.

## 6. Usability improvements implemented

Context-preserving historical navigation, Finding occurrence labels, consistent Risk category choices, readable retained category values, blank intentional Risk ratings, and clearer creation requiredness. Existing drawers, layouts, navigation, filters and visual tokens were retained.

## 7. Recommended enhancements — not implemented

- Define one explicit initialization policy for active Risk/Vendor/Policy obligations: create Needs Scheduling vs require a first date. Include duplicate reconciliation, missing/not-applicable/retired Policy handling and opt-in treatment of existing records before bulk backfill.
- Add a contextual “Schedule Policy Review” action backed by the same central Review, with an explicit annual default and duplicate guard. Do not conflate this with “Submit for approval.”
- Introduce universal existing-Evidence linking only with clear version pinning, unlink/retention rules, tenant enforcement and attachment provenance.
- Plan an explicit legacy provenance/category migration with reviewable mappings; do not infer historical actors/decisions or silently reclassify records.
- Audit the Board Report's older separate calculations before claiming report/Dashboard metric parity; no reporting redesign was included here.
- Continue accessible-label and form validation consistency improvements across remaining custom controls, rather than claim an accessibility conformance audit.

## 8. End-to-end validation

Built frontend, headless Edge, isolated Demo session:

- Created a new client and quarterly Review; started it; attached a synthetic file and comment; raised Finding+Action; completed late Q2; next due stayed September 30, not three months after completion.
- Opened original Q2 history from both Finding and Action; historical completion controls absent; original evidence present; fresh occurrence evidence empty.
- Completed the sole remediation Action; confirmed completion timestamp and Pending Validation; separately validated Finding closure.
- Created a Risk with deliberate 4 × 4 assessment; scheduled its annual central Review through the Risk drawer; opened it from Calendar and completed it; Last Reviewed populated and Next Review advanced to the scheduled anniversary.
- Created Vendor with service and initial annual review date; completed central Review; Last/Next synchronized without deleting Vendor history.
- Created Policy and explicitly linked annual Review; completion synchronized Last/Next while Policy remained Draft.
- Switched to Cyberdyne and confirmed the other client's created records were absent.

Backend ASGI tests use isolated mock MongoDB. They cover late completion, monthly/quarterly/semiannual/annual anchors, repeated completion/creation, one-time behavior, source projections/retry repair, Risk acceptance/closure, Vendor assurance/contract/inactive retention, Policy history and authorized Finding validation. These are not live persistent-database browser tests.

## 9. Data integrity

No Dashboard copies or additional scheduling engine were introduced. Review history remains embedded snapshots with stable occurrence identity. Related drawers read the original source records, so remediation completion remains live even when the originating Review is historical. Snapshot metadata only improves new completions. Existing records, seeds and lifecycle values were not migrated or deleted. Existing duplicate-suppression tests remain in place.

## 10. Tenant isolation and permissions

New API regression proves a client viewer can read permitted related items but cannot start/complete Reviews, create remediation Actions or upload Evidence. Another client's related endpoint returns 403; a foreign-client Finding with a matching Review pointer is excluded. No forbidden writes occur. Existing tenant/source-validation suites cover records, owners, Evidence and lifecycle actions. Browser Demo switching was separately checked. No new frontend-only authorization was introduced.

## 11. Regression QA

- Full self-contained backend suite, frontend Jest suite, production build, hook lint, secret scan and whitespace/diff review run for this release; final totals are recorded in the release response.
- Five-client Dashboard: exact four card/drill-down counts, authoritative record opening, Top 5, keyboard/Escape, framework scope and widths 768/1024/1280/1440.
- Demo/login: blank deferred Sign In, no fake authentication, stale standard token rejected, five clients × 11 module routes, logout/reload and no backend requests.
- CIS regression: onboarding, 56 safeguards/12 Reviews, selected framework visibility, cadence warning, Evidence/comments, Action completion/Finding validation, retained assessment control, refresh, tenant separation and responsive layout.
- Browser checks collect console/page errors. Synthetic files and browser session data remain outside Git and standard data.

## 12. Limits

Not a claim that every form permutation, concurrent production race, assistive technology, mobile device, browser engine or real MongoDB failure mode has been exercised. Legacy external-environment tests need staging and were not reported as passing. Four existing hook dependency warnings remain in Calendar, ClientDirectory, Evidence and PlatformAdmin; no unrelated effects were rewritten to suppress them. This JavaScript/JSX project has no separate TypeScript type-check command.

Standard authentication stays intentionally unavailable in the frontend preview. Backend fixes are committed for later staging deployment, not activated by publishing static assets. No production/non-demo database was accessed or modified by this audit.

## 13. Commit

The release response identifies the GitHub `main` commit containing this report and exact tested source. Existing GitHub/Sites histories are preserved without force-pushing; their content trees are compared.

## 14. Preview

Owner-private preview: https://iventure-grc-code-preview.mr-robbashea.chatgpt.site

Publication and post-publication verification are reported separately in the release response. No audience expansion is part of this task.
