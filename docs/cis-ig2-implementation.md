# CIS v8.1 cumulative IG2 extension

Historical initial implementation record (2026-10-03). See
`cis-ig2-finalization.md` for the later authorized merge/private Demo publication,
resolved baseline failures and final verification gate.

Baseline: `e3753e9` (merged PR26), fetched 2026-10-03. Branch: `codex/cis-ig2-extension`.
Bounded authorization: application changes, isolated tests, fresh Initech Demo fixture,
commits/push/draft PR. No merge, hosted publication, production deployment or shared-backend writes.

## Decisions and checklist

- [x] Confirm merged CIS/ISO baseline and isolated worktree.
- [x] Retain `cis-ig1` storage/UUID namespace; group is client configuration, missing=1.
- [x] Revalidate complete 56/74 source partition and resolve public-source discrepancies.
- [x] Record content authorization basis: user explicitly confirmed CIS v8.1 IG2 scope.
- [x] Implement validated cumulative scope in backend, Demo, onboarding and later enablement.
- [x] Preserve identities/answers/history/ownership/links and custom Review schedules.
- [x] Implement reduction impact/confirmation/audit and retained history.
- [x] Add 74 authored guidance entries and scope-aware Review/policy/operating content.
- [x] Fresh Demo Initech: 130 unassessed/unverified rows, seven Contacts, no login grants.
- [x] Exact membership, lifecycle, retry/failure/concurrency, permission and regression checks.
- [x] Isolated browser QA, normal/Demo builds, final main refresh/diff review.
- [x] Coherent commits, push, draft PR and precise handoff.

## Content provenance

`docs/cis-substantive-validation.md` records prior user-confirmed commercial product
authorization (2026-09-22); no confidential license document is retained. This is
evidence of prior confirmation, not independent legal review. The user explicitly
confirmed in this implementation session: "Yes, it covers CIS v8.1 IG2". No license
document or independent legal clearance is claimed. Public CAS terms were accessed
on 2026-10-03: https://cas.docs.cisecurity.org/en/latest/source/terms-of-use/ .

## Source decisions

The machine-readable source ledger records all 18 CIS v8.1 CAS control URLs,
snapshot SHA256 values, 130 included IDs and 23 excluded IG3-only IDs. IG2 is
cumulative: the original 56 definitions plus exactly 74 additions. Numeric
ordering and per-control membership are tested independently of the catalog.
CAS assessment metrics and scoring inputs are not imported.

- CAS 12.5 has a malformed heading. Its name is resolved using the explicit 12.7
  dependency: Centralize Network Authentication, Authorization, and Auditing (AAA).
- 12.2 covers secure network architecture, not just documentation; 12.6 retains
  secure-management intent without mandatory product brands; 12.7 specifically
  retains VPN and AAA; 13.1 permits SIEM or equivalent analytics; 11.1 includes
  backup and recovery procedures.
- The existing 15.1 assessment guidance incorrectly made provider assessment
  mandatory. The narrow correction keeps service-provider inventory/review here;
  dedicated provider assessment is 15.5, excluded as IG3-only.
- Existing 56 definition objects, assessment criteria (including IDs) and all
  original requirement-guide answers are unchanged. Only the confirmed 15.1
  assessment-guidance correction affects existing authored content.
- New content distinguishes official reference links from Omnisciente-authored
  criteria, guidance, role suggestions and operating examples. Source qualifiers
  remain, including 8.10 retention, 8.11 weekly review, 11.5 quarterly recovery
  testing, 16.9 annual training and 18.2 annual qualified external testing.

## Compatibility and operating model

No namespace or existing assessment-ID migration is required. Missing client
configuration means IG1. Onboarding and later enablement accept strict group 1
or 2; the explicit scope endpoint changes an active program. Framework choice
does not change permissions. Initial intake history stays separate from current
scope, which drives navigation, assessments, search/counts, summaries, mappings,
operating handoff, current execution briefs and CSV exports.

Upgrade adds only missing deterministic assessments and reuses existing Reviews.
The original 12 activity groups are expanded; only network-defense,
secure-development and penetration-testing groups are added. Their proposed
governance cadences are recommendations, not claims of universal CIS minima.
Existing descriptions, owners, dates, custom recurrence, anchors and completed
occurrences survive reconciliation. Actual scans, restores, training, exercises
and external testing remain distinct operating duties. Shared Findings, Actions,
Evidence and Reviews provide follow-up; a Review completion does not automatically
implement or verify a safeguard. Person/provider/method and arrangement gaps stay
visible, including the need to check operating timing separately from the Review.

Reduction requires impact confirmation, reason and effective context date on or
before today (UTC). Scope changes immediately; the context date does not backdate
results. It retains all 130 assessment rows, links, completed history and open
work. It does not mark N/A, close Actions or cancel Reviews. IG2-only current
drivers become inactive while other framework drivers survive. Retained rows
remain accessible with explicit notices and optional export inclusion; active
totals and default exports return to 56. Re-enablement reuses retained IDs.

Configuration reuses the existing authorized mutation lease, snapshot check and
durable idempotency receipt. Proposed rows are reconciled before publishing the
new client scope. A failure can leave some retained rows or proposed Review
mappings initialized; this is not an all-collections transaction. The old client
scope remains authoritative until publication. Same-command retries resume the
saved intent, and completed receipt replays do not revert a later scope change.
Tests inject initialization and post-write audit failures and check concurrent
and stale requests against mock and real isolated MongoDB.

Initech is a fresh Demo-only fixture with 130 unassessed/unverified assessments,
blank methods and history, no copied Brawndo results or operating artifacts,
15 unscheduled Reviews and seven fictional Contacts. No Initech application
Users, invitations, credentials or real contact details are created. Client
behavior comes from shared configuration; its name/ID only selects fixture data.
Existing Demo fixture migration adds it once and preserves subsequent edits.

Desktop keeps the approved assessment hierarchy, collapsed guide, independent
verification, Findings placement, compact relationships, history and draft
protection. Additions-only displays 74 rows while totals remain 130. Browser
visual inspection found cramped mobile titles despite no overflow; scoped CSS
now stacks navigation and gives titles usable width. Reflow was checked at 390
and 320 CSS pixels using the [WCAG 2.2 reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
This is selected-workflow verification, not whole-application conformance.
CSV exports use existing formula escaping, tenant authorization, a bounded query,
JSON serialization of structured links and export auditing. Formula input is
tested using [OWASP CSV Injection guidance](https://community.owasp.org/attacks/CSV_Injection).

## Verification evidence

Executed locally on 2026-10-03. Normal and Demo builds both compile successfully.
Existing Node fs.F_OK deprecation and bundle-size advisories remain; no package
or lockfile changes were introduced. No pagination, virtualization or caching
was added based on this small fixture.

| Boundary | Command / scope | Result |
| --- | --- | --- |
| Backend offline | Existing full pytest suite | 582 tests and 683 subtests passed; existing FastAPI lifecycle deprecation warnings |
| Final backend focus | `python -m pytest tests/test_cis_ig2.py -q` | 6 passed, including formula escaping and structured-link export |
| Actual storage integration | `python scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27047 --include-cis-ig2` | 52 passed: six CIS tests plus existing recovery/persistence tests |
| Frontend broad regression | `craco test --watch=false --runInBand --testPathIgnorePatterns='brawndoTenYear\|frameworkFiveYear\|multiFrameworkLifecycle\|FrameworkProgramCard.test\|reviewHistoryIntegrity.test'` | 194 suites / 1,198 tests passed |
| Five-year simulations | `frameworkFiveYear` and `multiFrameworkLifecycle` suites rerun after seed corrections | 2 suites / 4 tests passed; CIS, ISO, SOC and shared lifecycle coverage |
| Final frontend focus | `cisIG2`, `BrawndoCisAssessment`, `brawndoPolicies`, `frameworkMappings` | 4 suites / 50 tests passed after final notices/export changes |
| Long simulation | Ten-year suite in initial full frontend run | 7 passed before the final IG1 Demo seed correction; not rerun afterward |
| Builds | `craco build` and `node scripts/preview.cjs build` | Both passed after final frontend changes |
| Browser | Isolated fresh Edge headless Demo at localhost:4197 | 31 checks passed, zero application errors; Initech, Brawndo and disposable scope lifecycle; compact evidence in `cis-ig2-browser-qa.json` |
| Compatibility | Compare all original 56 definitions, criteria and guide entries against baseline | Preserved; only 15.1 assessment guidance corrected |
| Delivery baseline | Final `git fetch origin main` and diff review | Main remained `e3753e9481e10d9d91198a60397a97f1443f6078`; diff whitespace check passed |

The broad run precedes final minor export/notices/mobile changes; affected tests,
both builds and browser checks were rerun afterward. Temporary suite exclusions
were command-line only; no project gate, assertion or test was disabled. The
initial complete frontend run had 28 failures; introduced count/content/seed
and fetch-contract regressions were corrected and rerun. Four failures were
independently reproduced on a clean detached baseline of the exact main SHA:

1. `FrameworkProgramCard.test.jsx`: one stale expected status-label snapshot.
2. `reviewHistoryIntegrity.test.js`: three tests submit unsupported `notes` to
   Review completion, which baseline and branch both reject.

These pre-existing failures remain unresolved within this bounded task. Therefore
the entire configured frontend suite is not claimed green.

Actual storage tests used the existing approved MongoDB 8.0.28 executable, bound
to localhost:27047 with a separate local data directory and generated disposable
test databases. They exercised real FastAPI routes through an in-process ASGI
client with real Mongo persistence; browser QA used Demo rather than a real
authenticated HTTPS backend. The existing test runtime uses FastAPI 0.141.1 /
Pydantic 2.13.5; it was not freshly provisioned from pinned requirements. No
machine-trust change, certificate install, paid infrastructure or live/shared
backend write occurred. Mock, Demo and real-storage results are distinct.

Browser checks include light/dark, numeric order, 74-row filter/130 totals,
keyboard modal navigation, guide disclosure, draft cancellation, Save & next,
CSV download, retained notices, scope reduction/re-enablement and stable IDs,
IG1 isolation, linked Evidence bytes and read-only controls. The report records
a single local page-ready timing; it is an observation, not a performance
benchmark or scalability claim. Automated synthetic operating workflows cover
recurring follow-up, urgent incident coordination, significant change and
Finding/Action remediation plus validation, without operating external services.

## Remaining limits and release boundary

No unresolved content-authorization, source-membership or merged-baseline
dependency remains. User confirmation is the authorization basis; independent
legal clearance and independent security review are not claimed. The four
baseline frontend failures and real-authenticated-browser integration limit
remain as described above. Client operating arrangements remain intentionally
unconfirmed in the fresh fixture. No merge, hosted preview publication,
production deployment or real external security-service operation is included.
The delivery commit and draft PR provide exact implementation provenance.

Implementation commit: `e986c14ed250c107340a4954d5630afceef87fa1`.
Pushed branch: `codex/cis-ig2-extension`.
Draft PR: [#27](https://github.com/robbashea-lab/GRC/pull/27), targeting unchanged main.
The documentation-only delivery follow-up is included in the PR's final head.
