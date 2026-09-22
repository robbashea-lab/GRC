# Client portfolio command center

## Scope and inspection

The client table is now the platform Portfolio dashboard. Removed only the
always-visible summary cards, cross-client attention queue, Program Status and
Next Major Item presentation. Existing management populations, client Dashboard,
operational workflows, lifecycle states, assignments and applicability remain
authoritative. No migration, seed, credentials, dependency or permission changes.

Inspection found that the prior combined Critical / High metric included Risks;
the new table separates them without changing that legacy metric for other
consumers. The former Last Activity could be a generic edit. The browser's Demo
record adapter supported individual reads that the server's generic entity router
did not: the existing portfolio record loader received HTTP 405 against FastAPI.
The server now supplies an authorized read using its existing resource-scope
helper, not a new authorization model. This route has positive and negative tests.

## Metrics and navigation

| Column | Definition / action |
| --- | --- |
| Client | Existing name, industry, applicable archive/onboarding annotation; opens client Dashboard |
| GRC Lead | Existing authoritative client relationship projection, not guessed from membership; retained historical-assignment warning |
| Frameworks | Finalized onboarding plus tenant requirement `baseline_response=applies`; existing client framework routes |
| Past Due | Existing management obligation population before today; exact contributing-item drawer |
| Due <=30d | Existing management upcoming population through its inclusive 30-day boundary; exact contributing-item drawer |
| Critical / High | Existing material Findings and standalone high-priority Actions; Risk entries removed from this projection only |
| Significant Risks | Active assessed High/Critical Risks, including accepted and excluding closed/archived; client Risk Register with explicit URL constraint |
| Unassigned | Existing management unassigned obligation population, not new ownership rules |
| Last Activity | Most recent supported lifecycle audit event for that client; otherwise Not recorded |

The shared management calculation continues to own represented remediation,
Review occurrence completion, parent schedules, terminal-state exclusions and
deduplication. New portfolio projections do not copy operational records or invent
another scheduling engine. Drawer counts are checked against complete arrays;
an incomplete response fails visibly rather than displaying a truncated list.
Drawers fetch the authoritative current record, not a summary or capped list.

Risk drill-in requests use the same assessment and active-record rules, bypass
the old register's 1,000-record cap, and do not run its legacy ID initialization.
An isolated API test returns 1,005 accepted significant Risks without source writes.
Users can refine this explicit context or remove it to return to the full register.

Framework chips are neutral: applicability alone is not readiness, compliance or
certification. Existing incomplete framework pages remain incomplete. No scores,
new assessments or fabricated framework statuses were added.

## Shared architecture and state

- `portfolioRules.json` shares default ranking and an exact activity whitelist
  between Python and JavaScript; `portfolio_overview.py` / `portfolioOverview.js`
  project existing populations. Activity excludes login, view and generic update.
- Existing `TableControls` accepts optional controlled state. Portfolio quick
  filters update the same column filter state: categories AND, selected values OR.
- Search, lead, framework, numeric/date filters and explicit column sorting work
  together. Default ranking is descending issues, past due, significant Risks,
  unassigned, upcoming, then client name and ID. No synthetic importance score.
- All Clients means authorized clients. Assigned to Me means authoritative GRC
  Lead identity, not an access grant. Scoped internal administrators see only
  authorized clients without a redundant All/Mine toggle. Archives remain opt-in.
- In-memory preferences are keyed to the current authenticated identity and scope.
  Navigation back restores search, filters, sort, archive choice and scroll. New
  authentication, page refresh or changed scope resets preferences. No record cache,
  browser credential storage or permanent Saved Views.

## Authorization and data integrity

The server retains the existing internal-role portfolio gate and client-scope
query. Neither GRC Lead, framework applicability nor a URL can grant client access.
Record reads, member lookup and Risk drill-in enforce the existing server resource
scope. Individual reads omit private governance-lock state. Name lookups are
limited to referenced users, and record sources are grouped once by authorized
client. Meaningful activity uses one scoped aggregate and returns only date/label.

Demo read queries now reject unrelated client IDs and records, matching the
existing server boundary. Demo tests are not evidence of persistent authentication.
No permissions, account status, memberships or current GRC Lead assignments changed.
Existing explicit archive/restore menu actions remain; rendering/navigation never
invokes them. API snapshots and Demo browser snapshots confirm read-only browsing.

Security rationale: OWASP's [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
recommends deny-by-default and per-request resource authorization. Native tables
with separately named controls follow the [ARIA table guidance](https://www.w3.org/WAI/ARIA/apg/patterns/table/).
These selected checks are not an independent security audit or conformance claim.

## Verification ledger

| Evidence | Result |
| --- | --- |
| Frontend automated | 332 tests, 61 suites passed using CRACO Jest `--watch=false --runInBand` |
| Backend isolated automated | 205 tests in 27 selected suites, plus 4 separately run client-management tests passed; real ASGI routes and authorization with isolated Mongo fixtures |
| New server coverage | Exact metric identities; finalized/removed frameworks; meaningful activity/noise/future exclusion; lead not access; archive/onboarding; accepted vs closed; stable order; direct-record 200/401/403/404; 1,005-Risk read-only drill |
| Frontend coverage | Shared projections, framework choices, controlled filtering, session/scope resets, exact full and empty drawers, client switching/navigation, Demo scope |
| Production build | `node frontend/scripts/preview.cjs build` passed; unchanged existing PlatformAdmin hook-dependency warning |
| Focused ESLint | CRA's installed ESLint/config, ES2021 runtime: zero errors; 28 warnings reproduced unchanged in the three baseline files RiskRegister, adapter, summaries |
| Type checking | No separate TypeScript project/check configured; JavaScript production compilation passed |
| Browser portfolio | All five clients: all five counts reconciled against source populations; all four metric drawers' exact identities; authoritative record opens; significant Risk register and refresh |
| Browser filters | Past Due + HIPAA; Critical/High + GRC Lead; search + Unassigned; Assigned to Me + CMMC; sort; clear; zero results; archive opt-in and return-state retention |
| Browser scope | Restricted internal Demo persona sees only its authorized client in portfolio/sidebar; server authorization tested separately |
| Browser scale/layout | 10, 25 and 55 synthetic clients at 1366, 1440 and 1920 desktop widths; no page overflow, compact readable rows, back-scroll restoration |
| Browser interaction | Labeled controls, menu selection, Escape close, drawers, links, neutral active states; no new animation; portfolio menus deliberately motionless |
| Browser regression | Five clients x 13 modules plus applicable frameworks, Client Management, Users and Audit; no console/page errors or changed operational arrays |
| Authentication regression | Preview fields blank; Standard Sign In still explicitly disabled; Explore Demo and logout work without standard token |
| Release review | Full diff reviewed; no generated bundles, local QA scripts, environment files, secrets or dependency changes included |

The initial standalone lint attempt used the wrong top-level ESLint config path;
the corrected command uses `node_modules/react-scripts/node_modules/eslint` and
the adjacent React App config with `--env es2021`. No rule was disabled. The
production build also runs the project's configured hook checks.

Local browser QA used the actual production assets with session Demo data in Edge
via Playwright, not mocked HTTP responses. Synthetic scale/persona data was created
only inside an isolated browser session. These checks do not claim a live persistent
backend/browser integration test. The persistent staging/storage gate remains out
of scope. No legacy external-service test was pointed at uncertain live data.

## UI review

| Before | After | Review |
| --- | --- | --- |
| Multiple summary cards and a second attention register | One compact client table with exact click-through populations | Approved; no duplicate dashboard wall |
| Combined material issues/Risks and unsupported broad status | Explicit issue and Risk columns; real applicable framework chips | Approved; explanatory values, no invented score |
| Context lost on drill/back | Identity-scoped preferences and scroll restore | Approved in browser |
| Interrupted menu exit could retain an overlay | Portfolio investigation menus close immediately | Fixed and browser-verified |
| Potential wide/dense grid | Checked 1366/1440/1920; contained horizontal scroll fallback | Approved at tested widths |

Verdict: Approve within this scoped review; no HIGH-severity UI issue identified in
the exercised flows. Existing light workspace, charcoal sidebar, lime navigation,
typography, semantic colors and shared components remain. No new transitions to
slow-motion review; this is not a whole-platform accessibility certification.

## Limitations / release

No new trend engine, compliance scoring, source-event backfill, new GRC staff role,
permission model, onboarding or operational lifecycle behavior. Old Demo seeds
without meaningful audit events honestly show Not recorded. Existing stale GRC
Lead assignments remain visible rather than being silently rewritten. Completeness
is prioritized over a silent cap; much larger real datasets may require measured
server pagination work, not browser-only truncation.

Browser evidence covers the local static Demo. Persistent multi-user staging,
real account authentication and deployed-backend behavior are NOT VERIFIED by this
change. The exact tested JavaScript asset is `main.5fa80ade.js`.

GitHub main and Sites use their existing separate histories with identical source
trees; no force-push or history rewrite. Exact commit hashes and actual publication
outcome belong in the release handoff. This report does not assert that hosting
succeeded before the deployment service returns its terminal result.
