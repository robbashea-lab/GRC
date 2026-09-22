# Phase 3 — SOC 2 Type 2 internal readiness

Date: 2026-09-22. Sources and access limitations: soc2-research.md.

## Implementation

61 criterion references: 33 Common Criteria, Availability 3, Confidentiality 2, Processing Integrity 5, Privacy 18. Common Criteria are the initial application baseline; optional categories require explicit selection. This is readiness, not an attestation or legal compliance determination.

Scope and a management-selected evidence period are client configuration. Removing categories retains assessments and relationships but excludes them from current totals. Re-enabling restores the same records. Eight suggested recurring Review plans and 14 policy-area mappings reuse authoritative modules. A CIS/HIPAA/ISO/SOC fixture has 288 assessments by default and 23 Reviews; selecting every SOC category increases assessments to 316 without duplicating Reviews.

Criteria contain bounded management-control descriptions, distinct design/operating states, observation periods, frequency, expected/collected instances and population/testing notes. Counts are explicitly entered observations, never file counts or prescribed auditor samples. A later program-period change does not overwrite saved control periods. History retains removed or edited descriptions. No status propagates automatically between criteria or frameworks.

## Verification

- Frontend: 347 tests in 64 suites passed, including four new SOC scenarios.
- Backend: 192 isolated tests in 30 modules passed, including seven new SOC cases; separate ClientManagementTests: two passed.
- Targeted lint: zero errors; two existing mixed-operator warnings in frameworkSummary remain. Production build passed with the existing PlatformAdmin hook warning.
- Browser: exact production asset main.1563f4ca.js; isolated Demo through Edge/Playwright at localhost:4174. Blank login fields, five demo clients, onboarding/Settings activation, 33/36/61 scope counts, retained optional history, save/reload, design vs operation, instance gaps, period preservation, Evidence upload/unlink/relink, Finding + Action creation, deactivation/reactivation, 16 module routes, four widths (1440/1280/1024/768), client switching, zero console/page errors.
- API: actual FastAPI authorization against isolated Mongo fixtures; wrong-client reads/configuration and all supported cross-client links denied; read-only and unauthenticated access denied. Remediation completion/validation retains independent assessment state and original Evidence attribution.
- Negative tests include null/type/enum/date/range/unknown-field and duplicate-control rejection in both API and Demo.

Initial full-suite failures were outdated placeholder expectations in handoff/visibility tests. Updated assertions explicitly verify new SOC counts, retained pre-existing work and repeated-activation idempotence. No tests were disabled.

## UI and boundaries

Shared compact register/drawer retained; native Scope & evidence period and Management Controls sections added. Screenshots reviewed: soc-workspace-qa.png, soc-controls-qa.png and soc-motion-10percent.png (outside Git). Existing 180/240ms drawer transitions inspected at 10%; no new animation or known HIGH visual issue.

No new dependency, authentication, membership, RBAC, standard initialization or destructive migration. No persistent staging authentication or browser-to-real-backend verification is claimed. No private publication yet. Auditor-request tracking is not invented; it remains outside this phase. Management-control descriptions are criterion annotations, not a separate authoritative control register. Licensed AICPA materials and qualified practitioner review remain necessary for an actual examination. No known P0/P1 defect found in scope; engineering gate passed, proceed to NIST CSF 2.0.
