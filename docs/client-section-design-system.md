# Client-section design system — 2026-09-26

Internal operational screens for Security Program Managers and the GRC team. One visual grammar across every client-selected section. Sections differ only where their primary task differs.

**Rule:** default to the standard register pattern. A page deviates only when its primary task cannot be represented cleanly as a register.

## 1. Inventory and classification

These are the client-selected routes from `App.js` and the client navigation in `Layout.jsx`, measured at 1440 × 900 on the seeded Demo before this change.

| Page | Route | Archetype | Primary task / reason |
| --- | --- | --- | --- |
| Reviews | `/reviews` | Register | Find and work recurring review obligations; list, filter, act |
| Findings | `/findings` | Register | Track deficiencies to validation |
| Action Items | `/action-items` | Register | Work the remediation and operational queue |
| Risks | `/risks` | Register | Maintain the risk register and treatment decisions |
| Policies | `/policies` | Register | Track policy documents, review dates and approval |
| Vendors | `/vendors` | Register | Third-party oversight: reviews, contracts, assurance |
| AI Governance | `/ai-governance` | Register | Inventory and screen AI systems; the intake notice is a register banner, not a new layout |
| Contacts & Roles | `/contacts` | Register | Business contacts; responsibility coverage is a compact strip above the table |
| Systems & Scope | `/systems` | Register | In-scope systems and ownership |
| Requirements | `/requirements` (not in navigation) | Register | Legacy obligation list; inherits the generic register |
| Tasks | `/tasks` (not in navigation) | Register | Legacy task list, superseded by Action Items; inherits the generic register |
| Evidence Library | `/evidence` | Repository | Browse by source area, then find a file and its provenance; category browsing is the task |
| CIS IG1, ISO 27001, SOC 2, HIPAA, NIST CSF 2.0, CMMC | `/compliance/:key` | Workspace | Assess requirements, track coverage, readiness and gaps; not a flat list |
| Dashboard | `/dashboard` | Dashboard | "What is happening with this client?"; cross-record posture and priorities |
| Calendar | `/calendar` | Specialized view | Time-based scheduling and drag-to-reschedule |
| Client Profile | `/client-profile` | Specialized view | One organization's context and program configuration; a record, not a list |

There is no separate Assessments page. Assessments live in the framework workspaces.

### Inconsistencies found

| Area | Finding |
| --- | --- |
| Header | Risks and Vendors had a "Client workspace" eyebrow and "… Register" titles that differ from their navigation labels. Calendar ("Review Calendar") and Dashboard ("Program Overview") also differ. Every subtitle repeated the client name that the sidebar already shows. Policies, Findings, Risks, Vendors, Contacts and Calendar subtitles wrapped to two lines. |
| Primary action | Six label styles ("New review", "New Risk", "New Action Item" with a list icon, "Add AI System" and "Add Evidence" without an icon, "New contact"). |
| Summary metrics | Risks and Vendors: four 83px dashboard cards that repeated their own view tabs. Reviews, Findings, Policies and Systems: a 51px chip strip with tinted backgrounds. Evidence: its own strip without counts. Action Items and AI Governance: none. |
| Space above data | The first data row started at 204–255px on the generic registers, 344px on Risks and Vendors, 414px on Contacts (two rows of coverage cards) and 569px on Evidence (eight folder cards). |
| Toolbar | Search widths of 220, 288 and 320px. AI Governance used larger bordered filter buttons, and its search had no icon. The workspace search had no icon. |
| Table | Rows of 44–45px on the generic registers but 62px on Action Items and Evidence. Dates appeared as `Oct 8 · in 12 days`, `8/29/2026` and `1/9/2026`, in both body and mono fonts. Owners appeared in two styles in one component: an icon on Reviews, and an uppercase amber "UNASSIGNED" pill elsewhere. Action Items repeated "Manual / Internal" twice in one cell. |
| Pills | One column mixed a solid red "Overdue" badge with dot pills. "Open" (a normal state) was red, as was "High". "Active" and "Pending validation" were green. AI Governance and Vendors used plain text or their own classes. |
| Empty/loading/error | AI Governance and Evidence used ad-hoc text instead of the shared loading row, filter-empty and load-error components. Policies showed "awaiting my approval (0)" as a full-width bar. |

## 2. Shared system

The existing reference system in `frontend/src/design-system.css` was kept and extended. Nothing new sits beside it. The shared parts:

| Part | Where | Purpose |
| --- | --- | --- |
| `PageHeader` | `components/PageHeader.jsx` (existing) | Title and a one-line purpose. Actions go in the right-hand slot |
| `HeaderActions`, `PrimaryAction`, `SecondaryAction` | `components/Register.jsx` | Secondary actions (outlined) first, then the single primary action (filled) last |
| `SearchField` | `components/Register.jsx` | First control in every toolbar: 240px, icon, `aria-label` "Search <records>" |
| `ViewTabs` | `components/Register.jsx` | Lifecycle or status views with their counts. One is pressed at a time (`aria-pressed`) |
| `RegisterCount` | `components/Register.jsx` | "shown / total", right-aligned at the end of the toolbar |
| `SortableHeader`, `sortState` | `components/Register.jsx` | `th scope="col"` with `aria-sort` and the shared sort-and-filter `ColumnControl` |
| `DueDate`, `HistoryDate`, `OwnerCell` | `components/RegisterCells.jsx` | One date grammar and one owner grammar for every table |
| `StatusBadge`, `SeverityBadge` | `components/StatusBadge.jsx` | One tone map for statuses. One scale for severity, priority and criticality |
| `RegisterSignalBar` | existing, restyled | Optional compact summary strip. Each count is a filter |
| `RegisterLoadError`, `TableLoadingRow`, `FilterEmpty`, `TableFilterChips` | existing | Error (with a named retry), loading and filtered-empty states |
| `.register-notice` | `design-system.css` | A one-line notice above the table (for example "Awaiting my approval (2)") |

Tokens: `--register-row` 46px, `--register-control` 32px, `--register-gutter` 20px (16px at narrow widths), `--register-type` 13px, `--register-detail` 12px and `--register-radius` 5px. `.section-body` is the content padding below the toolbar on non-register pages.

## 3. The register pattern (the default)

The order is always header, then optional summary strip, then toolbar, then table.

1. **Header.** The title matches the navigation label. The purpose is one line and never names the client, because the sidebar already does. There is no eyebrow. The only filled button is the primary action, "New <Record>" ("Add Evidence" on the repository), and it is always rightmost. Export CSV, reference material and related-page links are outlined secondary actions to its left.
2. **Summary strip** (optional). A few attention counts, each a toggle that filters the table and writes `?signal=` to the URL. Zero counts are muted and disabled. There are no cards. Registers whose views already carry counts (Risks, Vendors, Action Items and AI Governance) use view tabs with counts instead. The same number is never shown twice.
3. **Toolbar.** Search first, then views and filters, then the count. It stays in view while the table scrolls.
4. **Table.** The table dominates the page.
   - Rows are at least 46px and grow for wrapped text; nothing is clipped.
   - The title is the record link. A click anywhere on the row opens the record, and Escape closes it.
   - The row menu sits in the last column.
   - Wide tables scroll inside their frame. Columns are never hidden.

## 4. Cell and color grammar

- **Due dates** read "Oct 8" over "in 12 days", "today" or "3 days overdue". Red means overdue only; amber means due within 7 days. Closed records never get a callout.
- **History dates** read "Jan 9, 2026": the literal calendar day with the year, never shifted by timezone.
- **Owner** is an icon and a name. "Unassigned" is quiet, with a dashed icon. A raw account ID is never shown.
- **Severity, priority and criticality** share one scale: Critical and Immediate are solid red, High is amber, and Medium, Moderate and Low are gray. A missing rating reads "Not assessed".
- **Status tones:**

| Tone | Meaning | Examples |
| --- | --- | --- |
| Red | Overdue, critical | overdue, critical, immediate |
| Amber | Needs attention | High, pending validation, blocked, needs verification, expired, needs scheduling |
| Green | Done | completed, approved, verified, treated |
| Blue | Work in progress | in progress, under review, in remediation, requested |
| Gray | Normal, inactive or metadata | open, active, upcoming, draft, accepted, not applicable, inactive |

- Text always carries the meaning; color only reinforces it. Zero values stay gray. There is no "Healthy" or "All good" wording.

## 5. Controlled exceptions

| Page | Kept | Standardized |
| --- | --- | --- |
| Dashboard | Visual panels, drill-down drawers, narrow-panel stacking | Title "Dashboard", one-line purpose, header actions. Attention tiles use a neutral surface with the tone only on the rail, icon and label. The work table uses the register row grammar (the title opens the record, shared date and owner cells), which removed the separate Action column. The header stays in place during loading and errors |
| Calendar | Month grid dominates; drag-to-reschedule | One toolbar (month navigation, month, scope view tabs, status). The legend is a caption above the grid. The error state is shared |
| Evidence Library | Browsing by source area | Eight folder cards replaced by one chip bar with counts. Shared header, toolbar, table, sort headers and icon buttons |
| Framework workspaces | Assessment hierarchy, summary, derived views, drawers | The subtitle names the framework edition (for example "Assessment workspace · ISO/IEC 27001 · 2022 + Amd 1:2024"), not the client. Shared search and load error. Attention rows are neutral lines with a colored icon and count. The summary panel is about 85px shorter |
| Client Profile | Tabs and section cards | Shared header with a one-line purpose; shared error and loading states |
| Contacts & Roles | Responsibility coverage | One compact strip above the register: who holds each key role, with gaps in amber |

## 6. Density

These figures are the first data row, measured at 1440 × 900 on the Demo.

| Page | Before | After |
| --- | ---: | ---: |
| Reviews | 255px (14 rows visible) | 238px (15 rows) |
| Findings | 273px | 238px |
| Action Items | 204px | 202px |
| Risks | 344px | 202px |
| Policies | 331px | 238px |
| Vendors | 344px | 202px |
| AI Governance (table top) | 226px | 203px |
| Contacts & Roles | 414px | 266px |
| Systems & Scope | 255px | 238px |
| Evidence Library | 569px | 282px |
| Dashboard (priority table top) | 390px | 362px |

Rows are 46px. Action Items and Evidence rows are taller where long titles wrap, which is intended because text is never clipped.

## 7. Rule for future client pages

**Default to the register pattern. Deviate only when the page's primary task needs a different interaction model, and even then keep the shared header, toolbar, type, spacing, pills and drawers.**

For a new client page:

1. Name the primary task and the archetype (Register, Workspace, Repository, or Dashboard/Specialized view).
2. Use `PageHeader` with `HeaderActions`. The title is the navigation label and the purpose is one line with no client name.
3. Use one `PrimaryAction`, "New <Record>", placed last. Everything else is a `SecondaryAction`.
4. Put `SearchField` first. Use either `ViewTabs` with counts or a `RegisterSignalBar`, never both showing the same numbers. End the toolbar with `RegisterCount`.
5. Use `SortableHeader` for sortable columns. Make the title a `register-record-link`, let the row open the record, and put the row menu in the last column.
6. Use `DueDate`, `HistoryDate`, `OwnerCell`, `StatusBadge` and `SeverityBadge`. Do not add page-local date, owner or pill formats.
7. Use `RegisterLoadError`, `TableLoadingRow` and `FilterEmpty` for states.
8. Add no cards above a register and no page-specific CSS for shared elements; use tokens only.
9. Cover the page with a grammar test in the style of `pages/RegisterGrammar.test.jsx`.

## 8. Verification

- **Frontend unit and component tests:** the full Jest suite passed, 572 of 572 tests in 104 suites, on the final source. There are 28 new tests: `Register`, `RegisterCells`, `StatusBadge`, `ContactCoverage`, the Policies zero state, `riskViewCounts` and `RegisterGrammar` (header, primary action, toolbar, headers, strip filtering, view counts and filter reset). They were run per file and all pass. The combined suite was not re-run after they were added. Breaking the Risks primary label and the High / Critical view made the grammar tests fail.
- **Build:** the production build compiles. Its one warning is pre-existing, in `PlatformAdmin.jsx`.
- **Browser:** one post-change inventory at 1440 × 900 covered every client page (section 6). It ran before the last small fixes: the calendar caption, the workspace search placeholder, the amber attention counts and the sort-header semantics. The planned pass at 1280, 1024, 768 and 200% zoom, with axe and interaction checks, was stopped at the user's direction and produced no results.
- **Backend:** unchanged by this work and not re-run.
