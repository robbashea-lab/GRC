# Final release stabilization — 2026-10-06

## Verified starting release

Fetched remote main: `6cb6a92974b5d10b71c24fd8d4686a13ebcefe3b`; PR42/43/44 are merged. Exact main **push** [run 37498535120](https://github.com/robbashea-lab/GRC/actions/runs/37498535120) is completed/success. Live Render UI confirms the same commit, deployment `dep-db2iisrncjis738j2jpg`, Auto-Deploy, Free Docker, connected GRC/main, and saved **After CI Checks Pass**. GitHub rule UI confirms PR required, strict/up-to-date GitHub Actions `Release gate`, administrator bypass disabled, force push/deletion disabled. No settings changed.

Sites confirms owner-only/custom access, no external viewers, successful private version117 deployment `appgdep_6ac529a95188819186d1fc2be01418f8`, archive-backed source exactly `6cb6a929`. URL remains unchanged. Normal and Demo builds intentionally use different sign-in flags, assets and storage boundaries.

## Hosted observations on starting release

- Normal Sign out returned `/login`. Owner entered existing credentials privately; fresh administrator sign-in reached the portfolio and survived full reload. No credential was read or recorded.
- Existing synthetic client only: `Synthetic PR36 Assessment Release QA`. ISO4.1 existing implementation text was retained and a clearly labelled final verification note appended. Save/full reload/reopen retained it and Partially Implemented remained unchanged.
- Existing ticket `finding:fw_143f724a90c25dabbd15a8a3703a19a2` was edited from ISO7.1 Findings and reopened from Action Items with the same ID and saved note. A reverse labelled note was saved and reopened from its ISO source; both notes persisted at the same ticket ID without changing status/owner/date, creating duplicates or completing work.
- Calendar: existing synthetic monthly Review `rev_1446fce82660` / November occurrence `occ_0c7e7648d6d3` moved from2026-11-30 to2026-11-29. Full reload/source drawer confirmed due2026-11-29, Monthly unchanged, next2026-12-30 unchanged, completed October2026 history due2026-10-29 retained.
- Demo: a labelled marker was saved in fictional Initech organization notes in a separate browser tab. Normal portfolio remained its three staging synthetic clients; normal ISO7.1/ticket reopened from backend with original implementation and both saved sync notes unchanged. This verifies the observed workflow boundary, not a whole-database equality audit.
- Existing synthetic Evidence download was attempted using the actual browser download event before clicking Download. It timed out after15seconds. Downloaded bytes are **not verified**; API retrieval is not a substitute. No application correction is justified by this adapter timeout alone.
- Render Environment lists no `EMERGENT_EMAIL_KEY`; source `send_email` uses that HTTPS provider key. No approved sink exists and no email was sent. Provider delivery remains unavailable, separate from mock transport tests.

## Demonstrated dependency findings and narrow correction

Fresh frozen Yarn install, lifecycle scripts disabled, lockfile unchanged before edits. `node scripts/dependency-audit.cjs`:1304 package names,20 advisory entries. Fresh resolved runtime `pip-audit -r backend/requirements-runtime.txt`:18 matches across PyMongo4.18.0 and PyJWT2.13.0; this includes transitive resolution, not only direct-pin scanning.

| Dependency | Correction | Exposure and evidence |
|---|---|---|
| Axios |1.18.0 →1.20.0|Browser-shipped transport;12 advisory matches. Several require Node HTTP/HTTP2 or prior prototype pollution; no exploited application path is claimed. Existing interceptor mutates/returns its own config, keeps headers and Demo adapter. Same-major security release. [Maintainer advisory](https://github.com/axios/axios/security/advisories/GHSA-j8rh-479h-cp32).|
| shell-quote |1.9.0 →1.11.0|Build/dev tools only. Old `quote([{comment:'qa'}, '\n echo SYNTHETIC'])` returned unsafe newline output; new version rejects it with TypeError. No shell command was executed. [Advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).|
| source-map-js |1.2.1 →1.2.2|Build CSS/source-map processing, not backend request handling. Patch removes reported indexed-map CPU risk. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).|
| PyMongo |4.18.0 →4.18.2|Runtime driver;4 advisory matches. App does not use GridFS/CSFLE or interpolate request input into Mongo URI; native BSON issue merits compatible patch. [Release](https://github.com/mongodb/mongo-python-driver/releases/tag/4.18.2).|
| PyJWT |2.13.0 →2.15.0|Authentication runtime;14 matches. App pins HS256, secret from configuration, fresh options per decode, no JWK/DPoP imports. Compatible released security fixes; no demonstrated token forgery is claimed. [Release](https://github.com/jpadilla/pyjwt/releases/tag/2.15.0).|

Registry/PyPI package identity, source and compatibility were checked. Yarn generated the narrow lockfile; no new application dependency or broad upgrade. After correction: frontend6 advisory entries remain (braces3.0.3, selector-parser6.1.4, three SVGO1.3.2 entries, sprintf-js1.0.3), all traced to build/test tooling. Trusted repository inputs only; not used to sanitize user Evidence. No patched braces/sprintf release is available in the registry. Selector-parser/SVGO major API migration is deferred. Backend resolved runtime scan returns no known vulnerabilities; this is not a security assurance claim. `pip check` passed.

## Verification and open gates

Starting baseline:15 focused frontend suites /88 tests /1 snapshot passed; all640 offline backend tests /698 subtests passed. Updated dependencies:27 focused frontend suites /143 tests passed; both staging and Demo builds compiled. Existing bundle-size/deprecation warnings remain. Full updated offline backend:640 tests /698 subtests passed; updated real disposable Mongo matrix:97 tests passed (baseline full matrix including six-year:99 passed). Authenticated restricted-role and cross-client denial assertions ran in those isolated API matrices with real Mongo; hosted disabled users were not enabled. Native shell-quote regression passed. Exact final-head/main CI and deployment must be recorded at delivery.

Native MongoDB Database Tools100.19.1 archive SHA256 was verified against MongoDB's official release manifest (`527738a0f9ab2d80ea40cb8fc7a68f8e28664a2fd4e3b63626c2d4629aeb7f37`). A new loopback Mongo8.0.28 instance on27146 only received synthetic databases. `mongodump --archive --gzip` / `mongorestore --nsFrom --nsTo` restored six synthetic collections into an empty distinct database; document equality, unique index, binary Evidence bytes/hash, completed history and recurrence anchors matched. Source/restore databases and archive are retained locally. This is **local native restoration**, not Atlas backup/restore or hosted recovery. No staging database access/overwrite was attempted.

Reported harness failure remains unresolved: shared helper issues exactly one terminal action per visible branch; published branch awaits `route.fetch({maxRedirects:0})` then fulfill/abort. Prior drain attempt still exited1, so teardown race is a hypothesis. The current supported browser API exposes no routing/context hooks to run or instrument this named harness. No shell browser-control bypass, exception suppression, guessed guard or assertion change was made. Need a supported Playwright runner that can reproduce/trace the same published execution, including teardown; passing scenario assertions alone do not close this gate. [Route fetch contract](https://playwright.dev/docs/api/class-route#route-fetch) and [unrouteAll behavior](https://playwright.dev/docs/api/class-browsercontext#browser-context-unroute-all) consulted.

Still separate: browser downloaded bytes, hosted restricted identities, hosted backup/restart, email sink,111 ISO source comparisons, manual usability acceptance and production assurance. Exactly one enabled staging account must remain; disabled QA users are never enabled.
