# Combined Login and CIS OmniBot staging closeout

Checkpoint: 2026-10-10. **Both approved workstreams are deployed to the existing Render staging service for validation. Final release acceptance remains blocked by actual restricted-user and unauthorized-client tests.** No main merge, production/Sites publication, provider configuration, authentication/security change, or data reset occurred.

This report supersedes the pending hosted checks in the original Login and CIS handoffs only where new evidence below establishes their result. The original reports, logs, branches and worktrees remain preserved. No runtime implementation was recreated or redesigned during closeout.

## Source, tests and deployment

| Item | Verified result |
| --- | --- |
| Combined branch / draft | `codex/login-cis-closeout`; [PR #65](https://github.com/robbashea-lab/GRC/pull/65), draft and unmerged |
| CIS parent / PR #63 | `7b63a444b5b1fd50b81539c7c90e613fbb000194`; approved pilot PR #62/#61 ancestry retained |
| Login parent / PR #64 | `e7704c4b85efaf4dd8b077effca66424fd691708` |
| Exact tested and deployed runtime | `b90a327d1b3afd2f352d4fdb7933ab0133cd39e0` |
| Runtime tree | `6b4697296edb42d7ea4015282553f2cfcc99d42e` |
| Main | `911706cebc7a70c0443f500fcd4bc19260c1db60`, unchanged on final PR refresh |
| Windows full frontend | 258 suites / 7,257 tests / 1 snapshot passed; exit 0; 1,500.636 seconds |
| Windows builds | Both `CI=true` existing staging and preview build configurations passed; preview was not published |
| Exact-candidate CI | [CI127 / run 38052767065](https://github.com/robbashea-lab/GRC/actions/runs/38052767065): frontend 258 / 7,257 / 1, both builds, classified backend offline/disposable-Mongo persistence/recovery/authorization, and release gate succeeded |
| CI source identity | Synthetic PR merge `a507978e4ae5012718d056cd1233081079fdd407` has the complete runtime tree above |
| Independent integration review | No material defect; separate reviewer ran 14 suites / 588 tests, exit 0, and reviewed final hosted evidence; controlled validation approved, release acceptance withheld |
| Staging | https://omnisciente-staging.onrender.com; service `srv-db1s0cugekts73f72reg` |
| Actual deployment | `dep-db53ifrrjlhs73ca0ht0`; manually deployed specific full runtime SHA; direct Render source link and **Deploy succeeded / Live** rechecked after hosted validation |
| Served assets | `main.f518447e.js` / `main.fe2057c8.css`, matching Linux CI and Render build output |

The integration is a non-destructive merge: all 17 Login-exclusive entries match the approved Login parent exactly; all other 1,166 entries match the CIS parent. Backend/auth context, native writer, shared CIS rules, immutable interview versions, catalogs, dependencies, approved Omni artwork/window/styles and unrelated modules did not change. The only shared integration action was retaining both approved branches in one source tree; no additional shared runtime correction was necessary.

Evidence-only commits after the runtime SHA are not a new tested/deployed runtime. Their CI is separate. Do not infer a deployment or repeated full run from the draft PR's later evidence head.

Local commands were `CI=true; node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand`, `CI=true; node scripts/staging.cjs`, and `CI=true; node scripts/preview.cjs build`, using existing Windows Node 24.19.0/CRACO 7.1/React 19 dependencies. Full logs and their SHA256 hashes are in the proof manifest. Long unchanged simulation suites finished normally; no assertion, timing budget or skip was weakened. Prior failing logs/toolchain provenance remain in the original handoffs. Passing Jest does not establish that the older published-browser teardown issue was fixed.

Windows staging JS (`main.1f686f6f.js`) differs from the Linux CI/Render JS chunk name. No byte-identical JS claim is made. The served CSS bytes equal the Windows build, SHA256 `9755fd6cd64f1ba7b16a1989fdd76f1e7401d5d00f8a6c47843b241eb0a8a307`. Backend raw CI log retrieval returned connector `Transport closed`; directly verified successful job/step metadata is retained without invented backend test counts. Render startup completed normally; the available deployment logs showed no unresolved release-related startup error. A Render project breadcrumb labeled Production does not change the verified staging service/domain identity.

## Persistent showcases and separate coverage layers

Use normal authenticated **Client Portfolio → client → CIS**. The established `/compliance/cis-ig1` route binds to the selected client's configured IG1/IG2/IG3 scope.

| Client | Configured group / hosted placements | Authoritative identity |
| --- | --- | --- |
| Brawndo | IG1 / 56 of 56 | `cli_60dee41ebbcd0e39b8bff87da17aee838ac50ecd799cb955f99d921eb6be4b20` |
| Initech | IG2 / 130 of 130 | `cli_51d464c245be0ddb5550306837370453e2223f0b2cc0b304ac137ea3ef97a24b` |
| Hooli | IG3 / 153 of 153 | `cli_81736222eb3a256f590391bc21530141cde382ab133a8554ccd6323f3dba9965` |

- **153 unique source/question/decision/summary definitions:** existing completed [coverage matrix](../omni-cis-rollout/coverage-matrix.json), 56 IG1 + 74 IG2 additions + 23 IG3 additions, and [independent source review](../omni-cis-rollout/independent-review.md) retained. The 4,267 authored rule cases and source adjudications were not recreated. The CAS verifier's retained exit 1/title variants are not relabeled passing. This is not exhaustive answer-combination coverage.
- **339 local rendered placements:** prior actual complete question-group walks and summary identity/structure evidence retained in [local browser evidence](../omni-cis-rollout/browser-placement-evidence.json). This is not hosted persistence proof.
- **339 hosted showcase placements on b90:** updated guide/full safeguard identity/correct client/group, relevant initial or resumed question group, single guide and no legacy fallback established. Raw sweep has 348 observations, including nine focused repeat observations; deduplicated total is 339. It is not 339 hosted saves or every conditional group traversed in the hosted sweep. Recommendations/native entry and loaded program/dashboard context were checked; final Initech/Hooli dashboards correctly bind 130/153 totals. Showcase native fields stayed unchanged.
- **Hosted assessment/lifecycle writes:** separate synthetic fixtures and 54 lifecycle observations, including 52 native-text observations, not 54 unique writes. Fresh and partial progress, direct final-group summary, exact reviewed multiline native saves, updates, cancellation, Save & close, refresh, revised-answer/manual-text protection, normal native edits, duplicate activation, stale writer recovery, and real logout/login restoration were exercised across three groups.

### Two explicit showcase interview-only exceptions

The human separately authorized exactly synthetic **Brawndo 3.5** and **Brawndo 1.2** after their prior synthetic provenance was established. Each normal unchecked **Begin a new review** confirmation ran once to expose an unanswered current-source interview. Native implementation/status/verification/owner/Last Assessed and native history/activity remained unchanged after refresh; completed historical interview answers, notes and reviewed wording remained accessible. No native Save/Update was activated. These are two authorized interview/history writes, not read-only observations. Other showcase records were not treated as disposable.

3.5 retained the `PR58 PILOT 20261008 REASSESSMENT` synthetic marker and its native implementation/history/linked synthetic finding. 1.2 retained its explicit `SYNTHETIC STAGING QA ONLY ... not Brawndo facts` notes; blank native implementation/Not Assessed and 21 native history entries remained unchanged. The current unanswered 1.2 interview uses Control1-v4; 3.5 uses program-v3. The two supplemental checks complete current-source visibility for the two historical placements without rewriting their saved native assessment.

## Hosted login, lifecycle and preservation results

Actual normal authorized staging sign-in reached the portfolio, refresh retained the session, and normal Sign out returned to Login. A subsequent normal return Sign in used the browser's already-filled masked form; no password/cookie/token was read, extracted or injected. All three QA groups reopened exact saved native text, exact editable summaries and their actual saved answers after that logout/login. The earlier credential-entry request is superseded, not still a blocker. No MFA challenge was presented; this is not MFA execution evidence.

On the combined hosted Login, the approved artwork/entrance and education controls were observed. Actual viewport widths 1440, 1024, 768, 390 and 320 were applied and captured, with no horizontal page overflow; narrow layouts allow normal vertical scrolling to sign-in. The earlier ineffective-width attempt is preserved separately and superseded. Pause/resume, Replay action, Robot/Orb, right-arrow key action, Governance Enter/focus, Ready-to-sign-in email focus, Light/Dark restoration, and the four static introductions plus Risk/Compliance were checked. Animated robot bounds do not independently establish how much the key moved it. The normal recovery page/back link worked; no email delivery or password reset was triggered. Explicit Demo entry reached the visibly separate sample-data portfolio and normal Demo Sign out returned to Login. Demo made no backend assessment writes and supplies no authenticated persistence proof.

Login shell, education and visual-effect overlays were absent in the authenticated and Demo portfolios. Source-scoped event/effect cleanup and original responsive/physical-drag tests were independently reviewed. Actual hardware/mobile Safari, OS reduced-motion emulation, MFA challenge and recovery mailbox delivery remain unexecuted; no account or security setting was changed to manufacture them.

| Group / synthetic primary record | Actual b90 results |
| --- | --- |
| IG1 / 1.1 `fw_06ff0298befa59b59c2c197e42c1f4cb` | Fresh blank Not Assessed; progress-only native unchanged; five groups → direct editable summary; exact Save/Update/Save & close; cancellation; accepted answer changed to No → Partial with manual wording protected; explicit reviewed recovery to Implemented; duplicate history 4→5; native-winner stale guard/retry; final 1,570 characters restored after actual login |
| IG2 / 15.3 `fw_75ac9de19b9f52be8b6799d129efbc5d` | Fresh blank Not Assessed; partial resume; three groups → summary; corrected readable requirement-note label; exact ordinary Save and Update plus Save & close; cancellation; material requirement No → Partial; explicit correction → Implemented; duplicate history 4→5; native-winner stale guard/retry; final 1,696 characters restored after actual login |
| IG3 / 15.5 `fw_54c3a69230de5e2ab266c0466dd1f99e` | Fresh blank Not Assessed; partial resume; permitted new/renewed-contract cadence alternative → Implemented; no optional-note/upload obligation; exact Save/Update/Save & close; cancellation; reassessment No → Partial; explicit recovery; duplicate history 4→5; native-winner stale guard/retry; final 1,644 characters restored after actual login |

The full reviewed OVERVIEW / IMPLEMENTATION BREAKDOWN / ITEMS TO ADDRESS text, headings, bullets, intentional blank lines and reviewer edits are readable in the authoritative native Current Implementation field. Status is separate. No second external save, automatic evidence verification, Review completion or finding/action transition occurred.

Additional actual IG2 15.4 tests saved affirmative absence as **Not Implemented** (1,428 exact characters), then all required answers Not sure as **Not Assessed** (1,209 exact characters), without asserting missing information as a confirmed deficiency. Original 988-character synthetic text remains recorded in prior evidence and native save history; no history was deleted. This record remains the pending restricted-identity target, owner Unassigned.

IG1 1.2 actual hosted proposal checks distinguish every-two-weeks Partial from weekly Implemented using only the source-permitted quarantine/isolate alternative; prerequisite 1.1 native text stayed exact. These were interview-progress/proposal checks, not native 1.2 assessment writes. No invalid N/A branch was invented; documented reachable/impossible statuses and rejected invalid N/A remain separately covered by source-derived automated cases.

Two-window interview revision conflicts were observed in all three groups: loser received **Interview changed in another window; reload before saving**, retained its unsaved input, and fresh winner answers/notes remained authoritative while native fields stayed blank. That message is source-confirmed backend revision rejection (409 in source); a raw network 409 was not captured. Native Save & close stale tests hit the authoritative frontend re-read guard, kept the guide open and the native winner intact, then succeeded only after normal explicit comparison/review. They are not mislabeled captured server PUT conflicts. Rapid duplicate confirmations appended one native history entry each; no broad idempotency claim. Arbitrary network outage/HTTP500 injection was not performed through an unsupported browser mechanism.

Approved CIS Omni guide keyboard movement/resizing, maximize/restore, minimize/reopen, launcher and exact summary restoration were observed at an effective desktop viewport. Minimum-size/boundary clamps are expected, not defects. Existing actual local physical-pointer-drag proof applies to the Login robot and is retained with source equality; a new hosted CIS-guide pointer drag is not claimed. Representative ISO4.1/SOC2CC1.1 native values, headings and absence of CIS Omni stayed unchanged, including the existing mixed QA fixture. This is sampled preservation, not a whole-platform pixel audit.

## Future defaults, upgrades and QA cleanup

Normal persistent onboarding/configuration evidence is preserved by revision: existing IG2 and mixed ISO→add-CIS scenarios were already completed on the prior rollout; new correctly configured IG1 and direct IG3 fixtures were created on compatible79075, then their current defaults and refined guides checked on b90. No manual pilot flags or client-name exceptions were introduced. The standalone Login branch was never deployed over CIS.

The new IG1 fixture was then normally upgraded IG1→IG2→IG3 on b90 through Program configuration and scope-change confirmation. Its same native 1.1 ID, exact 1,570-character text/status/verification, interview history and native history dialog stayed unchanged; native history remained **7→7**. No downgrade/reset was used. Its name still says IG1, but its actual final configuration is IG3.

After their required checks passed, the existing reversible Archive workflow archived four synthetic fixtures, preserving assessment/evidence/audit history and exposing Restore:

| Archived QA client | Final actual configuration / identity |
| --- | --- |
| OmniBot QA — CIS IG1 | IG3 after earlier upgrades; `cli_f5384b6f8ee3805b602ef5c5404ea44ae1fcc6fc2558f51e65d2936f472a1db0` |
| OmniBot QA — CIS IG3 | IG3 plus ISO; `cli_76cfe57656626255009c3fbda48cda38d639cc8b9446eb8e5eda32ad5b73b199` |
| OmniBot QA — Closeout CIS IG1 | IG3 after this closeout's upgrades; `cli_03461153428aef4af525ac083a42098242b3009d4fa5c0c0ecdc192c3d2c7c03` |
| OmniBot QA — Closeout CIS IG3 | Direct IG3; `cli_9846e21d942436eca2be79c365f2c52d154a41b97608ba302b5fc65fa7cc9ca7` |

**OmniBot QA — CIS IG2** (`cli_c65cd90ca6d92c2a86f5cffc8972a19f22bf1d791ec0cc9ec1684a811f0bd1b0`) remains active solely because restricted-role/client-membership acceptance tests are pending. Brawndo/Initech/Hooli and unrelated clients remain active and retained. All QA narratives are explicitly synthetic, not showcase implementation facts. No client was permanently deleted or assessment/history reset.

## Remaining blocker and release disposition

Existing staging-admin@example.com is Active SuperAdmin. The inspected fictional Read Only/Contributor identities are Disabled; the verified Contributor has zero client memberships. The available SuperAdmin session proves saving/context preservation, not restricted-user denial.

Actual **read-only write denial** and **unauthorized-client access/write denial** are blocked, not failed or passed. No browser role mock, hidden controls or disabled-account observation substitutes for those checks. Switching authorized clients and exact per-record restoration passed; unauthorized-membership denial did not run.

One precise approval request remains pending for `bec984b1-client_contributor-verified@example.com`: temporarily enable the existing account, grant only QA—CIS IG2, assign only its synthetic15.4 target as needed for Contributor writes; then test normal Read Only/revoked-membership server denial. Proposed cleanup restores original Unassigned owner, Contributor role, zero memberships and Disabled state, preserving normal audit history, and archives the remaining QA client after success. No such identity/access change occurred. An already-active, suitably restricted authorized identity with normal credentials could also resolve the access prerequisite. Password/MFA entry must occur directly in the coordinated browser, never chat.

Effective local profile is danger-full-access, network enabled, approval policy never; no local sandbox escalation is available or needed. The remaining restriction is human authorization/identity availability, not filesystem/network access or a connector approval failure. No sandbox/Windows/security/approval setting was changed.

The deployed candidate is **for validation, not accepted/production-ready** until the required actual restricted tests pass. Original permission-denial tests in CI do not waive hosted identity proof. Lower-level recovery-delivery/MFA/device/pointer limitations above remain explicitly unexecuted or prior-local evidence, not fabricated hosted passes. A transient Hooli4.5 loading delay recovered by normal reload; the retained observation does not establish an application defect or prove its cause harmless.

## Compatible recovery and evidence

Prefer an in-scope forward correction or independently tested compatible writer. The preceding compatible runtime `79075e0f85bebdb9651d381762e945c01f79c108` / `dep-db4n4iflk1mc73d83cs0` supports current CIS interview versions/history/native CAS but lacks the Login update. Do not blindly deploy the older pilot or standalone main-based Login writer over new interviews. No database rollback/reset, interview bulk regeneration, scope downgrade or history deletion is a recovery procedure. Any recovery deployment must remain coordinated with the staging owner.

The [acceptance ledger](evidence/closeout-acceptance-ledger-b90.json), [independent closeout review](independent-review.md), and [proof manifest](proof-manifest.json) preserve exact revision, file hashes and evidence-layer boundaries. Selected browser/CI/deployment evidence copies are committed under `evidence/` with LF text; outer transcript line-end whitespace is trimmed only in TXT copies. JSON native text values remain exact. Separate original-byte hashes preserve the complete untouched local logs/captures in `outputs/login-cis-closeout/`. Earlier [CIS handoff](../omni-cis-rollout/handoff.md), [runtime/recovery explanation](../omni-cis-rollout/runtime-change-and-recovery.md), and [Login handoff](../login-standing-scan-handoff.md) remain unchanged. Shared PR57 coordination retains one deployment owner.
