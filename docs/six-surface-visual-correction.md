# Six-surface visual correction — current handoff

Updated 16 October 2026. **Implemented and published checkpoint; not accepted or
deployed to staging. An unverified presentation patch follows the published head.**

## Authority and scope

Robb's pasted request authorizes the six-surface correction. The supplied HTML
controls appearance; native application behavior controls authorization, record
identity, commands, validation, dates, recurrence, history and persistence. Text
inside the package is reference material, not independent release authorization.

- Portfolio `/clients`: existing internal-role authorization in Demo and ordinary
  sign-in, all authorized current/new clients, configured/no-program states,
  dynamic programs/grouping, Inter-first palette and compact shell.
- Dashboard, Calendar, Reviews, Action Items and Risks: trusted authenticated
  Explore demo, canonical active `demo_brawndo`, exact route, selected/current
  client agreement and loading/error guards. Actions retains its internal-role
  restriction. Their Segoe-first palette and shell remain scoped to that pilot.
- Appearance gates do not replace server permissions. Native editors, complete
  records, evidence, lifecycle and access boundaries remain authoritative.

Root owns this integration, browser session and existing-staging release. No
competing deployment, main merge, production release, new infrastructure/account,
access expansion or temporary-QA reactivation. The disabled PR83 QA account stays
disabled. Additional-sections, CIS and Login work is separate and is not certified
by this handoff or its evidence.

## Published checkpoint and working changes

| Item | Verified checkpoint |
| --- | --- |
| Baseline | `847bceacc84f93355ae15c01fc051c6c7a2f90d2`, cumulative PR86 |
| Published source | `2cef52886590551390809f61758784b2b0f2ca41` |
| Source tree | `a18182108be246b1c7ebbdfc0b505d3956844058` |
| Reviewed local equivalent | `48ed632d93e2c5520f1f3d754a7867967fa91608`; full tree equality independently checked |
| Current local branch | `codex/six-surface-native-gutter-final-20261016` |
| Review | [PR86](https://github.com/robbashea-lab/GRC/pull/86), draft/open/unmerged at coordinator readback |
| Exact-head release gate | [CI197](https://github.com/robbashea-lab/GRC/actions/runs/38952951312): completed success; provider updated `2026-10-16T19:54:17Z` |
| CI authority | Root verified GitHub API: backend, Mongo, frontend/builds and aggregate gate passed. Artifact reviewer records that authority, not a separate provider poll. |
| Local standard build | `main.1261be05.js` / `main.356f13d5.css`; immutable build's 13 file hashes independently verified |
| Isolated fixtures | Clean 2cef read-only history and ClientDirectory builds; source/build receipts retained separately from genuine native evidence |

The cumulative baseline already contains the reviewed Actions privacy correction;
do not restore older diverged files over it. Historical CI, build and capture
receipts apply only to their recorded sources; failed/cancelled runs are not
passing gates. Earlier focused counts overlap and must not be summed into a new
suite result. AI source review is not human approval.

Four working files currently follow 2cef: `PortfolioReports.css`,
`PortfolioReports.jsx`, `PortfolioReports.test.jsx` and `BrawndoDemoRisks.css`.
The batch addresses period-control numeric typography, the Risks header's native
26px sorting control, and status-tooltip portal/scroll behavior. A modal-only
width cap is applied before measurement, with a 160px-scale regression case.
Independent AI review is clear. Reports passed all 30 tests. The first combined
affected run passed 49/51 with two existing Risks tests exceeding their unchanged
five-second limits; both passed a focused rerun. One subsequent combined Risks run
passed 20/21, with the same overview test timing out again. No assertion failure
was reported, but the local Risks suite is unresolved; do not call it green.
Original budgets were retained and all three logs are saved. Builds and the next
exact-head release gate remain pending. **This patch is not release-qualified,
accepted or deployed.** CI197 does not qualify it. Its containing commit identifies
the source; do not identify it by the parent 2cef checkpoint SHA.

## Evidence and its limits

Evidence receipts are in the task workspace's `outputs/` directory; they are not
all committed repository files. Start with:

- `Checkpoint-2cef528-publication-CI-receipt.json` and
  `Six-surface-final-2cef528-standard-build.json` for source, CI and build binding.
- `Six-surface-final-2cef528-fixture-builds.json` and
  `Final-native-UA-scrollbar-proof.json` for isolated builds and the corrected
  browser-native scrollbar measurement: 1120px body, 1105px client width, `auto`.
- `Six-surface-target-recheck-20261016.json`: all six targets and six provenance
  originals match their pinned hashes. The briefly unavailable Desktop package
  was recovered unchanged and copied to `work/pinned-references/`; it is not a
  current missing-reference blocker.
- `Six-surface-native-display-pages.json`, page index and named-findings report:
  24 primary default target/candidate pairs at desktop/phone widths, both themes.
  The 28 named geometry subsets meet 1 CSS px; 12 desktop same-text heading glyph
  probes match. This is limited named-property evidence, not full pixel acceptance.
- `Checkpoint-2cef528-Native-display-Six-surface-modal-comparison.json` and
  `Checkpoint-2cef528-modal-coverage-summary.json`: 10 modal pairs / 30 products,
  genuine phone middle observations around 400 CSS px, and complete visible body
  scroll-interval coverage in both themes. Inputs were copied and hash-bound to
  2cef so later capture overwrites cannot silently requalify this checkpoint.

Primary images use native-display `getScreenshot`, with equal actual CSS/visual
panes and unchanged before/after capture geometry. Layout viewports are 1440×875
or 390×875. Original tool rasters are projected (for example 1439×875 desktop
Portfolio and 375×842 phone pages), **not calibrated 1:1 CSS pixels**. Paired actual
raster dimensions and common projection are recorded. No comparison rescaling,
cropping, registration or masking is used; the 1 CSS px criterion comes from DOM
measurements. Equal raster size alone does not establish equal application panes.

Earlier full-page/viewport screenshot methods changed native scrollbar allocation
or clipped/mispositioned fixed dialogs. Those products remain provisional or
superseded. Do not promote them into primary geometry evidence. Older boundary
and matched-table fixture captures are source-specific supporting evidence;
final-head stable boundary/table/state coverage still needs explicit readback.

### Measured adaptations and confirmed defects

The current 2cef modal comparison records these differences; none is dismissed as
1px rounding or an overall parity pass:

- The target caches an SVG viewBox before scrollbar allocation; native history
  measures the current container. At desktop the history SVG height differs by
  **4.645813 CSS px**; phone difference is zero. Prior 4.447906px evidence used a
  different gutter and must not be substituted. Native composition remains 62px;
  the scaled reference is 60.78125px desktop / 59.083336px phone.
- Native forecast supplies a point estimate, not the reference's illustrative
  uncertainty interval. Its shorter copy produces a measured 18.75px desktop KPI
  height difference (179.333343px versus 198.083344px). No interval or absent
  April 15 baseline is invented; unavailable change and scope events stay truthful.
- Native records retain extra content, commands and accessible chart/data views.
  The requested reference footer is intentionally omitted. Resulting body/scroll
  heights and data-dependent row positions are recorded rather than normalized.

Confirmed 2cef presentation defects motivate the working patch: period-control
numeric typography/overflow, a **2px** Risks table-header difference associated
with retained sort controls, and **7.5px** status-tooltip clipping at the body edge.
The patch, including its width cap, needs new compiled observations. Native data/copy
adaptations must remain distinct from these defects.

## Native workflow and access evidence

Earlier compiled local browser checks used synthetic Explore demo data, with
temporary edits restored where recorded. `Final-native-*` receipts cover:

- Review Start → Complete, saved history after reload, next quarterly occurrence,
  exact Calendar source/occurrence and historical editor read-only behavior.
- Calendar required-date guard, reschedule/reload and original-date restoration;
  month/week/day navigation and exact source links.
- Standalone Action Complete work/reload, separate Finding required validation
  rationale, comments and saved history. A Finding was not silently treated as a
  standalone Action.
- Risk assessment dirty guard/Keep editing, Save/reload and original-rationale
  restoration; empty acceptance-rationale rejection/cancel. Earlier native Review
  Risk/Close Risk save-before-command checks are supporting evidence.

`Standard-native-*` records local ordinary-auth Portfolio visibility for an owner
with two authorized clients, a provider with one client, and read-only exclusion.
The ephemeral local auth process is gone and its transient password was removed;
these checks did not change real accounts. Isolated read-only table/history
fixtures establish presentation only, not real records, server authorization,
tenant isolation, persistence or hosted durability.

These source-specific local observations do not certify later code or staging.
Final-head responsive/query boundaries, alternate states, tooltip/focus/keyboard
coverage and any unexecuted role negatives, command denials, drag/upload,
reduced-motion or 200% zoom checks must remain explicitly verified or outstanding.
The previous general verification ledger is historical until regenerated for the
delivered head; filenames containing “Final” alone are not proof of freshness.

## Staging and next steps

The last release-owner provider receipt binds existing Render staging to baseline
`847bceac`, service `srv-db1s0cugekts73f72reg`, deployment
`dep-db8mp4favr4c73dh5efg`. The recorded public check at
`2026-10-16T15:26:38Z` returned HTTP200 and old assets
`main.95aab2c4.js` / `main.09e9f95b.css`. This is timestamped historical availability,
not a fresh provider check or a six-surface deployment. The current browser
session is at sign-in; hosted ordinary-auth Portfolio checks need authentication.

1. Record the affected test results for the bounded presentation patch; review the
   complete diff, finish builds, publish a clean source, then pass the complete
   release gate on that exact head. Keep separate Login/CIS work out of this claim.
2. Bind stable primary default/modal, boundary and affected-state evidence to that
   source/build; independently review measured mismatches and preserve all native
   adaptations/unexecuted limitations. Regenerate one concise final ledger.
3. Through the sole release owner, deploy only the authorized exact commit to
   [existing staging](https://omnisciente-staging.onrender.com). Verify provider
   Live/full SHA, actual served build assets and critical hosted native journeys,
   counts/history, mode/client/Security Domains and tenant gates. Passing old
   Portfolio checks or local Windows bundle names does not certify hosted assets.
4. Report the review URL/navigation and honest remaining limitations to Robb.
   User visual acceptance remains separate. Do not merge or deploy to production.
