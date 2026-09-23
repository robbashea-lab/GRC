# Targeted mapping closure

2026-09-22. Scope: existing `frameworkMappings.json`, Review-plan references and policy support associations only. This is a sanity check, not a new crosswalk. Source versions, URLs, sections and access dates remain in the five substantive ledgers. ISO/SOC target completeness remains source-qualified.

## Existing cross-framework edges

All 12 are **PARTIAL**, never EQUIVALENT or FULL. No new edges, directions, status transfers or equivalence rules were introduced.

| NIST CSF 2.0 source | CIS target | HIPAA target | ISO target | SOC target | Decision |
| --- | --- | --- | --- | --- | --- |
| PR.AA-05 | 6.1 | 164.308(a)(4)(ii)(B) | A.5.18 | CC6.2 | Retain partial access-governance association; authorization evidence does not establish every permission, removal or scope duty. |
| PR.DS-11 | 11.2 | 164.308(a)(7)(ii)(A) | A.8.13 | CC7.5 | Retain partial recovery association; backup evidence alone cannot establish incident recovery effectiveness. |
| PR.AT-01 | 14.1 | 164.308(a)(5)(i) | A.6.3 | CC2.2 | Retain partial workforce association; training evidence alone does not establish every communication obligation. |

The six CIS/HIPAA targets retain the earlier authoritative comparison, not a repeated full audit. The six ISO/SOC targets explicitly say authorized exact target-source validation is required. The newly available ISO preview does not include these Annex controls and therefore cannot upgrade them.

## Requested topic sanity check

Support associations are PARTIAL unless narrowed below. Shared policy families/Review baselines are not implicit framework-to-framework equivalence. Where no cross-framework edge exists, none was invented.

| Topic | Existing coverage inspected | Result / limit |
| --- | --- | --- |
| Access | Access policy family, user-access Review baselines, four PR.AA-05 edges | Retain PARTIAL; independence of client scope and assessments preserved. |
| MFA | CIS account-authorization plan includes 6.3–6.5 | Operational implementation context, not proof supplied by a quarterly Review. No dedicated cross-framework MFA edge exists. |
| Assets | CIS asset-inventory/software-support plans; NIST/ISO asset-policy families | Inventory support only. No dedicated cross-framework asset edge exists. |
| Vulnerability | CIS monthly process driver; NIST/ISO/SOC vulnerability policy families and configured Reviews | Governance Review does not replace patch execution or prove complete coverage. No new crosswalk. |
| Incident | Incident-response policy families and existing exercise/governance plans | Preparation, response and notification obligations remain distinct. No invented common deadline. |
| Backup | Four PR.DS-11 edges and backup policy families | PARTIAL; restore, protection, incident recovery and frequency remain independently assessed. |
| Vendor | Vendor policy families and vendor/provider plans | HIPAA group-plan link is RELATED only through sponsor-agent safeguards; other business-associate links remain PARTIAL. CIS provider inventory is not full supplier assurance. |
| Awareness | Four PR.AT-01 edges and awareness families | PARTIAL; curriculum, scope and effectiveness remain independent. |
| Risk | Existing NIST/HIPAA/ISO/SOC risk policies and Review baselines | Supporting methods and decisions are not a common scoring model or automatic assessment transfer. |
| Policy | Policy mappings and policy-review baselines | Named product documents are suggestions, not a claim that every source mandates that title. |
| Logging | CIS audit-logging plan and information-security policy support; HIPAA 164.312(b) policy association | Log governance is not continuous collection/analysis. No dedicated cross-framework logging edge exists. |

No mapping was removed solely because a source is inaccessible. Unavailable source comparisons remain NOT VERIFIED rather than being called incorrect. Business applicability and client legal determinations remain qualified-review matters, not unresolved permission to mutate records.

The shared mapping tests check all endpoints and partial provenance. The new 47-plan test checks every mapped definition and source cadence driver. Browser and API integration outcomes are recorded in the parent closure report; catalog shape checks alone do not prove data isolation or source correctness.
