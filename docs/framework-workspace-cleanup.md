# Framework workspace cleanup — 2026-10-04

Baseline: `e3753e9481e10d9d91198a60397a97f1443f6078` (remote main, PR #26). Work is isolated on `codex/framework-workspace-cleanup`. Open PR #27 (CIS IG2) overlaps FrameworkWorkspace, OnboardingHandoff, CisOperationPanel and the removed CisSetupHandoff; do not replace its scope/navigation/guidance changes or merge its feature branch as part of this cleanup.

## Product behavior

- Remove CIS operating setup and its unconfirmed counter from the workspace and onboarding handoff. Safeguard-specific assessment criteria and requirement guides already carry the useful inventory, ownership, operation and Review guidance. Keep optional provider/person details in their existing assessment disclosure; remove its confirmation checkbox and gap checklist. Previously recorded confirmation remains readable, with existing invalidation behavior when the method/responsibility changes.
- Remove ISO establishment checklist and redundant ISMS shortcut strip. The checklist had no independent saved records; it derived information from clause assessments. Existing clause guides already address its six topics (context/scope, responsibilities, risk criteria/treatment, objectives, documents, operational/change processes), so no duplicate guide or checklist is added. Preserve the four overview cards, five approved tabs, existing modules, SoA and custom necessary controls.
- Remove separate SOC description/preparation presentation and the workspace control-management panel. Condense whole-system guidance beside the existing Client Profile SOC scope text, with Systems & Scope/Reviews/source references. Criterion guides remain criterion-specific. Previously saved control descriptions/history and mapped control record links remain accessible in existing linked work/history; no new register, tab or creation interface is added.
- Use American English in application-authored ISO labels, summaries, guide content and fictional seed copy. Preserve internal `programme_fields`, `programme_id`, `auditProgrammeMetrics` and related identifiers. Do not rewrite existing client data or authoritative source quotations.
- Record future product direction in the existing [product guidance](brawndo-cis-product-review.md#current-product-direction--2026-10-04).

No migrations, schema/API changes, records deleted, dependencies added, auth changes, assessment rule changes, cadence changes or production writes. Framework metadata applies the cleanup equally to reference, new and later-enabled clients.

## Verification

- Unmodified baseline: 4 suites / 144 tests passed.
- Final focused acceptance at this stage: 15 suites / 267 tests passed. Includes framework workspaces, CIS/SOC/ISO assessment save/draft/history/navigation, Client Profile scope, onboarding/later initialization, existing organizational-control records, framework guidance and audit navigation.
- One combined run encountered an ISO audit return-focus timing failure; the isolated recheck and the final combined acceptance run passed without weakening or changing that test.
- Local in-app browser, isolated sample-data Demo: Brawndo control → 1.1, guide and saved content; draft guard/Keep editing, save & next to 1.2 and reopen; Dunder five tabs/four cards, 4.3 assessment saved and reopened via 4.4; Prestige criterion hierarchy/CC9.2 narrative save with assessment date unchanged and saved control history retained; Client Profile scope text/guidance; new disposable CIS onboarding and later ISO/SOC enablement without removed UI. Light/dark at desktop and 1024px; 390px SOC workspace has no document overflow, retaining the existing narrow sidebar layout.
- Demo build passed with the existing bundle-size and Node deprecation advisories. Final build/source verification and any reconciliation with intervening main will be recorded before publication.

Checks use mocked component boundaries and the local synthetic Demo adapter, not a real authenticated backend browser. Production backend publication, real-client mutations and independent assurance are outside this cleanup. No claim of whole-application accessibility or security conformance.
