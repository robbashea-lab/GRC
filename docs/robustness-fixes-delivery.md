# Demonstrated robustness fixes — delivery report

Scope F-01–F-04 only. Current baseline/refetched main: 57a2b4cd6adbf3e9d07fe24132ff28a3ad0bc215 (PR #33). Isolated branch codex/robustness-recovery-fixes.

## Checklist

- [x] Current code and affected callers inspected; isolated worktree; staging handoff inspected read-only.
- [x] F-01 durable generic keyed PATCH and frontend identity; failure/retry/concurrency/authorization/history regression coverage.
- [x] F-02 optimized search reproduction at 0 ms, fix and passing 0/30/100 ms plus back/forward.
- [x] F-03 actual opener focus, containment, Escape/Close/cancel/discard and removed-opener fallback.
- [x] F-04 PR #33 registry/discovery verified; only new regression module classified.
- [x] Declared backend runtime installed; relevant suites, actual Mongo, HTTP restart and normal/Demo builds.
- [x] Independent code/test review; demonstrated findings resolved.
- [x] Refetched main unchanged; no reconciliation required.
- [ ] PR checks and merge.
- [ ] Exact merged-source owner-private Demo publication and published smoke.

## Dispositions

F-01 fixed using existing command receipts, not new orchestration. Generic keyed PATCH retains original before/after images and conditionally marks its primary write. Retry reconciles required effects from current persisted relationships without overwriting newer values; audit metadata reflects original changes. Current resource authorization precedes cached replies; current field restrictions and optimistic concurrency remain. Unfinished saves cannot be deleted singly or in bulk.

Record, Review and Contact editors retain actor/client/record-scoped command identity in session storage. Uncertain saves show Retry; changed drafts cannot reuse the pending identity. Review ordinary Save/lifecycle cannot falsely report pending work Saved. Review Retry advances saved baseline while retaining newer local draft values. Legacy unkeyed callers remain compatible but do not gain durable recovery; lost client storage/identity is not automatically recoverable.

F-02 optimized baseline zero-delay replacement yielded Extedepot rather than Report. Immediate draft state and revision-tagged navigation fix the reproduced race while preserving intentional back/forward navigation. Five alternating Report/Extend values at all three delays now match input, URL and results.

F-03 ticket dialog restores actual opener; a removed opener falls back to a logical parent control or page heading/search. Dirty cancel preserves containment/draft; confirmed discard returns focus. Browser checks cover actual Action Items and CIS IG1, cumulative IG2, SOC 2 and ISO sources.

F-04 already resolved by PR #33. Normal fail-closed discovery remains intact. No duplicate registry fix.

## Verification

- Fresh Python 3.12 environment installed backend/requirements-runtime.txt; pip check: no broken requirements. Original requirements.txt blocked by unavailable pinned emergentintegrations==0.2.0. No pins upgraded. Test tools installed separately.
- Frontend reused installed dependency tree with unchanged package/lock inputs; not a fresh frontend install.
- python -m pytest tests -q: **623 passed and 690 subtests passed**, 203.43 s; eight existing FastAPI deprecation warnings.
- verify_mongo_recovery.py with --include-generic-saves --include-remediation-tickets: **76 passed**, 61.986 s, task-owned loopback Mongo, individual synthetic databases dropped.
- verify_generic_save_restart.py: normal password login; injected Asset audit/Vendor Review failures; real API process stop/start against same disposable Mongo; exact retries/lost-success replays; once-only audit/Review; database dropped.
- Before orchestration modification, three ASGI regressions reproduced failures in mocked persistence. Actual-Mongo/HTTP restart checks followed implementation; do not claim pre-change actual-Mongo regression runs.
- Relevant frontend: Action Items, Reviews, Contacts, Vendors, Risks, Policies, risk Review drawer, remediation drawer, createIntent and adapter.
- Final relevant frontend run: **10 suites, 93 tests passed**, 17.164 s. Dialog mock logs unknown autofocus props; real Radix browser focus checks pass.
- Normal/Demo optimized builds passed; existing large-bundle warning retained.
- Optimized browser: **13 scenarios passed**, including 0/30/100 ms search, back/forward, keyboard focus and removed source opener across four frameworks.
- Existing isolated one-ticket browser workflow passed: assessment creation, source/register once-only parity, completion/validation/evidence/history, refresh, Completed/source link, reopening, standalone task, mobile focus, other clients unchanged.
- Harness corrections preserve assertions: captured element handles for inert source background, Web Crypto/session isolation in jsdom, explicit Retry and same identity assertions.

Independent reviewer inspected code/tests and prompted fixes for pending deletion, missing Review recovery feedback and source fallback. Final independent backend scope **36 passed**; final frontend Review/Policy/identity scope **46 passed**, no remaining demonstrated blocker. This is not formal GitHub approval or production assurance.

## Coordination and limits

Open PR #34 staging preparation remains separate. Dirty Render deployment files and Cloudflare handoff inspected read-only, not edited. Staging clients should retain Idempotency-Key/body/version; preserve command-receipt indexes and declared runtime. No infrastructure, trust, production deployment, paid resource or client data changes.

Demo testing uses isolated browser storage. Actual backend persistence tests use disposable task-owned Mongo only. Authenticated-browser production integration remains a separate open acceptance item. Static Demo is not persistent backend/auth verification or production readiness.

Unchanged dependency advisories and source-only observations remain separate triage. No forced dependency upgrades or speculative audit expansion.

Guidance consulted: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), permissions every request; [WAI-ARIA APG modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), logical focus return. No whole-ASVS/WCAG conformance claim.
