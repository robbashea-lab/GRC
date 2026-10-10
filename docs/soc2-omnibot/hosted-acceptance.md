# SOC Omni coordinated hosted acceptance

Prepared 2026-10-10 for Agent 1, the sole Render deployment/shared authenticated-browser owner. This is an execution plan, **not executed hosted evidence**. Do not repeat the completed source, content or local campaigns to substitute for these cases.

**Current update:** Agent 1 reported b384 validation deployment
`dep-db5blmflk1mc739e7frg` and two positive A1.1/CC1.1 hosted paths. SOC-B02
was then reproduced on a real local database and narrowly corrected; affected
hosted writes must be rerun on the corrected candidate after exact CI. No
Agent 2 session/deployment slot transferred. Prestige is absent from the actual
hosted directory: H02 remains unavailable, not permission to create/rename it.
H23 now has bounded real process/deadline evidence in
[mongo-lease-validation.md](mongo-lease-validation.md), not a universal fencing
or hosted-authentication pass. H20/H21 restricted identities remain unavailable.

## Candidate and ownership

- PR #66 remains draft/unmerged, stacked on PR #65 base `a527d4e79bfab36629b0a0b71eb10c6c018d00bb`.
- Frozen runtime: `b384b28d121a698f162cf4701a25e5158fed8da9`; [CI #133](https://github.com/robbashea-lab/GRC/actions/runs/38082617286) passed on this exact SHA. Subsequent documentation commits do not change application files.
- Target: existing `https://omnisciente-staging.onrender.com`, service `srv-db1s0cugekts73f72reg`. No main merge, Sites publication, production, provider settings, account/role/membership/owner changes or database reset.
- Agent 2 has no transferred staging/browser/account/fixture slot. Agent 1 may execute the coordinated cases itself or explicitly reserve a bounded slot. Do not use its CIS fixtures or disabled restricted identity.
- Before deployment, Agent 1 must read actual live source, current pending deployments and the current approved composite. Older deployment references in `validation.md` are historical, not a current live-source claim.
- On resume, Agent 1 reported its Render browser connection had recovered. That resolves the earlier empty-inventory report; it does not transfer ownership or establish a deployment/hosted pass.

## Deployment prerequisites and data compatibility

No new configuration variables, services, package changes, seeds or destructive schema migration are required. The SOC-specific `soc_guided_locks` collection is lazy/additive in the existing database. Existing tenant authorization still precedes lease acquisition. The correction bounds driver work to 80 seconds inside the existing 90-second coroutine timeout and 120-second lease; uncertain outcomes retain the lease until expiry. This is not a cross-document transaction guarantee.

Retain every CIS question version and reader/writer inherited from PR #65, plus `soc2-omni-1`, SOC `summary_review` answer/version metadata, native `guided_assessment_source` and both interview/native histories. A narrative-only legacy record must not acquire fabricated answers. An older interview without reviewed-answer metadata must require explicit wording review rather than erase or silently approve it.

There is no prior hosted SOC recovery target yet. After SOC writes, prefer a tested compatible forward correction. Do not use older main/Login-only/CIS-only code as a blind rollback or reset/reseed records. A proposed recovery revision must first demonstrate that it preserves all stored current/historical CIS and SOC versions. Capture actual prior deployment/source before publication without treating it as data-compatible after new SOC writes.

## Evidence record

For every case record: actual source SHA and served assets, deployment ID, browser/session role, authoritative synthetic client and assessment IDs, criterion/category, sanitized before/after implementation/status/verification/checklist/history references, observed result, and pass/fail/not executed. Never capture credentials, cookies, tokens, or unnecessary client content.

Normal UI route: `/compliance/soc-2`. A native deep link uses the actual saved `framework_assessment_id`: `/compliance/soc-2?assessment=<id>`. The optional `guided=pilot` query opens the guide; it is not authorization. Discover IDs through normal authorized records, not guessed foreign IDs.

Existing API contracts for a permitted direct-request test interface:

- `GET /api/frameworks/soc-2?client_id=<authorized client>`: configured categories, active criterion IDs, native rows, current user's interview summaries.
- `GET /api/framework_assessments/<id>/guided-assessment` and `/history`: authorized current interview/history.
- `PUT /api/framework_assessments/<id>/guided-assessment`: progress, expected revision, question version, lineage and reviewed answer basis; does not apply native readiness.
- `PATCH /api/framework_assessments/<id>`: explicit reviewed implementation/readiness/source and native optimistic-concurrency token. Guided saves cannot change verification, checklist, Control or unrelated fields.

Use the existing supported authenticated test interface, if available. These are prepared contracts, not commands run against staging. Do not extract browser cookies, synthesize authentication, weaken origin/TLS controls or add an API bypass to execute them.

## Read-only checks using the current authorized administrator

| ID | Execute | Expected result |
| --- | --- | --- |
| H01 | Verify actual provider source/deployment; reload staging; inspect fresh observed JS/CSS assets and normal authenticated app | Approved SOC/CIS composite, not Demo or an older retained bundle; no unexpected console/server error |
| H02 | Open Prestige Programs → SOC 2; inspect configured scope without changing it; open every configured criterion and corresponding guide without answering/saving | Correct actual client/criterion/title, tailored groups and existing native hierarchy; active counts match configured categories, no new category enabled or native text/status/history change |
| H03 | Open existing authorized non-Prestige SOC clients read-only; then CIS/ISO and public Login | Configuration-based SOC entry without reseeding; no SOC question/summary/context leaks into CIS/ISO; approved CIS historical readers, Login and shared visuals retained |

Administrator placement evidence does not prove Reader restrictions or cross-client isolation.

## Synthetic fixture workflow using the current authorized administrator

Create only two clearly labelled **Agent 2 SOC staging QA** clients through normal authorized creation/configuration after Agent 1 reserves the execution window. Record real IDs. Do not copy Prestige/Demo content, invent personnel/evidence/operating history, create accounts or modify existing memberships/owners. These checks write only synthetic fixture records.

| ID | Execute | Expected result |
| --- | --- | --- |
| H04 | Fixture A: create a new SOC-only client through onboarding; leave unknown policy information honestly unknown and ownership/dates unset where allowed | Default 33 Common/Security criteria, unassessed interviews/native states; one launcher and normal mapped Reviews, no fabricated assurance or operating period |
| H05 | Explicitly select supported optional categories on A; verify 33 Security + 3 Availability + 2 Confidentiality + 5 Processing Integrity + 18 Privacy = 61 | Tailored interviews for every active criterion; excluded categories absent from active counts/recommendations; repeated activation creates no duplicate criterion/assessment/launcher |
| H06 | For each of all 61 on A, complete a clearly synthetic adequate-practice scenario, save each group, review summary, explicitly save native assessment, reload and resume | Correct source-specific questions; direct summary after final group; exact reviewed multiline text and proposed native status persist; question saves alone leave native fields unchanged |
| H07 | Fixture B: create a normal CIS-only client, save a labelled synthetic manual narrative, then add SOC through Program Configuration | Same default 33-criterion SOC experience; CIS narrative/status/history/relationships preserved; no client-specific enablement edit |
| H08 | On A narrow categories to Security, restore optional categories; on B retire/reactivate SOC with the normal reason/confirmation | Excluded categories inactive, retained interview/native history visible after reactivation; 33/61 counts correct, no duplicated records or reset of other programs |
| H09 | CC1.1 No, mixed Partially, all Not sure and adequate alternatives described through existing questions; optional name/note variations | SOC-native confirmed-remediation/partial/unassessed/reported-readiness reasons; optional prose alone does not downgrade; no audit/verification conclusion or automatic Finding/Action |
| H10 | P6.1 Relevant/Outside/Not sure; explain Outside; inspect conditional questions and retained historical answers; use the source matrix's Privacy trigger cases | Inactive questions skipped and excluded from current result, not deleted; missing required context explanation blocked; no automatic whole-criterion N/A or assurance from outsourcing/no event |
| H11 | Save incomplete progress; minimize/close; navigate away/return; refresh; resume | Server-held exact answers, current group and summary wording retained separately from native assessment; local UI preferences are not represented as backend interview persistence |
| H12 | Edit the one multiline summary; Save assessment/Update assessment and Save & close; cancel an existing-text replacement | Exact reviewed text/status; actual fixture and criterion in confirmation; cancellation leaves native values intact; close only after native success; no second external save |
| H13 | Change answers after manual summary editing; save progress and remount twice; review/retain wording or explicitly refresh from answers | Manual wording retained; stale conclusions cannot silently apply; reviewed-answer basis survives remount; explicit regeneration required before replacement |
| H14 | Make a native text draft and separately an unfinished Finding/Review/comment/Control draft; attempt guided native save/navigation; cancel close | Native/related drafts block native summary application/unsafe navigation, not progress saves; cancellation preserves drafts; saved verification/checklists/Controls/Reviews/Evidence/Findings/Actions unchanged |
| H15 | Two permitted views of the same fixture; change native assessment or interview in one; attempt stale application in the other; repeat submit rapidly | Conflict/review path, no silent last-writer overwrite or duplicate native assessment event; reload/cancel retains unsaved wording until explicitly discarded |
| H16 | Observe a controlled save failure only through an existing supported browser/test facility; retry after restoring normal connectivity | No false success/navigation, exact draft retained, no native conclusion after failed save; safe recheck/retry rather than infinite retry. Do not stop shared services or alter security/provider settings to force failure |
| H17 | Begin a new review and explicitly save a revision; inspect interview history and native assessment history; manually edit the native text later | Earlier answers/write-ups/source attribution retained; changed native baseline requires explicit comparison; no inference of new interview answers from legacy text or checklist selections |
| H18 | Owner coordinates the exclusive sign-out/sign-in window; human enters credentials/MFA normally; reopen A/B | Same server-held answers, exact native text/status and history. Logout may revoke the administrator's other sessions: never do this while another agent uses them |
| H19 | 1440/1024/768, light/dark, keyboard focus/Escape, shared launcher movement/resize/minimize and physical pointer drag if supported | Approved shared interaction/geometry retained, no clipping or broken controls; report unsupported pointer/device actions as not executed |

Every design receives a positive hosted path; targeted negative/conditional/lifecycle coverage is not every answer permutation. Unsupported controlled-failure/pointer/logout execution stays open rather than becomes a mock-based pass.

## Restricted identities and process-level cases

| ID | Required resource and execute | Expected result / boundary |
| --- | --- | --- |
| H20 | Existing authorized Reader of fixture SOC scope: native/guide read, PUT progress, PATCH native, attempts via direct routes and permitted request interface | Reads only within entitlement; writes rejected (existing contract 403); no mutation/history. Do not create/enable/promote an identity to obtain this session |
| H21 | Existing authorized identity lacking the fixture client: SOC workspace, guide/history, progress/native requests against known fixture IDs; a genuinely unauthenticated context separately | Wrong-client forbidden (403); unauthenticated requests rejected (401/403); no leaked records or writes. Browser login redirects alone do not prove rejected API writes |
| H22 | In a fixture's approved direct-request interface, tamper framework/criterion/category, result status, unrelated native fields, version/revision/lineage and reviewed-answer basis | Disabled category/program 404; unsupported/invalid data 409/422; foreign/ineligible records denied by normal auth. Existing tests document these responses; do not modify global permissions |
| H23 | Separately controlled real-Mongo multiworker harness with approved process/fault controls: concurrent interview/native operations, lease expiry/stall/cancel/clock boundary and recovery | Expiring holder cannot release successor; no stale native result or silent data loss. ASGI/mongomock interleaving and general CI Mongo tests do not establish this proof |

H20/H21 require authorized restricted sessions not currently handed to Agent 2. H23 requires controlled process-level access not available through normal administrator UI. Neither requirement justifies new accounts, changes to authentication, shared service restarts or broader infrastructure provisioning. Leave cases not executed until the precise resource is available.

## Closeout

Retain sanitized actual results and history references. Reversibly archive **only** the two completed Agent 2 fixtures through normal Client Management after acceptance; confirm Restore is available and record IDs. No hard deletion, reseed, shared-fixture cleanup or user changes. Leave required unresolved cases open in draft PR #66 and distinguish root-owned CIS gates from SOC gates. A staging validation deployment is not final combined acceptance or production readiness.
