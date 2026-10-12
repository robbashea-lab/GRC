# Coordinator release and hosted evidence

The [readiness report](readiness-report.md) is the consolidated product verdict. Its evidence cutoff was root8c31535; this supplement records later work. Final CI/provider receipts belong in this PR discussion and shared PR57, without a documentation-only redeployment. Prior baseline28b remains **Deployed for validation — final acceptance pending**. The new correction's exact CI/deployment/affected-hosted gates are pending at this document's cutoff and must be established by later receipts.

## Source and verification

Baseline main28b806716024ec149af2ec5da621a5a618c669d5 contains the combined Login/CIS/SOC/ISO/security work. One runtime correction PFA-001, authorafe78ad, is root-integrated at9494c8f1c352e300e5a3d44bf450d14a7faeace9; raw runtimeSHA256d78b8337ba14428501d177e76d23627cb6c846fd95a1c4622ed0f50347501df8. The final branch retains this exact product source.

Author1070 focused checks passed. Independent13/13 rendered integration cases passed20.265s on the exact runtime, reviewer2063e65 integratede4500c0; [independent record](cis-native-guide-refresh-independent-review.md). Root reviewed the complete runtime hunk and all QA integrations. No version/IDs/native payload/history/evaluator/source criteria/security or saved-review lineage changed.

Both local optimized builds succeeded on product9494c8f, before documentation-only integration: `CI=true node frontend/scripts/staging.cjs` → authmain.22eb21b3.js/CSSmain.4c1f739f.css; `CI=true node frontend/scripts/preview.cjs build` → Demomain.c9324c1f.js/CSSmain.974fe30a.css. Existing dependency tree reused read-only through a new isolated-worktree junction, Node24.19.0; no install/lock/dependency change. Existing bundle-size notice/NodeF_OK deprecation retained. The frozen branch's full suites/bothbuilds must also pass normal exact-candidate CI before deployment; baselineCI142 does not substitute.

[Candidate source freeze](freeze-candidate.json) compared430 non-test production/interface/catalog assets at28b versusedf2946: onlyGuidedAssessor.jsx changed, with its existing guarded first-write controlflow. Visible/accessibility tokens, conservative strings, JSX/layout/style/assets/catalogs unchanged. Root manual diff confirms no presentation/static-copy/question/meaning change. Parser limits are in the artifact; no whole-accessibility or whole-browser pixel-proof claim. Matching protectedBrawndo/Prestige and affectedGuide screenshots will supplement source proof after controlled deployment.

Ordinary `git diff --check` reports whitespace only in preserved original logs (raw-pytest.log plus build-log terminal blank lines); excluding immutable *.log receipts passes. The original bytes/hash remain intact, not reformatted to hide provenance.

## Later hosted administrator scenarios

[The exact hosted ledger](hosted-workflow-ledger.json) pins every original result to Live28b, not to the future corrected runtime. Six Omni native assessment records received seven explicit complete summary saves; one separate ISO SoA inclusion save. The additional derivative received two clearly synthetic manual native markers and progress-only saves. Those are not extra completed Omni assessments or all500 browser saves.

Scope derivative `cli_4e11466f42abf6827b025df85ddbb3ca352e270bc059052a14627600d6ba38cf` retained CIS1.1 `fw_9b96c56543c757ffba189a4b73530f13`, exact manual text and interview uncertainty through56→130→153. It added SOC33 and ISO123 through normal configuration. SOC expanded61, retired/re-activated at61 with the same `fw_005757e3d3a6525a86a69fa1fcea80d0` and exact manual text/NotAssessed/unverified, then deselected to33. CurrentReviews25 after mixed additions; retirement reused rather than deleted history. None of the five primary clients changed group/category scope.

ISO primary Risk acceptance retained3×4=12High and brought forward review; Policy synthetic version/upload stayedunverified/unapproved; ordinary Vendor Review completed2026-10-12UTC against2026-10-11due and preserved2027-10-11annualanchor. Historical occurrence became read-only, source dates refreshed, missing assurance stayedmissing. Two real UI System editors rejected the stale save and retained the winner/draft; sameAdmin is not two distinct authorized actors. Contact-only synthetic .test record stayedNoaccess and received no invite/account.

SOC Finding/Action completion stayedPendingvalidation until explicit Admin validation; reopening created newOpenAction and retained completedAction/Evidence/history. A quarterly Review was started and linked existing syntheticEvidence. Originaltab5 stalled at `Unlink this supporting Evidence?`; noAccept issued. User unavailable explicitly leaves this check pending. Original file download has no receipt after supported wait timedout; these are tooling/unexecuted dispositions, not confirmed application defects. Do not retry via alternate tools or let UI failure weaken server guards.

## Retained evidence and cleanup

[Evidence manifest](evidence-manifest.json) and [original QA archive](retained-evidence/original-qa-evidence.zip) preserve bytes/hashes for original real-Mongo failures/successes, annual ledgers, service tests, independent selected reruns, and initial hosted receipts. Source-attributed scope and limitations remain attached. Hosted screenshots/DOM are synthetic approvedAdmin evidence; no secrets extracted.

Five primary QA clients remainactive for role/login checks; Scope derivative remainsactive for PFA001 retest. Earlier pending/archived fixtures and allhistory preserved. Prestige permanent38 remainsNotAssessed and received no syntheticwrite/archive. No account, role, membership, all_clients, owner, password, auth setting or live mail change.

OwnedlocalMongo8.0.28 uses new127.0.0.1:58749/PID24028/data only. Eleven known author/root test databases independently read back empty after scoped cleanup; failure prototypes/logs retained. Coordinator validated executable, owned data path and loopback listener, stopped onlyPID24028 after all tests, then independently confirmed process/listener absent. An immediate Windows listener read was stale and retained as a bounded check failure; the subsequent read confirmed closure. Newlogs/data and oldPR24 package retained.

## Outstanding human and facility gates

Actual administrator logout/login remainsblocked: user notready, signed-in session preserved. Actual restrictedUser remainsDisabled/ClientContributor/zero memberships. Existing CIS and SOC Reader approvals name older targets; they do not authorize the five newfixtures orISO. No transition or activation occurs until specific ready window, originalstate/token capture and supported authenticated request capability exist. No Manager approval inferred.

Current IAB lacks supported authenticated request editing/capture; realserver-denial/tampering/fault/multiworker cases remainopen. Local modeled actor/realMotor evidence cannot be relabeled hosted proof. The previously safety-blocked13-methodauth/recovery campaign remains0 and is not retried/rerouted. Normal established release CI is distinct. ISO111normative-source comparisons, eligible independent auditors/Policy approvers, unaided realclient usability and report-only absentcapabilities remainunwaived.

Recovery: preserve current compatible CIS/SOC/ISO readers/writers/history. Prefer an independently tested forwardfix. Never reset data or deploy older main/standalone branches that discard already integrated work. No mainmerge/production/Sites/providerconfiguration changes.

Final independent source review identified conflicting release tense and a QA-only assertion diagnostic that could echo a refused credential-bearing URI. Status is now pinned to priorLive28b; new gates remainpending until actual PR receipts. The diagnostic uses the same exact-origin whitelist with a constant ValueError; three synthetic invalid inputs rejected without echo and the allowed origin accepted via AST-only execution. No DB/module import/auth/request was performed. Original scale source/receipts remain attributed to the earlier frozen test; no broad real-Mongo rerun was needed for this guard-only change. See fixture-guard-diagnostic.json.
