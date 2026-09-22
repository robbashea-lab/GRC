# Operating-model validation — 2026-09-22

## Executive assessment and verification boundary

The exercised connected workflows passed in the isolated browser Demo and real FastAPI routes backed by an in-memory Mongo substitute. One reproduced date-validation defect was fixed. The five framework workspaces, shared remediation/evidence, recurring history, and explicit validation behaved coherently in these tests.

This is **not** a claim that every requested scenario has passed, that persistent staging is operational, or that framework substantive correctness has been validated. The full persistent frontend/backend lifecycle remains unverified: the tested preview intentionally disables standard authentication and uses session Demo data. Mongo restart durability, real multi-process concurrency, deployed authorization, and live-service failure recovery cannot be established with the available mock database. No existing development or production database was contacted.

The pending visual candidate was already dirty when this task began. It remains separate, unapproved and excluded from this task's commit. No visual redesign, schema migration, dependency, permission or authentication change was made.

## Architecture and authoritative records

| Record | Authority and relationships |
|---|---|
| Client | `clients`; all operational relationships are client-scoped |
| Contact / User | Separate `contacts` and `users`; business responsibility is not authorization |
| Policy | `policies`; version-bound approval history and document subject; linked Reviews project review dates without approving the document |
| Review | `reviews`; one current obligation plus immutable completed `occurrences`; evidence, comments, Findings and Actions preserve occurrence IDs |
| Finding | `findings`; deficiency and validation decision, not a duplicate work queue |
| Action Item | `tasks`; remediation work; completion moves an eligible Finding to pending validation, not automatically closed |
| Risk | `risks`; assessment, treatment and acceptance remain distinct from Review completion |
| Vendor | `vendors`; primary, assurance and contract Reviews have distinct purposes; retirement retains history |
| Evidence | `evidence`; one artifact may support multiple assessment links; original occurrence/document provenance remains |
| Framework requirement | Versioned catalog definition; not a client-owned work ticket |
| Framework assessment | `framework_assessments`; per-client/per-version/per-definition status, narrative, ownership, links and assessment history |
| Calendar | Read-only projection of authoritative current records and occurrence snapshots; GET does not advance recurrence |

Inspected implementations include `server.py`, `review_occurrences.py`, `calendar_view.py`, `policy_reviews.py`, `framework_governance.py`, `framework_summary.py`, and the corresponding frontend scheduling, Calendar, management metrics and Demo modules.

Standard startup calls `initialize_standard`: indexes are retained, optional legacy normalization is explicitly gated, and account bootstrap uses `$setOnInsert`. It does not create fictional operational records or overwrite an existing account. The Demo adapter has separate session storage. These are code/test findings, not persistent staging verification.

## Test clients and scenarios

- **Operator QA:** created through Client Management; onboarded CIS/HIPAA/ISO/SOC, then NIST through Client Settings; 394 assessments and 23 shared Reviews. Each framework receives an assessment, Evidence, Finding and Action workflow.
- **Northstar Manufacturing:** created through UI with a Contact and internal lead; mixed Yes/No/Unsure policy responses, save/refresh, omissions, handoff, assignment, policy verification and later framework activation/removal.
- **Plain Program QA:** no frameworks, Reviews, Contact or lead; clean empty-state completion.
- **Core workflow QA:** UI-created Review, Finding/Action, Risk, Vendor and Policy; historical navigation and role-specific workflows.
- **Policy provenance QA:** UI-created Policy; external versions 1 and 2, uploaded version 3, exact hash and retained history.
- **API clients `a` / `b`:** fresh in-memory fixtures per test. Administrative, contributor, read-only, disabled and unrelated-client scenarios use real authorization routes.
- **Multi-year QA:** fresh session client per cadence; independent expected dates from January 2027 through January 2030.

Browser role fixtures modify only disposable Demo session identities. They are not evidence of trusted authorization. Backend authorization evidence comes from real FastAPI route tests with isolated persistence and generated test tokens.

## Results by workflow

| Scope | Actually exercised | Evidence |
|---|---|---|
| Onboarding | UI client creation, omission validation, tri-state responses, refresh/resume, exact 17-policy initialization, no Contact-created User, handoff counts and links, no-framework client | Browser; automated |
| Initialization | All five workspaces, 394 assessments, 23 shared Reviews; repeated reconciliation and late activation retain existing records | Browser; API |
| Reviews | Create, start, Notes, Evidence, comment, Finding, completion, next cadence, current versus historical Evidence, reverse source navigation | Browser; API; Demo tests |
| Policies | Review dates project without approval; three versioned approval subjects, uploaded SHA-256, prior history unchanged; pending/stale/cross-client decisions | Browser; API |
| Findings / Actions | One corrective Action; completion handoff; pending validation remains visible; explicit validation closes; historical source stays accessible; unrelated completion does not close a Finding | Browser; API; Demo tests |
| Risks | Intentional likelihood/impact, derived score, treatment Action, authoritative Review, reassessment/next date; Action completion does not close Risk; acceptance/closure/history and foreign owner rejection | Browser core; API; automated |
| Vendors | UI creation, generated Review, completion and next date; assurance/contract purposes, inactivity cancellation/history, evidence retention and scoped relationships | Browser core; API; automated |
| Evidence | Upload/download/unlink/relink, same artifact reused across five assessments, occurrence isolation, protected historical evidence, versioned approval subject | Browser; API |
| Contacts / people | Contact-only client creation does not create accounts; operational selector excludes Contact, accepts legitimate internal owner; scoped/disabled candidate and historical attribution tests | Browser onboarding; API; automated |
| Navigation | 18 framework/core routes, four desktop/tablet widths, deep links, refresh/back/forward, keyboard tabs, draft keep/discard | Browser |

No new invitation was sent and no real account, client membership or approval authority was changed.

## Framework results and cross-framework convergence

All five workspaces passed the browser sequence: source context, assessment narrative/status, Evidence upload/download/relink, Finding plus Action, remediation, separate validation, explicit assessment conclusion, history, Next/Previous, deep-link refresh, browser back/forward and keyboard navigation.

| Framework | Native behavior exercised |
|---|---|
| CIS IG1 | 56 assessments; progress independent from work completion; mapped/shared governance |
| NIST CSF 2.0 | Current assessment plus Target outcome/priority/gap; saved profile and gap view |
| HIPAA | Addressable decision required for addressed status; rationale retained; not automatically N/A |
| ISO 27001 | 93 Annex A items in SoA view; exclusion requires N/A and justification; native audit/management/treatment/correction views |
| SOC 2 | 33 default criteria; optional Availability expands to 36 and scope removal retains history; management control, observation period and missing-instance count |

**Convergence:** one actual Finding, its Action and one Evidence record were linked through all five framework UIs without increasing those record counts. A separate API scenario created one privileged-MFA gap and reused exactly one Finding/Action/Evidence set across five assessments, including duplicate link requests. Remediation and validation did not change any assessment from Not Assessed. No title-similarity merging or automatic equivalence was introduced.

Framework requirements remain separate. Shared links do not imply that a requirement is addressed, that all frameworks require the same implementation, or that an audit opinion has been obtained.

## Cadence audit

Catalog inspection covered all **47 configured review-plan definitions**, reconciled into **23 shared Reviews** when all five programs are selected. Classification below reports stored provenance only; it is not independent source validation.

| Plan(s) | Default | Classification / caveat |
|---|---|---|
| CIS asset-inventory | Semiannual | A — stored explicit-source claim; references 1.1; independently revalidate later |
| CIS software-support, vulnerability-remediation | Monthly | A — stored claims reference 2.2/2.3/12.1 and 7.2; distinguish operational patching from human review |
| CIS account-authorization | Quarterly | A — stored 5.1 claim; event-based 6.1/6.2 do not become separate recurring tickets |
| CIS data-governance, secure-configuration, audit-logging, data-recovery, awareness, provider-inventory, incident-governance | Annual | A plus stored event/operational context; exact provenance/content not independently verified |
| CIS endpoint-validation | Quarterly | D — explicitly Omnisciente recommended |
| NIST management-review, risk-assessment, vendor, policy-review, awareness, backup, incident-response | Annual | D — recommended mechanisms; stored text explicitly disclaims prescribed cadence |
| NIST user-access, vulnerability | Quarterly | D |
| HIPAA risk-assessment, awareness, incident-response, bcp-dr, vendor, policy-review, management-review | Annual | D default; stored text distinguishes underlying ongoing/periodic/event duty |
| HIPAA user-access | Quarterly | D |
| ISO internal-audit, management-review, risk-assessment, objective-review, soa-review, corrective-review, policy-review, vendor, awareness | Annual | D default; planning/control-operation obligation distinguished from numerical cadence |
| ISO user-access | Quarterly | D |
| SOC risk-assessment, vulnerability, vendor, backup, incident-response, policy-review, awareness | Annual | D default / C management control design |
| SOC user-access | Quarterly | D default / C management control design |

B (periodic duty without an exact interval), E (event-driven), F (continuous) and G (non-recurring/state) remain relevant requirement context; they were not converted into a recurring Review for every catalog requirement. Client-entered cadence is management configuration, not newly inferred regulation. Exact CIS cadence claims are **flagged for later substantive content validation**, not asserted as researched in this QA effort.

### Deactivation decision confirmed by the user

Framework removal changes applicability and active onboarding-driver state. Existing Reviews and their recurrence remain until an authorized user explicitly cancels or retires them. Historical mappings remain identifiable. Deactivation must not silently cancel shared or exclusively framework-originated work. A new API test verifies retained schedule/history, repeated deactivate/reactivate without duplication, later framework additions and continued completion after deactivation. No new cancellation policy was implemented.

## 36-month simulation

- Independent expected month-end dates: monthly (36), quarterly (12), semiannual (6), annual (3) completions in **both** FastAPI and Demo adapter tests.
- Every completion checks immutable snapshots, stable Review identity, distinct occurrence IDs and idempotent completion retry.
- Calendar windows show exactly one completed and one current occurrence without duplicate keys; stale occurrence edits are rejected by the API test.
- Separately, **all 23 shared framework governance Reviews** run through three years at their existing default cadences; histories, mappings and the original assessment documents remain intact.
- Risk and Vendor source records project three successive annual review dates without closing/disappearing; source Review counts remain one each.
- Clock substitution is test-local. No operating-system clock or persistent data was changed.

This is deterministic lifecycle simulation, not a three-year browser soak test or proof of database restart durability. Continuous concurrency, every user-configured custom interval, and all historical timezone formats are not exhaustively verified.

## Dashboard, Calendar and state propagation

Management metric source definitions inspected:

- Past Due: active authoritative obligations before the UTC management day; projected future recurrence is excluded.
- Due 30 / 31–90: inclusive day windows from the shared management model.
- Critical/High Findings: material active deficiencies, including pending validation; not their duplicate corrective Actions.
- Significant Risks: current scored active High/Critical Risks; acceptance does not mean closure.
- Unassigned: distinct authoritative work/Risks without an eligible stored ownership identity.
- Linked same-obligation remediation replaces the represented Finding deadline; different actionable deadlines are not arbitrarily merged.
- Framework summaries scope to applicable programs and selected SOC categories; counts and separate open linked-work totals are not compliance scores.
- Assessment coverage excludes N/A from its denominator; Not Assessed stays distinct. Evidence and completed remediation do not silently change assessment status.

Existing management fixture tests compare exact record identities across Dashboard/Portfolio routes; Calendar tests cover bounds, history, role permissions and source selection. The new leap-day fixture checks one represented remediation obligation rather than an inflated count, retains a pending-validation material Finding and excludes closed work.

The browser core flow confirms Policy Review completion does not approve a Policy, Risk treatment completion does not close a Risk, and Review completion does not close a Finding. Current and historical Review Evidence are separated. All intermediate Dashboard values for every three-year framework cycle were **not individually browser-asserted**.

## Authorization, failures and edge cases

Automated real-route coverage executed includes unrelated-client reads/writes, related navigation, Evidence linking, owner validation, read-only restrictions, contributor versus administrative actions, forged lifecycle/approval fields, disabled account eligibility, retained attribution, duplicate submit, stale occurrence, lock contention, and retry after an interrupted Risk projection.

Component tests execute failed framework context load and failed save, preserve the draft and reject a success-looking state. Browser tests exercise required inputs, invalid native framework decisions, draft keep/discard, empty setup, deep-link refresh, historical records and client switching. The initial core-run client-switch assertion failed because its scoped synthetic analyst could not access Cyberdyne; the fixture was corrected to use the legitimate Demo administrator and actual client navigation. No access rule was loosened.

Not verified end-to-end against a persistent service: real network loss during writes, database restart/recovery, simultaneous browser tabs saving all record types, production token/cookie behavior, every archived-source combination, and every disabled-owner/browser selector combination. Automated tests are not independent security assurance.

## Defects and intentionally deferred work

| ID | Severity | Root cause / resolution |
|---|---|---|
| OM-01 | P2 data integrity | Demo framework Review configuration checked date shape only. Impossible dates could be accepted and JavaScript could roll them into another month. Reproduced with a failing regression; reused existing strict `calendarDay` validation. Non-leap Feb 29, Feb 30, Apr 31 and month 13 now reject; valid leap day remains accepted. Backend already rejects these dates. |

The new validator runs before baseline reconciliation. This changes input validation only, not cadence, permissions or existing stored data. Invalid historical records, if present, are not silently migrated.

No other reproduced application defect remains unresolved within the executed scenarios. Older browser harness assumptions were updated to current labels (Assessment, requirement assessments), current SOC initialization count, current build identification and valid client scope; assertions were not weakened to accept incorrect application state.

Enhancements intentionally not implemented: automatic cross-framework issue merging, automatic framework-driven Review cancellation, universal draft persistence, extra dashboards/trends, new framework content, automatic evidence-to-status decisions, a new reporting or working-paper system. Detailed framework content/provenance validation remains a separate project. The pending visual candidate was not propagated or published.

## Reproducible checks and release status

- Frontend: CRACO Jest `test --watch=false --runInBand` — **383 tests / 72 suites passed**, including pending visual-candidate tests already in the working tree.
- New backend operating-model suite: **5 tests passed**; real FastAPI transport with fresh in-memory Mongo per test.
- Full isolated backend suite: **204 tests / 33 modules passed**; legacy external-service suites are excluded deliberately, not reported passed.
- Separate Client Management route suite: **2 passed**.
- Targeted CRA ESLint: changed Demo module and new test file — no errors/warnings.
- Node syntax checks: four browser runners — passed.
- Production build: passed; pre-existing `PlatformAdmin.jsx:52` missing `load` dependency warning remains.
- No TypeScript check is configured for this JavaScript project.
- `git diff --check`: passed; no new dependency or schema change.

Browser runners require the existing verification environment's Playwright and Chromium/Edge. Set `QA_BASE_URL` for framework/onboarding/policy, `CORE_QA_URL` for core; only loopback targets are accepted. `QA_ARTIFACTS` optionally stores diagnostic screenshots outside Git. Each creates disposable Demo state, never real operational records.

Validated local builds:

1. Approved baseline at `http://127.0.0.1:4174`, JS `main.b7f7d214.js`.
2. Current working-copy validation build at `http://127.0.0.1:4181`, JS `main.dde3d51a.js`, SHA-256 `532c3a6c888188eb367c0a09f6513c60ffb2eea65fedf7875f2a533c37eae4f8`.

The second includes the pre-existing **unapproved visual candidate** as well as OM-01; it is a local validation artifact, not a release. The runtime change in this task is limited to the framework Demo date validator. The commit intentionally excludes all visual-candidate files. No publication was attempted or claimed; the private hosted preview was not updated by this task.

Files in this task: this report; `backend/tests/test_operating_model.py`; `frontend/src/preview/operatingModel.test.js`; `frontend/src/preview/frameworks.js`; updated `frontend/scripts/qa/framework-operator.cjs`; new `operating-core.cjs`, `operating-onboarding.cjs`, `operating-policy.cjs` in that QA directory. Commit identity is supplied in the handoff rather than embedded recursively in this file.

## Remaining completion gate

Full durable end-to-end operating-model sign-off requires a configured persistent staging backend/database and a frontend actually connected to it. Restore/provision that separately authorized environment, rerun the connected lifecycle and role/isolation tests there, then test restart durability and live failure paths. Until then, this report provides Demo-browser, isolated API, automated and code-inspection evidence only; the entire requested program must not be represented as completely verified.
