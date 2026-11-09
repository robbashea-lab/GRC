# Shared assessment presentation

The November 9, 2026 rollout reuses the implemented Brawndo 1.1 presentation from `64984d6d30dde030ff4a3754a424c981354f9d1e`. Presentation eligibility follows the native enrolled framework, configured scope and matching record identity. It does not grant permission or replace the native controllers.

## Inventory and source content

`assessmentRolloutPresentation.json` maps 554 views: 153 CIS safeguards, 61 SOC 2 criteria, 30 ISO ISMS assessments, 93 Annex assessments, 93 separate SoA views and 124 native audit workpapers. Its 4,948 presentation rows are not a compliance denominator. CIS cumulative scope remains 56/130/153; SOC categories remain opt-in.

The registry is generated from the reviewed package with `node scripts/build-assessment-rollout-presentation.cjs PACKAGE_DIRECTORY NEW_OUTPUT`. The builder verifies the three authoritative input hashes and refuses to replace an existing output. Runtime lookups require exact native identities, matrix row text and applicable questionnaire versions; presentation IDs are not new answer keys.

The 235 ISO normative-content holds retain unchanged native content. Held candidate requirements, triggers and question callouts are absent from the runtime registry. No product banners or license assumptions are added. Audit methodology is product guidance, not additional ISO requirements; its certificate comparison is conditional on an existing relevant certificate.

## Questionnaires and compatibility

New SOC and ISO reviews use `soc2-assessment-rollout-1` and `iso27001-assessment-rollout-1`. They add exactly 220 and 57 optional text fields, respectively. Frontend and backend use the same catalogs and strict native validators. Core question definitions, conditions, choices and evaluators are unchanged. CIS versions are unchanged.

V1/V2 catalogs and saved histories remain intact. The authored Prestige V2 fixture imports its immutable catalog explicitly rather than following a future default. Historical test contexts are labelled separately from unpatched current-version tests. The product owner explicitly retained the native **Begin a new review** flow. Archived interviews remain readable; an active obsolete draft is preserved but its complete answers/wording are not displayed before that explicit restart. Editable continuation and pre-restart active-draft display remain gaps. No migration, automatic restart or answer copying is introduced.

## Native save boundaries

Interview checkpoints save personal interview state. **Apply draft** stages only the native implementation narrative, guards against changed source text and retains manual wording until explicit review. It does not choose status or verification. Native **Save assessment** / **Save & next**, permissions, concurrency, history and failure recovery remain authoritative.

SoA uses its existing fields and the same Annex assessment controller. Audit workpapers keep their existing checklist, progress/result, notes, evidence, Findings, occurrences and saves. Their inline preparation guide has temporary open/pause state only: no personal interview, saved Resume, checkpoints, generated implementation or invented interview history.

## Acceptance boundaries

Native SOC/ISO evaluators can still propose `addressed` when core answers are Yes alongside affirmative additional gap/confirmation signals. Characterization tests preserve that behavior; this rollout contains no scoring correction. The narrative-only Apply boundary does not resolve that semantic hold.

Source mapping, automated tests, builds, exact-head CI, actual browser rendering, authenticated tenant checks and owner acceptance are separate evidence. The task receipts record each independently. No passing automated check clears content or release holds, and this document grants no staging deployment, merge or production authority.
