# CIS IG3 additions source/content review

Baseline: `83d88e3cbc31d618060c4e094335963f5bacf096`. Reviewed 23 unique minimum-IG3 additions; inherited definitions are reused without stronger criteria. This is content engineering, not independent approval.

Primary [CIS Navigator v8.1](https://www.cisecurity.org/controls/cis-controls-navigator), retrieved 2026-10-09T19:58:31.378Z. Full-source comparison: 153 unique rows, minimum 56/74/23,cumulative 56/130/153, zero normalized ID/title/description/minimum-group differences. Source-row SHA256: `ce92fb09a96dfb24ca46ea13fd46d35fed0febdbba874838692b7c543ddda25c`; catalog SHA256: `3223e68c710f116812af9eb134fdd1fa142c615fca5f10f9925d0782f3f3b8af`.

The existing CAS comparison returned exit 1 for 23 source wording/title differences; that original result is retained in JSON provenance. Navigator is primary; no automatic catalog edits or CAS percentage scoring. Examples, suggested evidence and optional context do not become obligations.

The JSON matrix records every existing critical answer mapping, conditional clause, summary target, proposed correction, source interpretation and status-case reference. Status fixture expectations were chosen from source obligations plus the authorized application policy; no evaluator was called to invent expected values.

There are 690 explicit source-authored cases for these 23 definitions. They have not been executed by this content workstream and do not prove rendered placements or hosted saves.

## Necessary shared-owner requests

- **15.5**: Keep the stated source alternative visible rather than expressing annual AND contract events as mandatory. The existing15.5-c6 decision statement already retains OR. Guidance-only correction; stable criterion answers/meaning unchanged. Preserve old version exactly.
- The IG3 request is limited to 15.5 guidance. All other IG3 criteria retain their source-derived meaning. Shared eligibility, complete-summary persistence, compatibility and independent regression verification remain required.

## Coverage

| Safeguard | Minimum group | Clauses | Conditions | Content request | Source review |
| --- | --- | ---: | ---: | --- | --- |
| 1.5 — Use a Passive Asset Discovery Tool | IG3 | 4 | 0 | Reuse existing | Complete; independent pending |
| 2.7 — Allowlist Authorized Scripts | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 3.13 — Deploy a Data Loss Prevention Solution | IG3 | 6 | 0 | Reuse existing | Complete; independent pending |
| 3.14 — Log Sensitive Data Access | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 4.12 — Separate Enterprise Workspaces on Mobile End-User Devices | IG3 | 1 | 1 | Reuse existing | Complete; independent pending |
| 6.8 — Define and Maintain Role-Based Access Control | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 8.12 — Collect Service Provider Logs | IG3 | 1 | 1 | Reuse existing | Complete; independent pending |
| 9.7 — Deploy and Maintain Email Server Anti-Malware Protections | IG3 | 2 | 0 | Reuse existing | Complete; independent pending |
| 12.8 — Establish and Maintain Dedicated Computing Resources for All Administrative Work | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 13.7 — Deploy a Host-Based Intrusion Prevention Solution | IG3 | 2 | 2 | Reuse existing | Complete; independent pending |
| 13.8 — Deploy a Network Intrusion Prevention Solution | IG3 | 1 | 1 | Reuse existing | Complete; independent pending |
| 13.9 — Deploy Port-Level Access Control | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 13.10 — Perform Application Layer Filtering | IG3 | 1 | 0 | Reuse existing | Complete; independent pending |
| 13.11 — Tune Security Event Alerting Thresholds | IG3 | 1 | 0 | Reuse existing | Complete; independent pending |
| 15.5 — Assess Service Providers | IG3 | 2 | 0 | Submitted | Complete; independent pending |
| 15.6 — Monitor Service Providers | IG3 | 1 | 0 | Reuse existing | Complete; independent pending |
| 15.7 — Securely Decommission Service Providers | IG3 | 1 | 0 | Reuse existing | Complete; independent pending |
| 16.12 — Implement Code-Level Security Checks | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 16.13 — Conduct Application Penetration Testing | IG3 | 2 | 0 | Reuse existing | Complete; independent pending |
| 16.14 — Conduct Threat Modeling | IG3 | 4 | 0 | Reuse existing | Complete; independent pending |
| 17.9 — Establish and Maintain Security Incident Thresholds | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |
| 18.4 — Validate Security Measures | IG3 | 2 | 1 | Reuse existing | Complete; independent pending |
| 18.5 — Perform Periodic Internal Penetration Tests | IG3 | 3 | 0 | Reuse existing | Complete; independent pending |

## Source interpretations

### 1.5 — Use a Passive Asset Discovery Tool

Passive discovery identifies connected assets. Review and use its scans for inventory updates at least weekly; the source does not require the passive tool to be an active scanner.

Timing: At least weekly review/use of scans for inventory update [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls1/#15-use-a-passive-asset-discovery-tool).

### 2.7 — Allowlist Authorized Scripts

Authorized scripts execute, unauthorized scripts are blocked, and controls are reassessed within six months. Signatures, version control and named script extensions are examples rather than separate obligations.

Timing: Reassess at least every six months [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls2/#27-allowlist-authorized-scripts).

### 3.13 — Deploy a Data Loss Prevention Solution

An automated capability must identify all sensitive data stored, processed OR transmitted through enterprise assets, onsite AND at providers, and update the data inventory. Host DLP is an example.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#313-deploy-a-data-loss-prevention-solution).

### 3.14 — Log Sensitive Data Access

Sensitive-data logging covers access, modification AND disposal. No calendar log-review cadence is stated in this safeguard; do not import the weekly cadence from 8.11.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls3/#314-log-sensitive-data-access).

### 4.12 — Separate Enterprise Workspaces on Mobile End-User Devices

Separate enterprise and personal workspaces on supported mobile devices. Apple/Android product examples do not exclude other adequate implementations.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls4/#412-separate-enterprise-workspaces-on-mobile-end-user-devices).

### 6.8 — Define and Maintain Role-Based Access Control

Define and maintain roles with documented necessary rights; review authorization of all asset privileges at least annually. No particular RBAC product or automatic access-removal workflow is required.

Timing: At least annual privilege-authorization review [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls6/#68-define-and-maintain-role-based-access-control).

### 8.12 — Collect Service Provider Logs

Collect supported provider logs. Example event categories are not a requirement to obtain every category from every provider or demand provider certifications.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls8/#812-collect-service-provider-logs).

### 9.7 — Deploy and Maintain Email Server Anti-Malware Protections

Deploy AND maintain email-server anti-malware protection. Attachment scanning and/or sandboxing illustrate valid alternatives, not two obligatory products.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls9/#97-deploy-and-maintain-email-server-anti-malware-protections).

### 12.8 — Establish and Maintain Dedicated Computing Resources for All Administrative Work

All administrative work uses physically OR logically dedicated resources segmented from the primary network and without internet access. Both separation alternatives are valid; internet restriction is substantive.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls12/#128-establish-and-maintain-dedicated-computing-resources-for-all-administrative-work).

### 13.7 — Deploy a Host-Based Intrusion Prevention Solution

Host-based prevention is required where appropriate and/or supported. A product labelled EDR only satisfies the criterion when its prevention capability operates; detection-only is not equivalent.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#137-deploy-a-host-based-intrusion-prevention-solution).

### 13.8 — Deploy a Network Intrusion Prevention Solution

Network prevention is deployed where appropriate; NIPS OR equivalent provider service is valid. Do not treat a detection-only solution as prevention.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#138-deploy-a-network-intrusion-prevention-solutions).

### 13.9 — Deploy Port-Level Access Control

Use port-level access control through 802.1X OR similar protocols. User and/or device authentication may be used; both identity types are not independently obligatory.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#139-deploy-port-level-access-control).

### 13.10 — Perform Application Layer Filtering

Perform application-layer filtering. Proxy, firewall and gateway are examples, not three mandatory implementations.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#1310-perform-application-layer-filtering).

### 13.11 — Tune Security Event Alerting Thresholds

Tune security-event alerting thresholds at least monthly. Holding a governance meeting without tuning is not the required activity.

Timing: At least monthly threshold tuning [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls13/#1311-tune-security-event-alerting-thresholds).

### 15.5 — Assess Service Providers

Assess providers under the provider policy; scope may vary by classification. Annual-at-minimum OR new/renewed-contract reassessment wording is preserved. SOC/PCI reports, questionnaires and other rigorous processes are alternatives; no universal certification is mandatory.

Timing: Annually at a minimum, or with new and renewed contracts; preserve source alternative [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls15/#155-assess-service-providers).

### 15.6 — Monitor Service Providers

Monitor providers according to provider policy. Dark-web monitoring and release-note review are examples; no universal annual interval is stated.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls15/#156-monitor-service-providers).

### 15.7 — Securely Decommission Service Providers

Securely decommission providers. Account deactivation, terminated flows and disposal are examples to consider, not universal scored subclauses or a twelve-month deletion rule.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls15/#157-securely-decommission-service-providers).

### 16.12 — Implement Code-Level Security Checks

Use BOTH static AND dynamic analysis within the application lifecycle. Do not import an every-commit rule or fixed calendar cadence.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#1612-implement-code-level-security-checks).

### 16.13 — Conduct Application Penetration Testing

Conduct application penetration testing using skilled manual manipulation as authenticated AND unauthenticated users. Authenticated testing is highlighted for critical apps; the annual interval from 18.2/18.5 is not imported.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#1613-conduct-application-penetration-testing).

### 16.14 — Conduct Threat Modeling

Specially trained people assess design risks for each entry point AND access level before code is created, mapping the application, architecture AND infrastructure. No particular threat-model methodology is required.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls16/#1614-conduct-threat-modeling).

### 17.9 — Establish and Maintain Security Incident Thresholds

Maintain incident thresholds distinguishing incident from event, with annual/relevant-change review. Example event types do not become compulsory numerical severity thresholds.

Timing: Annually or relevant significant enterprise change [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls17/#179-establish-and-maintain-security-incident-thresholds).

### 18.4 — Validate Security Measures

Validate security measures after EACH penetration test; change detection rules/capabilities when deemed necessary. A justified no-change case is permitted for the conditional clause.

Timing: No fixed calendar cadence in source; any event/operating constraint remains in atomic requirements. [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls18/#184-validate-security-measures).

### 18.5 — Perform Periodic Internal Penetration Tests

Perform internal tests according to the program at least annually. Clear-box OR opaque-box is valid; external-test reconnaissance and other neighboring requirements are not imported.

Timing: At least annual internal tests under program requirements [CIS source](https://cas.docs.cisecurity.org/en/latest/source/Controls18/#185-perform-periodic-internal-penetration-tests).

## Compatibility and limitations

Old question versions/answers/manual narratives/history remain readable and immutable. Only unchanged clause meanings may map into a new version. New 16.9 culture answer and changed 8.4 standardization answer must remain unanswered until reviewed. Row exclusions require source condition+rationale; whole-recordN/A still requires the established native approval path.

No shared/runtime/catalog file, assessment record, client, deployment, provider setting or other agent branch was edited. This pass did not independently approve its own work, run browser placements, write staging records or execute logout/login. Final independent review and hosted QA remain release gates.

Fixture inputs: program additions use explicit aggregate_answer (Yes for substantive cases unless specified; null for unanswered/context-only/manual-only), whileControl1root_answer derives from its substantive tool/logging criterion. The matrix records select encodings: accepted choices for semanticYes, listed deficient choices for semanticNo/Partially. Cadence selects never receive an invalid literalYes. Whole-recordN/A approval tests belong to the authorized native adapter; no generated result grantsN/A.

## Effective integrated question mapping

The matrix now records 55 actual mandatory answer mappings for the 23 additions against source commit `cb1fe5909b5f23da021bea09ca258f5010cd8c5c`, program `cis-v8.1-program-3`. Original source-review commit `b91eb91f94b74d81ad42a6c231a303a971bbd57c`, version2 mappings, and source provenance remain separately recorded. Control1 additions retain their unchanged dedicated version.

The new 16.9 security-culture row is included in atomic_requirements with its real matrix field/row; 8.4 standardization uses its unqualified mandatory field while the two-source clause retains its support condition. This correction addresses the unmapped-fixture verification gap; it is not application-failure evidence or a passed runtime result. New/changed historical answers remain unanswered until explicitly reviewed.
