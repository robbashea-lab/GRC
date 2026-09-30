# Brawndo Policies pilot — local implementation and QA

Date: 2026-09-30. Branch: `codex/brawndo-policies-pilot`.
Base commit: `69d9299df0845eafaf18f965ad70f3317c3f857d`.
Local preview: http://localhost:4179/policies (Explore the demo → Brawndo → Policies).

## Scope and architecture

The existing `isBrawndoReference` gate requires Demo mode and `demo_brawndo`.
The register, centered RecordDrawer, labels and optional approval-draft reporting
are enabled only through that gate. Review completion changes are confined to
Brawndo Policy Reviews in the Demo adapter. No backend, schema, seed, dependency,
permission, or global migration changes. The original QA pass was local-only.

Policies still own documents and their approval provenance. Reviews own recurring
execution and schedule synchronization. Evidence, comments, activity and approval
actions continue through their existing endpoints/components. No annual Review
is created merely by opening, uploading or editing a Policy.

| Before | After | Why |
| --- | --- | --- |
| Workload summary cards and Presence column | Document register and precise Framework Alignment | Review workload belongs in Reviews; policy alignment is not a compliance conclusion |
| Presence plus Lifecycle fields | One Policy Status control with retained legacy states | Reduce competing classifications without migrating records |
| Narrow side drawer | Existing wide, centered pilot shell | Keep readable form, sticky actions and keyboard focus |
| Scattered governance and approval explanations | One requirements/alignment section; approval history remains accessible | Separate document purpose from actual approval authority |
| Fixed projection from an old Review due date | Next Policy Review calculated from actual completion | Overdue execution cannot produce a misleading current schedule |

## Status and data preservation

- Pending Approval is the presentation of `in_review` with an actual approval request.
  Existing `in_review` without a request stays In Review. This does **not** invent
  a distinct review-complete event or change the underlying workflow.
- Approval is unavailable as an ordinary field shortcut. Existing document-basis,
  submission, decision and authorized external-approval verification paths remain.
- Missing, retired, excluded and ambiguous legacy records are not silently
  reactivated or approved. Hidden legacy context remains read-only and stored.
- New drafts have no automatic review/approval dates. The record is created first,
  then the existing Evidence tab supplies upload/link functionality in the same modal.
- Existing approved imports default only Next Review to an annual calendar date
  based on actual Last Reviewed, or today if none is supplied. Existing schedules
  and actual historical approval/review dates are retained.
- Policy Review completion uses its actual completion day and configured cadence.
  Quarterly/custom/one-time overrides are retained. The completion snapshot and
  Policy schedule use the same result; no duplicate Review is created.
- A draft revision retains prior approval snapshots and review dates. A new file
  cannot approve itself. Linked Review dates cannot be overwritten by import metadata.
- Approval drafts block tab changes and ordinary field edits until saved; failed
  saves keep drafts open. Nested requirement navigation retains Policy edits.

## Alignment/source treatment

Catalog mappings and explicit client-owned assessment links are used, never title
matching. References resolve to that client's exact assessment. Only applicable
IG1 definitions are shown. Missing relationships remain missing rather than
claiming there is no possible external relevance.

No `Required by` policy claims were added: current mapping labels do not establish
that a separately titled Policy is explicitly mandated. The official CIS Control 4
source supports IG1 safeguards 4.1 and 4.2 and their documented-process cadence,
not an invented standalone-policy mandate:
https://cas.docs.cisecurity.org/en/latest/source/Controls4/

No copyrighted source text or framework requirements were added or changed.

## Automated checks

Final result: **9 suites, 52 tests passed**. Optimized build succeeded;
local JavaScript bundle: `main.b58aa58c.js`. `git diff --check` passed.

Run from `frontend` with `CI=true`:

```text
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --runTestsByPath src/pages/BrawndoPolicies.test.jsx src/lib/brawndoPolicies.test.js src/preview/brawndoPolicies.test.js src/pages/BrawndoReviews.test.jsx src/pages/BrawndoRisks.test.jsx src/preview/policyApproval.test.js src/preview/policyProvenance.test.js src/lib/reviewOccurrences.test.js src/preview/actionItems.test.js
```

Coverage includes client switching, centered/new forms, legacy states, failed-save
and approval-draft retention, explicit and cross-client mapping exclusion, date
sorting/nulls, leap dates, cadence overrides, completion snapshots, reload reads,
document upload/version preservation, protected approval actions and existing
Reviews/Risks/Action Items regression checks.

Build from repository root: `node frontend/scripts/preview.cjs build` with `CI=false`.
The existing `PlatformAdmin.jsx:53` hook dependency warning and Node `fs.F_OK`
deprecation are outside this change. The targeted suite is not a full application
or production-security certification.

## Browser checks

Used the optimized Demo build on loopback port 4179, not the older dev server on
4178. Synthetic QA Policy/Review records were created only in this isolated local
browser session; seeded baseline records were not reset or rewritten.

- Brawndo register: seven requested columns, no replacement summary cards,
  categorical status filter without alphabetic sorting, Draft filter plus search,
  clear filter, Latest First date ordering.
- Centered create/edit, blank draft dates, save/close/reopen/browser refresh.
- Specific CIS 4.1 reference opens the correct safeguard; returning preserves an
  unfinished title. Cancel opens a discard confirmation.
- Existing Evidence search/link survives reload; posted synthetic comment survives
  reload. External document/version basis and external-approval import verified.
- Annual import date default verified with blank approval/review dates. Subsequent
  version change preserves the schedule and displays the prior approved version.
- Approval-detail draft cannot leave via the Evidence tab or edit ordinary fields.
- Created a synthetic annual Review linked to the QA Policy, scheduled it for
  2026-09-20, opened it through Policy details and completed it on 2026-09-30.
  Last Reviewed became 2026-09-30 and Next Review 2027-09-30. The completed
  occurrence remained in Review History; dates refreshed immediately in the parent
  Policy and survived a full reload. The Policy remained Draft, not Approved.
- 1440, 1024 and 768px: settled dialog bounds stay within viewport, no horizontal
  dialog overflow, readable forms and footer. Screenshots in
  `test-results/policies-pilot/`.
- Keyboard: initial heading focus, 24 successive Tab interactions remain within
  the modal; Escape restores focus to the opening Policy row.
- Dunder Mifflin: original summary cards, Presence column and right-side creation
  drawer remain. Switching back restores Brawndo's pilot.
- Browser console: no warnings/errors during the checked paths.

## Remaining boundaries

- This pilot does not introduce a new independent In Review → review-complete
  state machine. It preserves the product's existing verification/submission model.
- No global framework rollout, historical backfill, fake dates or new approval rights.
- Most seeded Policies do not have individual linked recurring Reviews. Existing
  source records are preserved; the pilot does not manufacture one per Policy.
- Automated tests cover uploads; browser checks use existing Evidence linking.
  This is local Demo QA, not non-demo staging/authentication or real file-storage QA.
- Following local acceptance, the user authorized GitHub push and publication to
  the existing ChatGPT Demo preview. Publication status is reported separately
  after remote verification; no backend deployment is included.
