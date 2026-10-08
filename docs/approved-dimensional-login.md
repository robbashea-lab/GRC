# Approved dimensional login

## Scope and provenance

The 2026-10-08 approved `omnisciente-login-dimensional-handoff.html` supplies
the presentation and verbatim educational content. Implementation began from
main `c9fc67942cc1c4d4cd94c015c1e7e4d7b9df3f47` in an isolated worktree.
The separate Omni lifecycle draft PR is not incorporated or released here.

The export's iframe, CSP, CDN bootstrap, sample authentication handlers and
embedded duplicate character image were not imported. The shield is local CSS;
Omni reuses the existing approved character component and asset. There are no
new dependencies, backend changes, schema changes, migrations or AI services.

`LoginWelcome` owns only public presentation and transient education/animation
state. `Login` retains the existing AuthContext sign-in, recovery link and
isolated Demo entry. No client records enter the welcome guide. Standard sign-in
remains disabled in the private Demo build and enabled in the normal staging
build. Demo wording describes browser-local sample state, not authenticated data.

## Preserved content and interactions

All four main topics and fourteen Governance/Risk/Compliance questions retain
their authored answers and practical examples. Official overview links, local-time
greeting, upper-left entrance, replay, dismissal, eye tracking, blinking,
pointer-captured dragging and safe docking are retained. Opening the guide does
not trap focus or prevent authentication. Login focus dismisses it; Escape and
the close button restore focus to Omni. Reduced-motion preference changes are
respected and motion cannot be forced on over that preference.

| Before | After | Why |
| --- | --- | --- |
| Legacy lime login, no public lessons | Approved blue/cyan layout and dimensional CSS shield | Match the approved reference rather than invent another design |
| Reference dock overlaps replay controls | Safe dock with space for the character label and controls | Browser-reproduced overlap; preserve access to replay and motion controls |
| Reference dark-blue secondary text on dark glass | Cyan secondary links/buttons in dark mode | Keep the approved palette while retaining readable contrast |

The motion control follows WCAG 2.2
[SC 2.2.2, Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
Native buttons support keyboard activation according to the
[WAI button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/).
These are changed-interface checks, not whole-application conformance claims.

## Verification recorded before release

Executed focused tests: 5 suites / 21 tests passed, covering every lesson,
examples, main-menu return, selected questions, official links, local greeting,
reduced-motion updates, focus dismissal/Escape restoration, disabled Demo
authentication, standard authentication routing, failed sign-in draft retention,
Demo entry, existing AuthContext/logout and shared theme behavior.

Command from frontend:

```powershell
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand src/pages/Login.test.jsx src/components/login/LoginWelcome.test.jsx src/context/AuthContext.test.jsx src/context/AuthContext.logout.test.jsx src/lib/brawndoPortalTheme.test.jsx
```

Actual candidate-browser checks passed: all 18 topic/question selections, examples
and return navigation; pointer drag over the login card returned to the safe dock;
keyboard Enter/Escape and focus restoration; light/dark appearance; desktop
1440px, tablet 1024px/768px and stacked 390px geometry without horizontal overflow;
reachable mobile authentication/Demo controls; Demo navigation to the existing
sample client portfolio. No browser errors were recorded during these flows.
The reference itself was source-inspected, not interactively browser-tested.

The isolated checkout reuses an existing dependency directory whose package
manifest and Yarn lockfile hashes match this checkout. Local runtime is Node
24.19.0; required CI independently installs the frozen lockfile on Node 22.
The existing application bundle-size advisory and Node 24 `fs.F_OK` deprecation
are retained as diagnostics, not suppressed. Full CI and hosted deployment
results belong in the PR/release handoff for their exact source commits.

## Release and remaining boundaries

Follow `render-release-operations.md`: PR checks, permitted merge, exact merged
main push checks, existing CI-gated Render staging deployment and same-source
owner-private Sites publication. Preserve both destinations and audience.
Rollback uses the prior staging deployment or reviewed revert, never a database
reset. No authentication or security settings need changing for this release.

Local Demo verification is not real-backend sign-in, password recovery or MFA
verification. Fresh hosted sign-in must use the operator's normal credentials;
do not obtain credentials or sign out the shared administrator behind another
agent's active workflow. Email delivery, MFA paths and physical-device testing
must remain unverified unless actually exercised. No account or password reset
is performed merely to test this presentation change.
