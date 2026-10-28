# CIS v8.1 fictional Explore showcase source audit

Observed 2026-10-28 against `e09636c28f3414e2821f96e7039c95b7eb990dbb` before seed changes. This is an engineering source audit, not independent CIS validation, operational assurance or a compliance determination. The refresh is limited to the existing Explore identities `demo_brawndo`, `demo_initech` and `demo_krusty_krab`; no authenticated data or other client is a seed target.

## Primary sources and catalog comparison

- [Official CIS Controls Navigator](https://www.cisecurity.org/controls/cis-controls-navigator): the live page supplied 153 unique safeguard entries. All minimum IG memberships and normalized safeguard descriptions matched `shared/catalogs/cisIG1.json`. The only title difference was the straight/curly apostrophe in 12.7; no semantic catalog correction was confirmed.
- [CIS v8.1](https://www.cisecurity.org/controls/v8-1) and the [official release](https://www.cisecurity.org/insights/white-papers/cis-critical-security-controls-v8-1): v8.1 was published June 24, 2024. Earlier fictional organizational history cannot be represented as contemporaneous v8.1 assessments.
- [IG1](https://www.cisecurity.org/controls/implementation-groups/ig1), [IG2](https://www.cisecurity.org/controls/implementation-groups/ig2), [IG3](https://www.cisecurity.org/controls/implementation-groups/ig3): 56 foundational safeguards, 74 additional IG2 safeguards, and 23 additional IG3 safeguards; cumulative populations are 56, 130 and 153.
- Live [CIS Assessment Specification](https://cas.docs.cisecurity.org/) Control 1–18 pages also had 153 matching minimum memberships. CAS has editorial differences, including a malformed 12.5 heading. It is assessment context, not authority to silently replace the Navigator-matched licensed catalog text.

| Existing fictional program | Cumulative safeguards | Default mapped Reviews | Selected document containers |
| --- | ---: | ---: | ---: |
| Brawndo IG1 | 56 | 12 | 10 |
| Initech IG2 | 130 | 15 | 10 |
| Krusty Krab IG3 | 153 | 15 | 10 |

Every applicable safeguard has an available Review-plan mapping. IG3 also has five optional focused trackers disabled by default. Optional tracking does not make its underlying operating duty optional. The initial audit found stale unused trailing metadata `implementation_groups: [1, 2]`. Integration corrects that descriptive list to `[1, 2, 3]`, matching the official IG3 cumulative scope and the already-released authoritative `available_implementation_groups: [1, 2, 3]`. Consumer search confirmed runtime gates use the latter; no release capability, safeguard membership, scoring, cadence or permission is changed. A regression checks both declarations and the actual 56/130/153 populations. Sources: [official IG3](https://www.cisecurity.org/controls/implementation-groups/ig3) and [v8.1](https://www.cisecurity.org/controls/v8-1).

## Required contents versus supporting policy titles

The ten selected containers are Information Security, Access Control/Identity, Vendor Risk, Data Classification/Handling, Retention/Disposal, Vulnerability/Patch, Configuration, Awareness, Incident Response and Backup/Restoration. CIS does not mandate these exact template titles. A title, approval or scheduled Review alone does not demonstrate the necessary process contents or execution.

Clarification of the initial audit: the canonical 6.1 description expressly starts **“Establish and follow a documented process, preferably automated”**. The 8.1 description starts **“Establish and maintain a documented audit log management process”**. Thus both call for documented processes; neither mandates an Access Control or Information Security policy by name. The existing supporting-container classifications do not require a catalog rewrite. Sources: [Control 6](https://cas.docs.cisecurity.org/en/latest/source/Controls6/), [Control 8](https://cas.docs.cisecurity.org/en/latest/source/Controls8/).

Applicable content inventory:

- **IG1:** enterprise asset/software/data/account/provider inventories; data-management process (3.1); configuration processes (4.1/4.2); granting/revoking access (6.1/6.2); vulnerability/remediation processes (7.1/7.2); logging process (8.1); recovery procedures (11.1); awareness program (14.1); incident personnel, contacts and reporting process (17.1–17.3). [Controls 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/), [2](https://cas.docs.cisecurity.org/en/latest/source/Controls2/), [3](https://cas.docs.cisecurity.org/en/latest/source/Controls3/), [4](https://cas.docs.cisecurity.org/en/latest/source/Controls4/), [5](https://cas.docs.cisecurity.org/en/latest/source/Controls5/), [11](https://cas.docs.cisecurity.org/en/latest/source/Controls11/), [14](https://cas.docs.cisecurity.org/en/latest/source/Controls14/), [17](https://cas.docs.cisecurity.org/en/latest/source/Controls17/).
- **IG2 additions:** classification scheme/data flows (3.7/3.8); service-account and authentication-system inventories (5.5/6.6); architecture and diagrams (12.2/12.4); provider-management policy/classifications/contracts (15.2–15.4); development and vulnerability-report handling processes, component inventory and severity process (16.1/16.2/16.4/16.6); incident response roles/communications/exercises (17.4–17.8); penetration-testing program/results (18.1–18.3). [Controls 12](https://cas.docs.cisecurity.org/en/latest/source/Controls12/), [15](https://cas.docs.cisecurity.org/en/latest/source/Controls15/), [16](https://cas.docs.cisecurity.org/en/latest/source/Controls16/), [18](https://cas.docs.cisecurity.org/en/latest/source/Controls18/).
- **IG3 additions:** documented role/access rights (6.8), incident thresholds (17.9), authorized scripts (2.7), provider assessment/monitoring/decommissioning records (15.5–15.7), application penetration testing/threat modeling (16.13/16.14), and internal penetration tests (18.5). The 6.8 matrix and 17.9 thresholds link directly to their native assessments; they do not introduce policies or change application roles/permissions.

## Operating timing is not a manual Review schedule

| Duty | Source timing or trigger |
| --- | --- |
| 1.1 / 2.1 inventory reviews | At least six-monthly |
| 1.2 unauthorized assets; 1.4 DHCP inventory updates; 1.5 passive-discovery reconciliation | Weekly |
| 1.3 active discovery | Daily |
| 2.2/2.3 support/unauthorized software; 12.1 infrastructure support | Monthly |
| 2.5–2.7 allowlist reassessment | Six-monthly; enforcement operates between reassessments |
| 5.1 / 5.5 account authorization | Quarterly |
| 5.3 dormant accounts | 45 days of inactivity, where supported |
| 6.1 / 6.2 | Granting at hire/role change; immediate revocation on the specified events |
| 7.3/7.4/7.7 patching/remediation; 7.6 external scans | Monthly |
| 7.5 internal scans | Quarterly |
| 8.11 log examination | Weekly |
| 8.10 log retention | At least 90 days; a retention threshold, not a Review cadence |
| 11.2 backups / 11.5 recovery tests | Weekly backups; quarterly sampled recovery tests |
| 13.11 alert tuning / 16.4 component inventory | Monthly |
| 14.1 / 16.9 training | Workforce hire/annual program; developer training annually |
| 15.5 provider assessment | Annual minimum coverage and applicable contract-triggered assessment |
| 17.7 exercises / 18.2 and 18.5 infrastructure tests | At least annually |
| 17.8 post-incident review / 16.14 threat modeling | After incidents / during design before coding |

The linked Control pages above provide the per-safeguard requirements. [Control 7](https://cas.docs.cisecurity.org/en/latest/source/Controls7/) and [Control 13](https://cas.docs.cisecurity.org/en/latest/source/Controls13/) cover the scan/patch and alert-tuning intervals. No fixed calendar interval is invented for 16.13 or other source-defined activities. Annual/change-triggered process maintenance remains distinct from executing its operational duties.

Default native plans remain semiannual asset inventory; monthly software and vulnerability governance; quarterly access and recommended endpoint validation; annual data/configuration/logging/recovery/awareness/provider/incident governance. IG2/IG3 add recommended quarterly network validation, monthly development/component validation and annual penetration-program Review. These grouped wrappers are not proof that every underlying duty occurred.

## Compact fictional evidence contract

`seedCisOperatingEvidence` adds only native Evidence records and assessment Evidence links, using existing same-client current Review relationships. It creates no Reviews, users, accounts, policies, assessments or product permissions, and does not amend completed occurrences, assessment decisions or history.

- Three compact UTF-8 CSV bundles separate periodic duties, event duties and configuration/threshold observations, keeping each bundle inside the native 100-relationship limit. They cover assessed applicable operational, event, training and configuration-state duties, including the five focused operating duties whose catalog type is recurring (1.5, 2.7, 13.11, 15.5 and 18.5). This does not enable their optional standalone trackers. Requirement descriptions/titles remain owned by the native catalog; CSV IDs refer back to those linked safeguards.
- Date-code headers identify a few recent daily/weekly/monthly/quarterly/annual/event samples. Four recent quarterly recovery samples and an explicit 45-day dormant-account example are included where applicable. These are file-local fictional examples, not new Systems or account records.
- A/P/G codes retain Addressed/In Progress/Needs Attention. P/G denote incomplete coverage. All files state they are fictional samples; none claims real automated execution or full-period assurance. Unassessed/unimplemented/unsupported-version records receive no sample.
- The source-driven fixture correction preserves additional change/hire/report-intake/contract triggers with `*`, separately from a calendar interval. An explicit negative cadence guard keeps 16.13 source-defined rather than importing annual infrastructure-test timing; no catalog wording or business rule is changed.
- IG3 gets small fictional business-role rights and incident-threshold CSVs, not application-role changes or live detection settings.
- Stable IDs and preflight collision checks prevent overwriting retained Evidence bytes. No network, clock read, storage-policy change or implicit migration is introduced by the builder.
- Targets are at most 2 KiB raw operating bytes per client and 500 bytes combined special-content bytes. The existing aggregate inline budget is 64 KiB of UTF-16 base64 payload, not 64 KiB raw files. Whole-seed persistence must also account for all other clients' retained files; these targets are not proof of an integrated reload pass.

The product owner separately approved a bounded source-backed byte fallback after measurement found that the existing, out-of-scope Dunder/Prestige payloads already exceeded that aggregate inline budget. Their files and the budget are not changed by this builder. New canonical fictional files register a compact initial recipe only under verified fresh-showcase provenance, through `registerCisDemoArtifact`. Retained files are not retrofitted or silently claimed as regenerable.

For operating CSVs, the recipe contains only its schema/fixture version, exact client, initial UTC anchor, artifact key and bounded initial `{id, state, frequency, trigger}` rows. It contains neither base64 nor another copy of the file text. The registrar separately captures original immutable native metadata and clones the recipe. Seed creation and permitted fallback both call the same `renderCisOperatingArtifact` implementation. That renderer never reads current assessments, catalog text, a live clock or another client's data; later visitor edits cannot alter the original file. Unknown versions, keys, malformed dates, duplicate/out-of-bounds IDs, invalid codes and wrong artifact shapes return no replacement bytes. Schema-1 text templates are part of this original-byte contract; future text changes must preserve the old renderer or use a new schema rather than silently rewriting saved artifacts.

## Eight-year and verification limits

The previous generator imported five reporting points over 12 months and restricted its CIS scenario context to IG2/IG3. The current showcase qualifies six explicit positions for all three canonical clients: 12/6/3 calendar months ago, 75 days ago, one calendar month ago and the current anchor. Each position derives from the actual fictional assessment histories at that cutoff. Brawndo models 18 months of assessment progression, Initech 24 and Krusty 28, with every origin clipped to June 24, 2024 or later. The normal reporting window remains at most 36 months; no new chart control is introduced.

Native Portfolio browser inspection found that three calendar months can be 92 days, leaving too few source observations inside the existing 90-day forecast window. The new-v2-only 75-day observation supplies an additional in-window assessment-history-derived position; it does not lower forecast thresholds, change the formula, interpolate percentages or add a current-state forecast vote. Exact context admission requires six points for `cis81-showcase-v2` and retains five for `cis81-standard-demo-v1`. The separate retained 19-point Brawndo history contract is unchanged. New regressions require the actual native forecast result and positive pace for Brawndo/Initech across 1/3/6/12-month reports, while Krusty remains fully implemented. Those reruns and both subsequent builds are pending at this documentation freeze; this source change is not yet a passed or hosted verification claim.

Mapped CIS program Review tracking starts no earlier than the recent 12-month operating year, separately from that longer assessment progression. Supplemental Risk/Vendor/AI Review series retain up to two eligible preceding native cycles subject to record creation; annual series can therefore extend beyond 12 months. Do not describe every native Review as a 12-month series or imply uninterrupted multi-year manual coverage from the assessment chart.

Krusty Krab's implemented eight-year organizational chronology is in policy version-1.0 approval subjects/decision history and eight annual individual-policy maintenance occurrences; the later version-2.0 approval is distinct. It does not claim pre-v8.1 CIS assessments. Current Risk records and their recent decisions/linked Review snapshots are separate; this source does not implement or claim eight years of residual-Risk history. Policy drafts, exact covered versions, original approvals and native recurrence anchors must stay truthful to their synthetic records.

The native Risk examples include a standalone physical business-continuity exposure scored 25, independently of AI screening and CIS posture. Its Critical contingency Action is due at anchor plus 60 days. The medium-priority supplier assurance follow-up is overdue at minus 5 days. ChatGPT/Claude link to the separate score-9 procedure-drafting Risk; Copilot links to the accepted score-6 retrieval Risk. Brawndo's Data Classification document is already submitted (`in_review`, version `2.1-draft`, with approval request/subject/submission metadata), awaiting a decision rather than awaiting submission. Exact native locations are listed in the release coverage matrix.

The coordinator has executed the byte-factory/provider regressions. The saved `FOCUSED-FINAL-CANDIDATE.log` reports five passing suites and one failing suite, 155 passing tests and one failure; operating evidence, operation fixtures, refresh, native seed and scoped download-provider suites pass in that run. Its remaining failure is an old exact-one-inventory-file expectation in `demoPortfolio.test.js`; this historical run is not an all-green qualification of a later source revision. Raw earlier failures remain retained. Targeted native adapter tests demonstrate saved-state/empty-cache exact-byte recovery and the existing tenant/read-only/Clear boundaries; they do not establish authenticated or browser/hosted persistence. This source owner ran no tests. Final source checks, both builds, CI, actual browser workflows, hosted revision and human acceptance require separate candidate-bound evidence from the release coordinator. No real operation, zoom or deployment is certified by this document.
