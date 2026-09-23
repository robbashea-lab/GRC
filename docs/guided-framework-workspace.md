# Guided framework workspace

## Inspection / design before implementation

Five substantive catalogs already share `FrameworkWorkspace`, `FrameworkDrawer`, `framework_governance.py` and the Demo equivalent. Catalog-native control/function/category/specification fields provide hierarchy. Assessment statuses, HIPAA addressability, ISO SoA, NIST profiles and SOC management controls have existing validators and must remain unchanged. CMMC has only applicability, not scoring/objectives/POA&M.

Reviews are authoritative operational records. Onboarding reconciliation already groups validated review plans, reuses baseline-equivalent Reviews, and links multiple assessments. Extend this mechanism with a scoped create-or-link endpoint, rather than sequential generic creates that can duplicate after a retry. Existing evidence, notes, comments and assessment history need no migration.

Use metadata hierarchy adapters and a small work-attention projection, not a new assessment engine. Retain catalog order. Resume IDs are UI preferences scoped by user/client/framework, never authorization. Core detail content becomes linear; optional relationship management and activity use secondary disclosure. Existing framework-specific assessment fields remain available.

Source policy: retained regulatory text may be displayed separately; catalog paraphrases remain guidance. Explicit official/licensed text modes require actual supplied text. ISO remains reference-only. No copyrighted text is newly copied. Sources consulted: [CIS v8.1](https://www.cisecurity.org/controls/v8-1), [ISO copyright](https://www.iso.org/copyright.html), [NIST CSF](https://www.nist.gov/cyberframework), and [WAI disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).

## Implemented behavior

`frameworkWorkspace.js` contains native hierarchy adapters, catalog-order grouping, resume/filter/attention helpers, source modes and recurrence presentation. The shared workspace renders sections only when expanded; NIST keeps Function/Category, ISO keeps ISMS/Annex A groups and focused audit/management/treatment/corrective-action views, and SOC keeps category/criteria groups. NIST's recorded-gap view uses native framework order and exposes recorded priorities. No assessment vocabulary or scoring rules changed.

Assessment coverage = assessed applicable records / applicable records. N/A is reported separately and excluded from that denominator. Partial and unresolved assessments count as assessed, not implemented. Needs Attention combines unresolved assessments with linked overdue Reviews, open Findings and overdue Actions without changing assessment conclusions. Resume uses the most recently opened incomplete assessment, otherwise the first incomplete record in catalog order, otherwise an operational-attention record. Preferences are session-local and scoped by user, client and framework.

The drawer presents source, guidance, validation and recurrence linearly. Notes, historical discussion, owners, addressability decisions, SoA, NIST profiles and SOC management controls remain intact. Related records and activity are secondary buttons rather than primary tabs. Previous/Next and Save remain visible while scrolling. Existing-record candidate lists load only when a linking action needs them.

`POST /api/framework_assessments/{id}/reviews` validates the authorized assessment, active program, candidate client, owner eligibility, catalog-plan membership, cadence and date. It reuses equivalent onboarding Reviews without modifying them. New Reviews use the existing model and occurrence schedule, deterministic creation identity and atomic insert; retrying links the same record. A catalog plan can link several requirements to one Review. Explicit existing-Review links preserve that record's schedule and history. Demo uses the normal isolated store and equivalent retry identity. Repeated links do not add duplicate relationships or duplicate link activity.

Operational attention uses three client-scoped field-projected backend reads, not one query per requirement. It does not fetch file contents or occurrence history for those counts. Existing workspace APIs still carry assessment data; no new cache or materialized business-record store was introduced.

## Compatibility and content

No schema migration, assessment reset, status conversion, recurrence rewrite, evidence migration or new content dataset is required. Existing relationship arrays and normal Review fields are reused. Source display supports explicit official/licensed text when trusted text exists, retained regulatory text, and reference-only treatment. Unverified intervals are never synthesized. A grouped plan's explicit interval is attributed only to its cited requirement; ISO/HIPAA catalog-classified recurrence remains organization-defined where no fixed interval is recorded. Governance recommendations remain distinct from operational/event-driven source duties.

The published canonical sample portfolio remains unchanged: Brawndo is the CIS example; Prestige Worldwide remains SOC 2. Existing mature assessments, history, evidence and Review links already demonstrate this workspace. CMMC remains applicability-only because this checkout has no substantive objective/scoring/POA&M implementation. No CMMC mechanics were removed or simulated.

## Verification — 2026-09-23

- Frontend: 85 suites / 463 tests passed (`craco test --watch=false --runInBand`). Additional Calendar projection assertions passed in the 10-test framework adapter suite.
- Backend: reviewed isolated suite passed 361 tests and 260 subtests. The framework-only rerun passed 11 tests and 12 subtests after adding Calendar assertions.
- Build: optimized Demo preview build passed. ESLint: zero errors; one unchanged `PlatformAdmin.jsx:52` hook-dependency warning. Backend emits existing FastAPI lifecycle deprecation warnings. JavaScript project: no configured TypeScript check was claimed.
- New tests cover native grouping/order, expand/collapse, filters/resume, client-mismatched responses, source modes/unsafe URLs, cadence attribution, work attention, Review reuse/retries, multi-requirement mappings, normal Calendar projection, date validation, cross-client links and read-only denial. Existing assessment/notes/history and framework-native validation tests still pass.
- Browser (isolated Edge Demo session, actual optimized build): CIS 56 safeguards / 15 groups; search, filters, collapse/expand, Previous/Next, unsaved warning, save/reload, resume, source link, linked Evidence, Notes/History, Review creation and retry, and Finding → one Action verified.
- Other framework browser checks: NIST 106 outcomes and Current/Target Profiles; ISO 123 records and Annex A SoA fields; HIPAA 76 records and Addressable decision/rationale; SOC 36 in-scope demo criteria and management controls. Counts are client scope, not universal framework totals.
- Browser smoke: Dashboard, Calendar, Reviews, Findings, Actions, Risks, Policies, Vendors, Evidence, Client Profile and completed-onboarding routing. Widths 1440, 1280, 1024 and 768 checked. Reset restored exact canonical Demo records and relationships. No browser console/runtime errors observed.
- Authorization verified through isolated real FastAPI route tests, not a live authenticated production browser. No claim of whole-application accessibility conformance, live production verification or independent security review.

## Defects corrected during validation

- Recursive JSX triggered the existing visual-edit development Babel plugin's recursion limit. Rendering an explicit visible section list preserves native nesting without that plugin failure.
- An organization-defined Review initially risked matching an undefined plan key; equivalence lookup now runs only for a selected catalog plan.
- Demo creation uses the store's actual create contract rather than passing an ID that the store interprets as an update.
- Existing UI tests were updated to assert the requested linear experience instead of removed tab/accordion labels; persistence and authorization assertions were retained.

| Before | After |
|---|---|
| Flat primary requirement register | Collapsed native section workspace with deterministic continuation |
| Core guidance behind tabs and accordions | Linear source/guidance/validation/assessment with secondary relationships |
| No inline normal-Review setup | Scoped create/link with equivalent-Review reuse and retry protection |

No new dependencies, production deployment or hosting changes. Hosted preview publication is separate from this local implementation.
