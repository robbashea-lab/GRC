# Client Portfolio dashboard acceptance

## Scope and evidence boundary

Approved reference: `governara-client-portfolio (3).html`, with the complete accompanying implementation request. Native framework records, current app styling, authorized routing, and actual enrollment take precedence over illustrative clients, counts, colors, dates, and interpolated weekly history. Assessment implementation is distinct from verification, assessment resolution, certification, and an auditor opinion.

Initial source inspection: `3e43ce3b9385e860d32c0bba998468f0dcee3507`; CI167/native validation baseline: `40350a5300a7cef2a3661574cd335a015be8d9f9`. The subsequent scoped Demo storage correction has the local verification recorded below and requires its own new-head release gate. Source inspection, automated tests, local browser evidence and hosted observations are identified separately. No existing Demo/client records were changed for reconciliation. Mutation tests used disposable isolated databases and synthetic clients. Final release verification remains pending.

## Canonical formulas and scope

| Framework | Native source and scope | Implementation meaning | Native parity boundary |
| --- | --- | --- | --- |
| CIS v8.1 | `framework_catalog.active_definitions`, cumulative IG1/2/3; native workspace filters `active_definition_ids` | `addressed / applicable`; N/A excluded separately; assessed = applicable minus Not Assessed | Native pilot donut already displays one decimal; other native summaries round integers. Shared scope/counts must determine portfolio values. |
| SOC 2 | Actual enabled categories, unique criteria from the native catalog/configuration | Addressed (Readiness), Partially Addressed, Needs Remediation / Validation, Not Assessed; verification is independent | No category/criterion totals taken from the attachment. |
| ISO 27001 | ISMS requirements plus explicitly included Annex A controls, retaining excluded/undetermined SoA decisions separately | Implemented / applicable; SoA excluded or undetermined controls earn no implementation credit | Shared card/workspace metrics and implementation status drills use this scope; undetermined decisions are not relabeled N/A. Actual local Demo row/modal/native reconciliation passed. Authorized standard hosted Dunder access was unavailable. |
| NIST CSF 2.0 | Native catalog subcategories; target-profile decisions remain separate | Achieved / applicable, with native partial/gap labels | Do not assume sample106 or count target-profile alignment as implementation. |
| HIPAA / other tracked programs | Native catalog objects and framework-specific applicability validation | Saved addressed conclusion / applicable; addressable specifications are not optional | Unsupported detailed tracking remains unavailable; never fabricate zero/success. |
| CMMC / unsupported detailed tracking | Selected native program with no assessment catalog | Implementation counts and percentage are unavailable | Source-reviewed at frozen `40350a5`: native dashboards explain unavailable detailed tracking; the normal workspace is applicability-only; Portfolio row/modal show Unavailable. No new browser claim. |

`framework_summary.progress` is a separate assessment-resolution measure: addressed plus valid N/A divided by all assessment records. It must not be relabeled as implementation. Invalid/missing/duplicate source rows must not produce a successful percentage. Scope identity includes membership, configuration and framework version, rather than denominator alone.

## Acceptance matrix

| Requirement | Status | Concrete evidence / remaining check |
| --- | --- | --- |
| Native app shell, branding, theme and authorized destinations; unrelated modules frozen | Pass | Finite connected source review and integration-owner local browser receipt: native shell, light/dark themes and exact ISO client destination preserved. Final committed diff remains a release check. |
| Grouped five-column table, whole progress click area, distinct-client/program count | Pass | Local native UI reconciled all four actual Demo clients/programs; progress buttons opened each corresponding modal. |
| Trimmed client-level search composed with scope/framework; synchronized sidebar scope | Pass | Local browser: trimmed/case-insensitive Morgan/SOC 2 searches compose with framework filter; sidebar remains independent; Mine for the actual Demo Explorer has no assigned clients. Assignment-ID and authorization scenarios also exercised through isolated real routes. |
| Four grouped sorts, stable ties, missing values last, never-active first | Pass | Local browser: oldest puts never-active first, client-name ties remain stable, implementation uses grouped minimum. Focused control/math assertions passed; no multi-program browser claim. |
| Dynamic registry/enrollment, IG3, enabled/future clients, no inherited records/history | Pass | Eight independent real-route cases passed with disposable synthetic clients, including cumulative IG3 153, future onboarding, enrollment and retained re-enablement. Integration-owner local synthetic Add Client / Open Profile / onboarding created independent CIS 0/56, ISO 0/30 and SOC 0/33 programs. Standard hosted baseline also exposed Hooli IG3; hosted mutation was not performed. |
| Canonical row/modal/native current values at one committed revision | Pass | Integration-owner actual local Demo reconciliation for all four clients below; native sources retained. This is browser evidence, separate from fixtures and standard hosted data. |
| ISO undetermined/excluded/included SoA parity | Pass | Actual local Dunder: 94/120 and 117 assessed agree across portfolio/modal/native components, retaining 2 excluded and 1 undetermined SoA decisions. Included-only drill cohorts and explicit N/A semantics covered by source/focused tests. |
| Implementation distinct from verification and assessment resolution | Pass | Independent native IG3 route verifies addressed with unchanged unverified field; ISO guided progress does not change current posture until native commit. Partial statuses earn no implementation credit. |
| Current posture independent of history availability/stale snapshots | Pass | Source and focused component/route checks keep native current independent of saved observations. Local actual Demo has one current baseline; row/modal values still reconcile. Invalid source counts remain unavailable. |
| Durable genuine history, separate effective/capture dates, membership/version scope events | Pass | Local actual-route and real-Mongo recovery campaigns passed on frozen app source, covering event binding, sampled recovery, retained lineage and same-denominator scope changes. Hosted durability of the new release remains unverified. |
| Reads/login/refresh do not write assessment/activity/history | Pass | Successful real local route reads across five ranges preserve complete business/history/activity collections. Denied requests append required security audit entries only. Actual Demo reconciliation made no source writes; read-only migration also checked in preview tests. |
| Successful writes capture; rejected/cancelled/stale writes do not capture | Pass | Real local native PATCH/enrollment/configuration tests exercise accepted writes, explicit stale 409, invalid 422, read-only 403 and nonexistent bulk path. Failed preview storage retains original source/history atomically. |
| Retained history across disable/re-enable, reload/session/user | Pass | Isolated normal routes retain program/snapshot identity across disable/re-enable and a second authorized session; real-Mongo recovery passed. Local browser reload retains controls. Hosted persistence of the new release remains unverified. |
| All five calendar ranges, period baseline proof and truthful chart/data dates | Pass | Local browser exercised all five UTC calendar ranges; expanded Data remains expanded across ranges. Leap-year/month-end fixtures and conflicting-baseline regression pass. No backfilled or interpolated positions. |
| Common trailing 90-day sparkline axes, scope markers and genuine chart observations | Pass | Connected shared calculation/chart source uses one horizon/vertical span, actual observation dates and scope markers. API/preview assertions preserve observed dates and scope resets. |
| OLS forecast, genuine daily coalescing, >=3 observations / >=60 days, fixed 90-day horizon | Pass | Root-reported focused shared math suite passed, including the 56/26,29,32 example; actual source review requires nonempty scope/version/revision and genuine committed observations. Browser Demo has insufficient history and makes no fabricated projection. |
| Forecast scope reset, stale/flat/declining/invalid suppression, true 100% and >5 years | Pass | Shared math boundary regressions passed; independently reproduced missing-proof suppression and preserved unavailable baseline. Sampled/read positions cannot earn OLS votes. |
| Server-side tenant/program authorization and permitted read-only history | Pass | Eight independent real local endpoint cases include authenticated scoped admin/assigned read-only, cross-client tampering, wrong program and unauthenticated denial; read-only history grants no mutation/portfolio enumeration permission. |
| Loading/error/empty/no-program states; no optimistic success for rejected writes | Pass | Focused native/component and isolated endpoint checks passed; unavailable current/history positions retain explanatory states rather than zero counts. Initech actual valid zero is correctly Not started. |
| Modal dismissal/focus, tabs, pointer/touch/keyboard chart, responsive themes | Unverified | Browser pointer and chart Home/Right/End select genuine positions; Escape restores row focus. Reopening resets 3m/collapsed Data and retains Status mix; three-program tabs retain expanded Data and focus trap works. Light/dark, phone 390x844 and tablet 768x1024 verified with native horizontal table scroll and no page overflow. Physical touch and browser backdrop input remain unverified; touch/backdrop have automated DOM coverage. |
| Bounded batched aggregates and on-demand history; safe native rendering | Pass | Finite source review confirms bounded reads, safe React rendering and compact historical points with retained stored proof. Legacy read normalization/atomic identity migration and size regressions passed. No production-volume latency benchmark or browser request-count claim. |
| Required tests, normal/Demo builds, exact CI/head, hosted verification | Unverified | Both earlier local builds passed. CI167 backend/Mongo checks succeeded, but frontend failed 3 suites / 11 tests. Scoped storage correction and fixture repairs passed focused checks; the complete new-head gate and hosted release verification remain pending. |

## Capture and projection policy

Storage retains the complete committed scope/reference state. New posture/scope observations are captured after successful native persistence through the existing durable activity acknowledgement; event-time binding requires the latest exact source event and every contributing source timestamp at or before that event. A delayed observation without that proof remains explicitly sampled at its actual capture time. The existing collector retries delayed receipts and provides prospective baseline/recovery observations; it does not invent older counts or weekly positions. Enrollment disappearance/reappearance produces scope-gap markers while preserving program identity and history.

The implementation scope fingerprint retains the existing catalog population/configuration/applicability/version semantics, excluding only the newly added `enrollment_ids` field for compatibility with saved pre-field history. Full stored scope and source revision retain that enrollment proof. Genuine enrollment replacement/disable/re-enable remains a committed scope event; matching endpoint denominators do not erase the gap or restore forecast comparability. Read-time legacy Demo identity normalization is pure and creates no synthetic observations or false scope events.

An earlier position is carried to a period boundary only when its exact native predecessor lineage establishes continuity through the next commit. Conflicting or unavailable baselines remain unavailable. Current posture is always read from native saved assessments independently of snapshots.

Projection uses the shared frontend calculation over the latest 90 elapsed days, independently of the displayed 1/3/6/12/36 calendar-month range. Only genuine committed observations with trustworthy scope/version/revision qualify; UTC calendar-day coalescing retains the latest real state/time. At least 3 distinct daily observations spanning 60 days are required. Scope/version/membership or enrollment gaps reset comparable coverage; sampled/read positions never supply OLS votes. The latest trustworthy state must match current saved counts and be no older than 30 days. Nonpositive/no-net-gain, invalid, zero-scope or insufficient data produces Not estimated; valid fully implemented nonzero scope produces Fully implemented; projections beyond 5 years use Beyond 5 years. The result is conditional progress, not a promised delivery/audit/certification date.

## Actual Demo reconciliation

Record each enabled program, including every other observed Demo client, at the same committed source revision/as-of point. Root owns read-only native browser reconciliation. The HTML values and isolated fixtures are not evidence of current Demo posture.

| Client/program | Stable identity, version/group/categories | Applicable/status buckets; implemented/assessed | Native / portfolio / modal percentage | Lead / meaningful activity / source revision | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| Brawndo / CIS IG1 | `demo_brawndo:cis-ig1`; CIS v8.1, cumulative IG1 | 56 applicable; 32 implemented, 12 partial, 5 needs attention, 7 not assessed; 49 assessed | Native / local portfolio / modal: 57.1% | Morgan Ellis; Action Item completed 2026-10-10T12:00Z | Pass: integration-owner actual browser observation, no source writes |
| Dunder Mifflin / ISO 27001 | `demo_dunder:iso-27001`; 2022 + Amd 1:2024, ISMS + included Annex scope | ISMS 30: 24 implemented / 6 partial; included Annex 90: 70 implemented / 13 partial / 4 needs attention / 3 not assessed. SoA 90 included / 2 excluded / 1 undetermined. Combined 120: 94 / 19 / 4 / 3; 117 assessed | Native components / local portfolio / modal: 78.3% | Morgan Ellis; Action Item completed 2026-10-10T12:00Z | Pass: exact native `/compliance/iso-27001?client_id=demo_dunder`, refresh / Back / Forward preserve client context; SoA decisions unchanged |
| Initech / CIS IG2 | `demo_initech:cis-ig1`; CIS v8.1, cumulative IG2 | 130 applicable; 0 implemented, 0 partial, 0 needs attention, 130 not assessed; 0 assessed | Native / local portfolio / modal: 0.0%; true Not started | Unassigned; never active | Pass: integration-owner actual browser observation |
| Prestige Worldwide / SOC 2 | `demo_prestige:soc-2`; 2017 TSC / revised points of focus 2022; Security 33 + Availability 3 + Confidentiality 2 unique criteria | 38 applicable; 27 Addressed, 7 Partial, 2 Needs Remediation, 2 Not Assessed; 36 assessed | Native / local portfolio / modal: 71.1% | Morgan Ellis; Action Item completed 2026-10-10T12:00Z | Pass: integration-owner actual browser observation; native SOC bucket reread confirmed without writes |
| Other actual Demo clients/programs | Actual authorized enumeration contained only the four clients/programs above | No additional observed Demo programs | N/A | N/A | Pass for actual enumerated scope; no illustrative additions |

The local new UI used actual retained Demo source records, with one genuine `current_baseline` observation on 2026-10-13 at 22:28 UTC. Existing Demo clients were not reset or reseeded. This is distinct from the standard authenticated hosted baseline: 22 clients, including Hooli CIS IG3 0/153, Initech 0/130, Brawndo 2/56 (3.6%, 2 assessed), and Prestige 0/38 with the same three SOC categories. Standard hosted Dunder was not authorized; no substitute or fixture establishes hosted Dunder parity. The existing hosted revision `bf59` still showed the older portfolio; the new revision had not been deployed at this observation.

The integration owner also exercised normal Add Client / toast Open Profile / three-program onboarding in a disposable local synthetic client, with no original Demo record changes. Native ISO A.5.1 was made Applicable / Implemented: 1/31 (3.2%), 1 assessed, Annex 1/1. Changing it to Partially Implemented produced 0/31 (0%), still 1 assessed and correctly not Not started. History retained the three genuine saved states 0/30 → 1/31 → 0/31 at 23:00 / 23:01 / 23:05 UTC on October 13, preserving each denominator and disclosing scope change, missing baseline and unavailable forecast. Reload preserved current and the meaningful Last activity label Assessment saved. Cancelling an unsaved Implemented draft retained the saved Partial conclusion and all three history rows. This is local browser lifecycle evidence, separate from real backend-route tests. The synthetic client was subsequently archived through the native flow, as recorded below.

## Verification and remaining gates

| Evidence | Confirmed result | Boundary / remaining check |
| --- | --- | --- |
| Focused native backend routes and capture/projection checks | 94 tests passed; 16 subtests passed; 6.71s (`work/client-portfolio-backend-freeze-focused.log`) | Includes eight independent actual FastAPI authorization/onboarding/native assessment cases with explicit edit tokens and a second session. Initial mocks isolate storage, not authorization or native route behavior. |
| Focused frontend | Native presentation/forecast: 51 tests and 1 snapshot passed. SemanticPresentation plus three UI suites: 29 tests passed in 20.71s, including touch DOM coverage. Real-router integration plus original context tests: 4 tests passed in 9.043s. Corrected navigation fixtures: 9 tests passed; pinned clock checks: 155 tests passed; unchanged ISO component: 56 tests passed. | These are separate, potentially overlapping runs, not a combined count. Checks cover source states, filters, parity, charts, forecast boundaries and tenant navigation; complete frontend success remains a separate gate. |
| Scoped Demo storage correction | 5 connected suites / 72 tests passed in 393.867s (`work/client-portfolio-iso-quota-connected-final.log`). Includes all 8 unchanged ISO guided cases covering 123 definitions (295.668s), 39 reporting/storage checks (81.607s), DemoStorage, DemoPortfolio and retired-client checks. | Real adapter/native guided-save sequence stays within the existing quota; legacy roundtrip, historical independence, packed clear-files/no-op preservation and failed-write unchanged bytes are covered. No quota increase, record deletion or native history/evaluator/catalog change. |
| Full local backend attempt | 976 tests passed; 10 timezone failures; 12,404 subtests passed | The isolated Windows test runtime lacked timezone data. Installing the pinned `tzdata==2026.3` in that local venv required no application or dependency-manifest change. Both complete reporting suites then passed: 38 tests, 3 skipped, 9 subtests in 8.47s. The full local run is not relabeled green. |
| Full local real-Mongo recovery | 178 tests OK in 1,285.395s on frozen application source `40350a5` | Existing loopback-only wrapper with `--include-portfolio-reporting`, including the eight new native route cases; its awaited exact-UUID cleanup callback succeeded. This establishes isolated real-Mongo evidence, not hosted customer durability. |
| Normal authenticated and Demo builds | Both earlier local builds passed with exit 0 | These receipts precede the scoped storage correction; the final gate must rebuild the exact new head. Builds do not establish complete frontend or hosted acceptance. |
| [CI167](https://github.com/robbashea-lab/GRC/actions/runs/38485460496) at `40350a5` | Backend: 986 tests passed, 3 skipped, 8 warnings; 12,404 subtests passed in 1,635.69s. Backend/Mongo checks succeeded. Frontend: 303 suites passed / 3 failed; 9,155 tests passed / 11 failed / 9,166 total. Ten-year simulation passed in 1,138.832s. | Frontend failures were obsolete connected navigation fixtures, the reproduced ISO Demo storage quota defect, and a midnight-sensitive 1.1 test clock. Focused repairs passed, but CI167 failed and is not final release approval. |
| [CI168](https://github.com/robbashea-lab/GRC/actions/runs/38491661630) at `010861c` | Backend: 986 passed, 3 skipped, 12,404 subtests passed in 1,254.91s; independent Mongo succeeded. Frontend: 304 suites passed / 2 failed; 9,166 tests passed / 2 failed / 9,168 total. Ten-year simulation and all unchanged ISO guided cases passed. | The exact gate failed: a navigation fixture asserted focus before Radix's deferred close autofocus, and the new IG1 provisioning case exceeded its existing 5-second test limit. The focus fixture now awaits the real opener focus event and retains exact focus identity; four connected suites / 34 tests passed. Ordinary framework/interview GETs unnecessarily rewrote the whole Demo store; the bounded adapter correction returns pure reads while preserving native saves, crypto/current-identity fences and both accepted CIS export URL audit writes. Two connected suites passed 68 tests in 28.881s, including every unchanged guided case; one long quota test was selected out of that finite run. IG1/2/3 provisioning took 2,552 / 2,139 / 1,361ms under the unchanged limit. Complete combined-head checks, its new ISO catalog footprint, and both optimized CI builds remain required. |

Mongo fault injection verified retained receipt recovery; future-clock lifecycle refusals did not verify future capture/catch-up, and no independent empty-database readback was performed after the successful cleanup callback.

The local full frontend attempt timed out during the long simulation while other jobs competed; subsequent component timeouts were not treated as demonstrated application defects. CI's same simulation passed, and the unchanged ISO component passed its isolated rerun. The local full frontend attempt is not relabeled green.

Focused independent route command: `APP_ENV=test`, `PYTHONPATH=backend;backend/tests`, then `python -m pytest backend/tests/test_client_portfolio_dashboard.py -n 0 -q` in the existing isolated runtime. Frontend focused checks use the installed CRACO runner with `--watchAll=false --runInBand --runTestsByPath`. The release gate remains `.github/workflows/release-verification.yml`: complete frontend tests, authenticated and Demo builds, every classified offline backend suite, and the independent disposable Mongo recovery campaign. New suites are classified in `backend/tests/suites.json`; gates are not weakened.

The full frontend attempt exposed the new URL/client context integration loading the installed router in previously unmocked consumers. A focused case reproduced `Cannot find module react-router/dom` before assertions. Jest 27.5.1 cannot resolve React Router 7.18.4's published subpath; JSDOM 16.7 also omits the encoding APIs used at import. The final harness maps only the two installed CommonJS entry points and supplies Node util TextEncoder/TextDecoder, supporting fixture mocks and real router behavior. The real MemoryRouter regression verifies valid client navigation, no brief exposure of a stored different client during load, and no fallback for a forbidden client URL. This was a failure surfaced by the change; successful focused repairs do not replace the pending complete frontend gate.

Independent finite source review verified fixes for missing forecast scope/version proof, conflicting baseline fallback, refresh preference retention, stale new-client navigation callbacks, ISO drill mismatch and unavailable count presentation. Normal GET paths do not write source/history; committed capture retains recovery envelopes after derived failure; read scope does not grant writes; legacy identity migration preserves actual gap events and stored proof. Named assessment receipts supply Last activity while failed/cancelled/uncommitted/no-op receipts and ineligible Demo proofs are excluded. The CMMC caller check found no zero/empty-scope fallback on normal dashboard/workspace/Portfolio routes. These are bounded source-review conclusions, not whole-application security or compliance assurance.

Compact public history retains counts, scope/version/revision identity, real effective/captured/event dates and continuity proof while omitting repeated catalog/reference arrays; complete provenance remains in storage. Backend/preview size fixtures pass their bounds of <2,200 JSON characters per modeled point and <5,242,880 JSON characters for 20 programs with 90 points. Exact Demo scope vectors are interned within the atomic native save; legacy GET normalization changes no storage or scope events. These modeled serialized lengths are separate from persisted-store quota and measured production/browser latency.

Actual sequential ISO saves exposed a separate persisted-store boundary that the constant-scope, in-memory public-response test did not exercise. Before the correction, storage failed at 40 snapshots / 19 scope events with 5,075,479 code units. The existing JSDOM limit is 5,000,000 code units, including storage keys; these are string lengths, not byte counts. Lossless serialization now shares exact scope and source-reference vectors while each observation retains its own counts, versions, dates, IDs and continuity proof; read hydration supplies independent historical copies without writing or fabricating scope changes. Native records and their histories do not enter the pool.

At the same 40/19 prefix, the corrected store measured 3,593,673 code units; its native portion was 2,812 code units larger from further guided progress, so this is not a byte-identical-input compression ratio. All 25 Annex guided/native commits then completed at 4,280,034 code units, retaining 55 global snapshots (51 for the synthetic program) and 26 genuine scope events (initial enrollment plus 25 SoA changes). Full source vectors remain lossless in storage; no points were dropped and no quota was raised. This bounded regression establishes that workflow's persistence headroom, not unlimited browser storage capacity.

Additional actual local browser evidence: the frozen native Dunder dashboard at `/dashboard?client_id=demo_dunder` shows 94/120 implemented, 117/120 assessed, 94/19/4/3 status buckets, 2 excluded and 78.3%; the other three native pages match the reconciliation table. Ctrl K focuses search, My Account opens the existing page, and light theme persists across reload; the observed tab reported no console errors. Pointer and Home/Right/End select genuine saved chart states. Physical touch and browser backdrop input remain unverified, with touch/backdrop behavior covered only by automated DOM tests.

## Cleanup and release boundary

The only created browser client, `Portfolio QA Future 20261013` (`clients_demo_mv7aasow_tczy13bo`), was archived through native Client Management. Its disposable history remains retained; it is absent from active Portfolio/sidebar results. All four original Demo clients retain their original implementation, assessed, scope, lead and activity values. The real-Mongo wrapper's successful cleanup callback targeted only its fresh UUID database. No shared logout, account/grant/security change or original Demo posture write was performed.

The optimized `010861c` Demo build passed locally and was loaded from the existing loopback QA origin, preserving its prior session. Restoring only that disposable client retained its original three observations and added a genuine enrollment-gap/restore observation. Native ISO Implemented and Partial saves added two further positions, survived reload, and reconciled 1/31 (3.2%) then 0/31 (0%, still one assessed). All six real positions retained their historical 30/31 denominators. The client was archived again through the native recoverable flow; the four original active clients/programs and values remained unchanged, with no observed console errors. This is compiled local persistence evidence, separate from hosted backend durability.

Final new-head CI, complete frontend success, new-release hosted verification and deployment were pending at this documentation receipt. The latest pull request is the authoritative location for final validation and delivery receipts, including any results that supersede this interim status. Standard hosted Dunder was not authorized, and production acceptance is not claimed. The independent QA specialist performed no browser, staging, shared-session, account or deployment operations; the integration owner owns those receipts.

The isolated combined candidate integrates Portfolio freeze `badda5eb93aefa0403288ed1a68daa9fe168f2a5` with Program freeze `92821cdb4be9246fb3a6a89e495db8514c437769` (runtime `19bb8bd5bd84ac30a958e62ec9db19235f51bb09`) against the complete `3e43ce3b9385e860d32c0bba998468f0dcee3507` baseline. Both source branches remain intact. The sole textual conflict, `inlineAssessment.test.js`, keeps one fixed UTC clock, current optional-question handling and the exact supported/absent-controls assertions; canonical native counts and Work/replay/CAS additions are retained together. Programme authored review and bounded browser evidence are recorded in `docs/program-workflow-corrections/acceptance.md`, with licensed ISO source limits stated there.

Combined verification must repeat native metrics, source Work refresh/CAS, read purity/export auditing and the actual ISO-v2 catalog/storage workflow; the earlier ISO-v1 quota measurement cannot establish its merged footprint. Exact combined complete frontend/backend/Mongo gates, authenticated and Demo builds, retained-session browser reconciliation and hosted revision checks remain required at this merge receipt. No main merge, production/Sites release, new hosting/provider configuration, account/grant change or held authentication campaign is authorized.

Finite combined evidence on application source `5f0dfd1`: seven UI/inline/context/real-adapter remediation suites passed 202 tests in 64.159s; five native backend/Work/unknown/replay/CAS suites passed 58 tests and 627 subtests in 57.34s. These do not replace the complete release gate. The first three-suite catalog/storage run passed 76 tests and failed only the old storage fixture's optional additional-work Yes without its required description. Aligning that positive fixture with the current ISO catalog's optional No answer preserved every native write/history/count/quota assertion. The complete rerun passed 77 tests with no skips in 174.992s, including all 123 current ISO-v2 definitions and all 28 unchanged CIS guided cases.

The actual ISO-v2 25-save case completed in 13.887s at 4,287,684 stored code units under the unchanged 5,000,000 quota. It retained 55 global observations and 26 scope events, including 51 observations for its synthetic program, 25 implemented / 55 applicable and exact native history/text. These are newly measured version-2 results. Original failing receipts are retained; neither validation nor the quota or test budget was weakened.

Earlier Program CI169 exposed a separate inventory clock fixture returning October 14 where its recorded local-day assertions required October 13; the inline clock failure was already resolved in the merge. Installed Jest 27.5.1 `jest-runtime/build/index.js` 2163-2170 ignores the object `now` argument to `useFakeTimers`; `@jest/fake-timers/build/modernFakeTimers.js` 120-145 installs the real current clock unless `setSystemTime` explicitly pins it. Controlled installed-runtime probes confirmed both behaviors. Test-only clock corrections preserve all local-day, future-date and Risk assertions: five coupled inventory/inline/context/evaluation-date suites passed 198 tests in 3.747s, all four Risk cases passed in 2.981s, and the entire current comprehensive CIS suite passed 615 tests in 42.466s with its intended October 10 clock. No application date logic, timezone, expected result or gate change is involved. Final complete combined CI and hosted receipts remain pending and belong in the latest combined pull request.
# Final portfolio polish — 15 October 2026

This section records the new candidate and does not relabel earlier release evidence.
Owner branch: `codex/portfolio-final-polish-20261015`. Integration base:
`f9af4fdad69643cecb5628f2deaab16bde37efec`, descending from PR81's `b12e507`.
The Demo-only Brawndo CIS v8.1 IG1 Security Domains gate is inherited unchanged.

The supplied final HTML matches its ZIP reference byte for byte and all eight
package SHA256 entries passed. It is a fixture-based design reference; neither its
client names nor its fixed clock/history are copied into native records. A separate
standalone polished HTML is available for design review, not production hosting.

Native changes reach ClientDirectory, the existing history dialog and shared
portfolio presentation helpers, view preferences, platform sidebar/Layout, the
backend reporting projection and the corresponding isolated Demo projection.
Normal sign-in and Explore demo share the components and existing canonical
metrics/save/refresh paths. Assessment writers, tenant authorization, concurrency
controls, forecast eligibility, native program configuration and history persistence
are retained. No dependency manifest or lockfile changes are required.

The portfolio has six visible sorts, four dialog periods (1/3/6/12 calendar months),
a six-month default, current implementation followed by interactive four-status
breakdown, selected-period change, estimated-completion timeline, history and View
data. The sidebar lists distinct active client IDs and keeps assignment filtering
in the portfolio. Mobile rows reflow into cards. Non-chart branding/theme tokens
remain native; chart colors follow the supplied light/dark palette.

Implementation remains implemented/applicable, with no partial or verification
credit. Changes use percentage points and original denominators. Grouped numeric
sorts use the highest visible program for descending sorts and lowest visible
program for ascending sorts; they never average frameworks. Unknown numeric values
follow known values. Old saved activity/change sort keys migrate to current options.

The existing UTC calendar clamping, rolling 90-day forecast fit, genuine daily
observations, scope/freshness/current-state checks and five-year horizon policy
remain authoritative. The timeline derives from the calculated date; it adds no
statistical confidence claim or invented uncertainty interval. A complete program
and zero applicable scope remain distinct from an unavailable forecast.

Saved-state steps and area fills are drawn only across proven continuity. Sparse
observations retain discrete markers; absent history stays absent. An evidenced
carried baseline retains its original saved timestamp and is not counted as another
save. Current-matching endpoints and a fixed 0–100% history axis retain the reference
hierarchy. An open exact-program chart remains mounted during revalidation.

Scope additions/removals derive from each stored transition's actual applicability
membership. Same-time transitions are associated with their actual saved position,
not timestamp alone. Native and Demo responses expose added/removed IDs only within
the existing authorized program history response. When membership evidence is absent,
the UI reports only recorded before/after totals and implementation counts. These
facts cannot establish that a percentage loss was solely denominator-driven.

Migration/rollback: no stored-history rewrite, schema replacement, fixture seeding,
retention change or data deletion. New projection fields are additive. Revert this
candidate's code commit to restore the inherited UI without reverting or destroying
native saved records/history. Do not roll back to a writer incompatible with existing
records or deploy a source older than the inherited pilot removal.

Verification receipt on runtime commit `cdbdf2f309c9d3de71ad71498015b241370db784`:
141 focused frontend tests passed across seven suites; 83 focused native backend
tests plus 16 subtests passed. The final sparkline marker fix passed all 19 dialog
tests. Frozen-source standard-sign-in and Demo builds both compiled successfully.
The complete frontend suite is still running and is not recorded as passing.
An independent AI source review identified issues that were corrected; this is not
human approval.

The actual local native Explore a demo flow was exercised at desktop and 390px
mobile width in light/dark themes. All four history periods, default six months,
current canonical counts, unavailable-history/forecast messages and View data
were checked. Mobile portfolio and dialog measured no horizontal overflow.
Evidence screenshots are retained with the delivery artifacts. This does not
verify authenticated hosted sessions, browser save/reload or customer data.
The standalone file URL was blocked by browser policy; that restriction was
respected. Native application preview used the documented development server.

Delivery state: pushed draft PR83, stacked on the inherited pilot branch; runtime
commit above. No merge, staging deployment, production/Sites publication,
account/grant/credential change or Security Domains expansion. No hosted customer
record was written. Existing required CI/Mongo gates must pass on the delivered
head before release readiness. The workflow does not automatically trigger for
this stacked base and the available connector cannot dispatch it; an authorized
operator must dispatch Release Verification on the candidate branch and record
its exact SHA. Shared staging authority remains coordinated through the parent
hub. Next: finish complete-suite verification, dispatch exact-head CI, then perform
authorized hosted acceptance before any release claim.
