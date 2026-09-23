# Executive client Dashboard

## Scope and current-state assessment

The former view repeated four top KPIs before a large framework-state section,
with Program Health below both. The replacement is a read-only management view:
Program Health, Compliance Programs, then five Highest Priority Items. Existing
source drawers, navigation, ownership, framework conclusions and authorization
remain authoritative. No records, snapshots, migrations or lifecycle writes are
introduced by Dashboard reads.

## Metric contract

### GRC work

The existing management obligation model supplies current Reviews, Actions,
unrepresented Findings and legitimate risk/policy/vendor/other due obligations.
Existing `represented_finding` and linked-Review suppression prevent a shared
remediation obligation or fallback schedule from being counted twice. Separate
actionable deadlines may still be separate obligations. Completed/closed work
is excluded by the existing source rules; future recurrence projections are not
extra work items.

Buckets are exclusive, in this order:

1. Past Due: literal due day before the shared UTC management day.
2. In Progress: remaining work with `in_progress` status, including undated work.
3. Due Next 30 Days: remaining dated work from today through day 30 inclusive.
4. Scheduled: remaining work after day 30.
5. No Date / Unscheduled: remaining work without a valid due date.

This partition intentionally differs from a standalone due-window total: an
in-progress item due tomorrow appears in In Progress, not in both buckets.

### Risk posture

Active Risk Register records use the existing assessed-risk severity calculation:
Critical, High, Moderate, Low, or Not Assessed. Closed risks are excluded.
Accepted is not a severity. Accepted Risks is a separate, intentionally overlapping
population; an accepted High risk remains in High. The accepted count must not be
added to the severity distribution as though it were another severity bucket.

### Third-party governance

- Vendor Reviews Past Due: authoritative active vendor-purpose Review obligations
  before today, or the existing vendor fallback review obligation where applicable.
- Vendor Reviews Due in 30 Days: the same population, today through day 30 inclusive.
- Assurance Needs Attention: active vendors with required assurance artifacts
  classified missing, expired or due soon by existing vendor governance rules.
- Contracts Expiring: active vendors with an actual contract date within their
  configured lead window, including past-due dates.
- Critical Vendors: active vendors with Critical criticality.
- Missing Required Assurance: assurance is required but no required artifacts are
  configured, or a required artifact has the source module's missing state.

Assurance and contract windows retain existing per-vendor configuration (default
90 days); the UI explicitly distinguishes them from the Review 30-day window.
Vendor condition populations can overlap and are not an additive workload total.
No dates or required artifacts are invented. Review rows open Reviews; vendor
conditions open their authoritative Vendor record.

## Compliance progress

Only finalized applicable client programs appear. Assessment scope uses stored
assessments for active catalog definitions; SOC 2 respects selected categories.
For each implemented program:

`round(100 * (Addressed + valid documented N/A) / tracked assessment-scope rows)`

There is no weighting or partial credit. N/A remains in the denominator and is
separately counted. Validity follows existing workflow constraints: a nonblank N/A
rationale, or for ISO Annex controls an excluded SoA decision and justification.
ISO ISMS clauses and HIPAA addressable specifications do not earn N/A credit.
Invalid legacy N/A and unrecognized states receive no credit but stay in the
denominator. Reads do not repair or rewrite those assessments.

The drawer shows exact numerator, denominator, rounding, valid/invalid N/A and
unrecognized states. Status counts use each framework's established labels and
open paged supporting assessments, with direct links to the existing workspace.
Evidence, Findings and Action completion alone do not change an assessment's
recorded conclusion. Formal framework scoring is not replaced.

The label is Reviewed & Addressed, qualified as program progress, **not certification
or a determination of compliance**. A configured zero-row scope shows Setup
Required with no percentage. Unsupported assessment modules, including the current
CMMC placeholder, show no fabricated percentage. Missing summary data is not zero.

## Ongoing program health

Structured assessment links, assessment IDs and framework/safeguard mappings
select recurring Reviews. No title matching is used. Each active recurring Review
is counted once within that program; a Review legitimately mapped to two programs
can appear in both program views. One-time, completed, cancelled and archived
Reviews do not become current recurring obligations. Historical occurrences are
neither loaded nor recounted.

Exclusive categories: Past Due, Due in 30 Days (today inclusive), Current / Due
Later, and Needs Scheduling. The headline numerator is dated activities not past
due (Due Soon + Due Later), with that definition written on the card. No mapped
activities means “No recurring obligations configured,” not 100% healthy.
Past-due or unscheduled obligations, unresolved attention assessments, or invalid
N/A cause Needs Attention. Recurring dates do not alter assessment progress.
Next activity selects earliest Past Due, then Due Soon, then future dated Review;
ID breaks equal-date ties. All open the authoritative Review.

## Priority, performance and authority

The existing deterministic priority model remains: overdue Critical, overdue
High, other overdue, other material Critical/High, unassigned, then remaining
attention work; due date and stable record identity/title break ties. Candidate
selection retains source attention rules, including due-within-14-days work,
validation and assessment needs. Linked represented remediation is suppressed;
record identity is deduplicated. Top five and View All share the same population.

The bounded Dashboard read model remains in place. Framework summaries project
only needed fields, batch relationships per program and cap collection reads at
20,000 (explicit error rather than partial totals). Detail pages default to 25,
maximum 100. No entire assessment or Review histories are sent to the Dashboard.
All server reads retain existing client authorization; source navigation performs
the source API's checks. Demo uses the equivalent isolated session implementation.
No permission, account or membership changes were made.

## Deliberate limitations

- No historical progress trend: existing history does not establish a reliable
  historical assessment-scope denominator. No synthetic baseline is backfilled.
- Person-filtered operational views leave program cards organization-wide and
  explicitly say so. Framework views show their actual assessment/recurring data,
  not substituted organization-wide operational totals.
- Board Report retains its existing management-model metrics and no framework
  percentage. PDF generation requires the backend and remains unavailable in Demo.
- No standalone TypeScript check is configured in this JavaScript application.
- This is not a full framework assessment, scoring or certification implementation.

## Verification

Automated: reviewed isolated backend runner, including Board Report regression,
341 tests and 254 subtests passed. Frontend: 77 suites / 425 tests passed. Tests
cover resolution and N/A edge cases, empty scopes, recurring-date independence,
accepted-risk separation, exact paged metric populations, source navigation,
client mismatch rejection and server-side cross-client denial.

Changed-file ESLint (CRA rules, ES2021 and Jest environments): zero errors;
27 warnings on unchanged lines in existing preview files. Normal production
preview build passes with the existing PlatformAdmin hook-dependency warning.
CI=true promotes that unchanged warning to a build error; no quality rule or
unrelated source file was altered to hide it.

Browser verification uses a fresh, isolated Demo session and the exact production
preview build, not a live authenticated backend. Live staging authentication and
production-data permission checks are not claimed by these results.

Browser results: five canonical clients, 16 health populations per client, exact
drawer totals and paged-row uniqueness, source-record opening, applicable framework
cards and direct assessment links passed. Controlled session-only CIS data gave
2 / 56 resolved = 4%, including one documented N/A. Changing a mapped Review from
past due to future did not change that percentage. Accepted High risk drill-down
and a newly created empty-client fixture passed. No fabricated trend appeared.
Widths 1440, 1280, 1024 and 768 had no page overflow. Calendar, Reviews, Findings,
Action Items, Risks, Policies, Vendors, Evidence Library, Onboarding and Client
Settings loaded without page errors. The Demo Board Report button retained its
explicit backend-required feedback; backend PDF regression passed separately.
Browser fixtures and screenshots are outside the repository and are not published.
