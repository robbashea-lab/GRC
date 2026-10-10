# SOC 2 OmniBot validation and release boundary

## Current corrected-runtime acceptance checkpoint — 2026-10-10

The sections explicitly headed historical below retain earlier `b384b28`
evidence. Current corrected-writer source is
`5c3594c2c5b012e547c86990286f4a1790ae5fa0`, tree
`9bc3e5a2cb5bebcb9032f0206ccfec25eb082d0a`.
[Release verification #134](https://github.com/robbashea-lab/GRC/actions/runs/38092857199)
passed at that exact provider SHA: full frontend tests, both optimized builds,
backend checks and the release gate. The current offline backend run passed
743 tests / 3,215 subtests, with eight existing FastAPI deprecation warnings.
Its bounded SOC-B02 correction and real-Mongo evidence are in
[mongo-lease-validation.md](mongo-lease-validation.md).

Agent 1 verified actual Live deployment `dep-db5cbcbrjlhs73d606o0`, the full
`5c3594c2` source, healthy API and fresh `main.7ef84294.js` /
`main.fe2057c8.css`. It reported 61/61 hosted positive native saves, refreshes
and resumes across 155 groups: 59 fresh cases plus two normal updates of the
earlier A1.1/CC1.1 interviews. Manual wording and history were preserved.
Agent 2 did not use that session. Earlier `b384b28` supplied 61 placements
and two native saves, not this campaign. Targeted negative/access cases are
separate; consult the coordinator's final H01–H23 dispositions.

The independent reviewer reproduced B02 using staging-compatible Python 3.12.14
and the exact pinned Motor/PyMongo versions, then independently passed the
corrected timeout/cancellation real-Mongo probes and 77 regression tests with
2,214 subtests. The current correction hash remains
`9577ae472c02fe47d7623bd60ac40b9167ee63e05a24527cb93f1df31bbf9c74`.
It closes the reproduced delayed-send defect, not all server-dispatch or
after-last-check concurrency risks.

Independent source/component review then reproduced SOC-U10: unconfirmed
native saves were described as “not saved,” and a later failed attempt retained
the previous success notice. Three implementing regression cases failed on
the old controller with normal Jest exit 1. The accompanying two-line SOC-only
correction clears the old notice before any new commit attempt and asks the
operator to reload authoritative native state before retrying an unconfirmed
save. No writer, version, content, permission, authentication or style changed.
Final correction SHA/CI/hosted retest are recorded on PR #66, not inferred from
the prior `5c3594c2` deployment or the independent reproduction's incomplete
Jest teardown. The implementing corrected campaign then completed normally:
five focused suites / 1,093 tests passed (SOC controller, native workspace,
SOC evaluator, Demo adapter and CIS comprehensive compatibility), including
all three new regressions. Both optimized builds succeeded: authenticated
`main.22e382e4.js` / `main.fe2057c8.css`, Demo `main.b389fd6b.js` /
`main.30d7a029.css`. Existing large-bundle and Node `fs.F_OK` advisories remain.
Controller SHA256: `62fa7f7a0e52d7df5e8c29ac39294a96e4f228519d63fc87de9c634b0a3742cd`.

Prestige was absent from hosted records; Agent 1 received separate permission
to create an empty 38-criterion showcase. Its actual persisted ID is
`cli_28568b9f2db30bc11977775bc203fac65eecefd9f6cc0bfb2146739b611eca7c`,
all 38 Not Assessed, no copied Demo facts/answers; eight normal unscheduled,
unowned Reviews and 17 Unsure policy responses. Read-only placement remains
its own coordinator result. Real SOC Reader
and wrong-client sessions remain unavailable. Showcase creation is not access
authorization. **Deployed for validation — final acceptance pending.**

## Historical frozen application and dependency (before SOC-B02/SOC-U10)

- Branch: `codex/soc2-omnibot-rollout`; draft PR [#66](https://github.com/robbashea-lab/GRC/pull/66), stacked on Agent 1's PR #65.
- Agreed base: `a527d4e79bfab36629b0a0b71eb10c6c018d00bb`. Base runtime: `6a4c0c7612195605c39d3285bf11c2560e15d74e`.
- Initial frozen SOC application: `94680c45bac3b14550afdd1ccf075a470df91896`.
- Corrected frozen application: `b384b28d121a698f162cf4701a25e5158fed8da9`. The only subsequent runtime change was the independently reproduced and corrected SOC-U09 display-name refresh draft-loss defect.
- Main remained `911706cebc7a70c0443f500fcd4bc19260c1db60` at the final source refresh. No merge or force-push occurred.
- Versioned SOC catalog: `soc2-omni-1`, SHA-256 `0f3b43bf3f1992d3ab87e1a197a48c02564feb259b61a713c8792ad611848979`.
- Corrected SOC controller SHA-256: `d27e70e29f8f51b2b2446956c889a40fb9f50e73732a22eb7f853129d62e2117`.

Documentation commits after the frozen application are evidence-only, not a different deployed application. Source, local tests, isolated backend tests, Demo browser checks and real hosted acceptance are not interchangeable.

## Scope and design

All 61 existing supported criteria have original, criterion-specific interviews: Common/Security 33, Availability 3, Confidentiality 2, Processing Integrity 5, Privacy 18. There are 155 groups and 174 questions: 166 substantive questions, six conditional-context questions and two optional text prompts. No generic legacy fallback is used.

Activation uses the existing SOC program applicability, configured categories, canonical criterion identity and normal authorization. Neither Prestige nor any other client name/ID is an activation gate. Default new/add-SOC configuration is Security/Common Criteria only. Optional categories activate only when selected.

The approved shared Omni artwork, launcher, window, geometry, animations and styles are reused without edits. Native SOC tabs, requirement guide, current and historical checklist catalogs, organizational Controls, operating observations and manual assessment remain authoritative. The new native application path writes only the reviewed implementation text, canonical SOC readiness status and attributable guided source through the existing writer. It cannot silently alter verification, checklist selections, Control records, evidence periods, Reviews, Findings or Actions.

See [criterion/question/status matrix](criterion-question-matrix.md) and [defect register](defects.md). Readiness is reported implementation, not an auditor opinion or proof of operation during an earlier examination period. Points of Focus inform inquiry rather than impose universal individual controls.

## Independent phase

Content reviewer Laplace and functional/security reviewer Bacon had no implementation ownership and made no edits or deployments.

- Content/source/decision review: all 61 criteria passed. 1,917 independently generated in-memory cases produced no JS/Python difference or assertion failure, including 1,098 optional-prose invariance cases and 46 targeted Privacy fulfillment cases. This is content/decision evidence, not API/database/browser acceptance.
- Functional review of `94680c4`: 1,151 tests across nine frontend suites, 47 backend tests with 2,196 subtests and three independent ASGI race/metadata probes passed. It reproduced SOC-U09 rather than approving the candidate without qualification.
- SOC-U09: two regressions failed before correction (same-client refresh read count 1→2); after correction, all 75 SOC component tests and independent probes passed, including retained unsaved answers, manual multiline wording, dirty indicator, current-name replacement confirmation and protected explicit reload. Final independent disposition is attributed to `b384b28d121a698f162cf4701a25e5158fed8da9` and matching file hashes.
- Previously reported stale-scope, repeated-remount manual-review and interview/native race defects passed the independent retest. Subsequent real-Mongo multiworker/pre-check stall/clock/cancellation executions are recorded separately in the current checkpoint and real-Mongo report; they do not establish universal fencing.

## Historical automated checks actually executed (through b384b28)

Commands used the repository's existing dependencies and scripts; no package manifest/lockfile upgrades, authentication changes or new runtime services.

| Check | Execution and result | Boundary |
| --- | --- | --- |
| Full isolated backend | `.soc-test-venv/Scripts/python.exe backend/tests/run_isolated.py`: 741 tests and 3,211 subtests passed; eight existing FastAPI `on_event` deprecation warnings | Application route tests use isolated database/auth adapters; not hosted authorization |
| SOC component correction | `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --testPathPattern=SocGuidedAssessor.test`: 75 passed on corrected frozen code | Component/contract checks |
| CIS comprehensive compatibility | Same runner, `--testPathPattern=CisComprehensiveWorkflowCoverage.test`: 615 passed | Acknowledged SOC-only expectation update; CIS/ISO exclusions and all native-no-write assertions retained |
| Full local frontend diagnostic | 263 suites / 8,274 tests passed; one old SOC-no-launcher assertion failed in a test file loaded before the acknowledged correction | Not a final exact-candidate pass; corrected focused 615-test suite passed; exact-candidate CI below is authoritative |
| Authenticated optimized build | `CI=true node scripts/staging.cjs`, from `frontend`: passed; `main.038edc42.js` | Build only, not publication |
| Demo optimized build | `CI=true node scripts/preview.cjs build`, from `frontend`: passed; `main.ec761d0e.js` | Build only, not publication |
| Scope diff / whitespace | `git diff --check` passed; final file inventory reviewed against agreed base | No CIS runtime/catalog, Login, ISO, shared Omni styles/artwork, auth, dependency or provider files changed |

Both optimized builds retained the existing large-bundle advisory and Node `fs.F_OK` deprecation. GitHub also annotated the existing pinned actions' deprecated Node 20 runtime being forced onto Node 24. No new hook/lint warning remained; the missing hook dependency was corrected without suppression. No unrelated dependency/action upgrade was attempted.

Exact corrected candidate CI: [Release verification #133, run 38082617286](https://github.com/robbashea-lab/GRC/actions/runs/38082617286), normal existing workflow dispatch, provider head `b384b28d121a698f162cf4701a25e5158fed8da9`. Terminal result was read back as **success** on 2026-10-10: full frontend tests, both optimized builds, backend offline checks, the existing disposable-Mongo recovery/authorization campaign and Release gate all passed. Provider log delivery did not expose reliable numerical test totals; no CI test count is invented. The existing real-Mongo campaign is not a substitute for the new SOC hosted/restricted-session or multiworker-lease cases.

Earlier [run #132](https://github.com/robbashea-lab/GRC/actions/runs/38081683284) at `94680c4` completed successfully: frontend full tests, both builds, backend offline/real-Mongo campaign and release gate. It is earlier-candidate evidence only, not a substitute for #133. No CI workflow or provider setting was changed to obtain a pass.

## Local browser checks actually executed

Browser: isolated permitted Codex in-app browser, loopback `http://localhost:4212`, normal application Demo adapter. No Render authenticated session or Agent 1 fixture was used. The campaign began on `94680c4`; corrected `b384b28` retained the same content/native writer and received affected component regressions and representative follow-up browser checks. Demo reload persistence is not real authenticated database persistence.

### Fixture A — fresh SOC-only client

`clients_demo_mv2rvd49_hx9heqot`, **Agent 2 SOC Omni local QA 20261010**.

- Normal Client Management creation and onboarding; 17 policy responses honestly Unsure, zero accounts/contacts/owners created. Default 33 clean, unassessed Common Criteria and eight normal unscheduled/unowned mapped Reviews.
- Explicitly selected all five categories through existing Program Configuration, giving 61 active criteria.
- Each of all 61 criteria: native entry, tailored grouped interview, synthetic adequate-practice path, progress saves, direct summary, exact implementation/native save, actual browser reload, resume and exact text comparison. These synthetic answers do not describe any real client's practices.
- CC1.1: explicit scope comparison retained inherited answers; confirmed No proposed Needs Remediation / Validation; manual multiline summary; replacement named the fixture/criterion; cancellation left native text unchanged; Save & close persisted exact text, reopened after refresh; prior interview write-ups remained in history.
- P6.1: begin-new-review retained native text and historical interview; Outside-system context required an explanation; empty conditional groups were skipped; contextual exclusion did not create whole-criterion N/A; progress-only save left native text unchanged; a Partially answer proposed Partially Addressed; explicit update/Save & close/refresh retained exact text.
- Native draft: changing implementation text blocked summary application; native close warned; Keep editing retained the exact unsaved text. The temporary unsaved probe was discarded without changing saved records.
- Categories: narrowed to Security (33 active), optional-category recommendations excluded; restored all categories (61 active) with prior statuses retained. P8.1 native write-up and resumed summary remained identical after deselection/reactivation.

### Fixture B — existing client adds SOC

`clients_demo_mv2tt1bb_upvsjkgb`, **Agent 2 Add SOC local QA 20261010**.

- Normal CIS-only onboarding created 56 unassessed safeguards and 12 unscheduled mapped Reviews. A clearly synthetic manual CIS narrative was saved as a preservation marker, without asserting implementation.
- Normal Program Configuration added SOC; 33 unassessed Common Criteria and the same Omni workspace appeared automatically. CIS marker remained exactly unchanged; no SOC controller leaked into the CIS workspace.
- CC1.1 all-unknown interview proposed Not Assessed with specific confirmation needs, not fabricated deficiencies; exact write-up persisted through Save & close and browser refresh.
- SOC retired with an explicit synthetic reason, then reactivated normally. SOC navigation was removed/restored; CIS navigation remained; 33 SOC criteria and prior native write-up/interview were retained without duplicate criteria.

### Read-only reference / interaction checks

- Prestige's unchanged configured scope remained 38 (Security, Availability, Confidentiality). All 38 native criteria opened the correctly identified tailored interview; no question answers or assessment saves were performed. Native implementation text was compared before/after each visit and remained unchanged. Privacy/Processing Integrity were not enabled for Prestige.
- 1440 / 1024 / 768 px: no page horizontal overflow; guide stayed within viewport, summary remained available. Approved scroll/window behavior retained. Light/dark program views were inspected.
- Keyboard: heading arrow-key movement, Alt-arrow resize, tab traversal and Escape executed; Escape returned focus to the criterion register. Native dirty-close confirmation was tested separately. No physical pointer drag claim is made.
- Captured browser error/warning logs were empty in the final local normal flows. One retained free-launcher position overlapped a register click target; keyboard Enter opened the exact record. The shared approved free-drag behavior was not redesigned; physical drag/position optimization remains a follow-up.
- Screenshot evidence is retained locally at `.soc-test-venv/browser-evidence/soc-summary.jpg` and `prestige-soc-guide.jpg`; it is local synthetic Demo evidence, not hosted evidence. The local deliverable tab remains at Prestige CC1.1 without any answer/native write.

Both Agent 2 local fixtures were archived reversibly through Client Management. UI confirmed Archived and Restore actions. Assessments/interviews/history were retained; no database reset or deletion occurred. No hosted fixtures were created or cleaned up. Prestige and Agent 1 clients were not archived, reseeded or overwritten.

## Open hosted/release gates

Agent 1 retains exclusive Render deployment/shared authenticated-session ownership. No staging handoff was recorded. Agent 2 did not deploy, navigate that session, create hosted clients, reuse restricted identities or alter provider configuration. Current service is `srv-db1s0cugekts73f72reg`; the coordinator's corrected `5c3594c2` deployment and positive saves are recorded above. Old `dep-db56e2d9fdbs73bpcq50` is historical, not the current source.

Not executed, therefore not passed:

1. Publication/fresh-asset verification and affected hosted retest of the subsequent SOC-U10 message correction; the `5c3594c2` deployment itself is verified.
2. Remaining targeted H09–H19 hosted lifecycle/fault/logout scenarios as separately attributed by the coordinator; all 61 `5c3594c2` positive native save/refresh/resume paths are completed, not pending.
3. Real Reader and wrong-client denial of SOC route/interview/native writes under existing authorized accounts; mocked/Demo denial does not close this material gate.
4. After-last-check takeover/clock skew and already-dispatched command ambiguity. Recorded real-Mongo contention, pre-check stall/clock and cancellation probes passed their bounded cases; serialization is not a cross-document transaction/fencing guarantee.
5. Full physical-pointer drag/docking and every negative answer permutation. All criterion-positive designs plus targeted local branches were tested; every permutation was not.

Agent 1's own pending CIS restricted-access gates remain separate and unwaived. PR #66 remains draft/unmerged while required acceptance remains unresolved. Main, production and Sites are unchanged; no external AI/API dependency was introduced.

## Coordinated next step and compatible recovery

After exact CI and independent review finish, Agent 1 must record an exclusive staging/session decision and the exact approved composite, preserving any newer approved PR #65 work. Only then use the existing staging service and two distinct Agent 2 synthetic fixture paths to complete the hosted cases above. No production, provider-setting change or access-policy change is authorized.

Resume checkpoint 2026-10-10: fresh fetch retained main `911706ce`, PR #65/base `a527d4e`, frozen tested SOC runtime `b384b28` and evidence-only remote head `7fcdcb0`, with clean worktree and terminal CI #133 success. Agent 1 reported its Render browser connection recovered and is rechecking actual provider state; its earlier empty-inventory limitation must not be repeated as current. No staging/session slot transferred to Agent 2 and no hosted pass was recorded. The [coordinator hosted runbook](hosted-acceptance.md) is prepared, not executed, and separates read-only/administrator fixture checks from restricted-session and process-level gates.

Every SOC revision must retain current and historical CIS readers/writers inherited from the agreed base, plus `soc2-omni-1`, SOC reviewed-answer metadata and native source/history compatibility. Prefer a narrow verified forward correction. Do not deploy older main, the defective `b384b28` writer, or Login-only/CIS-only code after SOC interviews exist; never reset/reseed records. The verified `5c3594c2` / `dep-db5cbcbrjlhs73d606o0` writer is unchanged by the message correction, but any recovery candidate still needs explicit compatible-source verification.
