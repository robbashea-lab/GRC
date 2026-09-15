# Client dashboard posture

## Read-only architecture

`loadClientDashboard` loads existing tenant-authorized endpoints and rejects incomplete/cross-client results. `aggregateClientDashboard` projects source obligations; `dashboardPosture` supplies exact arrays for cards, distributions, priority lists and their shared drawer. Nothing creates, updates or duplicates persisted records. Existing record drawers remain the operational destination.

Client and person selections key asynchronous results. Late responses are discarded, and client changes reset person/framework views. Server authorization remains unchanged. The current published frontend is an isolated demo, not a standard-authentication staging release.

## Metric contract

- Past Due: active current obligations with a calendar due date before today.
- Due in Next 30 Days: today through day 30, inclusive. Completed/closed/inactive records and projected next recurrence dates are excluded. Actual open Reviews remain obligations even if their related vendor is inactive.
- Critical / High Findings: active material findings, including pending validation; closed/accepted findings excluded. Remediation tasks are not findings.
- Significant Risks: active assessed High/Critical risks using the existing likelihood/impact calculation. Accepted risks remain exposures; closed/retired risks do not. Unassessed risks are displayed separately in Risk Posture.
- Work distribution: overdue first, then in-progress, due within 30 days, later scheduled, and undated. Categories partition current work; the in-progress portion of upcoming work is not counted again in the distribution's upcoming segment.
- Vendor health: existing vendor governance helpers and their review/assurance/contract windows. Assurance includes missing/expired artifacts; contract attention includes expired dates. Drawers show the contributing vendors.

Linked Review dates replace corresponding vendor/policy/risk fallback dates. Linked remediation with the same deadline and owner replaces the finding obligation, without removing the finding from its material-findings card. Linked acceptance expiry is counted once. Different genuinely actionable dates remain separate. Priority presentation deduplicates by authoritative record ID.

Top priorities rank Critical overdue, High overdue, other overdue, material severity, unassigned and other current attention. Five records are initially visible; View All opens the full priority drawer. No inferred framework mappings or AI scores are used.

## Compliance and reporting boundary

`complianceProgress` follows the same finalized client applicability records as existing navigation. Only supported selected programs appear. The current requirement model is a program register, not a detailed assessment model: progress and denominator are deliberately null. Evidence presence and onboarding completion do not imply compliance. Framework views explain the absence of operational mappings and do not substitute organization totals.

Future assessment integration belongs in this central layer: exclude Not Applicable from the denominator, retain Not Assessed distinctly, and reconcile material findings and validation before presenting addressed progress. No percentages or trends are fabricated in this release. SOC 2 is not currently a framework page in the catalog; no new framework functionality is introduced.

The existing Board Report button/server report is preserved. It has not been redesigned to consume these new management projections; that integration remains future reporting work. Existing report metrics retain their existing labels/meaning, rather than being relabeled as the new Past Due metric. Browser-demo PDF generation remains unavailable as before.

## Validation — 2026-09-15

- 125 frontend tests across 22 suites pass. New tests cover calendar boundaries, completed/closed exclusion, accepted material risks, unassessed risks, linked-obligation deduplication, source immutability, vendor windows, client/person isolation, dynamic applicability, exact drawer counts and the five-row limit.
- 82 self-contained backend unittest tests pass, using isolated mock databases and real FastAPI routes, including unauthorized-client rejection. Legacy external HTTP/pytest suites were not run against an uncertain database.
- Production preview build succeeds with four existing hook-dependency warnings outside Dashboard. All ten Dashboard implementation/test files pass a stricter separate lint check with zero errors/warnings. A broader strict unused-variable check reports 25 existing unused declarations in unrelated files; these were not changed. No TypeScript checker is configured for this JavaScript application.
- Built-preview browser QA covers all five clients, four card drawers per client, exact displayed counts, material findings/risk source checks, source-record opening, keyboard activation/Escape, Top 5, applicable framework views/pages, framework removal/no programs, refresh, Client Settings and widths 768/1024/1280/1440.
- Separate regression smoke test covers five clients across Dashboard, Calendar, Reviews, Findings, Action Items, Risks, Policies, Vendors, Contacts, Evidence and Onboarding. Demo entry/logout, blank disabled standard sign-in, stale-token rejection and absence of demo API traffic pass. No page errors observed.
- No backend, authentication, source workflow or seed changes are included. Secret-pattern scanning covers changed sources and generated preview assets. Build output, temporary QA scripts and screenshots remain outside Git.

This validation does not establish live standard frontend/backend authentication readiness. Standard sign-in remains intentionally deferred.
