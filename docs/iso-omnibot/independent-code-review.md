# Independent ISO secure-code and functional review

What this change does: Adds deterministic, versioned ISO interviews and explicit native saving for the existing 30 ISMS requirements and 93 Annex A controls. SoA decisions remain structured native fields on the same assessment that Annex A uses. Overview recommendations and audit preparation reuse the existing workspace, Review and workpaper workflows.

## Reviewed candidate and independence

- Worktree: `C:/Users/RobbA/Documents/Codex/2026-10-11/iso27001-omnibot-rollout`.
- Branch: `codex/iso27001-omnibot-rollout`.
- Final baseline HEAD: `1ba91c30c3dab074e85e3d6e09fca2f822e79184`; committed HEAD tree: `8bd846ce7548ed90f7dfdb120908332045c6d950`.
- Exact raw working-tree hash at review: **`d5a705160d67b9164b2cd5153773f09e471bd78f`**. It was identical at `2026-10-11T13:59:33.458Z` and `2026-10-11T14:02:26.620Z`.
- This is a Git-format SHA-1 tree computed read-only from the actual bytes of 1,476 tracked and non-ignored untracked files, with index file modes and `100644` for new files. Deleted files are omitted. The report itself is excluded to avoid a self-referential hash. No clean/smudge or line-ending normalization was applied, and no index or Git object was written. It identifies the dirty candidate, not a committed or deployed Git tree.
- Review began at `d5c9f1511b729eaf81ee9455676d4a8ec6a4f3e6`. The implementation owner integrated the two CIS corrections during review; the final baseline includes `3b8b958` and `1ba91c3`. This reviewer made no source changes or commits.

The pasted implementation assignment was read as acceptance criteria; the narrower independent-review request governs this reviewer's authority. The only intentional repository write is this report. No client, browser, provider, hosted session, deployment, account or real database was accessed. In-memory component probes added assertions only to the test runner's source buffer; no test file was changed.

Finding/backend source SHA-256 values were rechecked after all checks completed and still matched the stable snapshot:

| File | SHA-256 |
| --- | --- |
| `frontend/src/components/IsoGuidedAssessor.jsx` | `9984445d6cc85cc2ba125300014408a217f3c3efa35bb0a65546175a3824d567` |
| `frontend/src/lib/isoGuidedProgram.js` | `26d1795ff2a15d53a1ce6d2b4d1814d115807344016db1c85e703bfc8374d423` |
| `frontend/src/preview/guidedAssessment.test.js` | `c63537fcd2cb3d9687083b76415809ba2e05fd599a99e72ca0cf0728137120f5` |
| `backend/framework_governance.py` | `100186504f504c56179e9e4b45bfa1a40cf7cd68bcc747b3752293e9c53c4378` |
| `backend/guided_assessment.py` | `365c33588f72e3a8424d14f2906e683fc52a9b7aef1740e48aa787e699bdeb37` |
| `backend/iso_guided_assessment.py` | `5ab9ec1b26ff67110c2ccfad95d8ae3a395dfaf6f9bf4473ecea7c4262de8380` |
| `backend/iso_guided_lease.py` | `d42aa99e6a780ccae446cd399162f6842324312d39e6ebfcb9a252cd1a4eb6e7` |

## Must fix

### 1. [P1] Compare-and-retain silently discards unsaved interview wording

Location: `frontend/src/components/IsoGuidedAssessor.jsx:137-140`, with the unguarded entry at `:166-167` and the hydration that replaces local edits at `:58-59` and `:76`.

- **What this is:** A stale interview offers “Compare & continue” followed by “Retain answers & continue.” The operator can still edit the retained summary while the stale warning is visible.
- **Problem:** `beginNew(false)` calls `load()` without checking `interviewDirty`. Hydration replaces the local answers and wording with their last saved values, and the rebase submits those saved values. Neither the handler nor the comparison button requires an explicit discard decision.
- **Fix:** Guard comparison/restart before hydration whenever interview edits are dirty. Reuse the existing keep-editing/discard-and-reload confirmation, or explicitly save progress before comparison; retain the server rule that rebase uses saved answers and wording. Add a regression for unsaved manual wording during stale comparison.
- **If we skip it:** Exact user wording and unsaved answers can disappear under an action labelled “Retain,” without being saved in interview history. Native saved records are not changed by this failure.

**Reproduction:** Start with a completed, stale `4.1` interview whose saved narrative is `SAVED MANUAL WORDING` and whose summary-review basis matches its answers. Open the guide, resume the summary, replace it with `UNSAVED EXACT WORDING\nsecond line`, click Compare & continue, check the comparison confirmation, and click Retain answers & continue. The independent JSDOM probe observed one rebase PUT with narrative `SAVED MANUAL WORDING`; no discard confirmation appeared. The assertion that the manual text remains fails with expected two-line unsaved text versus received saved text. The real component was used with the repository's mocked transport/authentication fixture.

### 2. [P2] Cancelled audits become overdue recommendations

Location: `frontend/src/lib/isoGuidedProgram.js:3-7` and `:30-35`; the same deadline-only classification is also present in `frontend/src/components/IsoAuditGuide.jsx:6-7`.

- **What this is:** Audit recommendations classify current work from native Review status and deadline.
- **Problem:** Only completion is treated as terminal. A cancelled Review with a passed due date is labelled Overdue and placed at order 1, alongside implementation gaps. `/iso-audit` returns retained package Reviews without excluding cancelled records (`backend/iso_audit.py:163-167`), so this input reaches the Overview. Existing Review logic treats both completed and cancelled occurrences as closed (`frontend/src/lib/reviewOccurrences.js:42,54`).
- **Fix:** Respect cancelled status before calculating lateness and omit cancelled audits from the active queue. Keep their retained history available and show their terminal state in preparation guidance. Test a cancelled audit with a past deadline.
- **If we skip it:** Ended work competes for the four recommended next steps and is presented as a missed obligation. The guide also mislabels the same cancelled activity when opened.

**Reproduction:** Call the actual `isoRecommendedWork` with no assessment rows, today `2026-10-11`, and a native Review-shaped fixture `{review_id:'ended-audit', status:'cancelled', due_date:'2026-08-01', iso_audit:{package_key:'risk'}}`. It returns one recommendation with `order:1`, timing `{key:'overdue',label:'Overdue'}`, and reason “The recorded audit deadline has passed.” An independent read-only Node assertion expecting no active recommendation fails with actual length 1.

## Should fix

### 3. [P2] Existing CIS preview assertions contradict the newly supported ISO workflow

Location: `frontend/src/preview/guidedAssessment.test.js:52-58` and `:260-264`.

- **What this is:** The existing CIS regression suite also checks which other frameworks expose interviews and enriched work context.
- **Problem:** It still expects the active Dunder ISO interview to return 404 and ISO work to lack `context_complete`, `priority_records` and `task_ids`. The additive ISO implementation now supplies those features. Both assertions fail on this candidate; these failures reflect obsolete test expectations, not proof that CIS saving regressed.
- **Fix:** Update the explicitly ISO expectations to the approved behavior and keep negative coverage for an actually unsupported or inactive program. Preserve the CIS and SOC assertions. Do not disable the suite or change product behavior to restore the old ISO prohibition.
- **If we skip it:** The existing frontend test gate remains red despite the dedicated ISO suite passing.

**Executed evidence:** The combined frontend regression run reported 63 passing and two failing tests across the four existing suites. The failing cases were “applicable CIS clients start clean and unrelated frameworks reject access” and “CIS work context uses native relationships and non-CIS work keeps its original shape.” A focused replay is recorded below.

## Scope and positive evidence

Reviewed all new controller/adapter/recommendation code and the additive diffs in `FrameworkDrawer`, `FrameworkAssessmentWorkspace`, `IsoProgramWorkspace`, `IsoAuditWorkspace`, `FrameworkWorkspace`, and `preview/frameworks`; also reviewed `iso_guided_assessment`, `iso_guided_lease`, `guided_assessment`, and `framework_governance`. Connected context included framework catalogs/configuration, native patching, Review occurrence handling, authorization fixtures, ISO audit routing, relevant tests and the coordination record. Catalog structure and deterministic outcomes were checked across all 123 IDs; this was not a new exhaustive normative/content-source audit.

- **Exact native saving:** Guided native patches require the current completed draft, exact reviewed narrative, computed implementation status, matching wording basis, current version and lineage, and a narrow ISO field allowlist. Route tests and the all-123 preview test passed. This is local fixture evidence, not hosted persistence assurance.
- **SoA/Annex ownership:** Both entry points use the same native assessment ID. Decision writes contain applicability and justification separately; guided implementation writes preserve those fields, evidence links, owners, checks and historical approval data. Bidirectional native reflection and stale interview rejection passed in isolated route and preview tests.
- **Draft/history/version/CAS:** Drafts are per assessment and actor, versioned, bounded and compared by revision. Native saves retain their write token; completed/restarted/rebased interviews retain prior saved snapshots. The unsaved-local comparison defect in finding 1 remains separate from those server checks.
- **Scope/auth/lease:** ISO writes refetch the active actor, assigned record, client and active program before and after lease acquisition. The lease serializes cooperating ISO interview/SoA/native writers, checks ownership before writes, retains uncertain leases, and uses 80-second driver, 90-second request and 120-second lease limits. Tests passed for read-only/unassigned/cross-client/inactive access, changed authorization/scope, contention, stale updates, duplicate submits, cancellation, expiry, successor protection and lost acknowledgements. No additional reproducible backend defect was established in this scoped review. These checks do not prove fencing of every dispatched write or live Mongo behavior.
- **Defaults/mixed programs:** Isolated route and preview tests passed for existing/new/add-ISO/mixed-program activation, idempotence, clean ISO defaults, preservation of existing data and disable/reactivate retention. Eligibility is based on program selection, not Dunder's identity.
- **Routing/shared preservation:** Assessment recommendations carry the canonical assessment ID and section. Audit routing carries its package and scheduled year into the existing audit workspace. Source tracing found no competing ISO store, automatic audit completion, finding closure or approval. Workspace and audit-workpaper tests passed; new ISO recommendation navigation was source-traced, not exhaustively tested through a real browser. CIS/SOC backend regressions passed, SOC preview passed, and the two obsolete preview assertions are disclosed in finding 3.

The already reported Demo SoA guard that used unenriched `row.specification` instead of the canonical catalog is deliberately excluded. The candidate's guard now uses `frameworkDefinition(...)`; this review does not count that owner correction as a new finding.

## Checks actually executed

Frontend commands ran from `frontend` with `CI=true`, using `node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --no-cache --runTestsByPath ...`.

| Check | Result |
| --- | --- |
| `IsoGuidedAssessor.test.jsx`, `IsoAuditGuide.test.jsx`, `isoGuidedAssessment.test.js`, `isoGuidedProgram.test.js` | 4 suites, 181 tests passed |
| `IsoAuditWorkspace.test.jsx` | 1 suite, 10 tests passed |
| Preview ISO, preview SOC, existing CIS preview, `FrameworkWorkspace.test.jsx` | ISO/SOC/workspace suites passed; CIS suite had the two findings-3 failures; 63 passed, 2 failed |
| Focused replay of the two CIS preview cases, using `-t 'applicable CIS clients start clean\|CIS work context uses native relationships'` | Both failures reproduced independently; 26 unrelated tests skipped; 9.231 seconds |
| ISO backend engine and route modules | 27 tests passed, 37.944 seconds |
| Existing backend guided, SOC engine/routes, framework governance modules | 65 tests passed, 38.985 seconds |
| Independent in-memory stale comparison probe | Failed the preservation assertion, reproducing finding 1 |
| Independent read-only cancelled-audit Node assertion | Failed with active queue length 1, reproducing finding 2 |
| `git diff --check` | Passed |

Backend commands used the already installed `.soc-test-venv/Scripts/python.exe` runtime from the neighboring SOC worktree, with `-B`, `sys.path` pointing to this checkout's `backend` and `backend/tests`, and `unittest` loading the named modules. The actual HTTP routes ran through `httpx` ASGI transport and `AsyncMongoMockClient`; the harness patches dotenv and Motor and uses synthetic actors and clients. No real server or database is involved.

Two reviewer-run limitations are explicit: the bundled Python initially failed to import FastAPI/PyMongo, then the existing verification runtime succeeded; the combined frontend command mistakenly included a nonexistent `FrameworkDrawer.test.jsx`, producing an additional runner ENOENT rather than an application failure. That file is not claimed as tested. An initial unsaved-restart probe timed out at the default five-second limit and is not used as defect evidence; the focused compare-and-retain probe completed and reproduced finding 1.

## Stabilized backend disposition request and evidence limits

Backend owner/coordinator: please disposition the stabilized scope/auth/lease behavior against the recorded tree and confirm whether the changed active-ISO requirement for native writes, the under-lease refetch, and the explicitly limited timeout/lease guarantee match the intended contract. The independent 27-test ISO and 65-test shared backend runs passed; no separate backend-worker disposition has been received by this reviewer. The request is recorded here for handoff because no callable backend-worker address was supplied. Passing mocked tests is not a substitute for that owner's final disposition or hosted acceptance.

Review method follows the user assignment and [Google's functionality/concurrency/test review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html). Authorization inspection used the [OWASP Authorization Cheat Sheet, including request-by-request checks and authorization tests](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), accessed 2026-10-11. No ASVS requirement, whole-application security, ISO conformance or independent audit assurance is claimed.

Verdict: fix 1 and 2, and disposition/update 3 before release. The reviewer has not changed the implementation.

Not checked: hosted authentication/persistence, actual Motor/Mongo write and cancellation behavior, client/browser/provider sessions, builds, deployments, complete accessibility/performance testing, exhaustive new recommendation navigation, or licensed ISO normative coverage. Builds/browser integration remain owner work; the functional defects above are still open on the recorded candidate.

## Backend implementation-owner disposition — 2026-10-11

This append answers the backend handoff request; it is an implementation-owner source check, **not independent assurance**. Runtime code was read-only. HEAD remains `1ba91c30c3dab074e85e3d6e09fca2f822e79184`; the four backend source SHA-256 values above match the files checked for this disposition. The complete raw working-tree hash was not recomputed.

### Active-program and authorization contract: confirmed

The authoritative gate is the client's normal requirement with `baseline_key: iso-27001` and `baseline_response: applies`, not a new ISO setting or a caller-supplied flag. ISO guide routes and every ISO native assessment PATCH, including manual implementation, ownership and separately saved SoA decisions, require that gate. Ordinary authorized native reads retain historical records when ISO is disabled; disabling the program does not delete or rewrite old assessments/interviews.

`iso_guided_assessment.write_context` refetches the active actor, authorized writable assessment, assignment and client before acquisition and again inside the lease. It preserves the established archived-client OWNER exception; it does not introduce a broader permission. Guided native application additionally refetches context and the completed draft before the final write. These are fresh authorization checks, not an atomic freeze of external user, membership, program or configuration changes.

The coordinator's ownership-test fixture correction activates ISO through the normal requirement before attempting the native ownership update. That setup matches this intended contract; removing the activation gate to preserve the old inactive fixture would not.

### Native application and scope contract: confirmed

The current-base fingerprint binds client, assessment, framework/version, definition, question version, assessment/process owners, existing ISO configuration (currently `{}`), and SoA decision plus justification. Native application also requires current draft lineage, completion, exact version/answer summary-review basis, exact reviewed narrative and computed status, and the native write-token CAS. Guided fields are limited to implementation, status, source and the expected token. Annex application requires a separately saved included SoA decision with nonblank justification; undecided/excluded interview progress and history remain allowed. Guided application does not automatically decide SoA or alter evidence, approvals or checks. ISMS requirements acquire no whole-requirement N/A.

### Lease and timeout contract: confirmed with explicit limits

The private `iso_guided_locks` collection coordinates cooperating interview and native PATCH writers, including the normal SoA writer. Lease acquisition is atomic for that lock record; checks and cleanup use the acquired token, so an expired writer cannot clear its successor's lease. Contention returns 409. Within the protected operation, timeout or uncertain driver outcomes return an honest 503 and retain the lease until its 120-second expiry; cancellation also retains it and propagates cancellation.

The 80-second PyMongo CSOT and 90-second `asyncio.wait_for` cover the protected operation **after acquisition**. Preauthorization, lease initialization/acquisition and final cleanup are outside that bounded region. The earlier phrase "90-second request" must therefore not be read as an end-to-end HTTP deadline. Motor cancellation does not prove its driver thread or server write has stopped. This is neither a transaction nor server-side fencing after dispatch; it does not prove that an arbitrarily delayed write cannot finish after lease expiry. Reload/confirmation is required after an uncertain outcome before retrying.

### Evidence and disposition

For this append, source/connected authorization paths and the fixture diff were inspected; `git diff --check` passed. No test suite was rerun. The reviewer's recorded 27 ISO and 65 shared backend tests are separate evidence. The coordinator reports **770 tests and 5,891 subtests passed** after the valid activation fixture correction; this append does not independently reproduce that full-suite result.

No new backend correction was identified by this disposition. Findings 1–3 retain the reviewer's recorded frontend/test disposition and are not closed by this backend append. Real Motor/Mongo cancellation and persistence, hosted authentication, and browser/provider behavior remain unverified. No runtime edit, commit, deployment, migration, account or browser/provider operation was performed for this disposition.

## Independent remediation disposition — 2026-10-11

**Findings 1, 2 and 3 are closed on the candidate below.** The initial findings and verdict above describe the earlier candidate and remain as historical evidence; this append supersedes their open status. No additional reproducible defect was established in this narrow re-review. This is independent local source/fixture review, not hosted, normative ISO or release assurance.

### Exact candidate and scope

- HEAD: `1ba91c30c3dab074e85e3d6e09fca2f822e79184`; committed HEAD tree: `8bd846ce7548ed90f7dfdb120908332045c6d950`.
- Exact raw working-tree Git-format SHA-1: **`63db70a4143b6bcc6dc2de9950fb0fe519ec0aab`**, captured at `2026-10-11T14:23:17.288Z`, covering 1,478 tracked/non-ignored untracked files. The same actual-byte/index-mode method described above was used, excluding only this report. This is not a commit, normalized Git index tree or deployed revision.
- Scope: completed controller discard/keep-editing/rebase/restart correction and regressions; cancelled/completed audit classification and programme-only versus unscheduled-activity distinction; changed existing preview expectations; ISO-only assessment footer wording and its shared draft guard. Connected ISO/native/shared suites were rerun. The independent content retest is a separate workstream, not a result claimed here.
- The four backend source SHA-256 values still match the original review and implementation-owner disposition. No backend implementation change required a new backend suite run for this append.

| Remediation source | SHA-256 |
| --- | --- |
| `frontend/src/components/IsoGuidedAssessor.jsx` | `8d0209cd7b8c7acbd4f15e2a5a0a7b63f9c59bd1539bfb8aaac4be02c582a64a` |
| `frontend/src/components/IsoGuidedAssessor.test.jsx` | `fd6864a5e746095b1b9b125a330c973bd5937f46fb257c50609ebaf806e731ee` |
| `frontend/src/components/IsoAuditGuide.jsx` | `64dd4c31e8565f612e2958be19f3c7755b4fb95d4380ba871c557064adf3ceba` |
| `frontend/src/components/IsoAuditGuide.test.jsx` | `2a7f5c8395fd86d5f695bb340afd68a47cc4dd17bd0c452c6f5e153d1ea3ebf5` |
| `frontend/src/lib/isoGuidedProgram.js` | `f904b7cc0566acff2dd2d7d616c7d2632307e83c6033c4bd89d5632056095c4f` |
| `frontend/src/lib/isoGuidedProgram.test.js` | `20bfecd23eee1057c46eb412eeb8a3a25ecc64b57e9447afb82ce89176a64cf1` |
| `frontend/src/preview/guidedAssessment.test.js` | `8b05e19568bfa5227634b684faf96eeefd472c7a6aece4ab026be6c80af7eb11` |
| `frontend/src/components/FrameworkAssessmentWorkspace.jsx` | `7d2892319c801bba4fa372b0b9c190c0e99a7899395640e019b374e93a710345` |

### Finding-by-finding disposition

**1 — Closed.** `IsoGuidedAssessor.jsx:137-148` checks dirty interview state before hydration; `:203` routes a dirty restart to the confirmation; `:212-215` explicitly describes which unsaved values will be discarded and distinguishes continuation from an empty restart. Keep editing makes no GET/PUT and preserves exact multiline wording, blank lines, selected answers and answer details. After explicit discard, rebase uses the last saved answers and wording with the freshly loaded expected revision; restart deliberately sends empty answers/wording and clears the summary-review basis. Neither action applies a native assessment. The two new controller cases at `IsoGuidedAssessor.test.jsx:345-379` exercise both actions, cancellation, exact text/detail retention, request counts, saved-only rebase, empty restart, CAS revision and unchanged native values.

The independent original stale-summary fixture was replayed for both compare and restart, including `UNSAVED EXACT WORDING\nsecond line\n\nPreserve blank lines.` Both passed. A fresh-process in-memory sensitivity check removed the new pre-hydration guard and restored the old restart entry without changing any file: both new regressions failed at the no-extra-GET assertion (`:369`, expected 2, received 3). Thus these regressions detect the original unsafe path. An initial same-process sensitivity attempt reused the previously transformed module and was discarded; only the fresh-process, instrumented mutation is used as sensitivity evidence.

**2 — Closed.** `isoGuidedProgram.js:4-5,34` treats cancellation/completion as terminal and excludes both from active recommendations. `IsoAuditGuide.jsx:6-13` retains the terminal label/history guidance without active overdue or scheduling instructions. The original cancelled-audit reproduction now returns `cancelled` and an empty active queue for both an expired and missing deadline. Component tests also cover those cases and preserve completed/history, date-boundary, future/due/overdue and disabled-Review checks. No activity selected now produces programme preparation; an existing activity without a deadline still produces Needs scheduling.

**3 — Closed.** `preview/guidedAssessment.test.js:52-60` keeps the clean CIS assertions, positively asserts the ISO-specific version, and adds inactive-ISO 404 coverage. `:252-267` preserves CIS scoped/native relationship assertions and SOC positive context assertions while updating only the obsolete ISO absence expectation. The existing CIS, SOC and ISO preview suites pass. The inspected tracked diff does not delete CIS/SOC assertions or disable a gate.

**Additional footer correction — verified.** `FrameworkAssessmentWorkspace.jsx:40` changes only the ISO text to describe an interview or related-record draft. A separate rendered in-memory probe passed for ISO, CIS and SOC: ISO gets the new wording; both non-ISO branches retain the exact former Finding wording. Save & next remains disabled and described while `otherDraft` is true and becomes enabled when it clears. This probe stubs unrelated guide/finding children; it is not a real-browser navigation test.

### Checks executed for this disposition

From `frontend`, with `CI=true`:

`node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --no-cache --runTestsByPath src/components/IsoGuidedAssessor.test.jsx src/components/IsoAuditGuide.test.jsx src/lib/isoGuidedProgram.test.js src/preview/guidedAssessment.test.js src/preview/isoGuidedAssessment.test.js src/preview/socGuidedAssessment.test.js src/pages/FrameworkWorkspace.test.jsx src/components/IsoAuditWorkspace.test.jsx`

- **8 suites, 135 tests passed**, 160.185 seconds, no failing suite. The controller accounts for 43 passing tests; existing exact-text/SoA/native-failure/read-only/scope cases remain exercised.
- Earlier narrow audit/program/existing-preview replay: **3 suites, 45 tests passed**, 42.135 seconds. Original cancelled-audit pure-function assertions passed for past and missing deadlines.
- Independent stale-summary probes: **2 passed**. Independent ISO/CIS/SOC footer probe: **3 passed**. Both ran through source-buffer fixtures only; no test/source file was written.
- Synthetic old-path sensitivity: **2 expected failures**; source mutation was instrumented and verified. This is deliberate regression evidence, not a candidate test failure.
- No skipped/todo/disabled test declarations were found in the four remediation test files. The ISO native-adapter test partitions all catalog IDs into five isolated batches of at most 25; exact text/status, unrelated-field/history preservation and stale-token rejection remain asserted per row. Partitioning does not reduce ID coverage.
- `git diff --check` passed. The controller author's scoped lint result is reported by the coordinator, not independently rerun here. No build was run by this reviewer.

### Backend disposition and remaining limits

The backend owner's append is received and matches the unchanged reviewed sources. Its active-program, authorization/refetch, native-field/lineage/CAS and cooperative-lease contract is consistent with this source review; no independent backend blocker was established. Correct the initial shorthand “90-second request”: the 80-second driver and 90-second async limits cover the protected operation after acquisition, not preauthorization, acquisition, cleanup or an end-to-end HTTP deadline. Token ownership checks are not server-side fencing of an already dispatched write, and Motor cancellation is not proof that its thread/server write stopped. Those live-storage limitations remain open. The coordinator's 770-test/5,891-subtest result is attributed evidence, not an independently repeated full-suite result.

**Disposition:** the three reported local blockers are remediated on the recorded candidate. This reviewer changed only this report; implementation, commits, builds and release decisions remain owner work. No client/browser/provider/session access, deployment, migration or real-database operation occurred. Hosted authentication/persistence, restricted-account acceptance, live Mongo cancellation/fencing, exhaustive browser navigation/accessibility/performance, exact frozen CI/builds and licensed normative/content completeness remain outside this narrow disposition. Passing these local checks does not authorize or establish a release.

### Subsequent nested-Escape correction — overall disposition pending

After the three-finding recheck, the coordinator reported a browser reproduction in which Escape closes both the ISO guide and its native assessment: the parent Radix document-capture handler runs before the guide's bubbling stop. This reviewer has not accessed that browser or independently claimed browser reproduction. Findings 1–3 remain closed; **the overall final code-review disposition is pending the requested correction and its actual nested-dialog regression**. The authorized owner correction is an optional `AssessmentShell` Escape callback forwarded at the dialog boundary, with only the ISO caller preventing default for focus inside its own guide window. The re-review must confirm normal/default and CIS/SOC Escape behavior remains unchanged. No implementation change is made by this reviewer.
