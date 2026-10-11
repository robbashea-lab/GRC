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

## Targeted closeout — 2026-10-11

- Frozen application source remains `3193e564899473fddea0eabd7356fbb643d5fe1b`
  on Live staging deployment `dep-db5qgdtckfvc73b3qaa0`. PR68 is draft/unmerged
  over unchanged PR67 `1ba91c30`; main remains `911706ce`.
- Agent 1's fresh availability acknowledgment is
  [6110912609](https://github.com/robbashea-lab/GRC/pull/57#issuecomment-6110912609);
  exact H2 case acknowledgment is
  [6110981802](https://github.com/robbashea-lab/GRC/pull/57#issuecomment-6110981802);
  the completed window is
  [6111120394](https://github.com/robbashea-lab/GRC/pull/57#issuecomment-6111120394).
  Root exclusively operated the hosted browser, preserved 4.1/A.5.1 and closed
  the window without transferring the session or authorizing a deployment.
- Only six additional native definitions in the dedicated ISO synthetic fixture
  were written, with one extra read-only recommendation destination. No showcase,
  Dunder replacement, audit/personnel/account/permission action or reset.
- The existing Agent 3 Security Review chat received the exact source/files,
  routes, shared field ownership, lease semantics and unresolved access/fault
  gaps; its explicit acknowledgment and bounded report preserve review-only
  authority. Existing Medium findings and hosted security gaps are not waived.
- Existing independent reviewers owned only the three assurance annotations and
  the single execution register, respectively, then released those files. The
  ISO owner added the actual H2 evidence and focused test corrections. No shared
  runtime, CIS/SOC/Login content, dependency or global style was edited.
- Before the evidence push, Agent 1 re-read Render settings: staging source
  branch main, Auto-Deploy Off after a specific-commit deployment, PR Previews
  Off. An ordinary PR68 branch push does not publish this service under those
  settings. No settings were changed, and no additional manual deploy is needed.
- [targeted-closeout.md](targeted-closeout.md) and
  [coverage-matrix.md](coverage-matrix.md) retain per-ID evidence, attribution,
  source/technical limits and the minimum follow-up. Later test/documentation
  commits are not a newly tested/deployed application version.
