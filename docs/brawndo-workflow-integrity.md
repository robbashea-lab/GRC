# Brawndo workflow integrity and lifecycle QA

Executed 2026-10-01 on branch `claude/brawndo-workflow-qa`, rebased on main `fc02c0b`. Scope: the Brawndo Demo client (`demo_brawndo`) only, using synthetic data. This is product QA, not a compliance opinion. No merge, deployment or ChatGPT Sites publication.

## Baseline and work not repeated

Main gained two commits after this work began:

- **`e90927a` — CIS IG1 Assessment Criteria.** This replaced the Brawndo safeguard's Foundation/Operational/Mature checklist and Stronger-practice tags with 85 criteria paraphrased from CIS. That design is kept as it is.
- **`fc02c0b` — greenfield CIS 24-month QA** (`docs/cis-greenfield-24-month-qa.md`). For a new non-Brawndo client it already validated:
  - the onboarding baseline
  - every cadence, including custom 7 days as the weekly equivalent
  - the missed-month model
  - the CIS cadence matrix and policy-mapping review
  - Calendar and Dashboard derivation
  - Evidence deduplication
  - a 24-month simulation

  Those results are not repeated here. Their test suite was re-run (see Tests).

This pass covers what that work did not:
- Brawndo-specific code paths, which are gated on `demo_brawndo` in the Demo adapter and the Brawndo UI.
- The Brawndo seed data.
- Cross-module traceability in the Brawndo workspace.

## Relationship map and sources of truth

| Concept | Authoritative record / field | Projections (read-only views of it) |
|---|---|---|
| Review due date and cadence | `reviews.due_date`, `recurrence`, `schedule_anchor` | Calendar, Dashboard, Policy `next_review_date` (mirrored), Risk `next_review` (synchronised), Vendor `next_review` (synchronised) |
| Review history | `reviews.occurrences[]`: original due date, actual completion date, outcome, Findings count, Evidence | Review history, Calendar history scope |
| Finding | `findings`. Origin is `review_id` + `occurrence_id`, `framework_assessment_id` (CIS safeguard), or `vendor_id` (from a Vendor Review). A Policy is reached through its Review. | Review detail, Policy related list (fixed), Action origin labels |
| Action Item | `tasks`, with `finding_id` / `review_id` / `occurrence_id` / `source_type` | Action Items, Dashboard, Calendar |
| Finding readiness | Derived from its Action Items: open → in remediation → remediated (Pending Validation). Closing requires an explicit `/validate`. | Finding status |
| Risk review | The Risk's linked Review. `risk.next_review` and `review_cadence` are synchronised with it. | Calendar, Dashboard |
| Vendor review / assurance / contract | Separate Reviews by `vendor_purpose`. Assurance documents are in `assurance_records[]`. Contract fields are `contract_renewal` and `contract_notice_deadline` (Demo only). | Calendar (as Reviews), TPRM views, Dashboard |
| Policy dates | Derived from the policy's linked Review(s). They can be edited manually only when no linked Review exists. | Policies, Dashboard |
| CIS safeguard | `framework_assessments`: status, explicit `verification`, `cis_assessment_criteria`, `assessment_history` | CIS workspace, Dashboard CIS summary |
| Evidence | One `evidence` record per file. The origin is `linked_type` / `linked_id`; supporting links are `relationships[]`. | Evidence Library, per-record lists |
| Calendar | No stored events. It is a projection of Reviews, Findings and Actions by due date. | — |

Duplicated or mirrored state, documented here and not changed:
- **Policy dates** mirror their Review.
- **Risk and Vendor next-review fields** mirror their Review.
- **Legacy vendor assurance and contract fields** (`assurance_expires_at`, `contract_end`) still feed two older Dashboard widgets in the backend.

## Minor fixes implemented

Every fix has a regression test that fails without the fix and passes with it.

| # | Issue | Root cause | Fix | Regression test | Affects other clients |
|---|---|---|---|---|---|
| 1 | Brawndo policy and risk reviews scheduled the next cycle from the completion date (Sep 1 due, done Oct 31 → Oct 31) | A Brawndo pilot branch in `preview/reviews.js` and `preview/risks.js` | Anchor to the scheduled cycle, as the backend and every other client already do. The admin risk override still reschedules explicitly. This was your approved decision. | `brawndoPolicies.test.js`, `brawndoRisks.test.js` (updated) | No |
| 2 | Quick-create Finding from the review record screen sent no request id, so a retry could create two Findings | `RecordDrawer.jsx` | Send `request_id` | `remediationSync.test.js` | Yes (bug fix) |
| 3 | Deleting an open Action Item left its Finding "In Remediation" with no remediation | No resynchronisation on delete (backend and Demo) | Recompute: back to Open when no Actions remain, otherwise follow the remaining Actions. Accepted and closed Findings are untouched. | `test_workflow_integrity.py`, `remediationSync.test.js` | Yes (bug fix) |
| 4 | A Finding's own history didn't record its remediation transitions. The move to In Remediation at Action creation wasn't recorded at all. | Events were written only against the Action Item | The Finding now records "moved to In Remediation / Pending Validation / returned to Open". The Action's existing event is kept. | Same as #3 | Yes (history addition) |
| 5 | The Demo ignored `Idempotency-Key` on ordinary creates, so a retried Finding or Action create duplicated the record | Replay was limited to Brawndo vendor Actions with an explicit `source_type` | Replay every create kind that `lib/api.js` attaches a key for, scoped to user + client + key, matching the backend. Older vendor replay records stay readable. | `createReplay.test.js` | Yes (Demo bug fix) |
| 6 | All 56 Brawndo safeguards showed "Not verified" | The seed tuple had no verification value | Explicit, varied verification that is independent of status: Not assessed → Not verified, gap → Gap identified, evidence-backed and recent → Verified, otherwise Needs validation | `brawndoSeedIntegrity.test.js` | No |
| 7 | Seeded CIS Finding 1.1 predated its assessment. 14.1 was "Implemented" with an open gap Finding raised 14 months after its last assessment. | Seed values | 1.1 Finding age changed from 50 to 38 days. 14.1 is Partially Implemented, assessed 90 days ago. | `brawndoSeedIntegrity.test.js`, `dashboardWorkQueue.test.js` (count 33 → 32) | No |
| 8 | Endpoint Protection Validation (an Omnisciente recommendation) was labelled "Organization-defined" | The seed hard-coded `organization_defined` | Recommended plans use `recommended`. CIS-plan reviews cite the CIS-stated interval. | `brawndoSeedIntegrity.test.js` | No |
| 9 | Rescheduling a Risk or Vendor review kept the old recurrence day (moved to Nov 10, completed → Feb 25 instead of Feb 10) | The projection overwrote the reset anchor | Reset first, then project | `brawndoScheduleIntegrity.test.js` | Demo, all clients (bug fix) |
| 10 | Seeded Brawndo history drifted on month-end cadences (Feb 28 → May 30 instead of May 31) | The seed stepped back from the previous step, not from the anchor | Step back from the anchor with month-end handling. Gated to Brawndo, so other clients' seed data is unchanged. | `brawndoScheduleIntegrity.test.js` | No |
| 11 | A Finding raised in a Policy Review wasn't visible from the Policy | `/related` for policies didn't follow the policy's Reviews | Include Findings and Actions from the policy's Reviews (backend and Demo) | `test_workflow_integrity.py`, `brawndoScheduleIntegrity.test.js` | Yes (bug fix) |
| 12 | (Withdrawn) The Dashboard assurance count was aligned with the Brawndo Vendors page, then reverted | — | The ten-year reconciliation showed the two rules disagree on *missing* documents, so this is a rule decision (significant issue #15) | — | — |
| 13 | A never-assessed safeguard showed "Not assessed · Morgan Ellis" | The assessor was shown without a last-assessed date | Show the assessor only when there is an assessment | `BrawndoCisAssessment.test.jsx` | No |
| 14 | The diff review found that fix #8's provenance wording leaked into ISO, SOC 2 and Initech demo plans | The seed condition wasn't gated | Applied to Brawndo CIS plans only; other clients keep their original provenance | `brawndoSeedIntegrity.test.js` | Prevented |

## Significant issues (not implemented)

Each issue lists the current behaviour, the risk or impact, and a recommendation. Decisions are yours.

1. **No Brawndo path from a safeguard to its Findings and Actions.**
   - Current: since `e90927a`, the Brawndo CIS workspace shows no linked Findings or Actions and offers no way to raise a Finding, although the data and API carry the links (`work.open_findings`, `/related`).
   - Impact: seeded narratives point to records the user cannot reach ("see open Finding" on 6.2). The reverse direction works: Action origin labels open the safeguard.
   - Recommendation: a compact, read-only "Open Findings / Actions" line on the safeguard, plus the existing Raise Finding flow. Needs a UI decision because it reverses part of `e90927a`.
2. **Findings awaiting validation still count as overdue and as open critical/high on the Dashboard.**
   - Also: a Finding and its own Action count separately in Past Due, and "critical" and "critical/high" tiles share one value.
   - Needs a rule for whether Pending Validation counts as outstanding, and a labelling decision.
3. **Brawndo's 17 policy review dates have no linked Review**, so they appear on the Dashboard but not on the Calendar. Two generic reviews have `review_type: policy` but no policy.
   - Decide whether to seed linked policy Reviews or project policy dates onto the Calendar. This relates to the greenfield finding that policies have no individual cadence.
4. **A second active Review can be created for the same Policy.** Risks have a guard; Policies don't, and the earliest date wins silently.
5. **The contract review ignores `contract_notice_deadline`.** This field exists only in the Demo. When the notice deadline is more than 90 days before renewal, the review falls due after the deadline has passed. Needs a rule and a backend field decision.
6. **Brawndo pilot rules exist only in the Demo adapter.** The backend has no Brawndo branch except the criteria. Examples:
   - risk `monitoring` status
   - vendor stages
   - the assurance documents that Brawndo deliberately doesn't stamp at review completion, which is correct and avoids inventing document-review history
   - the contract notice deadline
   - informational priority

   Backend parity needs a product decision.
7. **Carried from the greenfield QA, referenced rather than repeated:**
   - missed-occurrence backlog model
   - no named Weekly cadence
   - framework-origin Findings take no target date
   - policy scheduling at onboarding
   - event-driven obligations ("on significant change") aren't scheduled
8. **CIS provenance in the shared catalog.** 2.1 (six-monthly) and 7.1 (annual) sit inside monthly plans and are labelled as recommendations, because a backend test requires one interval per plan. The schedule is more frequent than CIS requires, but the label is inaccurate.
9. **Month-end anchor promotion.** A monthly review due Apr 30 continues on month-ends (May 31). This is intended for quarter-ends, but ambiguous for monthly reviews.
10. **Leftover code after `e90927a`.** `cisTiers.js/json` is unused, and `verification_checklist` is still accepted by the backend and Demo, so a cleanup decision is needed. `test_iteration7.py` is stale and excluded from the runner.
11. **Calendar omits vendor assurance follow-up and contract renewal dates** unless a separate Review exists. The browser check found no Nov 15 follow-up or Apr 15 2027 renewal. The Dashboard shows them; the Calendar projects only Reviews, Findings and Actions.
12. **Brawndo policies have no review action on the Policy itself.** A policy-review Finding can only come from the generic "Policy Review and Approval" Review, so it isn't tied to a specific policy (see #3).
13. **Count definitions differ between pages:**
    - Calendar "Overdue" (4) also counts an overdue Finding that already has an Action; Dashboard "Past Due" (3) counts it once, as the Action.
    - Dashboard "Unassigned" counts an Action owned by a disabled account; Action Items doesn't.

    Both need agreed definitions.
14. **Complete Review has no confirmation or outcome step.** It records "No Findings" without notes even when Findings were raised. Changing this changes the review workflow.
15. **"Assurance needs attention" has two rules.** The Dashboard and the ten-year reconciliation use the generic `assuranceStatus` rule, which counts expired, due-soon or *missing* required documents. The Brawndo Vendors page uses `assuranceAttention`, which counts follow-ups and certificate expiry only and ignores missing documents. After a questionnaire is marked Reviewed, the Vendors page reads 0 while the Dashboard reads 1. Decide whether a missing required document counts; both views should then use that rule.
16. **Mixed date formats.** After a completion, Demo due dates are stored as full timestamps; seed data uses date-only. Views normalise them, but equality comparisons are fragile.

## Results

### Brawndo-specific workflow checks (automated probes and tests)

| Area | Result |
|---|---|
| Recurrence | Pass (after fixes #1, #9 and #10) for generic, CIS-plan, policy, risk and vendor Reviews: early, on-time and late completion; Mar 31 → Jun 30; Sep 1 → Sep 1; Dec → Jan; Nov 30 → Feb 28 → May 31 |
| Review completion | Pass. A history occurrence is kept with its original due date and actual completion date. The next occurrence is scheduled. No duplicate Review. Calendar and Dashboard update with no manual sync. |
| Finding → Action | Pass from Review, Vendor Review, Policy Review and CIS safeguard origins. Each creates exactly one Action, and retries replay. Completion moves the Finding to Pending Validation; `/validate` closes it. The origin stays traceable. |
| Risks | Pass. The default annual Review is created. Cadence and owner changes propagate. A treatment Action doesn't close the Risk. Accept keeps the Review; Close cancels it. An overdue Risk Review shows on the Dashboard and Calendar. |
| Policies | Pass for policy dates following their Review and approval staying independent of completion. Fix #11 for visibility. Gaps are in significant issues #3, #4 and #12. |
| Vendors (three clocks) | Pass. Review, assurance and contract dates are independent across completions and edits. Brawndo deliberately doesn't stamp assurance documents at review completion. Calendar gap: significant issue #11. |
| Evidence | Pass. One record with three references. Re-linking doesn't duplicate. Unlinking keeps the other links and the origin. Unassigned files show as Needs Classification. |
| Ownership | Pass. A disabled assignee and an archived contact keep their records and history, and the disabled owner stays visible. |
| CIS IG1 | 56 safeguards with valid owners and coherent history. Varied implementation and explicit verification (fix #6). Cadence and provenance table below. Gap: significant issue #1. |
| Seed integrity | No orphan relationships, duplicate Actions, duplicate obligations or duplicate Calendar keys. Date order is consistent (fixes #7 and #10). |

### CIS review cadence and provenance (Brawndo)

| Review | Safeguards | Cadence | CIS source | Provenance shown |
|---|---|---|---|---|
| Asset and Software Inventory (shared generic Review) | 1.1–1.2 | Quarterly | Semiannual, explicit | Organization-defined; more frequent than the source |
| User Access Review (shared generic Review) | 5.x, 6.x | Quarterly | Quarterly, explicit | Organization-defined |
| Security Awareness and Training (shared generic Review) | 14.x | Quarterly | Annual, explicit | Organization-defined; more frequent than the source |
| Software Authorization & Support | 2.1–2.3, 9.1, 12.1 | Monthly | Monthly, explicit | Adopts the CIS-stated interval |
| Data Management & Inventory | 3.1–3.6 | Annual | Annual | Adopts the CIS-stated interval |
| Secure Configuration Process | 4.1–4.2 | Annual | Annual | Adopts the CIS-stated interval |
| Vulnerability & Remediation | 7.1–7.4 | Monthly | Monthly | Adopts the CIS-stated interval |
| Audit Log Management | 8.1–8.3 | Annual | Annual | Adopts the CIS-stated interval |
| Data Recovery Governance | 11.1–11.4 | Annual | Annual | Adopts the CIS-stated interval |
| Service Provider Inventory | 15.1 | Annual | Annual | Adopts the CIS-stated interval |
| Incident Reporting & Contact | 17.1–17.3 | Annual | Annual | Adopts the CIS-stated interval |
| Endpoint Protection Validation | 4.3–4.7, 9.2, 10.1–10.3 | Quarterly | None | **Omnisciente recommendation** (fix #8) |

No Brawndo Review is less frequent than its CIS source, and none is duplicated. The policy-to-CIS links shown in the Brawndo UI exactly match `cisIG1.json` `policy_mappings`. The adequacy of each mapping is assessed in the greenfield doc, §F.

### Browser QA (1440 light full path; 1440 dark and 768 light key pages)

26 of 30 steps pass. 0 serious or critical axe violations. No application console errors.

| Step | Status | Detail |
|---|---|---|
| 14–16 (policy review and Finding on the Policy) | Not available | See significant issues #3 and #12 |
| 21 (Calendar shows assurance and contract dates) | Fail | See significant issue #11 |
| 24 (raise a CIS Finding from the safeguard) | Not available | See significant issue #1 |

The Dashboard and Vendors assurance counts disagree. This is now significant issue #15: a fix was tried and reverted because the right rule is a business decision.

Usability notes (not changed):
- At 768 the Calendar grid scrolls inside its card (it has a minimum width).
- Some list dates omit the year.
- Some raw values and IDs appear ("risk assessment", "fw_demo_brawndo_assessment_2.1").
- Severity is "Medium" in one place and "Moderate" elsewhere.
- "Continue with" targets an already assessed safeguard.
- The demo banner doesn't switch to dark.
- At 390 width (out of scope) the Dashboard, CIS and Evidence pages scroll sideways.
