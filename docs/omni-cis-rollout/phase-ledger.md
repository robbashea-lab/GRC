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
| Independent final QA | cis_independent_qa | codex/omnibot-cis-independent-qa; no implementation ownership, all 153 sources and integrated scope/evidence review |
| Browser coverage | cis_browser_coverage, then lead | Separate browser agent cannot access browser2; exact tool failure recorded, lead executes actual UI coverage |

Four concurrent slots require combining IG2/IG3 content responsibilities; review artifacts remain separate. Agents have separate worktrees. Content agents send shared-engine requests; only lead integrates catalog changes. No agent deploys independently.

## Phases and gates

| Phase | State | Required evidence |
|---|---|---|
| 0 inventory/reference | Established | Approved ancestry, PR57 slot6088298394,153-row baseline inventory; Navigator exact normalized match; CAS23 text variants separately adjudicated |
| 1 shared approved workflow | Integrated; local regressions passed | Configured CIS UI/server/native gates; additive versions, exact-text/native CAS, explicit safe upgrade/rebase; independent review accepted |
| 2 IG1 | Source/code gate accepted |56 reviewed,179 atomic mappings,1052 authored source cases, independent review; mandatory conditions preserved |
| 3 IG2 additions | Source/code gate accepted |74 unique additions,246 effective clauses,2525 cases; cumulative130, inherited criteria reused |
| 4 IG3 additions | Source/code gate accepted |23 unique additions,55 clauses,690 cases; cumulative153 |
| 5 independent QA | In progress |153 source/code reviews accepted;4267 source cases passed plus integrity; actual339-browser sweep underway; hosted checks pending |
| 6 staging release | Not started | Backend718+1172subtests and both builds passed; four obsolete frontend expectations corrected with17 focused tests; full run/final exact CI and hosted gates remain open |

No phase is accepted solely because a generator counts definitions. Material source/status/isolation/persistence/excluded-surface defects block release. No new deployment has occurred.

## Test-data and access boundaries

Authoritative staging registry contains9 clients; Brawndo exists, Initech and Hooli are absent. New showcase creation has not occurred. Existing native user assessments must not be overwritten. Temporary fixtures use supported reversible Archive; no shared database reset/deletion/history purge. Actual logout/login requires credentials entered directly in the browser; credential availability clarification pending. Hosted identity/failure/concurrency evidence is separate from isolated automated fixtures. Local browser4357 uses an isolated normal Demo origin; native records are not saved by the rendered sweep.
