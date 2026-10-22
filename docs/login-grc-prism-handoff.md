# Approved GRC Prism Login replacement

## Source and boundary

Implemented 2026-10-12 on `codex/login-grc-prism`, isolated from the coordinator's
PR70 worktree. Fresh fetch confirmed compatible base
`09e5d9855146790eb235fc887e37caedc96cb9fd` and main
`28b806716024ec149af2ec5da621a5a618c669d5`; neither changed in this work.
The coordinator confirmed no active Login-file reservation and no staging/session
handoff. No merge, push, PR update, Render/Sites publication or production change
was performed for this task.

Binding reference: `Omnisciente_GRC_Prism_Interactive.html` supplied by the user.
Complete HTML/CSS/static content/JavaScript were inspected; its artwork was decoded
and visually inspected, not regenerated. Reference SHA-256:
`758dcd26a76ef1ed1fb795f03753cb2adc5a7b5b24d07bf30d65e53c37c990bd`.
Artwork SHA-256:
`62f626cf5654e703050a5ee62d7d6f71d3285df7f037a8eaa3a2c8f92716268a`.

The supplied reference defines a fixed dark appearance, not a light-theme variant
or theme selector. This implementation preserves that appearance and does not
change the internal workspace theme preference. The local reference itself was
source-reviewed, not interactively opened or publicly hosted.

## Implementation

- `frontend/src/pages/Login.jsx`: approved scene, sign-in panel, educational cards
  and motion control. No LoginWelcome/OmniBot mount. Existing AuthContext login,
  exploreDemo, loading/error handling, environment gates, recovery route and
  post-login routing retained. Native labels, validation and credential autocomplete
  retained instead of copying mock authentication behavior.
- `frontend/src/pages/LoginPrism.css`: original visual rules scoped to
  `#login-prism`, named animation, local shared image. Minimal scoped corrections
  restore browser spacing/bullets removed by Tailwind's reset.
- `frontend/src/components/login/PrismEducation.jsx`: Login-only React interaction
  state and native modal, topic/previous/next/arrow/Home/End navigation, focus
  restoration and wrapping, framework/stage selectors. No global click listener,
  client data, local-storage education state or API calls.
- `frontend/src/components/login/prismContent.jsx`: all supplied educational copy
  as static JSX; no runtime HTML injection, AI service or external dependency.
- `frontend/src/assets/login-grc-prism.png`: exact extracted approved artwork, one
  asset shared by the main scene and cards.
- Tests: updated `Login.test.jsx`; new `LoginPrism.css.test.js`,
  `PrismEducation.test.jsx`, `prismContent.test.jsx`.

Mock notice/messages omitted. Explore Demo uses the established application entry,
not the Governance panel. The existing authentication-disabled notice remains in
Demo builds; Demo availability remains configuration-controlled.

## Executed verification

Final focused run: **13 suites / 114 tests passed**, no skipped tests. Includes
Login, Prism education/CSS/content, AuthContext/current/legacy/logout, retained
Login helper regressions, OmniDock and GuidedAssessor. Eleven text hashes compare
every complete topic, framework and risk-stage block to the supplied source,
normalizing whitespace only. Artwork bytes and Login-only stylesheet scope are
also asserted. JSDOM dialog stubs are unit evidence, not browser focus proof.

Command from frontend (using the existing Node executable/dependencies):

```powershell
$env:CI='true'; $env:BABEL_DISABLE_CACHE='1'; $env:ENABLE_HEALTH_CHECK='false'
node node_modules/@craco/craco/dist/scripts/test.js --watchAll=false --runInBand --no-cache --coverage=false --runTestsByPath src/pages/Login.test.jsx src/pages/LoginPrism.css.test.js src/pages/Login.css.test.js src/components/login/PrismEducation.test.jsx src/components/login/prismContent.test.jsx src/components/login/LoginWelcome.test.jsx src/components/login/loginPlacement.test.js src/components/login/useLoginMotion.test.jsx src/components/OmniDock.test.jsx src/components/GuidedAssessor.test.jsx src/context/AuthContext.test.jsx src/context/AuthContext.logout.test.jsx src/context/AuthContextLegacy.test.jsx
```

Both CI-strict optimized builds compiled successfully:

- Demo: `node scripts/preview.cjs build`, `GENERATE_SOURCEMAP=false`.
  Served `main.b6b1b8bd.js` and `main.778598ae.css`.
- Normal auth: `node node_modules/@craco/craco/dist/bin/craco.js build`,
  `REACT_APP_PREVIEW=false`, `REACT_APP_STANDARD_SIGN_IN=true`,
  `GENERATE_SOURCEMAP=false`, isolated external `BUILD_PATH`.
  Served `main.9e6e3dbb.js` and the same CSS.

Builds still emit the previously documented bundle-size advice and Node `fs.F_OK`
deprecation; dev tooling also emitted a webpack assets deprecation. No dependencies
or build/security configuration were changed. `git diff --check` passed.

Actual local in-app Chromium browser checks:

- Rendered full-page desktop/tablet/mobile at 1440, 1024, 768 and 390 px, with
  an additional 320 px overflow/control check. No unintended horizontal overflow
  observed; mobile dialogs scroll within the viewport, with the close control
  remaining in the sticky header.
- Opened all three topics, expanded all eight explanations, selected all three
  risk stages and five frameworks, checked source-link targets and pressed states.
  Topic changes reset stage/framework selection as in the reference.
- Previous/Next, ArrowLeft/ArrowRight/Home/End, selected-topic focus, Tab/Shift+Tab
  boundary wrapping, Escape, close and original-card focus restoration.
- Pause/resume changes the scoped scan animation; no body-level paused class.
- Normal-auth optimized frontend: password Show/Hide, failed-request feedback with
  draft retained, existing recovery route and return. The loopback visual server
  explicitly returns 503 for API calls; this is NOT real account-authentication proof.
  No reset email was submitted.
- Actual explicit Demo entry reached the Client Portfolio. Brawndo CIS IG1 retained
  its Omni invitation/launcher; the native recommendation window opened normally.
  No assessment/interview save or protected-client mutation was performed.
- Final optimized Demo was reopened and fresh served asset names checked; no
  captured browser warnings/errors in that normal Demo session.

QA corrections: isolated the reference's pill class from the app's existing
capitalization/pseudo-element styles; restored reset-sensitive paragraph/bullet
formatting; kept focus inside the dialog and on the selected tab after content
replacement. No education copy, artwork or approved visual model was rewritten.

Git comparison confirms backend, shared catalogs/contracts, auth/API/context,
OmniCharacter, OmniDock, GuidedAssessor, FrameworkDrawer, Layout, framework workspace,
package manifest and lockfile are unchanged from the compatible base.

## Review and limits

Local optimized Demo: `http://localhost:4231/login`.
Normal-auth form/education-only frontend: `http://localhost:4230/login` (no backend).
Both are run-owned loopback static servers using existing Node, not new services.
Screenshots retained outside the repository under the run-owned
`2026-10-12/login-prism-evidence` directory.

Not executed: fresh real-account success/credential rejection/MFA/cookie-session
acceptance or recovery-email delivery; no authorized isolated backend/account/session
was assigned for this Login task. Existing authentication behavior is unchanged and
unit-regressed, not newly hosted-validated. Reduced-motion CSS was statically tested;
the browser reports no reduced-motion preference and exposes no media-emulation
capability, so reduced-motion rendering was not dynamically exercised. Physical
devices, Safari and full application/browser campaigns were not tested.

No schema, dependency, credentials, permissions, client data, internal design or
hosting policy changes. Shared staging/production and existing previews remain
unchanged. Existing broader platform acceptance gates remain outside this task.

Accessibility references consulted for the narrow dialog/tab implementation:
[native dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
and [WAI-ARIA Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
