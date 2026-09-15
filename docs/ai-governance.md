# AI Governance

## Architecture and ownership

AI Governance adds a tenant-scoped inventory/context layer, not a parallel GRC engine. `ai_systems` owns identity, business/technical owners, provider/vendor relationship, purposes, data/access, lifecycle, screening, oversight, and explicit related-record references. MongoDB atomically allocates per-client AI-001 display identifiers through `business_counters`; internal identifiers remain primary keys. Unique indexes protect identifiers. Retirement never recycles them.

The shared versioned `aiGovernanceCatalog.json` defines screening questions and taxonomies for FastAPI and the explicitly isolated session-demo adapter. Backend request validation, tenant authorization, and existing roles remain authoritative for standard operation. Standard Sign In remains intentionally deferred in the static preview; backend tests are not a claim of live staging authentication validation.

The register reuses shared column menus, filter chips, AND/OR filtering, sorting, and client-scoped session state. Quick presets cover active, due for review, high tier, third-party, customer-facing, and inactive records. The six-tab drawer reuses the existing drawer and related-record components.

## Screening, intake, and health

Ten screening questions produce an internal governance tier: consequential/HR decisions, autonomous capability, or material harm indicate High; other exposure indicates Moderate; Low requires complete answers with no higher-tier condition. Incomplete screening stays explicit. This is neither a Risk Register score nor a regulatory classification.

Onboarding adds a separately saved Yes/No/Unsure intake and high-level usage indicators. No clears stale indicators and presents a disabled/not-applicable inventory state without deleting historical records. Intake never seeds requirements or operational records or determines legal applicability.

Derived, non-persisted AI health signals identify missing ownership, scheduling, assessment, oversight, or vendor linkage; overdue reviews; sensitive-data use without a completed governance review; high-tier use without an assessed linked Risk; and material change after the last completed review. Correcting the source condition clears the signal. Alerts are recommended governance attention, not automatically created Findings or compliance failures. They are exposed through the AI projection for future reporting; no dashboard widgets or duplicate alert queue were added.

## Authoritative relationships and history

- Reviews are ordinary central Reviews with `ai_system_id` and periodic purpose. Existing occurrence scheduling/completion drives Last Review and Next Review. Quarterly, semiannual, annual, and custom cadence are internal choices, not external requirements.
- Material change is an explicit administrator action with an audit note and derived reassessment alert. The operator opens the existing Review to reassess or adjust scheduling; it does not silently create duplicate work.
- Review → Finding → Action uses the existing workflow. Completing remediation does not validate/close a Finding. Material organizational exposures are linked Risks in the existing Risk Register, which also offers an AI Governance category.
- Third-party providers link existing Vendors. Security assurance and contracts remain vendor-owned.
- Policies use the existing Policy drawer; the optional AI Governance and Acceptable Use Policy is labeled recommended internal practice and created only on request.
- Direct AI Evidence and linked Review-occurrence Evidence are existing Evidence Library records, not copies. Related links resolve in both directions. Existing tenant checks apply to evidence and each target record.
- Retirement retains the AI record, relationships, evidence, audit and occurrence history. It stops future periodic work; already-started closure work can finish once without recurrence. An AI-level mutation lease coordinates retirement with central Review mutations. AI records and linked Reviews cannot be deleted through generic endpoints.

## Requirements and research boundaries

Existing Requirements can be explicitly linked with Context, Explicit requirement, Required activity—cadence not prescribed, Supports requirement, Recommended governance practice, or Omnisciente default classifications. Explicit/required claims require an authoritative citation and applicability rationale. These are user-entered mappings, not automated legal verification. No AI law/framework requirements or certification claims are seeded.

Official sources reviewed for architecture on 2026-09-15:

- [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework) and [Playbook](https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook): voluntary governance concepts, not a blanket mandatory policy or annual cadence.
- [NIST Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence): contextual generative-AI risk guidance.
- [ISO/IEC 42001](https://www.iso.org/standard/42001): management-system context; no copyrighted requirement extracts or unsupported clause/cadence mappings copied.
- [European Commission AI regulatory framework](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai): role/use-specific applicability warrants separate analysis; no legal risk classifications or transition dates hardcoded.
- [OMB memoranda](https://www.whitehouse.gov/omb/information-resources/guidance/memoranda/): federal-agency guidance is not automatically a private-client obligation.
- [Colorado SB26-189](https://www.leg.colorado.gov/bills/SB26-189): jurisdiction-specific automated-decision legislation requires current applicability analysis, not global onboarding inference.

Future assessed requirements can use the existing client-specific compliance architecture. Full NIST AI RMF/ISO 42001/EU AI Act workspaces, automated legal decisions, model monitoring, prompt logging, bias analytics, AI scores, and a separate AI report builder are intentionally deferred.

## Data protection and validation

Initialization adds only indexes for new collections. It does not seed AI records, alter existing client data, or delete non-demo data. Existing demo sessions gain empty AI containers additively. Demo changes remain session-only; standard storage and authentication architecture are unchanged.

Validated on the production-built static preview in headless Edge: Copilot with owner/vendor and Moderate tier; HR screening with High tier; central annual Review completion and next occurrence; linked Finding/Action; recommended Policy creation/linking; Evidence upload; material-change alert; retirement/history retention; two-client inventory isolation; onboarding No; and desktop/tablet widths 768–1440. Separate browser regression checks cover deferred Sign In, five demo clients across eleven existing routes, logout, and absence of unintended API traffic/page errors.

Automated validation: 129 frontend tests across 23 suites; 93 self-contained backend unittest cases including HTTP ASGI authorization/relationships, concurrent identifiers, immutable tenant IDs, foreign Evidence/link rejection, and started closure work after retirement. Production build passes with four pre-existing hook-dependency warnings. This JavaScript repository has no standalone TypeScript check configured. Legacy pytest/live-server suites require their external backend and test environment and were not passed off as executed successfully. Persistent MongoDB/staging end-to-end QA remains deferred with that environment.
