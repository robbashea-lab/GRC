# ISO/IEC 27001:2022 framework staging architecture

Research date: 2026-10-01

Branch: `codex/iso27001-staging`

Baseline: `origin/main` at `fc02c0b42bbe0ee3f6de471499d87381c0284808`

This is a content and architecture staging package, not a certification opinion, UI redesign, migration or deployment. It supplements the existing runtime catalog in `frontend/src/lib/iso27001.json` with the machine-readable programme definition in `frontend/src/lib/iso27001Staging.json`.

## A. Architecture proposal

The ISO environment has four connected workspaces:

1. **ISMS Requirements** — all mandatory Clause 4–10 assessment units.
2. **Statement of Applicability** — organization-specific necessary controls, including every Annex A comparison and any necessary control outside Annex A.
3. **Annex A Control Implementation** — implementation-neutral control records linked to authoritative Risks, Policies, Evidence, Findings and Actions.
4. **ISMS Assurance and Governance** — internal audit programme, management review, objectives, recurring Reviews and corrective action.

The record flow is:

`Context and obligations → Risks → Risk treatment → Necessary controls → SoA → Implementation → Evidence → Review/Audit → Finding → Action → Verification`

No parallel Risk, Policy, Evidence, Finding or remediation store is proposed. Existing Omnisciente modules remain authoritative and tenant-scoped.

## B. ISO requirement catalog

The existing catalog contains 30 leaf assessment units across Clauses 4–10. Parent headings are navigation groups, not duplicate assessments. The staging definition adds, for every unit:

- what the organization must establish, maintain or do;
- what an internal reviewer should verify;
- typical records;
- whether the activity recurs;
- the related Review plan, where one exists; and
- the responsible workspace.

All Clause 4–10 records remain mandatory. `Not Applicable` is rejected for these records.

## C. Annex A catalog

The existing catalog contains exactly 93 unique 2022 identifiers:

| Theme | Range | Count |
| --- | --- | ---: |
| Organizational | A.5.1–A.5.37 | 37 |
| People | A.6.1–A.6.8 | 8 |
| Physical | A.7.1–A.7.14 | 14 |
| Technological | A.8.1–A.8.34 | 34 |

There are no legacy 2013 identifiers in the catalog. Existing display titles are intentionally authored summaries, not represented as licensed or verbatim ISO titles. Exact official-title validation remains a licensed-source gate; identifiers and theme assignments are machine-checked now.

## D. Statement of Applicability model

The target model is not a Yes/No table. Each SoA entry records:

- source kind: Annex A, external or custom;
- Annex reference or custom reference and description;
- Necessary or Not Necessary decision;
- the applicable justification;
- Implemented, Partially Implemented or Not Implemented status for necessary controls;
- current implementation narrative and references;
- linked Risks and risk treatments;
- linked Policies, processes or shared Controls;
- owner and review history.

The four operator-facing states are:

- Necessary — Implemented
- Necessary — Partially Implemented
- Necessary — Not Implemented
- Not Necessary

The current runtime persists `included` / `excluded` and uses assessment status `not_applicable`. That behavior is preserved on this isolated branch because changing a shared schema would affect other framework work. A backward-compatible migration to Necessary / Not Necessary is an approval decision.

## E. Internal audit programme model

The programme is a separate aggregate above Reviews. It records the audit cycle, objectives, scope, risk basis, coverage target, approval and status. Each audit engagement remains a Review and records:

- planned period and completion date;
- scope and criteria;
- clauses and controls covered;
- auditor assignment and independence check;
- result and status;
- report or working-paper Evidence; and
- Findings raised.

Coverage rows answer what was planned, completed, when, by whom, against what criteria, what remains, and which Findings resulted. The cycle is client-defined. Quarterly packages may be a useful operating pattern, but they are not an ISO-prescribed frequency.

## F. Management review model

The existing Review mechanism should expose a typed `ISO 27001 Management Review` template. The staged model lists the required input topics, output topics, participants, decisions, improvement opportunities, ISMS changes, Evidence and resulting Action Items. Completion is a structured record, not a checkbox.

Management review is required at planned intervals. No numeric frequency is asserted. An annual default is an Omnisciente recommendation or client-selected cadence, never `ISO Required`.

## G. Recurring obligation matrix

The full machine-readable matrix is in `iso27001Staging.json`.

| Activity | ISO source | Recurrence required? | Frequency specified? | Recommended cadence | Cadence provenance | Omnisciente module |
| --- | --- | --- | --- | --- | --- | --- |
| Risk assessment review | 8.2 | Yes | No | Annual + significant change | Omnisciente recommended | Risks / Reviews |
| Risk treatment review | 6.1.3, 8.3 | No blanket interval | No | With risk review/change | Omnisciente recommended | Risks / Actions |
| Objective review | 6.2, 9.1 | Yes | No | Quarterly | Omnisciente recommended | Objectives / Reviews |
| Internal audit | 9.2.1, 9.2.2 | Yes | No | Client-defined cycle | Client-selected | Audit Programme / Reviews |
| Management review | 9.3.1–9.3.3 | Yes | No | Annual | Omnisciente recommended | Reviews |
| SoA review | 6.1.3 | No blanket interval | No | Annual + material change | Omnisciente recommended | SoA / Reviews |
| Policy review | A.5.1 | Yes | No | Annual + significant change | Omnisciente recommended | Policies / Reviews |
| Access entitlement review | A.5.18 | Yes | No | Quarterly | iVenture operating cadence | Reviews |
| Backup/restoration testing | A.8.13 | Yes | No | Annual restoration exercise | Omnisciente recommended | Reviews / Evidence |
| Supplier review | A.5.22 | Yes | No | Annual + material change | Omnisciente recommended | Vendors / Reviews |
| Continuity/ICT readiness exercise | A.5.29, A.5.30 | Yes | No | Annual exercise | Omnisciente recommended | Reviews / Evidence |
| Awareness/training review | 7.2, 7.3, A.6.3 | Yes | No | Annual + role/risk change | Omnisciente recommended | Reviews |
| Vulnerability programme review | A.8.8 | Yes | No | Monthly programme review | iVenture operating cadence | Reviews |
| Corrective-action effectiveness | 10.2 | Event-triggered | No | Before closure | ISO explicitly required | Findings / Actions |

Control-level recurrence statements above must be checked against the licensed edition before being marketed as exact normative wording. The matrix deliberately separates an activity requirement from the product's numerical schedule.

## H. Policy mapping proposal

The existing 17 mappings are retained as `recommended` partial-support mappings. They cover information security, risk, access, acceptable use, change, supplier, classification, retention, asset, vulnerability, configuration, awareness, incident, cryptography, continuity, backup and physical-security policy areas.

Mappings do not mean the policy is required under that title, fully implements the cited control, or establishes conformity. Tests require every mapped reference to exist in the current ISO catalog.

## I. Onboarding proposal

1. Enable ISO/IEC 27001 without changing other framework state.
2. Confirm context, interested parties and mappings to the existing legal/regulatory/contractual requirements register.
3. Approve ISMS scope and boundaries.
4. Initialize Clause 4–10 assessments and all 93 Annex A comparison entries.
5. Define the method and conduct the initial assessment in Risks.
6. Create treatment decisions and the organization-specific SoA, including additional necessary controls.
7. Reuse and map existing Policies; raise only justified gaps.
8. Create measurable objectives and owners.
9. Select client cadences; create Reviews and Calendar obligations.
10. Approve the internal audit programme and management-review schedule.

No major onboarding UI is included.

## J. Auditor navigation and use cases

| Auditor request | Primary answer | Trace |
| --- | --- | --- |
| Show the SoA | Statement of Applicability | SoA → Risk treatment → Risk / Policy / Evidence |
| Show internal audit programme/results | Internal Audit | Programme → Review → Evidence → Finding |
| Show management reviews | Reviews filtered to ISO Management Review | Review → minutes Evidence → Actions |
| Show objectives | Objectives | objective → results → Review history |
| Show how a control is implemented | Annex A Control Implementation | assessment → SoA → Policy / Evidence / Findings |
| Show the driving risk | Risks | Risk → treatment → necessary control → SoA |
| Show corrective actions | Findings / Action Items | Finding → Action → verification / closure |

## K. Content gaps and uncertainties

- The repository does not contain a licensed copy of ISO/IEC 27001:2022 or ISO/IEC 27002:2022. Exact official titles, normative subparagraph completeness and control qualifications cannot be fully validated from public metadata alone.
- The current 93 titles are clearly labelled Omnisciente summaries. They should not be exported as official ISO titles until compared with an authorized source.
- ISO/IEC 27007:2020 remains the current published audit guidance as of the research date. A replacement draft exists, but draft content is not treated as governing.
- Existing fixed four-package audit activation is useful as a template, not a universal audit programme design.
- Existing runtime SoA persistence does not yet support first-class external/custom necessary-control rows.
- Legal/regulatory/contractual register integration requires confirmation of the authoritative register available on the eventual implementation branch.

## L. Significant architecture decisions requiring approval

1. Backward-compatible persistence for custom/external SoA controls.
2. Terminology migration from Included/Excluded and Not Applicable to Necessary/Not Necessary without losing history or breaking APIs.
3. Dedicated objectives register versus a typed view over existing records.
4. Configurable audit cycles and coverage versus the current fixed four-package activation.
5. Licensed-source access for exact title and normative content QA.

## M. Tests added

`backend/tests/test_iso_staging.py` validates:

- 30 clause units and 93 Annex A controls;
- uniqueness, current numbering and 37/8/14/34 theme counts;
- a complete operating profile for every Clause 4–10 unit;
- SoA fields, statuses and non-Annex control support;
- authoritative Review/Finding/Action/Evidence relationships;
- management-review structure;
- cadence provenance and valid references; and
- policy and Review mappings against real catalog entries.

## N. Shared files changed

None. This staging pass adds only:

- `frontend/src/lib/iso27001Staging.json`
- `backend/tests/test_iso_staging.py`
- `docs/iso27001-staging-architecture.md`

Conflict risk is low: no shared visual component, Brawndo workflow, Prestige page, SOC 2 data, CIS behavior, shared schema or migration is modified.

## O. Branch status

- Branch: `codex/iso27001-staging`
- Base: fetched `origin/main` at `fc02c0b42bbe0ee3f6de471499d87381c0284808`
- Main: unchanged
- Brawndo branch/worktree: unchanged
- Prestige branch/worktree: unchanged
- SOC 2 branch/worktree: unchanged
- Production: unchanged; no deployment performed
- Merge: not performed
- Commit and final working-tree state: reported in the handoff after verification

## Source register

- [ISO/IEC 27001:2022 official record](https://www.iso.org/standard/27001) — Edition 3, published October 2022; one published amendment.
- [ISO/IEC 27001:2022/Amd 1:2024 official record](https://www.iso.org/standard/88435.html) — climate-action amendment published February 2024.
- [ISO/IEC 27002:2022 official record](https://www.iso.org/standard/75652.html) — current published control guidance edition.
- [ISO/IEC 27007:2020 official record](https://www.iso.org/standard/77802.html) — current published ISMS audit guidance; revision in development.
- [SC 27/WG 1 SoA auditing-practices note](https://committee.iso.org/files/live/sites/jtc1sc27/files/resources/ISO-IECJTC1-SC27-WG1_N3298_Auditing%20Practices%20Note%20-%20SoA.pdf) — non-normative committee-hosted guidance supporting necessary controls beyond Annex A.
