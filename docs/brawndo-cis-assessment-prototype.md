# Brawndo CIS IG1 assessment prototype

## Scope and architecture

The wide assessment view is enabled only when the signed-in workspace is Demo,
the selected client is `demo_brawndo`, the assessment belongs to that client,
and its framework is `cis-ig1`. Other clients/frameworks keep FrameworkDrawer's
existing presentation. This gate is not an authorization control.

FrameworkDrawer continues to own loading, permissions, draft protection,
concurrency tokens, saving and authoritative relationship operations. The new
BrawndoCisAssessment is its presentation layer. No backend, schema, catalog,
seed, status vocabulary or stored-record migration is changed.

## Interaction decisions

- Centered 88vw workspace, capped at 1440px; approximately 75/25 main/detail split.
- Linear assessment steps: requirement, status, implementation, evidence, gap.
- Secondary ownership, recurrence, relationships, discussion and history.
- Existing implementation narrative is primary; old notes remain separately
  available rather than being merged or overwritten.
- Native radio status choices preserve all five existing values, including
  Not Assessed and the combined Not Implemented / Needs Validation state.
- CIS content remains reference-only: existing publisher link and requirement
  title, with explicitly labeled Omnisciente guidance. No licensed text added.
- Evidence links, uploads/downloads and Finding-to-Action creation use existing
  endpoints. Reviews remain normal authoritative Reviews.
- Previous/Next and Close preserve the existing explicit draft-discard guard.
- Header/footer stay fixed; only the body scrolls. Errors remain beside Save.

## Verification, 2026-09-23

Automated coverage adds ten tests for activation boundaries, hierarchy, source
treatment, retained fields, save payload/concurrency, unsaved navigation,
evidence/Finding endpoints, source navigation, read-only access, and failures.

Commands used (frontend directory unless indicated):

```
CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand
CI=false node scripts/preview.cjs build
# Repository root, existing isolated backend environment:
../workflow-venv/Scripts/python.exe backend/tests/run_isolated.py
git diff --check
```

Final results: 88 frontend suites / 488 tests passed; 383 backend tests and
567 subtests passed (eight existing FastAPI lifecycle deprecation warnings).
Optimized build and diff whitespace checks passed; the build retained the
PlatformAdmin warning noted below. No TypeScript migration or new dependency
was introduced.

Browser QA used the actual local Demo app and synthetic session data:

- Confirmed all 56 safeguards remain represented.
- Changed status/narrative, saved, navigated Next/Previous, closed/reopened and
  reloaded; saved values persisted. Technology and old notes remained available.
- Tested dirty navigation cancellation/discard and N/A validation without a
  rationale; failed saves retained the draft and did not change saved status.
- Linked existing evidence and opened its download.
- Created a Finding and verified its associated Action Item in normal drawers;
  opened a related Review and assessment/activity history.
- Checked keyboard focus, Escape, focus return, and responsive desktop/tablet
  layouts at 1440, 1280, 1024 and 768px without horizontal overflow.
- Opened Globo Gym CIS, ISO, HIPAA, SOC 2 and NIST assessments: each retained the
  legacy drawer and did not activate the prototype. CMMC was not modified or
  dynamically retested in this scoped task.

The UX pass corrected focus return, outer-container focus scrolling that could
clip the header, and offscreen save errors. Existing nested RecordDrawer
description warnings and the existing PlatformAdmin hook-dependency build
warning are outside this presentation-only change. The publisher URL was
preserved; automated external retrieval encountered HTTP 429, so external
publisher availability is not asserted.

No existing client data was reset, migrated or deleted. Browser QA mutations
were limited to the isolated synthetic session and are not fixture changes.

## Preview boundary

Local preview: http://127.0.0.1:4175 (Explore Demo -> Brawndo -> CIS IG1).
The available Sites deployment action targets the live site, not a separate
development preview. It was not invoked under the no-production instruction.
No Railway environment, main branch, access audience or production service was
updated by this prototype.
