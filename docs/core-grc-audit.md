# Omnisciente core GRC audit — 15 September 2026

## 1. Executive functional summary

The existing architecture supports a connected Review → Finding → Action → validation chain, recurring occurrence history, and central Risk/Vendor Reviews. The tested chain works, including historical evidence and client isolation. This audit corrected concrete synchronization, navigation, date-counting, identity, and form defects without replacing the domain model.

This is not a production-readiness certification. Policy automatic enrollment, general-purpose multi-record Evidence relationships, and independent Finding intake remain workflow gaps. Browser coverage is representative; the automated suite provides broader lifecycle and authorization coverage. Unexecuted checks are identified below.

Source inspected: GitHub `main` at `7f4d2de98b97b72c79ae81d10ce028674ac4abe0`. The prior hosting source had a different history but the same application tree. Git histories are reconciled without replacing GitHub's authoritative application tree or rewriting commits.

## 2. What works correctly

- Reviews persist, with completed occurrences retained inside the authoritative Review. Scheduled periods, completion actors, dates, notes, comments, and evidence remain attributable to their occurrence.
- Calendar-aware recurrence advances from the scheduled date. Existing tests cover late completion, quarter identity, month boundaries, retries, and history preservation.
- Raising a Finding from a Review retains the occurrence source and creates one authoritative corrective Action. Completing that Action centrally is reflected in historical Related views. Finding closure remains a separate validation decision.
- Risk scores/levels derive from assessment inputs. Accepted Risks retain review obligations; closure preserves history. Existing cadences are preserved.
- Risk and Vendor Reviews use the central Review architecture and synchronize source dates. Vendor assurance/contract workflows reuse that architecture.
- Nested Related drawers return to their originating Review, preserving the register's search context in the exercised flow.
- Demo mutations survive navigation and refresh. External invitations/notifications remain simulated. This audit did not use production records or external messaging.

## 3. Defects found and fixed

| Module/workflow | Issue and impact | Fix | Validation |
|---|---|---|---|
| Review → Raise Finding | `crypto.randomUUID` unavailable in HTTP preview; control threw instead of opening | Cryptographically random UUID helper compatible with HTTP previews; reused for Risk/Vendor reactivation | UUID unit test; browser raised Finding and Action successfully |
| Policy Review creation | Existing Policy relationship field omitted from Review drawer | Restore existing client-scoped Policy picker for Policy Reviews | Browser created linked Policy Review |
| Policy completion | Central Review completion failed to update Policy dates | Project Last/Next Review from existing linked Reviews and completed occurrences; log Policy completion; leave approval status unchanged | Two annual occurrences in backend/demo tests; browser confirmed dates and Draft status |
| Policy editing | Derived dates could compete with central Review dates | Linked Policy dates read-only in drawer and guarded by backend/demo write validation | Backend/demo rejection tests |
| Demo Risk scheduling | Editing central Review due date left source Risk date stale | Synchronize existing Risk date/cadence on Review writes | Demo adapter test; browser Risk completion checked |
| Dashboard | Due-today obligations excluded by timestamp comparison; cancelled Actions included; linked Policy obligation counted twice | Compare calendar dates, respect terminal Action statuses, avoid counting Policy projection separately | Backend/demo count reconciliation tests |
| Portfolio | Risk review date and linked central Review counted as separate deadlines | Count represented Risk deadline once; retain Risk exposure information | Backend/demo portfolio regression tests |
| Portfolio/Related navigation | Provenance foreign keys could be mistaken for the record's own identity | Select identifier by entity type | Diff inspection; browser historical Finding/Action navigation |
| Portfolio date display/drill-down | Date-only values shifted a day in western time zones; today treated inconsistently | Preserve scheduled calendar day; match drill-down day boundaries | Browser/date inspection and production build; no exhaustive time-zone browser matrix |
| Calendar | Clicking title did nothing; arrow opened only a register | Open existing authoritative record drawer, retaining calendar month and client; label month buttons accessibly | Browser opened Q1 Review with Q3/Q4 history directly from Calendar |
| Forms/labels | Generic create drawers exposed later lifecycle fields; Policy approval action sounded like a recurring Review | Hide creation status for normal Finding/Risk, hide completion/last-reviewed creation metadata; safe defaults; label approval action accurately | Existing/new automated tests, build, targeted browser review |
| Sample Policies | Sample `last_reviewed` field did not match UI `last_reviewed_at` | Normalize existing value when canonical field absent, including retained sessions; never overwrite canonical date | Regression test; no dates manufactured |

## 4. Form and creation workflow review

| Module | Fields reviewed and retained | Changes made | Remaining friction / test boundary |
|---|---|---|---|
| Review | Title, type, owner, first due date, recurrence/custom days, notes, Policy relationship | Restored related Policy; no occurrence/completion metadata requested at creation | Raw type labels remain in some contexts. Risk/Vendor relationship comes through existing source workflow. Create/edit/complete exercised in browser |
| Finding | Title, description, severity, owner, target date, corrective Action context | Generic new Finding defaults Open; creation status selector hidden; HTTP failure fixed | Raise Finding currently requires an Action immediately; independent intake needs workflow decision. Review-raised flow tested in browser; manual flow inspected/automated |
| Action | Title, description, priority, assignee, due date, source | Existing Open default and known provenance preserved; no new fields | Central completion/edit and source navigation browser-tested; manual/source coverage automated |
| Risk | Title, category, description, likelihood, impact, rationale, owner, treatment, annual cadence/first date | Generic creation status hidden; defaults Identified/Annual/manual; existing derived score retained | Main Risk intake already has assessment validation. First review date remains required to generate obligation; no invented due-date default |
| Vendor | Name, service/product, criticality, business owner, data/access, cadence/first date, assurance/contract metadata | Generic default Onboarding/Annual/medium criticality | Existing dedicated intake retained. Name/service requirements unchanged. Creation/edit covered by automated suite; existing Vendor Review exercised in browser |
| Policy | Name, category, owner, version, document lifecycle, applicability/presence, dates | Hide creation Last Reviewed; linked dates system-controlled; approval terminology clarified | No automatic annual enrollment or cadence field added. Presence/onboarding fields remain in generic form. Policy and linked Review creation browser-tested |
| Evidence | File, occurrence context, existing central metadata | No new upload fields or duplicate file model | Review upload inherits occurrence and was browser-tested. Central upload form inspected, not browser-submitted; generic multi-link UI absent |

No new required fields were added. No broad required-field relaxation was made. IDs, actor timestamps, score/level, recurrence identity, and known source remain system-owned. Existing edit validation and permission gates were retained. Not every save/cancel/error combination was clicked in the browser.

## 5. Workflow gaps

1. New Policies do not automatically acquire annual Reviews. A linked central Policy Review can now be created and works, but automatic enrollment needs an agreed cadence/first-date policy.
2. Risk/Vendor annual defaults do not create a scheduled Review until a first date exists. Decide whether to require a date, create a Needs Scheduling obligation, or define a product default. No arbitrary dates were invented.
3. Review-raised Findings currently require corrective work at intake. An independent Finding-first stage is not supported by that form.
4. Evidence has a primary `linked_type`/`linked_id`/`occurrence_id` association. Some Vendor relationships reuse Evidence IDs, but a general many-record relationship editor is absent.
5. Central Evidence rows expose underlying relationship IDs without a complete clickable relationship experience. Some Review types and legacy dates still need presentation cleanup.

## 6. Usability improvements implemented

Calendar opens the exact record without a second search. Policy Reviews can select their authoritative Policy. Approval and recurring review terminology are distinguished. Related rows show correct record identities/types and Completed Action status. Normal creation omits inappropriate lifecycle metadata. Portfolio dates and counts agree more closely with operational calendar days.

## 7. Recommended enhancements intentionally deferred

- Agree Policy auto-enrollment and first-review scheduling behavior across sources.
- Separate Finding identification from mandatory remediation intake while retaining one authoritative Action register.
- Design Evidence relationship linking without duplicating the physical file; add clickable central-library relationships.
- Contextually simplify ordinary Policy intake versus onboarding applicability assessment.
- Add human-readable Review type labels consistently and finish date-only display normalization across other legacy screens.
- Define scalable occurrence archival/history storage and stress-test simultaneous completions of different Reviews linked to one Policy. This audit does not introduce a database migration or new engine.

## 8. End-to-end test results

| Scenario | Browser result | Automated result / boundary |
|---|---|---|
| Review → Finding → Action → validation | PASS: QA Quarterly Access Review; Finding and Action created; Action completed centrally; historical Related showed completion; Finding stayed Pending Validation until explicit closure with rationale | Existing occurrence/governance/action suites pass |
| Start / actors / activity | Started Review and saw In Progress; historical actor/date present | Backend lifecycle metadata/activity tests pass |
| Multiple periods | PASS: Q3 and Q4 retained; current Q1 2027 scheduled; refresh retained both | Month/quarter/annual recurrence, late completion and idempotency tests pass |
| Evidence/comments | PASS: Q4 file/comment retained after completion and refresh; Q1 evidence empty; central library retained file | Occurrence evidence/history tests pass |
| Risk Review | PASS: RISK-003 completion updated Last Reviewed and Next Review; Quarterly cadence preserved | Assessment, acceptance, closure, scheduling and tenant tests pass |
| Vendor Review | PASS: Northstar Payroll completion updated Last Review and next annual scheduled date; Active status unchanged | Vendor governance/assurance/history/permission tests pass |
| Policy Review | PASS: new Draft Policy linked to annual Review; completion updated dates without changing Draft | Two annual periods and protected derived dates pass in backend/demo |
| Dashboard | Pages/metrics load; actual record changes exercised | Due-today, terminal status, projection duplication and existing aggregation suites pass; not every metric manually enumerated |
| Calendar | PASS: scheduled QA Review opens original drawer with historical occurrences; month retained | Calendar/lifecycle backend coverage passes; drag/drop not browser-tested in this audit |
| Client isolation | PASS: second client search did not expose first client's QA Review; navigation/refresh retained client | Broader two-client API and demo isolation tests pass |
| Forms/filters | Review, Finding, Action, Policy and related forms exercised; search and return context verified | Existing table/filter/sort suites pass; every column filter/sort combination not manually exercised |

## 9. Data integrity results

The exercised creation/completion/retry flows retain one authoritative Review, Finding, and Action identity. Completed occurrences preserve evidence/source identity across periods. No duplicate or orphan appeared in those flows; existing seed-integrity and lifecycle tests pass. Fixed double-counting was aggregation duplication, not duplicate database records.

Policy and demo Risk dates now synchronize at write/completion boundaries. Existing configured cadences are not overwritten by new default choices. Unknown historical source or missing assessment data was not fabricated. The sample Policy field mismatch was a display/data-shape defect; unassessed Risk scores and intentionally missing owners remain legitimately incomplete sample data. No production database or full historical migration audit was performed.

## 10. Tenant and RBAC results

Browser testing used a simulated demo administrator and two clients. It is not proof of production RBAC. Isolated ASGI tests exercise actual server role checks, client scope, read-only restrictions, and lifecycle authorization. Existing source validation and related-drawer permission gates remain intact. No real OAuth, user provisioning, identity-provider integration, or live permission matrix was tested or changed.

## 11. Regression QA and reproducibility

Frontend: 24 Jest suites, 131 passing tests including audit regressions. Backend: isolated unittest suites `test_core_audit`, `test_review_occurrences`, `test_governance_integrity`, `test_action_items`, `test_risk_lifecycle`, `test_vendor_governance`, `test_review_lifecycle`, `test_client_management`, `test_onboarding_baseline`, `test_standard_initialization`, `test_risk_ids` — 85 passing tests. Legacy tests defaulting to an external service were deliberately not run.

Browser routes loaded: Dashboard, Calendar, Reviews, Action Items, Risks, Policies, Vendors, Contacts & Roles, Evidence, Onboarding, Client Settings, CIS IG1, NIST CSF 2.0, Client Management, Users & Access, Roles & Permissions, Security & Auth, Audit Log. Findings exercised through its drawer. Other framework shells and every standalone form/route combination were not browser-tested. No application-breaking console error observed after repairs; browser extension metadata errors are separate from application errors.

Production preview build passes with four pre-existing React Hook dependency lint warnings (Calendar, ClientDirectory, Evidence, PlatformAdmin). This is a JavaScript project, with no separate TypeScript validation command. Fresh dependency resolution could not complete in this environment; verified installed declared top-level versions and reused matching dependencies from the existing checkout. No dependency versions were changed. Build output is an isolated demo with standard authentication disabled by existing preview configuration; backend fixes are source changes, not a production backend deployment.

## 12. Known limitations and final product answers

| Product question | Answer |
|---|---|
| Can historical Reviews, next work, Findings and Actions be reached? | Yes in tested flows, including Calendar drawer |
| Can a Finding's source/remediation/closure be reconstructed? | Yes for records created through known-source flows; legacy missing source remains explicit |
| Do completed Actions remain inspectable with dates? | Yes in central register and historical Related views |
| Do Risk/Vendor Reviews appear centrally and update sources? | Yes when scheduled; first-date gap remains |
| Do Policy Reviews appear centrally and update sources? | Linked Reviews now do; automatic enrollment remains missing |
| Does Dashboard accurately prioritize work? | Tested calculations pass after fixes; no full production reconciliation performed |
| Is Evidence context understandable and reusable everywhere? | Occurrence history works; generic multi-record linking/navigation is incomplete |
| Are forms minimal everywhere? | Improved, but Policy intake and mandatory Finding remediation still add friction |
| Is the whole product audit-ready without further work? | Not yet. Core chain is traceable; documented workflow and coverage gaps remain |

Demo evidence remains subject to browser session-storage capacity and reset, not permanent audit retention. No external messages, real uploads to production, authentication changes, or tenant/RBAC redesign were made.

## 13. Commit

Implementation commit message: `Audit and harden core GRC workflows`. The final response supplies the verified pushed SHA. This report is stored with the code it describes. Prior hosting history is retained in a merge; GitHub's application tree remains authoritative.

## 14. Preview

The final response supplies the deployment URL after successful publication of the exact pushed commit. Enter with **Explore Demo**. Synthetic QA records are temporary browser-session data and are not committed as sample records.
