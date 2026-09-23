# Dependency verification

## Frontend

Use the package manager declared in `frontend/package.json`: Yarn Classic 1.22.22.
The release-gate verification used Node 24.19.0 on Windows. React Router requires
Node 20 or later. Do not mix npm-generated and Yarn lockfiles.

From `frontend`, on a fresh checkout with no `node_modules`:

```sh
yarn install --frozen-lockfile --ignore-scripts --non-interactive
yarn test --watch=false --runInBand
yarn build:preview
yarn audit:dependencies
```

Set `CI=true` when running tests in automation. Do not set it merely to hide build
warnings. There is no configured TypeScript project/type-check command; the
application is JavaScript/JSX. A build is not a substitute for browser testing.

Commit `package.json` and the Yarn-generated `yarn.lock` together. The frozen
install must leave the lockfile unchanged. Never hand-edit integrity values or
use `--update-checksums` to accept an unexplained mismatch. Yarn's documented
[frozen install](https://classic.yarnpkg.com/lang/en/docs/cli/install/) and
[lockfile](https://classic.yarnpkg.com/lang/en/docs/yarn-lock/) contracts apply.

Dependency lifecycle scripts are disabled in this workflow; the tested app's
tests and production build do not need them. If a future dependency requires a
script, review that specific script before changing this policy. Do not disable
TLS verification or engine checks to make installation succeed.

The audit script inventories the installed tree and sends package names/versions
to npm's public bulk advisory endpoint, not application source or environment
values. It reports all installed locations for an affected package name; compare
each version to the advisory range. It is an inventory report, not an exploitability
verdict, dependency-path metavulnerability calculation, or automatic security gate.
Network failure exits nonzero rather than reporting a clean scan.

## 2026-09-23 advisory disposition

The first clean tree reproduced 23 advisory entries over 1,304 package names.
Targeted, same-major updates:

| Package | Before | After | Scope |
|---|---|---|---|
| react-router-dom / react-router | 7.15.0 / 7.15.1 | 7.18.4 / 7.18.4 | Browser navigation; align versions and address redirect advisory as well as non-used server modes. |
| postcss | 8.5.10 | 8.5.28 | Build/test CSS processing. |
| fast-uri | 3.1.2 | 3.1.8 | Build tooling's URI/schema handling. |
| qs | 6.15.2 | 6.16.0 | Development-server/tooling query parsing. |
| js-yaml | 3.15.0 / 4.3.0 | 3.15.2 / 4.3.2 | Build/lint/test configuration. Preserve both supported major APIs. |
| postcss-svgo's svgo | 2.8.1 | 2.8.4 | CSS build optimization. |

Version identities, upstream repositories and integrity metadata were checked
against npm. Sources consulted include upstream-published advisories for
[YAML CPU exhaustion](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj),
[PostCSS file reads](https://github.com/advisories/GHSA-6g55-p6wh-862q),
[Router redirect handling](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6),
[Router framework-mode matching](https://github.com/advisories/GHSA-chx6-hx7r-mcp5),
[qs parsing](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), and
[SVGO script-removal bypasses](https://github.com/advisories/GHSA-w27v-7q3p-w38r).
The registry response also includes subsequent fixes; the selected same-major
patch versions avoid stopping at an older, incomplete fix.

After updates: **three advisory entries remain**, all affecting SVGO 1.3.2 through
`react-scripts -> @svgr/webpack -> @svgr/plugin-svgo`:

- GHSA-2p49-hgcm-8545 (high)
- GHSA-w27v-7q3p-w38r (high)
- GHSA-4vpr-x523-8j87 (moderate)

Disposition: retained build-time legacy dependency, not used as a sanitizer for
user content. The repository has no application SVGO import or `removeScripts`
configuration; Evidence is stored/downloaded by the existing API, never compiled
through SVGR. Upstream explicitly distinguishes trusted local optimization from
the affected hostile-input sanitization use case. SVGR 5 calls the old SVGO class
API, so forcing SVGO 2 into that branch would not be a safe patch. A future build
toolchain migration should retire this branch. Do not use it to sanitize untrusted
SVG or run unreviewed assets/build configuration as trusted code.

Existing peer/deprecation warnings remain (CRA/Jest tooling, react-day-picker's
older React/date-fns peer range, and pre-existing cross-major resolutions).
They are not silently fixed by unrelated major upgrades. Clean test/build/browser
verification is required; absence of advisories is not claimed.

## Backend

`backend/requirements-runtime.txt` remains unchanged. A fresh pip-audit 2.10.1
direct-pin scan returned no known vulnerabilities for its 12 pins. This used
`--no-deps --disable-pip`: it is **not** a fully resolved/hash-locked transitive
runtime audit. Persistent container validation and transitive reproducibility
remain separate observations; do not claim whole-environment supply-chain assurance.
