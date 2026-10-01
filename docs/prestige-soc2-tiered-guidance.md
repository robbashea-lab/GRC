# Prestige Worldwide SOC 2 tiered guidance review

Implemented for the existing Prestige Demo SOC 2 criterion workspace only, reviewed on 2026-10-01. No merge, push or deployment is part of this change. The implementation reuses the existing drawer, authorization, save, concurrency and history mechanisms; no dependency or architecture change was needed.

## A Tier Model

- SOC 2 Criterion Requirements: criterion-derived expectations, with an explicitly classified Points of Focus interpretation for CC1.1.
- Operational Practices: Omnisciente suggestions for repeatable execution.
- Enhanced Assurance: Omnisciente suggestions for additional confidence in operation.

The three tiers are not levels of maturity. Counts describe selected checklist items only. No score, compliance percentage, certification conclusion or audit opinion is calculated from them.

## B Source Methodology

The existing authored summaries in `frontend/src/lib/operatorGuidance/soc.json` and the prior repository source audit in `docs/soc2-content-quality-review.md` were reviewed individually against the [AICPA-hosted Trust Services Criteria document](https://assets.ctfassets.net/rb9cdnjh59cm/5jT1narHNQNzt4JGlkd1gr/248661d08e42531329d147782a6f8854/Trust-services-criteria.pdf). The [AICPA publication page](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) remains the visible reference.

Criterion expectations were kept separate from implementation choices. Relevant Points of Focus informed interpretation but were not mechanically converted into mandatory controls. First-tier items do not prescribe arbitrary tools, frequencies or evidence artifacts. CC5.3 and CC8.1 address policies/procedures and documented changes because those subjects belong to the criteria, not because every criterion needs a policy.

The new catalog is an Omnisciente assessment aid, not an AICPA publication or an exhaustive auditor checklist. Controls and relevance still depend on the entity's scoped objectives, commitments and system requirements. The mapping has not received independent auditor or legal review.

## C Criterion Review

All 38 Prestige in-scope criteria were reviewed: 33 Security/Common Criteria, 3 Availability, and 2 Confidentiality.

| Tier | Items |
|---|---:|
| SOC 2 Criterion Requirements | 44 |
| Operational Practices | 54 |
| Enhanced Assurance | 31 |

Enhanced Assurance is intentionally empty for CC1.3, CC2.3, CC3.1, CC3.3, CC5.1, CC5.2, CC6.4, C1.1. No empty tier card renders. Every criterion currently has meaningful operational guidance; the renderer also supports an absent operational tier.

No authoritative-source gap was identified that prevents the summary-based model. Caveats are recorded per criterion below. In particular, CC1.1 uses Points of Focus to explain ethical commitment without requiring a formal ethics policy; CC1.2 oversight arrangements need entity-specific interpretation; A1.3 recovery testing is first-tier, while timing, record handling and extra validation are guidance.

## D AICPA Content Handling

No licensed verbatim criterion text or reproduction grant was found in the reviewed repository material. Public access to a source was not treated as a license to embed it. No official criterion wording or Points of Focus were copied into the new catalog.

The workspace displays reviewed summaries and the existing AICPA Reference link. The visible phrase “Omnisciente explanation — not official AICPA text” was removed only from the Prestige criterion workspace. Existing explicit official/licensed-text handling is retained should authorized content later be supplied. Source metadata remains in the catalog for auditability.

## E Data and Provenance Model

`frontend/src/lib/operatorGuidance/socAssessmentGuidance.json` owns the reusable SOC 2 definitions. It contains the catalog version, source metadata, tier definitions, and criterion-specific items. Each item has a stable versioned ID, text, tier, source classification and source reference. Criterion entries include a source page and review note.

Source classifications are `criterion`, `point_of_focus`, `operational_guidance`, and `enhanced_assurance`. Tier placement and provenance are separate fields.

Assessments store `soc_assessment_checks`, an independently selected list of catalog IDs. Both the Demo adapter and backend validate the IDs against the specific criterion, reject wrong-client/framework writes, deduplicate selections, and retain the existing concurrency token and authorization checks. The endpoint accepts at most 30 selections per criterion; the current largest criterion has 5 items.

Item IDs include `v1` so selections identify their content revision. Do not reuse a published ID for materially different meaning. Future content changes must retain old definitions/history or provide an explicit reviewed migration. Git retains this catalog revision. Activation is restricted to Prestige; the content itself contains no client ID.

## F Migration of Existing Checklist State

The prior Prestige UI exposed prose assessment prompts, not a saved SOC guidance checklist. No safe semantic mapping from old generic verification checks was assumed. Missing `soc_assessment_checks` means an empty selection; it is saved only through the normal assessment update.

There is no bulk migration, reseed or database cleanup. Existing verification checklists, management-control data, notes, narrative and earlier history entries remain untouched. Tests inject an unmapped historical checklist and verify it survives new selections. Each later save appends the new checked-state snapshot to existing assessment history.

## G UI Changes

Section 1 remains What SOC 2 Requires with ID, title, summary and reference. Section 2 is now SOC 2 Assessment Guidance with compact stacked fieldsets, independently selectable native checkboxes and per-tier completion counts. Empty tiers are hidden. The explanatory note appears once below the guidance.

The existing visual tokens, light/dark themes, status choices, Verification selector, Current Implementation narrative, Save, Save & Next, breadcrumbs, linked work and history remain. Stacked tiers are used at desktop and narrower widths for readability. No shared drawer architecture or CIS/ISO component was redesigned.

## H CIS IG1 Regression Confirmation

Brawndo retains CIS IG1 Assessment Criteria as a single list. Its component tests pass unchanged. Demo persistence tests verify that the SOC field is rejected for CIS and ISO, and for a different SOC client; unrelated history does not acquire the SOC field. Backend ISO and existing framework regression tests also pass.

This is scoped regression evidence, not a claim that every workflow in every framework has been tested.

## I Tests

Frontend command, from `frontend`:

```powershell
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand src/components/PrestigeSocAssessment.test.jsx src/components/BrawndoCisAssessment.test.jsx src/preview/assessmentVerification.test.js src/preview/prestigeWorkflowIntegrity.test.js src/preview/socFramework.test.js src/lib/reference.test.js
```

Result: 6 suites, 93 tests passed. Includes rendering all 38 criteria, exact populated-tier/item counts, provenance and catalog coverage, selection independence, saved selections, empty tiers, save failure, Save & Next, readonly UI, Demo gating, and related-work regression coverage.

Backend command, from the checkout:

```powershell
..\workflow-venv\Scripts\python.exe -m pytest backend/tests/test_assessment_verification.py backend/tests/test_soc_framework.py backend/tests/test_framework_governance.py backend/tests/test_iso_framework.py -q
```

Result: 53 tests and 24 subtests passed. Uses isolated Mongo mocks and real routes. Checks persistence, deduplication, historical preservation, invalid/cross-criterion IDs, stale writes, read-only and cross-tenant rejection, SOC scope, shared framework behavior and ISO regression. Existing FastAPI lifecycle deprecation warnings remain.

An initial new authorization test used a nonexistent fixture identity and received 401 instead of the expected 403. The test setup was corrected to use an existing authenticated user with a read-only role; the final suite passes.

Preview build command: `node scripts/preview.cjs build`. Build succeeds with the unchanged `PlatformAdmin.jsx:53` missing-useEffect-dependency warning and bundle-size advisory. These were not suppressed or changed. `git diff --check` passes. No new dependencies were added. A full repository test suite, production backend end-to-end test, independent security review and whole-application accessibility audit were not performed.

## J Browser QA

Only the isolated local Demo at `http://127.0.0.1:4174` was used. Hosted preview and production were not changed. The browser exercise used CC1.1, CC1.2, CC1.3, A1.3 and C1.1; all 38 definitions additionally received automated render checks.

| Width | Light | Dark |
|---|---|---|
| 1440 | Passed | Passed |
| 1280 | Passed | Passed |
| 1024 | Passed | Passed |
| 768 | Passed | Passed |

At all eight combinations, screenshots and DOM measurements confirmed readable stacked guidance, clear labels and helper text, and no document or tier horizontal overflow. Save, Save & Next, reopening persistence, hidden empty tiers, breadcrumbs, Escape/focus return and unchanged implementation/verification/narrative were exercised at each combination. Reload persistence was also checked. No browser console errors or warnings were captured during the tested workflow.

## K Significant Issues Requiring Approval

No broad redesign, unsafe migration or source gap blocks this feature. The source interpretation is not independent assurance; obtain specialist review before representing it as an exhaustive assessment methodology.

GitHub main advanced independently during this work. Any later integration must review the newer shared framework changes and rerun tests against that base. This task does not merge, rebase, push or deploy.

## L Branch Status

- Branch: `codex/prestige-soc2-tiered-guidance`.
- Base: `7421f29c579ea863de84db1f9a0198febae67e7e` (Restore Prestige SOC 2 linked-work traceability).
- Commit and final working-tree state: recorded in the handoff.
- Local main remains `1120f10766276b43ee51c08d66d2eb8c65997333`.
- No writes to GitHub main, the hosted ChatGPT preview or production were performed.

## Criterion Item Inventory

The following is the reviewed catalog inventory. R, O and E are item-ID suffixes, not maturity levels. References use the numbered pages of the linked AICPA PDF. Text is Omnisciente-authored; source classifications indicate its basis, not ownership or verbatim reproduction.

### CC1.1

Source reference: CC1.1, document page 14. Review caveat: Summary uses conduct-related Points of Focus to clarify ethical commitment; it does not prescribe a formal policy.

SOC 2 Criterion Requirements (1):

- `CC1.1-v1-r1` — Management establishes expectations for ethical behavior and follows through when conduct falls short. Provenance: `point_of_focus`; CC1.1; conduct expectations and follow-through Points of Focus, page 15.

Operational Practices (2):

- `CC1.1-v1-o1` — Communicate conduct expectations during onboarding and when responsibilities change. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.1.
- `CC1.1-v1-o2` — Provide a reporting route and assign responsibility for consistent follow-up. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.1.

Enhanced Assurance (1):

- `CC1.1-v1-e1` — Review recurring conduct concerns and whether corrective responses address their causes. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC1.1.

### CC1.2

Source reference: CC1.2, document page 15. Review caveat: Oversight arrangements depend on entity size and structure; see source footnote 15.

SOC 2 Criterion Requirements (1):

- `CC1.2-v1-r1` — The governing body provides independent oversight of the development and performance of internal control. Provenance: `criterion`; CC1.2.

Operational Practices (1):

- `CC1.2-v1-o1` — Give the governing body control issues, decisions and unresolved actions in a usable briefing. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.2.

Enhanced Assurance (1):

- `CC1.2-v1-e1` — Have oversight members evaluate whether their challenge changed management decisions. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC1.2.

### CC1.3

Source reference: CC1.3, document page 16. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC1.3-v1-r1` — Management establishes structures, reporting lines, authorities and responsibilities, with governing-body oversight, to support the organization's objectives. Provenance: `criterion`; CC1.3.

Operational Practices (2):

- `CC1.3-v1-o1` — Keep reporting lines and delegated decision rights accessible to control owners. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.3.
- `CC1.3-v1-o2` — Clarify the handoffs between internal teams and outsourced providers. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.3.

Enhanced Assurance (0):

None; tier hidden.

### CC1.4

Source reference: CC1.4, document page 17. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC1.4-v1-r1` — The organization attracts, develops and retains people with the competence needed to achieve its objectives. Provenance: `criterion`; CC1.4.

Operational Practices (2):

- `CC1.4-v1-o1` — Connect hiring and development activities to the competencies of each control role. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.4.
- `CC1.4-v1-o2` — Arrange cover for control responsibilities when key staff are absent. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.4.

Enhanced Assurance (1):

- `CC1.4-v1-e1` — Evaluate whether training resolves observed execution errors. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC1.4.

### CC1.5

Source reference: CC1.5, document page 18. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC1.5-v1-r1` — The organization holds individuals accountable for their internal-control responsibilities. Provenance: `criterion`; CC1.5.

Operational Practices (1):

- `CC1.5-v1-o1` — Include control responsibilities in performance conversations and follow up on missed obligations. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC1.5.

Enhanced Assurance (1):

- `CC1.5-v1-e1` — Review whether delivery incentives encourage staff to bypass controls. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC1.5.

### CC2.1

Source reference: CC2.1, document page 19. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC2.1-v1-r1` — The organization obtains or generates and uses relevant, quality information for internal control. Provenance: `criterion`; CC2.1.

Operational Practices (2):

- `CC2.1-v1-o1` — Identify each control owner's information needs and the responsible data source. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC2.1.
- `CC2.1-v1-o2` — Check important reports for missing, outdated or inconsistent information before use. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC2.1.

Enhanced Assurance (1):

- `CC2.1-v1-e1` — Reconcile a sample of management reports to their underlying records. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC2.1.

### CC2.2

Source reference: CC2.2, document page 21. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC2.2-v1-r1` — The organization communicates objectives and internal-control responsibilities to the people who need them. Provenance: `criterion`; CC2.2.

Operational Practices (1):

- `CC2.2-v1-o1` — Use role-specific communications for control changes and escalation routes. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC2.2.

Enhanced Assurance (1):

- `CC2.2-v1-e1` — Ask a sample of recipients to demonstrate how they would report a control concern. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC2.2.

### CC2.3

Source reference: CC2.3, document page 22. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC2.3-v1-r1` — The organization communicates with external parties about matters affecting internal control. Provenance: `criterion`; CC2.3.

Operational Practices (2):

- `CC2.3-v1-o1` — Assign owners for customer and supplier communications about responsibilities and changes. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC2.3.
- `CC2.3-v1-o2` — Route incoming concerns to a responsible team and track the response. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC2.3.

Enhanced Assurance (0):

None; tier hidden.

### CC3.1

Source reference: CC3.1, document page 24. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC3.1-v1-r1` — The organization states its objectives clearly enough to identify and assess risks to their achievement. Provenance: `criterion`; CC3.1.

Operational Practices (1):

- `CC3.1-v1-o1` — Connect scoped service commitments to clear objectives used in risk assessment. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC3.1.

Enhanced Assurance (0):

None; tier hidden.

### CC3.2

Source reference: CC3.2, document page 27. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC3.2-v1-r1` — The organization identifies and analyzes risks to its objectives and decides how those risks will be managed. Provenance: `criterion`; CC3.2.

Operational Practices (2):

- `CC3.2-v1-o1` — Record risk analysis, response decisions and accountable owners in the existing risk workflow. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC3.2.
- `CC3.2-v1-o2` — Revisit risk decisions when threat or business assumptions change. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC3.2.

Enhanced Assurance (1):

- `CC3.2-v1-e1` — Challenge major risk assumptions using observed incidents and near misses. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC3.2.

### CC3.3

Source reference: CC3.3, document page 28. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC3.3-v1-r1` — The organization considers the potential for fraud when assessing risks to its objectives. Provenance: `criterion`; CC3.3.

Operational Practices (1):

- `CC3.3-v1-o1` — Include realistic fraud scenarios and relevant participants in risk discussions. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC3.3.

Enhanced Assurance (0):

None; tier hidden.

### CC3.4

Source reference: CC3.4, document page 29. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC3.4-v1-r1` — The organization identifies and assesses changes that could significantly affect internal control. Provenance: `criterion`; CC3.4.

Operational Practices (1):

- `CC3.4-v1-o1` — Use business, technology and supplier change workflows to trigger risk reassessment. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC3.4.

Enhanced Assurance (1):

- `CC3.4-v1-e1` — Compare completed changes with risk reviews to identify missed triggers. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC3.4.

### CC4.1

Source reference: CC4.1, document page 30. Review caveat: Ongoing or separate evaluation is already part of the criterion, not an optional assurance upgrade.

SOC 2 Criterion Requirements (1):

- `CC4.1-v1-r1` — The organization performs appropriate ongoing or separate evaluations to determine whether internal control is present and functioning. Provenance: `criterion`; CC4.1.

Operational Practices (1):

- `CC4.1-v1-o1` — Assign evaluation scope, responsibilities and timing based on control risk. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC4.1.

Enhanced Assurance (1):

- `CC4.1-v1-e1` — Compare conclusions from different evaluators where results conflict. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC4.1.

### CC4.2

Source reference: CC4.2, document page 31. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC4.2-v1-r1` — Control deficiencies are evaluated and communicated promptly to those responsible for correction, including appropriate leadership. Provenance: `criterion`; CC4.2.

Operational Practices (1):

- `CC4.2-v1-o1` — Assign remediation owners and track deficiencies through the existing Findings and Actions workflows. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC4.2.

Enhanced Assurance (1):

- `CC4.2-v1-e1` — Have someone other than the action owner challenge closure support for significant deficiencies. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC4.2.

### CC5.1

Source reference: CC5.1, document page 31. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC5.1-v1-r1` — The organization selects and develops control activities that reduce risks to acceptable levels. Provenance: `criterion`; CC5.1.

Operational Practices (1):

- `CC5.1-v1-o1` — Map selected controls to the risks they address and explain any compensating arrangements. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC5.1.

Enhanced Assurance (0):

None; tier hidden.

### CC5.2

Source reference: CC5.2, document page 32. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC5.2-v1-r1` — The organization establishes general control activities over technology that support its objectives. Provenance: `criterion`; CC5.2.

Operational Practices (1):

- `CC5.2-v1-o1` — Identify technology dependencies and assign ownership of supporting access, change and maintenance controls. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC5.2.

Enhanced Assurance (0):

None; tier hidden.

### CC5.3

Source reference: CC5.3, document page 33. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (2):

- `CC5.3-v1-r1` — Policies establish expectations for control activities. Provenance: `criterion`; CC5.3.
- `CC5.3-v1-r2` — Procedures put those control expectations into action. Provenance: `criterion`; CC5.3.

Operational Practices (1):

- `CC5.3-v1-o1` — Make procedures accessible to the people performing them and establish how exceptions are handled. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC5.3.

Enhanced Assurance (1):

- `CC5.3-v1-e1` — Compare actual execution with the procedure after significant operational changes. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC5.3.

### CC6.1

Source reference: CC6.1, document page 34. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC6.1-v1-r1` — The organization implements logical-access security over protected information assets to protect them from security events. Provenance: `criterion`; CC6.1.

Operational Practices (2):

- `CC6.1-v1-o1` — Identify protected assets and access paths, then apply authentication and access rules appropriate to their risks. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.1.
- `CC6.1-v1-o2` — Include access-control decisions in architecture reviews. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.1.

Enhanced Assurance (1):

- `CC6.1-v1-e1` — Validate that a sample of disallowed access attempts is blocked across different access paths. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.1.

### CC6.2

Source reference: CC6.2, document page 36. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (2):

- `CC6.2-v1-r1` — For access administered by the organization, internal and external users are registered and authorized before credentials or access are issued. Provenance: `criterion`; CC6.2.
- `CC6.2-v1-r2` — For access administered by the organization, credentials are removed when user access is no longer authorized. Provenance: `criterion`; CC6.2.

Operational Practices (2):

- `CC6.2-v1-o1` — Connect credential approval and removal to joiner, mover and leaver workflows. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.2.
- `CC6.2-v1-o2` — Review credentials for accounts without a current owner or business purpose. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.2.

Enhanced Assurance (1):

- `CC6.2-v1-e1` — Reconcile account records with personnel and supplier records to identify missed removals. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.2.

### CC6.3

Source reference: CC6.3, document page 36. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC6.3-v1-r1` — The organization grants, changes and removes access according to roles, responsibilities and system design, considering least privilege and segregation of duties. Provenance: `criterion`; CC6.3.

Operational Practices (2):

- `CC6.3-v1-o1` — Document role entitlements and approval responsibilities for access changes. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.3.
- `CC6.3-v1-o2` — Review privileges and incompatible access when responsibilities change. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.3.

Enhanced Assurance (1):

- `CC6.3-v1-e1` — Test effective permissions rather than relying only on the requested access list. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.3.

### CC6.4

Source reference: CC6.4, document page 37. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC6.4-v1-r1` — The organization restricts physical access to relevant facilities and protected information assets to authorized personnel. Provenance: `criterion`; CC6.4.

Operational Practices (1):

- `CC6.4-v1-o1` — Assign responsibility for visitor access, badge changes and recovery of physical devices. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.4.

Enhanced Assurance (0):

None; tier hidden.

### CC6.5

Source reference: CC6.5, document page 37. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC6.5-v1-r1` — Protection of physical assets continues until recoverability of their data and software has been reduced and is no longer needed for organizational objectives. Provenance: `criterion`; CC6.5.

Operational Practices (1):

- `CC6.5-v1-o1` — Keep asset protection in place until the disposal or transfer owner confirms the selected sanitization outcome. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.5.

Enhanced Assurance (1):

- `CC6.5-v1-e1` — Validate sanitization results for a sample of retired assets, including supplier-handled disposal. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.5.

### CC6.6

Source reference: CC6.6, document page 38. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC6.6-v1-r1` — The organization protects against threats from outside its system boundaries through logical-access security measures. Provenance: `criterion`; CC6.6.

Operational Practices (2):

- `CC6.6-v1-o1` — Maintain an approved inventory of external access points and their permitted uses. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.6.
- `CC6.6-v1-o2` — Review boundary-rule exceptions with a named owner. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.6.

Enhanced Assurance (1):

- `CC6.6-v1-e1` — Validate exposed access paths against the approved boundary design. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.6.

### CC6.7

Source reference: CC6.7, document page 38. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (2):

- `CC6.7-v1-r1` — Information transmission, movement and removal are restricted to authorized users and processes. Provenance: `criterion`; CC6.7.
- `CC6.7-v1-r2` — Information is protected during transmission, movement and removal. Provenance: `criterion`; CC6.7.

Operational Practices (1):

- `CC6.7-v1-o1` — Define approved transfer routes and handling rules for sensitive information and removable media. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.7.

Enhanced Assurance (1):

- `CC6.7-v1-e1` — Test whether an unauthorized transfer attempt is prevented or detected as intended. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.7.

### CC6.8

Source reference: CC6.8, document page 39. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC6.8-v1-r1` — The organization prevents or detects and acts on unauthorized or malicious software. Provenance: `criterion`; CC6.8.

Operational Practices (1):

- `CC6.8-v1-o1` — Restrict software installation and route suspected malicious software to a response owner. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC6.8.

Enhanced Assurance (1):

- `CC6.8-v1-e1` — Exercise malware response safely in an isolated test environment. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC6.8.

### CC7.1

Source reference: CC7.1, document page 40. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (2):

- `CC7.1-v1-r1` — Monitoring detects configuration changes that introduce vulnerabilities. Provenance: `criterion`; CC7.1.
- `CC7.1-v1-r2` — Monitoring identifies exposure to newly discovered vulnerabilities. Provenance: `criterion`; CC7.1.

Operational Practices (1):

- `CC7.1-v1-o1` — Connect configuration and vulnerability monitoring results to prioritized remediation work. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.1.

Enhanced Assurance (1):

- `CC7.1-v1-e1` — Measure repeat vulnerabilities and verify whether prior fixes remain effective. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC7.1.

### CC7.2

Source reference: CC7.2, document page 40. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (2):

- `CC7.2-v1-r1` — System components and operations are monitored for anomalies associated with malicious activity, natural events or errors affecting objectives. Provenance: `criterion`; CC7.2.
- `CC7.2-v1-r2` — Anomalies are analyzed to determine whether they are security events. Provenance: `criterion`; CC7.2.

Operational Practices (2):

- `CC7.2-v1-o1` — Assign anomaly triage responsibilities and escalation routes. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.2.
- `CC7.2-v1-o2` — Monitor whether collection and alerting tools are themselves working. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.2.

Enhanced Assurance (1):

- `CC7.2-v1-e1` — Use controlled scenarios to check that important anomalies reach the right responder. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC7.2.

### CC7.3

Source reference: CC7.3, document page 41. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (2):

- `CC7.3-v1-r1` — Security events are evaluated to determine whether they are incidents. Provenance: `criterion`; CC7.3.
- `CC7.3-v1-r2` — Action is taken to prevent or address failures of the organization's objectives. Provenance: `criterion`; CC7.3.

Operational Practices (1):

- `CC7.3-v1-o1` — Record event classification, impact analysis and the reason for escalation or closure. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.3.

Enhanced Assurance (1):

- `CC7.3-v1-e1` — Revisit a sample of closed events to challenge missed-incident assumptions. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC7.3.

### CC7.4

Source reference: CC7.4, document page 42. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC7.4-v1-r1` — The organization executes a defined incident-response program to understand, contain, remediate and communicate identified incidents. Provenance: `criterion`; CC7.4.

Operational Practices (2):

- `CC7.4-v1-o1` — Keep response roles, contacts and communications routes usable during an incident. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.4.
- `CC7.4-v1-o2` — Record the sequence of containment and remediation decisions. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.4.

Enhanced Assurance (1):

- `CC7.4-v1-e1` — Review incident patterns and exercise outcomes to improve response decisions. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC7.4.

### CC7.5

Source reference: CC7.5, document page 44. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC7.5-v1-r1` — The organization identifies, develops and implements activities to recover from identified security incidents. Provenance: `criterion`; CC7.5.

Operational Practices (1):

- `CC7.5-v1-o1` — Assign recovery activities and validate restored functionality before resuming normal operation. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC7.5.

Enhanced Assurance (1):

- `CC7.5-v1-e1` — Review whether incident recovery changes prevent recurrence. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC7.5.

### CC8.1

Source reference: CC8.1, document page 45. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC8.1-v1-r1` — System changes are authorized, designed, developed or acquired, configured, documented, tested, approved and implemented to support organizational objectives. Provenance: `criterion`; CC8.1.

Operational Practices (2):

- `CC8.1-v1-o1` — Use change records to connect approvals, tests and release decisions. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC8.1.
- `CC8.1-v1-o2` — Define how urgent changes receive appropriate review and follow-up. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC8.1.

Enhanced Assurance (1):

- `CC8.1-v1-e1` — Compare deployed changes with approved records to identify untracked releases. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC8.1.

### CC9.1

Source reference: CC9.1, document page 47. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC9.1-v1-r1` — The organization selects and develops activities to mitigate risks arising from potential business disruptions. Provenance: `criterion`; CC9.1.

Operational Practices (1):

- `CC9.1-v1-o1` — Translate credible disruption scenarios into workable continuity arrangements and responsibilities. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC9.1.

Enhanced Assurance (1):

- `CC9.1-v1-e1` — Exercise dependency failures that could defeat the planned alternative processing approach. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC9.1.

### CC9.2

Source reference: CC9.2, document page 48. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `CC9.2-v1-r1` — The organization assesses and manages risks associated with vendors and business partners. Provenance: `criterion`; CC9.2.

Operational Practices (2):

- `CC9.2-v1-o1` — Assign vendor-risk owners and connect due diligence, requirements and issue follow-up. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC9.2.
- `CC9.2-v1-o2` — Reassess significant service changes and plan access and data handling at termination. Provenance: `operational_guidance`; Omnisciente implementation guidance for CC9.2.

Enhanced Assurance (1):

- `CC9.2-v1-e1` — Challenge concentration risk across critical providers and their dependencies. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for CC9.2.

### A1.1

Source reference: A1.1, document page 50. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `A1.1-v1-r1` — The organization maintains, monitors and evaluates processing capacity and system-component use so it can respond to capacity demand. Provenance: `criterion`; A1.1.

Operational Practices (1):

- `A1.1-v1-o1` — Use demand forecasts and operating thresholds to trigger capacity changes. Provenance: `operational_guidance`; Omnisciente implementation guidance for A1.1.

Enhanced Assurance (1):

- `A1.1-v1-e1` — Compare forecasts with observed peaks and investigate persistent forecasting errors. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for A1.1.

### A1.2

Source reference: A1.2, document page 50. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `A1.2-v1-r1` — Environmental protections, software, backups and recovery infrastructure are authorized, designed, developed or acquired, approved, operated, maintained and monitored for availability objectives. Provenance: `criterion`; A1.2.

Operational Practices (2):

- `A1.2-v1-o1` — Monitor backup jobs and environmental alerts, with owners for failure follow-up. Provenance: `operational_guidance`; Omnisciente implementation guidance for A1.2.
- `A1.2-v1-o2` — Check that backup and recovery arrangements cover the scoped systems and data. Provenance: `operational_guidance`; Omnisciente implementation guidance for A1.2.

Enhanced Assurance (1):

- `A1.2-v1-e1` — Evaluate whether a shared failure could defeat both primary and recovery infrastructure. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for A1.2.

### A1.3

Source reference: A1.3, document page 52. Review caveat: Recovery testing is criterion-derived; schedule, records and extra validation are implementation guidance.

SOC 2 Criterion Requirements (1):

- `A1.3-v1-r1` — The organization tests recovery-plan procedures that support system recovery. Provenance: `criterion`; A1.3.

Operational Practices (2):

- `A1.3-v1-o1` — Assign a risk-based test schedule and retain recovery results. Provenance: `operational_guidance`; Omnisciente implementation guidance for A1.3.
- `A1.3-v1-o2` — Track test failures and resulting recovery-plan changes. Provenance: `operational_guidance`; Omnisciente implementation guidance for A1.3.

Enhanced Assurance (2):

- `A1.3-v1-e1` — Compare restoration performance across exercises to identify persistent weaknesses. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for A1.3.
- `A1.3-v1-e2` — Use an independent observer for a significant recovery exercise. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for A1.3.

### C1.1

Source reference: C1.1, document page 52. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `C1.1-v1-r1` — The organization identifies and maintains confidential information according to its confidentiality objectives. Provenance: `criterion`; C1.1.

Operational Practices (1):

- `C1.1-v1-o1` — Define confidential information and connect handling and retention decisions to applicable commitments. Provenance: `operational_guidance`; Omnisciente implementation guidance for C1.1.

Enhanced Assurance (0):

None; tier hidden.

### C1.2

Source reference: C1.2, document page 52. Review caveat: No source gap identified for this criterion summary; control design remains entity-specific.

SOC 2 Criterion Requirements (1):

- `C1.2-v1-r1` — The organization disposes of confidential information according to its confidentiality objectives. Provenance: `criterion`; C1.2.

Operational Practices (1):

- `C1.2-v1-o1` — Assign disposal responsibility when retention ends, including information held by service providers. Provenance: `operational_guidance`; Omnisciente implementation guidance for C1.2.

Enhanced Assurance (1):

- `C1.2-v1-e1` — Sample completed disposal records and validate the intended result across relevant storage locations. Provenance: `enhanced_assurance`; Omnisciente additional assurance guidance for C1.2.
