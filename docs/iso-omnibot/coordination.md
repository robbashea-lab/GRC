# ISO OmniBot coordination and field ownership

## Baseline and ownership

- Isolated branch `codex/iso27001-omnibot-rollout`, starting at `d5c9f1511b729eaf81ee9455676d4a8ec6a4f3e6` (PR66 over PR65). Main is not the compatible baseline.
- Agent 1 owns `codex/cis-soc-qa-corrections`, its two narrow CIS content corrections, and the shared authenticated staging/provider session. No session handoff has occurred.
- Shared acknowledgment: PR57 comments 6109457467, 6109476715 and 6109488223. Correction-first release order agreed; integrate and retest the exact correction SHA before the ISO release.
- ISO Agent 2 owns new ISO catalogs, adapters, controller, tests and documentation, plus acknowledged additive ISO-only shared routing/native-save/composition hooks. No CIS/SOC/Login content or global styling changes.

## Authoritative fields

The existing `framework_assessments` record identified by client, framework `iso-27001`, standard version and definition ID is the authoritative assessment. Both SoA and Annex A already open this same record. No dual-write synchronization or migration is needed.

| Responsibility | Authoritative data | Write boundary |
| --- | --- | --- |
| Applicability and inclusion/exclusion rationale | `soa_applicability`, `soa_justification` | Explicit native SoA decision save; not inferred from implementation answers |
| Current implementation and implementation status | `implementation`, `status` | Explicit reviewed summary through the native assessment writer |
| Interview progress/wording basis | Existing versioned interview store, per assessment/user | Question-group saves only; separate from native implementation |
| Evidence, owners, links, checklist selections | Existing native assessment/shared records | Existing authorized workflows; guide save must not alter these |
| Approval and historical SoA/audit conclusions | Existing frozen snapshots and Review/workpaper history | Retained; current implementation edits do not approve or rewrite history |

An excluded or undecided reference control is not an implementation deficiency. Only applicable Annex A controls enter the operational implementation queue. An inclusion decision is not proof of implementation. ISMS Clauses 4–10 cannot be excluded through SoA. Necessary organization-specific controls retain their existing relationships and controlled-SoA workflow.

## Evidence boundaries

Content catalog coverage is not full normative validation. Primary public edition/amendment/SoA sources and original repository guidance are recorded separately from publicly corroborated implementation interpretation. Missing licensed-source comparisons remain explicit. Local/Demo tests are not hosted authentication, durable Mongo persistence or restricted-account proof.

No production, Sites publication, account/security changes, database reset, or shared-session use is part of local implementation. Hosted deployment requires an acknowledged exclusive window and preservation of newer Agent 1 corrections. Existing CIS/SOC acceptance gaps remain open.
