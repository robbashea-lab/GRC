# Brawndo Security Domains pilot disable and rollback

This is an **application rollback, not a database rollback**. It must preserve all assessment records, answers, drafts, history, evidence, findings, authentication, permissions, Omnibot behavior, and unrelated approved work. The sole integration/deployment owner executes it. Pre-binding generic fixture-support disable/restoration PASS is recorded below. Adding the one actual hosted fixture changes config: its new full qualification/builds/exact CI and complete hosted rollback remain **NOT TESTED**.

## Completed local disable qualification

The owner completed a durable qualification of earlier source `864cd9458e7bed4d8d4c4c2a9d35fe41f9baff04` with the actual `shared/catalogs/brawndoSecurityDomainsPilot.json` flag set to `false`: **11 suites / 352 tests PASS**, exit 0, 190.822 seconds. Receipt `pilot-disable-durable-receipt.json` records start `2026-10-14T21:37:00.143030+00:00` and completion `2026-10-14T21:40:16.871206+00:00`. The test process exited successfully and restored its original JSON bytes exactly, with matching before/after SHA-256 **`43df4c005bb46af4cf06bbf0ff10eafdca23bc08f905ca429498f5ce89668d24`**. That historical run did not disable staging or qualify the later generic fixture-support source.

The earlier exec-session attempt was interrupted after partial output from three suites and is **not PASS**. Application source remains unchanged by qualification; the two test fixes separate enabled-feature behavior from the rollout configuration. The local server was restored ready at 21:42 UTC. These results qualify the local gate-off behavior and restoration, not a disable commit's required Node 22 CI, staging deployment, provider-source equality, hosted record preservation, or a full hosted rollback. Those steps below remain required when executing a release rollback.

The completed **pre-binding** flag-off qualification is **PASS: 420/420 tests across 11 suites**, exit 0, Jest **71.862 seconds** / Yarn **73.52 seconds**, finished **`2026-10-14T22:15:17.101811+00:00`**. Evidence: `pilot-fixture-disable-receipt.json` and `pilot-fixture-disable-tests.log`. It restored prior canonical-only bytes exactly, SHA-256 **`43df4c005bb46af4cf06bbf0ff10eafdca23bc08f905ca429498f5ce89668d24`**. That hash/PASS predates the actual fixture entry and is not the new config's restoration or full test result. New binding helper **37/37 PASS** and review PASS; combined 421 tests, both builds and exact-head CI await the next commit.

The prior failed attempt is preserved in `pilot-fixture-disable-first-failed-receipt.json` and `pilot-fixture-disable-first-failed-tests.log`: exit 1 at `22:09:50.423054 UTC`, 361/364 tests passed, three timeouts in the native suite (90-second monolith; default five-second 1.1/1.2 cases). Its config restoration also passed. Independent review closed the isolation finding: all 56 entry-route cases mount independently under the default five-second budget, retaining exact coverage, all assertions and the throwing stale-write guard. No budgets were increased, no assertions weakened, and no tests skipped. The individual native suite passed **81/81** in 57.645 seconds before the successful combined qualification.

Earlier 36-helper/25-component checks and both current generic application builds remain separate proof layers; overlapping runs are not cumulative unique-test counts. Application source remains unchanged since the passing builds (`main.ddbafaaa.js` for authenticated/browser QA). The historical failure is not erased, and the completed local qualification is not a hosted rollback or final exact-candidate Node 22 CI.

## Current fixture and provider state

The approved native fixture now exists: `Synthetic Brawndo Security Domains Pilot QA 20261014`, client **`cli_525eaf424ce93b8803867404f7adae6b1076b5a9289f9dca94925091845d06e8`**, one CIS v8.1 IG1 program, 15 controls/56 Not assessed safeguards. Receipt: `pilot-native-qa/browser-agent2-20261014/hosted-synthetic-fixture-creation-receipt.json`, 22:30:32.184 UTC. Native 1.1 is `fw_abb7031cec5b51919ad2176fc24e2a1e`, 1.2 `fw_ada1a4a789035ceba7bd70c4ef9aee57`. Onboarding added 17 Unsure Policies and 12 unassigned/unscheduled Review templates; active portfolio 22/27 -> 23/28, all clients 27 -> 28. No assessment/Omnibot saves, copied real data, Contacts, accounts/grants or Tab 5 actions. Campaign and recoverable archival retaining synthetic history are approved and pending; the prior dispatch block is resolved.

The enabled JSON retains canonical Brawndo `clientId`/key/version/group and binds **only this one actual ID** in `fixtureClientIds`; all other/default activations remain off. Do not remove/mutate either identity while disabling. The expected fixture position program ID is `cli_525eaf424ce93b8803867404f7adae6b1076b5a9289f9dca94925091845d06e8:cis-ig1`, inferred from unchanged `backend/portfolio_progress.py:111`, not literal UI proof. Require an available gated native response after deployment. No real records, held Tab 5, permissions, `main`, production or broader rollout are included.

The earlier 502s and free-service build/deploy pause are historical. `pilot-render-incident-resolved-receipt.json` records official resolution at **22:18:11.999 UTC**; staging was healthy at **22:24:53 UTC**. No service cause for earlier 502s was proven. Provider source/deployment were verified **22:25:39.311 UTC**, before creation, as prior `863e391280da6606e7e2972bfe1367d877dd757b` / `dep-db7rhs1srm7s7391n1dg`. The incident is not a current hold, but refresh provider state before release. No new hosting, paid service, credential or security-setting change is part of recovery.

Draft [PR #82](https://github.com/robbashea-lab/GRC/pull/82) remains the pilot review record. Old #174 is diagnostic; [CI #175](https://github.com/robbashea-lab/GRC/actions/runs/38647137902) on `51f6a858495cd734bbf11a14350f6e145b6d099c` is reported active with Mongo PASS. Neither qualifies the new actual-fixture config. `pilot-fixture-support-build-receipt.json` records both **pre-binding** local builds PASS; new exact config requires tests/builds/CI after the new commit. Actual mobile rendering remains unverified (`pilot-mobile-gate-decision.json`, parent-chat-only decision); no sequencing waiver or verified Live claim exists.

## Prior working staging release

Agent 2 verified these values at **2026-10-14 20:38:29.932 UTC**:

| Field | Value |
| --- | --- |
| Existing staging service | `srv-db1s0cugekts73f72reg` |
| URL | <https://omnisciente-staging.onrender.com> |
| Successful/live deployment | `dep-db7rhs1srm7s7391n1dg` |
| Runtime source | `863e391280da6606e7e2972bfe1367d877dd757b` |
| Service source configuration | `main`; Auto Deploy disabled; deploy a specific commit |
| Baseline required CI | [Release verification #173](https://github.com/robbashea-lab/GRC/actions/runs/38598158538), green on the runtime SHA |
| Later docs-only starting head | `b12e50718048d47704e944ab7e0d11b761c5b40d`; not the deployed runtime |

Before execution, read the provider again and record its current full source SHA/deployment ID. A later approved deployment can supersede this historical fallback. Do not overwrite it with an older branch merely to hide the pilot.

## Preferred: disable only the pilot gate

1. Use an isolated checkout based on the **current approved deployed source**, retaining any approved successors. Preserve other worktrees and all user changes. Record the current SHA and release receipt. Do not reset, force-push, or revert unrelated commits.
2. At that checkout's repository root, run this bounded PowerShell edit. It checks the canonical pilot identity and changes only the existing JSON `enabled` value:

```powershell
$pilotPath = Join-Path (Get-Location) 'shared/catalogs/brawndoSecurityDomainsPilot.json'
$pilotText = [System.IO.File]::ReadAllText($pilotPath)
$pilotConfig = $pilotText | ConvertFrom-Json
if ($pilotConfig.clientId -ne 'cli_60dee41ebbcd0e39b8bff87da17aee838ac50ecd799cb955f99d921eb6be4b20' -or
    $pilotConfig.frameworkKey -ne 'cis-ig1' -or $pilotConfig.frameworkVersion -ne '8.1' -or
    $pilotConfig.implementationGroup -ne 1) { throw 'Unexpected pilot identity; stop.' }
if ($pilotConfig.enabled -ne $true) { throw 'Pilot is already disabled or changed; inspect before proceeding.' }
$enabledPattern = '("enabled"\s*:\s*)true'
if ([regex]::Matches($pilotText, $enabledPattern).Count -ne 1) { throw 'Expected exactly one enabled flag; stop.' }
$disabledText = [regex]::Replace($pilotText, $enabledPattern, '${1}false')
[System.IO.File]::WriteAllText($pilotPath, $disabledText, [System.Text.UTF8Encoding]::new($false))
git diff -- shared/catalogs/brawndoSecurityDomainsPilot.json
```

3. Review that the diff changes **only `enabled: true` to `enabled: false`**. All canonical identifiers, mapping, native records, and unrelated source must remain intact. If it differs, stop and inspect the checkout; do not undo someone else's work.
4. Run the candidate's required checks/builds and independent review. Use `.github/workflows/release-verification.yml` as authority. The frontend commands below reproduce its tests and both builds; stop on failure:

```powershell
$env:CI = 'true'
yarn --cwd frontend test --watchAll=false --runInBand
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
node frontend/scripts/staging.cjs
if ($LASTEXITCODE -ne 0) { throw 'Authenticated staging build failed.' }
yarn --cwd frontend build:preview
if ($LASTEXITCODE -ne 0) { throw 'Isolated preview build failed.' }
```

The workflow must also pass **backend**, **backend-mongo** (disposable persistence/recovery/authorization), and **Release gate** for the exact disable commit. Do not run those persistence campaigns against staging data or substitute old green CI.

5. Commit only the reviewed gate change on the isolated disable branch, push it, and open/update its draft PR through the authorized repository flow. Record its full SHA. Do not merge `main` as part of this pilot. Wait for the exact commit's required CI to finish successfully; obtain a meaningful native check that the domain addition is absent and Controls/Omnibot still behave normally.
6. In the **existing authorized Render staging service** above, use **Manual Deploy -> Deploy a specific commit** with the full tested disable SHA. Preserve Auto Deploy, source settings, environment, credentials, security controls, and service configuration. Do not create a service or deploy production/Sites.
7. Record the deployment ID/status and provider-reported source. Require successful deployment and **provider source = tested disable SHA**. Freshly reload staging and verify Brawndo's domain section is absent, native Assessment Progress/Controls/editor/Omnibot remain available, other clients/programs retain their experience, and protected data/drafts/history are unchanged. Record the result; a successful provider deploy alone is insufficient.

The disable affects presentation only. Do not reset, seed, import, migrate, or restore assessment data. Clean up only activity created by an owned synthetic fixture through existing recoverable procedures.

## Fallback: deploy the prior working application

If the scoped disable cannot be built or verified, first determine whether reverting the application would discard any unrelated approved work. Prefer a new corrective commit retaining that work. Only when safe for the actual current release, the sole owner may use the existing staging service's specific-commit deployment to restore **`863e391280da6606e7e2972bfe1367d877dd757b`**, whose prior live deployment is **`dep-db7rhs1srm7s7391n1dg`**. Refresh provider state and CI applicability first; never assume this historical fallback remains the latest approved baseline.

Apply the same provider-source equality, native/Omnibot/isolation, and preservation verification as above. Record why a full application rollback was needed and any unrelated changes it would affect before executing it. There is no database restore, record-value reversal, credential change, or permission expansion in either procedure.

## Completion receipt

Record the reason, owner, prior/full disable or fallback SHA, branch/PR, exact CI, deployment ID, provider source/status, hosted checks, preserved records and fixture cleanup, remaining failures, and UTC time. State deployment recovery separately from Robb's acceptance. A rollback must not turn unverified pilot checks into PASS.
