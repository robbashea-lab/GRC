# Framework operator experience program

Scope: usability of the existing working datasets. This is not a framework-correctness, legal, licensing or certification audit. No requirement identifiers, lifecycle values, authorization rules, recurrence schedules or source records are migrated.

## Phase 1 — CIS IG1

Established the shared operator pattern using all 56 existing safeguards. Each opens directly to reference, plain-English meaning, assessment state and a single primary Assessment notes narrative. Implementation/evidence guidance is contextual to the CIS control family; source semantics remain safeguard-specific. Expanded governance details distinguish source cadence, recommended setup cadence and the actual linked Review. No Reviews are created by viewing or assessing an item.

The primary narrative uses the existing `implementation` field. Existing `notes` remain editable in a secondary disclosure and readable in History; no migration or silent merging. Existing status values remain unchanged. Display labels explain partial implementation and the existing combined absent/unvalidated state rather than inventing new persistence states.

Finding creation retains source context and prefills editable titles and the saved narrative. The existing API still creates one Finding and one remediation Action. Evidence remains one authoritative Library artifact. Evidence relinking resets the selector so unlink/relink is repeatable. Related records open in nested existing drawers without leaving the assessment.

Navigation uses client-scoped assessment deep links, Previous/Next within current results, retained search when closing and the existing session-scoped table filters. The shared drawer warns before discarding an unsaved assessment, Finding draft or discussion comment. Browser refresh warns through the native before-unload mechanism. Saved record selection derives from the URL and current results, avoiding a competing stale selection cache.

Browser gate: CIS assessment, notes, partial state, upload/download/unlink/relink, Finding and Action, remediation completion, separate Finding validation, manual reassessment, two historical decisions, Previous/Next, draft keep/discard, direct link/refresh/back/forward, keyboard tabs, search retention. Passed. Eighteen module routes and four desktop/tablet widths exercised, shared Reviews unchanged, wrong-client assessment excluded, no console errors.

Accessibility: reused the existing Radix tabs and alert dialog rather than custom keyboard logic; source/reference links and disclosure headings have readable names. Consulted the [WAI-ARIA APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) for arrow-key/focus semantics. This is not a whole-application accessibility conformance claim.

## Phase 2 — NIST CSF 2.0

Replaced repeated title-based prompts in presentation with 106 distinct original explanations and practical guidance for all 22 Categories. The existing source identifiers, titles, Functions and Category structure are unchanged. Guidance is explicitly Omnisciente summary, not quoted NIST text; the authoritative reference remains adjacent. Current Profile uses Assessment notes; Target and gap decisions stay separate and do not automatically create Reviews, Findings or Actions.

Gate: 11 focused automated tests passed; production build and targeted lint passed. Browser operator lifecycle passed for NIST, including Current/Target explanation, saved target, high-priority explicit gap and gap view. Eighteen-route smoke test, four widths, wrong-client exclusion and unchanged shared Reviews passed. No console errors. NIST screenshot reviewed; native outcome terminology retained.

## Phase 3 — HIPAA

Separated the existing regulatory wording from 76 original plain-English explanations. Short regulatory passages appear open; longer passages are expandable without removing the source. Practical implementation and evidence guidance is grouped by the existing regulatory section. Specification labels are visible near the citation. Addressable is explicitly not optional; the existing decision/rationale workflow and server validation are untouched.

Gate: 13 focused automated tests, targeted lint and production build passed. Browser operator lifecycle passed, including an additional addressable specification: absent decision rejected, as-written decision/rationale saved and retained in History. Eighteen routes, four widths, unchanged Reviews and wrong-client exclusion passed with no console errors. HIPAA screenshot reviewed. No recurrence, regulatory dataset or copyright/licensing status change.

## UI review

## Phase 4 — ISO/IEC 27001:2022

Kept the 30 existing ISMS explanations and added 93 distinct original Annex A explanations with item-specific evidence examples. Shared practical guidance follows the ISMS clause/control family. Specification labels distinguish ISMS requirements from Annex A/SoA. Existing SoA applicability, justification and status constraints remain authoritative. No licensed standard text was added or removed; concise summaries and source references remain explicit.

Gate: 13 focused automated tests and production build passed. Browser operator lifecycle passed for an ISMS requirement; Annex A additionally exercised 93-control view, missing-justification rejection, documented exclusion/N/A, direct-link refresh and historical rationale. Internal Audit, Management Review, Risk Treatment and Corrective Actions views loaded. Eighteen-route regression, four widths, unchanged Reviews and wrong-client exclusion passed without console errors. ISO screenshot reviewed. The isolated backend suite also passed: 199 tests across 32 modules, including framework lifecycle and authorization tests.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Medium | FrameworkDrawer.jsx | Context and assessment split into separate tabs | Primary assessment screen; secondary guidance disclosures | Less navigation during client discussion |
| Medium | FrameworkWorkspace.jsx | Closing clears search; no assessment deep link | Preserved search and client-scoped URL selection | Retain investigation context |
| Medium | FrameworkDrawer.jsx | Little save feedback; notes absent from history | Unsaved/saved feedback and both historical narratives | Make persistence and attribution understandable |
| Low | FrameworkContext.jsx | Unstructured cadence details | Source, suggestion and actual Review distinguished | Avoid implying every item is scheduled |

Reviewed the CIS screenshot and tested keyboard tabs and draft dialog. Existing surface motion is retained; slow-motion and reduced-motion checks are recorded in the final gate. No application-wide visual redesign.
