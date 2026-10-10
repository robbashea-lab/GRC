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
| SOC-U05 / Medium | All: manual wording review warning disappeared after a second remount. | Complete, manually edit, change a substantive answer, progress save, reopen twice. | SOC interview metadata/controller/Demo/native validation. | Add SOC-only reviewed answer/version basis; incomplete/older metadata requires review. Independent frozen native/remount probes passed. |
| SOC-U06 / Medium | All: own native-save attribution could bypass changed scope. | Save own proposal then change configured scope before another update. | SOC controller. | Fresh base/context comparison before own-source rebase; scope rejection regression passed. |
| SOC-B01 / Medium | All: native write could race with a newer interview and save an older readiness proposal. | Independent ASGI interleaves before and after fresh read. Mongo single-document atomicity does not serialize separate records. | SOC-only interview/native persistence boundary. | SOC-only expiring database-backed lease, ownership checks and bounded operation timeout. Independent ASGI race probes and regression tests passed. Real Mongo multiworker/process-stall/clock-skew/cancellation behavior remains unverified; this is not a cross-document transaction claim. |
| SOC-U07 / Low | All: history click event was interpreted as pagination request. | Click first Interview history with no previous page. | SOC controller. | Explicit zero-argument handler; pagination regression passed. |
| SOC-T01 / Low | Test harness: closed confirmation dialogs rendered actionable Close buttons; shared native Close assertion hit a hidden mock button. | Focused native suite; runtime dialogs correctly honor open state. | Existing SOC component test mock only. | Mock honors open; native close assertion unchanged and passes. |
| SOC-U08 / Low | Null optional Org context crashed isolated connected component tests. | Full regression run outside an Org provider. | SOC controller context label only. | Use existing guarded context pattern; focused workspace/native tests pass. |
| SOC-U09 / Medium | All: same-client directory/name refresh silently discarded unsaved answers and manual summary. | Independent frozen-candidate probe; two new regressions failed with interview reads 1→2. | SOC controller hydration and two regression cases. | Separate display-name context from hydration identity using a current-name ref; no effect suppression. Independent rereview: reads 1→1, answers/wording/dirty state retained, current name in replacement confirmation, explicit reload still requires approval. All 75 component tests passed. |

## Remaining gates, not confirmed defects

### Current update: real-driver cancellation defect and bounded correction

- **SOC-B02 / Medium, all SOC native saves:** real Motor future cancellation
  left its PyMongo executor pending. At `b384b28`, a native 503 immediately
  unlocked; a newer interview revision 2 saved, then the original revision 1
  readiness/history CAS committed. Independently reproduced on real MongoDB
  8.0.28 with the pinned drivers and Python 3.12.14. No client record deleted.
- Correction is SOC-only driver CSOT 80s, existing request 90s/lease 120s;
  uncertain cancellation/timeout/network/write-acknowledgement keeps the lease.
  Normal/validation cleanup remains owner-matched and outside CSOT. No CIS,
  global client setting, schema migration or dependency change.
- Implementer and independent real-driver probes passed timeout and early
  cancellation, competing 409, actual expiry, later 200 and no late native
  mutation. Independent regression: 77 tests / 2,214 subtests passed; patch
  lease-file SHA256 `9577ae472c02fe47d7623bd60ac40b9167ee63e05a24527cb93f1df31bbf9c74`.
  [Execution details](mongo-lease-validation.md). This closes the reproduced
  delayed-send defect, not transactions or already-dispatched uncertainty.
- Agent 1 reported validation deployment `dep-db5blmflk1mc739e7frg` at exact
  `b384b28` and two positive A1.1/CC1.1 hosted save/refresh/resume paths. That
  deployment predates B02's correction; exhaustive hosted writes are held for
  a corrected exact candidate. Agent 2 still owns no staging/session slot.
- No hosted Prestige tenant exists in the coordinator's current directory.
  Local 38-criterion Prestige evidence is Demo-only; do not create/rename a
  hosted reference tenant to manufacture that check.
- Real restricted-account SOC access, exhaustive hosted lifecycle and
  after-last-check clock skew/server-dispatch ambiguity remain open. Read the
  entries below as the earlier checkpoint, not a claim that B02 was merely an
  unverified hypothetical or that staging is still on the pre-SOC source.

- Shared staging slot has not been transferred by Agent 1. No SOC deployment or authenticated fixture mutation occurred.
- Real read-only/wrong-client sessions for SOC route/writer/file checks are not available to Agent 2; mocked tests do not close this gate.
- Hosted logout/login resume, actual durable Mongo persistence, provider-source/fresh-asset verification and risk-bearing hosted lifecycle cases remain unexecuted.
- Agent 1's documented CIS restricted-access gates remain owned by Agent 1; this change neither waives nor closes them.

The feature remains draft and is not a production-readiness, audit, or compliance conclusion.
