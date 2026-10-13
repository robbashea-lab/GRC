# Framework reports

The shared client workspace exposes **Reports** once in Program, directly above
Evidence Library. The page uses server-authorized enabled programs, defaults to
Full assessment and six months, and downloads a real PDF. Executive summary
contains overview, history and native group summaries; Full assessment also
contains every in-scope saved assessment and its current Items to address.
Explore Demo explicitly reports that PDF export is unavailable.

## API and native records

- `GET /api/reports/frameworks?client_id=…` returns enabled program metadata.
- `GET /api/reports/framework?client_id=…&framework_key=…&detail=full&trend_period=6m`
  returns private, non-cacheable PDF bytes. `detail` accepts `full` or `executive`;
  `trend_period` accepts `30d`, `6m` or `12m`.
- Canonical keys are `cis-ig1`, `soc-2` and `iso-27001`. Configured CIS IG1/2/3
  remains one cumulative native program, with 56/130/153 safeguards respectively.
  SOC categories and ISO clause/Annex A/Statement of Applicability distinctions
  come from the authoritative catalogs and saved client configuration.
- Reports reuse native calculation rules and preserve saved status distributions,
  including Not Assessed, invalid legacy N/A, and statuses on excluded ISO
  controls. Native resolution and applicable implementation counts are labeled
  separately. Reports never change scores, assessments, applicability or history.
- Missing or duplicate initialized assessments and catalog/version mismatches
  return an actionable conflict rather than fabricated records.

The compatible inline-assessment contract is additive:
`framework_assessments.items_to_address` contains stable `item_id`, `question_id`,
`kind`, `text`, `state`, `resolution`, optional `notes`, timestamps and optional
`finding_id`; `items_revision` records the saved revision. Reports include saved
open/resolved items, exclude superseded historical items, and redact inaccessible
finding links. No new checklist writer or migration is introduced. Records that
predate this contract export with no recorded checklist items.

Saved `implementation` is rendered with its complete paragraphs and bullets,
including Controls in place. Unsaved interviews are not a report source. A
confirmed judgment date uses `assessment_recorded_at` when available; legacy
native save timestamps are separately labeled and do not establish an assessment
judgment. A method is reported only when a saved guided-summary origin records it.

## Snapshot, history and authorization

Every export reads actor, client configuration, assessments, authorized evidence
references and finding identifiers in one MongoDB transaction with
`ReadConcern('snapshot')`. This requires a replica set or compatible sharded
deployment. If consistent snapshots are unavailable, the endpoint returns 503;
it does not fall back to separate inconsistent reads. The PDF records source hash,
capture time, read window and logical read position. Later edits do not alter its
bytes. Generation is synchronous, in memory, with no public files, export jobs or
stored report artifacts. Its audit record contains export metadata only.

History comes from recorded status events. Known observations retain their actual
timestamps, including a valid pre-period baseline. Missing events remain unknown.
Scope fingerprints and incomplete historical ISO applicability prevent misleading
comparisons. Charts never interpolate or substitute today's applicability into
old events. Missing/partial history is disclosed while current reporting remains
available. Recorded client IANA timezones are used; an absent timezone is explicitly
reported as UTC. Runtime `tzdata` supplies the standard-library fallback on Windows.

Server access follows the existing authenticated report/document read roles and
client membership, including the existing read-only client roles. Unknown roles,
disabled accounts, password-change fences and unauthorized clients are denied.
After rendering, the server rechecks session/account membership, enabled framework,
scope, evidence visibility/titles and finding-reference access before delivery.
Evidence exports contain only authorized reference titles and identifiers;
attachment bytes, storage paths and secrets are not loaded into this feature.

The authorization approach follows the OWASP
[Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
Snapshot behavior follows MongoDB's
[snapshot read concern](https://www.mongodb.com/docs/manual/reference/read-concern-snapshot/).

## PDF renderer and runtime packaging

`framework_report_pdf.py` implements report-scoped styling, wrapping tables,
repeat headers, page numbers and complete flowing assessment text. It embeds the
unchanged Liberation Sans regular/bold fonts from the approved bundled runtime;
their SIL Open Font License and provenance are included in `backend/fonts`.
Both runtime Docker contexts include these files.

ReportLab 4.4.9's installed `TTFont` documentation prohibits sharing one font
object across concurrently rendered documents. A process-local lock covers font
registration through final document save. Rendering runs outside the database
transaction in the existing thread pool. Concurrent exports serialize within a
worker and remain isolated. Unsupported glyphs produce a controlled 422 rather
than a successful PDF that silently drops saved text. The included fonts cover
Latin, Greek and Cyrillic; other scripts may require a separately approved font.

## Verification entry points

The new backend suites are classified in `backend/tests/suites.json` and run with
the normal offline suite. Focused checks are:

```powershell
python -m unittest discover -s backend/tests -p test_framework_reports.py
python -m unittest discover -s backend/tests -p test_framework_report_pdf.py
python -m unittest discover -s backend/tests -p test_runtime_packaging.py
```

Set `FRAMEWORK_REPORT_TEST_MONGO` to an owned, isolated test replica-set URI to run
the real snapshot/concurrent-edit/security cases; otherwise those cases are
explicitly skipped. They create and clean up unique synthetic databases.

Frontend report, sidebar, workspace-search and permission tests cover role fences,
scope changes during requests, malformed responses, duplicate submissions, error
retry and accessible defaults. The existing staging build command is
`node frontend/scripts/staging.cjs`. Browser acceptance should use an isolated
authenticated fixture and verify the download itself, rather than treating a
build or PDF unit test as end-to-end proof.

Word export, scheduling, email distribution and custom builders are outside this
release. Hosted acceptance and deployment remain separate release checks.
