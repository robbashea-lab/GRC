# Brawndo CIS IG1 product review — 2026-09-23

## Scope and method

Browser-first review of the local synthetic Demo: existing Brawndo Profile/configuration, CIS overview and sequential assessment, plus a separate `Brawndo — onboarding QA` client created through the normal UI. The canonical Brawndo baseline was not reset. Test mutations remain local browser-session data; they are not seed changes or real client data.

The new presentation remains restricted to Demo `demo_brawndo` and `cis-ig1`. No schema, permission, scoring, framework mapping, recurrence-generation, evidence-storage or remediation architecture changed. The shared save controller now returns success/failure to its prototype caller; existing callers retain their behavior.

## Findings corrected

| Area | Before | After / rationale |
| --- | --- | --- |
| Overview | In Progress filter differed from assessment terminology; matching results remained collapsed | Partially Implemented label; Brawndo search/filter results expand automatically; visible result count and reset |
| Context | No direct configuration return; last viewed completed safeguard could be hard to locate | Client Profile configuration link and separate last-opened shortcut, without changing next-work prioritization |
| Density | Repetitive zero counters and generic requirement terminology | Compact safeguard summaries; retain meaningful nonzero conditions; expose existing overdue Action count |
| Evidence | Filenames alone obscured meaningful evidence titles | Existing display names, filename fallback, type/date, searchable picker and explicit no-match state |
| Persistence expectations | Evidence changes and assessment drafts appeared to share save behavior | Explain that links/uploads save immediately and assessment text saves separately |
| Sequential work | Save followed by a separate Next click | Save & next only navigates after successful authoritative save; disabled while separate Finding/Review/comment drafts exist |
| Finding form | Description used a single-line input | Multiline description; existing Finding-to-Action workflow retained |

## Browser evidence

- Fresh onboarding: compliance → 17 policy responses → 12 recurring Review proposals → review/create → Active Profile. CIS contained all 56 Not Assessed safeguards. Ownership/setup gaps remained visible rather than being fabricated.
- Mature Brawndo: reviewed Implemented, Partially Implemented, Not Implemented / Needs Validation and Not Assessed records; safeguards 2.1, 2.2, 5.3, 5.4, 6.1 and 6.2 included empty and populated evidence/remediation states.
- Edited implementation/status, saved, moved Next/Previous, closed/reopened, navigated through Profile and returned, and refreshed. Saved narrative, status and Finding relationship persisted.
- N/A without rationale: save rejected, no navigation, draft retained. Dirty navigation offered Keep editing / Discard; Keep editing retained the narrative.
- Linked existing evidence by meaningful title and invoked download. Opened an existing Finding and created one synthetic Finding through the existing endpoint; its single associated corrective Action was visible. No separate task creation was introduced.
- Search, status filter, clear filters, section expansion, last-opened shortcut and configuration return exercised.
- Viewport checks: 1440×900, 1024×768 and 768×1024. Dialog/document bounds had no horizontal overflow. Header/footer actions remained available; tablet uses the existing stacked layout. Browser screenshot capture was clipped at some override sizes, so DOM geometry supplemented visual inspection.
- Keyboard: footer Tab sequence, dialog focus containment and focus return to the safeguard button verified. Existing native status controls and labels retained.
- Globo Gym CIS spot-check retained its original overview labels and legacy drawer; prototype activation also has automated negative-scope coverage.

## Intentionally unresolved / needs a separate decision

1. **Onboarding Review date handoff:** a first due date entered during the synthetic onboarding walkthrough was blank in the resulting Enterprise Asset Inventory Review. All 12 Reviews showed Needs Scheduling. The Demo reconciler accepts `due_date` but initially sets new Review status to `needs_scheduling`; the precise cause of the blank date was not established. Do not infer successful scheduling from onboarding completion. Reproduce with request-level tracing before changing shared persistence/generation semantics.
2. **Legacy baseline presentation:** canonical Brawndo's historical baseline had blank policy/review counts and unassigned original people, while current configuration was populated. No historical values were invented or rewritten.
3. **Shared dialog warning:** normal linked-record dialogs emit Radix's missing description warning. No runtime crash observed; shared dialog accessibility remediation was not propagated outside this prototype scope.
4. Official CIS content remains reference-only with separately labeled Omnisciente guidance. No licensed text or new compliance interpretation added. Existing source link presence was verified; publisher content/licensing was not re-audited.
5. The new-client QA path deliberately does not activate the canonical-client-only prototype. No changes to shared onboarding controls were made.

## Automated verification

- Full frontend Jest suite: **88 suites, 493 tests passed** (five new tests).
- New tests: successful/failed Save & next, separate draft protection, evidence search/no-match behavior, Brawndo-only filter/reset behavior, last-opened resume.
- Existing coverage retained: authoritative relationship endpoints, no duplicate task POST, failed-save draft retention, scope/role restrictions, load failure/retry, grouping/order and client-response isolation.
- Optimized Demo build succeeded. Build ESLint reports the existing `PlatformAdmin.jsx:53` effect dependency warning; Node reports an `fs.F_OK` deprecation. No warnings suppressed. No standalone TypeScript target exists.
- `git diff --check` passed. No dependency changes. Backend was not changed or dynamically retested in this UX review.

This is not full accessibility conformance or non-Demo staging validation. Real Safari, screen-reader use, reduced-motion playback and network-failure browser injection were not tested; request/load failures have component-test coverage. Fully assessed state was not manufactured by rewriting all 56 records.

## Publication boundary

Publish only the existing static synthetic Demo Site and the feature branch. Preserve the Site audience. Do not update GitHub main, Railway, real-client storage or production infrastructure. Commit/version status is reported separately after publication completes.
