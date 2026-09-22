# Phase 4 — NIST CSF 2.0 implementation gate

Date: 2026-09-22. Research: nist-csf2-research.md.

## Implemented

Six Functions, 22 Categories and all 106 nonconsecutive official Subcategory identifiers. Each has an original implementation prompt, source, outcome classification and practical category-specific evidence examples. Nine recommended Reviews and 17 partial policy-area mappings reuse authoritative records. NIST outcomes are not legal mandates; recommendations do not prescribe a NIST cadence.

Current Profile uses existing assessment state/narrative. Target Profile selects outcomes with explicit intended state and priority. Gap decisions require a target and rationale. Prioritized Gaps orders explicit gaps by critical/high/medium/low, never an invented score. Saving a target or declaring alignment cannot change assessment status, close Findings, complete Actions or alter other frameworks. Historical profile decisions remain readable. Function/Category filters use the existing shared table controls.

One client-wide profile pair is supported. Multiple scoped profiles, contextual Tiers and a separate SP 800-53 register are intentionally not added. The existing needs_attention state is presented as Not Achieved / Needs Validation, not split into new lifecycle values. A licensed or qualified assessment is not replaced by software status.

## Verification

- Full frontend suite: 351 tests / 65 suites passed. An additional ordering/prototype-field regression then passed in the focused five-test CSF suite; final combined suite will include it.
- Full isolated backend: 198 tests / 31 modules passed. Separate ClientManagementTests: two passed. Six CSF API tests included.
- Targeted lint: passed without warnings. Production build: passed with the pre-existing PlatformAdmin hook warning. Final phase asset: main.9973f3b1.js.
- Browser production Demo: 106 outcomes; new client with all five programs has 394 assessments and retains its original 23 Reviews and Policy records; Target/Gaps empty states, invalid blank target rejection, saved target/gap/priority, Current Profile state, reload/history, Evidence upload/unlink/relink/share with HIPAA, Finding + Action creation, Does Not Apply/Unsure/Applies retention, 18 module routes, four desktop/tablet widths and client switching. Zero page/console errors.
- Real FastAPI tests against isolated Mongo fixtures: read-only mutation denial, wrong-client direct/related/activity access, all supported cross-client record/Evidence links, unauthenticated denial, null/type/length/unknown-field validation and CSF-only input enforcement. Remediation completion and validation retain independent assessment state.

No GET or standard startup seeding; explicit activation remains idempotent. No source-record migrations, deletion, authentication, role, membership, Contact/User or lifecycle changes. No persistent staging/browser-to-backend authentication claim.

## Scoped visual review

Before: placeholder program. After: approved compact register/drawer with Function/Category filters and Current/Target/Gap views. Reviewed csf-workspace-qa.png, csf-profile-qa.png and csf-motion-10percent.png outside Git. Existing 180/240ms drawer motion inspected at 10%; no new motion, known HIGH visual issue or scope P0/P1 defect. Proceed to the requested final cross-framework mapping and combined-program QA, then private publication and stop.
