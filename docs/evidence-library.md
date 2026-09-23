# Evidence Library implementation

## Inspection (before changes, 2026-09-23)

- Mongo Evidence documents own immutable base64 bytes, ID, SHA-256, version,
  client, uploader/time and original linked source. Demo stores isolated session
  bytes. Preserve both; no filesystem/folder migration or upload duplication.
- `evidence_context.py` already pages metadata and batch-resolves source titles.
  Search scans metadata, not bytes. Extend this rather than add another catalog.
- Review snapshots preserve evidence IDs/hash/version and occurrence identity.
  Untagged legacy files belong only to the initial occurrence. Historical sets
  must use those identities, not upload year or today's Review schedule.
- Vendor assurance/contract IDs, Policy approval basis/history and framework
  related_links already reference Evidence. Project these references; do not
  create another authoritative version/assurance/assessment store.
- Existing source-context inheritance (Finding -> Action/Review and Risk ->
  treatment) is useful context, not permission to rewrite original provenance.
- Upload/download use server-side client scope; writes require writable roles,
  deletion internal administrators. Deletion archives inventory while retaining
  bytes; completed Review/Action, closed Risk and Vendor history restrict it.
- New supporting links must validate both tenants and exact Review occurrence,
  serialize against Review completion, and never replace historical snapshots.
- Current flat page has a dominant upload area and no evidence-item drawer.
  Replace presentation with browse/search, compact existing table controls and
  shared drawers. Keep uploads in operational modules.

## Design boundaries

Original source remains immutable provenance. Additional supporting relationships
are set-valued references on the same Evidence Item. Existing module-owned
relationships stay module-owned and are changed there. An Evidence Set is a
projection of a Review occurrence, never a new Review or copied files.

No new approval authority, required-evidence rules, external auditor portal,
package export, OCR, malware scanner or storage provider. Download remains
authenticated; do not embed active uploaded HTML/SVG in the application. The
[OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
informs that boundary; file MIME metadata alone is not a security guarantee.

Existing data is read compatibly, without bulk startup migration/reseeding.
Unknown provenance remains unknown. Verification/results follow implementation.

## Delivered organization

The existing Evidence document still owns the bytes, ID, hash, upload actor/time,
original filename, and artifact version. Optional display name, restrained
Evidence Type, evidence/effective/expiration/refresh dates and notes are metadata,
not a replacement file. Supporting relationships contain kind, record ID and
Review occurrence ID when applicable; no additional file storage is allocated.

Original upload provenance cannot be unlinked. Vendor assurance/contract IDs,
Policy approval source/subject/history and framework related links are resolved
from their existing modules. Framework relationship changes use the existing
framework endpoint, including its unlink exclusions; there is no competing
framework link store. Relationship addition/removal and metadata edits appear
through shared audit events. Framework link/unlink events are projected into
the item's Activity tab, not copied.

Review Evidence Sets project existing occurrences. The year selector uses the
scheduled due year, and quarter/month/exercise labels use existing recurrence
logic. A new occurrence does not inherit the prior occurrence's files.
Completion includes explicitly reused Evidence in its immutable ID/hash/version
snapshot. Set detail shows recorded completion/reviewer/outcome and links to
current Findings and Actions originating in that exact occurrence.

Point-of-work uploads remain in Reviews, Policies, Vendor Security Assurance,
Findings, Risks and framework requirements. Shared operational Evidence panels
can reuse a paged existing file. Reused Policy files may be selected as an
approval basis without changing approval authority. Library rows and drawers
open the authoritative source record. Policy current/previous approval-document
labels come from actual approval references; no separate Policy version system.

## Interface and retrieval

| Before | After |
| --- | --- |
| Upload-first flat inventory | Program-area browsing and compact Add Evidence |
| Original source context only | Item Overview, Related and Activity drawer |
| Review files require operational navigation | Review -> scheduled year -> occurrence Evidence Set |
| Generic file metadata | Classification, optional dates, refresh state and source search |
| File deletion at a supporting record | Explicit supporting Unlink; original-file Delete distinguished |

The UI refinement skills informed restrained surfaces, compact metadata, native
buttons and reuse of the existing Sheet/control language. No global redesign.
Program Area, Evidence Type and Period/Year are prominent; framework, uploader,
file type, upload/evidence/effective dates and refresh state are secondary.
Source browsing scopes to a particular Review, Vendor, Policy, Finding, Risk or
framework assessment. Search covers names, source titles/IDs, requirements,
uploader, type and recorded year/period. Non-Review year is evidence date,
otherwise effective date, otherwise upload date. Unknown Review periods are not
invented. Multiple category counts can include the same file; inventory totals
count each Evidence ID once.

Needs Classification includes files without a resolvable relationship. Linking
an existing record classifies the same Evidence Item. Browse and All Evidence
use the same server catalog, 25 files per page; sources, sets, related records
and Activity are also paged. Client switching remounts the library and clears
client-specific source/drawer state. Existing shared filter state remains scoped.

## Retention, authorization and compatibility

- No bulk data migration, startup seeding, file movement or byte rewriting.
  Legacy source aliases and initial-occurrence attribution remain readable.
- Additive nonunique Mongo indexes support client/archive/date and supporting
  relationship lookups. Index creation does not delete or reconcile user data.
- Original provenance and completed Review evidence cannot be unlinked.
  Terminal operational history and Policy approval-document links are retained.
- Delete retains the existing archive behavior and bytes; it is not permanent
  erasure. The confirmation displays the reference count. Existing retention
  rules may reject it. Policy approval files retain source/history access after
  inventory archival. Unlink never invokes the delete endpoint.
- All new server routes authenticate, authorize client scope and enforce
  existing write roles; each relationship validates both parents' client IDs.
  Download remains authorized. No new public file URL, invitation, permission,
  membership or authentication behavior.
- Metadata/link edits use the existing optimistic version convention. Review
  relationships use the existing Review mutation lease against completion.
  This is not a claim of new cross-collection transactional audit durability.

## Verification (2026-09-23)

Automated:

- Backend safe allowlist: `python backend/tests/run_isolated.py`:
  **337 passed, 254 subtests passed**. Eight existing FastAPI lifecycle warnings.
  Real ASGI routes/auth dependencies, isolated in-memory Mongo test boundary;
  not a persistent Mongo/staging deployment test.
- Frontend: `craco test --watch=false --runInBand`:
  **75 suites, 418 tests passed**.
- Production Demo: `node frontend/scripts/preview.cjs build`: passed.
  Existing PlatformAdmin missing-hook-dependency warning remains.
- Targeted CRA ESLint: zero errors, 46 existing warnings. Compared diagnostics
  with HEAD sources: no introduced diagnostics in the 13 changed source files.
  No standalone TypeScript configuration/check exists.
- `git diff --check`: passed. No dependencies or lockfiles changed.
- Compared 292 frontend build-input files (including new source, public assets,
  package/lock/config and preview script) with the clean verification checkout:
  no differences. Tested main bundle: `main.c992c192.js`, SHA-256
  `0cd421444355138b28b84d5b68905de8a908698ff2db2133342cf2e84c044efc`.

Backend/Demo focused coverage includes three relationships/one stored file,
unlink preservation, cross-client read/write/download denial, readonly writes,
admin deletion restrictions, stale edit tokens, invalid dates, bounded source
paging, filtering, legacy attribution, four quarterly completion snapshots,
2028 clean occurrence, historical deletion rejection, Policy archive retrieval,
approval-link retention and existing Vendor/framework reference projection.

Browser verification uses disposable session Demo data and a local production
bundle, with external requests blocked:

- `frontend/scripts/qa/evidence-library.cjs`: Policy upload and source navigation;
  Vendor assurance upload, assurance association, reuse in annual Review and
  same-ID completion snapshot; Q1-Q4 2027 uploads/completions; 2028 clean;
  source/set browsing; Finding supporting link/unlink; completed download;
  central upload, type and later classification; client switching.
- Existing operating-core, operating-onboarding and operating-policy scripts:
  Review/Finding/Action lifecycle, Risk and Vendor schedules, Calendar,
  onboarding, current Policy approval and immutable prior snapshots.
- Existing framework-operator script: CIS, NIST CSF, HIPAA, ISO and SOC 2;
  upload/download/unlink/relink; one shared Finding/Action/Evidence across all
  five frameworks; 394 assessments; 18 routes; wrong-client exclusion.
- Widths 1440/1280/1024/768: no document overflow. The compact table remains
  horizontally scrollable inside its frame at narrow widths. Screenshots at
  1280 and 768 inspected. No page/console errors in successful browser runs.

Test uploads and screenshots remain outside Git or disposable browser storage.
Integrity claims above cover exercised fixtures, not an audit of all persistent
customer data. No existing persistent data was modified during this work.

## Intentionally deferred / limits

- Persistent-backend browser QA, real database index execution/restart durability,
  production load testing and independent security review are not verified here.
- Existing Mongo base64 storage and Demo 1 MB/session limits remain. No malware
  scanning, active-content preview, OCR, package export or auditor portal.
- Catalog metadata search still scans client metadata in batches of 100 to
  resolve authoritative related titles/counts; it does not fetch file bytes.
  This bounds browser payloads, not total server work. Indexed full-text
  relationship search/load testing is still needed for very large libraries.
- Some older module-specific pickers retain their existing bounded list limits.
  No filesystem folders or independent document version-control system.
- Historical relationships cannot be retroactively rewritten through the new
  supporting-link action. Missing historical provenance is not fabricated.
- Browser Evidence navigation is session-local, not a saved-view/deep-link
  feature. Authoritative source drawers retain their existing navigation.
