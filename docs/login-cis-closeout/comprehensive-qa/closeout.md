# Comprehensive CIS QA extension

Release state: **Deployed for validation — final acceptance pending.** This extends the combined Login/CIS closeout on draft PR [#65](https://github.com/robbashea-lab/GRC/pull/65). The original handoff and raw observations remain historical evidence rather than being relabeled as new checks.

## Candidate and release provenance

| Layer | Revision / result |
|---|---|
| Original combined runtime | `b90a327d1b3afd2f352d4fdb7933ab0133cd39e0`; `dep-db53ifrrjlhs73ca0ht0` |
| Original evidence head | `4f73e0cf3180e4b91de6518427b5bbb23ffccb1f`; CI128/run38062682596 succeeded |
| Frozen correction | `6a4c0c7612195605c39d3285bf11c2560e15d74e`; tree `c08a2390f75457c2147b430788658ec4679e69f9` |
| Exact correction CI | [CI129/run38065883834](https://github.com/robbashea-lab/GRC/actions/runs/38065883834); completed **success**: frontend full suite, both builds, backend offline/disposable Mongo, release gate |
| CI synthetic merge commit | `3ce94d7b30e4a04bb8e5a0043e77151be15c9cb8`; its tree is `c08a2390f75457c2147b430788658ec4679e69f9`, identical to the frozen correction |
| Documentation-head CI | [CI130/run38069960767](https://github.com/robbashea-lab/GRC/actions/runs/38069960767); completed **success** on `a10114df486fea16fa1393f94fc4e5aacd60dbd0`: frontend full suite, both builds, backend offline/disposable Mongo, release gate. This later evidence commit did not change or redeploy the runtime. |
| Staging | `srv-db1s0cugekts73f72reg`; https://omnisciente-staging.onrender.com; **Deploy succeeded / Live**, `dep-db56e2d9fdbs73bpcq50`, full source `6a4c0c7612195605c39d3285bf11c2560e15d74e` |

The coordinator owns integration, the shared authenticated browser and the sole staging deployment. PR57 remains the shared coordination thread. Main and the independent Login/CIS branches are preserved; no main merge or provider setting change is authorized.

## Source, question and decision coverage

[coverage-matrix-current.json](coverage-matrix-current.json) contains all **153** current unique definitions: **56/56 IG1, 130/130 IG2, 153/153 IG3**. Each row includes source identity, atomic question mapping, current contract/version, conditional visibility, optional-context boundaries, authored interpretations, independent case references, status/summary rules and placement provenance.

The content owner refreshed official Navigator and all 18 CAS control pages. The comparison inspected **1,571 question fields / 469 substantive mappings** and found no normalized Navigator ID/title/description/minimum-group drift. The independent reviewer separately refreshed every definition and adjudicated the findings. The original actual-function suite contains **9,653 recorded scenarios** across all 153 rows; this is not every possible answer combination. The current correction adds separately executed condition, historical-version and uncertainty-contract cases. Old 17.5 rejection cases are explicitly historical program3 checks, not expectations for the new program4 condition.

Source-conditioned exclusions require rationale and do not create blanket whole-safeguard N/A. Unknown is not affirmative absence. Optional tools, owner names and contextual notes do not add source obligations. The current uncertainty field remains the existing substantive-requirement uncertainty contract; historical text is not automatically reclassified or cleared.

## Confirmed defects and corrections

The canonical disposition is [acceptance-register.json](acceptance-register.json). Original reviewer reproductions remain preserved, including the initial broader interpretation of the uncertainty issue.

| Defect | Demonstrated behavior | Correction and compatibility |
|---|---|---|
| CONTENT-CIS-001 / 17.5 | Program3 unconditionally scores the relevant-third-party clause; a rationale-backed row exclusion is rejected, or an honest No creates a deficiency when no relevant third party exists. | Additive `cis-v8.1-program-4` for this one safeguard. The source qualifier is conditional, with rationale required. Ten unchanged criteria retain stable mappings. Explicit reuse leaves the changed clause unanswered; old program3 interviews/text remain readable. |
| CONTENT-CIS-002 / 8.10 exemplar | Broad uncertainty wording can invite optional owner/context uncertainty into the substantive uncertainty field, which qualifies status under the existing contract. | Clarify the current program3/4 prompt, help and status metadata. Exact stable field semantics map across supported versions during explicit reuse. No evaluator/scoring change, automatic text classification, cleared notes or retrospective assessment rewrite. |

Only **three runtime files** change: selective catalog/version composition in frontend and backend, and the additive 17.5 pack. Five scoped test files establish the correction and connected workflow paths. The separate reviewer found **1,179 other Git tree entries unchanged**, including Login, artwork/styles, authentication, save routes, dependencies, hosting configuration and excluded frameworks.

## Automated and local evidence

| Evidence | Actual result and limit |
|---|---|
| Full Windows frontend | 260 suites / 7,269 tests / 1 snapshot passed, exit0, 1186.58s. Collection preceded addition of the component suite; the same runtime and two correction suites were included. |
| Final connected component suite | 615 tests passed, exit0, 47.776s. Actual guide/native-adapter components traverse all153 fresh interviews and339 placements; API/auth/org/dialog boundaries are mocked. |
| Structural designs | 25 interview designs; cancellation, group checkpoints/resume, failure/retry, duplicate submission and stale/native-edit cases are represented locally. Distinct conditional paths and scope rationales have additional cases. |
| Independent frozen correction | 4,280 focused tests plus18 separate source/compatibility checks passed. Code/content acceptance is separate from release acceptance. |
| Both build configurations | Existing staging and isolated Demo builds passed; the Demo build was not published. |
| Backend | Local Python aliases/test dependencies were unavailable; exact CI backend offline and disposable-Mongo persistence/recovery/authorization jobs passed. This is CI evidence, not local Python execution. |

Original failing assertions, repaired harness assumptions, fixed-clock provenance and missing-tool diagnostics remain in `local/`, `workflow/` and `independent/`. The evidence directory's scoped `.gitattributes` preserves captured bytes across Windows checkouts so its SHA256 manifest remains useful. Verbatim captures retain source whitespace; authored Markdown/JSON is checked separately. No assertions or timing budgets were weakened. The older Playwright teardown `route.fulfill: Route is already handled!` remains an unresolved harness limitation; this Jest pass does not establish its cause or fix it.

## Hosted evidence and showcase clients

The baseline has **339/339 actual authenticated hosted placements**, not339 hosted saves. Raw baseline evidence has348 observations including repeats; deduplicated coverage is56 Brawndo +130 Initech +153 Hooli. Correct context, guide identity, initial/resumed questions, native navigation and absence of duplicate/legacy guides were checked. Only the separately authorized synthetic Brawndo1.2 and3.5 interview-state exceptions wrote history; native fields remained unchanged.

| Persistent showcase | Actual group / placements | Authoritative identity |
|---|---|---|
| Brawndo | IG1 /56 | `cli_60dee41ebbcd0e39b8bff87da17aee838ac50ecd799cb955f99d921eb6be4b20` |
| Initech | IG2 /130 | `cli_51d464c245be0ddb5550306837370453e2223f0b2cc0b304ac137ea3ef97a24b` |
| Hooli | IG3 /153 | `cli_81736222eb3a256f590391bc21530141cde382ab133a8554ccd6323f3dba9965` |

Original b90 evidence contains54 hosted lifecycle observations and52 native-text observations on the three primary cohort fixtures, including actual logout/login, exact reviewed text and separate status restoration, cancellation/update/retry/duplicate/concurrency cases. Server interview conflicts and frontend native stale-write prevention are distinct checks; a frontend stale guard is not claimed as a server PATCH409.

This extension restored the existing archived, clearly synthetic **OmniBot QA — Closeout CIS IG3**, without reset or cloning. **22 additional normal native-save/refresh representatives** cover remaining original structural designs. Together with the original1.1/15.3/15.5 records, **25/25 original designs have a hosted positive-save representative**. Optional context, direct final-group summary, manual multiline text, native readability, Save & close success and refresh persistence passed. 1.2 additionally exercised actual partial-progress resume/back navigation and its valid weekly/quarantine alternative. These22 writes are b90 observations; they are not corrected-candidate observations or per-design exhaustive negative testing.

Two affected corrected-candidate hosted checks passed through the normal authenticated UI on the isolated IG3 fixture. [hosted-corrections-6a4c.json](hosted/hosted-corrections-6a4c.json) records the source and deployment separately from baseline observations:

- **17.5:** explicit current-source review reused exactly ten compatible criteria and left the changed clause unanswered. Unknown relevance produced Partially Implemented and confirmation work; relevant unassigned roles produced deficiency/remediation; rationale-backed absence of a relevant third party excluded only that clause and produced Implemented with the other ten requirements satisfied. Interview progress and replacement cancellation preserved native text. One confirmed Update saved the exact reviewed **1,788 characters**, including preserved manual wording. Refresh/reopening preserved it; old completed program3 answers and manual text remained accessible alongside program4 history. Verification stayed Not verified.
- **8.10:** clarified mandatory/optional instructions were visible. Optional owner uncertainty remained context and the outcome was Implemented; unresolved substantive retention confirmation produced Partially Implemented with confirmation work; resolving it removed the concern. Native data stayed blank during progress. Normal Save & close saved the exact reviewed **779 characters** and separate Implemented status before closing. Refresh/reopening preserved the headings, bullets, blank lines and manual edits. Verification stayed Not verified.

The independent reviewer checked the saved text hashes, status/condition/history observations and exact CI job metadata. This is independent evidence review, not a second independent hosted browser execution. No showcase native assessment was overwritten. The latest [targeted checkpoint](hosted/targeted-closeout-20261010/targeted-closeout-results.json) separately records current6a4 observations: InitechIG2/17.5 and HooliIG3/17.5 open the intended refined guide, correct native title/group and relevant first question with no legacy/current-source-review gate. Their blank native implementation, Not Assessed/Not verified status, Unassigned owner and Never date remained unchanged after refresh. Later conditional groups require Save & next and were **not executed** on these read-only showcases; existing isolated6a4 condition/save evidence remains separate. BrawndoIG1/1.1 opens its approved inventory guide and retains the saved synthetic answers/notes and visible completed history. Its existing saved-assessment reconciliation warning was preserved: Compare & continue and later groups were **not activated**. Native blank text/Not Assessed/Not verified stayed unchanged after refresh. Current artwork/window/control/native-layout observations support visible reference preservation; no new exhaustive visual, animation or pointer pass is claimed. The original339 baseline placements remain revision-attributed; they are not relabeled as339 new correction-deployment checks.

Render's Live source link and checkout log identify the full tested6a4 revision. Startup completed and the available log showed the service Live without an unresolved release-related startup error. The reloaded application served `main.76d23b98.js` / `main.fe2057c8.css`, matching Render's Linux build output. The Windows staging JS filename differs; no byte-identical Windows/Linux JS claim is made. A documentation-only evidence commit is not another runtime release.

## Preservation, future defaults and access

Original revision-attributed tests establish group onboarding/defaults, direct IG3 creation, adding CIS to mixed ISO/CIS, inherited native/history preservation on supported upgrades, client switching and exact per-record restoration. They remain valid baseline evidence; fixture names are not used as proof of their current group. Current source review preserves those handlers and all non-CIS trees. Approved Login responsive controls, actual sign-in/logout/return, absence of authenticated overlays and Demo isolation remain unchanged baseline hosted evidence.

Actual restricted-user write denial and unauthorized-client access/write denial are **blocked**, not passed. Fresh normal Administration UI shows `bec984b1-client_contributor-verified@example.com` **Disabled / Client Contributor / zero memberships**. No suitable active restricted identity is available. The authorized SuperAdmin session cannot supply that proof.

[restricted-identity-test-proposal.json](workflow/restricted-identity-test-proposal.json) supersedes the older handoff's broader owner-assignment proposal. It identifies the exact account, minimum temporary Reader role, only the isolated QAIG2 membership, normal credential entry when the owner returns, specific server-denial scenarios and restoration to **Contributor / zero memberships / Disabled**. Attempted stale-form server-write proof would require a separately approved temporary Manager-to-Reader transition; no record owner change is proposed. No such access change or credential request was made while the user is away.

`OmniBot QA — CIS IG2` remains active, configured for IG2, for the pending restricted tests. Normal browser operation recovered using the existing authorized session and supported controls; a stale/missing tab was replaced once in the same browser, responsive navigation was opened normally, and one failed launcher click was followed by a fresh screenshot/DOM inspection and successful normal Enter activation. No credentials, forced input, direct API, security changes or application changes were used. No current browser blocker remains for this checkpoint. The earlier raw input-error capture remains historical evidence.

The exact completed **OmniBot QA — Closeout CIS IG3**, `cli_9846e21d942436eca2be79c365f2c52d154a41b97608ba302b5fc65fa7cc9ca7`, was already archived when this checkpoint inspected it. Refresh confirms it is absent from active clients and present as Archived under Include archived. The normal audit event records **Archive / success**, active → archived, **10/10/2026 12:53:36 PM**, with the same identity; 39 retained events include its prior assessment activity. Restore client is offered through the normal row menu and was **not executed**. No new Archive, Restore or history deletion was performed in this checkpoint. The previously unconfirmed Archive is now confirmed; no alternate mutation mechanism was used. [Archive proof](hosted/targeted-closeout-20261010/qa-ig3-archive-event.txt) and the refreshed portfolio capture retain the result. Brawndo, Initech, Hooli and unrelated clients remain present.

Unexecuted or bounded checks remain explicit: restricted identity/server denial, MFA challenge not presented, recovery delivery without an authorized mailbox, physical device/pointer/reduced-motion behavior, arbitrary hosted network500 injection, every conditional branch on every hosted safeguard, and exhaustive hosted negative lifecycles per design. Source, local mocks, CI and hosted observations are separate layers.

## Final disposition and recovery

The [independent targeted checkpoint review](independent/independent-targeted-closeout-20261010.md) passed **7/7** narrow documentary checks. It verified the manifested working documentation relative to base `a10114df486fea16fa1393f94fc4e5aacd60dbd0`, all 183 reviewed artifact hashes and 35 JSON files, CI130 metadata, three bounded guide observations and exact archive evidence. The reviewed manifest is preserved separately; publication adds this report and documentary attribution, not runtime changes or another hosted replay.

Independent code/content review and hosted evidence consistency checks passed; **final acceptance is blocked** by actual restricted-identity authorization tests. Current release state remains **Deployed for validation — final acceptance pending**. Browser recovery, the three supported read-only guide/context/native-preservation checks and reversible IG3 archive confirmation are complete. The deeper showcase questions/reconciliation remain explicitly unexecuted under the read-only boundary; no additional review or save is authorized by this checkpoint. Once the owner returns, the specific temporary-access proposal and direct normal-browser credential entry require a decision; no general authorization loop is needed.

After program4 interviews are written, an older b90 writer cannot be assumed to read them safely. Prefer a tested forward correction retaining program3/program4 readers and stable history/native data. Do not use an automatic rollback to an older writer, reset/reseed data or erase newly written history. Main, production, Sites, settings and security controls remain untouched.
