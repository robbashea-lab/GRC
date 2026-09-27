# Multi-framework reference validation

> Historical task report: deployment restrictions below applied to that task only.
> Current merge/publication authority is [GitHub main → ChatGPT preview](publishing-workflow.md).
> Railway is retired from the intended workflow; the one-time disconnection hold
> is tracked there, not a recurring release requirement.

Scope: CIS v8.1 IG1, ISO/IEC 27001:2022 and SOC 2 only. Start at
26a9f4a33699e4b87d06b7fb8a600ee9416dcccd on the existing unmerged PR #6 branch.
No main merge, Railway/settings/deployment, Sites publication or reference-client reset.

## Architecture / acceptance plan

- Create Aperture Research — Multi-Framework Reference through the actual Demo
  Create Client and four-step onboarding UI. Do not insert a completed seed.
- Preserve 17 shared policy families and existing baseline-key Review identity.
  Group only catalog-declared equivalent activities, never fuzzy titles. A provider
  inventory is not automatically a supplier assurance review; recovery governance
  is not automatically a recovery exercise.
- Retain all Review drivers and their source/default cadence in an additive field;
  propose the shortest applicable explicit source interval, otherwise a product
  default. One client choice per shared activity. Never reschedule existing work
  during framework activation/removal; retain occurrence snapshots.
- Extend client-owned organizational Controls to the three supported assessment
  families, retaining server-side scope/property authorization and independent
  assessment state. Do not broaden client-role privileges.
- Exercise one shared Evidence/Finding/Action chain, framework-specific gaps,
  central Risk/Vendor/Policy Reviews, owner/scope changes, framework removal/re-add,
  dense five-year history and dashboard/portfolio/calendar reconciliation.
- Add focused regression tests before full suites/builds and actual browser QA.
  Keep content confidence, isolated runtime tests and staging limits separate.

## Initial UI findings (before changes)

Real client creation and onboarding completed in isolated localhost Demo. Selected
only CIS/ISO/SOC; existing three clients not edited. 30 framework Review proposals
represented 22 canonical activities, but UI duplicated schedule fields and summary
rows for access, awareness, risk, vendor and policy activities. Every policy family
was asked once. Source numerical requirements were distinguished from defaults.

Code trace: generation already shares baseline-key Reviews, but only the first
framework's provenance is stored on the Review; other associations are recoverable
from assessment links. Existing schedule wins by catalog/insertion order, without
explicit reconciliation. Deactivation changes only the first framework flag.
Occurrence snapshots do not retain the full driver set. Controls currently reject
CIS/ISO mappings by design; this phase explicitly authorizes extending that limit.

## Source verification

2026-09-26: CIS official assessment specification Control 5 (5.1 quarterly account
authorization validation), Control 7 (7.2 monthly remediation-process review), ISO
official 27001 metadata and AICPA 2017 TSC/revised 2022 public resource rechecked.
No new ISO/AICPA numerical minimum inferred. Earlier public-source baseline and
licensed-source limitations continue to apply.

- https://cas.docs.cisecurity.org/en/latest/source/Controls5/
- https://cas.docs.cisecurity.org/en/latest/source/Controls7/
- https://www.iso.org/standard/27001
- https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022

## A. Multi-Framework Client Created

**Aperture Research — Multi-Framework Reference**, synthetic research/technology
services; CIS v8.1 IG1, ISO/IEC 27001:2022 and SOC 2 Security/Common Criteria.

Actual loopback Demo browser workflow: Create Client → framework selection → 17
Policy answers → 22 shared Review proposals → Review & Create. Native first-date
entry persisted as **2027-04-30**, displayed on the resulting access Review and
survived browser refresh. All three framework associations appeared on that Review.
The initial browser driver needed a native keyboard date-change event; a DOM-only
date fill was not accepted as persistence evidence. No speculative date fix made.

The durable regression generator separately starts with a new client and calls
normal Demo onboarding/record/lifecycle APIs under a controlled 2027–2031 clock.
It exports an optional ignored synthetic fixture for normal-auth browser inspection.
It does **not** insert a finished client into the sample seed or edit the canonical
three clients. The browser-created client is tab-local; the five-year reference is
reproducible from the test, not published to the hosted preview.

| Entity | Fourth-client lifecycle total |
| --- | ---: |
| Framework assessments | 212: 56 CIS + 123 ISO + 33 SOC |
| Onboarding Reviews | 22 from 30 catalog drivers |
| Final central Reviews | 27 including Risk, Vendor and per-Policy work |
| Completed occurrences | 285 |
| Policies | 17 unique policy families |
| Shared organizational Controls | 1, mapped across all three frameworks |
| Evidence | 286 distinct records |
| Findings / authoritative Actions | 4 / 4 |
| Risks | 3: active significant, accepted, remediated/closed |
| Vendors | 2: critical and normal; critical also has stale assurance |
| Systems | 2: original retired, replacement active |

The normal-auth operator browser added one separate synthetic attachment/comment
to its isolated copy. Those are not included in the reproducible lifecycle counts.

## B. Shared Activities Tested

All 22 catalog-declared activities were operated centrally, with 51/55/55/61/63
completions across the five years. Shared access authorization, awareness, risk,
policy, vulnerability and supplier activities retain their individual mappings.
Asset, logging, recovery governance and exercises keep their actual catalog scope.
No new mapping is inferred from a similar title. Recovery review and exercise,
and provider inventory versus supplier assurance, are not forcibly merged.

Access, information security, risk, supplier, awareness, continuity and incident
policy families remain single Policy records with supported framework relationships.
The additional annual access-Policy Review refers to the actual Policy, not three
framework-specific copies. Its five occurrences do not grant Policy approval.

## C. Cadence Reconciliation

Catalog `baseline_key` is the existing operational identity. Onboarding now presents
one schedule per identity and writes the choice to all contributing plan keys.
The shortest **applicable explicit source** interval is proposed first; if absent,
the shortest existing Omnisciente setup default is proposed. Client cadence remains
an explicit configurable value, not a regulatory conclusion.

Access authorization proposes quarterly; vulnerability remediation-process review
proposes monthly from the cited CIS source. No numerical ISO/SOC mandate was added.
UI separates source interval, product default and configured client schedule, and
warns when the latter is less frequent. Different saved driver schedules/dates are
rejected before finalization instead of silently selecting the first configuration.

Reviews now retain additive `framework_drivers` entries: framework/version, plan,
requirement IDs, basis, source/default/minimum cadence, references and active flag.
Existing operational schedules are never rescheduled by applicability reconciliation.
Completed occurrences retain the drivers that existed when they completed. Older
history is not retroactively embellished. The legacy scalar driver-active flag still
describes the original primary framework, preserving existing callers.

## D. Shared Controls

One access Control supports CIS 5.1, ISO A.5.18 and SOC CC6.2. The existing many-to-many
Control model now accepts these three framework families, with the same tenant,
property, assignment and role validation. The search selector uses a minimal scoped
candidate endpoint rather than downloading three complete framework workspaces.

Two legacy SOC descriptions with the same Control ID deliberately conflict. Migration
retains four original current/history sources, leaves description unresolved, and
requires an explicit reconciliation decision. The operator combines both populations;
original criterion assessment/history snapshots remain intact. No fuzzy merge added.

Control and Review changes do not update assessment conclusions. After remediation,
the test explicitly records different assessor judgments: CIS Implemented, ISO
Partially Implemented, SOC Needs Remediation/Validation; SOC is separately reassessed
Addressed (Readiness) the next year. This is synthetic assessor input, not auto-pass.

## E. Shared Evidence

One 2029 access artifact links to its occurrence, all three assessments, the shared
Control and Finding without copying the file. The first 2027 artifact remains tied
to its original period. Unlinking it from CIS preserves ISO/SOC, Review and Control
relationships; attempted deletion of historically retained Evidence is rejected.
Expiration, source filename/type/date and historical owner remain inspectable.

The dense test exercises the existing bounded Demo payload cache. It may move bytes
to session memory; every canonical record's metadata remains identical and a displaced
canonical download is checked byte-for-byte. This is not persistent file-store testing.

## F. Findings / Actions

One late privileged-access/supplier-rights deficiency creates one authoritative Action.
It is explicitly mapped across the three assessments and Control. Action completion
records completion but leaves the Finding Pending Validation; explicit verification
then closes the Finding. Assessments remain unchanged until their own recorded decisions.

An ISO-only management-review-input gap and SOC-only period-monitoring narrative gap
remain distinct. A verified inheritance bug allowed explicit framework Findings to
spread through a shared Review. Explicit Finding mappings now take precedence in
workspace attention, related records and reverse Action navigation. A genuinely shared
Finding can still map to all relevant requirements; a generic unmapped Review Finding
still inherits its Review context. No second remediation engine was created.

## G. Risks / Vendors / Policies

The significant access Risk is shared through explicit assessment relationships.
Its central Review updates the Risk's next-review date. Accepted Risk remains accepted,
not closed; remediated Risk follows its own close decision. Vendor completion updates
the Vendor, not merely its framework display. Stale assurance produces one Vendor
Finding/Action, with Evidence retained in the Library. The Policy Review updates the
Policy's next-review date without silently approving its content.

Dashboard metrics, portfolio Past Due/Due ≤30/Unassigned and named drill-down totals
are reconciled against contributing records. No fake counters or duplicate calendar
events: one central access Review produces one calendar entry, not three.

## H. Historical Lifecycle

2027–2031: **285 immutable completed occurrences**, with Evidence for every execution.
2029 introduces lateness, stale assurance/Evidence, a high shared Finding, overdue
Action, Pending Validation, unassigned work and framework-specific deficiencies.
2030 changes the owner, Control design, supplier scope, asset population and access
Review from quarterly to monthly. Original quarterly scope/owner/design survive.

Five period observations preserve saved Control design and relationships. The 2029
observation correctly remains a gap despite 4/4 reported artifacts; file counts are
not effectiveness. ISO A.8.30 changes from justified exclusion to inclusion after
supplier-development scope expands, retaining its assessment-history snapshots.
The original onboarding baseline remains unchanged throughout subsequent operations.

## I. Framework Removal / Re-addition

SOC removal deactivates only its current applicability/driver. Existing shared Reviews,
Policies, Evidence, Control and historical assessments remain. Re-addition preserves
the same Review IDs, 33 SOC assessment IDs, one Control, prior judgments and histories.
It does not claim that the old judgment automatically validates a new period.

## J. Owner Change / Disabled User

The departing owner is disabled and removed from assignment candidates. New assignment
to that account is rejected; current work is surfaced for reassignment. Explicitly
reassigning active Reviews/Risk/Actions/Findings clears the active ownership report.
Completed records and the retired original system keep their historical attribution.

This exposed a real shared defect: retired assets counted as active assignments. The
normal API and Demo report now exclude retired assets without changing asset ownership
or status. Both active-versus-retired behavior and historical owner preservation have
regression coverage. No permission or identity model was changed.

## K. CISO / Operator / Client / Auditor UX

Actual browser checks used localhost Demo and a separate normal-auth loopback API
with synthetic fixture data and an in-memory Mongo substitute:

- CISO/owner: framework status remains distinct from operational health; shared Control,
  provenance, old Evidence and original Review occurrences navigable.
- Assigned service-provider operator: one authorized client; central Findings/Actions,
  Pending Validation, ownership assignment and framework-specific source visible.
- Contributor: assigned Action → Start Work → synthetic Evidence upload → comment.
  Table showed In Progress; attachment and comment persisted. No framework administration
  was granted. Escape returned focus to the originating Action.
- Auditor simulation using existing client-read-only role: Control and Finding fields
  disabled; 2029 gap, quarterly owner/design, shared Evidence, completed Action and
  separate 2030 validation visible. Nested Escape returned focus to the Control link.
  This does not establish an external-auditor entitlement model that does not yet exist.

Changed Control UI checked at 1440, 1024 and 768 px; settled layouts had no horizontal
overflow. Shared-driver Review and normal historical Review inspected. Sampled final
normal/Demo browser warning/error logs were empty. No screen-reader conformance claim.
Future simulated dates are intentionally future relative to the browser's real clock;
bad-year dashboard/overdue assertions use the controlled-clock test, not forged UI time.

## L. Defects Found and Corrected

| Root cause | Smallest coherent correction | Verification |
| --- | --- | --- |
| 30 schedule proposals for 22 activities | Group by existing baseline key, one client choice | Browser onboarding + JS/API tests |
| First framework owns all visible Review provenance | Add plural drivers; preserve primary scalar and occurrence snapshot | Removal/re-add + history tests; Review UI |
| Conflicting driver configuration silently first-wins | Detect differing enabled/cadence/date values before finalize | 422 + no assessment creation test |
| SOC-only Control mapping restriction | Extend existing validation and minimal selector to CIS/ISO/SOC | Three-framework mapping, tenant and read-only DENY tests |
| Explicit single-framework Finding leaks through shared Review | Explicit mapping overrides inherited scope in forward/reverse projections | ISO/SOC gap, Action and attention tests |
| Retired assets look like active departed-owner work | Exclude retired assets in both active-assignment reports | Normal API, Demo and five-year test |
| Shared Control drafts missing from parent reload guard | Include existing Control draft state | Existing failed-save/draft component regression |

No broad UI redesign, dependency addition, catalog rewrite or destructive migration.

## M. Regression Results

- Backend full reviewed offline runner: **409 tests + 567 subtests passed** after the
  retired-asset correction. Additional final multi-framework/identity retest: **19 pass**,
  including foreign mapping rejection and assigned read-only candidate access.
- Frontend regression: **113 suites / 616 tests passed**, including the three separate
  five-year scenarios (CIS 201, ISO 65, SOC 55 completed occurrences). The extended final
  coexistence assessor/history test also passed separately.
- Brawndo ten-year suite: **7 tests passed** in the final repeat (443 seconds),
  including history, recurrence, owner departure, reopened Findings and isolation.
  Combined frontend result: **114 suites / 623 tests passed**, executed in the
  main regression run and the separate long-running ten-year run, plus focused retests.
- Normal optimized build: pass, `main.33acd596.js`. Demo optimized build: pass,
  `main.8ecadc1e.js`; neither build was published.
- Existing warnings only: PlatformAdmin.jsx:53 hook dependency, Node fs.F_OK and
  FastAPI on_event deprecations. No configured separate TypeScript/lint script; build
  uses the repository's existing ESLint integration. No new warning suppressed.
- Canonical records compared unchanged during the combined lifecycle. Final browser
  regression: Brawndo 49/56 assessed, original wide safeguard; Dunder 30 ISMS clauses
  plus 93 Annex A rows/SoA view; Prestige scoped Security/Availability/Confidentiality,
  36/38 assessed. No canonical records edited or reset during those checks.
- Some older coexistence tests assumed byte-for-byte equality including provenance.
  Updated assertions still compare every operational field/history, and additionally
  require preservation of all old drivers plus the new framework driver. No gate removed.

## N. Remaining Material Gaps / Evidence Boundaries

Operational coexistence is verified for the documented synthetic scenarios. It is
not a certification, licensed-text completeness finding or production-readiness claim.

- Persistent Mongo/object-storage durability, restart recovery, distributed concurrent
  reconciliation, backup/restore and production-like OAuth/email/session boundaries are
  **not dynamically validated** by this mock-persistence loopback harness.
- Exact licensed ISO/AICPA content comparison remains as documented in the
  [public-source baseline and manual verification list](framework-public-source-baseline.md).
  No new unsupported mapping, numerical requirement or compliance conclusion was added.
- Existing legacy Reviews receive current plural provenance on normal configuration
  reconciliation; unknown historical drivers are not retroactively invented. Conflicting
  pre-existing duplicate operational records are not automatically merged/deleted.
- Existing record caps and unbounded embedded history remain a larger-volume concern.
  Tested five-year combined Demo store: approximately 3.93 million characters, with
  bounded payload behavior exercised. This is not a production-scale benchmark.
- The fourth reference is workflow-generated and reproducible locally, not a new
  built-in reset seed. Hosted Demo remains unchanged under the explicit no-publication
  boundary. Real browser 200% zoom and physical mobile Safari were not tested here.

## O. Future Improvements (not implemented)

Production-like staging with durable stores; bounded history pagination at larger
volumes; a reviewed reference-scenario replay/import UX if this fourth client should
become a persistent sales demonstration; explicit external-auditor entitlements.
No additional framework rollout is part of this work.

## Reproduce and source-control boundary

From `frontend`, using the installed lockfile dependencies:

```text
CI=true node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand
node node_modules/@craco/craco/dist/bin/craco.js build
node scripts/preview.cjs build
```

On PowerShell set `$env:CI='true'` separately. To export the fourth fixture set
`$env:FRAMEWORK_LIFECYCLE_EXPORT_DIR='../.qa-lifecycle'` and run only
`src/preview/multiFrameworkLifecycle.test.js`. Normal browser harness:
`../workflow-venv/Scripts/python.exe backend/tests/serve_lifecycle_qa.py --fixtures .qa-lifecycle`.
It binds loopback only, prints ephemeral synthetic credentials and must not be deployed.
Backend regression: `../workflow-venv/Scripts/python.exe backend/tests/run_isolated.py`.
Never substitute unrestricted legacy test discovery against an unknown environment.

Branch: `codex/framework-operational-completeness`; existing
[PR #6](https://github.com/robbashea-lab/GRC/pull/6) stays **unmerged** for Robb.
Final SHA, local/remote equality and mergeability are recorded in the handoff/PR after
the final push. Main, Railway settings/deployment, ChatGPT Sites and hosted preview
are not changed. Dependencies and framework datasets are unchanged.
