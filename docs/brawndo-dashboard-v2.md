# Brawndo Dashboard V2 pilot

Date: 2026-09-27. Scope: **Brawndo Demo dashboard only**.
Prerequisite: workspace refinement `ab22638` completed and pushed before this pilot.
Parent checkpoint: `54249b0`. Branch: `codex/framework-operational-completeness`; PR #6 remains unmerged.

## A–B. Before / after and removed elements

| Before | Pilot |
| --- | --- |
| General dashboard with multiple health panels | Work queue first, then Compliance Programs |
| Six attention tiles and six-row priority preview | Four in-place filters and nine-row preview |
| Framework panel alongside work | Framework card below the full-width queue |
| Board PDF, dashboard scope selector, Demo banner | Concise client heading; those controls are absent on this page only |
| Program Health / GRC Work Status / Risk Posture / Third-Party Oversight | Removed from the pilot; authoritative modules unchanged |

No sidebar redesign, seed changes, framework changes, schema changes, dependencies,
permission changes, or backend code changes. Existing records and history are not rewritten.
The UI-polish skills informed compact token-based surfaces, restrained semantic color,
visible keyboard focus and locally scrollable tables—not a new design system.

## C. Filter populations and reconciliation

All four counts are lengths of the exact arrays behind the corresponding paged view.
They are not independently stored counters. The Demo `/dashboard` operation accepts
an opt-in `work_queue` projection; default dashboard responses remain unchanged.
Only the `PREVIEW_MODE && clientId === 'demo_brawndo'` presentation gate requests it.
This is not a new endpoint, authentication path or record model.

Current work comes from existing `aggregateClientDashboard` → `managementMetrics`.
Their archive, terminal-state, occurrence and source-Review selection remains authoritative.
The pilot adds a read-only presentation projection, `dashboardWorkQueue`:

- **Past Due:** due day strictly before the existing management UTC day.
- **Due in 30 Days:** today through today + 30, inclusive; never past-due items.
- **All Open:** all current actionable queue obligations, including work outside the attention window.
- **Unassigned:** accountable owner is absent or is not an active eligible platform user
  with access to this client. Uses existing Demo assignment eligibility, not Contacts.
- Invalid/missing dates do not become overdue dates. Literal date-only values do not shift by timezone.

Browser checkpoint: **3 Past Due / 10 Due in 30 Days / 56 All Open / 1 Unassigned**.
The single unassigned Action retains Dr. Lexus's disabled account in its authoritative
drawer; the dashboard does not erase that historical assignment.

All Open paged as 25 + 25 + 6 records; Due in 30 Days exposed all 10; Past Due showed
exactly 3 and Unassigned exactly 1. Nine rows are the explicitly labeled preview.
These are observed counts for the current synthetic state, not fixture constants.

## D. Queue behavior and intentional presentation differences

Ordering: overdue first, older overdue deadlines first; critical/high priority;
due within 30 days; unassigned; remaining severity, due date, creation date and
stable record/event key. No source priority is changed. Unset priority remains “Not set.”

Existing management metrics retain a Finding beside its Action when owner or date
differs. Browser inspection showed this double-presented remediation. The pilot
suppresses a Finding represented by an active Action, except a `remediated` Finding
awaiting its separate validation decision. All other dashboard/portfolio rules are
unchanged. This difference was documented before implementation and has regression coverage.

Source labels use existing framework drivers, linked source records or recorded
governance context. System-generated Action titles reuse `actionTitle`; no title is rewritten.
Records are fetched on open through the existing client-checked API and `RecordDrawer`.
Reviews use the existing Review drawer. Legacy Policy/Risk/Vendor obligations without
a separately linked Review still open their authoritative source record; this pilot
does not manufacture Reviews or change scheduling to disguise that distinction.

Filters survive drawer open/close and save reloads. “View all” expands the same queue
in place with bounded 25-row pages; “Show top 9” returns to the compact view. Page
failures retain the visible preview and offer Retry. In-flight page requests are aborted
when the filter changes or the component unmounts.

## E. Compliance Programs

Only the finalized applicable programs appear. Brawndo currently has only CIS IG1.
The compact card uses the actual definition-backed assessment rows and the same
`cisSummary` function as the CIS workspace. `CisStatusBar`, `statusCounts`, native
labels and semantic colors are reused.

Observed agreement with the workspace:

- Implemented: **33/56 (59%)**, green.
- Assessed: **49/56 (88%)**, blue.
- Distribution: **33 implemented, 11 partially implemented, 5 not implemented / needs validation, 7 not assessed**.
- N/A is excluded from the native progress denominator and shown separately if present.
- Neither metric is a compliance percentage, certification or audit opinion.

The grid supports more cards without stretching a single card beyond 440px. Other
frameworks are not fabricated, activated or assigned CIS semantics.

## F–H. Browser / accessibility / regression

Local Demo build only, using a separate localhost browser tab. No baseline records
were reset or edited during dashboard browser QA.

- Verified all filters, exact visible/page counts, normal Review/Action/Finding drawers,
  independent Finding validation, filter retention and Escape/focus restoration.
- Verified CIS Open workspace and exact metric/status agreement.
- Keyboard: Enter activates filters, Tab follows logical order, visible focus and
  keyboard horizontal scrolling work; closing the Review returned focus to its title.
- 1440/1024/768 layouts and a 720px reflow proxy inspected, with no page-level horizontal overflow. Filters wrap to two columns; table scrolling stays
  inside its labeled focusable region; framework card remains bounded and readable.
- Found and fixed source-column/pill wrapping overridden by existing shared table CSS.
  Overrides are scoped to the new dashboard only.
- Brawndo Reviews, Findings, Action Items, Risks, Policies, Vendors, Evidence Library,
  Calendar and CIS loaded with their current records. Demo notice remains on these pages.
- Dunder Mifflin, Prestige Worldwide and Initech retain Board PDF, original dashboard
  view/sections and Demo notice. No pilot filters appear there.

## Testing

New coverage: exact date boundaries, invalid dates, eligible-owner population, stable
ranking, independent validation vs represented remediation, terminal/history exclusion,
tenant rejection, bounded paging/count reconciliation, read-only data preservation,
native CIS denominator, selected filters, record opening, detail failures and retry,
Demo authentication/client denial and reload consistency.

Test commands:

```powershell
# Frontend (from frontend/)
$env:CI='true'
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --maxWorkers=2
# Reviewed offline backend suite (from repository root)
..\workflow-venv\Scripts\python.exe backend/tests/run_isolated.py
# Standard build (from frontend/), then Demo build (repository root)
$env:CI='false'
node node_modules/@craco/craco/dist/bin/craco.js build
node frontend/scripts/preview.cjs build
```

Final focused pilot/loader/dashboard run: **28 tests passed across 7 suites**. Backend:
**417 tests + 567 subtests passed**. Standard and Demo optimized builds passed.
Full frontend run: **117 suites passed, 3 failed; 646 tests passed, 1 failed**.
The ten-year Brawndo simulation passed. The one test failure is the known multi-framework
storage-capacity limit. Two suites failed to load because of router mocks; those were
corrected and passed in the final focused run. The complete suite was not rerun after
that correction; this is not a claim of a green full suite.
Three existing dashboard tests used `virtual:true` for the installed router package;
normal module mocks corrected their resolver failures without weakening assertions.

Final standard asset: `main.cf17f4d2.js`; Demo asset: `main.191d377a.js`;
shared CSS: `main.a5640b94.css`. Final local browser warning/error log was empty.

Existing warnings: PlatformAdmin hook dependency; Node fs.F_OK and FastAPI on_event
deprecations. No new build lint warning was introduced.

## I–J. Limits and future work not implemented

- The full frontend acceptance gate remains open: the previously documented five-year
  fifth-client simulation exceeds Demo sessionStorage around 4.97 million characters.
  See `initech-demo-report.md`. It remains enabled; no quota bypass or test exclusion.
- No actual native 200% zoom or screen-reader conformance claim. Browser viewport
  reflow checks are not a substitute for independent accessibility review.
- This queue contract is currently Demo-only. Enabling it for authenticated standard
  clients requires the equivalent bounded server-side projection and authorization
  tests before changing the gate. No browser-only security assumption is introduced.
- Future rollout to other clients/frameworks requires approval and native program
  metric adapters. No extra dashboard charts, health scores or sections were added.
- Source-record priorities and missing legacy Review relationships were not altered.

## Material files

- `components/ClientWorkDashboard.jsx`, `.css`, `.test.jsx`: reusable pilot presentation.
- `lib/dashboardWorkQueue.js`, `.test.js`: presentation gate and read-only queue projection.
- `preview/summaries.js`, `preview/dashboardWorkQueue.test.js`: existing Demo operation,
  bounded detail and isolated integration/security regression.
- `lib/loadClientDashboard.js`: opt-in queue/native assessment loading and tenant checks.
- `pages/Dashboard.jsx`, `.test.jsx`: Brawndo activation, preserved filters and existing drawers.
- `components/Layout.jsx`: Demo notice hidden only on the pilot dashboard route.
- `components/DashboardAttention.test.jsx`, `DashboardPrograms.test.jsx`: router mock fixes.
- This report.

## K–O. Delivery boundary

Commit SHA and verified remote equality are recorded in the PR checkpoint and handoff.
PR #6 remains open and unmerged, with the separate storage-capacity gate visible.
**Main merged: NO. Production/Railway deployed: NO. ChatGPT Sites published: NO.**
No hosted preview is updated by this task; only the local build was exercised.
