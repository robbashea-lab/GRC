# Brawndo reference assessment pattern and future architecture

Status: frozen reference prototype, 2026-09-23. **No cross-framework activation or migration authorized by this document.** Verification: [finalization report](brawndo-cis-finalization.md).

## Frozen operating pattern

Primary reading order:

1. Requirement identity, source treatment, operational guidance and safeguard-specific verification examples.
2. Explicit native assessment choices and explanatory status text.
3. Implementation narrative, then actual recorded technology/process context.
4. Compact linked evidence with meaningful name, filename, type/date and searchable linking.
5. Gap/Finding, using the normal Finding → Action Item workflow.

Supporting panel: saved conclusion/date, eligible owner, process owner, linked Reviews and cadence, Actions, Risks, Policies, discussion and history. On smaller screens it follows primary assessment work. Do not replace these with permanent metadata fields above the requirement.

Navigation contract:

- Previous/Next follow catalog order, not lexical IDs or current filtered results; position states the framework sequence.
- Save updates the authoritative assessment with its concurrency token and retains current location.
- Save & next waits for successful save. Failure retains draft/error and never advances.
- Unfinished Finding, Review setup or comment drafts block Save & next; ordinary navigation/close requires explicit discard or continued editing.
- Close and Escape return context/focus safely. Nested record drawers restore their actual opener; background context refresh must not unmount the same-record opener.
- Browser reload warns for unsaved work. Last-opened state is separate from deterministic next-incomplete work; do not describe a completed last-opened safeguard as unfinished.

Evidence contract: link/upload saves immediately through Evidence's existing relationships; assessment text saves separately. Explain this beside the picker. Existing evidence is linked, not copied. Names must remain identifiable after linking. Keep remaining options available after refresh. No upload is proof of implementation. Downloads remain authorized by the existing service.

Gap contract: a Finding records a deficiency; its existing Action Item tracks remediation. Use the existing idempotent request/workflow, not a second task POST. Show compact titles/status and open authoritative drawers. Never automatically change assessment status because evidence or remediation exists.

Practical rules from use:

- Core guidance cannot be hidden behind nested accordions; lower-frequency history/relationships can be disclosed on demand.
- Keep Save and sequential navigation reachable without repeatedly scrolling through metadata.
- Retain the current same-client/same-assessment view during a successful refresh, but clear it and disable writing after refresh failure. Do not preserve context across tenant or record changes.
- Parallel option/context responses must merge coherently; a later response must not erase loaded evidence options.
- Preserve legacy notes separately when populated; do not silently merge or overwrite historical narrative fields.
- Search/filter results expand and report their count; clear returns to the full program. Empty evidence/Findings states explain the next action briefly.
- Source text, Omnisciente guidance and suggested validation have different authority. Keep that distinction visible. Do not rename coverage as compliance.
- Test native date input through committed input events and navigation, not merely a visible DOM value.

## Existing architecture to extend, not replace

| Existing capability | Responsibility retained |
| --- | --- |
| `pages/FrameworkWorkspace.jsx` / `lib/frameworkWorkspace.js` | Native grouped hierarchy, filter/progress/attention projections, URL assessment selection, resume/order |
| `components/FrameworkDrawer.jsx` | Assessment loading, native field serialization, optimistic concurrency, save/draft protection, linked drawers, comments and activity |
| `components/BrawndoCisAssessment.jsx` / `.css` | Prototype presentation, linear primary flow, compact metadata, responsive shell; currently CIS/Brawndo-specific |
| `frameworkOperator`, catalogs, `sourcePresentation`, `recurrencePresentation` | Native vocabulary, guidance, progress, source display/license mode and per-requirement cadence distinctions |
| `FrameworkReviewSetup` | Create/reuse/link normal Reviews, recognize onboarding Reviews and prevent duplicates |
| `RecordDrawer`, `ReviewDrawer`, relationship endpoints | Authoritative operational records; Evidence, Findings and remediation remain owned by their modules |

Prototype-specific assumptions include exact Demo gate, CIS title/control text, safeguard language, radio status choices, native field names and five-step arrangement. Do not generalize the entire controller or copy the component once per framework.

## Proposed composition boundary

Implement later, behind explicit opt-in gates:

- **AssessmentWorkspaceShell**: width/responsive grid, accessible title/description, scroll regions, header/position/navigation and action footer. Accept primary and secondary content; know nothing about framework status meaning.
- **RequirementContext**: source-mode-aware reference and separately labeled guidance/validation. Reuse current source helpers rather than add another citation registry.
- **AssessmentEditor slot**: framework-owned controls, field validation, native draft and serializer. Shell does not convert statuses or calculate readiness.
- **Evidence / Gap summaries**: small shared presentation with existing link/download/open/create callbacks, not independent repositories or new relationship schemas.
- **Draft/navigation boundary**: explicit dirty, busy, error, other-draft, save-success and leave/discard contracts. Extract only after another real consumer demonstrates the same lifecycle.
- **Secondary panel slots**: native metadata, recurrence, relationships/history. CMMC objectives or ISO SoA are not arbitrarily demoted into generic metadata.

Suggested contract (conceptual, not a new schema): identity `{clientId, assessmentId, frameworkKey, definitionId}`, native ordered neighbor IDs; title/source/guidance model; framework editor renderer; native draft/validation/serialize functions; `save(): Promise<success>`; `dirty/busy/loadError/otherDraft`; open/link callbacks; slots for framework-specific assessment and supporting content. Keep tenant scoping, permissions and concurrency in the trusted existing service/controller. Never accept a presentation adapter as authorization.

Use a registry at the workspace composition boundary if needed. Do not scatter `if framework...` chains across shell, footer and evidence UI. Do not build a generic form engine or universal weighted compliance score.

## Framework-native responsibilities

| Framework | Keep native |
| --- | --- |
| CIS IG1 | Control → safeguard order; implementation statuses; N/A rationale; safeguard-specific cadence/source |
| NIST CSF | Function → Category → Subcategory; current/target profiles and gap fields (`CsfProfile`); no forced CIS maturity interpretation |
| HIPAA | Standard/specification structure; Required/Addressable; decision and rationale fields; Addressable is not optional |
| ISO 27001 | ISMS clauses separate from Annex A; inclusion/exclusion and SoA justification; preserve license/reference-only rules |
| SOC 2 | Trust Services category/criterion, management controls and operating-period context (`SocManagementControls`); no prescribed cadence invented |
| CMMC | **Not implemented in this checkout.** A future native requirement/objective model, MET/NOT MET, score provenance, scope/SSP, POA&M eligibility and lifecycle must precede adaptation. Reuse shell only if it fits, never infer those mechanics from CIS status fields. |

## Migration and rollout requirements

No data migration is required to extract presentation. Keep native fields, identifiers, relationships, notes, history, concurrency tokens and APIs unchanged. If a later domain change requires migration, design and test it separately; UI reuse is not authorization to rewrite stored assessments.

Risks: accidentally broadening the Demo gate; flattening native semantics; dropping fields from serialization; losing drafts during navigation; stale responses across clients; duplicate Reviews/Actions; changed applicability denominators; licensing mislabels; nested focus regressions; using cached presentation state as authority.

Recommended sequence:

1. Preserve this test-backed Brawndo reference. Extract only shell/presentation with no activation change; compare DOM behavior and keyboard paths.
2. Explicitly authorized second CIS client opt-in; prove no client-specific assumptions and no data migration.
3. NIST adapter with Function/Category/profile tests.
4. HIPAA adapter with Required/Addressable decision/rationale tests.
5. ISO adapter with clause/Annex A and SoA tests.
6. SOC 2 adapter with management-control/period tests.
7. Separately design/validate CMMC's native domain before any UI adapter.

Per rollout: native status allow/deny and field round-trip tests, legacy populated records, unchanged relationship IDs, tenant/role isolation, late-response isolation, rejected saves and concurrent edits, draft guards, Review reuse, Finding→Action exactly-once behavior, licensing/source/cadence semantics, ordering/resume, 1440/1024/768 keyboard/browser workflows. Use production-like staging with synthetic data before claims about real server authorization or file access. A passing Demo suite is not that evidence.

Do not abstract framework scoring, applicability, objective evaluation, retention, approval rules or data migrations prematurely. Composition of presentation is the next candidate; replacement of authoritative domain models is not.
