# Onboarding and CIS IG1 implementation

## Scope and architecture

The four steps are Compliance & Requirements, Policies & Governance Documents,
Recurring Reviews, and Review & Create. No framework is required. The six selections
are persisted as client applicability; only finalized applicability drives navigation.

- `frontend/src/lib/frameworkDefinitions.json`: selectable versus implemented metadata.
- `frontend/src/lib/cisIG1.json`: versioned global definitions, classifications,
  grouped Review proposals, Policy relationship rationale, and official source links.
- `framework_assessments`: client-specific responses, ownership, relationships and
  append-only assessment snapshots. Unique client/framework/version/definition index.
- `backend/framework_governance.py`: authorized assessment routes and intentional
  onboarding reconciliation. The session Demo implements the same contract in
  `frontend/src/preview/frameworks.js`, without forwarding requests to a server.
- `FrameworkWorkspace` and `FrameworkDrawer`: register/filter controls and shared
  Sheet/RecordDrawer integration, using the common assessment field contract.
  Future framework implementations add researched definitions/mappings and enable
  their metadata; no parallel Finding, Action, Review or Evidence collections.
- Existing `requirements` remains the program-applicability register, not a fabricated
  control assessment database.

HIPAA, NIST CSF 2.0, ISO 27001, CMMC and SOC 2 Type 2 are selectable working
client-specific placeholders only. They generate no detailed requirements,
framework-specific Reviews, Policy mappings, Evidence expectations or percentages.

## Official CIS basis

Verified 2026-09-15: **CIS Controls v8.1, Implementation Group 1, 56 safeguards**.

- [Official IG1 description and count](https://www.cisecurity.org/controls/implementation-groups/ig1)
- [Official CIS Controls Navigator](https://www.cisecurity.org/controls/cis-controls-navigator)
- [Official CIS assessment specification](https://cas.docs.cisecurity.org/en/latest/source/Controls1/);
  each definition links directly to its corresponding Control page.

Membership by Control (safeguards start at .1): 1:2, 2:3, 3:6, 4:7, 5:4,
6:5, 7:4, 8:3, 9:2, 10:3, 11:4, 12:1, 14:8, 15:1, 17:3.
There are no IG1 safeguards from Controls 13, 16 or 18. Automated tests enforce
this exact identifier set rather than count alone.

Stored content is identifiers, functional titles, concise authored implementation
prompts and source/cadence metadata—not a copy of the CIS publication.
The five classifications are recurring governance/validation, operational cadence,
event-driven, implementation/state, and training/program.

## Default Review proposals

These are **12 optional grouped proposals**, not 56 new Reviews. A disabled proposal
creates nothing. Existing equivalent baseline Reviews are reused without changing
their title, owner, schedule, client cadence, notes, completion or occurrence history.

| Review | Safeguards | Omnisciente default | Basis | Source cadence / qualification |
| --- | --- | --- | --- | --- |
| Enterprise Asset Inventory Review | 1.1, 1.2 | semiannual | CIS recurring governance / validation | 1.1: six-month inventory review; 1.2: weekly operational handling, not weekly human Review |
| Software Authorization & Support Review | 2.1, 2.2, 2.3, 9.1, 12.1 | monthly | CIS recurring governance / validation | 2.2, 2.3 and 12.1: monthly review; 2.1: six-month inventory review; 9.1: implementation state |
| Data Management & Inventory Review | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | annual | CIS recurring governance / validation | 3.1, 3.2: annual review; significant change also triggers 3.1; other safeguards provide supporting context |
| Secure Configuration Process Review | 4.1, 4.2 | annual | CIS recurring governance / validation | 4.1, 4.2: annual documentation review and significant change |
| Account Authorization & Access Review | 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5 | quarterly | CIS recurring governance / validation | 5.1: quarterly authorization validation; 5.3: 45-day operational inactivity threshold; 6.1/6.2: event-driven |
| Vulnerability & Remediation Process Review | 7.1, 7.2, 7.3, 7.4 | monthly | CIS recurring governance / validation | 7.2: monthly process review; 7.1: annual/change review; 7.3/7.4: monthly operational patching |
| Audit Log Management Process Review | 8.1, 8.2, 8.3 | annual | CIS recurring governance / validation | 8.1: annual/change documentation review; 8.2/8.3: implementation state |
| Data Recovery Governance Review | 11.1, 11.2, 11.3, 11.4 | annual | CIS recurring governance / validation | 11.1: annual/change process review; 11.2: weekly operational backups, not a weekly human Review |
| Security Awareness Program Review | 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8 | annual | CIS recurring governance / validation | 14.1: annual/change content review and training at hire/annually; remaining safeguards are training topics |
| Service Provider Inventory Review | 15.1 | annual | CIS recurring governance / validation | 15.1: annual inventory review and significant change; not a separate assurance review for every vendor |
| Incident Reporting & Contact Review | 17.1, 17.2, 17.3 | annual | CIS recurring governance / validation | 17.1–17.3: annual personnel, contact and reporting-process review; significant change for 17.1/17.3 |
| Endpoint Protection Validation | 4.3, 4.4, 4.5, 4.6, 4.7, 9.2, 10.1, 10.2, 10.3 | quarterly | Omnisciente Recommended | No prescribed human-review interval; quarterly validation is an Omnisciente recommendation |

Recurring groups validate the relevant documented process or recurring source
verification together with supporting implementation safeguards. The separate
Endpoint Protection Validation is expressly an Omnisciente recommendation, not
a prescribed CIS human-review frequency. Each definition retains its own
classification and cadence even when grouped.

Examples that must not be conflated:

- 1.2 weekly unauthorized-device handling is operational, not a weekly inventory meeting.
- 5.3's 45-day inactivity threshold is operational account handling.
- 7.3/7.4 monthly automated patching is not a mandatory monthly human patch Review.
  The grouped monthly Review is driven by 7.2's remediation-process review.
- 11.2 weekly automated backups are not weekly human GRC Reviews.
- 14.2–14.8 are training topics, not seven extra recurring Reviews.
- 15.1 provider inventory maintenance is not an annual assurance review for every Vendor.

Onboarding displays source cadence, the recommended default, and client cadence
separately. A less-frequent client cadence than a mapped recurring source minimum
produces a non-blocking warning. Operational thresholds are not reused as human
Review minima. Configured Reviews retain provenance in their drawer and completion
snapshots. Later schedule changes remain in the central Reviews module.

## Policy relationships

Ten existing generic Policy/document categories have researched CIS context.
The catalog contains exact safeguard IDs, basis and caveat per relationship.

Required Document applies only where a matching documented process is explicitly
called for (data management, secure configuration, vulnerability management,
recovery and incident reporting). Supports Requirement identifies supporting
Policy governance, without claiming that the exact standalone Policy title is
mandated (including access, retention, awareness, provider governance and the
information-security Policy's support for log-management process).
The onboarding questionnaire remains generic; it does not fabricate template
documents or map the five placeholder frameworks.

## Assessment and authoritative record flow

Statuses: Not Assessed, In Progress, Addressed, Needs Attention, Not Applicable.
N/A requires rationale. Addressed requires implementation narrative and is not
an audit opinion. Evidence or Action completion never automatically sets it.

The assessment stores implementation, products/technology, notes, an authorized
User assessment owner and a distinct client Contact process owner. No Contact is
silently provisioned as a User. Material changes append timestamped/user-attributed
snapshots and audit events; drafts/keystrokes are not assessment history.

A safeguard Finding creates one normal Finding and one normal remediation Action
using the existing idempotent Finding-to-Action operation. Completing that Action
centrally updates the same authoritative record and moves its Finding to Pending
Validation. A separate authorized validation closes the Finding. Assessment status
still requires explicit professional judgment.

Evidence is uploaded once through the existing Evidence endpoint, appears in the
client Evidence Library, and is referenced by ID. Existing library items can be
linked without copying bytes. Mapped Review occurrence Evidence is also visible.
Related records and reverse links use structured IDs and client scope, not titles.
Comments and Evidence writes use the existing parent authorization architecture.

## Existing data and migration safety

Schema startup creates indexes only; it does not seed or retrofit CIS data.
Only explicit version-3 onboarding finalization initializes the 56 assessments
with deterministic insert-only IDs. GET requests do not configure a client's program.

Re-finalization preserves assessments, owners, narrative, status, Evidence,
Findings, Actions, cadence overrides and Review history. Deselecting CIS removes
active applicability and Review driver flags, without deleting or cancelling
operational records. Its historical assessment workspace remains accessible through
record relationships/direct route; reselecting reuses it. Other framework
deselection removes active navigation without deleting historical program records.

The standard authentication implementation, disabled preview Sign In, Demo-only
entry, five canonical Demo organizations, and standard initialization are unchanged.
Demo changes remain isolated in the browser session. No persistent database was
modified for this implementation.

## Verification and limits

Backend tests exercise actual FastAPI routes with isolated in-memory Mongo.
They are not a persistent Mongo/staging deployment test. Browser QA exercises the
production-built frontend with its explicitly isolated Demo adapter—not standard
authentication against a running persistent backend.

Detailed HIPAA/NIST/ISO/CMMC/SOC 2 mappings, automatic compliance scores, automatic
assessment closure, imported CIS publication text, and standard staging
authentication remain intentionally out of scope. Dashboard/report progress
percentages remain deferred; this workspace presents defensible status counts.

The repository is JavaScript/JSX, with no configured standalone TypeScript check.
The production build performs compilation; targeted hook lint is run separately.
Legacy backend integration suites that require external staging are not claimed
as passed by the self-contained FastAPI suite.

### Release QA — 2026-09-15

- 107 executed backend unittest cases passed across the self-contained route,
  authentication/initialization, lifecycle and framework suites (including imported
  shared harness cases).
- 143 frontend tests in 26 Jest suites passed.
- Targeted hook lint: five new/overhauled framework files, zero errors/warnings.
- Production build passed. Four pre-existing hook-dependency warnings remain in
  Calendar, ClientDirectory, Evidence and PlatformAdmin; no new build warnings.
- Production-build browser workflow passed: three-program onboarding, 56 safeguards,
  12 Reviews, cadence warning, saved narrative/technology/owner, Evidence and comments,
  refresh, central Review completion/history and reverse safeguard links, Finding
  creation, central Action completion, separate validation, explicit Addressed,
  repeat onboarding, two-client separation and widths 768/1024/1280/1440.
- Browser selection matrix passed: no framework, HIPAA only, ISO + SOC 2, CMMC only,
  CIS only, plus CIS + HIPAA + NIST in the workflow test. Verified back/forward
  persistence, exact sidebar items, zero placeholder Reviews, working placeholders,
  status filter chips, required N/A rationale, deselection and retained history.
- Regression browser checks passed: five canonical Demo clients × eleven module
  routes, deferred blank Sign In, Demo logout/reload and no backend API traffic;
  all four Dashboard drill-downs per client, Top 5 and framework scoping;
  AI Governance's central Review/Finding/Action/Evidence/retirement flow and intake.
  The platform Audit Log was separately opened through its actual /admin/audit route.
- Checked changes and nine built JS/JSON/HTML assets for credential/secret literals:
  no findings. No .env, runtime secret, research dump or QA screenshot was added.

Browser checks validate the isolated Demo release. They do **not** claim that a
persistent standard-authentication staging backend has been deployed or browser-tested.
