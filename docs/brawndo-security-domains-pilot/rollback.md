# Brawndo Security Domains pilot disable and rollback

This is an **application rollback, not a database rollback**. It must preserve all assessment records, answers, drafts, history, evidence, findings, authentication, permissions, Omnibot behavior, and unrelated approved work. The sole integration/deployment owner executes it. The procedure is recorded; execution is **NOT TESTED**.

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
