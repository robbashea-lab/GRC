# SOC 2 OmniBot defect register

Independent content reviewer: Laplace (no implementation ownership). Independent functional/security reviewer: Bacon (no implementation ownership). Implementing owners corrected only reproduced SOC defects. All observations below are local/source/automated evidence unless explicitly stated otherwise; none is hosted restricted-session evidence.

| ID / severity | Criterion / observed versus expected | Source / reproduction | Affected files or data | Correction / verification / disposition |
| --- | --- | --- | --- | --- |
| SOC-C01 / Medium | All 61: neutral optional gap/unknown prose downgraded an otherwise adequate proposal. Optional notes must not alone decide readiness. | All Yes plus “No outstanding gaps” or uncertain optional names reproduced false deficiencies. Publisher outcome-based inquiry and assignment optional-note boundary. | SOC JS/Python evaluators only; no existing records migrated. | Neutral additional reported context; only active structured answers decide proposal. Independent 1,098 invariance cases passed; content disposition closed. |
| SOC-C02 / Medium | P5.1, P5.2, P6.6, P6.7: capability wording could conceal failure to fulfill a triggered obligation. | AICPA printed pp61,62,65; a procedure is not fulfillment of an actual required request/notification/accounting. | Six prompt/help pairs in versioned SOC catalog and matrix; no official text imported. | Ask actual fulfillment when triggered, established readiness when no event occurred. Independent 46 targeted cases passed; content disposition closed. |
| SOC-U01 / Medium | All: error reload could silently replace unsaved interview edits. | Failed progress save, edit retained, click Reload. | SOC controller. | Explicit discard/cancel confirmation; component regression passed. |
| SOC-U02 / Medium | All: unfinished linked-record drafts did not block native summary application/navigation. | Open a Finding/Review/comment/Control draft then apply summary. | SOC controller and acknowledged drawer hooks. | Native application blocks related drafts; progress can still save. Component regression passed. |
| SOC-U03 / Low | P6.1: inactive conditional questions left an empty group. | Outside-system or unknown context. | SOC group presentation helper. | Skip empty groups without deleting historical inactive answers. Engine regression passed. |
| SOC-U04 / Medium | All: unsupported retained interview version could break rendering. | Restore an unknown future version with saved text. | SOC controller. | Bounded error, retained draft, disabled generation/application; component regression passed. |
| SOC-U05 / Medium | All: manual wording review warning disappeared after a second remount. | Complete, manually edit, change a substantive answer, progress save, reopen twice. | SOC interview metadata/controller/Demo/native validation. | Add SOC-only reviewed answer/version basis; incomplete/older metadata requires review. Remount regression passed; frozen native review pending. |
| SOC-U06 / Medium | All: own native-save attribution could bypass changed scope. | Save own proposal then change configured scope before another update. | SOC controller. | Fresh base/context comparison before own-source rebase; scope rejection regression passed. |
| SOC-B01 / Medium | All: native write could race with a newer interview and save an older readiness proposal. | Independent ASGI interleaves before and after fresh read. Mongo single-document atomicity does not serialize separate records. | SOC-only interview/native persistence boundary. | SOC-only database-backed serialization in progress; final regression and independent disposition required. |
| SOC-U07 / Low | All: history click event was interpreted as pagination request. | Click first Interview history with no previous page. | SOC controller. | Explicit zero-argument handler; pagination regression passed. |
| SOC-T01 / Low | Test harness: closed confirmation dialogs rendered actionable Close buttons; shared native Close assertion hit a hidden mock button. | Focused native suite; runtime dialogs correctly honor open state. | Existing SOC component test mock only. | Mock honors open; native close assertion unchanged and passes. |
| SOC-U08 / Low | Null optional Org context crashed isolated connected component tests. | Full regression run outside an Org provider. | SOC controller context label only. | Use existing guarded context pattern; focused workspace/native tests pass. |

## Remaining gates, not confirmed defects

- Shared staging slot has not been transferred by Agent 1. No SOC deployment or authenticated fixture mutation occurred.
- Real read-only/wrong-client sessions for SOC route/writer/file checks are not available to Agent 2; mocked tests do not close this gate.
- Hosted logout/login resume, actual durable Mongo persistence, provider-source/fresh-asset verification and risk-bearing hosted lifecycle cases remain unexecuted.
- Agent 1's documented CIS restricted-access gates remain owned by Agent 1; this change neither waives nor closes them.

The feature remains draft and is not a production-readiness, audit, or compliance conclusion.
