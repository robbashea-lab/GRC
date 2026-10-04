# CIS IG3 implementation checklist — draft, release blocked

Baseline: `95b574b0efef1bf1cf22297d6a54ea7266e818c2` (remote main, refreshed October 4, 2026). Branch: `codex/cis-ig3-extension`. No merge, preview publication, deployment or production-data changes are authorized.

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

The temporary integration foundation `codex/cis-ig3-foundation`, commit `68cb794343be8c7bec9a6c1ad8460205f83ad7a2`, contains PR #29 head `3a576b1384bf8ff8facf39694967db50feefec66` plus PR #31. The draft IG3 PR targets this foundation so its diff excludes both dependencies. Both PRs remain unmerged at this check; current main is still `95b574b0efef1bf1cf22297d6a54ea7266e818c2`. After #29 merges, rebuild the foundation on current main retaining only any still-unmerged #31 correction, rebase only the IG3 extension, and retarget to main once both dependencies are present. An hourly thread follow-up checks for these transitions and stays quiet while unchanged. It cannot merge or release anything.

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
