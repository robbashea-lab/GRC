# Brawndo Security Domains pilot disable and rollback

This is an **application rollback, not a database rollback**. It must preserve all assessment records, answers, drafts, history, evidence, findings, authentication, permissions, Omnibot behavior, and unrelated approved work. The sole integration/deployment owner executes it. Current generic fixture-support gate-disable **local qualification PASS** and exact config restoration **PASS** are recorded below. Complete exact-commit build/CI/deploy/hosted rollback execution remains **NOT TESTED**.

## Completed local disable qualification

The owner completed a durable qualification of earlier source `864cd9458e7bed4d8d4c4c2a9d35fe41f9baff04` with the actual `shared/catalogs/brawndoSecurityDomainsPilot.json` flag set to `false`: **11 suites / 352 tests PASS**, exit 0, 190.822 seconds. Receipt `pilot-disable-durable-receipt.json` records start `2026-10-14T21:37:00.143030+00:00` and completion `2026-10-14T21:40:16.871206+00:00`. The test process exited successfully and restored its original JSON bytes exactly, with matching before/after SHA-256 **`43df4c005bb46af4cf06bbf0ff10eafdca23bc08f905ca429498f5ce89668d24`**. That historical run did not disable staging or qualify the later generic fixture-support source.

The earlier exec-session attempt was interrupted after partial output from three suites and is **not PASS**. Application source remains unchanged by qualification; the two test fixes separate enabled-feature behavior from the rollout configuration. The local server was restored ready at 21:42 UTC. These results qualify the local gate-off behavior and restoration, not a disable commit's required Node 22 CI, staging deployment, provider-source equality, hosted record preservation, or a full hosted rollback. Those steps below remain required when executing a release rollback.

The completed actual-flag-off qualification of current optional exact fixture-allowlist helper/callsite source is **PASS: 420/420 tests across 11 suites**, exit 0, Jest **71.862 seconds** / Yarn **73.52 seconds**, finished **`2026-10-14T22:15:17.101811+00:00`**. Evidence: `pilot-fixture-disable-receipt.json` and `pilot-fixture-disable-tests.log`. Its runner restored the exact original JSON bytes; before/after SHA-256 **`43df4c005bb46af4cf06bbf0ff10eafdca23bc08f905ca429498f5ce89668d24`**, restoration **PASS**. Current JSON is enabled and canonical-only, with no actual hosted fixture ID.

The prior failed attempt is preserved in `pilot-fixture-disable-first-failed-receipt.json` and `pilot-fixture-disable-first-failed-tests.log`: exit 1 at `22:09:50.423054 UTC`, 361/364 tests passed, three timeouts in the native suite (90-second monolith; default five-second 1.1/1.2 cases). Its config restoration also passed. Independent review closed the isolation finding: all 56 entry-route cases mount independently under the default five-second budget, retaining exact coverage, all assertions and the throwing stale-write guard. No budgets were increased, no assertions weakened, and no tests skipped. The individual native suite passed **81/81** in 57.645 seconds before the successful combined qualification.

Earlier 36-helper/25-component checks and both current generic application builds remain separate proof layers; overlapping runs are not cumulative unique-test counts. Application source remains unchanged since the passing builds (`main.ddbafaaa.js` for authenticated/browser QA). The historical failure is not erased, and the completed local qualification is not a hosted rollback or final exact-candidate Node 22 CI.

## Current availability and execution hold

One synthetic hosted CIS v8.1 IG1 QA fixture, 1.1/1.2 native and Omnibot saves, and recoverable archival with synthetic audit/history retained are explicitly approved; preparation instructions were delivered. The historical automatic-review dispatch block is resolved. This does not authorize touching real Brawndo records, held Tab 5, copying real data, changing accounts/permissions, production, `main`, or broader rollout. No hosted fixture has been created because native hosted access is returning 502.

The owner recorded hosted 502s at 21:56:30, 21:58:26, and 22:04:59 UTC while provider source/deployment remain the prior `863e391280da6606e7e2972bfe1367d877dd757b` / `dep-db7rhs1srm7s7391n1dg`. `pilot-render-incident-readonly-receipt.json` records a direct public REST refresh at 22:04:59 UTC of the [official Render incident](https://status.render.com/incidents/8tsd93r1wbmz), with Monitoring update `21:43:18.737 UTC` and free-service build/deploy pause. Read-only provider events/logs do not establish the service's 502 cause. **Do not send deploy/rollback requests into the reported pause.** Development, tests, and CI continue; refresh provider health/status before any later release action. No new hosting, paid service, credential, or security-setting change is part of recovery.

Draft [PR #82](https://github.com/robbashea-lab/GRC/pull/82) remains the pilot review record. Intermediate [CI #174](https://github.com/robbashea-lab/GRC/actions/runs/38643235439) on `864cd9458e7bed4d8d4c4c2a9d35fe41f9baff04` is diagnostic history (last reported Mongo PASS; other jobs pending); replacement source requires its own exact-commit CI. `pilot-fixture-support-build-receipt.json` records both local builds PASS, not a deployment or final candidate SHA.

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
