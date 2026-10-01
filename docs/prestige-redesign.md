# Prestige Worldwide visual alignment and Demo cleanup

Review date: 2026-10-01. Local Demo only; no hosted publication or production deployment.

## A. Branch and base

- Branch: `codex/prestige-redesign`.
- Base: stable `main`, `fc02c0b42bbe0ee3f6de471499d87381c0284808`.
- No merge, rebase, cherry-pick, or write to Claude's `claude/brawndo-workflow-qa` branch.
- No dependence on Claude's unmerged changes.

## B. Client cleanup

The canonical seed now contains Brawndo and Prestige Worldwide. Initech and Dunder Mifflin fixture builders and their client-specific tests were removed. Framework catalogs, generic ISO/SOC 2/CIS capabilities, and generic lifecycle tests remain.

Existing v3 Demo sessions receive an idempotent cleanup of only `demo_initech` and `demo_dunder`: tenant records, synthetic personnel, client assignments/favorites, onboarding drafts/baselines, risk sequences, AI maps, and retired-user notifications/history. Surviving assessments and custom Demo clients are preserved, not reseeded. The existing evidence save path prunes stale session file-cache entries. A retired active persona returns to the existing Demo Explorer, or fails closed if that persona is absent. Standard/backend tenants are untouched.

Deleted synthetic client data is not recoverable through the updated Demo UI. The former fixture definitions remain recoverable from Git history. The cleanup is separate from UI commits.

The initial removal exposed a seed assumption: the consultant became assigned to one client, so the seed incorrectly treated that provider account as internal Brawndo personnel. The seed now selects the existing client-person identity prefix instead of assignment count, preserving Brawndo's original three-person rotation. This is a seed correction, not a change to operational assignment, permissions, recurrence, or workflow rules. A regression checks all 56 CIS assessments and Frito's 18 seeded assignments.

## C–D. Inventory and page changes

Prestige is SOC 2, with 38 in-scope criteria: Security 33, Availability 3, Confidentiality 2.

| Area | Baseline on stable main | Alignment / preserved behavior |
|---|---|---|
| Dashboard | Legacy dashboard despite available shared work-queue presentation | Reference work queue, actual SOC 2 program progress and recurrence health; no invented metrics |
| Sidebar | Legacy navigation | Reference grouped sidebar; retains separate Findings and native SOC 2 navigation |
| Calendar | Legacy calendar presentation | Existing reference calendar presentation; source records/scheduling unchanged |
| Reviews | Legacy register and narrow detail | Approved summaries, filtering, readable recurrence/due cells, centered Review; occurrence history retained |
| Findings | Existing native register | Reference typography/theme and centered detail; finding validation stays separate from Action completion |
| Action Items | Existing native task register | Reference surface and centered detail; no Brawndo consolidated-register activation or record conversion |
| Risks | Legacy register | Existing reference summary/filter/field presentation; authoritative risk operations retained |
| Policies | Legacy register | Reference compact columns, summaries and centered detail; existing approval workflow retained |
| Vendors | Legacy register | Existing reference assurance/renewal presentation and detail; no new vendor model |
| AI Governance | Legacy presentation, no seeded AI systems | Reference presentation and honest empty state; existing scoped approval workflow, no fabricated systems |
| Contacts | Shared directory with legacy presentation | Contact, Job Title, Email, Phone, Platform Access; original directory/access logic retained |
| Systems & Scope | Native specialized page | Reference outer surface/theme; native content and controls retained |
| Evidence Library | Existing folder repository, legacy presentation | Reference header/theme around existing folders, breadcrumbs, search and metadata; no new repository |
| Client Profile | Legacy profile presentation | Reference profile overview/header; Prestige-only single-column layout below 1100px |
| SOC 2 | Existing shared framework workspace and wide assessment shell | Reference surrounding surface/theme; native hierarchy, assessment and Control/period workflows unchanged |

## E. Framework semantics

No framework catalog, criterion mapping, status, applicability, cadence, scoring, source text, organizational Control, examination-period, evidence, or assessment-history logic changed. SOC 2 remains criteria → organizational Controls → operating records. Shared Controls do not imply shared conclusions. Existing reference-only/paraphrased source treatment remains intact. The dashboard explicitly reports readiness/assessment progress, not an auditor opinion.

## F. Shared-file and conflict report

Paths below are relative to `frontend/src`. All listed shared production files are also used by Brawndo. Risk estimates reflect likely overlap, not an attempted merge with Claude.

| Shared file | Change / why Prestige needs it | Brawndo impact | Merge risk |
|---|---|---|---|
| `lib/reference.js` | Explicit Demo + stable-ID Prestige presentation gate | Original Brawndo/CIS gate unchanged | Medium |
| `lib/dashboardWorkQueue.js` | Opt Prestige into existing dashboard presentation | Queue logic unchanged | Medium |
| `components/Layout.jsx` | Reference sidebar and Prestige-only route surface; keyed by pathname for portal-theme handoff | Original Brawndo Outlet retained | High |
| `components/BrawndoSidebar.jsx` | Optional `showFindings`, default false | Original navigation default retained | Medium |
| `components/ClientWorkDashboard.jsx` | Optional composed program details | Original fallback retained | Medium |
| `pages/Dashboard.jsx` | Compose existing native SOC 2 program widget for Prestige | Existing CIS program unchanged | Medium |
| `components/RecordDrawer.jsx` | Opt Prestige into existing centered record presentation | Original Brawndo-only creator permission exception explicitly remains Brawndo-only | High |
| `components/ReviewDrawer.jsx` | Prestige centered Review from register or dashboard | Original Brawndo register flag retained | High |
| `components/AIDrawer.jsx` | Opt Prestige into approved AI fields/detail presentation | Existing Brawndo path retained; no backend permission changes | Medium |
| `pages/RecordListPage.jsx` | Reviews/policies presentation gate and client-switch filter cleanup | Existing reference behavior retained | High |
| `pages/RiskRegister.jsx` | Presentation gate | No Brawndo logic edits | Medium |
| `pages/VendorRegister.jsx` | Presentation gate | No Brawndo logic edits | Medium |
| `pages/AIGovernance.jsx` | Presentation gate | No Brawndo logic edits | Medium |
| `pages/Calendar.jsx` | Presentation gate | No scheduling/recurrence edits | Medium |
| `pages/ClientProfile.jsx` | Presentation gate | No profile persistence edits | Medium |
| `pages/Contacts.jsx` | Presentation gate | Existing client/user remount guard retained | Medium |
| `pages/Evidence.jsx` | Presentation gate | Existing repository/authorization retained | Medium |
| `preview/demoPortfolio.js` | Remove two requested organizations and provider membership | Brawndo identity/framework retained | Medium |
| `preview/programs/index.js` | Remove retired Dunder builder registration | No Brawndo builder change | Low |
| `preview/store.js` | Remove Initech finalizer; invoke targeted saved-session cleanup | Surviving stored work is not reset | High |
| `preview/demoHistory.js` | Correct internal seed-person selection after cleanup | Restores pre-cleanup Brawndo owner rotation | High |

New scoped files: `components/PrestigeSurface.jsx`, `components/PrestigeSurface.css`, `preview/retiredClients.js`. No new shared engine, palette, dependency, or schema.

Shared tests changed: `components/BrawndoSidebar.test.jsx`, `pages/Contacts.test.jsx`, `lib/workspaceMode.test.js`, and `preview/{adapter,brawndoTenYear,dashboardWorkQueue,demoSeed,demoStorage,frameworks,portfolioOverview}.test.js`. These update the canonical client count/foreign-tenant fixture and cover optional navigation; the ten-year simulation logic/assertions were not weakened. New tests: `lib/reference.test.js`, `pages/PrestigePresentation.test.jsx`, `preview/retiredClients.test.js`. Test-file conflict risk is medium, especially `brawndoTenYear.test.js` (only its foreign-client constant changes).

Deleted files: `preview/programs/{dunder,initech}.js` and their two exclusively retired-client fixture tests. No generic framework tests removed.

## G. Usability review

| Before | After |
|---|---|
| Prestige used legacy chrome alongside approved reference pages | Same typography, controls, cards and light/dark tokens |
| Narrow operational detail surfaces | Existing centered record/Review pattern activated for Prestige |
| Tight profile columns at 1024px | Prestige-only single-column profile below 1100px |
| Dark portal theme could disappear when leaving a themed child page | Prestige wrapper remounts per route, restoring theme ownership |
| Generic fallback framework card would omit useful SOC 2 progress | Existing native SOC 2 program widget composed into dashboard |

No duplicated Finding/Action conversion, invented completion criteria, or new framework workflows. Missing data remains visibly missing.

## H. Automated verification

- Targeted final checks: 4 suites / 10 tests passed (sidebar, reference gate, Prestige presentation, retired-client migration).
- Backend: `../workflow-venv/Scripts/python.exe backend/tests/run_isolated.py` — 437 tests plus 579 subtests passed; 8 existing FastAPI lifecycle-deprecation warnings. Offline test runner only.
- Optimized Demo build: `node frontend/scripts/preview.cjs build` — passed. Warnings: unchanged `PlatformAdmin.jsx:53` hook dependency, existing bundle-size advisory, Node `fs.F_OK` deprecation. No dependency upgrade or warning suppression.
- Full frontend: `CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand` (from `frontend`, with JSON output enabled) — **152 suites / 810 tests passed**, 836.7 seconds. Includes Brawndo ten-year, CIS greenfield 24-month, per-framework five-year and multi-framework five-year simulations.
- First full run exposed two failures: seed-owner rotation above, and a negative tenant-access test targeting removed Initech (404 rather than 403). Both corrected; negative access test now targets retained Prestige. Baseline vs branch turnover diagnostics confirmed the seed regression before the fix.
- `git diff --check` passed. Final diff reviewed for scoped gates, unchanged Brawndo permissions and no unrelated framework edits.

Local QA artifacts, outside Git: `outputs/prestige-full-final.json`, `outputs/prestige-final-ten-year.json`, `outputs/prestige-baseline-turnover.json`, `outputs/prestige-branch-turnover.json`, `outputs/prestige-dashboard-final.jpg` in the enclosing workspace.

## I. Browser verification

Local `http://127.0.0.1:4183`, real Demo UI. All 14 Prestige routes visited at 1440, 1280, 1024 and 768px, both light and dark: 112 unique route/width/theme checks, no document-wide overflow. Screenshots reviewed across the modules and profile/framework/modal breakpoints. Captured final-tab console: no errors or warnings.

Verified portfolio two-client listing, owner/framework labels, search and opening both clients; Review overdue filter and row count; centered Review/history; save/reload/reopen of temporary Review notes and restoration to empty; SOC 2 criterion Previous/Next and unsaved-discard protection; evidence folder navigation/search/metadata and focus return; Finding → existing corrective Action → return; new-Finding cancel and search-empty state; native SOC 2 source references; keyboard Tab containment and Escape on assessment/Review dialogs. Nested Action Escape returns focus within the parent Finding dialog, not necessarily to the exact originating button. No screen-reader or whole-application WCAG conformance claim.

Brawndo dashboard, CIS overview and Review modal compared using this branch's stable-main behavior. Original CIS layout, counts, native gate and separate workflow behavior remain. No edits to Brawndo records were made in browser QA.

**Responsive qualification:** there is no page-level sideways overflow. Existing wide registers retain contained horizontal table scrolling at 768px rather than hiding domain columns. The strict interpretation of “no sideways scrolling anywhere” is therefore not fully met. Changing all column layouts would be a broader register redesign and was not performed.

## J. Deferred significant issues

- Existing SOC 2 UI reports 49 legacy organizational Controls awaiting its existing migration workflow. This task did not migrate them, resolve their descriptions, or alter historical assessments.
- Prestige has no seeded AI systems. Empty state retained rather than fabricating approval/usage records.
- Shared platform branding already says Prestige Worldwide even when Brawndo is selected. Current-client label is correct. This pre-existing global-branding decision was not changed in a Prestige-only task.
- Native Findings/Actions remain distinct registers; consolidation would change the requested preservation boundary.
- The existing CIS greenfield test still reports the documented framework-origin Finding target-date limitation (`docs/cis-greenfield-24-month-qa.md`); passing that simulation does not resolve this separate workflow decision. No CIS changes were made here.
- No new known test failures are accepted; this is local Demo verification, not production or independent security assurance.

## K. Merge/rebase notes

Do not merge this branch automatically. Review alongside Claude's completed Brawndo branch. Resolve shared-file overlap intentionally, especially Layout, RecordDrawer, ReviewDrawer, RecordListPage, store and demoHistory. Retain Claude's approved Brawndo workflow fixes while retaining the explicit Prestige presentation gate and original Brawndo-only permission exception. Re-run the complete suites and both client smoke checks after reconciliation. Do not restore removed synthetic fixtures merely to resolve a conflict. No database migration or dependency install is required.

## L. Delivery boundary

Push only `codex/prestige-redesign`; verify its remote SHA equals local HEAD. Do not push main, modify Claude's branch, or publish any hosted preview. The local preview is available at `http://127.0.0.1:4183`. Exact final commit and working-tree status are supplied in the handoff.
