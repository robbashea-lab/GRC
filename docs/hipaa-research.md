# Phase 1: HIPAA Security Rule research and implementation contract

Research date: 2026-09-22. Implementation and verification: see hipaa-implementation.md.

The completed replacement brief controls the program order: HIPAA, ISO/IEC
27001:2022, SOC 2 Type 2, then NIST CSF 2.0. Activation through Client Settings
must not require repeating onboarding. Authorized unlinking removes a relationship,
not the shared Evidence artifact or its historical attribution.

## Authoritative basis and currency

The eCFR current view reported Title 45 current through **2026-09-18** when
accessed. Its point-in-time XML was retrieved directly from the official eCFR
versioner API. Record that coverage date rather than claiming access establishes
the law through a later date. HHS/OCR's current Security Rule summary explicitly
distinguishes the rule in effect from the proposed cybersecurity modifications.
No proposed obligation or deadline belongs in the enforceable assessment catalog.

| Organization | Source / reference | Version or source date | Type / use |
| --- | --- | --- | --- |
| OFR / GPO, HHS regulation | [45 CFR Part 164 Subpart C](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C) | Point-in-time 2026-09-18 | Regulatory text: §§164.302–318; eCFR is authoritative but unofficial |
| OFR / GPO | [Versioned Security Rule XML](https://www.ecfr.gov/api/versioner/v1/full/2026-09-18/title-45.xml?part=164&subpart=C) | 2026-09-18 | Machine-readable primary source, no vendor checklist |
| OFR / GPO, HHS regulation | [45 CFR 160.102 and 160.103](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-160/subpart-A) | Point-in-time 2026-09-18 | Applicability; covered entity, business associate and ePHI definitions |
| OFR / GPO, HHS regulation | [45 CFR 164.105](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-A/section-164.105) | Point-in-time 2026-09-18 | Hybrid/affiliated entities and retained designation documentation; HTML request was blocked, official XML retrieved |
| HHS/OCR | [Summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) | Current page accessed 2026-09-22 | Explanatory summary; regulation governs in a conflict |
| HHS/OCR | [Security Rule NPRM](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html) | Proposal, not current requirement | Reference only; do not implement proposed mandatory frequencies or universal technical measures as current law |
| HHS/OCR | [Risk Analysis Guidance](https://www.hhs.gov/sites/default/files/ocr/privacy/hipaa/administrative/securityrule/rafinalguidancepdf.pdf) | 2010-07-14 | Guidance; no single prescribed risk-analysis method or universal human-review frequency |
| HHS/OCR | [Covered Entities and Business Associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html) | Page reviewed 2024-08-21 | Scope explanation; job title, company name or industry alone does not establish regulated status |
| HHS/OCR | [Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html) | Accessed 2026-09-22 | Related dependency, 45 CFR 164.400–414; not replaced by a Security Rule assessment |

The 2013 amendments remain reflected in the inspected Subpart C text. The
initial 2005/2006 compliance dates in §164.318 are historical, not new client
deadlines. The catalog must preserve references without inventing a recurring
obligation from an initial compliance date.

## Native semantics

Hierarchy: Security Rule section → standard → implementation specification where
present. General rules and organizational/documentation duties supplement the
administrative, physical and technical safeguard sections. The UI must use
regulatory requirement/standard/specification, not CIS safeguard identifiers.

- Applicability requires covered-entity/business-associate context and all ePHI
  created, received, maintained or transmitted in scope (§164.302; §160.103).
- Standards apply to regulated entities; conditional provisions retain their
  actual triggers (clearinghouses, subcontractors, group plans, hybrid entities).
- Required implementation specifications must be implemented.
- Addressable specifications are **not optional** (§164.306(d)(3)). Assess whether
  the specification is reasonable and appropriate; implement it if so. Otherwise
  document why and implement an equivalent alternative if reasonable/appropriate.
  A generic Not Applicable click must not bypass that documented decision.
- Reasonable/appropriate measures consider size, infrastructure, cost and risk
  (§164.306(b)). This is not a blanket exemption from standards.
- Assessment status is internal recorded judgment, not full HIPAA compliance,
  regulatory validation, certification or an auditor's opinion.
- Privacy Rule, breach notification, business-associate contract and hybrid-entity
  dependencies remain explicit references; Security Rule completion covers neither
  all of Part 160 nor all of Part 164.

## Cadence classification

| Activity | Primary basis | Regulatory interval / trigger | Product treatment |
| --- | --- | --- | --- |
| Risk analysis and management | 164.308(a)(1)(ii)(A)–(B), 164.306(e) | Required; changes can require reassessment; no universal annual interval specified here | Optional annual governance proposal, clearly Omnisciente Recommended; event review remains necessary |
| Information-system activity review | 164.308(a)(1)(ii)(D) | Regularly; no fixed interval | Client-defined operational process; a suggested human Review does not substitute for log monitoring |
| Access/termination | 164.308(a)(3)–(4) | Authorization changes and termination; risk-based review | Optional governance Review; never delay termination to the recurring meeting |
| Security reminders/training | 164.308(a)(5) | Periodic reminders; program for all workforce including management | Recommended review cadence is not a mandated annual HIPAA course |
| Incident handling | 164.308(a)(6) | Suspected/known incident | Required response; optional exercise is a recommendation, not the response deadline |
| Contingency testing | 164.308(a)(7)(ii)(D) | Periodic testing/revision; addressable | Suggested exercise cadence expressly recommended |
| Security evaluation | 164.308(a)(8) | Periodic technical/nontechnical evaluation and environmental/operational change | Suggested annual Review, plus actual change-triggered evaluations |
| Business associate arrangements | 164.308(b), 164.314(a) | Before permitting relevant handling; contract/subcontractor conditions | Optional maintenance Review, not invented annual contract renewal |
| Documentation | 164.316(b)(2) | Six years from creation or last effective date, whichever later; periodic review/change updates | Retention obligation, not a six-year Review recurrence |

## Policy and relationship decisions

The regulation requires appropriate policies/procedures and documents; it does not
mandate the product's exact Policy titles. Reuse the existing client policy families
for access, sanctions/workforce, risk, incident response, contingency, data handling,
awareness and supplier governance where their scope actually supports ePHI duties.
Preserve the source identifier and rationale on each relationship. Missing policy
content is not fabricated or represented as approved.

Use one authoritative Review/Policy with multiple assessment links. Reconciliation
must preserve existing title, owner, cadence, dates, occurrences and approval state.
Do not overwrite CIS provenance when HIPAA also uses that record. An explicit
existing-record link remains available when no structured matching key establishes
equivalence. Reuse uploads by Evidence ID; never copy bytes per framework.

No crosswalk is established by similar wording or shared governance. Official
mapping research is separate from an Omnisciente-authored support relationship;
neither implies equivalence or propagates Addressed status.

## Inspected architecture / required changes

Current `framework_governance.py`, Demo `frameworks.js`, FrameworkWorkspace,
FrameworkDrawer, onboarding Review proposals and reverse links hardcode CIS.
Generalize dataset lookup and labels while retaining CIS identifiers and stored
assessment IDs. Keep `framework_assessments` authoritative; use existing assignment,
parent authorization, Evidence, Finding-to-Action, Review occurrence and history
paths. Dashboard framework summaries must follow the same structured relationships.

Existing `requirements` is the applicability register, not a second assessment
database. Startup remains index-only. Initialize only on authorized explicit
activation/finalization, insert-only for assessment content; deselection must retain
history and operational records. Existing configured clients need an intentional
initialization path, never a mutating GET.

## Acceptance gate

Before Phase 2: verify catalog identities/citations/classifications, addressable
decisions, assessment history, onboarding and repeat activation, shared Policies and
Reviews, Evidence reuse, Finding/Action lifecycle, reverse links, Dashboard/Calendar,
cross-client and read-only denials, browser flows, automated tests, production build,
phase commit. Publication is the final program release, not an approval barrier
between phases. Research alone satisfies none of the functional gates.
The implementation report records the actual verification and remaining limits.
