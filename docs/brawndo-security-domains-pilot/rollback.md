# Demo Security Domains disable and rollback specification

This is an executable technical procedure, not a rollback receipt or claim that a candidate is deployed. The integration owner keeps current source, prior release, exact tests/builds/CI, provider receipts and hosted verification in the external release ledger. Historical authenticated-target qualification does not qualify a Demo-target disable commit.

Disabling the pilot changes presentation only. Preserve native Demo mode, session-local adapter/storage, existing records, drafts, implementation, Items, findings, Evidence, history, native editor and Omnibot, plus authenticated authorization/persistence and all unrelated approved successors. There is **no database or record rollback**. Do not reset/reseed a Demo session, restore old assessment values, migrate records or change accounts, grants, credentials, sessions or security settings.

## Required target contract

The feature may be enabled only for exact public seed identity `demo_brawndo`, `user.workspace_mode === 'demo'`, framework `cis-ig1` version `8.1`, numeric implementation group `1`, selected/configured native program and program namespace `demo_brawndo:cis-ig1`. Missing or uncertain context fails closed. Other Demo clients, every authenticated client, legacy test clients, new-client defaults, other frameworks and IG2/IG3 remain off. There is no authenticated or fixture allowlist.

The gate is in `shared/catalogs/brawndoSecurityDomainsPilot.json`; its native context check is in `frontend/src/lib/brawndoSecurityDomains.js`. Retain the mode check and exact native program/record contract while disabling. The [acceptance specification](acceptance.md) defines the 40 verification requirements. A held shared Omnibot exclusive-choice defect is unfixed and deferred; disabling the domain section does not fix it or authorize a shared Omnibot change.

## Preferred gate-only procedure

1. The sole integration/deployment owner first reads the actual current approved deployed source and its release ledger. Use an isolated checkout based on that source, retaining every approved successor and user change. Record its full source SHA and current provider state externally. Do not reset, force-push or revert unrelated work. Confirm that the candidate still uses the Demo-only contract above.
2. At that checkout's repository root, make only the existing JSON `enabled:true` -> `enabled:false` change. This script fails closed if the public Demo identity or scope differs. It changes no workspace mode or native record:

```powershell
$pilotPath = Join-Path (Get-Location) 'shared/catalogs/brawndoSecurityDomainsPilot.json'
$pilotText = [System.IO.File]::ReadAllText($pilotPath)
$pilotConfig = $pilotText | ConvertFrom-Json
if ($pilotConfig.clientId -cne 'demo_brawndo' -or
    $pilotConfig.frameworkKey -cne 'cis-ig1' -or
    $pilotConfig.frameworkVersion -cne '8.1' -or
    $null -eq $pilotConfig.implementationGroup -or
    $pilotConfig.implementationGroup -is [string] -or
    $pilotConfig.implementationGroup -is [bool] -or
    $pilotConfig.implementationGroup -ne 1 -or
    $pilotConfig.PSObject.Properties.Name -contains 'fixtureClientIds') {
  throw 'Unexpected Demo-only pilot contract; stop.'
}
if ($pilotConfig.enabled -ne $true) {
  throw 'Pilot is already disabled or changed; inspect before proceeding.'
}
$enabledPattern = '("enabled"\s*:\s*)true'
if ([regex]::Matches($pilotText, $enabledPattern).Count -ne 1) {
  throw 'Expected exactly one enabled flag; stop.'
}
$disabledText = [regex]::Replace($pilotText, $enabledPattern, '${1}false')
[System.IO.File]::WriteAllText($pilotPath, $disabledText, [System.Text.UTF8Encoding]::new($false))
git diff -- shared/catalogs/brawndoSecurityDomainsPilot.json
```

3. Independently review that the diff changes only the flag. Retain the exact Demo client/framework/version/group, native namespace check, workspace-mode gate, mapping, adapter, records and unrelated source. If the contract or diff is unexpected, stop and inspect; do not discard someone else's changes or add an authenticated fallback.
4. Run the candidate's full required tests and both applicable builds under `.github/workflows/release-verification.yml`. Include meaningful gate-off and mode/context-isolation checks: section absent in the existing Demo session, original Controls/editor/save/Omnibot paths retained, other Demo clients unchanged and authenticated activation still off. Use isolated QA data/session custody; do not run disposable persistence campaigns against hosted business records.
5. Obtain independent review, commit/push only the reviewed disable change through the authorized repository flow and record the **new full disable SHA** externally. Require all workflow jobs, including frontend, backend, backend-mongo and Release gate, to succeed on that exact SHA. A previous green candidate, old qualification or local test pass is not the new disable commit's required CI. No main merge or broader rollout is part of this procedure.
6. In the existing authorized Render staging service, use **Manual Deploy -> Deploy a specific commit** with the full tested disable SHA. Preserve provider source settings, Auto Deploy, environment, credentials, service and security configuration. Do not create hosting, expand access, deploy production or publish a Site.
7. Record successful deployment and require **provider source = tested disable SHA**. Freshly open the actual native Demo Brawndo CIS IG1 session. Confirm domains are absent while mode, records/drafts/history, native Assessment Progress, Controls order/filter meanings, editor and Omnibot remain available through their existing adapter/session behavior. Verify other Demo programs and authenticated workspaces retain their experience, with the pilot off. Compare actual stored/native state; a provider success label alone is insufficient. Do not imply the known shared Omnibot defect was fixed.
8. Keep the external completion receipt: reason, owner, prior/new full source, branch/review, exact CI, deployment/source/status, hosted native/mode/isolation/preservation checks, approved recoverable test cleanup and remaining failures or unverified results. Keep deployment recovery separate from user acceptance. No check becomes PASS merely because rollback succeeded.

## Conditional application fallback

Prefer a corrective gate-only commit on current approved source. A full application rollback is permissible only after the sole owner establishes that it preserves unrelated approved successors and the same Demo-only scope. Read the actual current provider state and privately recorded prior release, review the affected changes and CI applicability, and qualify the exact fallback before using the existing staging service's specific-commit flow.

An older artifact that enables authenticated clients is not an eligible fallback merely because it was previously deployed or had green CI. Any fallback must keep the pilot disabled or comply with the Demo-only contract, preserve native mode/records/session behavior, and satisfy provider-source equality plus fresh hosted native/isolation/preservation checks. Retain the rationale and evidence externally.

Neither path changes native seed data, clears storage, reverses assessment values, restores a database, removes history or imports/migrates records. Recover only explicitly approved test-created activity through existing native recoverable procedures. This specification contains no operational deployment/fixture identifiers or current execution results and asserts no current deployment or completed rollback.
