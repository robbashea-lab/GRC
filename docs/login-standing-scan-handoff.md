# Standing-scan public Login handoff

## Scope and provenance

Login-only branch `codex/login-standing-scan`, based on main
`911706cebc7a70c0443f500fcd4bc19260c1db60` (refetched unchanged at closeout).
No authenticated workspace, shared OmniCharacter, assessment engine, backend,
catalog, authentication context/API, dependency, schema, CSP or deployment-setting
changes. Existing sign-in, error handling, recovery link, explicit Demo entry and
redirect handlers are retained.

Approved reference: `Omnisciente_OmniBot_Superhero_Entrance.html`, current
`v5.5-anchored-omni-menu` behavior, SHA-256
`35666e4c6922c1374cf829b98ba4d90242f0f69d08f3317b1b37ed1209d2c74a`.
The filename and old entrance comments do not describe its current standing start.
Interactive local-reference review: **not executed—replaced by authorized source
inspection and artwork review**. Implemented-application browser tests below are
separate evidence. The two extracted PNGs preserve the embedded reference bytes.
No iframe shell, prototype authentication handlers or permissive CSP was copied.

## Implementation

- `LoginWelcome.jsx`: public, route-owned standing scan, local-time greeting,
  robot/orb switch, bounded pointer/arrow-key dragging, replay/pause, dedicated
  GRC cards and four static introductions. The nonmodal introduction stays above
  the character, scrolls when necessary, restores focus and never traps the form.
- `LoginEnvironment.jsx`, `loginScenery.js`, `loginOptics.js`: scoped decorative
  city/reflections, globe/shield and optical effect; no account, input-value or
  client-record inspection. The scan is explicitly a visual effect.
- `loginPlacement.js`, `useLoginMotion.js`: presentation geometry and owned
  animation/resize/scroll/preference cleanup. Scroll/resize re-docks the character
  so stale dragged coordinates cannot obstruct authentication.
- `loginEducation.js`: latest reference's brief approved introductions, not the
  superseded dimensional-reference question set; entirely local/static.
- `Login.jsx`, `Login.css`: reference composition around the existing form;
  selectors/animations are Login-scoped. Primary action/focus colors retain the
  blue direction with tested contrast. `public/login/` holds only its artwork.
- Login component, motion, placement and CSS tests cover the changes. The
  existing authentication-context/logout tests were run unchanged.

The education is nonmodal because the sign-in form remains available. Focus and
motion decisions use the WAI dialog pattern and WCAG 2.2 pause/stop/hide guidance:
https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
Selected checks do not establish whole-application WCAG conformance.

## Executed verification

Windows user-local worktree; existing dependencies reused, no installation.

```powershell
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watch=false --runInBand --runTestsByPath src/pages/Login.test.jsx src/pages/Login.css.test.js src/components/login/LoginWelcome.test.jsx src/components/login/loginPlacement.test.js src/components/login/useLoginMotion.test.jsx src/context/AuthContext.test.jsx src/context/AuthContext.logout.test.jsx
node scripts/staging.cjs
node scripts/preview.cjs build
```

Run from `frontend`. **7 suites / 40 tests passed**; an independent read-only
review reran them and accepted the narrow corrections. Both optimized builds
compiled successfully with CI warnings-as-errors enabled. Normal staging artifact:
`main.ca4c4c5c.js` / `main.8de369c9.css`; Demo artifact:
`main.67e22f14.js` / `main.cb0e7389.css`.
Existing bundle-size advice and Node 24 `fs.F_OK` deprecation remain; no dependency
upgrade was performed. An earlier missing-hook-dependency build warning was fixed,
not suppressed; the subsequent builds passed.

Actual browser executions on the implemented application:

- Fresh load/refresh and two repeated standing replays completed to the greeting.
  Robot/orb toggles, physical pointer dragging and keyboard movement worked.
- All four introduction topics, all three dedicated GRC explanations, back,
  close, sign-in shortcut, Shift+Tab/visible focus and Escape restoration tested.
- Pause/resume tested; OS reduced-motion preference changes and listener cleanup
  are automated-test evidence, not actual OS/device emulation.
- Light/dark rendering; widths 1440, 1024, 768, 390 and 320 px. DOM geometry showed
  no horizontal overflow or character/form intersection. Phone card navigation
  reanchors above the character; the bounded guide scrolls and restores card focus.
- Standard authenticated **build UI only** served on isolated loopback port 4212:
  enabled blank fields, required-field validation, synthetic keyboard entry,
  password visibility and recovery-route/back navigation. No credential submission
  or recovery email. This server has no backend and is not authentication evidence.
- Explicit Demo entry on port 4211 reached Client Portfolio; Login layers were
  detached. Returning to Login rendered the new page again. Shared staging/Demo
  sessions were not navigated, signed out or mutated.
- Final fresh Demo runtime pass recorded no new console errors/warnings. Earlier
  development RAF and hot-update warnings are retained as corrected observations,
  not presented as successful checks. One scan visibility wait timed out before
  the subsequent state confirmed normal completion.

Browser testing found and corrected negative RAF time, pause/resume scan restart,
ambient-motion interference with morph completion, offscreen mobile menu placement,
stale moved-character coordinates and disabled-trigger focus restoration. Regression
coverage preserves each correction. No open defect reproduced in these checks.

## Preview, release ownership and limits

Available local Demo: **http://localhost:4211/login**. The loopback-only dev process
is retained for review. Screenshots are in the worktree owner's sibling
`outputs/login-final-light.png` and `outputs/login-final-dark.png`, not committed.
The UI-only standard-build server is a temporary test resource, not a hosted target.

**No merge, Render deployment or ChatGPT Sites publication was performed by this
workstream. Production, hosted data, accounts and provider settings are unchanged.**
The visual-release coordinator exclusively owns integration/deployment/session
coordination in PR #57. Its recorded current staging runtime is
`79075e0f85bebdb9651d381762e945c01f79c108` / `dep-db4n4iflk1mc73d83cs0`, with newer
interview/history behavior than this branch's main base. Do not publish the entire
older Login-only source over that runtime. Integrate only this scoped change atop
the coordinator's current compatible candidate, rerun affected checks and follow
the normal protected release gate. No data rollback/reset is a Login recovery step.

Remaining verification: real hosted sign-in/session refresh, MFA/device scenarios,
recovery delivery and Login-to-authenticated-portfolio acceptance on the final
combined source. Hardware/mobile Safari and actual OS reduced-motion emulation
were not executed. Local Demo/UI results do not close those hosted gates.
