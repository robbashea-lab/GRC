# Brawndo Risk workspace pilot

Local implementation on `codex/brawndo-risks-pilot`, based on
`3733275badf04a7fb68587fc637777f98b0c2fe0`. No push, merge or publication.

## Scope and preservation

- UI activation uses the existing `isBrawndoReference` gate: Demo Mode and stable client ID `demo_brawndo`.
- Shared Risk register and detail retain their original presentation for other clients. Demo-only persistence extensions are scoped to Brawndo. Backend, permissions, scoring thresholds, schema and dependencies are unchanged.
- Existing IDs, categories, legacy monitoring treatment, deliberately configured dates, evidence and decision/review history are retained. No migration or reseed.
- New records default to Annual, twelve calendar months ahead, and Not Yet Decided. Ordinary edits do not establish a Last Reviewed date.
- Completed Brawndo Risk Reviews schedule from actual completion; an authorized explicit override is retained in the occurrence snapshot.
- Acceptance remains a dedicated authorized decision; selecting proposed Accept cannot create an acceptance. Action completion cannot rescore, accept or close its Risk.

## Changed areas

- `RiskRegister.jsx`: stable clickable summaries, synchronized views, categorical filters, date-sort labels, centered creation.
- `BrawndoRiskFields.jsx` and `brawndoRisks.js`: pilot presentation, categories, treatment, boundary predicates and calendar defaults.
- `RecordDrawer.jsx`: centered Risk detail, guarded draft/save/decision navigation, footer actions, source navigation and retained related work.
- `RiskGovernanceFields.jsx`: Other descriptions, linked sources and explicit schedule overrides.
- `ReviewDrawer.jsx` / `BrawndoReviewDetails.jsx`: native Risk reassessment, completion-based date presentation, changed-field submission.
- Demo `decisions.js`, `risks.js`, `reviews.js`: narrowly scoped status/treatment and scheduling support.

## Verification

Targeted CRACO run: **8 suites, 30 tests passed**:

- `pages/BrawndoRisks.test.jsx`
- `pages/BrawndoReviews.test.jsx`
- `preview/brawndoRisks.test.js`
- `lib/brawndoRisks.test.js`
- `preview/risks.test.js`
- `preview/authorization.test.js`
- `preview/brawndoActions.test.js`
- `lib/riskRegister.test.js`

Coverage includes date boundaries, leap years, unassigned/undated/closed records,
accepted severity, stable summary totals, client switching, legacy preservation,
ordinary edit scheduling, proposed vs authorized acceptance, direct-status denial,
review completion/override/history, independent Action completion, draft protection,
and existing Review failed-save behavior.

Browser checks at localhost: creation with undecided treatment; Other category and
source persistence; edit/save/reload; unsaved Cancel; nested Review completion;
acceptance with expiry; one Risk-linked Action created and completed without
changing Risk severity or acceptance; explicit closure; retained baseline evidence
and linked Actions; search/summary clearing; date-sort menu; Dunder Mifflin original
register. Synthetic QA Risk and Action were completed/closed through normal
workflows; existing baseline risks were not reset.

Visual checks at 1440, 1024 and 768 pixels: centered modal within viewport,
contained scrolling, readable tabs and usable footer. Keyboard checks: initial
heading focus, Tab traversal and wrap inside dialog, Escape and focus return.
Console inspection returned no captured warnings/errors in the final local tab.

## Limits and follow-up

- Full frontend suite was attempted. The five-year
  `multiFrameworkLifecycle.test.js` failed with Demo storage quota exhaustion at
  approximately 4,973,751 stored characters. The remaining long-running full
  suite was interrupted; no full-suite pass or pre-existing-failure claim is made.
  This capacity issue was not expanded into a storage redesign.
- Build reports the existing `PlatformAdmin.jsx:53` hook dependency warning and
  Node's fs.F_OK deprecation warning; no warnings were introduced in changed files.
- Dynamic validation was Demo-only, not a server-backed staging or security test.
  Every role/browser combination and every origin type was not manually exercised.
- Source choices reuse supported relationships. No separate Incident subsystem
  or invented framework source was added; Other can document unsupported origins.
- Production, GitHub main and ChatGPT Sites are unchanged.

## Local preview

`http://127.0.0.1:4178/risks` — enter Demo, select Brawndo, then Risks.
The development server is left running. Changes are uncommitted.
