# Dashboard PR38 hosted authenticated acceptance

October 5, 2026. Existing Render staging only; existing administrator privately signed in by the owner. No accounts, password resets, credential sharing, provider settings, plans or customer-record edits.

## Actual served source

Before testing, Render reported Live deployment `dep-db1ujr67bikc73bp7hk0` from `0e5965a78fc47bc40f7d1e1d7faa21e3d373c35f`, newer than reported PR38 merge `d2468ed13242ee4c6fbab047e7eb5fa2a38c8f4a`. That exact source was fetched. Served JavaScript `/static/js/main.37310f53.js` SHA256: `fda402af826427606eb67e617489fe3f647c1ec4c2708dd513fcb7ea046e0120`; CSS `/static/css/main.098381cb.css` SHA256: `07bb533d7502bf4465488700e81eed03c651ce47511892fe395b44cc7de85344`. These differ from the earlier dashboard build. Provider provenance identifies the deployed source; no independent backend revision endpoint is claimed.

## Hosted results on that source

- Owner's normal sign-in produced the authenticated Staging Administrator workspace. Normal reload retained authentication during the persistent-save check.
- Created only two clearly labelled SYNTHETIC PR38 Actions in the existing fictional multi-framework client. The date-fill automation initially changed DOM values without React change events; native date-edit keys and the regular Save action persisted the dates. Validation was preserved.
- Past Due tile returned the one synthetic October4 Action; Due in30Days returned the one October15 Action. All Open returned24 records, and Unassigned returned24 records with24 Unassigned owner cells. A concurrently created PR36 synthetic Action subsequently increased both totals to25; live data changes are not fixed-fixture failures.
- Seven unique status/attention destinations per framework matched displayed counts. CIS IG3: Implemented0, Partial1, Not Implemented0, Not Assessed152, Gaps without a Finding1, stale0, unevidenced0. ISO:0/1/0/122/1/0/0 across clauses and Annex A. SOC2:0/1/0/32/1/0/0. Duplicate Not Implemented attention/status links share the same verified destination.
- Manual Action summary showed saved type/status/origin/created/due, with zero input/textarea/select elements. Source-linked PR36 synthetic Action summary showed its actual Finding and ISO7.1 origin, also with zero editable controls. Source navigation opened assessment `fw_0cad77a7540b53d2978887973a52bdeb`, titled ISMS resources, with the matching linked Action. No existing assessment was modified.
- Exact operational navigation opened synthetic Action `tsk_8a634f92a4fa`. Its title was saved as `SYNTHETIC PR38 hosted QA due-soon action — saved`, survived full reload, and appeared on the dashboard. Other synthetic Action: `tsk_6a9937c54223`. Both are retained, not deleted.
- Separate Demo tab used established fictional clients and allowed a browser-local Action title edit to `SYNTHETIC PR38 Demo-only isolation marker`. The final normal-session/backend comparison remains incomplete, as explained below; this is not an Atlas digest proof.
- Safe unauthenticated requests to `/api/tasks`, `/api/clients`, `/api/framework-assessments` returned401. This proves authentication rejection only. No existing restricted identity was available for this task's hosted cross-tenant checks; administrator-only browsing is not tenant-isolation evidence. Prior disposable local Mongo denial tests remain separate evidence.

## Session interruption and remaining acceptance

Render logs show a successful normal `POST /api/auth/logout` at **2:29:58 PM EDT**, before this task's reload received `/api/auth/me`401 at **2:31:04 PM EDT**. This task did not invoke that normal logout. The existing backend logout revokes all sessions for the account; another normal session's successful logout therefore invalidates this session. Do not attribute the interruption to Demo merely because its comparison was underway. A concurrent PR36 release used the same sole enabled administrator.

The existing normal login page is open for one private owner re-login. Still pending: uninterrupted Demo edit followed by normal save/record/session comparison, explicit normal logout UI/protected-route check, and applicable hosted restricted-identity boundaries. No new QA account or authentication bypass will be introduced. A later served source requires affected hosted checks to be repeated; no complete final-release acceptance is claimed here.

## Demonstrated correction

Hosted CIS IG3 heading and153-record scope were correct, but the full program subtitle retained IG1 from the stale baseline. `complianceProgress` now reuses existing `cisProgramName(program, recorded)` when applying the authoritative recorded implementation group, keeping name and label consistent. No count, scope, assessment, permission or session behavior changes.

Reconciled PR36 merge `92044402686d51c07e0bafc31f57999166a6996b` into the isolated correction branch without conflicts. On that combined revision plus the narrow correction:7 focused suites/39 tests/1 snapshot passed; both normal and Demo builds compiled. Independent review found no material defect. Actual disposable local authenticated browser verification showed correct IG2/IG3 full subtitles with130/153 denominators. These are local correction checks, not hosted deployment results. No correction deployment yet; preserve the active assessment release order.
