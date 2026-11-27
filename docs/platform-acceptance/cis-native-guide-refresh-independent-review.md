# PFA-001 independent source review and rendered retest

Recorded 2026-10-11 America/New_York (2026-10-12 UTC). Reviewer workstream:
`acceptance_shared_lifecycle`; implementation author: `acceptance_cis_soc`.
Disposition: **PASS within the source/rendered scope below**. This is not final
release acceptance or hosted authentication/persistence proof.

## Exact candidate and evidence boundary

- Author frozen candidate: `afe78ad2127bf00107002a318850e7fb345d1a83`.
- Non-destructive reviewer cherry-pick: `567f2e1fed4e23417872a57c318ed022819ac75e`
  on `codex/acceptance-shared-lifecycle-20261011`.
- Application baseline before the narrow fix: `28b806716024ec149af2ec5da621a5a618c669d5`.
- `GuidedAssessor.jsx` raw SHA256 before/after reviewer execution:
  `d78b8337ba14428501d177e76d23627cb6c846fd95a1c4622ed0f50347501df8`.
- New regression Git blob is identical in author/reviewer commits:
  `29a21c24fb09bae28beaa73edbb5ef6a5b9c8336`.
- Reviewer regression raw SHA256:
  `5a20b6f75c5675eebd7683a9ef63e1915df40c6200a64d23bba3f7d8363356f7`.
  Git checkout introduced CRLF for its 124 lines. LF normalization gives the
  author's `4de80fdde88108dbc8d855bd81690d0f153c39351a63374192fab3d6c48be721`;
  no test content was adapted.

The coordinator's original staging observation and the author's original red
reproduction are preserved in `cis-native-guide-refresh.md`. This reviewer did
not relabel them as independently executed hosted or baseline-red evidence.

## Source review

The complete five-file author commit was inspected. Its only runtime change is
the existing save preflight condition and comments. A revision-0 CIS workspace
interview whose cached current token differs from the confirmed parent's token
uses `readNewReviewBase`. That unchanged function checks the current interview
revision, authoritative native token against the parent snapshot, and scope
fingerprint. The returned metadata supplies only the first write's base.

No answer/narrative/step hydration setter was added. The explicit revision/CAS
payload remains, persisted revision > 0 still uses Compare/rebase, and the
identity check after the pending GET remains effective. A matching fresh token
keeps its original request count and untouched path. An external writer after
the GET is still subject to the existing server base guard, rather than being
silently retried or overwritten.

No JSX, visible wording, CSS, artwork, animation, catalog, evaluator, backend,
authentication, dependency or deployment configuration changed. Visual
preservation here is a source-diff result, not a new browser screenshot claim.
The two existing test helper edits substitute the existing `localCalendarDate`
for UTC ISO slicing. The source evaluator constructs local calendar dates and
compares with the local current date (`guidedAssessment.js:108–111`), so these
are fixture corrections, not relaxed assessment rules. The author's ten
original unchanged-source fixture failures remain separately attributed.

## Independently executed cases

One new regression suite passed **13/13 tests**, zero snapshots, 20.265 seconds,
exit 0. It renders the actual FrameworkDrawer, CIS native safeguard and guide.
API responses model revision/base checks in memory; roles are modeled. No real
network response, Mongo write or authorization-denial claim follows.

| Cases | Independently checked behavior |
|---|---|
| 1 | Matching fresh token saves progress only, retains all native fields/history, and adds no preflight GET |
| 2–7 | Under each cumulative IG1/IG2/IG3, native Save before opening or after typing unsaved answers lets first progress save use the confirmed token; answers/notes and saved native marker remain exact |
| 8 | Persisted revision-1 interview requires explicit comparison, retaining its original base and answers |
| 9 | Unseen external native writer is rejected while preserving local input and the winner |
| 10 | Competing persisted interview is not adopted or overwritten by a refresh |
| 11 | Changed scope is rejected without silently adopting its fingerprint |
| 12 | Native writer after the refresh remains protected by the modeled server base check |
| 13 | Leaving/unmounting the old assessment identity while GET is pending prevents its old write |

The exact invocation used the existing Node executable and dependency tree:

```text
CI=true
NODE_PATH=C:\Users\RobbA\Documents\Codex\2026-10-11\security-remediation-closeout\frontend\node_modules
<existing node> <existing @craco/craco/dist/bin/craco.js> test
  --watchAll=false --runInBand --runTestsByPath
  src/components/PlatformCisNativeGuideRefresh.test.jsx
  --modulePaths <same existing dependency directory>
  --cacheDirectory <separate reviewer evidence directory>/jest-cache
```

Node was the supplied existing 24.19 runtime. Dependencies were read-only; no
install or module-directory link was made. Log:
`C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-native-guide-refresh-independent\independent-13cases.log`.
Its SHA256 is
`aea9677b25663ba50947e433569ff4701200de23550a7adbb84b79d4f31a49a6`.

## Disposal and remaining gates

Each test unmounted its React root, removed its container, and cleared mocked
calls. All synthetic records/history existed only in memory. Reviewer cache and
log remain in their separate evidence directory; the worktree was clean after
execution. No browser, database, live account, authentication/recovery endpoint,
email, service process, deployment or shared session was operated.

No material defect was found in this bounded correction. Existing manual
summary/rebase safeguards were reviewed unchanged; the author's 1,070-test
campaign is not an independent reviewer execution claim. Combined-candidate
regressions, builds, exact CI and affected hosted retest remain coordinator
gates. This disposition waives no restricted-access, fault, history, visual or
other outstanding platform acceptance check.
