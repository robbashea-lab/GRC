# PFA-001 follow-up: confirmed receipt during context refresh

Baseline: exact deployed `b128eb2b178ab8507b42aaa8ec010fd004d1a9ea`.
The earlier 13 local first-write cases and independent passes remain valid
for their immediate-response model; they did not cover this hosted sequence:
type a fresh 1.1 draft, minimize, save a native marker, restore, save progress.
The coordinator's IG3 observation still returned the old-token 409 and retained
the draft/native marker. No new hosted pass is asserted by this author.

Independent diagnostic commit `0678727a0a858ce09dc35c79f42c0320e0e14647`
reproduced three failures in four tests on unchanged b128 (1 pass, 3 failures,
16.707s). Ordinary native save updated form/savedForm and the success footer but
not ctx.current. The joined context refresh preserved old ctx until six reads
completed. A delayed read therefore left receipt B beside context A: the first
progress submitted A, and a persisted interview missed its comparison gate.
Rejected refresh set ctx=null and unmounted the guide, losing unsaved input.
The actual hosted request timing was not instrumented; this diagnostic establishes
the connected source mechanism without relabeling simulated delay as hosted proof.

The small CIS-only correction completes the existing immediate receipt publisher
and retains a single identity-matched validated guide configuration. Failed ctx
remains genuinely null: its original error/Retry and disabled native/guide writes
remain. Cached configuration keeps only the original guide mounted to preserve
local input; contextComplete requires live ctx. Confirmed savedForm replaces old
incoming-record fallback only when client, assessment and CIS key match. A changed
identity clears cached eligibility. Other frameworks' current resolution and
callback contracts are unchanged. No new UI/copy/style/evaluator/catalog/API.

Independent follow-up `5c15bfdefcb6e2b518ae5179c2fff88f1b41434e` adds unavailable-
context disable/retry, identity switches and preserved manual-review comparison;
all original diagnostic assertions are retained. The author imported both tests
unchanged. Final local execution: **7 suites / 963 tests passed, 68.916s**, including
these seven cases, the prior 13, 615 CIS workflow cases, native workspace/adapters,
and existing ISO/SOC guide suites. API/storage/actors remain modeled, not hosted
role, Mongo, actual fault injection or production assurance.

The first corrected 4-suite run had 217 passes and two fixture failures. Existing
positive adapter fixtures for native 1.2/2.1 returned only unrelated native1.1 in
their framework read. The new identity guard correctly refused that context.
The two fixtures now include the actual requested identity/work plus retained
1.1 prerequisite. PATCH/CAS/verification/negative/duplicate assertions are unchanged.
These are harness mismatches exposed by the guard, not pre-existing product failures.

Original external evidence directories:

- `C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-native-guide-minimized-diagnostic`
- `C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\evidence\cis-soc\native-guide-receipt`

Repository copies: `cis-fix-evidence/pfa001-followup/`.

| File | SHA256 |
| --- | --- |
| `b128-diagnostic-original.log` | `310b063dfa19324841dcb39a13cd454bb9840a43f9d69563862c4c632b0e366c` |
| `corrected-focused.log` | `8c684220d4e6a824939debbee395aa6477c9c5e85a6a50bbd33d72e03b3faee1` |
| `final-focused.log` | `385a900dfd66fb5ffa56f95f8355f05b2b52cca5823960fb42763c7c27c3b360` |

The passing native test output retains its mock-DOM `onEscapeKeyDown` warning;
no suppression or zero-console-error claim is made. Initial receipt-patch raw source hashes:
FrameworkDrawer `49ae9fddfbbf5b2edf4e48a4420778bc67ef181151f75a30bece1150e6a44c73`;
BrawndoCisSafeguard `22eaf6998d3a0b8ded9cd00f13f6250396da7f09ec620322249aca72828cf4a4`.
Diagnostic normalized LF SHA256 is
`e8c04feee856e794d0879359e778ef2ef5d9e243dd091fdf7333d4ff34af5b7f`.

The final independent cache-boundary review added an eighth negative in
`4312aac23e8442a9d4d09abc18a127f1b349e96a`: an authoritative non-null response
omitting the selected record cannot reuse old visible eligibility. The earlier
caller already disabled that retained guide; this was not an established
unauthorized-write result. The final cache stores identity and configuration
only, is used only while raw ctx is null, and is cleared by a fresh missing or
mismatched row. No users, work, related data, current record or history are cached.
Final focused guards: **3 suites / 33 tests passed, 5.343s**; prior 963-case and
PFA-002 29-case results remain source-attributed rather than relabeled reruns.

Final raw FrameworkDrawer SHA256:
`f77a20ece23ae790dfd8195103b51a8663a66a637216d25f8c426c8c0405c530`;
BrawndoCisSafeguard:
`071a02fda27eae926d49f707bbf403db9ce4ad6b8ebbe2b9e73ff4a74dc443f5`.
Final diagnostic LF SHA256:
`b74757d131c02c770e3b53b1061f2739fa1e9de1d40ccac76ecf965129880850`.
`final-cache-guards.log` SHA256:
`d4ee936a59b7085c58f9d98b70b3312a444d6f5b503748ee906e564c6f5bc50e`.

An interim editing command used the wrong working directory, interrupting a
variable rename before completion; its local run caught ReferenceError failures
(30 failed, 3 passed). It was corrected before commit/deployment, without changing
assertions. `interim-path-error.log` is retained, SHA256
`f521399d1609327f5d52a97ccfd595e75b340d8d08b08b7cdd3f7ea07ad2a65a`.

Independent final correction review/retest, combined CI/builds and the exclusive
coordinator's exact hosted retest remain required. No account, fixture, browser,
database, deployment, merge-main or publication action was taken by this author.
