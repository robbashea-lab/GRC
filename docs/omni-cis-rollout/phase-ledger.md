# CIS OmniBot rollout phase ledger

## Baseline and authority

Approved reference: PR #62, branch codex/omnibot-refined-workspace, revision 83d88e3cbc31d618060c4e094335963f5bacf096, draft/unmerged. Current main 911706cebc7a70c0443f500fcd4bc19260c1db60. Rollout branch codex/omnibot-cis-rollout starts in the approved ancestry and depends on unmerged PR #62 / PR #61. Original worktree and outputs remain untouched.

The human authorizes all existing/future configured CIS IG1/IG2/IG3 programs and their applicable canonical safeguards. ISO/SOC/HIPAA/other frameworks, visual redesign, main merge, production/Sites/provider changes, credential changes and destructive migrations remain excluded. Lead is the sole staging deployer. Source content and implementation/evidence verification are separate.

## Ownership

| Role | Actual owner | Branch / exclusive scope |
|---|---|---|
| Lead/release | root | codex/omnibot-cis-rollout; ledger, contract, canonical integration, coverage evidence, sole staging deployment |
| Shared workflow | cis_shared_workflow | codex/omnibot-cis-runtime; shared runtime, native adapter, persistence version compatibility, tests |
| IG1 content | cis_ig1_content | codex/omnibot-cis-ig1-content; new IG1 review/correction/expected-case artifacts only |
| IG2 / IG3 additions | cis_ig2_ig3_content | codex/omnibot-cis-additions-content; separate 74/23 review/correction/expected-case artifacts only |
| Independent final QA | pending fresh agent after integration | No implementation ownership; all 153 sources plus integrated lifecycle/scope/evidence review |

Four concurrent slots require combining IG2/IG3 content responsibilities; review artifacts remain separate. Agents have separate worktrees. Content agents send shared-engine requests; only lead integrates catalog changes. No agent deploys independently.

## Phases and gates

| Phase | State | Required evidence |
|---|---|---|
| 0 inventory/reference | In progress | Fresh PR/main/staging ownership, immutable reference, 153 current-guide inventory, official source comparison, contract |
| 1 shared approved workflow | In progress in isolated worktree | Configured CIS gates, exact-text native saves, approved visual/lifecycle preservation, legacy compatibility |
| 2 IG1 | Content review in progress | 56 source/question/decision rows and tests; corrections integrated; independent review |
| 3 IG2 additions | Content review in progress | 74 unique additions; cumulative130; unchanged inherited criteria |
| 4 IG3 additions | Content review in progress | 23 unique additions; cumulative153 |
| 5 independent QA | Pending integration | 153 unique content checks,339 rendered placements, separate rule/write coverage, all required negative/visual/onboarding checks |
| 6 staging release | Not started | Full tests/builds/exact CI, independent review, fresh staging ownership; then hosted acceptance |

No phase is accepted solely because a generator counts definitions. Material source/status/isolation/persistence/excluded-surface defects block release. No new deployment has occurred.

## Test-data and access boundaries

Persistent showcase clients: resolve Brawndo and Initech authoritative identities; create a unique fictional IG3 client through normal client/program UI. Existing native user assessments must not be overwritten. Temporary fixtures must have supported reversible cleanup; no shared database reset/deletion/history purge. Actual logout/login requires credentials entered directly in the browser; credential availability clarification pending. Hosted identity/failure/concurrency evidence is separate from isolated automated fixtures.
