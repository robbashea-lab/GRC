# Framework cadence closure matrix

Snapshot: 2026-09-22. All 47 existing Review plans; no cadence or stored schedule changed. This classifies the **numerical Review default**, not every obligation supported by a Review.

A = explicit numerical source interval; B = periodic/planned without numerical interval; C = management-defined; D = Omnisciente recommendation; E = event-driven; F = ongoing; G = non-recurring. B/C/E/F/G can describe underlying work without replacing the Review default's A/D class. Operational backups, patching, revocation and retention are not postponed until a governance Review.

Totals: CIS 12, NIST 9, HIPAA 8, ISO 10, SOC 8; **11 A / 36 D**. No A minimum is asserted for ISO or SOC while exact source comparison remains limited. A D label is a product provenance fact, not proof that the unavailable standard contains no other timing obligations.

## Sources and scope

Source provenance/access dates and substantive qualifications are in the existing [CIS](cis-substantive-validation.md), [NIST](nist-substantive-validation.md), [HIPAA](hipaa-substantive-validation.md), [ISO](iso-substantive-validation.md) and [SOC](soc-substantive-validation.md) ledgers. This matrix consolidates those conclusions; it does not reopen CIS/NIST validation. Each A row links its exact driver. D rows reference the catalog's mapped IDs and framework ledger, not an invented numerical source mandate.

## cis-ig1

| Plan / title | Current default / class | Mapped definitions | Numerical source driver | Operational context / limitation |
| --- | --- | --- | --- | --- |
| asset-inventory — Enterprise Asset Inventory Review | semiannual / A | 1.1, 1.2 | [1.1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) — semiannual | 1.1: six-month inventory review; 1.2: weekly operational handling, not weekly human Review |
| software-support — Software Authorization & Support Review | monthly / A | 2.1, 2.2, 2.3, 9.1, 12.1 | [2.2](https://cas.docs.cisecurity.org/en/latest/source/Controls2/) — monthly; [2.3](https://cas.docs.cisecurity.org/en/latest/source/Controls2/) — monthly; [12.1](https://cas.docs.cisecurity.org/en/latest/source/Controls12/) — monthly | 2.2, 2.3 and 12.1: monthly review; 2.1: six-month inventory review; 9.1: implementation state |
| data-governance — Data Management & Inventory Review | annual / A | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | [3.1](https://cas.docs.cisecurity.org/en/latest/source/Controls3/) — annual; [3.2](https://cas.docs.cisecurity.org/en/latest/source/Controls3/) — annual | 3.1, 3.2: annual review; significant change also triggers 3.1; other safeguards provide supporting context |
| secure-configuration — Secure Configuration Process Review | annual / A | 4.1, 4.2 | [4.1](https://cas.docs.cisecurity.org/en/latest/source/Controls4/) — annual; [4.2](https://cas.docs.cisecurity.org/en/latest/source/Controls4/) — annual | 4.1, 4.2: annual documentation review and significant change |
| account-authorization — Account Authorization & Access Review | quarterly / A | 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5 | [5.1](https://cas.docs.cisecurity.org/en/latest/source/Controls5/) — quarterly | 5.1: quarterly authorization validation; 5.3: 45-day operational inactivity threshold; 6.1/6.2: event-driven |
| vulnerability-remediation — Vulnerability & Remediation Process Review | monthly / A | 7.1, 7.2, 7.3, 7.4 | [7.2](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) — monthly | 7.2: monthly process review; 7.1: annual/change review; 7.3/7.4: monthly operational patching |
| audit-logging — Audit Log Management Process Review | annual / A | 8.1, 8.2, 8.3 | [8.1](https://cas.docs.cisecurity.org/en/latest/source/Controls8/) — annual | 8.1: annual/change documentation review; 8.2/8.3: implementation state |
| data-recovery — Data Recovery Governance Review | annual / A | 11.1, 11.2, 11.3, 11.4 | [11.1](https://cas.docs.cisecurity.org/en/latest/source/Controls11/) — annual | 11.1: annual/change process review; 11.2: weekly operational backups, not a weekly human Review |
| awareness — Security Awareness Program Review | annual / A | 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8 | [14.1](https://cas.docs.cisecurity.org/en/latest/source/Controls14/) — annual | 14.1: annual/change content review and training at hire/annually; remaining safeguards are training topics |
| provider-inventory — Service Provider Inventory Review | annual / A | 15.1 | [15.1](https://cas.docs.cisecurity.org/en/latest/source/Controls15/) — annual | 15.1: annual inventory review and significant change; not a separate assurance review for every vendor |
| incident-governance — Incident Reporting & Contact Review | annual / A | 17.1, 17.2, 17.3 | [17.1](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) — annual; [17.2](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) — annual; [17.3](https://cas.docs.cisecurity.org/en/latest/source/Controls17/) — annual | 17.1–17.3: annual personnel, contact and reporting-process review; significant change for 17.1/17.3 |
| endpoint-validation — Endpoint Protection Validation | quarterly / D | 4.3, 4.4, 4.5, 4.6, 4.7, 9.2, 10.1, 10.2, 10.3 | None asserted; product recommendation | No prescribed human-review interval; quarterly validation is an Omnisciente recommendation |

## nist-csf-2

| Plan / title | Current default / class | Mapped definitions | Numerical source driver | Operational context / limitation |
| --- | --- | --- | --- | --- |
| csf-management-review — Cybersecurity Strategy and Profile Review | annual / D | GV.OV-01, GV.OV-02, GV.OV-03 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-risk-assessment — Cybersecurity Risk Assessment Review | annual / D | GV.RM-06, ID.RA-01, ID.RA-04, ID.RA-05, ID.RA-06 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-user-access — Access Rights Review | quarterly / D | PR.AA-01, PR.AA-05 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-vendor — Supplier Risk Review | annual / D | GV.SC-04, GV.SC-07, GV.SC-09 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-policy-review — Cybersecurity Policy Review | annual / D | GV.PO-01, GV.PO-02 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-awareness — Awareness Program Review | annual / D | PR.AT-01, PR.AT-02 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-vulnerability — Vulnerability Governance Review | quarterly / D | ID.RA-01, ID.RA-08, PR.PS-02 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-backup — Recovery and Restore Exercise | annual / D | PR.DS-11, RC.RP-03, RC.RP-05 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |
| csf-incident-response — Incident Response Exercise | annual / D | ID.IM-02, ID.IM-04, RS.MA-01, RS.CO-02, RC.CO-03 | None asserted; product recommendation | NIST CSF does not prescribe this Review or its cadence. |

## hipaa

| Plan / title | Current default / class | Mapped definitions | Numerical source driver | Operational context / limitation |
| --- | --- | --- | --- | --- |
| hipaa-risk-assessment — HIPAA risk analysis and management review | annual / D | 164.306(a), 164.306(b), 164.306(c), 164.306(d), 164.306(e), 164.308(a)(1)(i), 164.308(a)(1)(ii)(A), 164.308(a)(1)(ii)(B), 164.308(a)(1)(ii)(C), 164.308(a)(1)(ii)(D) | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-user-access — HIPAA access governance review | quarterly / D | 164.308(a)(3)(i), 164.308(a)(3)(ii)(A), 164.308(a)(3)(ii)(B), 164.308(a)(3)(ii)(C), 164.308(a)(4)(i), 164.308(a)(4)(ii)(A), 164.308(a)(4)(ii)(B), 164.308(a)(4)(ii)(C), 164.312(a)(1), 164.312(a)(2)(i), 164.312(a)(2)(ii), 164.312(a)(2)(iii), 164.312(a)(2)(iv), 164.312(d) | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-awareness — HIPAA security awareness program review | annual / D | 164.308(a)(5)(i), 164.308(a)(5)(ii)(A), 164.308(a)(5)(ii)(B), 164.308(a)(5)(ii)(C), 164.308(a)(5)(ii)(D) | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-incident-response — HIPAA incident response readiness review | annual / D | 164.308(a)(6)(i), 164.308(a)(6)(ii), 164.402, 164.404, 164.406, 164.408, 164.410, 164.412, 164.414 | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-bcp-dr — HIPAA contingency and recovery exercise review | annual / D | 164.308(a)(7)(i), 164.308(a)(7)(ii)(A), 164.308(a)(7)(ii)(B), 164.308(a)(7)(ii)(C), 164.308(a)(7)(ii)(D), 164.308(a)(7)(ii)(E) | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-vendor — HIPAA business associate arrangements review | annual / D | 164.308(b)(1), 164.308(b)(3), 164.314(a)(1), 164.314(b)(1) | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-policy-review — HIPAA policy and documentation review | annual / D | 164.316(a), 164.316(b)(1), 164.316(b)(2)(i), 164.316(b)(2)(ii), 164.316(b)(2)(iii), 164.105, 164.530 | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |
| hipaa-management-review — HIPAA security evaluation | annual / D | 164.308(a)(2), 164.308(a)(8) | None asserted; product recommendation | HIPAA does not prescribe this suggested calendar interval. Apply the cited requirement’s own ongoing, periodic or event-triggered duty. |

## iso-27001

| Plan / title | Current default / class | Mapped definitions | Numerical source driver | Operational context / limitation |
| --- | --- | --- | --- | --- |
| iso-internal-audit — ISMS Internal Audit | annual / D | 9.2.1, 9.2.2, A.5.35 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-management-review — ISMS Management Review | annual / D | 9.3.1, 9.3.2, 9.3.3, 4.1, 4.2, 5.1 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-risk-assessment — ISMS Risk Assessment and Treatment Review | annual / D | 6.1.1, 6.1.2, 6.1.3, 8.2, 8.3 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-objective-review — ISMS Objective Review | annual / D | 6.2, 9.1 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-soa-review — Statement of Applicability Review | annual / D | 6.1.3, A.5.1, A.5.2, A.5.3, A.5.4, A.5.5, A.5.6, A.5.7, A.5.8, A.5.9, A.5.10, A.5.11, A.5.12, A.5.13, A.5.14, A.5.15, A.5.16, A.5.17, A.5.18, A.5.19, A.5.20, A.5.21, A.5.22, A.5.23, A.5.24, A.5.25, A.5.26, A.5.27, A.5.28, A.5.29, A.5.30, A.5.31, A.5.32, A.5.33, A.5.34, A.5.35, A.5.36, A.5.37, A.6.1, A.6.2, A.6.3, A.6.4, A.6.5, A.6.6, A.6.7, A.6.8, A.7.1, A.7.2, A.7.3, A.7.4, A.7.5, A.7.6, A.7.7, A.7.8, A.7.9, A.7.10, A.7.11, A.7.12, A.7.13, A.7.14, A.8.1, A.8.2, A.8.3, A.8.4, A.8.5, A.8.6, A.8.7, A.8.8, A.8.9, A.8.10, A.8.11, A.8.12, A.8.13, A.8.14, A.8.15, A.8.16, A.8.17, A.8.18, A.8.19, A.8.20, A.8.21, A.8.22, A.8.23, A.8.24, A.8.25, A.8.26, A.8.27, A.8.28, A.8.29, A.8.30, A.8.31, A.8.32, A.8.33, A.8.34 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-corrective-review — ISMS Corrective Action Review | annual / D | 10.1, 10.2 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-policy-review — Security Policy Review | annual / D | 5.2, 7.5.1, 7.5.2, 7.5.3, A.5.1 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-user-access — Access Entitlement Review | quarterly / D | A.5.15, A.5.16, A.5.18, A.8.2, A.8.3 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-vendor — Third-Party Security Review | annual / D | A.5.19, A.5.20, A.5.21, A.5.22, A.5.23 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |
| iso-awareness — Security Awareness Review | annual / D | 7.2, 7.3, A.6.3 | None asserted; product recommendation | D recommendation; source clauses 4–6 compared only within official preview. Other exact timing qualifications remain source-access limited; client approves control design. |

## soc-2

| Plan / title | Current default / class | Mapped definitions | Numerical source driver | Operational context / limitation |
| --- | --- | --- | --- | --- |
| soc-risk-assessment — SOC 2 Risk and System Scope Review | annual / D | CC3.1, CC3.2, CC3.3, CC3.4 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-user-access — Access Entitlement Review | quarterly / D | CC6.1, CC6.2, CC6.3 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-vulnerability — Vulnerability Governance Review | annual / D | CC7.1, CC7.2 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-vendor — Third-Party Security Review | annual / D | CC9.2, P6.4, P6.5 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-backup — Backup and Recovery Validation | annual / D | CC9.1, A1.2, A1.3 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-incident-response — Incident Response Exercise | annual / D | CC7.3, CC7.4, CC7.5, CC9.1 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-policy-review — Security Policy Review | annual / D | CC5.3, CC2.2 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |
| soc-awareness — Security Awareness Review | annual / D | CC1.4, CC2.2 | None asserted; product recommendation | D recommendation; C management control frequency is separately recorded. Exact revised-2022 criteria comparison remains source-access blocked. |

## Context distinctions

- CIS: A source drivers do not make every grouped safeguard recurring. Event/change triggers remain additive; implementation-state and training topics are not separate human Review mandates.
- NIST: outcome evaluation supports C management design; the product's suggested calendar intervals are D, not CSF-prescribed audits.
- HIPAA: B periodic evaluation/document review and E changes coexist with F ongoing safeguards. Six-year retention is not a six-year Review schedule; incident notification deadlines are not recurrence. The narrowed vendor association is RELATED to sponsor-agent safeguards only.
- ISO: the preview supports planned change context (E) and risk-based treatment, not a universal annual audit assertion. Missing normative text remains explicitly unverified.
- SOC: C control frequency and the evidence observation period are independent of D governance defaults. Completing a Review does not prove operating effectiveness or attestation readiness.

No new schedule engine, mapping expansion, automatic reassessment or historical rewrite is introduced.
