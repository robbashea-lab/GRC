# CIS-P01–P04 targeted implementation checklist

Baseline: `c57a57f0f5549dce7d4c9dc128387823a85af617`, fetched 2026-10-03. Historical assessment findings revalidated on this current main. No open PRs found at intake. Separate checkout/branch `codex/cis-operational-handoff`; parallel ISO checkout left untouched. No merge or publication authorization.

## Decisions

- P01: CIS setup handoff and existing-client workspace show unresolved operating arrangements using catalog source timing, not governance cadence. Existing assessment Owner / Process Owner supplies accountability; existing implementation narrative records method/procedure/external reference. Add only `cis_operation: {provider, confirmed}`; absent legacy values remain unconfirmed. Confirmation means responsibility/arrangement recorded, never Implemented or Verified. Saves use normal authorized assessment concurrency/history and do not alter conclusion states. Method/owner changes require renewed confirmation.
- P03: shared execution briefs derive checks, outcomes, supporting examples and timing from existing versioned guidance/catalog for all 12 plans. Render separately from custom Review content; current guidance is explicitly not historical conclusions. Resolve links from actual authorized CIS workspace identities, including multi-framework driver records. No title matching, description overwrite, automatic task creation or schedule changes.
- P02: compact collapsed supporting records below Findings; existing Evidence picker and normal Review setup/drawers reused. Direct support is distinguished from Review-associated Evidence. Historical occurrence selection uses existing Review history API and initialValues; assessment drafts remain mounted. Review setup drafts block Save & next. Include retained Library relationships as well as original Review uploads, scoped and deduplicated.
- P04: CIS canonical `needs_attention` presentation is Not Implemented; verification remains separate. Other frameworks' labels and statuses unchanged.

## Source validation

Existing reviewed v8.1 catalog remains authoritative. Public CIS CAS pages rechecked for weekly1.2, immediate6.2, monthly automated7.3/7.4, weekly11.2, at-hire/annual14.1, and annual/significant-change3.1/4.1/8.1. Briefs/setup use the catalog's source_cadence and reviewed guidance without a competing timing catalog.

Sources: https://cas.docs.cisecurity.org/en/latest/source/Controls1/ ; Controls3/ ; Controls4/ ; Controls6/ ; Controls7/ ; Controls8/ ; Controls11/ ; Controls14/ on the same official host. No IG2/IG3 additions.

## Verification checklist

- [x] Current baseline / findings / parallel work checked.
- [x] Implement additive CIS-only setup and shared brief, supporting links and canonical label.
- [x] Focused frontend/backend tests; onboarding/replay/later-enable; 20 status combinations; four operating patterns; role/tenant boundaries.
- [x] Browser Brawndo + isolated fresh/later-enabled clients; themes/sizing/keyboard/drafts/history.
- [x] Build, final diff and refetch main: remote remains the baseline SHA; no intervening changes to reconcile.
- Source-control delivery is a working branch and draft PR only. No merge or preview publication; integration gate below remains open.

## Verification evidence

- Frontend: 13 suites / 121 tests pass, including `CisReviewBrief`, `AssessmentShell`, `BrawndoCisAssessment`, CIS operations, onboarding handoff/replay, assessment verification, shared Review plans, Review presentation and framework status tests. Covers all 12 plans / 56 mappings, 20 implementation/verification combinations, stale-client response protection, precise occurrence payloads and retained drafts. CRACO command: `test --watch=false --runInBand --runTestsByPath` for the named suites.
- Backend: `python -m pytest -q -o addopts='' tests/test_cis_operational_handoff.py tests/test_framework_governance.py tests/test_assessment_verification.py tests/test_iso_framework.py tests/test_soc_framework.py tests/test_onboarding_handoff.py`: 82 tests plus 36 subtests pass. Uses normal FastAPI authenticated routes with isolated Mongo mock, not a real database. Four patterns cover provider operation, personnel event, significant change and failed backup follow-up; the latter creates one authoritative Finding/Action on retry and retains a separate gap verification judgment. Read-only, cross-client and cross-framework denials, invalid/null input, archived Evidence exclusion and scoped deduplication are checked.
- `node scripts/preview.cjs build`: optimized Demo build succeeds. Existing Node `fs.F_OK`, FastAPI `on_event` deprecation warnings and bundle-size advisory remain; no dependency or unrelated framework modernization attempted.
- Browser: disposable Edge contexts at loopback port 4195. Brawndo and fresh CIS-only / later-enabled ISO+CIS clients checked. Four operating patterns saved/reopened on each disposable client; existing ISO data retained. Shared briefs link to exact safeguards; nested safeguard → Review focus return verified. Completed Brawndo occurrence opens read-only history with explicitly current guidance. Evidence search/link/download and metadata relationship persistence checked. Finding produces one Action; save/reload, Save & next, Previous, unsaved navigation, unfinished Review setup protection, Escape, focus trapping/restoration, light/dark mode and 1440/1280/1024/768 widths pass. Existing ISO/SOC workspaces open without new CIS panels. No browser runtime errors observed.
- The previous browser harness had stale ISO identifiers and a no-shared-guide assumption. Assertions now target current ISO identity and absence of the new CIS-specific panels, without changing ISO product code. A real nested-dialog focus-return failure was reproduced and corrected locally in the CIS Review link handler.
- Demo file contents are intentionally lightweight/session-limited. Downloads were checked while synthetic content was available; metadata/relationships after reload are not proof of durable object-storage retrieval. Local screenshots and additional targeted browser traces are retained separately under `outputs/cis-operational-handoff-2026-10-03` in the task workspace.
- `git diff --check` passes. No dependencies changed. Additive assessment field only; no destructive migration, reseed, copied tenant data or rewritten historical records. Legacy assessments without `cis_operation` remain visibly unconfirmed.

## Integration boundary

No approved isolated persistent integration target is configured. The real backend stores file bytes as normalized `evidence.content_base64` in MongoDB, with size and SHA-256 metadata; a separate object-storage service is not required by this implementation. Demo session-held downloads do not validate this path. See [PR #24 integration handoff](cis-pr24-integration-handoff.md) for current source provenance, missing prerequisites, prepared commands, acceptance cases and cleanup. Complete real-database frontend/auth/file/restart integration remains an open gate. PR #24 stays draft and unmerged; no preview publication or production deployment is authorized.
