# Brawndo ten-year validation — 2026-09-26

## Scope and evidence boundary

Final validation of the Brawndo reference workspace before it serves as the Omnisciente reference implementation. Brawndo was operated for ten simulated years (2026-09-28 → 2036-09-29) through the product's own request paths, weekly, with realistic imperfection: late and missed Reviews, stale validation, lapsed assurance, a departing IT Lead, reopened work, scope changes and degraded then restored controls.

Two independent operations exercise the same program:

| Run | Path | Clock | Where |
| --- | --- | --- | --- |
| Demo | The published Demo's request adapter and session store | Jest modern fake timers | `frontend/src/preview/brawndoTenYear.test.js` |
| Server | FastAPI routes over mongomock-motor | Patched module clock; tokens minted on real time | `backend/tests/test_ten_year_operation.py` (in `run_isolated.py`) |

Neither run is a live persistent-backend, load or production test. Mock-database and jsdom timings describe relative growth, not capacity. Browser QA used the static preview build on loopback with the Year-10 Demo store loaded into an isolated session; nothing was published and no persistent database was seeded or reset.

Run the Demo operation with `CI=true yarn test --watch=false --runInBand src/preview/brawndoTenYear.test.js` from `frontend/` (≈8 minutes). `SIM_REPORT` and `SIM_STORE` write the JSON report and Year-10 store for inspection.

## Results

| Area | Demo run | Server run |
| --- | --- | --- |
| Review completions | 1,291 (1,010 on time, 281 late, latest 216 days) | 511 (116 late) |
| Occurrences at Year 10 | 1,416 across 42 Reviews; largest Review 139 | 511 across 18 Reviews; largest 120 (167 KB document) |
| Findings | 200 raised (191 Review, 8 CIS, 1 independent), 204 validations, 1 reopened and revalidated | 42 raised and validated |
| Action Items | 206 completed, 15 due-date extensions, 4 reassignments | 43 completed |
| Evidence | 1,141 records (1,101 uploaded) | 422 records |
| CIS IG1 | 56 safeguards, 327 assessment-history entries | 56 safeguards |
| Dashboard ↔ registers | 46 checkpoints, 0 discrepancies | 45 checkpoints, 0 discrepancies |
| History | 1,291 occurrences and 327 assessment entries re-checked: 0 changed | 0 history mismatches |
| Year-1 at Year 10 | 147 occurrences intact; 37/37 departed-owner attributions retained | — |
| References / isolation | 0 integrity issues; no cross-client change; cross-client read rejected | 0 orphans; cross-tenant calls 403 |
| Unexpected rejections | 0 (2 expected: editing a closed Risk; cross-client read) | 0 (1 expected) |

Representative CIS lifecycle (11.4, isolated recovery data): Implemented 2027 → operational failure 2032 raises a critical Finding and a gap → remediated, validated and Implemented again four months later, with the earlier conclusions still in history. Assessment status, verification age and evidence remain separate throughout; at Year 10, 55 of 56 safeguards are Implemented while 25 carry validation older than 12 months.

## Defects fixed in this cycle

| Commit | Defect |
| --- | --- |
| `fix: count CIS overdue remediation by safeguard…` | CIS summary summed inherited per-safeguard counts, disagreeing with its own filtered view |
| `fix: reconcile vendor dashboard tiles…` | "Vendor reviews past due" opened a ≤90-day view; assurance tile counted offboarding Vendors |
| `fix: raise CIS Findings unassigned when the safeguard owner has departed` | Raising a CIS Finding failed when the safeguard owner's account was disabled |
| `fix: retire Systems consistently…` | The form wrote Terminated for Retired; signals, summary and bulk close disagreed |
| `fix: stop counting unlinked or deleted Evidence as current CIS support` | Unlinked or archived Evidence still supported a safeguard |
| `fix: seed Demo Reviews without silently missing recurrence periods` | Monthly Demo Reviews skipped their first periods |
| `fix: show recorded calendar days without a timezone shift` | Date-only values displayed a day early west of UTC |
| `fix: record Risks raised from Findings under the category value…` | Escalated Risks stored the label "Compliance" instead of the vocabulary value |
| `fix: show every Finding when All statuses is selected` | Regression from the Active default, caught in browser QA: All statuses showed 0 |
| `fix: return to the originating view in one step…` | Closing a requirement left a duplicate history entry; Next pushed one entry per requirement |

UI refinements (`polish:`) from the single design review: Findings open on Active; dashboard work tables stack instead of clipping their actions; Risk titles and Action Item sources wrap; Review drawer shows Overdue as the register does; open work owned by a disabled account is flagged; vocabulary labels and one summary date format.

## Characterized limits (unchanged)

- **Demo session storage.** At this operating rate the Demo store passes Chromium's 5,242,880-character Web Storage quota around 2028-06-26 and reaches ≈12.9 M characters by Year 10. The Demo reports a storage error instead of silently losing a save; it is a session-scoped demonstration, not a ten-year store.
- **Demo file bytes.** Inline file content shares one 256 KB budget across clients; older bytes are evicted (84 other-client files in the run) while metadata and relationships remain.
- **Register reads above 1,000.** Server `GET /evidence` returns at most 1,000 rows with no paging signal. Brawndo's Demo rate reaches 1,141 Evidence records by Year 10; the CIS "link existing evidence" picker reads that list. Paging is required before a client accumulates that volume on the server.
- **Embedded occurrences.** A monthly Review carries its full history (167 KB at 120 occurrences) on every read — far below MongoDB's 16 MB limit, but read cost grows linearly.
- **Dashboard scans.** Posture is computed from full collection reads.

## Open observations

- Disabled owners stay on existing work by contract (`assignment-eligibility.md`); this cycle surfaces them, but nothing signals them on the Dashboard.
- `GET /users` is limited to Super/Platform Admins; the generic register falls back to raw user IDs for other roles (from code; not exercised in the browser).
- `public/index.html` loads the Emergent platform script and PostHog with session recording to `ap.emergent.sh` in every build, including the Demo. This predates the cycle and needs an explicit decision before use with client data.
- The Reviews register's fixed geometry (1,056 px) hides the row menu at 1280 px; the row still opens. Several registers scroll horizontally at 1024 px by design.
- Build-time `svgo` advisories (via `react-scripts`) and FastAPI `on_event` deprecation warnings are pre-existing.
