# CIS IG2 additions source/content review

Baseline: `83d88e3cbc31d618060c4e094335963f5bacf096`. Reviewed 74 unique minimum-IG2 additions; inherited definitions are reused without stronger criteria. This is content engineering, not independent approval.

Primary [CIS Navigator v8.1](https://www.cisecurity.org/controls/cis-controls-navigator), retrieved 2026-10-09T19:58:31.378Z. Full-source comparison: 153 unique rows, minimum 56/74/23,cumulative 56/130/153, zero normalized ID/title/description/minimum-group differences. Source-row SHA256: `ce92fb09a96dfb24ca46ea13fd46d35fed0febdbba874838692b7c543ddda25c`; catalog SHA256: `3223e68c710f116812af9eb134fdd1fa142c615fca5f10f9925d0782f3f3b8af`.

The existing CAS comparison returned exit 1 for 23 source wording/title differences; that original result is retained in JSON provenance. Navigator is primary; no automatic catalog edits or CAS percentage scoring. Examples, suggested evidence and optional context do not become obligations.

The JSON matrix records every existing critical answer mapping, conditional clause, summary target, proposed correction, source interpretation and status-case reference. Status fixture expectations were chosen from source obligations plus the authorized application policy; no evaluator was called to invent expected values.

There are 2525 explicit source-authored cases for these 74 definitions. They have not been executed by this content workstream and do not prove rendered placements or hosted saves.

## Necessary shared-owner requests

- **8.4 / 8.4-c3**: The unqualified standardization sentence and conditional two-source configuration sentence are distinct requirements. The support qualification is retained for 8.4-c4, not added to the first sentence. New question version; preserve old answers/history. Changed row starts unanswered; 8.4-c4 keeps its meaning/ID and may map by criterion ID.
- **16.9 / 16.9-guided-security-culture**: The source explicitly includes a training-design aim to build security culture; existing annual/team-security criterion does not explicitly cover this clause. Test design/intention, not an invented measured culture outcome. New question version; genuinely new answer starts unanswered. Preserve existing 16.9-c4/c5/c3 answers and narrative/history; never infer this new answer from old training Yes.

## Coverage

| Safeguard | Minimum group | Clauses | Conditions | Content request | Source review |
| --- | --- | ---: | ---: | --- | --- |
| 1.3 — Utilize an Active Discovery Tool | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 1.4 — Use Dynamic Host Configuration Protocol (DHCP) Logging to Update Enterprise Asset Inventory | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 2.4 — Utilize Automated Software Inventory Tools | IG2 | 2 | 2 | Reuse existing | Complete; independent pending |
| 2.5 — Allowlist Authorized Software | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 2.6 — Allowlist Authorized Libraries | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 3.7 — Establish and Maintain a Data Classification Scheme | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 3.8 — Document Data Flows | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 3.9 — Encrypt Data on Removable Media | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 3.10 — Encrypt Sensitive Data in Transit | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 3.11 — Encrypt Sensitive Data at Rest | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 3.12 — Segment Data Processing and Storage Based on Sensitivity | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 4.8 — Uninstall or Disable Unnecessary Services on Enterprise Assets and Software | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 4.9 — Configure Trusted DNS Servers on Enterprise Assets | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 4.10 — Enforce Automatic Device Lockout on Portable End-User Devices | IG2 | 4 | 4 | Reuse existing | Complete; independent pending |
| 4.11 — Enforce Remote Wipe Capability on Portable End-User Devices | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 5.5 — Establish and Maintain an Inventory of Service Accounts | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 5.6 — Centralize Account Management | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 6.6 — Establish and Maintain an Inventory of Authentication and Authorization Systems | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 6.7 — Centralize Access Control | IG2 | 2 | 2 | Reuse existing | Complete; independent pending |
| 7.5 — Perform Automated Vulnerability Scans of Internal Enterprise Assets | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 7.6 — Perform Automated Vulnerability Scans of Externally-Exposed Enterprise Assets | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 7.7 — Remediate Detected Vulnerabilities | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 8.4 — Standardize Time Synchronization | IG2 | 2 | 2 | Submitted | Complete; independent pending |
| 8.5 — Collect Detailed Audit Logs | IG2 | 8 | 0 | Reuse existing | Complete; independent pending |
| 8.6 — Collect DNS Query Audit Logs | IG2 | 1 | 1 | Reuse existing | Complete; independent pending |
| 8.7 — Collect URL Request Audit Logs | IG2 | 1 | 1 | Reuse existing | Complete; independent pending |
| 8.8 — Collect Command-Line Audit Logs | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 8.9 — Centralize Audit Logs | IG2 | 3 | 3 | Reuse existing | Complete; independent pending |
| 8.10 — Retain Audit Logs | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 8.11 — Conduct Audit Log Reviews | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 9.3 — Maintain and Enforce Network-Based URL Filters | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 9.4 — Restrict Unnecessary or Unauthorized Browser and Email Client Extensions | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 9.5 — Implement DMARC | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 9.6 — Block Unnecessary File Types | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 10.4 — Configure Automatic Anti-Malware Scanning of Removable Media | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 10.5 — Enable Anti-Exploitation Features | IG2 | 2 | 2 | Reuse existing | Complete; independent pending |
| 10.6 — Centrally Manage Anti-Malware Software | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 10.7 — Use Behavior-Based Anti-Malware Software | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 11.5 — Test Data Recovery | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 12.2 — Establish and Maintain a Secure Network Architecture | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 12.3 — Securely Manage Network Infrastructure | IG2 | 1 | 0 | Reuse existing | Complete; independent pending |
| 12.4 — Establish and Maintain Architecture Diagram(s) | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 12.5 — Centralize Network Authentication, Authorization, and Auditing (AAA) | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 12.6 — Use of Secure Network Management and Communication Protocols | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 12.7 — Ensure Remote Devices Utilize a VPN and are Connecting to an Enterprise's AAA Infrastructure | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 13.1 — Centralize Security Event Alerting | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 13.2 — Deploy a Host-Based Intrusion Detection Solution | IG2 | 1 | 1 | Reuse existing | Complete; independent pending |
| 13.3 — Deploy a Network Intrusion Detection Solution | IG2 | 1 | 1 | Reuse existing | Complete; independent pending |
| 13.4 — Perform Traffic Filtering Between Network Segments | IG2 | 1 | 1 | Reuse existing | Complete; independent pending |
| 13.5 — Manage Access Control for Remote Assets | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 13.6 — Collect Network Traffic Flow Logs | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 14.9 — Conduct Role-Specific Security Awareness and Skills Training | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 15.2 — Establish and Maintain a Service Provider Management Policy | IG2 | 7 | 0 | Reuse existing | Complete; independent pending |
| 15.3 — Classify Service Providers | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 15.4 — Ensure Service Provider Contracts Include Security Requirements | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 16.1 — Establish and Maintain a Secure Application Development Process | IG2 | 8 | 0 | Reuse existing | Complete; independent pending |
| 16.2 — Establish and Maintain a Process to Accept and Address Software Vulnerabilities | IG2 | 14 | 1 | Reuse existing | Complete; independent pending |
| 16.3 — Perform Root Cause Analysis on Security Vulnerabilities | IG2 | 3 | 0 | Reuse existing | Complete; independent pending |
| 16.4 — Establish and Manage an Inventory of Third-Party Software Components | IG2 | 6 | 0 | Reuse existing | Complete; independent pending |
| 16.5 — Use Up-to-Date and Trusted Third-Party Software Components | IG2 | 4 | 1 | Reuse existing | Complete; independent pending |
| 16.6 — Establish and Maintain a Severity Rating System and Process for Application Vulnerabilities | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 16.7 — Use Standard Hardening Configuration Templates for Application Infrastructure | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 16.8 — Separate Production and Non-Production Systems | IG2 | 2 | 0 | Reuse existing | Complete; independent pending |
| 16.9 — Train Developers in Application Security Concepts and Secure Coding | IG2 | 3 +1new | 0 | Submitted | Complete; independent pending |
| 16.10 — Apply Secure Design Principles in Application Architectures | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 16.11 — Leverage Vetted Modules or Services for Application Security Components | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 17.4 — Establish and Maintain an Incident Response Process | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 17.5 — Assign Key Roles and Responsibilities | IG2 | 11 | 0 | Reuse existing | Complete; independent pending |
| 17.6 — Define Mechanisms for Communicating During Incident Response | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 17.7 — Conduct Routine Incident Response Exercises | IG2 | 5 | 0 | Reuse existing | Complete; independent pending |
| 17.8 — Conduct Post-Incident Reviews | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 18.1 — Establish and Maintain a Penetration Testing Program | IG2 | 7 | 0 | Reuse existing | Complete; independent pending |
| 18.2 — Perform Periodic External Penetration Tests | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |
| 18.3 — Remediate Penetration Test Findings | IG2 | 4 | 0 | Reuse existing | Complete; independent pending |

## Source interpretations

### 1.3 — Utilize an Active Discovery Tool

Active discovery must identify assets on the enterprise network and execute at least daily. Automatic inventory updates are CAS operational context, not an additional scored obligation of 1.3.

Timing: Daily or more frequent configured execution [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls1/#13-utilize-an-active-discovery-tool).

### 1.4 — Use Dynamic Host Configuration Protocol (DHCP) Logging to Update Enterprise Asset Inventory

DHCP logging must cover all DHCP servers OR an IPAM tool may supply the observations. Review and use the chosen observations for inventory updates at least weekly; do not demand both alternatives.

Timing: Weekly or more frequent review/use for inventory update [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls1/#14-use-dynamic-host-configuration-protocol-dhcp-logging-to-update-enterprise-asset-inventory).

### 2.4 — Utilize Automated Software Inventory Tools

Automated software discovery AND documentation throughout the enterprise are required when possible. A brand or separate scanning product is not mandatory; a supported source-conditioned exclusion needs rationale.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls2/#24-utilize-automated-software-inventory-tools).

### 2.5 — Allowlist Authorized Software

Only authorized software may execute OR be accessed; technical enforcement and six-month reassessment are substantive. Application allowlisting is an example, not the only permitted technology.

Timing: Reassess at least every six months [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls2/#25-allowlist-authorized-software).

### 2.6 — Allowlist Authorized Libraries

Only authorized libraries may load into a process, unauthorized libraries are blocked, and controls are reassessed within six months. File extensions are examples, not an exhaustive technology checklist.

Timing: Reassess at least every six months [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls2/#26-allowlist-authorized-libraries).

### 3.7 — Establish and Maintain a Data Classification Scheme

Maintain an enterprise-wide data-classification scheme and review annually or after relevant significant changes. The named sensitivity labels illustrate a scheme; they do not prescribe a mandatory taxonomy.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#37-establish-and-maintain-a-data-classification-scheme).

### 3.8 — Document Data Flows

Document internal AND provider data flows in the data-management-process context, with annual/relevant-change review. This does not authorize editing the data-management process through this interview.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#38-document-data-flows).

### 3.9 — Encrypt Data on Removable Media

Encrypt data on removable media; the source does not restrict the requirement to sensitive data or name a compulsory product. Do not add a recurring annual review requirement.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#39-encrypt-data-on-removable-media).

### 3.10 — Encrypt Sensitive Data in Transit

Encrypt sensitive data in transit. TLS and OpenSSH are examples; neither product/protocol is independently mandatory when another adequate encrypted transport is used.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#310-encrypt-sensitive-data-in-transit).

### 3.11 — Encrypt Sensitive Data at Rest

Sensitive data at rest on servers, applications and databases is covered. Storage-layer encryption meets the stated minimum; client-side/application-layer encryption is additional, not a pass condition.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#311-encrypt-sensitive-data-at-rest).

### 3.12 — Segment Data Processing and Storage Based on Sensitivity

Segment both data processing AND storage by sensitivity and prevent sensitive-data processing on lower-sensitivity assets. Do not substitute a parent-control-wide question for these clauses.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#312-segment-data-processing-and-storage-based-on-sensitivity).

### 4.8 — Uninstall or Disable Unnecessary Services on Enterprise Assets and Software

Unnecessary services on assets AND software are uninstalled OR disabled. Example file-sharing modules are not universally required services to remove.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls4/#48-uninstall-or-disable-unnecessary-services-on-enterprise-assets-and-software).

### 4.9 — Configure Trusted DNS Servers on Enterprise Assets

Configure trusted DNS servers on network infrastructure. Enterprise-controlled OR reputable external DNS are source examples; do not make internal DNS mandatory.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls4/#49-configure-trusted-dns-servers-on-enterprise-assets).

### 4.10 — Enforce Automatic Device Lockout on Portable End-User Devices

Supported portable devices enforce local-failure lockout; laptops permit at most 20 attempts and tablets/phones at most 10. Unsupported populations need a source-conditioned rationale, not an invented expiry rule.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls4/#410-enforce-automatic-device-lockout-on-portable-end-user-devices).

### 4.11 — Enforce Remote Wipe Capability on Portable End-User Devices

Remote wiping concerns enterprise data on enterprise-owned portable devices when appropriate. Loss, theft and departure are examples; neither personal-device ownership nor universal whole-device wiping is required.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls4/#411-enforce-remote-wipe-capability-on-portable-end-user-devices).

### 5.5 — Establish and Maintain an Inventory of Service Accounts

Service-account inventory records department owner, review date AND purpose, and authorization of all active accounts is reviewed at least quarterly. Do not import ordinary-user fields from 5.1.

Timing: At least quarterly authorization review [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls5/#55-establish-and-maintain-an-inventory-of-service-accounts).

### 5.6 — Centralize Account Management

Centralize account management through a directory OR identity service. SSO or a particular directory vendor is not separately required here.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls5/#56-centralize-account-management).

### 6.6 — Establish and Maintain an Inventory of Authentication and Authorization Systems

Inventory both authentication AND authorization systems, including onsite/provider-hosted systems; review/update at least annually. Do not change the neighboring account inventory.

Timing: At least annual review/update [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls6/#66-establish-and-maintain-an-inventory-of-authentication-and-authorization-systems).

### 6.7 — Centralize Access Control

Supported enterprise assets centralize access control through a directory OR SSO provider. The support condition qualifies the implementation, and does not create a blanket MFA prerequisite.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls6/#67-centralize-access-control).

### 7.5 — Perform Automated Vulnerability Scans of Internal Enterprise Assets

Automated internal scans occur at least quarterly and include BOTH authenticated AND unauthenticated perspectives. Either perspective alone is materially incomplete.

Timing: At least quarterly scans [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls7/#75-perform-automated-vulnerability-scans-of-internal-enterprise-assets).

### 7.6 — Perform Automated Vulnerability Scans of Externally-Exposed Enterprise Assets

Automated scans cover externally exposed assets at least monthly. This source does not add the authenticated-and-unauthenticated requirement from 7.5.

Timing: At least monthly scans [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls7/#76-perform-automated-vulnerability-scans-of-externally-exposed-enterprise-assets).

### 7.7 — Remediate Detected Vulnerabilities

Detected software vulnerabilities are remediated through tooling/processes at least monthly according to the remediation process. No new numerical urgency deadlines are introduced.

Timing: At least monthly remediation under the process [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls7/#77-remediate-detected-vulnerabilities).

### 8.4 — Standardize Time Synchronization

Standardize time synchronization; the second clause requires at least two synchronized sources across assets where supported. The unqualified standardization sentence is separately mapped; no compulsory NTP vendor is introduced.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#84-standardize-time-synchronization).

### 8.5 — Collect Detailed Audit Logs

Sensitive-data assets have detailed audit logs with source, date, username, timestamp and source/destination addresses. Other useful investigation details are context-dependent, not an invented universal extra schema.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#85-collect-detailed-audit-logs).

### 8.6 — Collect DNS Query Audit Logs

Collect DNS query audit logs where appropriate AND supported. A CAS assumption about internally managed DNS does not by itself authorize a whole-record N/A decision.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#86-collect-dns-query-audit-logs).

### 8.7 — Collect URL Request Audit Logs

Collect URL request audit logs where appropriate AND supported. Do not impose a compulsory proxy product or remove the condition.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#87-collect-url-request-audit-logs).

### 8.8 — Collect Command-Line Audit Logs

Collect command-line audit logs; named shells and remote terminals are examples. Do not require every listed shell when it is absent from the client.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#88-collect-command-line-audit-logs).

### 8.9 — Centralize Audit Logs

Centralize collection AND retention to the extent possible under the audit-log process. SIEM is illustrative; neither a named product nor unconditioned centralization is required.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#89-centralize-audit-logs).

### 8.10 — Retain Audit Logs

Retain audit logs across enterprise assets for at least 90 days. This is a minimum, not a deletion/expiry instruction at day 90.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#810-retain-audit-logs).

### 8.11 — Conduct Audit Log Reviews

Review audit logs for potential-threat anomalies at least weekly. A review does not automatically verify evidence or complete findings/actions.

Timing: At least weekly reviews [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#811-conduct-audit-log-reviews).

### 9.3 — Maintain and Enforce Network-Based URL Filters

Enforce AND update network URL filtering for all assets to limit malicious OR unapproved destinations. Category, reputation and block-list methods are permissible examples.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls9/#93-maintain-and-enforce-network-based-url-filters).

### 9.4 — Restrict Unnecessary or Unauthorized Browser and Email Client Extensions

Uninstall OR disable unauthorized OR unnecessary browser/email plugins, extensions and add-ons. Do not prohibit every extension solely because it is an extension.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls9/#94-restrict-unnecessary-or-unauthorized-browser-and-email-client-extensions).

### 9.5 — Implement DMARC

Implement DMARC policy AND verification, starting with SPF AND DKIM. The source does not prescribe a particular DMARC policy value such as reject.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls9/#95-implement-dmarc).

### 9.6 — Block Unnecessary File Types

Block unnecessary file types at the email gateway. Do not require blocking every attachment type or a fixed product.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls9/#96-block-unnecessary-file-types).

### 10.4 — Configure Automatic Anti-Malware Scanning of Removable Media

Configure automatic anti-malware scanning of removable media. Do not replace automatic scanning with a monthly human review or add an unrelated cadence.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls10/#104-configure-automatic-anti-malware-scanning-of-removable-media).

### 10.5 — Enable Anti-Exploitation Features

Enable anti-exploitation features on assets AND software where possible. Named operating-system features are examples, not a Windows-only pass condition.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls10/#105-enable-anti-exploitation-features).

### 10.6 — Centrally Manage Anti-Malware Software

Centrally manage anti-malware software. No particular console/vendor or unrelated reporting integration is prescribed.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls10/#106-centrally-manage-anti-malware-software).

### 10.7 — Use Behavior-Based Anti-Malware Software

Use behavior-based anti-malware software. This does not impose an automatic containment/eradication policy.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls10/#107-use-behavior-based-anti-malware-software).

### 11.5 — Test Data Recovery

Test backup recovery at least quarterly on a sampling of in-scope assets. A full test of every asset every quarter is not required, and test performance is distinct from certifying every backup as recoverable.

Timing: At least quarterly recovery tests [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls11/#115-test-data-recovery).

### 12.2 — Establish and Maintain a Secure Network Architecture

Maintain secure network architecture addressing segmentation, least privilege AND availability. Documentation supports the architecture rather than replacing policy/design; no separate global redesign is authorized.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#122-establish-and-maintain-a-secure-network-architecture).

### 12.3 — Securely Manage Network Infrastructure

Securely manage network infrastructure. IaC, SSH and HTTPS are examples; no single management method or additional product is required.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#123-securely-manage-network-infrastructure).

### 12.4 — Establish and Maintain Architecture Diagram(s)

Maintain architecture diagrams AND/OR other network-system documentation with annual/relevant-change review. Do not require both documentation alternatives.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#124-establish-and-maintain-architecture-diagrams).

### 12.5 — Centralize Network Authentication, Authorization, and Auditing (AAA)

Centralize network authentication, authorization AND auditing. The malformed CAS heading is not a reason to change the correctly titled canonical definition.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#125-centralize-network-authentication-authorization-and-aucentralize-network-aaa).

### 12.6 — Use of Secure Network Management and Communication Protocols

Use secure network management AND communication protocols. 802.1X/WPA2-Enterprise are examples rather than requirements to implement those exact protocols everywhere.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#126-use-of-secure-network-management-and-communication-protocols).

### 12.7 — Ensure Remote Devices Utilize a VPN and are Connecting to an Enterprise's AAA Infrastructure

Users authenticate to enterprise-managed VPN AND authentication services before accessing resources from end-user devices. No undocumented alternative is substituted for the stated services.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#127-ensure-remote-devices-utilize-a-vpn-and-are-connecting-to-an-enterprises-aaa-infrastructure).

### 13.1 — Centralize Security Event Alerting

Centralized security-event alerts support correlation/analysis. A SIEM OR a log-analytics platform with security-relevant correlation alerts is valid; an unconfigured generic analytics platform is insufficient.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#131-centralize-security-event-alerting).

### 13.2 — Deploy a Host-Based Intrusion Detection Solution

Host intrusion detection is deployed where appropriate and/or supported. Detection is the required capability; do not import prevention obligations from 13.7.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#132-deploy-a-host-based-intrusion-detection-solution).

### 13.3 — Deploy a Network Intrusion Detection Solution

Network intrusion detection is deployed where appropriate. NIDS OR an equivalent provider service is acceptable; no on-premises appliance is compulsory.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#133-deploy-a-network-intrusion-detection-solution).

### 13.4 — Perform Traffic Filtering Between Network Segments

Filter traffic between segments where appropriate. This interview does not decide or save the network-architecture assessment from 12.2.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#134-perform-traffic-filtering-between-network-segments).

### 13.5 — Manage Access Control for Remote Assets

Remote-access decisions consider up-to-date anti-malware, secure-configuration compliance, and current OS AND applications. No vendor, minimum-release number or other arbitrary threshold is required.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#135-manage-access-control-for-remote-assets).

### 13.6 — Collect Network Traffic Flow Logs

Collect network flow logs AND/OR traffic from network devices for review/alerting. Full-packet capture is not always required.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#136-collect-network-traffic-flow-logs).

### 14.9 — Conduct Role-Specific Security Awareness and Skills Training

Conduct role-specific awareness AND skills training. OWASP courses and example role curricula are illustrative; no standalone annual cadence is stated in 14.9.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls14/#149-conduct-role-specific-security-awareness-and-skills-training).

### 15.2 — Establish and Maintain a Service Provider Management Policy

Maintain a provider policy covering classification, inventory, assessment, monitoring AND decommissioning, with annual/relevant-change review. Do not create a parallel vendor subsystem.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls15/#152-establish-and-maintain-a-service-provider-management-policy).

### 15.3 — Classify Service Providers

Classify providers and review/update classifications annually or after relevant significant change. Listed classification characteristics are optional examples, not an all-fields requirement.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls15/#153-classify-service-providers).

### 15.4 — Ensure Service Provider Contracts Include Security Requirements

Contracts include security requirements consistent with provider policy; review annually for missing requirements. Example encryption/notification/disposal clauses are not universally prescribed in this safeguard.

Timing: Annual contract review [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls15/#154-ensure-service-provider-contracts-include-security-requirements).

### 16.1 — Establish and Maintain a Secure Application Development Process

Maintain a secure development process addressing design, coding, training, vulnerability management, third-party code security AND testing; review documentation annually or after relevant significant changes.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#161-establish-and-maintain-a-secure-application-development-process).

### 16.2 — Establish and Maintain a Process to Accept and Address Software Vulnerabilities

Accept/address vulnerability reports including external reporting, responsible handling, intake/assignment/remediation/retesting, severity tracking and identification/analysis/remediation timing metrics. Review documentation annually/relevant-change; third-party developers consider externally-facing policy.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#162-establish-and-maintain-a-process-to-accept-and-address-software-vulnerabilities).

### 16.3 — Perform Root Cause Analysis on Security Vulnerabilities

Analyze underlying code-vulnerability causes when reviewing vulnerabilities. Fixing individual bugs without evaluating underlying causes is insufficient; no periodic review interval is invented.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#163-perform-root-cause-analysis-on-security-vulnerabilities).

### 16.4 — Establish and Manage an Inventory of Third-Party Software Components

Inventory current AND planned development components and their risks. At least monthly, identify changes/updates and validate support; a particular SBOM format is not obligatory.

Timing: At least monthly component-list evaluation [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#164-establish-and-manage-an-inventory-of-third-party-software-components).

### 16.5 — Use Up-to-Date and Trusted Third-Party Software Components

Use current trusted components; choose proven secure frameworks where possible. Acquire from trusted sources OR evaluate vulnerabilities before use; both source-verification alternatives are valid.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#165-use-up-to-date-and-trusted-third-party-software-components).

### 16.6 — Establish and Maintain a Severity Rating System and Process for Application Vulnerabilities

Maintain severity ratings/prioritization and a minimum release-security acceptability level, with annual review. The client defines its rating/release policy; no new application score or urgency threshold is invented.

Timing: Annual severity-system/process review [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#166-establish-and-maintain-a-severity-rating-system-and-process-for-application-vulnerabilities).

### 16.7 — Use Standard Hardening Configuration Templates for Application Infrastructure

Industry hardening templates cover applicable servers, databases, web servers, containers, PaaS AND SaaS; in-house applications must not weaken hardening. A composite answer affirms all present infrastructure categories, not nonexistent systems.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#167-use-standard-hardening-configuration-templates-for-application-infrastructure).

### 16.8 — Separate Production and Non-Production Systems

Maintain separate production and non-production environments. A particular number of environments or new tenant boundary is not prescribed.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#168-separate-production-and-non-production-systems).

### 16.9 — Train Developers in Application Security Concepts and Secure Coding

All development personnel receive secure-coding training tailored to environment/responsibility at least annually. Training design promotes team security AND builds security culture; general-security topics are optional examples, not a mandatory syllabus.

Timing: At least annual training [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#169-train-developers-in-application-security-concepts-and-secure-coding).

### 16.10 — Apply Secure Design Principles in Application Architectures

Architecture applies least privilege, mediation for every operation, distrust of user input AND attack-surface minimization. Input-check examples illustrate the principles rather than prescribe a universal field-validation implementation.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#1610-apply-secure-design-principles-in-application-architectures).

### 16.11 — Leverage Vetted Modules or Services for Application Security Components

Use vetted security modules/services and only standardized, currently accepted, extensively reviewed encryption algorithms. Platform-capability descriptions are guidance, not a requirement to use every OS feature.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#1611-leverage-vetted-modules-or-services-for-application-security-components).

### 17.4 — Establish and Maintain an Incident Response Process

Maintain a documented incident process addressing roles/responsibilities, compliance requirements AND communication plan, reviewed annually/relevant-change. Do not complete an incident or review automatically.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#174-establish-and-maintain-an-incident-response-process).

### 17.5 — Assign Key Roles and Responsibilities

Assign relevant incident functions, including provider roles where applicable, and review annually/relevant-change. One person/team may fill multiple functions; separate legal, HR or facilities departments are not mandated.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#175-assign-key-roles-and-responsibilities).

### 17.6 — Define Mechanisms for Communicating During Incident Response

Determine primary AND secondary incident communication/reporting mechanisms, accounting for disrupted channels, with annual/relevant-change review. The named channels are examples, not an all-products checklist.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#176-define-mechanisms-for-communicating-during-incident-response).

### 17.7 — Conduct Routine Incident Response Exercises

Plan/conduct routine scenarios for key incident personnel, testing communications, decisions AND workflows at least annually. An untested written plan alone is insufficient.

Timing: At least annual exercises [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#177-conduct-routine-incident-response-exercises).

### 17.8 — Conduct Post-Incident Reviews

Conduct post-incident reviews identifying lessons AND follow-up actions. No arbitrary annual exercise or automatic finding/action closure is added.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#178-conduct-post-incident-reviews).

### 18.1 — Establish and Maintain a Penetration Testing Program

Maintain a program suitable to enterprise size/complexity/industry/maturity, defining scope, frequency, limitations, contacts, remediation routing AND retrospectives. Scope examples are not universally compulsory; frequency is program-defined.

Timing: Program-defined frequency, no source numeric minimum [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls18/#181-establish-and-maintain-a-penetration-testing-program).

### 18.2 — Perform Periodic External Penetration Tests

Perform external tests according to the program at least annually, with enterprise/environment reconnaissance and a qualified experienced party. Clear-box OR opaque-box testing is valid; both are not required.

Timing: At least annual external tests under program requirements [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls18/#182-perform-periodic-external-penetration-tests).

### 18.3 — Remediate Penetration Test Findings

Remediate test findings under the documented process with timelines AND effort based on impact/prioritization. No fixed severity deadline or automatic action completion is introduced.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls18/#183-remediate-penetration-test-findings).

## Compatibility and limitations

Old question versions/answers/manual narratives/history remain readable and immutable. Only unchanged clause meanings may map into a new version. New 16.9 culture answer and changed 8.4 standardization answer must remain unanswered until reviewed. Row exclusions require source condition+rationale; whole-recordN/A still requires the established native approval path.

No shared/runtime/catalog file, assessment record, client, deployment, provider setting or other agent branch was edited. This pass did not independently approve its own work, run browser placements, write staging records or execute logout/login. Final independent review and hosted QA remain release gates.

Fixture inputs: program additions use explicit aggregate_answer (Yes for substantive cases unless specified; null for unanswered/context-only/manual-only), whileControl1root_answer derives from its substantive tool/logging criterion. The matrix records select encodings: accepted choices for semanticYes, listed deficient choices for semanticNo/Partially. Cadence selects never receive an invalid literalYes. Whole-recordN/A approval tests belong to the authorized native adapter; no generated result grantsN/A.

## Effective integrated question mapping

The matrix now records 246 actual mandatory answer mappings for the 74 additions against source commit `cb1fe5909b5f23da021bea09ca258f5010cd8c5c`, program `cis-v8.1-program-3`. Original source-review commit `b91eb91f94b74d81ad42a6c231a303a971bbd57c`, version2 mappings, and source provenance remain separately recorded. Control1 additions retain their unchanged dedicated version.

The new 16.9 security-culture row is included in atomic_requirements with its real matrix field/row; 8.4 standardization uses its unqualified mandatory field while the two-source clause retains its support condition. This correction addresses the unmapped-fixture verification gap; it is not application-failure evidence or a passed runtime result. New/changed historical answers remain unanswered until explicitly reviewed.
