# Framework operational completeness — work in progress

Starting main: `66242b89359de886d1b654ec7b146bd4703a44c8`.
Branch: `codex/framework-operational-completeness`.

This is an acceptance ledger, not a completeness approval. No production or
ChatGPT Sites publication is authorized by this program. Merge requires all
material gates to pass; unknown and not-executed gates do not pass.

## Architecture reviewed before implementation

React provides the framework workspaces and shared record drawers. `api.js`
selects the intentional Demo adapter or real API. FastAPI and MongoDB own real
records; Demo's session store mirrors those workflows for synthetic operation.
Reviews own immutable execution occurrences. Findings own deficiencies; their
authoritative Actions perform remediation; validation remains independent.
Framework assessments retain their own history and do not inherit conclusions
from linked work. Evidence uses shared records and relationships. Users provide
access and assignment eligibility; Contacts do not grant platform authority.

Existing source and prior-run reports are evidence to investigate, not current
verification. In particular, source research dates do not establish normative
completeness, a green characterization test does not close its documented defect,
and mock tests do not establish persistent-backend readiness.

## Initial completeness matrix

| Obligation | Existing location / authoritative record | Workflow, recurrence, evidence, history and discoverability gate | Initial gap |
| --- | --- | --- | --- |
| CIS safeguard implementation | `cisIG1.json`, framework assessments, Brawndo workspace | Assessment → shared Evidence → Finding → Action → validation → independent reassessment; retain assessment history | Current-run verification pending |
| CIS recurring governance | Framework cadence plans, shared Reviews and occurrences | Distinguish operational cadence from human governance; preserve occurrence Evidence and provenance | Current-run verification pending |
| ISO context / scope / risk treatment | Client Profile, Systems & Scope, Risks, ISO clauses | Trace context to selected controls and supporting work | Normative source gate unresolved |
| ISO SoA | Annex A assessment applicability, justification and assessment history | Scope decisions, exclusion rationale and prior states remain inspectable | Normative source gate unresolved; version-level discoverability to inspect |
| ISO internal audit / management review | Specialized ISO views over shared Reviews | Occurrences, results, decisions, Findings and follow-up | Normative source gate unresolved |
| ISO corrective action | Shared Finding → Action → validation | Cause, correction, effectiveness and closure history | Normative source gate unresolved |
| SOC 2 scope / categories | Client framework configuration and criterion assessments | Keep categories, examination/readiness context and organizational controls distinct | Authorized criteria comparison unresolved |
| SOC 2 control operation | Management controls, shared Reviews, Evidence relationships | Control design, ownership, operating cadence, period Evidence and changes | Authorized criteria comparison unresolved; cross-criterion control identity to inspect |
| Shared evidence / history | Evidence Library, sets, occurrences and assessment history | One item / many relationships; stale or unlinked evidence is not current support | Prior report identifies truncation above 1,000 evidence records; reproduce |
| New-client five-year operation | Actual onboarding UI and lifecycle transitions | Three separate synthetic clients; inspect year one at year five | Not executed |
| Access / scale / browser quality | Server authorization, shared registers and UI | Role/client denials, complete lists, route/filter state, responsive and keyboard checks | Not executed |

## Sequence and stop rules

1. Refresh authoritative sources, establish repeatable local checks and one draft PR.
2. Validate CIS reference operation and correct reproducible defects.
3. Validate ISO, then SOC 2, preserving framework-native semantics.
4. Exercise fresh-client onboarding and five-year transitions; persona and shared regression.
5. One final usability review, cleanup, full checks and gate decision.

Do not progress a failed operational gate as though it passed. The user's
2026-09-26 clarification supersedes the initial full-text source gate: legitimate
public evidence can establish an operating baseline. Exact licensed-text comparison
and operational validation are separate results. Missing full text alone does not
block engineering or merge. A material interpretation with insufficient evidence,
an unresolved operational failure, or an unexecuted material gate still does.

## Current verification checkpoint

- CIS publisher comparison: 56 IG1 identifiers/titles match the current public CIS
  Assessment Specification control pages; no extra/missing entries found.
- Reproduced and fixed misleading verification summaries for stale Evidence,
  missing/invalid assessment dates and Review-link-only operation claims. No saved
  assessment status or cadence changed. Three regression cases failed before fix;
  31 focused verification/workspace/component tests passed afterward.
- Full frontend baseline: 108/109 suites, 602/603 tests passed. The failure exposed
  random opaque IDs contaminating Evidence period search. Deterministic regression
  reproduced it in Demo and server paths. Both now search meaningful fields rather
  than internal IDs; 13 focused frontend and 12 backend Evidence tests passed.
- Browser reproduced completed Action summary showing the previous status and
  failing to load its Finding. Root causes: stale prop used by summary; Demo route
  parameters not URL-decoded despite encoded colon-containing framework IDs.
  Regression failed before fix; 12 remediation/authorization tests passed after.
  Finding validation remains independent; assessment remains unchanged.
- Initial isolated backend run: 395 tests and 567 subtests passed. This is isolated
  API verification, not browser-to-persistent-Mongo or deployed staging validation.
- Initial Demo optimized build passed. Existing PlatformAdmin hook warning remains.
- Full final retest and remaining lifecycle/browser gates are still pending.

The live public-source working baseline and material manual verification list are
in [framework-public-source-baseline.md](framework-public-source-baseline.md).
