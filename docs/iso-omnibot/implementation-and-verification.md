# ISO OmniBot implementation and verification

## Release boundary

This is an additive ISO implementation on `codex/iso27001-omnibot-rollout`, stacked on the compatible Login/CIS/SOC correction baseline `1ba91c30c3dab074e85e3d6e09fca2f822e79184`, not an older main. Agent 1's correction-first release is live as `dep-db5pcg7lk1mc73apsvmg`; CI run `38143635195` passed for that correction, not for the new ISO change. ISO exact-candidate CI, provider revision and hosted results must be recorded in the ISO PR discussion after freezing. No main merge, production release or Sites publication is authorized by this workstream.

Agent 1 retains the shared provider/authenticated session until a separate acknowledged handoff. Local browser use is isolated: Codex session `01a0a4fa-8945-74c3-aa2b-859f099e9f79`, provider tab `browser-use:39611d5d-d3f2-4dae-89b4-9d4893c0043b`, loopback port 4224. Matching numeric tab IDs in another chat are not the same session.

## Implemented surfaces

- Overview: approved Omni presentation, four native work areas, explainable next steps from configured ISO records, retained progress and actual audit dates. A control is deduplicated across SoA/Annex A. Justified exclusions stay out of implementation-gap recommendations. Cancelled/completed audits remain history rather than active late work.
- SoA: explicit inclusion/exclusion and justification saved through the existing native writer. Implementation is separate and cannot be applied to an undecided/excluded control. Risk acceptance or outsourcing does not imply exclusion or implementation.
- ISMS Requirements: 30 individual native assessments across clauses 4–10, with practical grouped questions and relevant conditional follow-ups. Conditional context does not provide a blanket clause exclusion. Climate-context considerations are included without an environmental-management programme.
- Annex A: 93 control-specific interviews, with the same authoritative implementation record, answers and history opened from either control tab. No dual writes or global migration.
- Internal Audit: preparation guidance mapped to 9.2.2, selected native workpaper guidance and navigation to the existing Review. Actual deadlines, not an unfinished quarter, determine lateness. Missing scheduling, no selected activity and an unactivated programme remain distinct. No audit result/completion or independence conclusion is generated.

The approved character/window/dock, themes and native ISO hierarchy, tabs, manual criteria, references, relationships and record workflows are reused. No global style, authentication, external AI/runtime service or dependency change is introduced.

## Save/data contract

The existing assessment ID is scoped to client, ISO framework/version and native definition. Applicability/rationale belong to `soa_applicability`/`soa_justification`; implementation wording/status belong to `implementation`/`status`. Existing evidence, owners, checks, links, approvals and frozen Review/SoA snapshots keep their existing ownership.

Question saves retain interview progress only. The final applicable group opens one editable multiline summary using OVERVIEW / IMPLEMENTATION BREAKDOWN / ITEMS TO ADDRESS. Explicit Summary Save/Update or Save & close submits the exact reviewed text and ISO-native proposed status through the native writer; closing waits for confirmation. It does not require a second external save or change verification, Findings, Actions, audit results or applicability.

Server-side checks preserve the live actor's access, assignment, active programme, current lineage, question version, summary answer basis, native write token and narrow field allowlist. Read-only/wrong-client mocks do not establish hosted restricted-account assurance. The ISO lease serializes cooperating interview/native writers, with acquired-token cleanup and honest uncertainty. The 80-second driver/90-second protected-operation/120-second lease limits are **not** a whole-request bound, transaction or post-dispatch fencing guarantee.

Configuration-based activation uses the existing programme requirement, not Dunder's name or ID. Initialization is insert-only/idempotent; add-ISO does not reseed another programme. Deactivation/reactivation retains native data and interviews through existing rules. No answers are inferred from legacy narratives/checklist selections.

## Content and independent review

Three versioned catalogs cover all 123 native IDs and 611 authored questions. Per-question matrices distinguish official public excerpts, original repository guidance, corroborating implementation material and missing licensed comparisons. The 12 exposed native units in clauses 4–6 were compared to a legitimate standards-body preview; exact complete clauses 7–10 and Annex A bodies remain open for 111 definitions. Runtime inventory coverage is not full normative completeness, verification or certification.

Independent content and code reviewers did not author the implementation or access browser/provider/client sessions. Their reports and subsequent narrow remediation dispositions are retained alongside the matrices. Backend-owner disposition is separate from independent review. No copyrighted full-standard redistribution or unauthorized source was used.

## Defect register

| ID | Reproduction / impact | Correction | Verification boundary |
| --- | --- | --- | --- |
| ISO-D01 | Demo raw assessment lacks enriched `specification`, allowing Annex guided application before a SoA decision | Read the canonical definition for the guard | Dedicated Demo regression and authenticated route tests; not hosted proof |
| ISO-D02 | Stale Compare/Retain hydrates saved values over unsaved manual wording | Explicit keep-editing/discard confirmation before rebase/restart reload | Controller regressions and independent reproduction/re-review |
| ISO-D03 | Cancelled audit with past deadline enters active overdue queue | Terminal cancelled state before timing; omit active recommendation and retain history | Pure-function/component regressions and independent re-review |
| ISO-D04 | Existing CIS preview tests prohibit newly approved ISO interviews/context | Preserve CIS/SOC assertions, assert active ISO version and inactive ISO denial | Focused existing-suite rerun; no product prohibition retained |
| ISO-D05 | A.5.3 cannot report the qualified alternative already supported by authored guidance | Explicit actual separation or justified evaluated effective compensating checks; exception alone insufficient | Content/engine regression and independent re-review; particular ISO acceptability remains licensed-source qualified |
| ISO-D06 | Optional concern notes retained while summary claims no items reported anywhere | Label notes separately; no-actions sentence refers to selected substantive answers only | Content regression; optional notes remain status-neutral |
| ISO-D07 | Programme-only audit guide looks like an unscheduled selected Review | Distinguish no selected activity from an unscheduled existing record | Local browser observation and component regression |
| ISO-D08 | Radix document-capture Escape closes the native assessment before the nested guide handles its own close/draft guard | Optional shell Escape callback, scoped only to focus inside the mounted ISO guide in assessment/workpaper callers | Three real-parent regressions failed before the hook; 61 shell/controller/audit tests passed after it; local clean/dirty/confirmation/outside-guide browser checks passed |

The ownership regression fixture now activates ISO through normal configuration before attempting an ISO write. No permission assertion was removed. The all-123 Demo native-adapter test was partitioned into five isolated batches (at most 25 controls), preserving every assertion after the original growing-history test exceeded its 120-second Windows budget during concurrent builds. No timeout increase or assertion weakening.

## Executed local evidence before freeze

- Classified offline backend: **770 tests / 5,891 subtests passed**, eight existing FastAPI lifespan deprecation warnings, 643.34 seconds. Uses real handlers with isolated mocked storage/authentication fixtures, not live Mongo or hosted browser proof.
- Post-correction focused content/audit/existing CIS preview run: **173 tests in four suites passed**, 34.78 seconds.
- Controller-author corrective run: **43 tests passed**, Babel compilation and scoped lint zero errors/warnings. Independent content re-review: **128 tests and 2,474 independent checks passed**. Exact frozen CI results belong in the PR ledger.
- A preliminary authenticated build compiled successfully, but preceded final corrections and is not an exact frozen-build claim. The original full local frontend run was interrupted after prolonged output silence; it is **not completed**, not a pass. Exact-candidate full CI is still required.
- Local Demo browser: Dunder was read-only for placement and unresolved A.8.11 SoA routing. Synthetic client `clients_demo_mv3w0vt5_8w7i6usl`, “Agent 2 ISO Omni Local QA 2026-10-11”, was created through supported UI/onboarding with ISO only. All 123 assessments began unassessed; no Dunder records were copied.
- Synthetic 4.1: question save left native text/status blank/Not Assessed; partial progress resumed after refresh; final summary retained exact operator-edited multiline wording through native Save & close, Previous/Next and refresh. Interview history remained accessible.
- Synthetic A.5.1: explicit applicability save left implementation unassessed, final implementation saved from SoA appeared in Annex A; subsequent native Annex A edit appeared back in SoA with the same rationale. An unsaved native draft blocked guided application. The established native decision writer retains its existing date behavior; this release does not redefine historical Last Assessed semantics.
- Additional connected rerun: 66 tests passed in the four valid controller/audit/ISO/SOC suites, but the command as a whole failed because it also named a nonexistent `components/FrameworkWorkspace.test.jsx`. The corrected `pages/FrameworkWorkspace.test.jsx` command passed 24 tests. This operator path error is not reported as a successful full run.
- Synthetic audit programme: normal UI activation created the existing four package Reviews; the actual selected anchor was 2027-12-14. Governance/Risk Review due 2027-12-31 was Upcoming, not Overdue, and Open normal Review showed that exact date, annual recurrence and 2028-12-31 next due. No workpaper conclusion or Review completion was fabricated. Date-input automation required native key interaction to update React state; this does not establish the originally intended onboarding-date handoff case.
- Local responsive checks at 768, 1024 and 1440 pixels: stable native/Omni bounds were within the viewport and document width equaled viewport width. Screenshots inspected for 768 light and 1024 dark; initial transition-frame bounds were not treated as a persistent defect. Keyboard heading movement, Tab, minimize/reopen, clean Escape, dirty Escape, confirmation Escape and native Escape outside the guide passed. Theme and viewport overrides were restored. The sampled final warning/error log was empty; an earlier transient HMR syntax overlay during a worker edit was corrected and is not a final-runtime claim.
- Actual audit-workpaper parent at runtime `d031408933d133c7f7624407a854a44fcb55ddaf`: guide Escape closed only the guide and retained unsaved notes; native Escape outside the guide opened its existing leave confirmation, Keep editing retained exact notes, and deliberate discard returned focus to item 4-1. No workpaper write occurred. A package-row center click intersected the movable launcher; keyboard activation reached the native package. The approved dock remained movable; no global geometry change was introduced.
- Independent final code disposition accepted runtime `d031408933d133c7f7624407a854a44fcb55ddaf` for the next CI gate: 61 real-parent/shared tests and five actual-production-wiring probes passed; removing the pass-through in memory caused three expected regression failures. Content review separately accepted the source corrections. Exact CI/builds and hosted checks are still separate gates.
- A direct ESLint 9 CLI invocation did not run because this repository uses the existing CRA/CRACO lint configuration rather than a flat `eslint.config` file. No configuration migration or suppression was added. The configured build/CI remains authoritative; the earlier controller-owner scoped lint result is separately attributed.

Additional local/hosted executions, final assets, source SHA, CI/deployment IDs, remaining access gates and fixture disposition must be appended to the PR evidence ledger. Do not relabel prepared tests or Demo observations as hosted passes.

## Remaining assurance / recovery boundaries

Exact licensed-source comparison, live restricted-account ISO denial, fresh logout/login/MFA where access is unavailable, injected hosted faults and live Mongo cancellation/fencing behavior are not closed by mocks. Existing Agent 1 CIS/SOC access and Windows-timeout/dependency limitations remain independently open. Do not alter accounts, credentials or shared-service fault behavior to obtain coverage.

Recover by preserving Mongo records/history and deploying a verified compatible forward correction or a candidate retaining ISO `iso27001-omni-1` plus current CIS/SOC readers and writers. The pre-ISO correction is a provider reference but cannot be blindly treated as compatible with newly stored ISO interviews. Never reset/reseed the database to make a code rollback work.
