# CIS IG3 implementation checklist — draft, release blocked

Baseline: `95b574b0efef1bf1cf22297d6a54ea7266e818c2` (remote main, refreshed October 4, 2026). Branch: `codex/cis-ig3-extension`. No merge, preview publication, deployment or production-data changes are authorized.

## Content authorization and release boundary

The repository's `cis-ig2-implementation.md` and `cis-ig2-source-validation.json` explicitly record authorization for v8.1 IG2. They do not explicitly establish IG3 authorization. Implementation approval is not third-party permission. Confirmation needed: CIS authorization for commercial incorporation of v8.1 IG3 requirements and adapted practitioner guidance in Omnisciente. This was requested directly from the user; it remains unresolved.

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

- [ ] Document explicit authorization; validate proposed wording against source scope, conditions and triggers.
- [ ] Incorporate all 23 definitions, stable criteria, review/evidence/outcome guidance, five-part guides and Review prompts with traceable sources.
- [ ] Map discovery reconciliation, alert tuning, provider assessments/exits, application lifecycle, incident thresholds and post-test validation into suitable existing Reviews.
- [ ] Offer focused cadence templates through the existing Review flow where separately scheduling operational work is necessary. Do not auto-create duplicate work or increase an entire governance group's cadence for one technical activity.
- [ ] Preserve technical execution versus governance verification: source minimums, events and maintained capabilities are not interchangeable. 2.7's biannual activity means six months; 15.7's CAS 12-month assessment window is not a universal recurring schedule. A quarterly governance Review does not satisfy a monthly technical execution obligation.
- [ ] For new IG3 initialization use “Penetration Testing Program Review” where appropriate; preserve existing IDs and customized titles and distinguish internal, external and application coverage.
- [ ] Recheck complete authorized content and exact membership before releasing group 3.
- [ ] Browser-verify all 23 authorized entries, saving/reopening/Save & next/drafts, guides, Reviews, evidence/remediation traversal, filters/exports, responsive light/dark and keyboard behavior.
- [ ] Verify real authenticated browser integration separately; synthetic API/Demo checks do not establish this.

## Related work

Both related chats were contacted with the baseline, branch, scope and preservation constraints. Their trees were not modified. The IG2 coverage review completed read-only on the same baseline and delivered no code changes. Its findings include 16.7 cloud/hardening scope, grouped Review briefs showing only first prompts, 8.5 logging fields, 9.4 extension treatment and a stale arrangement warning. These are recorded dependencies, not silently treated as corrected. The unified-ticket change remains ongoing/unmerged at this checkpoint; no separate CIS remediation implementation was introduced. Before release, reconcile its delivered PR and rerun affected shared workflow tests.

## Verification evidence

Baseline: eight existing backend IG2 tests passed before edits. Final check results and browser scope are recorded below before PR delivery. Intentional injected-failure diagnostics and existing runtime warnings are not suppressed. No dependency/lockfile changes, migrations, machine trust changes or shared data writes.
