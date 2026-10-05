# PR #34 reconciliation with PR #35

2026-10-05: merged current main `27746e510240a11ab16392d93f55de1c9b604442`
into preparation head `63b384384ed234ed04bae6ba1539b7007c17678f` in an
isolated checkout. Merge commit `488d885768d46d8b96abc2a88f5c500d79a001f0`.
No conflicts; all staging configuration, Dockerfiles, wrapper, build script
and original backend Dockerfile are byte-for-byte unchanged by the merge.

Local reconciliation checks:

- Hosting wrapper: 5 tests passed. This suite uses a stub API, not hosted auth.
- Cloudflare transport compatibility: 7 tests passed; Cloudflare unchanged.
- Actual application auth/security/generic-save/create/ticket suites:
  58 tests and 325 subtests passed against synthetic persistence.
- Fresh Yarn 1.22.22 frozen-lockfile install succeeded, unchanged lockfile;
  existing resolution/peer warnings retained.
- Normal-auth staging build succeeded (main.ede7cc4d.js); no Demo build or
  ChatGPT publication. Existing bundle-size warning retained. Free/manual/scoped
  database/absent-secret YAML assertions, script syntax and git diff checks pass.

The missing-MONGO_URL startup was resolved by owner-entered provider settings.
Render subsequently ran `14c56286af4ae4d475e7503757f7fd3457f3296d` successfully.
The follow-up staging build retains standard authentication and enables only the
existing browser-isolated Demo; backend DEMO_MODE stays false. No ChatGPT Demo
version 109 publication or provider plan change is part of this delivery.
Current hosted outcomes and unavailable checks are in render-staging.md; exact
final merged/deployed SHA and final browser results are recorded in PR #34.

## Hosted persistence/restart acceptance additions

Use fictional tenants and records only, through normal application sign-in.
Retain exact Idempotency-Key, request payload and expected_updated_at for each
generic Asset or Vendor PATCH. Verify a normally completed command replay
returns the saved result without another update audit or duplicate Review.
After a later edit, replay the old command and verify newer values remain;
new stale edits must return conflict. Recheck revoked membership/read-only and
cross-client denials, including cached replay. Keep records unassigned or
pending when the underlying workflow warrants it.

Simulate lost response at the client transport boundary, not by installing an
unsafe hosted failure endpoint or suppressing server security checks. Reopen
the editor and use its retained original Retry identity; verify matching saved
state, audit and Vendor Review. Restart the staging API through the provider;
reopen the same Atlas-backed records, evidence and history and replay the
original command again. Confirm once-only effects and retained newer edits.

For an actual post-primary server audit/Review outage, use only a controlled
disposable verification runtime/database; the loopback script
backend/scripts/verify_generic_save_restart.py exercises this failure with
normal password login and API process restart. It intentionally refuses hosted
Mongo URLs. Do not broaden it to the staging credential or modify real records.
Hosted successful/lost-response persistence plus local injected-failure evidence
are distinct results; disclose any unexercised hosted server-failure path.

Record deployed SHA, successful Mongo/index startup, normal login/logout,
permission/tenant boundaries, evidence downloads and restart outcomes separately.
Build and health responses alone are not hosted acceptance. Existing dependency
advisories and production authenticated-browser gap remain separate follow-ups.
