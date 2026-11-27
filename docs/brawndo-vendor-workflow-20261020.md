# Brawndo Vendor workflow implementation handoff

Date: 2026-10-20. Branch: `codex/brawndo-new-workflows-20261020`; assigned baseline: `a4c93084`. No commit, push, deployment, release or browser claim is made here.

## Scope and authority

The supplied `references/vendor-workflow-original.html` is the appearance authority. Its SHA-256 was independently checked as `c4b7c8676792831d1f871a8915e94b3d5717429481df1c25e8dd59b7ab9e9eaa`. All CSS, markup, operational scripts and conditional states were read; the large logo-only object was inspected as static data (19 entries, 18 SVGs and one embedded image). The implementation extracts the original scoped CSS, 21 draft suggestion records and logo strings. No remote catalog or dependency was added.

The coordinator owns integration into the trusted Vendor gate in RecordDrawer. These components must only mount under that existing gate, which must continue to check trusted Explore/demo authentication, active authorized demo_brawndo, loaded same client, matching route and same-client record. Vendor landing/register and compact previews are frozen.

Approved deviations, communicated by the coordinator after user responses:

- Keep Vendor owner optional, including Unassigned and eligible native user IDs.
- The user explicitly approved one styled Next review input beside Review frequency in the existing-record Overview to preserve native Save scheduling. These two controls share the owned vw-schedule group; creation keeps its existing Schedule composition.
- Use native Create Risk / Link Risk for vendor concerns, with true Vendor source identity; no new Finding command.
- Keep the normal centered native full-record shell and native save/close/focus/discard ownership.
- Assurance uses styled native status, actual receipt/review dates and reviewer inputs, optional notes and the parent Save boundary. No invented outcome, automatic current date/reviewer or new required-note rule.
- Contract uses the explicit recorded native Notice deadline, rather than a period inferred from renewal.
- Common-vendor templates are editable, unsaved draft suggestions. Selection does not POST/PATCH, create Reviews, write Activity or claim persistence.

## State and operation matrix

| Reference state / selector | Implementation | Native binding / evidence boundary |
| --- | --- | --- |
| Header `.mh-top`, `.kick`, `.sub` | `BrawndoVendorWorkflowHeading` | Draft name/service; actual owner/status/criticality; real linked Review projection. Parent owns title accessibility and close. |
| Six `.tabs` | `BRAWNDO_VENDOR_WORKFLOW_TABS` | overview, data_access, assurance, contract, linked, activity. Parent owns tab state/count pills/dirty guard. |
| Overview `.strip`, `.two`, `.up`, `.sec` | Workflow overview | Existing draft, `vendorProjection`; real same-client Review IDs, document dates, explicit notice date. Empty dates remain empty; overdue wording avoids negative countdowns. |
| Overview lifecycle/frequency/custom/owner | Native-style fields in concept composition | Explore transitions, nullable eligible `AssigneeSelect`; existing monthly/biennial/as_needed/custom choices retained; no date arithmetic on frequency change. |
| Data `.grp-h`, `.tagset`, `.tag.sens` | Workflow data_access and create | Canonical native data labels, existing unknown recorded values retained. Selecting No Sensitive Data clears other choices; selecting another removes it. No automatic cadence/criticality changes. |
| Assurance requested/received/reviewed/awaiting update | `.asr`, `.flow`, `.asr-f` | Stable native IDs and real status/date/reviewer. No immediate receipt/review command is fabricated. Expanded native fields retain SOC I/II, ISO and Other validation inputs. |
| Assurance evidence | Upload copy, real catalog checkboxes, download buttons | Existing parent upload/download; byte upload and saved Vendor association remain separate. Missing IDs retained. Upload does not mark Received or Reviewed. |
| Assurance replacement/history | Request replacement, previous documents, earlier states | Same stable-ID/version links as native component, old docs read-only, evidence history retained. Source assurance focus opens prior-document section. Parent maintains save-before-assurance-Action guard. |
| Contract `.grid`, `.drop`, `.files` | Workflow contract | Renewal, explicit notice deadline, contract notes; real linked evidence metadata; existing upload/download and association IDs. Other unrendered contract values stay in parent draft. |
| Linked `.lgrp`, `.lrow` | Workflow linked | Actual Review/occurrence openers, task creation/open, Risk creation/open and native PATCH link with expected_updated_at. Same-client nonarchived Risk options; actual errors and refresh callback. |
| Activity/composer | `BrawndoVendorWorkflowActivity` | Composer first, actual comments/events merged by recorded timestamps; existing parent submit/draft controllers; real actors and safe text, immutable footer; no generated audit entries. |
| New vendor numbered sections / `.tpl` | Workflow no-record state | Search/category/selection/Start blank; native draft fields and UUID requests; real create only through parent Add to register. Owner/date/permission/native retry rules stay parent-owned. |
| Create `.sumline` | `BrawndoVendorWorkflowSummary` | Actual draft criticality/data/document counts and first-review date; parent owns create button and status. |
| Busy/read-only/error | Disabled fieldset + native field restrictions | Parent passes saving; general/assurance writes match existing canWrite+isAdmin policy; owner/notes use editableFields; delegated linked/contract commands retain native canWrite policy; inactive/historical remain protected. Errors expose formatted native messages. |
| Dark/narrow/hover/focus | Scoped original CSS | Exact reference light/dark tokens, Inter declaration, original 760px reflow; source-only proof, no computed-font or browser geometry claim. |

## Shared integration contract

Import the default Workflow plus named heading/tabs/summary exports from `BrawndoVendorWorkflow`. Under the existing trusted `vendorPilot`, use Workflow as the vendorPanel component. Pass existing native props unchanged plus `setTab`, `saving` and `onRecordChanged(data)`. The accepted-record callback must update the actual Vendor and its edit version, update only related_risk_ids in the current draft/baseline (preserving unrelated unsaved fields), then refresh linked Risks; this is necessary for successive Risk links to retain accepted IDs/version. Route `linked` through vendorPanel. Use the exported six-tab registry only for this eligible full-record surface. New Vendor uses the no-record branch through the existing overview call. Parent retains all Save/create-intent/clean-payload/version/close/discard handlers.

The heading takes `{record, form, users, reviews: linkedReviews}`; summary takes `{form}`. The activity export takes `{comments,activity,activityError,newComment,setNewComment,onSubmitComment,canWrite,saving,users}` and reuses existing parent controllers. The old complete editor must not be mounted underneath this component.

## Verification and outstanding work

- Babel JSX/module parsing passed for Workflow and static template module. PostCSS parsing passed. Bundled logo strings passed a simple active-content scan for script/event/javascript/foreignObject markers.
- Five focused behavior tests were added in `frontend/src/components/BrawndoVendorWorkflow.test.jsx`: template draft-only effects, data-choice exclusion and preservation, no fabricated assurance metadata, actual Vendor source identities for Risk/Action commands, and successive Risk links retaining accepted IDs/version without replacing unrelated draft fields.
- The first focused Jest invocation was interrupted before results when the coordinator clarified the CPU quiet window. Tests are **unverified**, not passing. No build or install ran. Run the focused suite only after the CPU owner releases the window.
- Shared RecordDrawer wiring, actual title/tab/footer styling and exact route-negative controls are coordinator-owned and require integrated review. Scoped shell, native-portal dark variables and local existing Inter font-file declarations are included; computed rendering remains unverified.
- Paired rendered references/candidate images, actual loaded Inter face, all light/dark/narrow states, native create/reopen/save/cancel/discard, stale conflict/retry, evidence bytes/association/history, actual nested Review/Action/Risk navigation and persistence remain unverified. This is an implementation candidate, not visual or release acceptance.
- Logo provenance/license comments come from the supplied reference and were not independently verified. No compliance claim is made.

Next step: review the integrated guarded candidate, run the focused behavior suite after CPU release, then obtain paired browser evidence and native journey receipts before any readiness claim.
