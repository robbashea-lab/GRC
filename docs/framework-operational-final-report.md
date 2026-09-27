# CIS, ISO and SOC 2 operational validation — final engineering report

> Historical task report: deployment restrictions below applied to that task only.
> Current merge/publication authority is [GitHub main → ChatGPT preview](publishing-workflow.md).
> Railway is retired from the intended workflow; the one-time disconnection hold
> is tracked there, not a recurring release requirement.

Date: 2026-09-26. Scope: Brawndo CIS IG1, Dunder Mifflin ISO/IEC 27001,
Prestige Worldwide SOC 2 and isolated fresh-client lifecycle scenarios.

## A. Executive summary

The reviewed operating workflows pass the bounded local acceptance checks below.
The principal architectural correction is client-owned organizational Controls,
separate from SOC 2 criterion assessments. Migration is explicit, additive,
client-scoped and conflict-aware. A shared Control never transfers an assessment
conclusion to its mapped criteria.

The branch is ready for Robb's manual product review. This is not certification,
an independent penetration test, full licensed-text validation, or production
readiness. Full frontend and isolated backend tests and both optimized builds pass.

**Explicit release boundary:** Robb confirmed on 2026-09-26 that PR #6 must remain
unmerged and be made ready for review. Railway's Omnisciente API source is connected
to main and watches /backend/**; automatic deployment is not independently verified
disabled. The later instruction overrides autonomous merge. No Railway settings
were changed. Engineering, QA and branch publication finish independently.

## B. Sources, versions and limitations

[Public research log and licensed-source verification list](framework-public-source-baseline.md)
records each substantive concept, source tier, date, confidence and implementation
impact. Current public research was performed, not replaced by model recollection.

- CIS Controls v8.1 IG1: 56 publisher identifiers/titles compared; source references
  remain separate from Omnisciente guidance and cadence recommendations.
- ISO/IEC 27001:2022 + Amendment 1:2024: official metadata, ISO/IAF climate
  communiqué and legitimate standards-body preview; professional corroboration
  for operational clauses not exposed in the preview.
- SOC 2: 2017 TSC / revised 2022 points of focus; 2018 Description Criteria /
  revised 2022 guidance. AICPA public resources and professional corroboration.
  September 2026 AI TQA notice is supplemental, not a replacement control catalog.
- No licensed full-text comparison claimed. No pirated copies, fabricated citations,
  new mandatory artifact checklist, or invented numeric cadence.

Content result: CIS publicly verified for the bounded catalog/cadence comparison;
ISO/SOC operational concepts publicly verified or high-confidence corroborated;
detailed licensed wording/mappings retain manual verification recommendations.
Operational product results below are separate from content confidence.

## C. CIS completeness matrix

| Operating area | Result and evidence |
| --- | --- |
| Native safeguard model | 56 safeguards, grouped Controls; saved implementation conclusions remain independent |
| Verification | Stale/missing Evidence, missing/invalid assessment dates and Review-link-only support no longer imply verified implementation |
| Remediation | Actual browser Finding → Action completion → separate validation → closed Finding; assessment did not auto-pass |
| Recurrence | Existing Reviews and immutable occurrences reused; operational frequency is distinguished from human governance |
| Evidence | Original artifacts, occurrence links, attribution and explicit gaps retained |
| Five-year operation | 12 initial Reviews; 201 completed occurrences and Evidence artifacts through real Demo API transitions |
| Auditor navigation | Browser reached all nine Evidence pages and first-year occurrence; history remains inspectable |

## D. CIS changes and lifecycle results

Verified fixes: three verification-summary regression cases, encoded Demo route
parameters, stale Action completion summary and nested Finding refresh. No CIS
status model or saved client assessment was reset.

## E. ISO completeness matrix

| Operating area | Result and boundary |
| --- | --- |
| Context/scope/risks | Existing Profile, Systems, clause assessments, Risks and treatment work retained; lifecycle includes changed supplier/system owner and scope |
| SoA | Inclusion separate from implementation; exclusion rationale and earlier N/A preserved when A.8.30 becomes included in year four |
| Internal Audit | Shared Review/occurrences, audit evidence, year-two nonconformity, corrective Action and independent validation |
| Management Review | Shared Review history, decisions and a year-three improvement Action, completed later |
| Corrective action | Cause/correction/effectiveness recorded through the existing Finding workflow; task completion is not validation |
| Lifecycle | 10 initial Reviews; 65 completed occurrences and Evidence artifacts |
| Auditor navigation | Browser inspected 2027–2031 audit history, late 2029 completion, 2028 closed nonconformity and original SoA exclusions |

## F. ISO changes

The Internal Audit filtered summary now explicitly says its figures cover that
view, not the whole ISMS. ISO remains clauses plus Annex A, not a 93-control
compliance score. A client's complete SoA, including any necessary non-Annex
controls, still needs its supporting documented information. No unsupported
universal control applicability or audit interval was introduced.

## G. SOC 2 completeness matrix

| Operating area | Result and boundary |
| --- | --- |
| Scope/categories | Existing system/category and observation-period configuration preserved |
| Criterion/control distinction | One client-owned Control can map to several criteria; each criterion can use several Controls |
| Design/ownership/frequency | Authoritative Control fields and version history; explicit organization-defined cadence |
| Conflicting legacy descriptions | No winning description inferred; all source/context retained and reconciliation visible |
| Operation over time | Append-only observations retain saved design/owner/mappings/relationships at recording time |
| Exceptions | Design/operation gaps and preserved legacy exceptions stay visible; migration does not resolve them |
| Evidence/remediation | Existing Evidence, Review, Policy, Finding, Action, Risk and Vendor references; no duplicate engines |
| Lifecycle | 8 initial Reviews; 55 completed occurrences/Evidence artifacts; five annual Control observations |

## H. SOC 2 changes and period Evidence

Browser: Prestige migration produced 49 shared Controls; the access Control
supported four criteria while assessment counts stayed unchanged. Linked original
Evidence and Review history were navigable. A synthetic period gap remained a gap
even with a complete reported instance count.

The isolated five-year browser fixture showed a first-year design/owner differing
from the current design/owner. An authorized provider saved and refreshed the
current design without rewriting the first-year observation or either criterion.
All 55 Evidence artifacts were reachable over three pages.

Observations are management testing, not an auditor opinion or statistically
validated sample. An operator must evaluate which design actually operated during
the claimed period; taking a snapshot is not proof of that fact.

## I. Fresh-client onboarding

Actual local Demo UI onboarding was exercised separately for synthetic CIS, ISO
and SOC clients. Generation/configuration used existing business logic.
An entered ISO first due date of 2027-03-31 survived the operational handoff.
Intentionally omitted first dates remained honestly unscheduled rather than
invented. Automated lifecycle tests used explicit 2027-03-31 first dates for all
three frameworks and verified baseline/Review identity preservation.

The final ordinary Demo portfolio showed only Brawndo, Dunder Mifflin and Prestige
Worldwide. Temporary UI clients were session-only; retained generated fixtures
are isolated test artifacts, not canonical Demo or customer records.

## J. Five-year lifecycle results

The three new tests advance a controlled clock from 2027 through 2031 and execute
normal Demo API transitions, rather than pre-filling five years of final statuses.

| Scenario | Completed occurrences | Evidence | Additional exercised changes |
| --- | ---: | ---: | --- |
| CIS | 201 | 201 | late completion, expired Evidence, later deficiency, active remediation, independent assessment history |
| ISO | 65 | 65 | audit/corrective action, management-review improvement, treatment monitoring, SoA and scope/owner change |
| SOC 2 | 55 | 55 | shared Control, five observations, sampling exception despite 4/4 instances, design/owner/provider change |

All original occurrence snapshots, first assessment history, original baseline,
Evidence identity and independent mapped-criterion status were asserted after
later changes. Policies use real submission/approval transitions.
Serialized synthetic stores stayed below the test browser's five-million-character
quota (approximately 2.89M / 2.23M / 2.12M characters).

Browser inspection of exported future-dated fixtures uses the actual browser clock
in September 2026. It proves history/pagination/navigation, not a simulated 2031
browser dashboard. Deadline behavior at the simulated dates is tested by the
controlled-clock scenarios; current overdue work was checked in canonical Demo.

## K. Auditor simulation

Auditor paths inspected: requirement → original Evidence → historical Review →
Finding → authoritative Action → validation; original ownership/design versus
current state; ISO SoA and audit history; SOC period observation context.
Closed records remain available through the labeled show-completed control.

## L. CISO / Security Program Manager review

Operator paths: assessment save/next/previous/reload, gaps, Evidence selection,
nested records, current-state summary, shared Control edits, draft protection,
history and client changes. Brawndo dashboard's three past-due items matched its
three-record drilldown after synthetic remediation; Calendar retained the actual
Review/Finding/Action sources.

Shared-module browser smoke checks included Dashboard, Calendar, Reviews, Risks,
Policies, Vendors, Contacts, Systems, Profile, Actions and Findings. These smoke
checks are not a claim that every possible action in each module was retested.

## M. Shared architecture

See [Control contract](organizational-controls.md). New additive
organizational_controls collection and Demo store member; no destructive schema
migration or replacement of authoritative modules. Existing criterion snapshots
remain intact; controls_migrated is an additive write fence, not an assessment.

Migration exact-matches legacy IDs within one client only. Missing IDs stay
separate. A racing legacy edit either precedes the fence and is captured, or
receives a conflict; interruption is recovered by rerunning idempotent migration.
Current and historical Control Evidence links are navigable in both directions
and protect retained artifacts from deletion.

## N. Evidence Library / historical integrity

Evidence search no longer treats opaque random IDs as meaningful period text.
Date-only Evidence dates retain the calendar day instead of shifting to the
previous evening in western time zones. No file payload was copied into Controls.

## O. Single final UX pass

| Severity / location | Before → after | Reason |
| --- | --- | --- |
| Medium, Action completion drawer | stale summary / missing encoded Finding → saved status and correct linked Finding | Prevents contradictory operational instructions |
| Medium, CIS verification | stale or undated evidence could look confirmed → explicit uncertainty/gap | Avoids an unsupported assurance signal |
| Medium, SOC summary | duplicate legacy ID could hide another criterion's exception → unioned exceptions, retained after migration | No loss of deficiency visibility |
| Low, ISO filtered summary | global-sounding program figures → named view and scope disclaimer | Prevents denominator confusion |
| Low, Control Evidence rows | download icon alone → named/date/type link plus original detail | Makes provenance inspectable |
| Low, Evidence dates | date-only day shifted → literal day preserved | Correct date semantics |
| Low, Control dialog focus | refresh removed opener → same-scope trigger retained | Keyboard focus returns correctly |

No second broad redesign cycle, unrelated framework activation or decorative
polish. Existing shared components and APIs were reused; no new dependency.

## P. Data and referential integrity

Automated ALLOW/DENY coverage includes client-owned identity, foreign mappings,
cross-client Evidence, unknown privileged fields, disabled owners, stale edits,
idempotent create/observation, source retention, migration retry and concurrent
legacy write fencing. Control administration reuses existing program-admin roles;
client readers inspect, but do not administer, Controls.

## Q. Roles, access and client isolation

Normal authenticated localhost browser checks covered owner, assigned provider,
contributor and read-only accounts. Readers/contributors saw disabled Control
writes; provider could save its assigned client and only saw that client.
A direct admin URL redirected the read-only user away.

Seventeen normal HTTP probes passed: assigned Control reads allowed; foreign ISO
Control/Evidence/Review/dashboard requests denied for provider/contributor/reader;
client-role migration attempts denied. These used real auth/middleware/routes over
an isolated mock database, not a frontend role simulation or auth override.

## R. Scale and pagination

Browser: all 201 CIS and 55 SOC Evidence rows paged without missing final rows.
Automated Evidence/catalog/context tests cover prior caps and relationship paging;
new Control candidates page 25 at a time. No fake counters were added.

Known limit: legacy generic registers and unpaged compatibility Evidence routes
reject above 1,000 with explicit HTTP 413. This prevents silent truncation but is
not a general large-client scale solution. History arrays and several full-client
summary queries remain unbounded; persistent large-volume benchmarking is still
required. This program does not claim enterprise capacity.

## S. Analytics/session recording

No analytics or session-recording feature added. Existing public-shell regression
continues to reject third-party analytics, replay, remote scripts and remote fonts.
No customer content was transmitted to a new telemetry service.

## T. Accessibility and responsive QA

Control dialogs have meaningful titles/descriptions, initial heading focus, Tab
wrap, Escape and focus restoration. Nested Evidence/Review return context and
draft safeguards were exercised. Final sampled normal/Demo browser logs contained
no warnings or errors.

1440, 1024 and 768px layouts inspected; no page/dialog horizontal overflow in
settled geometry. A 720×500 CSS reflow check also passed. Actual 200% zoom could
not be verified: zoom keys did not alter the embedded browser viewport. The reflow
check is not represented as actual browser zoom or full WCAG conformance.

## U. Automated/build/browser results

| Check | Final result |
| --- | --- |
| Full frontend Jest | 112 suites, 619 tests PASS |
| Reviewed isolated Python suite | 404 tests, 567 subtests PASS |
| Expanded five-year transitions | 3 framework scenarios PASS |
| Normal optimized frontend | PASS; main.745016b5.js |
| Demo optimized frontend | PASS; main.7746566f.js |
| Final patch whitespace / Python harness compilation | PASS |
| Final focused retest | 6 frontend suites / 24 tests; 20 isolated API tests PASS |
| Browser / normal HTTP | Bounded scenarios above PASS; environment limits explicitly recorded |

Commands: frontend CI=true craco test --watch=false --runInBand;
workflow-venv Python backend/tests/run_isolated.py; craco build with
REACT_APP_PREVIEW=false and standard sign-in; frontend/scripts/preview.cjs build.
Builds use CI=false to report existing warnings rather than pretend they vanished.
Existing warnings: PlatformAdmin.jsx hook dependency; Node fs.F_OK deprecation;
eight FastAPI on_event deprecation warnings. No new warning found.
No separate configured TypeScript check/lint command; optimized build runs the
project's ESLint integration. No dependency/version changes.

The optional fixture export and loopback harness enable repeatable visual
inspection of generated lifecycle state. It binds only 127.0.0.1, clears ambient
configuration, replaces only Mongo with an in-memory test database, generates
ephemeral synthetic credentials and leaves normal authorization active.
It is never part of deployment. Demo/server deterministic legacy Control IDs are
translated only during test import; UTF-8 is explicit on Windows.

## V. Remaining material defects

No unresolved material product defect was observed in the exercised baseline.
Release merge is explicitly out of scope under Robb's latest instruction, not
blocked by missing licensed PDFs. The PR is for manual review, not auto-merge.

## W. Source limitations

Manual licensed checks: detailed ISO clauses 7–10; Annex A intent/mappings; full
client-specific SoA; full AICPA optional criteria/points of focus; Description
Criteria/period/sampling/subservice treatment; applicability of the 2026 AI TQA.
The public-source log provides confidence and why each check matters.

## X. Architectural limitations

Not dynamically validated: persistent Mongo/real file-store durability, process
restart/recovery, production-like OAuth/mail/invitations, deployed cookie/domain
boundaries, distributed concurrency/load and backup/restore. Automated isolated
checks are not independent security assurance. Multi-document data/audit changes
remain non-transactional; an uncertain response requires authoritative-state
inspection. Generic capacity limits are not removed by this change.

## Y. Future improvements not implemented

- Worthwhile: staging durability/concurrency testing; bounded/paged long-lived
  history and large registers; independent licensed-source and security review.
- Speculative: new generic compliance engines, automated auditor conclusions,
  broad cross-framework Controls rollout.
- Subjective polish: shortening historical technical IDs in legacy Related tables
  and further visual tuning. None justifies another autonomous redesign now.

## Final product assessment

CIS, ISO and SOC 2 are suitable reference operating experiences for manual product
review within the verified public-source baseline and local test scope.
Fresh-client onboarding and selected five-year operating scenarios pass for each.
Operators and auditors can follow work and history without needing database IDs
in the tested paths. Exact framework-content completeness and production readiness
are not asserted. The next product step is Robb's manual review, not another
framework rollout.

## Changed files and source control

Starting main: 66242b89359de886d1b654ec7b146bd4703a44c8.
Branch: codex/framework-operational-completeness.
PR: https://github.com/robbashea-lab/GRC/pull/6.

- 82c3cea: starting architecture/acceptance ledger.
- 49d9380: CIS/remediation/Evidence corrections and public ISO/SOC baseline.
- ecfbb3d: shared SOC Controls, ISO summary, final UI corrections and all three
  expanded lifecycle scenarios. These are shared checkpoints, not separate
  invented per-framework commits.
- Final documentation/QA-harness commit and verified branch SHA are reported in
  the handoff. PR is finalized for review, explicitly unmerged. Starting main is
  unchanged by this work. No merge method or final merged SHA applies.

Material backend: organizational_controls.py; framework_governance.py; server.py;
evidence_context.py; evidence_library.py.
Material frontend: OrganizationalControls.jsx; FrameworkDrawer.jsx;
FrameworkWorkspace.jsx; ProgramContext.jsx; CisWorkspaceSummary.jsx;
RecordDrawer.jsx; EvidencePanel.jsx; EvidenceItemDrawer.jsx; SocReadiness.jsx;
cisVerification.js; managementDates.js; evidenceContext.js; evidenceSources.json;
Demo adapter/store/frameworks/evidence/identityLifecycle/organizationalControls.
Tests: new organizational_controls API/Demo/component tests and
frameworkFiveYear.test.js; updated Evidence, ProgramContext, RemediationUX,
CIS verification, date and FrameworkWorkspace tests; reviewed backend allowlist.
Docs: this report, public-source baseline, operational ledger, Control contract,
developer handoff. Manual harness: backend/tests/serve_lifecycle_qa.py.

Dependencies: unchanged. Schema: additive collection/member and migration fence
only. No customer data, destructive migration, production/Railway deployment,
Sites publication or preview update. Local optimized builds were used for QA only.
