# Targeted SOC 2 program improvements — 2026-10-02

Baseline: `9a0a781f2f240bd1a1b5ac2e044f14ab125f2ecc` (`origin/main`).
Working branch: `codex/soc-program-improvements`. Delivery is a PR only;
merging, production writes and hosted-preview publication are not authorized.

## Implementation checklist

- [x] Reproduce accepted Review evaluation loss, ignored unknown fields and
  narrative-save date ambiguity with three failing regression checks.
- [x] Preserve explicitly supplied conclusion, tested scope/period, checklist
  confirmation and artifact explanation inside the immutable occurrence.
  Reopening and replay return that snapshot; recurring-definition edits do not
  rewrite it. Absent legacy evaluation stays absent.
- [x] Add optional evaluation disclosure to the existing Review interface.
  Notes remain independent; evaluation is submitted on completion, not on
  Save changes. Draft protection covers unfinished evaluation. No mandatory
  upload, effectiveness score, criterion transition or Verification transition.
- [x] Label zero linked Findings as **No findings recorded**, retaining the
  stored `no_findings` outcome code and Risk/ISO completion meanings.
- [x] Expose the existing Organizational Controls component in every SOC
  workspace. Reuse its mappings, ownership, design, relationships, observations,
  immutable historical snapshots and independent operating judgment.
- [x] Add collapsed program-level description-preparation guidance. It creates
  no records, cadence, controls or scores; ordinary Reviews/Notes or an external
  description remain authoritative. Record owner, reference/version, period and
  follow-up there. Existing/new/later-enabled SOC programs use the same source.
- [x] Separate SOC save and judgment dates, without changing CIS/ISO semantics.
- [x] Preserve direct and related evidence meanings, file ownership and counts.
- [x] Finish independent verification and final diff review; fetch remote main
  again and confirm it remains the baseline. Prepare branch-only PR delivery.
- [ ] Close the real-Mongo, normally authenticated frontend/backend integration
  gate before authorizing a subsequent release.

## Contracts and compatibility

Review completion rejects unknown fields and validates evaluation lengths and
boolean confirmation. Evaluation is not copied into the recurring definition.
Existing Notes, completion-notes overrides, evidence snapshots, attribution,
recurrence anchoring, Risk recommendations and ISO workpapers stay intact.
The existing Risk drawer's administrator-only next-date input is now explicitly
recognized and validated by the backend instead of being silently dropped.
Demo preserves this explicit override for non-reference clients too; ordinary
cadence behavior is unchanged. Permission, canonical-date and replay checks cover
the correction independently in backend and Demo tests.
Known legacy transport fields `completion_date` and `spawn_next` remain accepted;
actual completion time and recurrence remain server-controlled as before.

SOC adds server-owned `last_saved`, `assessment_recorded_at` and
`assessment_recorded_by`. A saved change to a non-Not-Assessed implementation
status is an explicit reviewer judgment. Narrative/checklist/Verification-only
edits retain its date. **Record assessment** reaffirms an unchanged judgment.
It requires an assessed status and normal write authorization. Resetting status
does not delete earlier judgment history. The command flag is not persisted.

`last_assessed` remains the existing optimistic-write token for compatibility;
SOC UI does not interpret it as a judgment timestamp. Legacy records with an
assessed status but no explicit judgment date display **Legacy date unconfirmed**.
Old histories are untouched. Fresh fictional Demo histories discard the seed
command's present-day metadata rather than pretending it is historical evidence.
No database migration or backfill is required. Older API clients still receive
the existing write token; new clients cannot supply judgment timestamps.

## Description source and mapping

Source: [AICPA DC section 200, 2018 Description Criteria, revised implementation
guidance 2022](https://assets.ctfassets.net/rb9cdnjh59cm/1vCduR1U2OnhIvFFaDBjMv/836050054707e9afb65adeb30d2e95d8/92317096_dc_section_200_clean_version.pdf).
The shared `socDescriptionPreparation.json` is version `2026-10-02.1` and
classified `operational_guidance`; it contains concise Omnisciente summaries,
not licensed verbatim criterion text. References: DC1–DC3 pp. 9–18; DC4 p. 19;
DC5 p. 21; DC6 pp. 22–24; DC7 pp. 24–27; DC8 p. 27; DC9 p. 28.
Paragraphs .12–.19 establish judgment, faithful description, relevance and
implementation-guidance boundaries. Customer responsibilities are not all CUECs;
provider involvement is not proof of operation; outsourcing is not an automatic
criterion exclusion. Owner/version tracking is product workflow advice, not an
additional DC or universal document-format requirement.

## Final verification log

Backend: **122 focused tests passed** using actual authorized FastAPI handlers over
isolated **mongomock**, not durable MongoDB. Suites: Review occurrences, SOC,
Organizational Controls, framework governance/capabilities, ISO, Risk lifecycle,
Evidence context/library, Review lifecycle and ISO audit program. Covers roles,
tenant denial, stale writes, replay, immutable snapshots, linked Finding/Action
follow-up, recurrence and independent Evidence download payload checks. Three new
defect checks failed before the fixes and passed after them.

Frontend: final combined run **178 passed / 4 failed (182 tests, 11 suites)**.
SOC guidance/dates, Control workflow, CIS assessment, ISO assessment and Risk
checks passed. PrestigePresentation's separately checked existing Review
theme assertion failed identically on untouched baseline main. After UTC midnight,
four BrawndoReviews due-date signal assertions also failed identically on baseline
main (local-day fixture vs UTC-based day calculation). They are not disabled or
weakened. The new optional evaluation/draft/completion UI regression passed.
One intermediate test command named three nonexistent paths; corrected paths
were rerun. A build command initially used the repository root instead of
`frontend`; the corrected **final Preview production build passed**, with the
existing large-bundle advisory. No dependency or lockfile changes. Build includes
the browser-found first-save feedback correction (undefined and null judgment
metadata both mean no recorded judgment). Its regression test passed.

Commands (from `backend/tests` and `frontend`, respectively):

```text
python -m unittest test_review_occurrences test_soc_framework test_organizational_controls test_framework_governance test_framework_capability_contract test_iso_framework test_risk_lifecycle test_evidence_context test_evidence_library test_review_lifecycle test_iso_audit_program
CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --runTestsByPath src/preview/socFramework.test.js src/components/PrestigeSocAssessment.test.jsx src/lib/socAssessmentDates.test.js src/preview/organizationalControls.test.js src/components/OrganizationalControls.test.jsx src/components/BrawndoCisAssessment.test.jsx src/components/IsoAssessment.test.jsx src/pages/FrameworkWorkspace.test.jsx src/pages/BrawndoReviews.test.jsx src/preview/risks.test.js src/preview/brawndoRisks.test.js
node scripts/preview.cjs build
git diff --check
```

Final backend invocation used equivalent `unittest.main` with the same explicit
suite list and logging disabled; final output: 122 tests, OK. Full historical
test discovery was not run because the repository contains live-service tests.

Browser (isolated localhost Demo only): Prestige first shared Control created,
mapped to CC7.5/A1.3, owner assigned, existing Review and Evidence linked.
Observation reopened with retained design/owner/relationships and 3/3 instances
while operating remained Not Assessed. Evidence → Other → populated Control
folder → Evidence Related → Control reopened correctly; original file source
remained the Review. Review evaluation completed without upload and reopened with
all five fields, Notes, attribution and No findings recorded. Narrative save
retained the judgment date; Save & next advanced; Escape returned criterion focus.
New Security-only client onboarded through ordinary UI: 33 criteria, no
Availability/Confidentiality panel, shared guidance, first narrative save retained
Not assessed, explicit partial-status save recorded a judgment, later narrative
save retained it. An additional disposable client completed general onboarding
without a framework, then enabled SOC through Program Configuration: original
baseline still says Does Not Apply, all 17 Policy records retained, 8 mapped
Reviews initialized, 33 criteria, shared checkpoint and first-Control entry point.
No API/manual storage manipulation or re-onboarding was used for these checks.

Workspace checkpoint and criterion drawer checked at **1440, 1280, 1024 and
768 px in light/dark**. No document horizontal overflow; settled drawer content
fits its surface. Description text and date metadata remain readable. Keyboard
Enter opened the criterion; Escape returned to `requirement-CC1.1`. Prestige
draft protection and Save & next also verified. Captured console errors: none.
Temporary browser viewport reset, QA tab closed, local dev server stopped.
Screenshots retained outside the repository in the task's `outputs` folder.
These checks are focused Demo workflow evidence, not a claim of whole-application
accessibility conformance or persistent backend/browser verification.

## Integrated release gate

No `mongod`, `mongosh` or Docker command and no Mongo listener at localhost:27017
were available in the current targeted checks. Standard non-Demo frontend startup
with localhost backend configuration was rejected by execution policy. It was
not retried through an alternate launcher or bypassed. Therefore actual browser
→ normally authenticated API → isolated real Mongo, database restart durability,
and persistent end-to-end evidence bytes are **not verified**. Mock route tests
and Demo browser checks are independent evidence, not substitutes for that gate.
No production database or hosted preview was modified.
