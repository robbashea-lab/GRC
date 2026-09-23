# Requirement basis and provenance

## Inspection and implementation approach

Framework catalogs already own native requirement definitions, verified references,
policy support mappings and Review plans (including source cadence, recommendation
and explicit source minimum). Framework assessments own multi-record related_links.
Reviews retain a primary framework mapping; /related already resolves additional
assessment mappings, including through a Finding. Tasks retain immutable source
pointers. Review occurrences snapshot configuration. These remain authoritative.

Extend these contracts rather than creating a provenance database:

- A shared requirement-basis projection groups existing catalog/assessment mappings.
  Native requirement classification is separate from the supporting record's
  mapping type. Missing source information stays unknown.
- A small validated governance_context object stores organization-entered purpose,
  business classification and cadence rationale on existing records. It cannot
  create framework mappings or assert externally verified mandatory cadence.
- Shared drawer components render purpose, mappings, references and cadence.
  Source links continue using authorized /related records and existing drawers.
- Existing write authorization, optimistic concurrency and audit events apply.
  Review snapshots retain context. No historical records are reseeded or rewritten.
- New generated remediation titles omit the redundant prefix. Legacy titles are
  eligible for cleanup only with explicit generated-title provenance; text alone
  is not proof of system authorship.

No new compliance claims or catalog content are introduced. Existing source
citations remain catalog-owned; custom references are labeled organization-entered,
not authoritative. Links allow HTTPS only; plain citations remain useful without URLs.

The official NIST framework overview, ISO 27001 metadata and HHS Security Rule
summary were consulted to confirm source identity. This work is not a fresh
substantive revalidation of every catalog requirement.

## Validation and boundaries

- Backend: `../workflow-venv/Scripts/python.exe backend/tests/run_isolated.py`:
  359 tests and 260 subtests passed. Uses isolated FastAPI/Mongo test fixtures,
  not the staging database. Includes authorization, cross-client relationships,
  validated context persistence, audit changes and title preservation.
- Frontend: CRACO Jest, 82 suites / 449 tests passed. Includes native terminology,
  multiple mappings, unsafe/missing URLs, unknown definitions, occurrence history,
  retired/deleted sources and demo persistence.
- ESLint: zero errors; existing PlatformAdmin load-hook dependency warning remains.
  Production preview build passed with that warning. No TypeScript check is configured.
- Edge browser against the built Demo application: 14 scenarios passed, no page
  or console errors. Covered ISO rationale editing/reload, multi-framework Reviews
  and Policies, HIPAA Addressable, CIS source cadence, organizational Policies,
  manual Actions, intentional prefix preservation, generated legacy cleanup,
  Assessment/Risk source navigation, Action/Review/Finding navigation, missing and
  retired sources, module smoke checks and widths 1440/1280/1024/768.
- Dependency advisory scan (no dependency changes): 23 advisory entries across
  js-yaml, fast-uri, postcss, svgo, qs and react-router; 16 high and 7 moderate.
  These are scanner entries, not 23 independently confirmed exploitable paths.
  Applicability and upgrades require separate dependency remediation.

No bulk data migration is needed. Optional context is additive; unknown historical
basis remains unknown. A legacy prefix without explicit system-generation evidence
is deliberately preserved. Incident/Other are context-only sources, not invented
modules. Existing Demo sessions retain their data; Reset Sample Data exposes the
new examples. Backend authorization was test-verified; this does not establish
live standard-authentication or persistent staging readiness.

Official source identity checks:
- https://www.nist.gov/cyberframework
- https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- https://www.iso.org/standard/27001

## Main implementation files

Shared backend validation: backend/governance_context.py. Existing CRUD, audit and
authorized relationship projections: backend/server.py. Historical configuration:
backend/review_occurrences.py. Shared client projection and UI:
frontend/src/lib/requirementBasis.js and frontend/src/components/RequirementBasis.jsx.
ReviewDrawer, RecordDrawer and ActionItemFields reuse these components; the Review
register requests its compact Basis projection explicitly. Demo adapter/store and
framework relationships implement the equivalent isolated-session behavior.
