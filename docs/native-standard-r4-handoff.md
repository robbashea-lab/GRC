# Native Standard R4 implementation handoff

Snapshot: **2026-11-21 UTC**. Branch `codex/native-standard-r4-20261119`. Latest published revision: `cdf5c968814e20ed61bb8bbdff6d2e305080b24f` (tree `524afb0a734f09a4404076648cf9f156c5ed3a2b`). The current working candidate adds the reviewed Items-count correction and its regression tests; the exact later commit/build/runtime belongs to [CURRENT_HANDOFF.json](../../CURRENT_HANDOFF.json). **Not deployed, merged, release-qualified or fully accepted.**

## Scope and ownership

The final-reviewed November 19 R4 package is authoritative. Shared native implementation covers post-login shell, Portfolio, workspaces, six supported frameworks plus General GRC, connected operational modules, administration and account surfaces, for existing/new/later-enrolled clients in authenticated and intentional Explore modes. Login appearance and authentication behavior are protected. The [32-surface ledger](native-standard-r4-ledger.csv) records implementation, evidence and remaining checks; a source implementation entry is not acceptance.

Root owns integration, Git, tests, runtime, Browser and release coordination. Existing Agent 69 author/reviewer work is disjoint and source-only. No new agent was used to evade the actual platform limit. No staging/production deployment, main merge, hosted migration, live-customer QA, reseed, automatic release or access expansion is authorized. Rejected persistence/caching experiments and the old pilot remain stopped.

## Current focused correction

The actual Brawndo 1.1 Demo editor showed “Item count unavailable” while its loaded Items panel reported no current Items. Native contracts already support an omitted legacy Items list. The badge stopped before reaching the existing draft-aware projector.

The correction uses that projector only after a completed, identity-matched current read. An omitted list may then establish zero or count staged Guide/manual Items. Explicit null/undefined/wrong-type values, denied/failed reads, wrong-client/framework/record identities, loading/refresh and projection errors remain unavailable. Known arrays keep their established behavior. The read marker stays outside the assessment/form/save payload. No endpoint, migration, fabricated record, count fallback from Findings, permission or persistence change was added.

The [exact three-file packet](../../analysis/agent69-item-count-correction-01/manifest.json) and [independent AI source review](../../analysis/agent69-item-count-correction-source-review-01.json) are retained. The added full-parent test initially used click-only input; installed Radix selects on primary mouse-down, focus or Space/Enter. [Correction03](../../verification/native-item-count-tab-test-correction-03.json) changes only that new test's event, preserving every original test byte and all new active-tab/panel/remount/no-write assertions. This is not a product interaction change.

| Check | Actual result and boundary |
| --- | --- |
| [Whole original-source reproduction](../../verification/native-item-count-before-01-receipt.json) | 22 passed / 13 failed across two whole modules: three new count assertions reproduced the defect; ten original cases exceeded their unchanged 5,000ms limits. No source drift. |
| [Whole after-correction check](../../verification/native-item-count-after-02-receipt.json) | 23 passed / 12 failed: all eleven added controller count cases passed; eleven original cases timed out, and the new parent stopped at its wrong synthetic tab event. All outcomes retained; not a suite pass or performance repair. |
| [Corrected parent regression](../../verification/native-item-count-tab-input-03-receipt.json) | The one changed new case passed its zero, active tab, empty panel, remount and no-write assertions; sixteen other cases were not selected. Original deadline unchanged; no source drift. |
| [Eight consumer/context modules](../../verification/native-item-count-consumers-04-receipt.json) | 119 passed, zero failed, complete modules with original assertions/deadlines and no source drift. Covers native tabs, Items/projector, ordered context, visual origin, stale context/recovery and generic shell. |
| [Build21](../../verification/builds-integrated-21-receipt.json) | Standard and separate Demo passed, actual Node22.23.4, warnings as errors, 1,436 inputs and no source drift. Build20's 52 files were copied and hash-verified before replacement. Local build evidence only. |

## Current CI remains nonqualifying

[CI360](https://github.com/robbashea-lab/GRC/actions/runs/44871534964), attempt 1 on exact published cdf5, is terminal **cancelled: six successful, five failed and one cancelled job**. All twelve job outcomes are in [the terminal receipt](../../verification/ci360-terminal-01.json).

- Real Mongo, all three ordinary frontend shards, multi-framework and both builds passed.
- ISO five-year failed the original 180,000ms ISO body deadline; the other two cases passed. This does not establish a native-browser responsiveness defect.
- Ten-year failed its original 1,800,000ms shared setup hook. Seven dependent cases did not qualify their business assertions; they are not seven proven independent application defects.
- Backend was cancelled at the configured 30-minute job boundary, with no final aggregate. The provider's underlying cancellation cause beyond “cancelled” is unproven. Partial successes do not establish a backend pass.
- Coverage, frontend and Release gates failed. Prior green CI/backend runs do not override these failures.

Complete ten-year, five-year, backend and build logs remain retained. No rerun, deadline/assertion relaxation or new diagnostic campaign was performed. The [timing next-step plan](../../analysis/R4-TIMING-NEXT-STEP-PLAN-20261121.txt) is planning only; its older scope needs reconciliation with CI360 before any separately authorized execution.

## Actual native Browser evidence

[Contrast cdf5](../../verification/native-contrast-cdf5-02.json) records both themes, actual first-recommendation foreground, unchanged secondary recommendations, keyboard focus/Enter, correct native record opening and clean Close. Prior readable Continue/invitation/sidebar evidence remains separate. The count correction's actual after-build Browser verification is pending.

[New local Demo journey](../../verification/native-new-demo-cdf5-01.json) records 78 actual inputs on the same clearly labeled disposable client `clients_demo_mwpykwo8_fg6qeujm` — “ZZZ SYNTHETIC R4 Demo QA 20261121.” Normal onboarding created CIS IG1 only: 56 Not assessed safeguards, 14 missing / 3 unconfirmed policies and 12 unassigned, unscheduled native Reviews. No implementation or verification was inferred.

Native Services & Tools selection/Cancel/Save/reload preserved client-managed NinjaOne. A native 1.1 narrative edit exercised Keep editing, Discard, explicit Save, full reload and exact Unicode history while remaining Not assessed / Not verified. Native Review checklist progress saved; Complete remained disabled because the occurrence is unscheduled. No completion, next cycle or fabricated Finding was claimed.

The native report preview reconciled 56 unassessed criteria. Actual Policy CSV download: 2,753 bytes, SHA-256 `257a6faf318728d9dee50d19718fb142bcb047fd209d5630fd7785732d799a9a`, 17 actual policy records; one Export History entry persisted after reload. [Byte proof](../../verification/native-new-demo-csv-byte-proof-01.json) and screenshots62–68 are retained. The export tool returned after a long delivery interval; that interval is not measured product latency or an observed denial. No retry was used.

Earlier native authenticated Guide Save/reload, Finding worker-versus-validator controls, Review/Calendar scheduling restoration, evidence bytes and allowed/denied exports are revision-bound evidence in the ledger. They do not qualify every current surface, role or framework.

## Remaining findings and acceptance gaps

- The native onboarding date field accepted a candidate value immediately but showed empty after leaving the field/Next. [Read-only diagnosis](../../analysis/agent69-onboarding-date-source-diagnosis-01.json) found no established blur-reset cause; event delivery/nonacceptance versus later reset remains unproven. No date-rule patch or repeated blind event attempt was made. Twelve new QA Reviews remain honestly unscheduled.
- [Review diagnosis](../../analysis/agent69-review-completion-source-diagnosis-01.json) confirms the current disabled cause is needs-scheduling. Only once scheduled do applicable Exception/Finding prerequisites become relevant; the actual raw population was not inspected and missing Findings are not asserted. Completing checklist progress is not occurrence completion.
- Full 32-surface/reference-pixel/control matrices, actual narrower viewport, genuine 150–200% browser zoom, all six frameworks/roles/enrollment combinations, 101-file archive and remaining failure/recovery/two-session journeys remain open. Viewport API calls did not change the actual 1280×720 surface; denied reference access and unavailable zoom were respected. No DOM/CSS/adapter substitute is called native visual acceptance.
- Eighteen inherited dependency advisories remain documented and unaccepted. Targeted source checks are not exhaustive security clearance.
- Eight older misleading Item activity snapshots on four owned synthetic records remain unchanged. No history rewrite or implicit startup migration was introduced. Old readers cannot safely interpret every new Item/tombstone state; recovery needs the separately reviewed backup/compatible-code plan.

The exact owned app30332 was stopped before this correction; original Mongo, six temporary scoped accounts, three authenticated synthetic clients and the one normal Demo QA client are retained. No account/access cleanup is claimed. Any resume must bind the new tested source and builds, pass independent admission review and keep known CI/controller failures explicit. Earlier admission-guard mistakes and their corrective reviews are preserved in the [prior handoff](../../analysis/native-standard-r4-handoff-before-count-20261121.md); no unreviewed application source or customer-data incident was demonstrated.

## Next step and release boundary

Finish both build receipts, independently review the final focused diff, and admit only the same retained local runtime for bounded native count verification. Preserve failed full checks and unknown date cause. Update this handoff and ledger with actual results. Feature publication requires a fresh checks-only/no-auto-deploy audit; no unmodified timing retry campaign is implied.

The [staging/recovery plan](native-standard-r4-release-plan.md) remains planning material. Deployment requires explicit later approval for a reviewed exact revision and verification of all applicable release gates and data-recovery boundaries. Code rollback does not undo database writes. **Full acceptance remains open.**
