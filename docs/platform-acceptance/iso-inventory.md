# ISO functional acceptance inventory

This preserves the initial **read-only source/test/handoff inventory** and adds
the separately assigned bounded real-Mongo execution below. It is not full
platform acceptance, a standards-content rewrite or a release decision.

## Ownership and baseline

- Assigned worktree: `C:/Users/RobbA/Documents/Codex/2026-10-11/platform-acceptance/iso`.
- Branch: `codex/acceptance-iso-20261011`; verified starting HEAD
  `28b806716024ec149af2ec5da621a5a618c669d5`, initially clean.
- Initial owned artifacts: this file and `iso-inventory.json`. No runtime/shared
  component, account, fixture, CPU/test process, browser or provider reservation.
- Agent 1 is the integration, staging and shared authenticated-browser owner.
  The root's receipt identifies staging deployment `dep-db5v96navr4c73a6tmv0` at
  this main SHA; no new provider/browser observation is made here.
- The new full-platform mandate and current code supersede historical reports.
  Historical passing results are context, not current-commit execution evidence.
- Complete presentation, visible/static copy, question and guidance freeze.
  No interface/content/score/status-model changes are authorized by this phase.
  Matching-viewport/role/fixture screenshots remain the coordinator's task before
  any later runtime repair; source fingerprints are not rendered visual proof.
- Preserve existing demonstration clients and intentionally empty Prestige.
  Root creates the five primary hosted QA clients and assigns authoritative IDs.
  No ISO tenant/account is created or modified by this specialist phase.

## Current static inventory

At this exact HEAD, `shared/catalogs/iso27001.json` has **123 unique requirements**:
30 mandatory ISMS units and 93 Annex A controls, partitioned 37 organizational,
8 people, 14 physical and 34 technological. The three guided catalogs register
`iso27001-omni-1`: exactly those 123 definitions and 611 uniquely identified
questions, with no missing/extra interview definitions. The JSON companion
enumerates every native ID and question/group/condition counts without copying
or modifying the questions. These are metadata observations, not test passes.

The four audit templates have 28/28/40/28 items: **124 unique item keys targeting
all 123 native definitions**. Clause 6.1.3 has separate `6-1-3` and `6-1-3-d-`
items in the governance-risk package; this is not a duplicate assessment.
Ten catalog Review proposals carry organization-approved recommended cadences
(nine annual, one quarterly), not ISO-mandated numeric frequencies. Persisted
Review counts depend on enabled configuration and shared-baseline driver reuse;
they must not be assumed from a catalog count alone.

## Authoritative workflow contracts to exercise

| Area | Current implementation and acceptance invariant | Source |
| --- | --- | --- |
| Activation | Explicit normal onboarding/profile configuration; `reconcile_catalog` inserts stable client/framework/definition IDs without rewriting saved records. GET is noninitializing; supported deselection/reactivation retains records. No client-name gate. | `backend/framework_governance.py`, `backend/framework_catalog.py`, `backend/routes/onboarding.py` |
| ISMS / SoA / Annex | Clauses reject whole-record N/A. All 93 Annex references remain available for necessity decisions. `soa_applicability` and justification are independent from implementation; SoA/Annex share one assessment ID. Changing inclusion/exclusion preserves stored text/status/history. | `backend/framework_governance.py`, `frontend/src/components/FrameworkDrawer.jsx` |
| Native save/history | Explicit PATCH with original `expected_last_assessed` (using last-saved fallback), tenant/CAS predicate and retained snapshots. Ownership-only changes are not automatically new implementation judgments. Process owner must be a same-client Contact. | `backend/framework_governance.py` |
| Omni | Per-user/client/assessment interview, versioned answers/progress and history, active-program gating, meaningful current-context fingerprint. Progress save does not apply implementation. Final explicit native save writes exact reviewed multiline text and separately derived native status. | `backend/iso_guided_assessment.py`, `backend/guided_assessment.py`, `frontend/src/components/IsoGuidedAssessor.jsx` |
| Draft/replacement protection | Native and unfinished linked-record drafts block summary application; changed answers/manual wording require existing review paths. Failure/cancellation retains drafts; success closes only after confirmation. Do not add another reconciliation screen. | `frontend/src/components/IsoGuidedAssessor.jsx`, `frontend/src/components/FrameworkDrawer.jsx` |
| Live write authorization | ISO write context rereads active actor, assignment, client/program and archive state before and inside the shared native/interview/SoA lease. Read-only/foreign/disabled/stale access must be tested using real approved identities separately. | `backend/iso_guided_assessment.py`, `backend/iso_guided_lease.py` |
| Lease/fault behavior | Private assessment/client identity; 120-second lease, 80-second driver CSOT, 90-second protected operation. Uncertain outcomes retain lease. No claim of a multi-document transaction or hard fencing after dispatch. | `backend/iso_guided_lease.py` |
| Evidence / related work | Existing authoritative Evidence, Risks, Policies, Vendors, Reviews, Findings and Actions; same-client links and unlink-not-delete behavior. No generated verification or automatic Finding/Action closure from the interview. | `backend/framework_governance.py`, `backend/evidence_context.py`, `backend/review_commands.py` |
| Risk treatment / additional controls | Link actual Risk and client-owned organizational Control records; preserve native and design histories. Completed SoA Review pins 93 Annex rows; non-Annex necessary controls are supported through existing Control/evidence supplements, not silently added to that snapshot. | `backend/tests/test_iso_work_packages.py`, `backend/iso_audit.py` |
| Internal audit | Explicit prospective scope, objectivity and eligible-auditor activation; four stable, staggered annual package Reviews preserve existing Reviews. Per-occurrence item progress/result/justification/evidence/finding/report gates; central closure pins methodology and artifact versions, resets only next cycle. | `backend/iso_audit.py`, `backend/server.py` |
| Management review | Normal central Review owns the schedule, recorded conclusion/minutes and linked Actions. Next-cycle edits must not rewrite completed notes/conclusion/evidence or complete resulting Actions automatically. | `frontend/src/components/IsoGovernanceReviews.jsx`, `backend/tests/test_iso_work_packages.py` |
| Corrective action | Shared Finding -> one/multiple Actions -> remediation -> independent validation/rejection/reopen; assessment conclusion remains independent. | `backend/review_commands.py`, `backend/tests/test_iso_framework.py`, `backend/tests/test_review_lifecycle.py` |
| Recurrence | Calendar-month steps for monthly/quarterly/semiannual/annual; saved day/month-end anchor; positive custom-day schedules. Late completion advances from scheduled occurrence, not completion day. One central document update pins history and advances; replay recovers the same completed occurrence. | `backend/review_occurrences.py`, `backend/server.py:complete_review` |
| Overview / leadership | Separate ISMS implementation, Annex inclusion/decision and included-control implementation denominators; deduplicated SoA/Annex gaps; excluded justified controls are not ordinary gaps. Audit lateness uses actual due dates, not incomplete quarters. | `frontend/src/lib/isoProgramMetrics.js`, `frontend/src/lib/isoGuidedProgram.js` |

**Current capability boundary:** native `verification` editing is supported only
for CIS/SOC by the capabilities gate; ISO guided saves cannot alter it. ISO audit
results are their own records. If acceptance requires a separate ISO-native
verification field/workflow beyond those supported records, classify it as a
capability/requirements question, not permission to add UI, reuse CIS semantics
or mark ISO verification passed. Historical September documentation linking
Annex exclusion to N/A does not describe the current independent decision model.

## Supported tests and evidence layers

The existing suites below were inventoried, not rerun by this assignment. The
new separate module's actual execution is recorded at the end. These existing
commands remain **prepared only**; the JSON records exact test paths/class
selectors. Direct class/node selections avoid inherited/imported duplication.

| Existing test source | What it can establish if executed | What it cannot establish |
| --- | --- | --- |
| `backend/tests/test_iso_staging.py` | Static 30/93 catalog/model/cadence provenance | Render staging, live persistence or implemented capability merely because a proposal schema lists it |
| `backend/tests/test_iso_guided_assessment.py::IsoGuidedTests` / `frontend/src/lib/isoGuidedAssessment.test.js` | All-ID evaluator/conditional/optional/outcome and selected parity contracts | Normative completeness, all 611 negative permutations, UI/native persistence; parity may skip without Node |
| `backend/tests/test_iso_guided_routes.py::IsoGuidedRoutes` | Actual handlers, all-123 positive native save/resume and selected auth/CAS/lineage/lease/failure cases with Mongo mocks | Real Mongo durability/driver cancellation, browser sessions or hosted restricted-user denial |
| `backend/tests/test_iso_framework.py::IsoTests` | Native checks, activation, SoA independence, related work and mocked tenant/read-only boundaries | Real restricted-role hosted coverage |
| `backend/tests/test_iso_work_packages.py::IsoWorkPackageTests` | Supporting intake not auto-implementation, risk/custom-control supplements, management-review immutable substance | Full custom SoA subsystem or hosted source completeness |
| `backend/tests/test_iso_audit_program.py::IsoAuditTests` | 124 item/123 target inventory, activation, item/result/report/Finding closure, five-cycle history and SoA snapshots | Ten-year all-package operation or real eligible-auditor hosted acceptance |
| `backend/tests/test_governance_lifecycle_contract.py::GovernanceLifecycleContractTests` and `test_review_lifecycle.py` | Shared anchors, replay, fail/retry, history and relationships using actual handlers/mocked storage | Real persistence, actual multi-user browser authentication or load capacity |
| `frontend/src/preview/isoGuidedAssessment.test.js`, `isoFramework.test.js`, `isoAudit.test.js`, `isoAssessmentSave.test.js` | Actual Demo adapter/store commands, full positive ID batches, history/relationships/defaults | FastAPI/Mongo/normal session/browser evidence |
| `IsoGuidedAssessor.test.jsx`, `IsoAssessment.test.jsx`, `IsoAuditWorkspace.test.jsx`, `IsoAuditGuide.test.jsx`, `IsoManagementReviewGuide.test.jsx`, `IsoGuidedProgram.test.jsx`, metrics/workspace tests | Existing component/draft/focus/proposal/callback behavior with stated doubles | All-123 real rendered caller-to-native-writer integration or hosted saving |
| `backend/tests/test_framework_three_year.py::FrameworkThreeYearTests` | Actual three-year service/Review/audit/history commands, synthetic Mongo actors; independent new CIS/SOC/ISO clients | Ten-year ISO acceptance, normal login/TLS, real-Mongo restart or unchanged live account privileges |
| `frontend/src/preview/frameworkFiveYear.test.js` | Existing three/five-year Demo lifecycle, real adapter commands and checkpoint exports | Ten years: source explicitly accepts only 3 or 5; no `YEARS=10` workaround |

Prepared backend invocation: `python -m pytest -c backend/pytest.ini -q -m
offline <explicit class selectors>`. Keep the registry and default two-worker
loadscope settings unchanged; documented `-n 0` is only a separately coordinated
runner diagnostic. Do not use `run_isolated.py` plus a path expecting a narrow
selection: the script already includes the entire test directory. Existing test
imports replace dotenv/Motor with isolated fixtures; use the coordinator's
approved offline guard and dependency environment, not an ambient database.

Prepared frontend invocation, from `frontend`: `node
node_modules/@craco/craco/dist/scripts/test.js --watchAll=false --runInBand
--no-cache --coverage=false --runTestsByPath <explicit paths>`. Reuse approved
installed dependencies; no install, helper server or build starts in this phase.

## Ten-year harness assessment and safe next step

`test_ten_year_operation.py` is a real-handler **CIS IG1-only** Brawndo-equivalent
Mongo-mock run. Its seed is 20260928, domain start 2026-09-28, configurable end
default 2036-09-29, weekly UTC 14:00 stepping with an inclusive loop, quarterly
checkpoints and reference-register reconciliation. It signs fixture JWTs using
real time, not normal browser sign-in. Reusing it unchanged is not an ISO pass.

The better ISO service seam is `test_framework_three_year.py`: it already invokes
normal onboarding, native assessment, SoA, four audit packages, Review start and
closure, Evidence, corrective action, Risk/Policy/Vendor work and year-end
reconciliation. Its range is hardcoded 2027-2029. The related Demo harness
supports only three/five years. Do not rewrite global shared timelines or replace
their assertions merely to label a ten-year run successful.

Root subsequently assigned the new five-framework ten-year engine to the shared
lifecycle owner, with fixed interval `[2027-01-01,2037-01-01)`. Do not duplicate
that engine. Agree its seed, independent oracle and date-only/scheduler versus
display time zones through that owner. The existing CIS interval is descriptive,
not a substitute for the assigned ISO schedule.
Patch only controlled domain clocks, adding ISO audit and relevant modules;
authentication clocks, TLS and host time stay unchanged. Lease wall time needs a
separate bounded concurrency/fault test, not an accidental ten-year jump.

Drive every due occurrence and annual theme through current service commands;
seed only starting data. Calculate expected dates/counts independently from the
production scheduler, using explicit approved anchor cases, not
`review_occurrences.schedule` as both implementation and oracle. Record expected
and actual occurrence IDs/counts, snapshots/evidence versions, duplicates,
orphans, drift, status reconciliation and year-boundary totals. Unsupported
missed/skipped/job catch-up behavior must be classified; do not invent it. Cover
month ends/leap days plus separately specified DST/user-zone boundaries,
retirement/reactivation and late completion. Mock results remain distinct from
real persistent-target restart/concurrency evidence and hosted user operation.

Existing `serve_lifecycle_qa.py` and `iso_work_packages_server.py` are loopback
Mongo-mock helpers that seed ephemeral personas; they are not persistent targets
and must not be launched as a substitute for root's hosted fixtures or approved
accounts. No account provisioning is implied by this inventory.

## Gaps and coordinated dependencies

| Item | Classification / minimum next action / owner |
| --- | --- |
| Current execution | All suites/hosted scenarios NOT EXECUTED in this phase. Coordinator assigns exact commands/CPU slots and primary ISO client ID; specialist executes only assigned isolated checks. |
| Ten-year ISO driver/oracle | Coverage/harness gap, not reproduced product failure. Shared lifecycle owner agrees ISO driver, interval, independent oracle and ledger; no runtime/harness edit owned yet. |
| Real persistence/fault/lease | Needs approved persistent synthetic target and controlled failure/parallel-access capability; Agent 1/environment and security owners coordinate. Mock-only tests do not close it. |
| Hosted audit/user tasks | Agent 1 needs an existing authorized eligible auditor and safe session. Root alone operates the five primary clients and shared browser; do not assign personnel or alter access to force acceptance. |
| Restricted/wrong-client/fresh auth | Agent 1/security owner need approved real restricted identities and human login/MFA. Prior blocked auth campaign is not rerouted/retried by this inventory. |
| Content assurance | Existing 12 supported represented units /111 unresolved complete normative bodies retained. No new content rewrite/research campaign. Report limitations using existing B1/B2 and 123-row coverage ledger. |
| ISO-native verification capability | Report-only requirement/capability distinction above; no new field/control/status interaction without separate scope. |
| Dunder / protected records | Historical Demo Dunder is not authenticated staging Dunder. Use root's new ISO QA client, not a replacement/copy/restore; permanent Prestige remains empty. |
| Visual/persona acceptance | Source freeze recorded; current matching screenshots and unaided four-persona hosted execution pending coordinator access. No visual conformance or role pass inferred. |

No new defect is asserted without reproduction. Runtime fixes, shared-file
reservations, heavy suites, commits/pushes or deployments require the next exact
ownership assignment. This inventory is the completed initial artifact phase,
not completion of the new full-platform acceptance mandate.

## Subsequent bounded test-authoring assignment

Root assigned `backend/tests/test_platform_iso_inventory.py` to this specialist:
new all-ID QA only, with independently justified applicability/status assertions
and clearly labelled serialization vectors. Approved real Mongo target is
loopback `127.0.0.1:58749`, database
`platform_acceptance_20261011_inventory_iso` namespace only (new UUID-suffixed
database per run, with only that owned database eligible for cleanup). No admin/global drop, process
control, application configuration change or hosted account authority follows.
Tests will retain ordinary backend auth/authorization with isolated modelled
subjects; they are not hosted password/cookie/TLS or restricted-session proof.
Root classifies this actual-Mongo-only module as `environment`; its separate
direct-unittest command receives an explicit validated Mongo URI, not a fake
HTTP `--environment-url`. Missing opt-in is NOT EXECUTED/Skip, never a storage
pass. Root owns suite registration and the explicit opt-in/CPU slot. Test authoring may
proceed, but heavy execution, actual database operations and any claim of passed
integration wait for that assignment. The root-approved shared ten-year engine
remains a separate workstream. No runtime repair is permitted until a genuine
red case is retained and exact file ownership is acknowledged.

## Executed bounded real-Mongo acceptance

After explicit coordinator CPU allocation, the seven new methods ran once and
passed: **7 tests, 0 failures/errors/skips, 176.172 seconds, exit 0**. No runtime
defect was reproduced and no product repair was made. Product source was
`28b806716024ec149af2ec5da621a5a618c669d5`; QA checkout HEAD was
`179d513aa93ed5119fa3a36d7b3b5090d0ae228f` plus the then-uncommitted frozen test
whose SHA-256 is `9cba91f74772d808bd1a59de1cd9cd2351e1a736f83012215691e374daf0c41f`.
The preceding commits changed only the owned inventory and root-authored suite
registry; no application/catalog/visual file changed.

Command: `python -m unittest -v
backend.tests.test_platform_iso_inventory.PlatformIsoInventoryTests`, using the
existing staging-compatible Python/Motor/PyMongo environment, explicit
`PLATFORM_ACCEPTANCE_MONGO_URL=mongodb://127.0.0.1:58749`, process-local test
environment and empty mail/admin seed settings. This does not change saved
application configuration. Normal handler auth/authorization were retained;
signed modelled actors are not real hosted password/cookie/TLS/MFA acceptance.

| Actual case | Recorded result | Boundary |
| --- | --- | --- |
| All native identities/defaults | 123 IDs, 30/93 split, empty interviews, repeat activation IDs/Reviews unchanged | Backend initialization, not unaided hosted onboarding or native UI placement |
| Progress / reviewed save / history | 123 definitions x four independently fixed status vectors = 492 explicit native text/status writes; exact Unicode/multiline rereads; stale-token 409; all 123 read from fresh Motor connections; histories 4 entries for 30 ISMS /5 for 93 Annex | Reviewed serialization/application-path vectors, not independently licensed content or exhaustive generated-summary/611-answer validation |
| Applicability | All 30 clause N/A/SoA-field rejections; all 93 undecided/rationale/inclusion/exclusion/re-inclusion cases, same native ID and retained implementation/history | No invented ISO exclusion interpretation; source gap stays open |
| Relationships / actual file | All 123 same-client links; 246 foreign Evidence/Review link rejections; actual content hash matched; unlink retained artifact | Real Mongo/API, not browser/file-link access after actual hosted account revocation |
| Modelled access | 123 read-only native denials, 123 progress denials, 123 wrong-client native reads, four unauthenticated protected-operation denials | Database-backed modelled JWT actors, not real hosted restricted-user/session proof |
| Conditional context | 21 reason-required gates; retained inactive No ignored; exact saved answers; interview-only/native unchanged | Selected gate vectors, not every negative combination or normative qualifier |
| Legacy / extra fields | Missing new `last_saved` uses original token fallback; actual earlier native-written history/notes retained; unauthorized extra guided field rejected without native change | One legacy shape and rejected write, not every historical import/edition |

Original untruncated log:
`C:/Users/RobbA/Documents/Codex/2026-10-11/platform-acceptance/iso-test-evidence/iso-real-mongo-first-9cba91f7.log`,
SHA-256 `5b8bbba01e72928804996d051d6d1ae41acd9b0330e4807e43a613c264f9f8e0`.
Expected denied/stale/invalid 403/409/422 responses are not suppressed or counted
as unexpected failures. Seven sanitized case markers were retained before cleanup.

All seven new UUID16 databases were cleaned by guarded, owned, database-scoped
commands; independent post-run scoped reads found zero remaining collections in
each. No shared/admin/global database operation or process control occurred.
A first postcheck shell-quoting error happened before connection; the corrected
read-only check succeeded. It was an evidence-tool wrapper error, not a product
failure or a rerun of the seven-method campaign. Before execution, QA-only URI/
name-limit/response-shape/HTTP-method assumptions were corrected by source review;
no original failing application result was hidden or reclassified as a pass.

The CPU/test/database slot is released. No full suite, build, browser/provider,
hosted account operation, protected-client write, merge, push or deployment was
performed. Independent non-author review/retest and integrated exact-candidate
checks remain coordinator-owned. The 111-source comparison, actual hosted
personas/fresh auth, real server/database restart, fault/concurrency/lease fencing,
ten-year ledger and rendered visual-freeze checks remain separate open items.
