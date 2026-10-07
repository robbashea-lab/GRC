# Client dashboard priority filters

The shared client dashboard places framework summaries before Priority overview.
It no longer renders the four large work-count tiles. The portfolio dashboard,
Reviews workflow, framework assessment conclusions and recurrence are unchanged.

Priority overview reuses Reviews' `ViewTabs` controls: All, Overdue, Due in 30 days
and Unassigned. The Framework selector uses the client's enabled programs. Search,
framework and quick selection intersect before the nine-row preview or 25-row
expanded page is taken. Each category count is independent of the selected quick
filter, but reflects the framework and search. Reset restores All / All frameworks.

`GET /api/dashboard?work_queue=true` accepts optional `framework` and `search`
parameters. Detail pages additionally return `counts` for all four categories.
Existing authentication and client scoping run before loading any source records.
The Demo adapter implements the same read-only contract. Framework membership
comes from direct framework fields, assessment links, shared-control mappings and
source ancestry; title text never establishes membership. A multi-framework record
is retained once, and general work remains visible under All frameworks.

CIS donut segments expose their existing status, applicable denominator and a
one-decimal percentage on hover and keyboard focus. Escape dismisses the tooltip;
its text is also the segment's accessible name. Status/exception links and native
framework-specific calculations remain unchanged. These are assessment measures,
not a compliance determination.

## Reproducible scoped verification

- Frontend focused suites: `ClientWorkDashboard`, `FrameworkProgramCard`,
  `Dashboard`, `dashboardPriorityFilters`, existing work-queue/source tests.
- Backend: `python -m pytest -c backend/pytest.ini
  backend/tests/test_dashboard_work_queue.py -q -o addopts=''` from the repository.
- Build: `node frontend/scripts/preview.cjs build`.
- Browser: with the already-installed Playwright package resolvable,
  `node frontend/scripts/qa/dashboard-priority-filters.cjs`. `QA_BROWSER` may point
  to an installed Chromium browser and `QA_OUTPUT` sets the evidence directory.
  The script binds only loopback, blocks nonlocal requests, uses synthetic
  tab-local Demo fixtures and closes its browser/server. It covers the three
  primary clients, a disposable newly configured client and an added framework,
  widths 1440/1024/768/390, complete-population counts/paging, date boundaries,
  search/reset, tooltip keyboard/hover behavior and filtered workspace routes.

Run the existing Release verification gate and both normal builds before delivery.
Local Demo/browser and isolated mock-database checks do not establish authenticated
hosted persistence or whole-application security. Preserve the separate Render
staging and owner-private Sites publication/acceptance boundaries.
