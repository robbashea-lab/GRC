# Policy PNG presentation handoff

2026-10-20; branch `codex/brawndo-new-workflows-20261020`. Root owns shared RecordDrawer integration. This work adds only Policy presentation files and tests; no approval controller, backend, adapter or register change.

## Authority and inspected references

The user delegated the missing Policy HTML decision: use the two supplied Policy PNG AFTER halves as the visual target while preserving native workflow. This supersedes the package's earlier requirement to wait for Policy HTML. Both full PNGs were inspected.

- Detail PNG SHA-256: `07aa5cd715d03cc446150c6e9682fbcf2fd7f5cb9fd37b4de5876f0f906caf9d`.
- Approval PNG SHA-256: `4d8dd62f4f014b23e7632ea5a002cfeb0e6be2f49876d590401abb71c8e9644b`.

Inspected native sources: BrawndoPolicyDetails, PolicyWorkflowPanel, PolicyApprovalPanel, PolicyApprovalSubject, policyApproval and policyProvenance Explore adapters, Policy schemas and RecordDrawer's native save/verify/approval/requirements/evidence wiring. A screenshot provides no hidden-state contract; native controllers remain authoritative for those states.

## Composition and operation mapping

| Target state | Presentation / native mapping |
| --- | --- |
| Header and five tabs | Category, actual title/status/version/owner/mapping/review date; overview, evidence, requirements, comments, activity keep native tab IDs. Screenshot specimen/theme toolbar excluded. |
| Overview strip | Actual approved document snapshot, actual recorded approval date/actor, last review, and native same-client related Review opener. Existing related Reviews may encode relationships through source fields, so the view trusts the parent's authoritative related.reviews list rather than requiring policy_id. |
| Purpose and details | Editable title/category/eligible nullable owner and governance_context.rationale. Context updates preserve its other fields. Native saved purpose precedence is retained; no new field or migration. |
| Document and approval | Real approved snapshot card; nativeApproval slot is the existing renderPolicyPanel controller and all native subject/authority/decision/retry guards. Blue panel appears only for actual pending native approval. No new API request or decision command is introduced by the view. |
| Document open | Evidence basis uses parent's real download callback. External reference becomes a link only when it is an actual HTTP(S) URL. A plain recorded register/reference is displayed as text; it is not converted into a guessed URL. |
| Version history | Actual submitted/approved/rejected subject snapshots and recorded external approval metadata; incomplete legacy snapshots are not reconstructed. Native approval history remains available in the controller slot. |
| Supporting files | Existing native evidence upload/link/download panel, with presentation styles scoped to this Policy surface. Approval basis remains distinct from supporting evidence. |
| Framework mapping | Existing requirements/alignment/related-Review composition supplied as a slot. No framework mandates or counts inferred from the document title. |
| Comments/activity | Existing native controllers supplied as slots; no synthetic events or actors. |
| Shell/theme | Existing large centered popup geometry; local existing Inter file with four static weight declarations; actual workspace and portal dark selectors; isolated owner popover. Native focus/dirty/Save/close ownership remains root. |

Deliberate semantic adaptations to screenshot-only controls:

- The Approved by/date picker is not recreated as an impersonating in-app decision. Existing native authenticated approval and separate external-verification controls remain intact.
- Historical approvals are labeled Last approved when the current record is a draft/pending revision or a legacy approved record lacks its own current subject. A prior snapshot is never promoted to current approval; dates/actors/method are matched to the displayed subject identity.
- The table uses Recorded note, since native approval-history comment/reason is a decision note, not a document-change summary. No change-summary storage or submission command was invented.
- Actual approval dates remain blank/Not recorded when absent. Captured/recorded timestamps are not substituted for external approval dates.
- New-policy creation and unseen alternate specimens have no supplied screen design and retain existing native UI; this component is intended for existing records under the exact trusted Policies route gate.

## Integration and evidence status

Owned files: `BrawndoPolicyWorkflow.jsx`, `.css`, `.test.jsx`. Root supplies the existing form and native slots/callbacks. The component contains no API import and does not issue writes. Root must mount only for trusted active Brawndo Explore/demo, matching loaded/selected/route client and same-client record, exact `/policies` route, existing full record. Native save checks, approvalDirty locks, in_review restrictions, request IDs, source snapshots and expected versions remain in existing controllers.

Six behavior tests were added: safe external document URLs, retained approved snapshots versus a pending revision, purpose edits and explicit clearing preserving context fields, native command-slot use with truthful document metadata, legacy current approval not promoting a prior snapshot, and metadata matching the actual current subject identity. Tests were not executed because root retains the CPU lease. JSX and CSS parsing passed. No build, browser, deployment or release ran.

Required next evidence: integrated permission/dirty/CAS/approval/source/evidence journeys, exact reference-versus-candidate browser images, actual loaded font and desktop/narrow/theme checks. PNG-only unknown states are adapted using native controls; full hidden-state visual parity cannot be claimed from these two images.
