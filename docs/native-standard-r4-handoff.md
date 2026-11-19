# Native Standard R4 implementation handoff

Status: focused QA corrections prepared on `codex/native-standard-r4-20261119`, after published `e80b7f06dc4d55c08a94f7db6100544cf78eb9e4`. Both final local builds passed; the next exact-head CI and native acceptance remain pending. **Not deployed, merged or accepted.**

## Authority, baseline and integrity

Robb's November 19 request authorizes the approved R4 standard across the entire platform, all supported frameworks and General GRC, existing/new/later-enrolled clients, in authenticated and Demo modes. Deployed Login appearance and authentication behavior remain protected. No deployment, hosted migration, live-data QA, merge or automatic release is authorized. The future staging-release document remains planning material.

- Baseline: `9ec2f690ec2d91b0f56d11b466a149673a188fda`, tree `20d7c30e85ec42aed6fb49adc34ce02a694f94ab`.
- Package ZIP SHA256: `1ec879feb89d154bf6529b61461eca419ac611d1062abc9fac23a50e4936f665`.
- Approved HTML SHA256: `865a2a2d6722f07e7d7085eef23bd2e292e2e8061cf1a174630c00ce9fa788b0`.
- All 23 manifested files passed size/hash verification; the complete package and referenced contracts were read before implementation. Reference HTML is not application code or native acceptance.
- Agent 007 is sole integration, Git, runtime, Browser and release coordinator. Disjoint framework, presentation, contract and Agent 69 work was integrated with independent AI review. This is not human peer acceptance.

## Implemented scope

The shared post-login shell and presentation, Portfolio/client workspaces, framework programs, administration/account surfaces, native forms/drawers and connected workflows use the approved standard. Native Login is unchanged. Shared logic follows enrollment and authorization rather than demonstration client names.

Native workflow changes include versioned assessment guidance, Services/Tools/Setup, occurrence-bound Review checklists and supporting records, explicit Finding validation, AI governance, exact Policy coverage, native reports and Evidence. Existing identities, questions, approval/history provenance, recurrence, permissions, Save/Cancel, concurrency and retry protections remain authoritative. No prototype data/storage, startup reseed or hosted migration is introduced.

The 32-surface implementation ledger records control coverage and separate source/test/Browser gates. Neither a visual shell nor a green build proves every native interaction.

## Current QA closeout

Full [CI350](https://github.com/robbashea-lab/GRC/actions/runs/44602672317) on e80 **failed**. Backend, real Mongo and both builds passed within that run; six frontend jobs and downstream aggregate gates failed. All logs, case inventories and failed attempts are retained. Newer focused passes do not change that verdict.

Closeout corrections address incomplete authorized loading states, exact Demo grant types, preserved native AI controls/search, independent immutable work validation, truthful Review result fixtures and actual read/save races. The Review fixes were first reproduced: a busy checkpoint retained an obsolete own-save revision, and an old related-Risk response could replace fresh facts after an A-to-B-to-A client-context transition. The minimal corrections retain draft state, current authorization, exact retries and original save rules. Independent source review is [recorded](../../analysis/integrated-review-04.json).

| Verification | Actual result and boundary |
|---|---|
| Real Mongo R4 preservation/recovery | 184 cases across 23 modules passed on the earlier candidate, including 169 actual-storage cases; stable IDs, approvals/history, file bytes/versions/links/indexes and isolated BSON restore. Not final Browser acceptance. |
| Original real Mongo report snapshots | Three original concurrent-read/session/permission tests passed separately; not native HTTP report acceptance. |
| Immutable native work | 17 suites/238 cases passed; completed-record protection, independent validation and exact uncertain retries. Selected inputs stable; disclosed unselected-test drift retained. |
| Retained program history | Five suites/174 cases passed, zero drift; actual eight-year/current governance and linked operations. |
| Greenfield 24-month fixture | Eight cases passed, zero drift; all original foreign-record, reload/capacity, event and deadline assertions retained. Demo adapter, not authenticated Browser proof. |
| Final Review owner/save/upload regression suites | Seven suites/122 cases passed; production and selected tests stable. Three disclosed disjoint caller fixtures changed during execution. Includes the actual stale-response and busy-own-ACK regressions. |
| Additional native Review callers | Five suites passed in caller02; BrawndoReviews then passed all 41 cases in caller03 with zero drift. Earlier four fixture failures remain retained. Original Notes/Save/Cancel/history/cadence and foreign-data assertions are preserved. |
| Final local standard and private Demo builds | Both passed under CI warnings-as-errors in 56.5 seconds; all 1,419 input hashes matched before/after. Standard and private Demo manifests are retained in verification/builds-integrated-07-assets.json. Local Windows builds are not Linux/CI or native Browser proof. |
| Full required CI | New exact-head run pending. Original long-suite cases/assertions/deadlines are unchanged; no additional local timing campaign substitutes for CI. |

Additional focused receipts cover shared shell/portals, onboarding, client context, typed grants/replay, registries, Evidence guards, reports, annual Policy coverage, retained datasets and native framework callers. Their exact source boundaries and prior failures are in [CURRENT_HANDOFF.json](../../CURRENT_HANDOFF.json) and `verification/`; overlapping counts must not be summed.

Build06 failed under warnings-as-errors because a callback dependency was unused; Demo was unrun. Its logs and source hashes remain retained. The corrected owner occurrence is actually captured; no lint suppression or deadline increase was used.

## Native environment and Browser evidence

Only the existing isolated loopback replica set, synthetic database, three client identities and scoped accounts are used. The earlier owned app was stopped for the final build. The same database/accounts remain intact. Resume requires Root's exact final source/build receipt and checks of the predecessor, port, replica set, database and retained identities; no reseed, rotation or replacement accounts.

The earlier e80 [Browser journal](../../verification/native-browser-01.json) includes normal provider sign-in, Portfolio/client navigation, Risk create/dirty-cancel/save/reload, Unicode persistence, linked Review metadata, read-only controls and a second-tenant boundary. It also retains a failed checklist checkpoint, unconfirmed file-chooser attempts and incomplete forbidden-client feedback. These are historical partial journeys, not final acceptance of the corrected candidate.

Still open: final native checklist completion/recovery, authenticated Evidence upload/download bytes through reload, Reports02, shared connected updates, all framework/current/fresh/later-enrollment paths, and matched light/dark/narrow/keyboard/actual 150–200% zoom checks. Actual Browser evidence is separate from DOM/adapter/ASGI tests and tool elapsed time is not product responsiveness. The reference HTML access denial remains respected; no alternate route substitutes for blocked reference-pixel acceptance.

## Security and publication boundaries

The [current targeted check](../../verification/security-login-closeout-04.json) found zero credential-pattern candidates in 408 changed/new text files; all six protected Login/auth files match baseline and all 32 production closeout pins match independent review. This is not exhaustive secret scanning or native Login acceptance.

Dependency manifests and lockfiles remain unchanged. Eighteen inherited advisories are preserved (8 high, 7 moderate, 3 low), with [applicability triage](../../analysis/dependency-advisory-applicability-triage.md). No exploitability, accepted risk or security-compliance claim is inferred; no unrelated dependency upgrade is bundled.

Fresh read-only [automation review](../../verification/prepublication-automation-review-04.json) confirms the existing staging service remains on main with automatic deploy and previews off. The feature branch is outside the push allowlist. Main and feature workflows are checks-only with read-only repository permissions. Optional feature publication/manual CI must not change provider settings, merge, publish the private preview or call deployment hooks.

## Delivery and recovery

The exact final branch/commit/tree, build manifests, full-CI result and served local identity are recorded in the adjacent CURRENT_HANDOFF and final delivery receipt after they actually exist. Do not label the published e80 candidate or the uncommitted closeout as fully qualified.

Before any future staging review, require explicit deployment approval for the exact qualified revision and the separately reviewed additive backup/migration/restore plan. Code rollback does not reverse database changes. Keep the previous deployment and original data available, rehearse interruption/retry/restore on disposable records, and never mutate customer records for QA.

The consolidated report must identify source implementation, focused tests, complete CI/builds, native Browser/visual coverage and human acceptance independently. Full acceptance remains open, and no deployment is authorized by this handoff.
