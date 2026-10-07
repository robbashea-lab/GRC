# Brawndo workspace pilot

## Reference and delivery boundaries

- Product baseline: merged main `5a57a2e69b386147a5d90b21b43b01af234e9355` (PR #55), preserving PRs #52–54 and the reviewed logout-failure protections. Pilot changes remain isolated on their branch.
- Implementation branch: `codex/brawndo-workspace-pilot`. Main remains unchanged.
- Approved reference: `Omnisciente_Brawndo_Full_Workspace_Preview.html`, SHA-256 `FD16DB862F880304039109D58D62BCB2BBD5A7A2A848B9FD28EFA5206525ED4A`.
- Local prototype interactive review: **not executed—replaced by authorized source inspection and visual-reference review**. Earlier reference-pack images support appearance only; they do not establish interactive behavior or override the latest HTML.
- Prototype records, local persistence, simplified interview, and illustrative risk thresholds are not application requirements and must not be copied.
- Pilot activation is an explicit stable client-identity presentation gate, never an authorization rule. Other clients, the portfolio, and Administration retain their existing experience.
- Only the existing Render staging service may receive the exact validated pilot commit. No main merge, production change, ChatGPT Sites publication, database reset, new accounts, or new runtime dependency.

## Preservation and acceptance matrix

| Area | Preserved authoritative behavior | Required verification |
| --- | --- | --- |
| Dashboard | Summary drill-down before record editing; query filters, pagination, return context; refreshed records | Open → summary → record → save/cancel → return |
| Calendar | Real schedules, occurrences, dates, and record navigation | Date/view navigation and linked records |
| Reviews | Draft protection, recurrence, conclusions, evidence, history | Save/cancel, related-record drafts, reopen |
| Action Items | Finding/task distinction, assignments, closure validation, evidence/history | Linked finding, task save, completion |
| CIS | Native safeguard text, assessment/verification, criteria dependencies, applicability and history | Previous/Next, Save & next, replacement warning |
| Omni | Canonical versioned 153-safeguard engine, optimistic revision checks, unknown/gap distinction | Questionnaire, save/resume/apply/history, drag/resize and keyboard |
| Risks | Existing likelihood × impact methodology; missing and residual scores stay distinct | Matrix counts, cell filtering, clear and register reconciliation |
| Policies | Existing approval, versions, review and document relationships | Edit/cancel, preview and linked records |
| Vendors | Existing diligence, criticality, ownership and reviews | Edit/cancel and supporting records |
| Evidence | Existing upload/download, links, access and history | Link/open, durable hosted retrieval where available |
| Contacts | Existing responsibility and account eligibility rules | Edit/cancel and role relationships |
| Systems & Scope | Existing boundaries, inventory and ownership | Edit/cancel and related records |
| AI Governance | Existing scoped approval and decision history | Edit/cancel and approval boundaries |
| Client Profile | Existing onboarding/configuration, owners and permissions | Configuration/save/draft protection |
| Isolation | Server authorization unchanged; no old-client search/theme/draft leakage | Switch to nonpilot client, restricted access where available |

## Evidence ledger

Checks are recorded as executed, failed, or not executed, never inferred from source inspection.

- Dedicated worktree created from the exact combined baseline; initially clean.
- Release owner confirms exact main `5a57a2e` is live on staging as `dep-db39n6e0tbcc739a5ao0`; candidate and main checks passed. This is the rollback reference, not evidence that the pilot is deployed.
- Created the authorized synthetic staging Brawndo tenant `cli_60dee41ebbcd0e39b8bff87da17aee838ac50ecd799cb955f99d921eb6be4b20` through normal authenticated onboarding: CIS IG1 only, 56 assessments, 12 template Reviews, no Demo-copy/new accounts/reset of existing clients. Explicit pilot gate includes this ID.
- Local browser executed Dashboard summary → native Action Item save/reopen → restored original text → return, originating CIS record opening, canonical Omni save/exit/refresh/resume, physical window drag/resize, risk matrix cell/register reconciliation, CIS control search/status filters and keyboard Enter opening, unsaved narrative retention and explicit discard. These are Demo adapter results, not real-backend persistence proof.
- Local visual inspection covered all 13 modules at 1440px dark and most at 1440px light; 1024px light navigation/overflow checked across all modules. Additional responsive and hosted checks remain to be appended after execution.
- Dashboard and CIS overview use the approved horizontal snapshot and real control/status counts. The pilot ring shows one decimal from implemented/applicable counts (32/56 = 57.1%), not the rounded summary field. Documented colors: implemented `#27b895`, partial `#edb040`, not implemented `#e7787b`, not assessed `#9eacc1`; decorative segment gaps do not change counts or percentages. Hover/keyboard focus enlarges the segment and exposes its own label/count/fraction.
- Supplied recording `20261007-1906-38.2959964.mp4` was not decoded: no installed decoder was found and Windows blocked the run-owned media extraction script. No execution-policy or browser-policy bypass, software installation, or security setting change occurred. Screenshot/description clarification requested; approved HTML source and actual application rendering remain separately documented evidence.
- Full local suite run before final snapshot fixes: 231 suites passed, 6 failed (two bad dashboard test response fixtures; five suite imports newly pulled a router dependency into pure overview tests). Fixed the fixtures and extracted the existing pure donut; reran all failed suites plus affected framework coverage: 7 suites / 316 tests passed. Additional logout, Omni, layout, identity-gate and risk suites: 10 suites / 46 tests passed. A subsequent decimal/presentation run: 2 suites / 16 tests passed. These overlapping totals must not be added together or described as a final full-suite pass.
- Optimized Demo build succeeded; known bundle-size advisory and Node fs.F_OK deprecation remain. Exact final commit CI and hosted acceptance remain required before staging deployment.
- Focused independent read-only review of candidate `54c198a` found no demonstrated blocker after the two original dashboard fixes. This was source review, not independent browser or hosted assurance.
- Responsive check found icon-rail links lost accessible names because visible text was hidden at 768px; fixed explicit navigation names (and Portfolio button name), added regression assertions, and retested actual browser navigation. All 13 modules then loaded in both themes at a verified 768×900 viewport without document-level horizontal overflow. Earlier files mislabeled 768 while a new tab used default1280 were overwritten after verifying innerWidth; they are not counted as breakpoint evidence.
- Normal authenticated/staging build also succeeded using unchanged `frontend/scripts/staging.cjs`; no security settings or backend behavior changed.
- Remaining restricted-role/cross-client, invitation activation, and exact cookie-attribute checks from the combined release remain limitations unless actually executed here.

## Deployment and rollback

Record the current staging deployment immediately before publication; coordinate with the release owner to avoid replacing intervening work. Rollback changes only the staging application deployment, never the database or existing records. Final deployed commit, CI, hosted results, and rollback reference will be appended after execution.
