# Phase 2 — ISO/IEC 27001 implementation gate

Date: 2026-09-22. See iso27001-research.md for sources and licensing boundaries.

## Implemented

- 30 native ISMS assessment units and all 93 Annex A references.
- ISMS / SoA / Internal Audit / Management Review / Risk Treatment / Corrective Actions views over the same authoritative assessments.
- Undetermined, included and excluded SoA decisions with justification, independent implementation state, owner, relationships and retained history.
- Clauses cannot be excluded; Annex exclusion requires justification and Not Applicable status. Addressed Annex controls require inclusion and implementation.
- Ten suggested Reviews; 17 partial policy-area mappings. No second remediation, Risk or Evidence data model.
- Existing cross-framework work remains untouched: a CIS + HIPAA + ISO fixture contains 255 assessments and 22 Reviews, not 30 duplicated Reviews.
- Explicit onboarding/Settings activation; GET never initializes, deselection retains data, reactivation is idempotent.
- Existing Demo initialization includes ISO only for clients that selected it. Standard startup/authentication unchanged.

## Verification

| Check | Result |
| --- | --- |
| Frontend configured suite | 343 tests / 63 suites passed |
| Isolated backend own-class suite | 185 tests / 29 modules passed |
| Separate client management class | 2 tests passed |
| New ISO API tests | 6 passed, included above |
| New ISO Demo tests | 5 passed, included above |
| Targeted standalone lint | Passed, no warnings on changed implementation files |
| Production preview build | Passed; pre-existing PlatformAdmin hook warning remains |
| Diff whitespace and credential-pattern checks | Passed |

Commands use the existing CRACO test/build scripts and workflow-venv unittest harness. No configured TypeScript check exists; pytest is unavailable in that environment. External-service legacy tests were not directed at unknown persistent data.

Real FastAPI tests exercised wrong-client GET/related/activity, mutation and configuration boundaries, cross-client Evidence/Policy/Risk/Vendor/Review/Finding/Action links, read-only mutation denial and unauthenticated denial against isolated Mongo fixtures. Existing authentication, assignments, workflows and packaging tests also passed. This is automated server-side verification, not independent assurance or browser-to-persistent-backend QA.

The browser ran the production build at http://127.0.0.1:4174 using isolated session Demo data. Verified:

- Blank login fields and Explore Demo; five canonical clients.
- New-client onboarding followed by ISO activation in Settings.
- Separate 30/93 views and 3 audit, 3 management, 4 risk-treatment, 2 correction and 123 all-record views.
- Clause exclusion rejection, missing SoA justification rejection, valid exclusion, save/reload and history.
- Evidence upload, unlink, reuse, and sharing the same artifact with HIPAA.
- Corrective Finding + remediation Action creation; backend tests separately exercised closure/validation without automatic assessment changes.
- Deactivate/reactivate with unchanged record counts/history.
- 15 module routes, client switching, 1440/1280/1024/768 widths; no page overflow or console/page errors.

Local browser script and screenshots are outside Git: iso-browser-qa.cjs, iso-workspace-qa.png, iso-soa-qa.png, iso-motion-10percent.png. Production asset tested: main.aaad9f11.js. No published-preview update is claimed at this phase.

## Scoped UI review

| Before | After |
| --- | --- |
| ISO placeholder | Existing compact register/drawer language, with native ISO views |
| No SoA decision | Restrained decision section with visible justification and status |
| CIS/HIPAA-specific heading fallback | Catalog-native ISO name and source version |

Approved for this scope: no known HIGH visual findings. Existing light workspace, charcoal sidebar and controls retained. Existing 180/240 ms drawer animations inspected at 10% progress; no new motion introduced.

## Limitations and gate

The catalog uses original implementation prompts, not full ISO text. Public source access does not replace a licensed standard or professional conformity evaluation. Additional non-Annex controls are documented/linked through clause 6.1.3, not a new configurable control register. No certification percentage, auditor opinion, mandatory annual cadence or automatic cross-framework status propagation is produced.

One initial frontend assertion expected only the previous catalog keys; it was updated to include ISO with zero new assessments in the HIPAA-only scenario. The full suite then passed without weakening behavior checks.

No known P0/P1 implementation issue was found in this scope. No unrelated navigation, branding, authentication, membership, permissions, approval authority, source lifecycle or persistent data was changed. Phase 2 engineering gate passed; proceed to SOC 2. Final combined browser validation and private publication remain after the last phase.
