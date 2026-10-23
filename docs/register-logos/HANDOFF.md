# Vendor and AI register identity logos — October 23, 2026

## Scope and ownership

Robb requested implementation with Agent 007 in the shared candidate, preserving behavior. Agent 007 froze the chart candidate at `25227d44a778575d01991e5bc0f5b22f6c2b8577` (tree `74f490d25109b2e26af935ef7396751fdef83254`, PR #91) and granted this isolated worktree only: `codex/vendor-ai-register-logos-20261023`. Agent 007 retains integration, publishing, browser/server and staging release ownership. No merge or production deployment.

The logo scope covers Vendor/AI identity cells across authorized Demo and authenticated workspaces, independent of client/framework. Other cells, filters, counts, charts, permissions, visible creation/editing controls and commands remain native.

## Catalog contract decision

Both existing pickers discarded catalog selection and both native models lacked a persisted association. Robb explicitly approved an optional server-validated `catalog_key` on Vendor and AI records. The shared registry defines 21 Vendor identities and the 10 existing AI template keys. There is no migration, seed change, backfill, provider/name matching or logo-editing UI.

Native selection populates the key; Save/read/reload/rename preserve it. Start blank clears the Vendor key. Missing/invalid references render distinct generic Building/AI-chip icons. The field is excluded from AI approval scope and screening/risk calculations. Existing tenant, write, version and workflow guards remain in place.

Only static bundled picker assets are resolved into decorative images. iVenture's existing embedded JPEG is reused; other Vendor SVGs and AI data SVGs retain their exact artwork. KnowBe4 and DocuSign currently have no bundled logo and use the generic fallback. Microsoft 365 Copilot and Copilot Studio retain distinct catalog keys even though their current picker artwork is shared.

The shared component anchors the current 36px/radius-9 square and native light/dark tokens, contains images, reserves the same footprint during load/failure and does not retry failed sources. The AI concept page keeps its existing neutral frame tokens. Images retain the native catalog's white canvas so black artwork remains legible in dark mode; assets are not recolored. Table text remains in native flow with unchanged cell padding; horizontal space alone is reserved for the mark. No record-provided markup or logo URL is accepted.

## Verification so far

- Package: six manifest hashes pass; all four documents and both SVGs read. Referenced PNG screenshots are absent from the supplied ZIP.
- New identity/resolver/component/Demo suites: 27 tests pass. Includes create/read/store-reload/rename, custom/legacy defaults, exact products, invalid/cross-module keys, failure recovery and approval neutrality.
- AI/Vendor consumer suites: 26 tests pass, including preserved names, Vendor subtitle, original opener objects, no extra focus target and no write on logo display.
- Existing AI contract, Vendor filter and Vendor workflow suites passed in the earlier focused campaign. AI contract suite ran in 50.108 seconds under its original limits.
- Backend native route campaign: 34 tests pass with eight existing FastAPI deprecation warnings. Covers optional identity persistence, invalid create/update/bulk, legacy omission, cross-client and read-only denial, plus existing AI/Vendor governance behavior.
- Independent AI source reviews covered UI and backend/Demo changes. A proposed table-padding change was removed after review to protect density. Backend testing caught a blank-key bypass in the existing change filter; the new field is now validated before that filter. Tests and native validation were not weakened.
- The final independent boundary review found no issues with validation before the Vendor blank/no-op filter. It confirmed the legacy regression rejects an empty key without changing the stored document and still permits an unrelated rename.
- Initial new Demo Vendor fixtures lacked required Service/Product; fixtures were corrected. Initial backend launch hit Windows temp permissions before collection; a fresh isolated worktree temp path preserved the configured two workers.

## Combined release checkpoint

The isolated logo source is frozen at `3d9f5fc3fa02f06770acee45e94c04eab30551a4`; both standard and private builds passed. Agent 007 integrated it with the Portfolio patch atop the qualified chart revision `25227d44a778575d01991e5bc0f5b22f6c2b8577`, on `codex/portfolio-logos-staging-20261023`. The integrated checkpoint `59639c18` passed 560 frontend tests across 39 suites, 38 backend tests with 54 subtests, and both CI=true builds. Four added native API regressions explicitly cover tenant/read-only denial of valid catalog changes, rejected mixed-field and multi-record writes, nullable clearing and stale restoration without changing stored records on failure. Independent integrated AI reviews found no introduced defect; this is not human approval.

Rendered comparisons and native picker/create/reload/rename journeys remain a separate gate. The allocated loopback host imports the combined native backend and uses only disposable synthetic fixtures; the existing shared fixture host and accounts must remain unchanged. No source inspection or React DOM test substitutes for browser execution. Agent 007's current handoff records subsequent corrections, final exact-head checks, served assets and staging proof. Historical chart CI does not qualify this combined revision. No merge, production action or human acceptance is claimed here.

## Native QA corrections

Actual authenticated CIS forms exposed two request-contract failures after the first combined CI pass. New Vendor drafts no longer invent the unsupported `connected_system_ids` field; explicitly supplied and retained metadata remain intact. Robb approved bounded storage for the existing AI form's `environment`, `restrictions`, `data_settings` and `permitted_data_types` fields. The native API validates those values and requires an active, persisted CIS enrollment. Legacy missing fields stay absent, retained create receipts remain replayable only for exact historical fingerprints, and real changes to these four fields on approved records reject safely without altering the original decision/history. No authenticated approval command, migration, backfill or access expansion was added.

Focused native-route regression tests cover strict boundaries, scope changes during awaited commands/leases, stale and unauthorized writes, exact retry behavior, legacy absence and retained approvals. A current source/CI/build/native-browser/staging receipt is still required for the corrected revision. The observed long Vendor name/subtitle wraps caused by the reserved logo footprint remain an explicit visual limitation; other columns and native form layouts are preserved.
