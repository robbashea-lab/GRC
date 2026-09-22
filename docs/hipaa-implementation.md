# Phase 1 — HIPAA operational workspace

Date: 2026-09-22. Scope: the completed four-phase implementation brief.

## Dataset and interpretation

The versioned catalog contains 67 Security Rule assessment units and nine related
organizational, Privacy and Breach Notification dependencies. Native citations cover
164.302/306/308/310/312/314/316, with dependency records for 164.105, 164.402–414
and 164.530. Standards and their specifications are separately assessable; the
76-record count is not a count of independent obligations or a compliance percentage.
The full Privacy Rule and all individual-rights requirements are not represented
as completed by this Security Rule-focused implementation.

The 22 addressable specifications have explicit as-written, equivalent-alternative
and reasonable/appropriate-determination fields. Rationale is required before
Addressed. Addressable cannot be changed to N/A as an exemption. Other N/A decisions
require scope rationale. Recorded assessments remain human judgments; Evidence,
completed Actions and closed Findings do not automatically satisfy a requirement.

See hipaa-research.md for primary references, currency, proposal exclusions and
cadence interpretation. Federal regulatory text is distinct from the authored
supporting policy mappings. A qualified HIPAA practitioner should review real
entity scope, alternatives, breach decisions and policy sufficiency before use.
This engineering review is not independent legal or compliance assurance.

## Shared implementation

- Backend framework_catalog.py and frontend CATALOGS resolve native definitions.
  Existing CIS definition IDs and deterministic IDs are preserved.
- Explicit onboarding completion or Client Settings Applies initializes insert-only
  assessment records. A previously selected/uninitialized program has an Initialize
  action in Settings. No read-only GET seeds data.
- Single-program Settings changes leave other program selections untouched.
  Deactivation and Unsure retain narratives, Evidence, ownership and history.
- Eight HIPAA human-governance Review proposals have recommendation labels and
  separately explained source cadence, purpose, evidence and completion guidance.
  No suggested annual/quarterly interval is presented as a HIPAA mandate.
- Structured baseline/plan equivalence reuses operational Reviews. Cross-framework
  assessments link to the same Review ID; existing title, cadence, dates, owner,
  occurrences and original provenance are preserved. In an empty test client,
  CIS plus HIPAA creates 18 distinct Reviews, not 20. Plans without a shared
  baseline key remain distinct rather than being merged by a null value or title.
- Deterministic shared insertion IDs protect overlapping concurrent activation.
  There is no copying of Review occurrence or Policy approval history.
- Policy families map into existing Policies, with presence, lifecycle and missing
  mapping feedback in the requirement drawer. Catalog mappings are support
  relationships, not claims that exact document titles are required.
- Vendors may be linked to BA/contract requirements through the authorized record
  linker. Contract/assurance management remains in Vendors.
- Findings use the normal Finding → remediation Action → validation workflow.
  Retry IDs reuse the original Finding/Action pair.
- Evidence can be uploaded once and linked to multiple assessments. Unlink removes
  the current assessment relationship and records an audit event. Original upload
  provenance and the artifact are retained; an explicit exclusion suppresses an
  inherited/original current link without editing historical ownership.
- Evidence-source navigation, Policy/Review reverse links and framework record
  titles resolve the correct framework rather than always routing to CIS.
- Existing Dashboard summaries consume the shared authoritative assessment/work
  relations. Calendar continues to consume the single authoritative Review.

## Data and security boundaries

Server routes authenticate callers, authorize the assessment and linked resource,
and require the same client for links. Read-only accounts cannot edit, link, unlink
or create remediation. Owner eligibility and Contact process ownership use the
existing rules; no membership, permission or authentication change was made.

Standard startup, account initialization and persistent operational data are
unchanged. Only explicit activation adds framework records. Demo creation/reset
initializes selected operational frameworks in the session-local store, including
HIPAA for Dunder Mifflin. Existing Demo sessions are not silently reset.

No destructive migration is required. Deploy the backend with its packaged JSON
catalog before enabling these routes in a standard environment. Docker manifest
and context allowlist both include the catalog. Reverting application code does
not require deleting retained framework records.

## Verification

| Layer | Actual result |
| --- | --- |
| Frontend automated | 338 tests across 62 suites passed with CRACO Jest, --watch=false --runInBand |
| Backend isolated | 179 tests across 28 selected modules passed using unittest; imported duplicate harness classes excluded |
| Client-management regression | Two additional own-class tests passed separately to preserve the existing harness import boundary |
| New HIPAA API tests | Eight tests: catalog/addressability, no mutating GET, Settings activation, repeat/toggle preservation, shared Reviews, concurrent activation, shared Evidence/unlink, roles/tenant scope, and remediation/summary workflow |
| Browser | New-client onboarding; Settings activation; 76 native requirements; 18 shared Reviews; invalid Addressed rejection; addressable decision/save/reload; upload/unlink/relink; one Evidence artifact reused by HIPAA/CIS; Evidence source opens the actual assessment; Finding/Action creation; audit history; deactivate/reactivate preservation |
| Browser regression | Dashboard, Calendar, Reviews, Actions, Findings, Risks, Policies, Vendors, Contacts, Evidence, Onboarding, Settings and both CIS/HIPAA pages load; four widths 768/1024/1280/1440; zero console/page errors |
| Tenant boundary | Real ASGI contributor/read-only/unauthenticated/cross-client denials; browser client switching excludes the other client's assessment content |
| Production build | Passed; tested local preview uses main.f548473a.js |
| UI inspection | Existing light/charcoal design retained; native Specification filter; source and addressability labels readable; drawer/Escape and 10-percent motion inspection performed |

Browser checks used isolated Demo sessions against the production frontend build.
Backend checks exercised actual FastAPI routes against isolated Mongo mocks.
They are not a browser-to-persistent-Mongo staging authentication test.

The configured pytest command could not run because pytest is absent from the
existing test virtual environment. The selected tests are unittest suites and were
run through unittest without changing or bypassing pytest configuration.
Legacy external-service iteration/audit suites were not pointed at uncertain data.

Standalone lint of changed framework code has no errors. The existing RecordDrawer
has two restricted-global confirm errors and 19 warnings under the standalone
React lint configuration; identical results were reproduced from HEAD before these
changes. Store has four pre-existing mixed-operator warnings. The production build
has its existing PlatformAdmin load-dependency warning. No suppressions, dependency
upgrades or unrelated cleanup were introduced. There is no configured TypeScript
type-check for this JavaScript frontend.

## Scoped visual review

| Before | After | Severity / disposition |
| --- | --- | --- |
| HIPAA placeholder; CIS-only labels | Native citation/section/specification table and assessment drawer | High functional gap addressed |
| Addressable could be represented as generic N/A | Explicit decision, explanation and required rationale | High semantic gap addressed |
| Shared Evidence link/navigation gaps | Authorized reuse, unlink and correct source navigation | High workflow gap addressed |
| Existing compact light workspace and charcoal sidebar | Preserved; no new visual language or motion | Approve within this scoped inspection |

No known P0/P1 defect remained in the exercised Phase 1 scope. No independent
security/compliance review or persistent-backend browser validation is claimed.

## Release status

This is the Phase 1 gate record. Git hashes are recorded in the program's final
consolidated report. The local build is verified; publication of the complete
four-phase program is still pending. ISO, SOC 2 and NIST are not marked implemented
by this phase.
