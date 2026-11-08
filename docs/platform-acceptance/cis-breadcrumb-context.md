# PFA-002: preserve background browsing without a false CIS ancestry

Baseline product: `b128eb2b178ab8507b42aaa8ec010fd004d1a9ea`.
The coordinator observed the global Continue action opening correct native 1.1
while the remembered Control 3 background appended Safeguard 1.1 to its own
breadcrumb. The modal's Control 1 path was already correct. No native record
misbinding or assessment write was observed in this finding.

Source cause: `FrameworkWorkspace.openRecord` deliberately preserves the CIS
background category and returns through the existing history entry. The header
can open a global next assessment outside that category. `BrawndoCisControls`
combined the remembered control with the selected safeguard unconditionally.
This is a settled dynamic binding error, rather than browser-input timing.

The agreed correction changes one breadcrumb condition: for an unfiltered
displayed control, append a selected safeguard only if that control's rows
contain its assessment identity. Background table, category preference,
selection, modal breadcrumb, history/Close/Next behavior and filtered paths
remain unchanged. No new label, component, CSS, source meaning or native writer.

The new page integration test uses real `FrameworkWorkspace`, header and CIS
controls. Its native drawer is an observable selection/navigation boundary;
this does not establish native unsaved-draft handling or assessment persistence.
All PUT/PATCH/POST/DELETE calls are explicitly prohibited by the test.

| Local evidence | Result |
| --- | --- |
| Original exact-b128 reproduction | 3 cross-group failures, 2 existing-path passes; 62.809s |
| Corrected new suite plus existing `FrameworkWorkspace.test.jsx` | 2 suites, 29 tests passed; 4.592s |

The five new cases cover global Continue from remembered Control 3 under each
IG, exact preserved background table/preference and Close return, same-control
selection/Next, and the unchanged filtered-result breadcrumb. Modal 1.1 retains
its correct Control 1 path. These are local modeled routing/API responses,
not new hosted evidence or security proof.

Originals are retained in
`C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-soc\breadcrumb-context`:

- `baseline-b128-red.log`: SHA256
  `0c86516ccf318e0abc2643de525aa26bb60a3de9718d14779384ebd323049ce9`.
- `corrected-focused.log`: SHA256
  `e571fbb6f0e64804633c50174b923be04177fb0acd7d90432f2dfa8842e07bd9`.

Repository copies reside in `cis-fix-evidence/pfa002/` without replacing originals.
Tested raw source: `BrawndoCisControls.jsx` SHA256
`c1b16c58d46ba216ac9a9fadec45ad1d4619feb7081330a4398e85b549c52a1b`;
new test SHA256
`4285bb1b78134c824c4353348a732fca6973a2d157fbfa1e9742975b64e3f758`.

Independent review/retest and root-controlled combined CI/build/deployment and
specific hosted retest remain required. This author performed no browser,
database, authentication, account, fixture or deployment action.
