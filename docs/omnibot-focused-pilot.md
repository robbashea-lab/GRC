# Brawndo focused Omni pilot

The focused interaction is limited to the stable identities in
`shared/catalogs/omniWorkspacePilot.json`, CIS IG1, the program dashboard,
Control 1, and native safeguards 1.1 and 1.2. Names do not grant access.
`focusedControl1Enabled: false` restores the released Omni interaction without
deleting interviews or assessments. Existing server authorization is unchanged.

## Requirement trace

Reviewed against the [CIS Controls Assessment Specification for Controls v8.1,
Control 1](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) on
2026-10-08. The existing versioned question packs are retained, rather than
changing the meaning of saved answers. A displayed **Partly** persists the
existing `Partially` value. Contextual prompts retain the same question IDs.

| Safeguard / question IDs | Source basis | Completion treatment |
| --- | --- | --- |
| 1.1 `inventory` | Safeguard 1.1 and CAS inputs: enterprise inventory | Missing, partial or uncertain inventory cannot support Implemented. |
| 1.1 `coverage` | Safeguard 1.1 asset categories, connection models and regularly connected externally controlled assets | Each applicable category must be reported covered. Exclusions require recorded scope rationale. |
| 1.1 `attributes`, `scope_reason` | Safeguard 1.1 inventory fields; static network address is source-conditioned | Mandatory fields cannot be excluded. Static-address exclusions require rationale. |
| 1.1 `maintenance`, `maintenance_detail` | Accurate, current inventory; CAS inventory maintenance procedure | Reported additions/removals must be maintained; explanation supports the report. |
| 1.1 `frequency`, `last_review` | Safeguard 1.1 review interval and CAS date input/measurement | The existing six-month criterion is retained; a complete interview does not renew a review date. |
| 1.2 `process`, `frequency`, `actions` | Safeguard 1.2 weekly handling and permitted responses | Weekly or more frequent handling and an effective permitted response must be reported. All response alternatives are not required. |
| 1.2 `detection`, `unresolved` | CAS identification of unauthorized assets and handling within the interval | Unknown/incomplete identification or assets remaining beyond the interval prevent an unqualified recommendation. |
| 1.2 `inventory_dependency`, `reconciled` | CAS dependency on 1.1 and inventory comparison | Context for investigating the authorized baseline; reported consistent identification together with no usable inventory triggers clarification, not an automatic conclusion. This interview does not change 1.1 or require a separate policy. |
| Both `system`, `owner`, `sources`, `existing`, `evidence`; 1.2 `disposition`, `confirmation`, `exceptions` | Supporting implementation context / suggested assessment records | No mandatory product, evidence format, separate policy, or supplemental governance artifact is imposed. Evidence remains unverified. |
| Both `gaps`, `unknowns`, per-question `_detail` | Explicit client-reported limitations and supporting basis | Structured material gaps/uncertainty and explicit `gaps` / `unknowns` reports block an unqualified implementation proposal. Supporting explanations are retained for human review; free text is not automatically interpreted or verified. |

The effective 1.1 pack is `cis-v8.1-control1-3`; 1.2 retains
`cis-v8.1-control1-2`. Legacy saved versions remain readable. The mockup's
five checks are not a completion score. All applicable material criteria must
be reported addressed before proposing Implemented. Verification, Findings,
Action Items, Reviews, approvals and their schedules have separate workflows.

## Write boundaries

The dashboard opens the native record through the same `openRecord` function
as manual row selection and does not open an interview automatically. At the
safeguard, **Save answer & update implementation draft** saves an interview
checkpoint through its existing revision-checked API, then stages the real
native implementation field. Existing prose requires explicit reconciliation.
No status is promoted by this action. **Save assessment** remains the durable
native record boundary, with its existing expected-last-save conflict check.

Only an exact native draft produced by the incremental implementation action
can pass its own local-draft guard for final Review / Apply. Any additional
manual field change preserves the existing guard. A failed interview save
does not stage a native narrative. A concurrent native draft change after
the interview request prevents replacement and reports the partial outcome.

Saving the native record makes an old interview base stale. An explicit new
review refreshes its base through the existing restart API. Users may confirm
that same-version answers remain relevant and reuse them; completed conclusions
are discarded and the old interview is archived. If the second checkpoint
fails, the UI distinguishes the saved empty restart from unsaved retained
answers, which remain available for retry. Different question versions are
not silently migrated.

## Evidence boundaries

Local Demo persistence is browser storage and is not authenticated hosted
backend proof. Test fixtures are separate from current hosted client data.
Browser acceptance evidence and exact build/CI provenance belong in the pilot
handoff. No production deployment, broad activation, main merge, database
reset, credential change, or automatic lifecycle completion is part of this
pilot.

## Invitation refinement

The focused Brawndo CIS IG1 pilot uses OmniBot consistently in its invitation, guide and accessible controls. Program, Control 1 and safeguards 1.1/1.2 each start a fresh invitation visit. Dismissal affects that visit only; ordinary data refreshes do not invite again. Explicit session suppression and durable automatic-invitation suppression take precedence, with re-enabling available through Invitation settings. Legacy preferences are honored without changing nonpilot preferences.

Invitations distinguish unsaved answers, saved current interviews and interviews needing comparison with a changed native assessment. Only the invitation opens automatically; the guide requires an explicit action. Native saves, history, concurrency and activation gates remain unchanged.
