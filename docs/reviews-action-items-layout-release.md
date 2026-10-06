# Approved Reviews and Action Items layout release

Baseline: `efa5059eb430a2768d6f786d4ad30c2990f2f574` (remote main fetched 2026-10-06). Combined release: [PR #49](https://github.com/robbashea-lab/GRC/pull/49).

The supplied HTML mockups define presentation; their sample records and illustrative interactions do not replace existing application logic. No catalog, source wording, recurrence, permission, stored-data or deployment-automation change is included. Missing ISO source comparisons remain separate unfinished work.

## Implementation and review

Reviews removes summary indicators, preserves current-register/history filtering, uses All / Assigned to Me, adds bounded pointer and keyboard column resizing, and moves complete existing requirement guidance into readable Requirements sections. The existing review controls, editable context and historical read-only structure remain. Action Items removes summary cards, presents existing title/finding/origin links, and uses shared wide dialogs for existing tickets and new records. People management remains in its dedicated module. Shared close/cancel paths protect unsaved drafts for every client.

Two isolated implementation agents cross-reviewed each other. An independent third agent reviewed the combined diff and corrections: normal status calculation, measured resize announcements, six/three/two summary bands, toolbar rows and nested form links. Independent 48-test rerun passed through `9b901d5`; the final Cancel regression is checked separately. This is independent agent review, not a GitHub approval or branch-protection waiver.

## Actual local verification

- Combined initial focused run: 16 suites / 155 tests passed. Corrected Review/draft run: 12 suites / 130 tests passed through `9b901d5`. Final changed controls are rerun before merge.
- Both optimized builds passed; final exact source builds and the normal GitHub Release gate are required before protected merge. Existing bundle-size/deprecation warnings remain; no dependency or timeout changes.
- Backend classified offline run: 640 tests and 698 subtests passed. Real MongoDB 8.0.28 recovery/program lifecycle/CIS IG2+IG3/remediation/generic-save matrix: 97 tests passed. These are disposable local checks, not authenticated hosted evidence.
- Loopback standard application, DEMO_MODE=false, uses a fresh `test_reviews_actions_*` database on a dedicated Mongo port. Five labelled synthetic clients represent Brawndo/CIS IG1, Initech/CIS IG3, Prestige/SOC 2, Dunder/ISO and a new CIS IG2 client. Normal authentication, API writes and browser saving use the actual backend/database.
- Browser verified normal Review saving and tab draft retention, keyboard resizing, focus return, Review-to-ticket creation, complete finding/origin display, work completion followed by required administrator validation, reload persistence and reopening with retained decisions. New-client shared forms were exercised.
- Desktop Review width measured 1380px at a 1440px viewport; title 20px, six summary columns. At 750px three columns; at 470px two columns without dialog overflow. Final toolbar count/search and History/filter placement were compared visually to the approved mockup. Existing sidebar/table behavior outside the changed surfaces remains out of scope.
- Separate browser-local Demo checks inspected Brawndo grouped CIS prompts, Dunder ISO management agenda and source/cadence distinction, Prestige SOC criterion/source links and editable context, and Initech scheduling/new forms. Light/dark and responsive screenshots retained locally. Existing authored ISO guidance is not represented as official text or full normative verification.

## Delivery boundary

Final implementation candidate `a2dccf19dbca3a8bf96fce8a9715b05acf5cef00` resolves the independent desktop Requirements finding with scoped 1.4fr / 1fr columns, collapsing at 750px. Existing source content, editors and generic default rendering are preserved. GitHub review also identified normal Action comment loss on Save/Complete and an authoritative Finding refresh causing a false dirty warning; both existing guards now cover normal Action layouts. Reverting those two guard changes reproduces three regression failures. Independent final code review passed 8 suites / 77 tests; refreshed CIS and ISO screenshots passed independent visual comparison. Coordinator final focused run passed 11 suites / 122 tests.

The browser-local Demo Review edit survived reload while before/after hashes of all 18 collections in the disposable authenticated database remained identical. Normal browser checks additionally inspected the SOC 2 and ISO synthetic Review Requirements and existing Action ticket dialogs, and the CIS IG1 shared Review. These checks are local, not hosted acceptance.

PR48 owner explicitly released the exclusive staging/session/publication slot to this coordinator. Exactly one enabled staging login account must remain; disposable multi-user tests stay local. No credentials/cookies are transferred. Merge uses normal protections after current-main reconciliation and final-head checks. Render receives only the established automatic deployment after main CI; no duplicate/manual trigger. The existing owner-private Sites URL is updated from the same merged source, with access and Free plans preserved.

Exact tested/merged/deployed SHAs, main-push gate, Render deployment revision, private preview version and actual hosted acceptance results are recorded in the final PR49 deployment handoff. Until that handoff is posted, hosted delivery is pending. Local/mocked results above do not establish hosted acceptance, production assurance or ISO normative completeness.

