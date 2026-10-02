# Framework lifecycle verification

The shared timeline is `shared/contracts/program-lifecycle.json`: independent CIS
IG1, SOC 2 and ISO 27001 clients, in that order, January 2027 through December
2029. Tests create records and complete occurrences through application commands;
they do not insert successful history or change the host clock.

## Executable coverage

| Scenario | Backend API | Demo adapter |
|---|---|---|
| New client, one framework, exact assessment population, repeat onboarding without duplicates | Yes | Yes |
| Assessment revisions preserve original snapshots | Yes | Yes |
| Monthly month-end probe: early January, late March, missed April/May caught up in June, leap February 2028 | Yes | Yes |
| Quarterly schedule change in December 2028 preserves old occurrence snapshots and next January anchor | Yes | Yes |
| Review start, Evidence, completion and repeated completion return the same occurrence | Yes | Yes |
| Annual Policy approval versions, Vendor/contract Reviews and offboarding, Risk Reviews/acceptance expiry/closure | Yes | Yes |
| Sourced Finding, linked Action, remediated-but-unvalidated state, independent validation | Yes | Yes |
| Finding without an Action | Yes | Covered separately by governance contract |
| ISO audit packages: item results, supporting Evidence, report and completion | Yes | Yes |
| ISO SoA scope change; SOC period and shared-Control observations | SoA | Yes |
| Year-end Calendar occurrence keys and dashboard counts reconciled to records | Yes | Yes |
| Arbitrary-tenant capability and authorization boundaries | Shared capability contract | Shared capability contract |

The timeline is not the entire release matrix. Departed-user behavior, Finding
reopening, Evidence replacement/unlinking, fault recovery and stale writes have
separate focused tests. Published browser interaction, browser reload/session
behavior, and real-database reconnect/concurrency require their own evidence in
`quality-release-verification.md`; an adapter or Mongo mock pass does not prove them.

## Commands and checkpoint files

From the repository root, with the existing backend environment:

```powershell
$env:FRAMEWORK_LIFECYCLE_EXPORT_DIR = Join-Path (Get-Location) '.qa-lifecycle/three-year'
python -m pytest -c backend/pytest.ini -q backend/tests/test_framework_three_year.py
```

From `frontend`:

```powershell
$env:CI = 'true'
$env:FRAMEWORK_LIFECYCLE_YEARS = '3'
$env:FRAMEWORK_LIFECYCLE_EXPORT_DIR = Join-Path (Get-Location) '../.qa-lifecycle/three-year'
node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --runTestsByPath src/preview/frameworkFiveYear.test.js
```

The existing Demo test still defaults to five years when the years variable is
absent. Use a separate export directory for a five-year run.

The optional export contains `backend-three-year-report.json`, yearly
`<framework>-<year>.json` snapshots and final `<framework>.json` snapshots. Demo
snapshots include `synthetic_lifecycle_fixture: true`, the disposable client ID,
and the entire isolated Demo store produced by the commands. They are checkpoint
inputs for browser inspection, not production fixtures or evidence that browser
commands were exercised. These generated files remain outside version control.
