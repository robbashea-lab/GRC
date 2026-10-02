# CIS IG1 static Requirement guide

## Approved layout rollout — 2026-10-02

Retrieved and inspected preview-source commit
`e82102352255f3f8cfc339af2d3ed9a2bd6fe46c`, based on GitHub main
`ee86353ac99d85a4b11cd1b2e674d345371e33f4`. Its approved presentation now
applies through the existing CIS framework configuration, without preview,
client-ID or safeguard-ID gates. No dashboard, catalog, backend, schema,
dependency, assessment-data or other-framework changes.

- Guide starts collapsed near the top; expanded questions sit beside the answer.
  Its native disclosure and question selection reset on client/safeguard change.
- Requirement spans the workspace; three desktop guidance columns stack below
  1000px. Status and implementation sit beside each other and stack below 720px.
- Findings immediately follow implementation in DOM/keyboard order. Ownership,
  verification, legacy notes, history and guarded save/navigation remain intact.
- All existing requirement wording and all 280 guide answers are unchanged.

Validation: 182 tests across eight focused suites passed; changed-component lint
passed without warnings. Optimized Demo build passed (existing bundle-size and
Node fs.F_OK advisories). Loopback browser QA saved/reloaded all 56 safeguards,
checked all 280 answers without writes, and exercised Finding/Action/Evidence,
draft guards, Save & next, Previous, focus trap/return and Escape. Long asset
inventory and shorter incident-reporting screens passed at 1440/1280/1024/768
in both themes; screenshots inspected. Both real UI onboarding cases passed:
new CIS-only client and disposable ISO client later adding CIS, with fresh CIS
state and preserved ISO/other-client records. Actual SOC/ISO workspaces remained
unchanged. No browser runtime errors. These are isolated static Demo checks,
not new persistent-backend or independent security validation.

The initial overflow probe incorrectly included one-pixel screen-reader labels;
it now tests visible layout and still checks dialog bounds/overflow. No product
workaround or data reset was needed. Publication identifiers belong to the
PR/release handoff. The original implementation report below is historical.

Base: GitHub main `009bb1ab13a215df0f6f42d1d132b60fe22ea873` (includes PR #17's SOC 2 guidance).

## Implementation

- `CisRequirementGuide` selects one of five prewritten answers. It receives only a
  safeguard ID; no client record, API, persistence callback, model or service.
- `cisRequirementGuide.json` is one shared source, framework `cis-ig1`, version
  `8.1`, revision `2026-10-02`: 56 safeguards × five tailored answers. Sources use
  the existing per-safeguard links in `cisAssessmentCriteria.json`.
- The existing shared CIS workspace presents requirement/guidance on the left and
  the guide on the right above 1100px. Below that it stacks. Status and implementation
  remain full-width, outside this split. No changes to SOC 2 or ISO workspaces.
- Three restrained, theme-aware sections separate review, evidence and outcome
  guidance. Existing reviewed bullets, requirement titles/text/source rendering,
  verification, evidence, Findings/Actions, history and save behavior are retained.
- Native buttons expose selected state and control one politely announced answer.
  Selection resets to plain language on safeguard or client change via a keyed
  component. Guide interaction is not a completion checklist or an assessment edit.
- Existing shared framework activation supplies the experience automatically;
  no tenant guidance copies, sample resets, schema, dependency or backend changes.

## Content review

The [previous reviewed baseline](cis-practical-guidance-2026-10-02.md) remains
unchanged. Rechecked against the official [CIS v8.1 Navigator](https://www.cisecurity.org/controls/cis-controls-navigator)
and its [Assessment Specification](https://cas.docs.cisecurity.org/en/latest/)
safeguard descriptions on 2026-10-02. CAS scoring and higher-group measures are not
imported as IG1 requirements. The Control 2 CAS page was rate-limited in one request;
its descriptions were available in the official Navigator and reviewed baseline.

Answers explain purpose, practical starting points, evidence alternatives,
responsible-team questions and warning signs to investigate. Business owners are
addressed for data management, workforce training, provider inventory and incident
responsibilities. No client-specific conclusions, mandatory products or upload tasks.

Material boundaries include weekly unauthorized-device handling, six-month
inventories, quarterly account authorization, 45-day dormancy where supported,
immediate access revocation, monthly automated patch deployment, weekly-or-more
frequent backups, hire/annual training, and annual/change-driven process maintenance.
Explicit exceptions and support conditions remain qualified. Provider involvement,
open tickets and generic risk acceptance are not treated as implementation.

The catalog currently stores Omnisciente requirement summaries rather than full
verbatim CIS wording. Their explicit summary label and official reference are
preserved; authorized official-text rendering remains unchanged when supplied.
This work does not relabel summaries as official or add unlicensed full text.

## Verification

Focused unit/integration suite: **8 suites, 181 tests passed**. Covers 280 distinct
answers, material source boundaries, no writes/drafts from guide selection, reset
on client/safeguard changes, retained narrative drafts, legacy criteria/history,
failed-save protection, and existing SOC/ISO behavior.

Optimized Demo build: passed; existing CRA bundle-size advisory and Node `fs.F_OK`
deprecation remain. Static guide adds approximately 20 kB gzip; no new dependency.

Browser checks use isolated loopback Demo sessions and block external requests:

- `frontend/scripts/qa/cis-criteria.cjs`: 56 safeguards, all five answers, no record
  mutations from guide use, save/reload/history, Finding → Action → Evidence,
  draft guard, Save & next, Previous, keyboard and theme/responsive checks.
- `frontend/scripts/qa/cis-guidance-onboarding.cjs`: real new CIS-only onboarding
  and a separate disposable ISO client's later CIS activation; 56 fresh assessment
  records each, no copied Brawndo state, same guide, and retained ISO/other-client data.

Browser results: all 56 safeguard save/reload checks and all 280 answer interactions
passed; exact stored Demo state remained unchanged after guide interactions.
Both onboarding/activation cases passed, with no runtime errors. Light/dark
1440/1280/1024/768 checks found no overflow; screenshots inspected at 1440 and 768.
Enter/Space activation, Tab order, visible focus, focus trap/return and Escape passed.
The follow-up smoke pass also opens actual Dunder ISO and Prestige SOC assessments
and verifies that the CIS guide is absent, without enabling CIS for either client.

Publication identifiers are recorded in the PR/release handoff. These are static
Demo and focused application checks, not a new persistent
backend or whole-application security validation. Synthetic QA data is not published.
