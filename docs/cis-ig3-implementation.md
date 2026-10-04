# CIS IG3 implementation checklist — draft, release blocked

Original baseline: `95b574b0efef1bf1cf22297d6a54ea7266e818c2`. Current main after PR #31: `9f702444d3203f98d528cd4dfeabf8585139da6b` (October 4, 2026). Branch: `codex/cis-ig3-extension`. No merge, preview publication, deployment or production-data changes are authorized.

## Content authorization and release boundary

The repository's `cis-ig2-implementation.md` and `cis-ig2-source-validation.json` record a prior commercial-product confirmation and an explicit v8.1 IG2 confirmation. No agreement is retained. These records establish what was confirmed, not the outer scope of an unseen license. Implementation approval is not third-party permission. The unresolved question is whether existing permission covers the protected materials and uses planned for the full v8.1 product catalog. A permission covering all of v8.1 can satisfy this without a separate document named “IG3.”

Source terms refreshed October 4, 2026:

- [CAS v8.1 Terms of Use](https://cas.docs.cisecurity.org/en/latest/source/terms-of-use/) identify CC BY-NC-ND 4.0, noncommercial redistribution with attribution/license link, restrictions on distributing modified material and prior CIS approval for commercial use.
- [CC BY-NC-ND 4.0 legal code](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en), §1(a), defines adapted material by modifications that require copyright permission. §2(a)(1) permits noncommercial reproduction/sharing of the licensed material and noncommercial creation/reproduction, but not sharing, of adaptations. §2(a)(2) preserves exceptions/limitations; §2(a)(4) distinguishes technical-format modifications from adaptations. The license does not make every independently written implementation or explanation an adaptation.
- [CIS commercial-use options](https://www.cisecurity.org/cis-controls-supporters) describe membership/product-vendor routes and a possible Supporter license. Membership alone is not proof that a particular agreement permits software embedding, redistribution or adaptations; inspect the applicable permission scope.

An existing CIS agreement, license, written approval, or a specific user confirmation grounded in that existing permission can resolve the recorded blocker if it covers the relevant licensed entity, CIS Controls v8.1 full catalog (including the 23 IG3 additions), CAS material if reused, commercial embedding/customer access or distribution in Omnisciente, and creation/distribution of adaptations where the chosen content actually requires those rights. Record its reference/date, covered materials/uses, relevant conditions and any expiry; confidential commercial terms need not be posted to GitHub. A generic instruction to implement, a download entitlement, attribution alone, or confirmation limited to IG2 does not establish those uses. The authorization could also support an unchanged-text approach while restricting adaptations; match the implementation to the actual grant.

The blocker applies to protected CIS text and materially adapted protected content, not automatically to factual identifiers/counts, framework selectors, cumulative filtering, exports, storage/lifecycle mechanics, neutral fixtures or independently authored workflow code. Such functionality continues under the user's engineering authorization. Independently authored practitioner guidance should be assessed on its actual content and provenance; source-informed ideas are not automatically protected expression, and paraphrasing protected material is not automatically independent authorship. These are implementation boundaries inferred from the cited terms, not independent legal clearance. No new third-party permission is assumed.

The production catalog's `available_implementation_groups` remains `[1,2]`. The backend validates this gate before scope or later-enablement writes; onboarding and Demo use the same release declaration. The Client Profile selector does not offer IG3. **Do not add 3 to the declaration until authorization is documented and all content and release checks below are complete.** This declaration is a release capability, never a user-permission grant.

Production content coverage: **0 of 23 IG3 additions incorporated**. The neutral synthetic fixtures live only in test modules, use factual IDs, and are not approved guidance or a deliverable client catalog. No permanent demo company was added.

## Completed engineering

- [x] Isolated worktree; inspect current instructions, source, authorization records and open PRs.
- [x] Preserve the `cis-ig1` namespace and existing deterministic assessment/Review identities.
- [x] Generalize scope reduction confirmation to any lower group, preserving current intent receipts, mutation leases and staged publication.
- [x] Generalize labels/CSV exports and reduction impact wording; render only released groups in onboarding/Client Profile.
- [x] Prepare the existing workspace additions filter for separate IG2/IG3 additions, preserving full-program totals and retained-record filtering.
- [x] Synthetic 153-row fixtures test new IG3, IG1→3 (+97), IG2→3 (+23), IG3→2, IG3→1, re-enablement and adding CIS to an existing HIPAA client.
- [x] Verify inherited answers, ownership, relationship fields, history, IDs, Review title/description/schedule reuse, retained records and open work.
- [x] Verify retries, prepublication interruption, postpublication reduction interruption, stale/concurrent writes, invalid groups, unauthorized and cross-tenant denial.
- [x] Keep unavailable IG3 rejected across onboarding, scope and later program enablement without client writes.

## Source and Review decisions still to implement

The planning report and companion `CIS_IG3_Coverage_Matrix.xlsx` cover all 153 cumulative safeguards. Independent CAS v8.1 membership verification identified 23 additions: 1.5, 2.7, 3.13, 3.14, 4.12, 6.8, 8.12, 9.7, 12.8, 13.7–13.11, 15.5–15.7, 16.12–16.14, 17.9, 18.4–18.5. Source: [CIS IG3](https://www.cisecurity.org/controls/implementation-groups/ig3), and the 18 [CAS control pages](https://cas.docs.cisecurity.org/en/latest/source/Controls1/) (replace Controls1 with the relevant control number). Existing 56 IG1 + 74 IG2 additions remain unchanged.

- [ ] Document applicable existing permission for the protected content/uses actually chosen; validate proposed wording against source scope, conditions and triggers.
- [ ] Incorporate all 23 definitions, stable criteria, review/evidence/outcome guidance, five-part guides and Review prompts with traceable sources.
- [ ] Map discovery reconciliation, alert tuning, provider assessments/exits, application lifecycle, incident thresholds and post-test validation into suitable existing Reviews.
- [ ] Offer focused cadence templates through the existing Review flow where separately scheduling operational work is necessary. Do not auto-create duplicate work or increase an entire governance group's cadence for one technical activity.
- [ ] Preserve technical execution versus governance verification: source minimums, events and maintained capabilities are not interchangeable. 2.7's biannual activity means six months; 15.7's CAS 12-month assessment window is not a universal recurring schedule. A quarterly governance Review does not satisfy a monthly technical execution obligation.
- [ ] For new IG3 initialization use “Penetration Testing Program Review” where appropriate; preserve existing IDs and customized titles and distinguish internal, external and application coverage.
- [ ] Recheck complete authorized content and exact membership before releasing group 3.
- [ ] Browser-verify all 23 authorized entries, saving/reopening/Save & next/drafts, guides, Reviews, evidence/remediation traversal, filters/exports, responsive light/dark and keyboard behavior.
- [ ] Verify real authenticated browser integration separately; synthetic API/Demo checks do not establish this.

## Related work

The IG2 corrections are incorporated from [PR #31](https://github.com/robbashea-lab/GRC/pull/31), source commit `dfbaa93ee38d5e89e80a12b1de0e1ee336d63270`: logging fields, browser extensions, cloud/hardening scope, per-safeguard Review prompts and the stale arrangement warning. Stable criteria identities and scope membership are preserved.

PR #31 merged at `9f702444d3203f98d528cd4dfeabf8585139da6b`, including PR #29 and its subsequent verification fixes. The IG3 extension was rebased onto that current main. PR #30 now targets main; the temporary foundation is no longer its dependency. Its diff contains only IG3 preparation, cumulative labels/tests/checklist and the attributable onboarding notification fix below. It excludes unified-ticket implementation and IG2 source corrections already in main. The dependency follow-up is paused after this completed integration. No merge or publication was performed by this task.

Cumulative group labels now derive from the selected or persisted configuration across intake, onboarding confirmation, Client Profile, program configuration and handoff. Historical onboarding labels derive from their recorded configuration.

## Verification evidence

Baseline: eight existing backend IG2 tests passed before edits. Final check results and browser scope are recorded below before PR delivery. Intentional injected-failure diagnostics and existing runtime warnings are not suppressed. No dependency/lockfile changes, migrations, machine trust changes or shared data writes.

- Backend mock-storage route checks: `python -m unittest discover -s backend/tests -p 'test_cis_ig*.py' -q` — 14 passed (eight inherited IG2, six synthetic IG3). These are normal FastAPI routes with controlled authentication, separate from Demo.
- Combined persistent checks: from backend, `python scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27943 --include-cis-ig2 --include-cis-ig3-scope --include-remediation-tickets` — 78 passed. MongoDB 8.0.28, task-owned loopback server, unique disposable databases; generated databases cleaned by the runner. No shared/production database used.
- Combined frontend: `craco test --watchAll=false --runInBand --testPathPattern='CisProgramSettings|cisIG3Scope|cisIG2|cisOperations|BrawndoCisAssessment|cisRequirementGuide|remediationTicket'` — eight suites / 219 tests passed. Includes four synthetic Demo tests and three selector/reduction component tests. No warning suppression; the dynamic-option instrumentation nesting warning was fixed by preserving native text nodes.
- Normal `craco build` and Demo `node scripts/preview.cjs build` passed on the combined branch. Existing Node `fs.F_OK` deprecation and bundle-size advice remain; no package changes.
- Local browser, temporary browser-only tenant: IG2 onboarding created 130 assessments and 15 unscheduled/unowned Reviews; onboarding and Client Profile selectors omitted IG3. The IG2 additions filter showed 74 rows while full metrics stayed 130. Light/dark rendering, representative guide/assessment traversal, saving with Save & next and reopening preserved the synthetic answer. After integration/rebuild, reduction confirmation showed 130→56 and 74 retained safeguards, and applying it produced 56 active assessments. Existing static intake/profile framework labels still say IG1 in some places while current navigation/workspace correctly says IG2; these have now been corrected.
- Full IG3 content-browser acceptance (all 23 guides, actual Review cadence/templates, responsive/keyboard matrix and evidence/remediation traversal), real authenticated browser E2E and independent review are **not completed**. Synthetic data verifies scope mechanics, not source-qualified product content or technical effectiveness.
- Final diff checked against the combined temporary foundation: no new module, setup stage, event engine, compliance score, dependency, seeded company or separate remediation workflow. Production groups remain `[1,2]`; the draft must stay release-blocked.

Follow-up reconciliation checks: 17 focused frontend suites / 287 tests passed, including onboarding/handoff/profile labels and the incorporated IG2 corrections; all 14 backend scope tests passed again. Normal and Demo builds passed again. Browser intake confirmed the IG2 label and that IG3 remains absent. The latest temporary Demo onboarding run did not advance when Next was clicked; this is unresolved, so no completed onboarding browser result is claimed for this follow-up. The prior browser results above belong to the earlier tested build. No actual IG3 content or full IG3 browser verification is complete.


Latest PR #29 reconciliation (dc1e3f3): 22 frontend suites / 301 tests passed; 14 backend CIS scope tests and 15 backend ticket-integrity tests passed; normal and Demo builds passed. These supersede the earlier focused follow-up counts. Persistent Mongo was not rerun after these final upstream corrections; its 78-test result above is from the earlier combined build.

Post-merge main reconciliation verification: 22 frontend suites / 301 tests, 14 backend CIS scope tests and 16 backend ticket-integrity tests passed. Normal and Demo builds passed. Final diff against d47d1b7 contains only the IG3 extension, its cumulative labels, tests and checklist; catalog availability remains [1,2]. No new browser or persistent Mongo verification was performed in this reconciliation; the previously reported browser Next issue remains unresolved.

## Onboarding Next investigation and final combined runtime verification

Reproduced on a fresh temporary local Demo tenant at 1280×720: create a client, open Client Profile, select CIS Applies and group 2, then pointer-click Next while the “client saved” action notification is present. The notification occupied the bottom-right control area. A read-only DOM hit test at the Next button centre (x=1201, y=627) returned the Sonner notification, not the button. No application error or validation was reported. Keyboard Enter on Next reached Policies. Sonner 2.0.3 pauses dismissal while expanded/interacting, so clicking the overlapping notification kept it present. The browser document was visible; hidden-document behaviour is not asserted as the cause.

This was an attributable UI obstruction plus a flaw in the earlier test sequence: it failed to assert the Policies heading before treating the single AI-intake Unsure button as Policy responses. The creation notification alone now uses Sonner's supported per-toast top-right position and close button; its action and ten-second duration remain. No validation or authorization was bypassed. The new component regression verifies IG2 Compliance→Policies, all 17 required responses, visible omission feedback and advancement to Reviews. Browser checks assert each stage before continuing and use no forced clicks or arbitrary sleeps.

Verified code revision `7d8909f0b96b510b527d7c6eb67fb5f9a0ddeae9` on merged main `9f702444d3203f98d528cd4dfeabf8585139da6b` (subsequent commit changes this checklist only):

- 22 focused frontend suites / 302 tests passed, including the new intake/validation regression and shared CIS, onboarding, Review and ticket checks.
- Fresh disposable MongoDB 8.0.28: `python scripts/verify_mongo_recovery.py --mongo-url mongodb://127.0.0.1:27943 --include-cis-ig2 --include-cis-ig3-scope --include-remediation-tickets` — 83 passed. Includes normal FastAPI route authentication/tenant-denial, onboarding recovery, cumulative scope/retention and shared ticket/ISO integrity. Each test's unique generated database was cleaned; no real data or default connection used.
- Normal and Demo builds passed again.
- Browser on this newly built combined revision: pointer Next advanced while the repaired top-right creation notification remained visible and dismissible; omitted Policy answers blocked Next with visible feedback; all 17 answers allowed Reviews and completion. IG2 workspace showed 130 assessments, full totals persisted with the additions filter, Save & next and Previous preserved the synthetic implementation, and scope reduction confirmed 130→56/74 retained and preserved the answered baseline assessment. Client Profile selector offered only groups 1/2, 15 Reviews remained unscheduled/unowned, and no browser runtime errors were captured.
- The earlier unresolved Next finding is resolved by this reproduction and fix; earlier incomplete browser results remain historical evidence only. This bounded local Demo run does not establish real-authenticated browser integration, a full responsive/keyboard matrix, or actual IG3 content-browser acceptance. IG3 remains unavailable with 0/23 production content additions; permission and content/verification gates above remain unchanged.
