# Framework assessment experience refinement

Scope: presentation and original operator guidance on the approved light UI. The unapproved visual candidate is excluded in a separate worktree. No catalog, schema, authorization, lifecycle, mapping or recurrence changes are intended.

## Phase 1 — CIS IG1

Reviewed all 56 current safeguard explanations and all 15 included control-group guidance entries. Added safeguard-specific evidence examples to replace repeated group-level examples while retaining the original catalog. These are optional examples, not prescribed artifacts or a substantive validation of CIS requirements.

| Before | After | Reason |
| --- | --- | --- |
| Source and explanation had limited visual separation | Restrained source-reference block with explicit original-guidance attribution | Distinguish reference from explanatory writing |
| Saved status was not visible across drawer tabs | Persistent saved conclusion beside existing previous/next navigation | Keep assessment context without confusing unsaved form changes with saved state |
| CIS evidence examples repeated by control group | 56 distinct safeguard-specific examples | Help practitioners select relevant evidence |
| Missing historical user resolved to Unassigned | Former / unavailable user, with Not recorded for absent attribution | Preserve the distinction between missing actor lookup and unassigned work |

Verification: 24 focused tests in three suites passed; targeted ESLint and diff whitespace checks passed; production build passed with the existing PlatformAdmin hook warning. The first browser run found an ambiguous new accessible label; it was corrected and the rebuilt version passed. Browser coverage: CIS assessment/save/history, evidence download/unlink/relink, Finding/Action remediation and explicit validation, previous/next, draft guard, deep links/refresh/back, search retention and keyboard tabs. The runner also verified unchanged shared Reviews, 18 routes, four viewport widths, wrong-client deep-link exclusion and no console errors in an isolated Demo session.

Build verified: main.fd36a243.js; approved CSS main.9c179479.css. No published preview or persistent backend verification is claimed.
