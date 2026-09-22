# Phase 6: framework operational clarity and Calendar

## Framework inventory and summary architecture

The before-change inventory is in [phase6-inspection.md](phase6-inspection.md). Previously, Dashboard framework cards always described future tracking even when CIS assessments existed. Applicability already came from finalized client requirements, not title matching or all catalog entries.

| Program inspected | Implemented capability | Dashboard behavior now |
| --- | --- | --- |
| CIS Controls v8.1 IG1 | 56 safeguard definitions, intentionally initialized client assessments, mapped Reviews, implementation/history and related records | Actual current assessment counts and separate open linked work counts |
| HIPAA | Configuration-only workspace | Clearly states detailed assessment/mapping is not implemented |
| NIST CSF 2.0 | Configuration-only workspace | Same truthful limitation |
| ISO/IEC 27001 | Configuration-only workspace | Same truthful limitation |
| CMMC | Configuration-only workspace; no distinct operational Level 2 implementation found | Same truthful limitation |
| SOC 2 Type 2 | Configuration-only workspace | Same truthful limitation |

`GET /api/frameworks/summary?client_id=…` is a read-only, authorized client summary. `backend/framework_summary.py` uses existing assessment statuses and structured relationships. `frontend/src/preview/frameworkSummary.js` supplies the same contract for isolated Demo sessions. `loadClientDashboard` requests one summary for implemented applicable programs; `complianceProgress` centralizes its presentation contract. Existing organization metrics are unchanged.

### Counts, navigation and assessment versus remediation

- CIS counts: total assessment records, **Not Assessed, In Progress, Addressed, Needs Attention, Not Applicable**. Unexpected legacy states are counted separately and surfaced, not converted to Addressed. Missing records are not initialized by reading the summary.
- No compliance/readiness percentage or denominator is introduced. `progress` and `denominator` remain null. N/A remains an explicit recorded count, not completion credit. There is no certification or audit-readiness claim.
- Open Findings and Open Corrective Actions are separately deduplicated by authoritative record identity. Direct assessment links, mapped Reviews, their Findings and related Actions follow the existing relationship model. An Action completing does not close its Finding or change an assessment. Evidence does not automatically address an assessment.
- Only finalized **Applies** programs appear. Unsure is not Applies. No-program clients have no fake cards. Removing applicability hides the card while retaining assessment history.
- Cards open existing client-specific framework routes. Framework Dashboard views reuse the same truthful summaries, not substituted organization totals or duplicate assessment pages.
- Browser fixture: 56 records initially Not Assessed; controlled state distribution **50 / 3 / 2 / 0 / 1** in the status order above. A real CIS drawer edit changed it to **49 / 4 / 2 / 0 / 1** on Dashboard. The framework workspace displayed matching counts. These are test observations, not hardcoded product values.

## Calendar architecture and behavior

The existing monthly, six-week operational Calendar and source modules remain. It aggregates due-dated Reviews, Findings and Action Items. Vendor, Policy, Risk and other recurring obligations remain authoritative Reviews where configured; no parallel scheduling engine or duplicate events were added.

`backend/calendar_view.py` now returns minimal, bounded event projections. `frontend/src/lib/calendarView.js` defines shared Demo projection/status/selection/date-move helpers. The existing Calendar renders these records and opens the existing drawers.

| Scope | Meaning |
| --- | --- |
| Active (page and API default) | Non-terminal current obligations only |
| Completed / Closed | Completed/cancelled Reviews and Actions; closed/accepted Findings; recorded terminal Review occurrence snapshots |
| All | Both, deduplicated using record and occurrence identity |

The history scope explicitly explains cancelled work and accepted Findings. This does not change any source lifecycle values. Action `done` displays **Completed**, Finding `remediated` displays **Pending Validation** and remains active. Chips say **Action Item**, not Task. Status is visible text, wraps rather than being clipped, and terminal items use neutral surfaces without drag affordances. Overflow days have an operable “more” control.

### Authoritative opening and recurrence

Every chip fetches the current authorized source record. A historical Review chip passes the exact recorded occurrence to the existing frozen historical drawer. Stable record/occurrence keys prevent duplication of a completed one-time Review and its snapshot. Q3 history and the next Q4 occurrence stay distinct. Due dates are preserved; completion timestamps are not substituted. Reading the Calendar never advances recurrence or writes records.

### Rescheduling

Only eligible active items advertise dragging. Review schedule changes retain existing administrator requirements. Vendor contract-controlled Reviews and terminal items are not draggable. The existing drawer is the non-drag date-edit alternative.

A drop re-reads the authorized source record, checks client, current status and Review occurrence, then uses the existing update endpoint and occurrence guard. Stale completed/advanced chips are rejected. Moving a date retains the original time/offset suffix. General authorized source-record editing rules are not rewritten: this phase does **not** introduce a global prohibition on all historical Action/Finding date corrections or new lifecycle concurrency guarantees.

## Performance and data integrity

- One Dashboard summary request, not one request per safeguard. Related IDs are batched in server queries, with minimal projections and no user-directory or Evidence-content payloads.
- Framework collections are bounded at 20,000 records per projected query; oversized results fail explicitly, not with partial totals.
- Calendar requests a 42-day visible grid; the API accepts up to 367 inclusive days. Each source kind and historical occurrence result is capped at 5,000, with explicit errors above the cap. The backend filters/projects embedded history in Mongo before returning it.
- Date-only start/end boundaries include the entire last scheduled date. Full timestamp/offset values remain intact in events and rescheduling.
- Client changes abort/discard stale loads and close old drawers. Responses and authoritative record opens are checked against the selected client. Embedded foreign-client occurrence snapshots are excluded.
- No new dependencies, database migrations, seed changes, derived operational records, caching or performance benchmark claims.

## Automated-test verified

| Check | Result |
| --- | --- |
| Full frontend `CI=true craco test --watch=false --runInBand` | **55 suites / 312 tests passed** |
| Backend isolated unittest regression run | **181 test executions passed**, including 8 new Phase 6 cases; imported harness tests are included in that count |
| Additional `backend.tests.test_client_management` run | **3 passed / 1 failed**; identical failure reproduced on unchanged baseline `7d453aacbbd8da8356b95558f541412e90e37d4f` |
| `node frontend/scripts/preview.cjs build` | Passed; build ESLint has only the two existing exhaustive-deps warnings in ClientDirectory:189 and PlatformAdmin:52 |
| Changed Python files `py_compile`; `git diff --check` | Passed |
| Separate TypeScript/lint scripts | Not configured in this JS/JSX project; build-integrated ESLint ran. No standalone type-check claim |

Backend command: `PYTHONPATH=backend/tests python -m unittest test_phase6_visibility test_onboarding_handoff test_identity_lifecycle test_client_relationships test_assignment_eligibility test_client_dashboard_sources test_core_audit test_action_items test_evidence_context test_framework_governance test_seed_account_settings test_standard_initialization test_ai_governance test_governance_integrity test_management_obligations test_onboarding_baseline test_review_lifecycle test_review_occurrences test_risk_ids test_risk_lifecycle test_vendor_governance test_people_visibility -q`.

The additional client-management failure is `test_internal_roles_can_create_edit_archive_restore`: expected creation success, received 422. Its platform-user fixture omits authoritative active account state; existing GRC Lead validation requires an active eligible internal User. Neither the test nor that unrelated eligibility rule was changed in Phase 6. The same assertion fails in a clean detached baseline checkout. Historical tests targeting an older external development service were not run against an uncertain persistent dataset.

New tests cover status distributions and subsequent edits, N/A/unrecognized/missing data, applicability removal, separately linked remediation/Evidence, tenant and unauthenticated denial, minimal read payloads, no summary initialization, due-date boundaries, active/history/default scopes, completed Action and closed Finding workflows, recurring and one-time occurrences, role and contract restrictions, stale-drop rejection, offset-preserving moves, delayed client responses, explicit failures/retry and over-cap failure. One existing Review regression assertion now checks `occurrence_id` in the new minimal event contract instead of the old `current_occurrence_id` field; it still verifies the exact current authoritative occurrence and excludes old history by default.

## Demo-browser verified

Headless Microsoft Edge/Playwright exercised the **production build** on localhost, using fresh isolated Demo sessions. Initial state-distribution and Calendar fixtures were confined to a disposable test client; subsequent assessment edits, completion, validation and rescheduling used actual UI controls. No standard workspace or real customer data was used.

| Scenario | Result |
| --- | --- |
| Actual onboarding, finalized CIS/SOC applicability and Unsure ISO | Passed; 56 real initialized CIS records, no ISO card |
| CIS Dashboard/workspace counts and real status edit | Passed; 50/3/2/0/1 to 49/4/2/0/1; exact client route |
| Open linked Action completion, Finding pending validation, then validation | Passed; counts 1/1 to 1/0 to 0/0; Addressed stayed 2 |
| Calendar Review Q3 completion, Q4 opening and drag to another date | Passed; frozen Q3 due date preserved, separate live Q4 occurrence |
| Completed Action and closed Finding | Passed; excluded from Active, retained/openable in history, no drag, source status survives refresh |
| Mature Cyberdyne plus all five canonical clients | Dashboard/Calendar load; isolated QA records do not leak into them |
| No-program and multiple-program clients; removed CIS | Passed in Phase 5/6 browser flows; retained assessment history |
| Widths 1440, 1280, 1024 and 768 | No outer-page horizontal overflow on Dashboard/Calendar; existing local Calendar scrolling retained |
| Keyboard/Escape and existing drawers | Escape closes historical Review; Phase 4B selector keyboard/focus regression passed |
| Blank login, disabled standard sign-in, Explore Demo/logout | Passed; standard authentication remains intentionally deferred |

The focused Phase 6 browser run captured **no page errors or console errors**. Phase 4B assignment, Phase 4D identity, and Phase 5 onboarding browser scripts were also rerun against the final build and passed with empty captured page-error lists. Their coverage includes Contact/User separation, client/internal/foreign/disabled candidates, current/historical owners, simulated identity actions, existing assignment saves, onboarding/handoff and program evolution.

Surrounding route smoke checks include Reviews, standalone Findings, Actions, Risks, Policies, Vendors, Contacts & Roles, Evidence, Onboarding, Client Settings, SOC 2 placeholder, Client Management and Users. Existing automated suites cover Phase 1 metrics, Phase 2 remediation grouping and Phase 3 Evidence relationships. This is not an exhaustive browser execution of every action in every module.

## UI review

The better-ui and emil-design-eng skills guided restrained readability and interaction refinements using the approved light workspace, charcoal sidebar, existing semantic tokens, typography, controls and drawer pattern. No application redesign, new palette or animation was introduced.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | frontend/src/components/DashboardManagement.jsx:24 | CIS appeared to have only future tracking | Real status counts, separate remediation, existing framework link | Explain current authoritative work without a score |
| Medium | frontend/src/pages/Calendar.jsx:92 | Terminal and active work mixed with no scope control | Compact Active / Completed / Closed / All choices | Distinguish planning from history |
| Medium | frontend/src/pages/Calendar.jsx:115 | Status absent; all writable chips advertised dragging | Explicit wrapping status, neutral terminal treatment, eligible drag only | Avoid misleading outstanding-work presentation |
| Medium | frontend/src/pages/Calendar.jsx:47 | Review opens could select the wrong execution | Exact recorded occurrence in existing drawer | Preserve historical context |
| Low | frontend/src/pages/Calendar.jsx:121 | More entries were hidden behind non-interactive text | Keyboard-operable day expansion | Keep all contributing records reachable |

**Review disposition: Approve the inspected changes.** Dashboard and Calendar screenshots were visually inspected. Native controls, text alternatives, focus rings and existing drawers are retained. A full screen-reader/contrast audit, whole-application WCAG conformance and slow-motion animation review were not performed. No new animation was added. Applicable W3C/OWASP guidance is identified in the inspection document.

## Authorization, scope and limitations

**Authorization verified in automated API tests:** existing authenticated FastAPI routes with isolated in-memory Mongo substitutes enforce client access. Client-only requests for another tenant fail; unauthenticated framework summaries fail. Calendar respects existing write roles without granting new permissions. Demo has explicit client guards and is isolated from standard data.

**NOT VERIFIED:** persistent Mongo deployment, authenticated frontend-to-persistent-backend browser workflows, production latency/load and independent security review. The static published frontend remains Demo-only; backend source is preserved for later staging deployment. Passing in-memory API tests does not establish live authentication or persistent-data QA.

Deliberately unchanged: framework requirements/mappings and lifecycle semantics, core Reviews/Findings/Actions workflows, recurrence engine, Risk scoring, Vendor/Policy semantics, People/assignment/approval authority, memberships, authentication, RBAC, Phase 1 metrics, Evidence, onboarding generation and canonical Demo seeds. No data migration or initialization is needed. Existing non-demo data was not accessed or modified.

No unresolved product decision blocks these counts and Calendar scopes. Compliance scoring methodology, additional operational framework implementations, trend analytics, very-large-client pagination and any new terminal-record editing policy remain future decisions, not silently implemented behavior.

The final diff and targeted added-line secret-pattern scan found no introduced credentials, tokens, environment files/values, dependencies, generated builds or debugging fixtures in Git. Browser scripts/screenshots, the baseline reproduction checkout and publishing archive remain outside the tracked source. This is scoped self-review, not independent assurance.

## Tested artifact and release tracking

Final browser-tested build: `main.f5ab7890.js`, `main.39b4b368.css`.

- JavaScript SHA-256: `4f8b684c0c22159a3052b8eb3d81bf593551dbfe570e7c0f93cbdb0250dd4638`
- CSS SHA-256: `24c520d61d7ba7ed7e32c09d829f6006e2f295419e77eb037179342415d84cbe`
- index.html SHA-256: `e1276741dd4b0f017931ade5731dd91ef8ee54ae4bacf255ab76f92d7ae61214`

GitHub and Sites retain their existing separate histories; publication must use matching source trees, without force updates. The final handoff records the confirmed GitHub commit, Sites source commit/version and deployment result after release. This pre-release verification document alone is not a claim that publishing succeeded.
