# CIS IG1 OmniBot content review

Approved base: 83d88e3cbc31d618060c4e094335963f5bacf096. Reviewed 2026-10-09.

This is the content implementer review of all 56 unique minimum-IG1 safeguards. It is not independent QA, browser verification, a hosted-save result, or release acceptance. Every IG1 definition is inherited unchanged by IG2/IG3.

Live Navigator verification found 153 unique safeguards and exact canonical title, text and group matches for all 56 IG1 definitions. CAS was inspected separately; its metrics/dependencies do not create hidden mandatory criteria.

The per-atom source, active question/field mapping, scored/context distinction, status precedence, summary serialization contract and source-derived expected cases are in `ig1-review.json` and `ig1-status-cases.json`.

## Versioned corrections and explicit limitations

- 1.2 new control1-4 scores only process, weekly addressing and any one permitted effective response. Neighbor inventory, detection method, named tools, owners and additional proof/recordkeeping are optional context. Historical question versions remain immutable. The legacy unresolved observation stays non-scoring: an open record after quarantine is not automatically an unaddressed weekly breach.
- Stable v2 answers are mapped only after explicit version review. Historical pilot-1 mixed gap/unknown text is preserved as legacy context/history; it must not silently become new confirmed gaps.
- New generic-version substantive matrices remain reachable for No/unknown aggregate answers; all-unknown, confirmed absence, meaningful partial facts and contradictions are separated. Approved 1.1 control1-3 stays the acceptance reference.
- 11.1 has a current official-source discrepancy: Navigator omits detailed backup procedures; CAS normative v8.1 text explicitly includes them. Retain the existing source-supported criterion and require independent QA to review/record this bounded interpretation.
- Whole N/A is never auto-granted by interview. Source-conditioned row exclusions require rationale, and all-excluded conditional scope still requires the existing native applicability approval path.
- Empty optional notes/evidence do not lower status. No evidence is automatically verified; no review, findings/actions, dates or other records are written by content generation.

## Coverage

| ID | Safeguard | Atomic mappings | Cadence/trigger reviewed | Source/content result |
| --- | --- | ---: | --- | --- |
| 1.1 | Establish and Maintain Detailed Enterprise Asset Inventory | 17 | At least every six months | existing requirement decomposition retained |
| 1.2 | Address Unauthorized Assets | 3 | Weekly or more often | v4 correction proposed |
| 2.1 | Establish and Maintain a Software Inventory | 12 | At least every six months | existing requirement decomposition retained |
| 2.2 | Ensure Authorized Software is Currently Supported | 5 | Monthly or more often | existing requirement decomposition retained |
| 2.3 | Address Unauthorized Software | 2 | Monthly or more often | existing requirement decomposition retained |
| 3.1 | Establish and Maintain a Data Management Process | 7 | Annually and on significant change | existing requirement decomposition retained |
| 3.2 | Establish and Maintain a Data Inventory | 2 | At least annually | existing requirement decomposition retained |
| 3.3 | Configure Data Access Control Lists | 5 | No fixed review cadence | existing requirement decomposition retained |
| 3.4 | Enforce Data Retention | 3 | Enterprise-defined retention limits | existing requirement decomposition retained |
| 3.5 | Securely Dispose of Data | 2 | At disposal | existing requirement decomposition retained |
| 3.6 | Encrypt Data on End-User Devices | 1 | No fixed review cadence | existing requirement decomposition retained |
| 4.1 | Establish and Maintain a Secure Configuration Process | 7 | Annually and on significant change | existing requirement decomposition retained |
| 4.2 | Establish and Maintain a Secure Configuration Process for Network Infrastructure | 2 | Annually and on significant change | existing requirement decomposition retained |
| 4.3 | Configure Automatic Session Locking on Enterprise Assets | 3 | Inactivity: general OS ≤15 minutes; mobile ≤2 minutes | existing requirement decomposition retained |
| 4.4 | Implement and Manage a Firewall on Servers | 2 | No fixed review cadence | existing requirement decomposition retained |
| 4.5 | Implement and Manage a Firewall on End-User Devices | 2 | No fixed review cadence | existing requirement decomposition retained |
| 4.6 | Securely Manage Enterprise Assets and Software | 3 | No fixed review cadence | existing requirement decomposition retained |
| 4.7 | Manage Default Accounts on Enterprise Assets and Software | 2 | No fixed review cadence | existing requirement decomposition retained |
| 5.1 | Establish and Maintain an Inventory of Accounts | 9 | Quarterly or more often | existing requirement decomposition retained |
| 5.2 | Use Unique Passwords | 1 | No fixed review cadence | existing requirement decomposition retained |
| 5.3 | Disable Dormant Accounts | 1 | After 45 days of inactivity, where supported | existing requirement decomposition retained |
| 5.4 | Restrict Administrator Privileges to Dedicated Administrator Accounts | 2 | No fixed review cadence | existing requirement decomposition retained |
| 6.1 | Establish an Access Granting Process | 3 | Hire or role change | existing requirement decomposition retained |
| 6.2 | Establish an Access Revoking Process | 2 | Immediately at termination, revocation or role change | existing requirement decomposition retained |
| 6.3 | Require MFA for Externally-Exposed Applications | 2 | No fixed review cadence | existing requirement decomposition retained |
| 6.4 | Require MFA for Remote Network Access | 1 | No fixed review cadence | existing requirement decomposition retained |
| 6.5 | Require MFA for Administrative Access | 3 | No fixed review cadence | existing requirement decomposition retained |
| 7.1 | Establish and Maintain a Vulnerability Management Process | 2 | Annually and on significant change | existing requirement decomposition retained |
| 7.2 | Establish and Maintain a Remediation Process | 2 | Monthly or more often | existing requirement decomposition retained |
| 7.3 | Perform Automated Operating System Patch Management | 2 | Monthly or more often | existing requirement decomposition retained |
| 7.4 | Perform Automated Application Patch Management | 2 | Monthly or more often | existing requirement decomposition retained |
| 8.1 | Establish and Maintain an Audit Log Management Process | 5 | Annually and on significant change | existing requirement decomposition retained |
| 8.2 | Collect Audit Logs | 1 | As defined by the logging process | existing requirement decomposition retained |
| 8.3 | Ensure Adequate Audit Log Storage | 1 | As defined by the logging process | existing requirement decomposition retained |
| 9.1 | Ensure Use of Only Fully Supported Browsers and Email Clients | 4 | Current supported vendor versions | existing requirement decomposition retained |
| 9.2 | Use DNS Filtering Services | 2 | No fixed review cadence | existing requirement decomposition retained |
| 10.1 | Deploy and Maintain Anti-Malware Software | 2 | No fixed review cadence | existing requirement decomposition retained |
| 10.2 | Configure Automatic Anti-Malware Signature Updates | 1 | Automatic updates | existing requirement decomposition retained |
| 10.3 | Disable Autorun and Autoplay for Removable Media | 2 | No fixed review cadence | existing requirement decomposition retained |
| 11.1 | Establish and Maintain a Data Recovery Process | 6 | Annually and on significant change | source discrepancy qualified |
| 11.2 | Perform Automated Backups | 2 | Weekly or more often, based on sensitivity | existing requirement decomposition retained |
| 11.3 | Protect Recovery Data | 1 | No fixed review cadence | existing requirement decomposition retained |
| 11.4 | Establish and Maintain an Isolated Instance of Recovery Data | 1 | No fixed review cadence | existing requirement decomposition retained |
| 12.1 | Ensure Network Infrastructure is Up-to-Date | 2 | Monthly or more often | existing requirement decomposition retained |
| 14.1 | Establish and Maintain a Security Awareness Program | 3 | Training at hire and annually; content review annually and on significant change | existing requirement decomposition retained |
| 14.2 | Train Workforce Members to Recognize Social Engineering Attacks | 1 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 14.3 | Train Workforce Members on Authentication Best Practices | 1 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 14.4 | Train Workforce on Data Handling Best Practices | 7 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 14.5 | Train Workforce Members on Causes of Unintentional Data Exposure | 1 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 14.6 | Train Workforce Members on Recognizing and Reporting Security Incidents | 2 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 14.7 | Train Workforce on How to Identify and Report if Their Enterprise Assets are Missing Security Updates | 2 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 14.8 | Train Workforce on the Dangers of Connecting to and Transmitting Enterprise Data Over Insecure Networks | 2 | No standalone cadence in this safeguard; parent-program timing is read-only context. | existing requirement decomposition retained |
| 15.1 | Establish and Maintain an Inventory of Service Providers | 4 | Annually and on significant change | existing requirement decomposition retained |
| 17.1 | Designate Personnel to Manage Incident Handling | 5 | Annually and on significant change | existing requirement decomposition retained |
| 17.2 | Establish and Maintain Contact Information for Reporting Security Incidents | 2 | At least annually | existing requirement decomposition retained |
| 17.3 | Establish and Maintain an Enterprise Process for Reporting Incidents | 7 | Annually and on significant change | existing requirement decomposition retained |

## Executed checks

- Read every IG1 canonical description and authored atomic requirement; matched every Navigator ID/title/text/minimum group live.
- Read current composite question construction and evaluator, approved control1-3, refined groups, current summary and legacy version boundaries.
- Executed existing release-time CAS verification: 153 found, 23 catalog/CAS text differences globally (exit 1). IG1 differences were 4.4, 11.1, 14.5, 14.7 and 15.1. Four are editorial; 11.1 is explicitly qualified above. This failed comparison is not hidden or called a passing source check.
- Structural assertions enforce 56 unique rows, nonempty source-to-question mappings and linked expected cases. Status fixtures contain 1,052 source-justified cases, not results copied from running the evaluator. Every atom has satisfied/unmet/unknown cases; explicit alternatives, exclusions, contradictions and selected cadence boundaries are included. This is not exhaustive answer-combination coverage.

No application tests, rendered placement sweep, authenticated hosted writes or deployment were performed by this content agent. Runtime integration and independent source/decision review remain release gates.

## Fixture correction pass

Original artifacts remain in commit `d924c4217fad88c482e2651538a83327ac9e0568`; the lead retains the original failing runtime log. The v2 fixture artifact records per-case defects and corrections. Eighteen legitimate exclusion cases lost their input rationale through shared-object mutation; these inputs are restored. Single-substantive absence/unknown expectations now depend on source facts, not the aggregate proxy. Independent integrated QA adjudicated that aggregate `Not sure` is not a new source obligation when every applicable substantive atom is accepted Yes. Affirmative aggregate No/Partially contradictions remain protected. Clauses sharing a source condition are excluded consistently; all excluded conditional scope remains Not Assessed pending native applicability.

All 1,052 fixture identities and source-to-case references are preserved. Structural checks passed; application execution remains the lead’s separate integration test result.
