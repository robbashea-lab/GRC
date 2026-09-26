# Year-2 sales demo portfolio

## Architecture and scope

The existing browser-session Demo adapter remains the only persistence boundary for these fixtures. Standard authentication, backend storage, production tenants, deployment configuration, and application layouts are unchanged. No dependency was added.

Initialization and Reset Sample Data use the same `seedStore(clock)` path:

1. `demoPortfolio.js`: canonical client identities, fictional personnel, structured profile context, UTC-relative dates.
2. `demoSeed.js`: clients, contacts/scoped demo users, policies, applicability, original onboarding baseline, reviews, assets, risks, vendors, assessment context.
3. Existing risk/vendor review generation and framework reconciliation.
4. `demoHistory.js`: occurrence snapshots, synthetic documents, normal Finding-to-Action creation and validation, framework assessments through existing validators, and explicitly simulated activity.

Existing session edits are not silently discarded on upgrade. Use **Reset sample data** to load the new portfolio. Reset replaces only the Demo session store; it does not call a production API. The browser store is a demonstration simulation, not a trusted authorization boundary for real records.

## Canonical coverage

| Client | Universe | Program | Contacts | Reviews | Framework assessments | Risks | Findings (open) | Vendors | Evidence |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Brawndo | Idiocracy | CIS IG1 | 4 | 24 | 56 | 4 | 9 (7) | 3 | 40 |
| Dunder Mifflin | The Office | ISO/IEC 27001:2022 | 9 | 27 | 123 | 9 | 11 (5) | 4 | 112 |
| Prestige Worldwide | Step Brothers | SOC 2 (Security, Availability, Confidentiality) | 6 | 23 | 38 | 7 | 12 (7) | 4 | 49 |

**Scope change (2026-09-26).** The Demo was reduced to these three reference clients. Initech (NIST CSF 2.0), Sacred Heart Hospital (HIPAA), Cyberdyne Systems (CMMC applicability) and Globo Gym (multi-framework) were removed as demo organizations only; HIPAA, NIST CSF 2.0, CMMC applicability and multi-framework support remain in the product and its tests. The session store key moved to `grc_interactive_demo_v3`, and reading it discards the retired seven-client `v2` store.

**People.** Two fictional provider GRC staff (a vCISO and a GRC Consultant, platform administrators scoped to their assigned clients) lead the programs and record governance decisions. Each client has a GRC manager, two contributors, a read-only user and a departed employee whose disabled account still owns a closed Finding and one open handover item. Other contacts are business responsibilities without platform access.

**Program data.** Brawndo uses its validated reference tables (`brawndoProgram.js`). Dunder Mifflin and Prestige Worldwide use client program modules (`preview/programs/`) with their own assessment conclusions, narratives, evidence ages, risks, vendors and assessment-derived Findings:

- *Dunder Mifflin*: an ISMS scoped to the Scranton branch, warehouse and supporting corporate IT. All 30 clauses assessed (24 implemented); Statement of Applicability with 90 included, 2 excluded with justification (no in-house development) and 1 undetermined control; 7 nonconformities and OFIs, 4 closed and validated, 1 corrective action overdue; an accepted SaaS concentration risk.
- *Prestige Worldwide*: a SaaS service organization in day ~180 of a 12-month Type 2 observation period, with Confidentiality newly in scope (2 criteria not yet assessed). 49 management controls with instance counts, shared across criteria where one control supports several; 5 open exceptions and 3 closed prior-period exceptions. Readiness conclusions are internal, never a CPA opinion.

Each client also has 17 policies, 6 assets and one annual assessment context.

## Operating story

- Programs began approximately 20 months before the seed date. Initial onboarding snapshots remain separate from current operations.
- Reviews include retained completed occurrences, current in-progress work, overdue work, and future dates. Historical dates follow calendar-month recurrence, with month-end clamping. Current occurrences do not inherit prior occurrence evidence.
- Policies use existing externally recorded approval provenance, not fabricated in-application approval authority. Sixteen are approved; one is a draft revision. Owners and reported approvers remain distinct concepts.
- Risks include active treatment, assessed exposure, accepted exposure, and closed history. Risk posture uses existing scoring/status logic.
- Each Finding uses the existing create-task workflow: one remediation action per Finding. Two findings have validated closure; one awaits validation; one has work in progress. Additional actions show risk, assessment, and manual management origins.
- Vendors have current, due-soon and overdue governance conditions, assurance references and contracts. Shared vendor/occurrence evidence is one stored Evidence Item.
- Framework assessments use actual catalog definitions, statuses, native HIPAA Addressable decisions, ISO SoA inclusion, NIST profiles and SOC readiness fields. Assessment results are simulated, not claims of certification or legal compliance.

Portfolio, Dashboard and Calendar continue to derive values from the normal records/selectors. No display counters or demo-specific health scores were introduced. The portfolio tests assert bounded operational debt, meaningful recent activity, and total reconciliation.

## Evidence and dates

There are 98 lightweight downloadable TXT documents. Every file visibly says `DEMO - SYNTHETIC DATA`. Documents cover four access-review occurrences per client, operating reviews, policy references, vendor assurance, risk assessment and program assessment. Bytes, filenames, dates, source relationships and history are validated.

No PDF/DOCX generator or binary fixture repository was added. Documents are illustrative summaries, not complete professional policy or audit deliverables. A cryptographic file digest is not fabricated; where absent, existing UI reports it as unrecorded.

All canonical dates derive from the supplied clock normalized to a UTC calendar day. IDs, relationships and status distributions are stable. Reset on a later day recalculates relative dates; an existing edited session is not automatically rebased. Tests compare complete same-day seed objects and exercise leap-day/future-year generation.

## Isolation correction

The new scoped-actor test reproduced an existing Demo adapter weakness: the common client-scope guard only ran for GET. The guard now checks writes, both query and body client IDs, direct record targets, relationship parents, unscoped generic lists, and bulk targets. Backend RBAC and membership rules were not changed. This is regression coverage of the simulation, not proof of production authorization security.

## Verification

Validation was performed against the local optimized preview on 2026-09-23.

- Frontend: 83 suites / 455 tests passed, including new deterministic portfolio, relationship, chronology, native framework state, shared mapping, reset and scoped-actor tests.
- Backend: isolated allowlist runner passed 359 tests and 260 subtests. No live backend or production database tests were run.
- ESLint: zero errors; one existing `PlatformAdmin.jsx:52` hook dependency warning. Optimized preview build passes with that warning. There is no separate configured TypeScript check in this JavaScript project.
- Browser: fresh Edge session; all seven clients, 11 major modules per client; all five implemented framework workspaces and the honest CMMC placeholder; review history, policy basis, Action source navigation, evidence relationship details and actual downloads.
- Globo: multi-framework Review basis and layouts at 1440, 1280, 1024 and 768 pixels; page/drawer overflow checks.
- Reset: UI create/edit Action, UI complete Review, simulated asset deletion (no asset register route), then UI reset. Full restored store equals the original canonical store; unrelated local-storage sentinel remains untouched.
- Browser console/page error collection is empty for those flows. This is scoped smoke/interaction coverage, not exhaustive verification of every record or every role in a browser.

Existing tests that required five clients or deliberately unhealthy Brawndo were updated to the new product specification. A legacy policy-date test now builds an explicit legacy fixture; a two-obligation metric test isolates its source records instead of accidentally relying on sparse seed data. Assertions for the underlying behaviors remain.

## Honest capability limits

- CMMC is currently applicability-only. There is no implemented catalog/assessment/SSP/POA&M/scoring/provider-flowdown workspace to seed. Cyberdyne contains connected general GRC and CUI context; no invented CMMC requirements, scores or certification claims. Globo includes all five substantive catalogs, not a pretend sixth implementation.
- Assets/Systems & Scope records exist in the data model, but no dedicated routed workspace currently exposes that register. Six scoped assets per client are populated and relationship-tested; a complete Systems & Scope browser demonstration is unavailable.
- The legacy annual assessment context has no standalone register route. Its connected action can navigate to the source record. Framework assessment drawers are available and were browser-tested.
- Historical completion/activity is explicit synthetic simulation. It does not fabricate historical assessment-progress trends or production audit events.
- No production deployment, preview publication, or Git push is part of this implementation.

## Main changed files

`frontend/src/preview/demoPortfolio.js`, `demoSeed.js`, `demoHistory.js`, `store.js`, `adapter.js`, `demoPortfolio.test.js`, and the existing seed/adapter/portfolio/workspace-mode/core-audit regression tests. Generated builds, browser screenshots and temporary QA scripts are not committed.
