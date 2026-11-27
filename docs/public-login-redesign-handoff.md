# Public login redesign — 2026-10-16

Status: implemented and verified in an isolated checkout. Focused tests, standard production build, paired native API/browser fixtures and saved visual comparisons passed within the limits below. Not pushed, merged, deployed or accepted by the product owner. Agent007 retains combined integration and release ownership.

## Source and delivery

- Repository: robbashea-lab/GRC; branch `codex/public-login-redesign-20261016`.
- Coordinated baseline: `2cef52886590551390809f61758784b2b0f2ca41`, tree `a18182108be246b1c7ebbdfc0b505d3956844058`.
- Tested, compiled and served application source: `f2521a286f05a396a92e826add97b98efb27b651`, tree `8f711d72dc61a3e99dd9d9c91a1da2fdda9eaa8c`. Later commits update only this handoff.
- Candidate main assets: `main.2cb66471.js` / `main.31299649.css`. All 13 files are hashed in Login-candidate-build-receipt.json; native HTTP preflight verified served index/main assets and JPEG against those hashes.
- Artifacts: C:/Users/RobbA/Documents/Codex/2026-10-16/files-mentioned-by-the-user-governara-3/outputs/. Receipt, Git bundle, binary patch, logs, API/browser JSON, screenshots, comparisons and tables are there. Scratch fixtures are outside Git and the bundle.
- Eight changed files: frontend/src/pages/Login.jsx, Login.test.jsx, LoginTwilight.css, LoginTwilight.css.test.js; frontend/src/assets/login-background.jpg; frontend/src/index.css; frontend/src/components/SixSurfaceAppearance.css; docs/public-login-redesign-handoff.md.

The final patch is restricted to login files, index.css and this handoff, compared against the owner's published `f539cd918efc4c88c4e7b6bc2f3c9bd7b89344bb`. That base already contains the two shared CSS prerequisites imported separately here in aacc3f7. The bundle retains isolated history from 2cef528. Review the owner's current combined source when integrating; replacing its checkout with this older isolated branch would omit other owners' work. No combined-source or exact-head CI claim is made.

## Appearance and operational decisions

All 13 reference manifest entries passed. Prepared HTML SHA-256: `701c9c9b2bd4874d1c767618437a5102c9ba1c4f73c6c5037ba44084cd3214d0`; only the two authorized reference edits exist. Original JPEG: 1858x944,161508 bytes, SHA-256 `a9f1ac187440dc536dab98c79c2524ed022be02bae93fa12ca38b139597cfeaf`; compiled asset matches. Exact city/owl scene, feather SVG, Inter, type, card, controls, wording and1100/900px breakpoints are used.

The reference governs appearance; native controllers govern operations. Standard sign-in calls login(email,password) then '/', where native routing selects landing. Both demo controls share guarded exploreDemo() then '/clients'. Login introduces no client selection; existing OrgContext selection behavior remains. Synchronous duplicate-attempt guarding, flags/notices, formatted errors, toast, password bytes, recovery navigation, session-generation fences and demo isolation remain native. Inline validation uses browser required/email validity without a new regex, password trimming or normalization. Username/current-password autocomplete, reveal, Caps Lock presentation, Enter, focus and status regions remain.

AuthContext, App/routing, API, recovery pages, backend, permissions, session policy and dependencies have no diff from baseline. No fake timer/success, identity provider, MFA flow or backend policy was added. Microsoft only announces "Microsoft sign-in is not available yet." Logo uses the existing '/' destination.

Capability gaps: native login accepts no remember-me option. The checkbox remains visible, unavailable and unchecked; its tooltip identifies existing session policy. No credential storage or session-duration change is claimed. Privacy, Terms, Security & trust and System status have no approved destinations in current source/configuration; labels remain disabled placeholders.

## Shared CSS coordination

Login presentation is scoped under #login-governara. The owner explicitly approved importing only two f539cd9 CSS hunks: native scrollbar exclusion for approved visual-surface markers, and removal of an ineffective pseudo reset in SixSurfaceAppearance.css. Separate commit aacc3f7 preserves provenance; other intervening source was not imported.

The owner reviewed the concrete mounted-login exclusion and compatibility refinement before isolated testing. Shared selectors use `:where(html:not([data-visual-surface]):not(:where(:has(#login-governara))))`; all declarations and zero specificity remain unchanged. Inner forgiving :where preserves existing styling in engines supporting :where but lacking :has. Native thumb/arrow paint was verified in matched mobile frames; legacy engines were not executed.

The sole ancestor exception in login CSS is `html:has(#login-governara) { color-scheme:normal; }`, constrained by the scope test. It matches the fixed target under saved account themes and ceases on unmount. No JavaScript root-marker ownership was added. Additional/CIS marker integration remains the shared owner's responsibility.

## Executed verification

At 6a5ef32d290a4b6801cf9274e34861fe963f12a6, seven suites/59 tests passed at original budgets (97.768s): Login, CSS scope/assets, AuthContext, legacy auth, logout, workspace-mode boundaries and ResetPassword. Earlier build receipt is separately labelled. On final f2521a2, affected Login/CSS suites passed21 tests at original budgets (27.249s). Standard production build (CI=true node scripts/staging.cjs) exited0 with "Compiled successfully". Main JS is byte-identical to the earlier tested build. Node24.19.0 differs from CI22; existing deprecation/bundle advisories retained, no check disabled. git diff --check passes.

Baseline build was copied from the owner's immutable2cef528 artifact; all13 files independently hash-verified. Main assets: main.1261be05.js / main.356f13d5.css. These are local build receipts, not hosted proof.

Paired native API fixtures passed49 baseline/53 candidate checks (four extra candidate image checks). Real unchanged backend handlers used synthetic memory data and private captured mail. HTTP evidence covers exact tenant grants, forced-change client403, unknown/disabled/trimmed-password401, cross-client403, logout bearer revocation, neutral recovery, policy422, reset200, replay400, old-password/session denial, new-password login and native429. Backend/security-runtime/password-policy hashes match. See native-api-preflight.json and independent AI review.

During the owner's21:22-21:37UTC browser loan, baseline/candidate fixtures used host-only cookies on127.0.0.2, isolated from root localhost and CIS127.0.0.1. Owner reached /clients and retained session on reload; provider/reader reached /dashboard; no-access reached / with native denial; forced-change reached /account. Each role completed native logout. Baseline demo and both candidate demo controls reached /clients then logged out. Candidate busy state disabled standard and both demo entries. Saved dark account theme returned to login with normal document scheme. Microsoft exact message had no auth request/navigation. Reveal, Enter/required-field focus and native server email validation were observed. A separate nonexistent synthetic account produced "Invalid credentials" in DOM; no screenshot/HTTP status was captured for that browser attempt. API401 is separate evidence. See login-evidence-final/native-browser-journeys.json.

Forgot opened native /forgot-password without mail merely on link click. Baseline/candidate reset pages consumed fixture token from URL, removed its query and showed blank new-password controls; back navigation returned through recovery to sign-in. No new credential was entered through browser. Actual password-policy/reset/replay outcomes were exercised through API above, not claimed as browser submission.

Final paired visual evidence in login-evidence-final binds to f2521a2:1440x1000,1024x900,390x844 and1101/1100/1099/901/900/899x844. All252 measured region bounds match. Five full-page pairs decode identically; three have mean channel deltas below0.001/255. Native mobile bottom frames are byte-identical and show native thumb/arrows. Independent AI review found no actionable appearance/geometry mismatch; this is not human acceptance. Full-page captures, computed-style/bounds JSON, hero/card/footer crops, paired frames, overlays, differences and final CSV are retained. Earlier login-evidence is labelled pre-correction6a5ef32.

Capture limits: full-page capture hides scrollbars, reflows mobile375 to390px and can retain old raster extent, producing a trailing strip. That390px full-page score is not native viewport acceptance. Native bottom375x812 frames match. The original candidate top projected152x330 versus reference375x812 and remains excluded. The explicit retake is375x812 and byte-identical to the reference top; measured native bounds also match. Bottom scroll metadata precedes screenshot clamping and is not exact raster coordinates. Font resources, computed styles and raster agreement were observed; no separate FontFaceSet API result is claimed.

## Return, limitations and next step

Native logout finished, login reloaded with empty email/password, viewport reset1280x720, and browser2 own tab2 returned to coordinator. Additional took next window. Root14/root4194/CIS4192 tabs/runtimes untouched. Our baseline/candidate/reference process exits observed; native fixture PIDs20368/9276 absent, runtime markers stopped, recovery-token files absent. No real account, persistent database, outbound email or hosted environment used; stopped fixture RAM accounts no longer run.

Automatic approval review rejected Remove-Item deletion of exact directory C:/Users/RobbA/Documents/Codex/2026-10-16/files-mentioned-by-the-user-governara-3/work/login-fixture-private and then its five named files, reason "blocked by policy". No further deletion/alternate-tool workaround followed. Remaining synthetic credentials/counters/stopped markers are outside Git/outputs. Directory ACL verified protected, only MIKEHAWK/RobbA FullControl. Manual cleanup remains; no secret values are included here.

Unexecuted: full suite/preview build, exact combined-head CI,200% zoom, physical Caps Lock, OS preference/reduced-motion runtime variants, arbitrary password managers/assistive technology, browser expiry/external identity, real email/Mongo durability, hosted HTTPS/cookies and staging. Related focused tests do not establish those runtime conditions. No mounted MFA/challenge found or added.

The user adopted prompt coordination. Agent007 (01a14053-f52f-7d71-aff9-6c8359f81e05) confirmed baseline, CSS approvals, serial heavy-work windows and browser loan directly. Plans delivered to Additional (01a1459d-2008-77b3-90f1-ff568ccd6e54) and CIS (01a145d3-9aec-7e83-96ff-aca25ee90e7d); their direct acknowledgment not claimed. Relay-hub reply failed routing and was reported to root. Heavy slot/browser released; root received actual return and cleanup limitation. Next: owner integrates narrow login change into current combined source, runs combined-head checks/CI and controls authorized staging. This task changed no PR86/staging/production state. No personal approval request pending.

Security guidance checked2026-10-16: [NIST SSDF](https://csrc.nist.gov/projects/ssdf/publications) (1.1 final,1.2 draft), [OWASP ASVS](https://owasp.org/projects/asvs) (5.0.0 stable), [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [MDN :has](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:has). This bounded work does not establish standards compliance.
