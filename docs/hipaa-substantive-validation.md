# HIPAA — substantive validation

Research: 2026-09-22. Represented catalog identity remains `45 CFR 164 · 2026-09-18`; changing this string would change generated assessment IDs, so it is deliberately preserved. The eCFR pages inspected identify Title 45 as current through 2026-09-21 (164.302 response through 2026-09-18). That is a publication currency marker, not a new Security Rule effective date.

## Source ledger

Publisher: Office of the Federal Register/GPO, 45 CFR Part 164. Official government eCFR is authoritative but not the official legal print edition. Public regulations; no licensed source imported. Accessed 2026-09-22. Security sections cite the 2003 rule and 2013 amendments; dependency sections retain their distinct amendment histories.

| Source | Sections used | Conclusion |
| --- | --- | --- |
| [45 CFR 164.105](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-A/section-164.105) | 164.105 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.302](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.302) | 164.302 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.306](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.306) | 164.306 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.308](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.308) | 164.308 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.310](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.310) | 164.310 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.312](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312) | 164.312 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.314](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.314) | 164.314 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.316](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.316) | 164.316 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [45 CFR 164.530](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.530) | 164.530 and relevant subsections | Item-specific comparison below; conditional applicability retained. |
| [Subpart D](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-D) | 164.402–414 | Breach duties are event/deadline based, not recurring governance Reviews. |
| [HHS Security Rule NPRM](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html) | Current rule versus proposal | HHS states the current rule remains effective during rulemaking; no proposed MFA, encryption or fixed assessment interval imported. |

## Corrections recorded before implementation

| Item | Previous explanation | New explanation | Basis |
| --- | --- | --- | --- |
| 164.310(d)(2)(iv) | Consider backup and storage needs before equipment containing ePHI is moved. | Address the need for a retrievable exact copy of ePHI before moving equipment; implement the safeguard when reasonable and appropriate, or document the addressability decision and any appropriate alternative. | Cited eCFR subsection: preserve action/periodicity, not merely consideration or change-only updates. |
| 164.316(b)(2)(iii) | Review and update documentation in response to relevant environmental or operational changes. | Review documentation periodically and update it as needed when environmental or operational changes affect ePHI security. | Cited eCFR subsection: preserve action/periodicity, not merely consideration or change-only updates. |

H-C03: eight plan cadence fields currently absent; add D and empty exact-interval references. Defaults, stored schedules and statutory deadlines remain unchanged.

## Inventory and interpretation

76 current assessment units inspected. Parent units deliberately bundle some children: 164.308(b)(1) includes (b)(2) subcontractor duties; 164.314(a)(1) and (b)(1) include required child specifications. Overlap with the separately assessed 164.308(b)(3) is hierarchical context, not duplicate IDs. No leaf-splitting or history migration is performed. `related_dependency` identifies scope beyond the Security Rule, not optional legal duties. This remains a Security Rule program with limited dependencies, not a complete Privacy Rule assessment.

Required/addressable labels match the cited provision. Addressable is not optional. Conditional clearinghouse and group-health-plan scope remains conditional; no client applicability is inferred from names. Evidence suggestions are reasonable nonexclusive examples, deliberately minimizing patient data and credentials.

| ID | Current title | Classification | Result | Explanation / implementation / evidence | Source cadence |
| --- | --- | --- | --- | --- | --- |
| 164.302 | Regulated entity and ePHI scope | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.306(a) | General requirements | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.306(b) | Flexibility of approach | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.306(c) | Standards | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.306(d) | Implementation specifications | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.306(e) | Maintenance | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(1)(i) | Security management process | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(1)(ii)(A) | Risk analysis | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(1)(ii)(B) | Risk management | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(1)(ii)(C) | Sanction policy | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(1)(ii)(D) | Information system activity review | required | VERIFIED | Reasonable scoped supporting guidance | Regularly; no fixed interval specified. |
| 164.308(a)(2) | Assigned security responsibility | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(3)(i) | Workforce security | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(3)(ii)(A) | Authorization and/or supervision | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(3)(ii)(B) | Workforce clearance procedure | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(3)(ii)(C) | Termination procedures | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(4)(i) | Information access management | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(4)(ii)(A) | Isolating health care clearinghouse functions | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(4)(ii)(B) | Access authorization | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(4)(ii)(C) | Access establishment and modification | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(5)(i) | Security awareness and training | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(5)(ii)(A) | Security reminders | addressable | VERIFIED | Reasonable scoped supporting guidance | Periodic security updates; no fixed interval specified. |
| 164.308(a)(5)(ii)(B) | Protection from malicious software | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(5)(ii)(C) | Log-in monitoring | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(5)(ii)(D) | Password management | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(6)(i) | Security incident procedures | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(6)(ii) | Response and reporting | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(7)(i) | Contingency plan | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(7)(ii)(A) | Data backup plan | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(7)(ii)(B) | Disaster recovery plan | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(7)(ii)(C) | Emergency mode operation plan | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(7)(ii)(D) | Testing and revision procedures | addressable | VERIFIED | Reasonable scoped supporting guidance | Periodic testing and revision; no fixed interval specified. |
| 164.308(a)(7)(ii)(E) | Applications and data criticality analysis | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(a)(8) | Evaluation | standard | VERIFIED | Reasonable scoped supporting guidance | Periodic evaluation and environmental or operational changes affecting ePHI. |
| 164.308(b)(1) | Business associate contracts and other arrangements | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.308(b)(3) | Written contract or other arrangement | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(a)(1) | Facility access controls | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(a)(2)(i) | Contingency operations | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(a)(2)(ii) | Facility security plan | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(a)(2)(iii) | Access control and validation procedures | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(a)(2)(iv) | Maintenance records | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(b) | Workstation use | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(c) | Workstation security | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(d)(1) | Device and media controls | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(d)(2)(i) | Disposal | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(d)(2)(ii) | Media re-use | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(d)(2)(iii) | Accountability | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.310(d)(2)(iv) | Data backup and storage | addressable | CORRECTED | Explanation corrected; other guidance retained | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(a)(1) | Access control | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(a)(2)(i) | Unique user identification | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(a)(2)(ii) | Emergency access procedure | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(a)(2)(iii) | Automatic logoff | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(a)(2)(iv) | Encryption and decryption | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(b) | Audit controls | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(c)(1) | Integrity | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(c)(2) | Mechanism to authenticate electronic protected health information | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(d) | Person or entity authentication | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(e)(1) | Transmission security | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(e)(2)(i) | Integrity controls | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.312(e)(2)(ii) | Encryption | addressable | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.314(a)(1) | Business associate contracts or other arrangements | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.314(b)(1) | Requirements for group health plans | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.316(a) | Policies and procedures | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.316(b)(1) | Documentation | standard | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.316(b)(2)(i) | Time limit | required | VERIFIED | Reasonable scoped supporting guidance | Retain for six years from creation or last effective date, whichever is later. This is not a Review interval. |
| 164.316(b)(2)(ii) | Availability | required | VERIFIED | Reasonable scoped supporting guidance | Maintain appropriate safeguards; apply the provision’s actual event or operational trigger. No universal human Review interval. |
| 164.316(b)(2)(iii) | Updates | required | CORRECTED | Explanation corrected; other guidance retained | Periodic review; update as needed for environmental or operational changes. |
| 164.105 | Entity structure and designated health care components | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Designation and relevant organizational change; documentation retention under the cited rule. |
| 164.402 | Breach assessment and documented exceptions | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Event-driven; promptly evaluate discovery and notification duties. |
| 164.404 | Notification to affected individuals | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Event-driven; without unreasonable delay, maximum 60 calendar days after discovery, subject to lawful delay. |
| 164.406 | Media notice for large jurisdictional breaches | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Without unreasonable delay and within 60 calendar days after discovery, subject to §164.412. |
| 164.408 | Notice to the Secretary and smaller-breach log | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Large breaches: contemporaneous notice. Smaller breaches: annual submission within 60 days after year-end. |
| 164.410 | Business associate notification to covered entity | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Without unreasonable delay and no later than 60 calendar days after discovery, subject to §164.412. |
| 164.412 | Law-enforcement notification delay | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Only when the law-enforcement conditions in this section are met. |
| 164.414 | Breach notification administrative duties and proof | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Event-driven documentation and applicable retained-record duties. |
| 164.530 | Privacy administration supporting the program | related_dependency | VERIFIED | Reasonable scoped supporting guidance | Training for new workforce and material changes within a reasonable period; retain required documentation for six years from creation or last effective date, whichever is later. |

## Cadence matrix

D below classifies the product's chosen interval, not the underlying duty. B = periodic without exact interval; E = event-driven; F = ongoing; G = state. Retention periods and notification deadlines are not Review recurrence.

| Review | Default | Class | Underlying duty / limitation |
| --- | --- | --- | --- |
| hipaa-risk-assessment | annual | D | B/F: risk management and regular activity review; annual governance cannot replace operational review. |
| hipaa-user-access | quarterly | D | B/E/F: authorization, review and access changes; no universal quarterly mandate. |
| hipaa-awareness | annual | D | B/F: workforce program and periodic reminders; no universal annual training mandate. |
| hipaa-incident-response | annual | D | E: incident response and breach deadlines; yearly exercises do not delay notification. |
| hipaa-bcp-dr | annual | D | B/E: periodic plan testing and emergency operation; no universal annual test mandate. |
| hipaa-vendor | annual | D | E/G: arrangements before relevant handling; group-plan scope needs separate applicability analysis. |
| hipaa-policy-review | annual | D | B/E: periodic documentation review/change updates; six-year retention is not a Review interval. |
| hipaa-management-review | annual | D | B/E: evaluation periodically and after relevant changes, with assigned security responsibility. |

## Policy and cross-framework mappings

All 13 existing mapping rows inspected; repeated policy keys intentionally reuse one policy family rather than create duplicate policies. Mappings below are PARTIAL supporting relationships, not mandated document titles or proof of compliance.

| Policy | References | Result |
| --- | --- | --- |
| policy-risk-management-policy | 164.306(a), 164.306(b), 164.306(c), 164.306(d), 164.306(e), 164.308(a)(1)(i), 164.308(a)(1)(ii)(A), 164.308(a)(1)(ii)(B), 164.308(a)(1)(ii)(C), 164.308(a)(1)(ii)(D) | VERIFIED — PARTIAL supporting policy |
| policy-access-control-identity-management-policy | 164.308(a)(3)(i), 164.308(a)(3)(ii)(A), 164.308(a)(3)(ii)(B), 164.308(a)(3)(ii)(C), 164.308(a)(4)(i), 164.308(a)(4)(ii)(A), 164.308(a)(4)(ii)(B), 164.308(a)(4)(ii)(C), 164.312(a)(1), 164.312(a)(2)(i), 164.312(a)(2)(ii), 164.312(a)(2)(iii), 164.312(a)(2)(iv), 164.312(d) | VERIFIED — PARTIAL supporting policy |
| policy-security-awareness-training-policy | 164.308(a)(5)(i), 164.308(a)(5)(ii)(A), 164.308(a)(5)(ii)(B), 164.308(a)(5)(ii)(C), 164.308(a)(5)(ii)(D) | VERIFIED — PARTIAL supporting policy |
| policy-incident-response-policy | 164.308(a)(6)(i), 164.308(a)(6)(ii), 164.402, 164.404, 164.406, 164.408, 164.410, 164.412, 164.414 | VERIFIED — PARTIAL supporting policy |
| policy-business-continuity-disaster-recovery-policy | 164.308(a)(7)(i), 164.308(a)(7)(ii)(A), 164.308(a)(7)(ii)(B), 164.308(a)(7)(ii)(C), 164.308(a)(7)(ii)(D), 164.308(a)(7)(ii)(E) | VERIFIED — PARTIAL supporting policy |
| policy-vendor-third-party-risk-management-policy | 164.308(b)(1), 164.308(b)(3), 164.314(a)(1), 164.314(b)(1) | PARTIAL; group-plan association is RELATED only, qualified-owner scope review needed |
| policy-information-security-policy | 164.316(a), 164.316(b)(1), 164.316(b)(2)(i), 164.316(b)(2)(ii), 164.316(b)(2)(iii), 164.105, 164.530 | VERIFIED — PARTIAL supporting policy |
| policy-information-security-policy | 164.308(a)(2), 164.308(a)(8) | VERIFIED — PARTIAL supporting policy |
| policy-cryptography-key-management-policy | 164.312(a)(2)(iv), 164.312(e)(2)(ii) | VERIFIED — PARTIAL supporting policy |
| policy-physical-environmental-security-policy | 164.310(a)(1), 164.310(a)(2)(i), 164.310(a)(2)(ii), 164.310(a)(2)(iii), 164.310(a)(2)(iv), 164.310(b), 164.310(c) | VERIFIED — PARTIAL supporting policy |
| policy-data-retention-secure-disposal-policy | 164.310(d)(1), 164.310(d)(2)(i), 164.310(d)(2)(ii), 164.310(d)(2)(iii), 164.310(d)(2)(iv), 164.316(b)(1), 164.316(b)(2)(i), 164.316(b)(2)(ii), 164.316(b)(2)(iii) | VERIFIED — PARTIAL supporting policy |
| policy-data-classification-handling-policy | 164.312(c)(1), 164.312(c)(2), 164.312(e)(1), 164.312(e)(2)(i), 164.312(e)(2)(ii) | VERIFIED — PARTIAL supporting policy |
| policy-information-security-policy | 164.308(a)(1)(ii)(C), 164.312(b) | VERIFIED — PARTIAL supporting policy |

The vendor Review's existing group-health-plan relationship is RELATED organizational context, not a claim that plan-sponsor duties are vendor duties. **REQUIRES SME REVIEW** for client-specific use of this association: a vendor review alone cannot discharge group-plan obligations. No relationship is deleted or source data rewritten.

The three NIST mappings (PR.AA-05 → access authorization, PR.DS-11 → backup plan, PR.AT-01 → workforce training) remain PARTIAL after comparing both source topics. Legal scope, addressability and complete operational duties remain independent. No automatic status changes.

No client records, source legal wording, IDs or version identity changed. eCFR's legacy cross-reference to 164.308(b)(4) within 164.314(a)(2)(iii) is retained as source wording, not silently edited into an invented regulation. Exact client legal determinations require qualified review.

## Closure — group-plan / third-party association (2026-09-22)

**Prior SME flag resolved for the catalog mapping; client-specific legal applicability is not decided.** Current OFR/GPO [45 CFR 164.314(b)(1) and (b)(2)(iii)](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.314), accessed 2026-09-22, expressly addresses plan-sponsor agents' security agreements. The current page reports Title 45 currency through 2026-09-21; its section history cites 2003 and 2013, not a new 2026 rule. Paragraph (a) separately addresses business-associate arrangements. [HHS/OCR's current Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html), reviewed 2026-08-07 and accessed 2026-09-22, confirms the distinction from the proposed rule.

Determination: **RELATED**, narrowly through agent-security agreements, for the existing 164.314(b)(1) association with both `hipaa-vendor` and `policy-vendor-third-party-risk-management-policy`. The same resources provide PARTIAL support for the separately mapped business-associate provisions. They do not cover all sponsor safeguards, plan amendments, separation or incident-reporting duties. No claim that a sponsor is automatically a business associate is made.

### Closure correction register (recorded before edits)

| ID | Target | Previous value | Correction | Source / rationale / data impact |
| --- | --- | --- | --- | --- |
| HC01 | hipaa-vendor.reason | Generic suggested governance support for all cited duties | Explicit PARTIAL business-associate support and RELATED group-plan agent scope; not a substitute for all plan-document duties | 164.314(a), (b)(1), (b)(2)(iii); narrow the displayed relationship without deleting links, Reviews, schedules or histories. |
| HC02 | vendor policy mapping.reason | Generic policy-family/ePHI support | Same limited RELATED sponsor-agent connection, with no prescribed policy-title claim | Same source; preserve all four mapped IDs and recommended artifact classification. |

The existing `classification: recommended` expresses artifact/default status, not relationship strength; it is preserved. RELATED/PARTIAL are explicit in the existing displayed reason field, avoiding a new mapping schema. These reasons appear in requirement Governance/Related and onboarding context. This closes the catalog uncertainty, not every client's legal determination.

Closure verification: 9 HIPAA backend tests passed against isolated test persistence; 19 targeted frontend tests passed across `hipaaFramework.test.js`, `FrameworkContext.test.jsx` and `frameworkMappings.test.js`. The new regressions cover reconfiguration preserving the stored assessment/history and Review identity, and presentation of the limited agent relationship. Browser verification is pending; these results do not claim live-backend or published-preview verification.
