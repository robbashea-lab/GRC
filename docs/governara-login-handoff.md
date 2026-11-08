# GoverNara public Login replacement

This is a Login-only implementation of the approved HTML. It does not rebrand the
authenticated application, replace internal OmniBot, or apply consistency-audit
changes. The implementation branch starts from compatible Prism/PR71 revision
`ce98ea63a7b6dac5847a33f095ab5b90a657edd4`, preserving PR70's current readers,
writers, history, and security corrections.

## Approved reference and assets

- HTML: `GoverNara_Interactive_Login_Mockup.html`, SHA-256
  `2d6a6549aa952470708a050cf6ad0ad78ed247a5d8411c721527004121565459`.
- The exact first embedded WebP is `frontend/src/assets/governara-scene.webp`,
  175234 bytes, SHA-256
  `ddbc2da4e584b5bd63e91686c6c69545bee79ee7dd14d3059cfcd5642728a330`.
- Both supplied PNGs are supporting references. Matched browser comparisons use
  the actual HTML and application at the same viewport and state.
- All three topic records and twelve retained SVG symbols preserve the approved
  content and geometry. The miniature prototype guide and its duplicate avatars
  are not part of the application.

## Production adaptations

Sign-in continues to call the existing `login(email, password)` and navigate to
`/`; existing landing/account routing decides the authenticated destination.
Password-manager autocomplete, error formatting, environment restrictions and
submission guards remain. A synchronous route-local guard prevents simultaneous
Sign-in/Demo submissions.

Forgot password uses the existing `/forgot-password` route. Explore a demo calls
the existing isolated `exploreDemo()` and navigates to `/clients`. Neither uses a
prototype dialog, fake success state, nor the sample Nara questionnaire.

The unsupported Keep me signed in control is omitted: no corresponding preference
exists in the current authentication contract. Privacy, Terms and Support are
omitted because no approved destinations exist. Prototype notices and utility
dialogs are omitted. No authentication lifetime, policy or account change was
made, and no MFA/SSO interface was invented.

CSS, variables, SVG identifiers and animations are Login-scoped. Matched browser
comparison exposed inherited platform body/heading typography; the correction
restores only this Login root's `1rem`/normal defaults and inherited heading font
family. Shared styles remain untouched. Title changes, dialog overflow locking
and resize listeners restore/clean up on route exit.

## Verification provenance

- Initial relevant local campaign: 14 suites / 98 tests passed, including existing
  authentication, logout/legacy-state and reset-password regressions. This precedes
  the final typography correction.
- After the final typography correction: the three affected Login suites passed
  21 tests. Native-dialog events in those tests are simulated; browser behavior is
  recorded separately.
- Independent source review checks original content, asset bytes, twelve SVGs,
  203 retained style contexts, scope and connected auth/Demo callers. It is not
  hosted authentication proof.
- Final `CI=true node scripts/staging.cjs` compiled successfully:
  `main.eabf2e70.js` / `main.c42b71d0.css`.
- Final `CI=true node scripts/preview.cjs build` compiled successfully:
  `main.041abd43.js` / `main.6963601e.css`. A concurrent local attempt was stopped
  through its owned session control to serialize resource use; the successful
  final run and interrupted-attempt logs are retained separately.
- Actual final local production-build browser checks covered 1672/1440 desktop,
  shorter laptop height, 1024/768 tablet, and 390/320 narrow widths without
  horizontal overflow. Matched reference typography was restored. All three
  topics, next-topic loop, keyboard activation, Escape/Close/backdrop, focus
  return/wrapping and resizing were exercised.
- Recovery navigation and return used the established routes. Enter reached the
  genuine pending/error flow against the isolated static server's unavailable
  backend (501); this is not real-account rejection or authentication success.
- Actual Explore a demo entered the existing four-client browser-local product
  Demo. Brawndo's existing CIS IG1 invitation and guide opened read-only; internal
  Omnisciente branding remained, with no Login root/dialog/overflow lock left.
  No assessment/interview/SoA saves were performed.
- The supported browser redacts both credential-field values before DOM
  evaluation. Exact field-retention equality cannot be established from those
  redacted reads; source/unit coverage is separate and no workaround was used.
- Frozen commit, exact composite CI and hosted publication are recorded in the
  PR discussion when actually completed. This file preserves the
  implementation-time cutoff rather than claiming a later deployment.

External local evidence is held under
`C:/Users/RobbA/Documents/Codex/2026-10-12/governara-login-evidence` and includes
matched reference captures, actual test/build logs and browser observations.
Its local path is not a universally accessible download.

## Coordination and remaining boundaries

Agent 1 owns this Login-only source. Agent 2 owns the separate controlled
consistency candidate and the exclusive staging publication slot. The release
candidate must contain both authorized workstreams without resetting branches;
its exact composite CI and independent review are required before deployment.
Only the existing Render staging service may be used. No main merge, production,
Sites, new provider/configuration, account or permission change is authorized.

Protected client records, pending fixtures/history, permanent Prestige and the
historical held Tab 5 are unchanged. Real account sign-in, MFA, recovery-email
delivery and persistence are not established by unit or local Demo checks.
Browser zoom and dynamic reduced-motion emulation are unavailable in the current
supported controls; the bounded zoom-key attempt did not change actual scale.
Static reduced-motion rules are covered separately. Existing broader security
and access gates remain open and unwaived.
