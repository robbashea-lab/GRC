# Phase 3 — Evidence architecture inspection

Inspected before implementation, September 15, 2026.

1. Evidence input: filename, client_id, content_base64, mime_type, linked_type, linked_id, occurrence_id and notes. Backend adds evidence_id, version=1, SHA-256, uploaded_by, uploaded_by_email and created_at.
2. Bytes currently live as base64 in the Mongo Evidence document. Demo keeps base64 in isolated sessionStorage, with a 1 MB upload limit. Storage is not being redesigned.
3. Direct source is linked_type + linked_id. Supported parent kinds follow existing authorized-parent mapping: Review, Finding, task/Action, Risk, Vendor, Policy, asset, exception, requirement, contact, AI system and framework assessment; singular/plural aliases are accepted by backend.
4. No source titles are maintained on Evidence. The library currently prints the raw source type/ID. Uploader email is populated by backend but missing from new Demo uploads; some seed rows have only uploader ID. Resolve authorized existing user data, otherwise show Unknown uploader.
5. created_at is the common upload timestamp. Demo also records uploaded_at and size. Existing backend content hashes and Review evidence snapshot identifiers remain unchanged.
6. Each Evidence record has one client_id. Backend list scope, create-parent authorization, download client checks and platform-only delete checks are established authorization gates. Parent lookup is tenant-based; no additional module-specific RBAC is invented.
7. Review Evidence has occurrence_id. Missing legacy occurrence IDs belong only to the initial execution. Completed Review snapshots retain Evidence IDs/version/hash and original occurrence metadata; do not reinterpret them as current-quarter uploads.
8. Finding/Action/Risk/Vendor/Policy ownership is direct only when that record is the linked source. A task's finding_id, review_id, occurrence_id, risk_id and vendor_id provide contextual relationships, not extra Evidence ownership.
9. Finding context can safely expose its directly attached files, its corrective Actions' files, and the exact originating Review occurrence's files. Risk treatment context uses actual task relationships. Review remediation context uses matching Review and occurrence IDs, not titles.
10. Vendor assurance/contract evidence_ids reference existing files; they do not make a Vendor assured/active. Policy files keep the current Policy linkage; approval/version binding is explicitly out of scope.
11. Framework assessments support direct attachments and existing record links. No new compliance mapping or evidence-based assessment conclusion is needed.
12. Backend deletion archives the inventory entry while retaining bytes. Review snapshots, completed Actions, closed Risks, Vendor assurance/contract/history and retired AI records have retention safeguards. Demo currently removes deletable files; any parity correction must preserve retention safeguards.
13. Backend download checks the Evidence client's authorization and does not require the source still to exist. Retained orphan files must remain retrievable without inventing a source title or exposing another client's record.
14. Current library metadata query silently caps at 1000; Related Evidence can cap at 200. New context/library views need explicit counts and pages, not hidden caps or a per-file source request.
15. Review drawers already select the correct occurrence when requesting direct Evidence. Generic drawers show only direct Evidence and Finding validation does not surface proof. Source opening must reuse existing drawers and historical Review selection.
16. No file copies, schema migration, new ownership fields, immutable validation-time archival engine, new navigation or lifecycle/RBAC changes are required.

## Planned read model

Use a paginated metadata endpoint, batch-resolving authoritative source/Finding/Review/uploader context. Search and existing column filter state apply across the scoped dataset, not just the displayed page. Batched scans bound memory and eliminate per-file request waterfalls; large-dataset query-cost tradeoffs must be reported. Context is computed, never persisted on Evidence. Contextual views are download/source-navigation only, with deletion left to existing direct-owner surfaces.

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| Medium | frontend/src/pages/Evidence.jsx | Raw IDs, no source search | Readable context, exact source links, search and counts/pages | Explain the activity supported by each file |
| Medium | frontend/src/components/RecordDrawer.jsx | Direct-only empty state and validation context | Explicit direct/related groups, source attribution and proof during validation | Avoid implying relevant proof is missing |
| Medium | frontend/src/components/ReviewDrawer.jsx | Direct files only, little visible occurrence context | Occurrence-labelled direct files and separate remediation evidence | Preserve provenance |
| Medium | frontend/src/preview/adapter.js | Missing uploader email, Evidence-specific parity gaps | Normal uploader fields and established access/retention checks | Honest and consistent Demo behavior |

UI skills are limited to grouping, feedback and existing accessible controls. No new animation or visual design system is planned. Verification and remaining limitations will be reported separately.

## Implementation and verification

- Added the read-only `/evidence/catalog` endpoint, shared source-kind definitions, Demo catalog parity, runtime source resolution, and reusable EvidencePanel/download/pagination controls. No new Evidence ownership or storage fields, migration, startup seeding, or lifecycle rules.
- Library and contextual requests have explicit filtered/unfiltered totals and pages (25 in the UI, maximum 100 per API page). Metadata is processed in batches of 100 with batched source lookups; file bytes are not returned in catalog responses. Search spans the scoped dataset. Facets are limited to 200 distinct values with a visible notice, not silently truncated file results.
- Tradeoff: backend source-title search/counts still scan the client's Evidence metadata. Memory is bounded but work grows with inventory size; an indexed read model/aggregation is a future scaling decision. Legacy `/evidence` and generic Related endpoints remain for compatibility and are not claimed to be universally uncapped. Vendor assurance selection remains unchanged.
- Direct Evidence retains one authoritative linked_type/linked_id. Finding context adds Action files and its original Review occurrence. Review context groups direct occurrence, Action and Finding files separately. Risk context separates direct and treatment files and removes the redundant legacy Evidence list. Contextual groups expose source navigation/download, not deletion.
- New Demo uploads record uploader email. Existing identities are resolved only when available and client-authorized; unknown historical uploaders remain unknown. Demo inventory deletion now retains bytes as the backend already does, with existing retention restrictions intact.
- Missing or cross-client sources have no source content/link; authorized retained files remain downloadable. Review references fail closed when their original occurrence cannot be found.

### Automated-test verified

- Frontend: 228 tests, 43 suites passed. Includes eight new Evidence context/parity/interaction cases and the retained accessible-action test.
- Backend: 130 available isolated unittest/ASGI tests passed. Evidence-specific tests exercise actual routes using a test database and role fixtures, including client-contributor/read-only denials, foreign-client/source isolation, archived bytes, retained completed-Action deletion rejection, Q3/Q4, validation ownership and 1,005-file pagination.
- Fifteen legacy external-server test modules (`test_iteration*`, `test_audit_logs`) were not run against a persistent staging backend. No live standard authentication or live role-account claim is made.
- Production preview build passed. Only pre-existing hook warnings remain in Calendar, ClientDirectory and PlatformAdmin. No standalone lint/type-check scripts are configured; build-integrated ESLint ran. Docker packaging was updated for the shared JSON but no Docker image was built.
- Final candidate browser bundle: `main.748d1bd4.js`. Git diff whitespace check passed; changed paths contain no environment files, credentials, generated build files or QA upload fixtures.

### Browser verified in isolated session Demo

- A fresh Harbor Evidence Lab test client: Review -> NO ISP -> MAKE AN ISP, Action-only ISP-v1.0.pdf, direct Finding empty, exact Action source link, completion/pending-validation, proof visible during deliberate validation, draft rationale retained after opening/closing the source, and no copied attachment.
- Separate policy-review-checklist.pdf (Review), missing-policy-confirmation.pdf (Finding) and ISP-v1.0.pdf (Action). Files uploaded after validation are labelled; current retained Evidence is explicitly not a point-in-time validation snapshot.
- MFA not consistently enforced: Enable privileged MFA, Disable legacy auth and Document exceptions each have their own file; validation groups all three correctly, source Review files separately, no direct Finding copies and no contextual delete controls.
- Completed Q3, generated Q4, uploaded q3-access-export.csv and q4-access-export.csv separately. Q4 started empty. Library Q3 source opened the historical Q3 drawer; its direct and related files exclude Q4.
- Filename/source/Review-title search, PDF + search, exact 8-file/3-file/1-file/zero-result counts, clear filters and client switching. Northstar shows its own six files, not Harbor's eight. Source links for Review, Action, Finding, Risk, Vendor and Policy open exact drawers.
- Risk direct vs treatment grouping; nested upload refresh. Vendor upload leaves assurance missing and Vendor Onboarding. Policy remains Approved with its existing history. No lifecycle conclusion derives from a file.
- Final-build smoke: Risk duplicate list removed; Dashboard count 1 -> one record -> exact Review; Portfolio Past Due drawer; Calendar, Action Items, Contacts, Onboarding, Client Settings and CIS IG1 loaded. Earlier in this same pass, Review/History, Findings, Risks, Vendors, Policies and Evidence workflows were exercised. No captured browser console errors.
- At the existing 1280x720 desktop viewport the Evidence table and source text remain readable without document-level horizontal overflow. Existing compact design, colors, navigation and drawer pattern are preserved.

### Explicitly not verified / deferred

- In-app browser download was clicked, but its download-event wait timed out without an application error. Completed filesystem download is NOT browser-verified. Authorized bytes/filenames and forbidden downloads are API-test verified; download implementation retains the existing data-URL behavior.
- No actual client-role browser accounts or persistent standard backend were available. Super Admin Demo checks are not evidence of live client-user authorization. Backend role/client checks are isolated automated tests, not staging browser QA.
- Immutable validation snapshots, policy-version approval binding, OCR/indexing, DMS features, retention-rule changes, compliance conclusions, all-device/accessibility audits and exhaustive animation slow-motion checks are not included.
- UI review decision: approve the scoped evidence grouping, source affordances and empty-state improvements; no new visual system or motion work. Live standard-backend and actual file-download sign-off remain pending.
