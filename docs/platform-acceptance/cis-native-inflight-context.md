# PFA-001: context becomes unavailable during a pending write preflight

Frozen source `f673453ea82ed23e7e5d86854edd7f6d127c63d9` preserved the
mounted CIS draft and disabled its controls after a joined-context read failed.
An independent source review identified a distinct in-flight schedule: first
progress starts with valid context and confirmed native receipt B, waits for
the guarded interview metadata read, then the joined context fails before that
metadata read returns. The save closure still held its entry-time disabled=false.

Independent test-only commit `4134ed92bf1214c3769138e9428f0965faef2833`
reproduced this on unchanged f673: **one test failed, 1.819s**. The assertions
establishing the visible context error and disabled control passed; releasing
the metadata read then dispatched a modeled progress PUT. This is an executed
local React/API-boundary reproduction, not a hosted failure, native-data-loss
observation, or server authorization bypass. The packet used the correct B
token; server CAS and authorization remained intact.

The narrow correction adds disabled to the existing latest-props ref and checks
that value and active identity immediately before progress PUT dispatch. If
context became unavailable, save returns false and retains answers, narrative,
position, the existing visible error and Retry. Its finally block clears the
child's busy state. No UI, copy, catalog, status criteria, API payload, backend,
interview version or history semantics changed.

The independent test was imported unchanged. The corrected first-write source
passed **three focused suites / 34 tests, 5.557s**: minimized/native receipt and
failure timing, the prior first-base/concurrent/scope/identity cases, and native
assessment integration. The regression requires no PUT while context is
unavailable, exact input/native/history retention, and successful progress only
after explicit Retry. These are modeled local requests, not hosted permission
or persistence proof.

First-write-only raw `GuidedAssessor.jsx` SHA256:
`381854ccc21bb3de8dcd80543f110fb107cfb15f57a2d02786aeb6fb3d95ca66`.

| Original receipt | SHA256 |
| --- | --- |
| `f673-inflight-original-red.log` | `0feeae62c12e553ee42906024cb3ddd87af23d1d25fdc804e5615ef8e1b2913a` |
| `first-write-corrected-focused.log` | `f99b6272a6974d8d3198d9166538c991ba762c9b1586ed52548562d880879da7` |

Original logs remain in the coordinator's external evidence folders; repository
copies are in `cis-fix-evidence/pfa001-inflight/`. Git may normalize line endings.
Independent correction review/retest, connected Compare/summary schedules,
combined release gates and coordinator-hosted retest remain pending. No browser,
account, Mongo, deployment or publication operation was taken by this author.

## Connected write boundaries

The independent author then executed the existing Compare/reuse path with its
metadata read held across the same joined-context failure on unchanged f673.
Releasing the read dispatched a rebase PUT and a retained-answer progress PUT.
The original combined log contains one valid Compare failure and one unrelated
summary-fixture error, plus the older joined-response negative passing; it is
not counted as two demonstrated application failures.

A separate valid summary schedule used an existing linked Finding's normal
open/close callback to start refresh while native fields and token stayed
unchanged. Summary progress PUT was held; joined context failed and disabled
the guide; releasing that already-dispatched PUT then initiated a native PATCH.
This independently reproduced **one failure, 1.908s** on f673. Preparatory
duplicate-label and absent-Retry fixture errors are preserved and excluded from
application-defect evidence. Final immutable test-only source is
`2ab833f155e45d819e0224fb017ed5f26e91f127`; all twelve timing assertions are
imported unchanged (normalized LF SHA256
`6f79deaa43eccc96ca3de9ac54599edc3c3094a2f63b3ebc8ed0c26b6d44a2c3`).

The correction checks latest disabled/identity before the rebase PUT, and latest
disabled after acknowledged interview save before calling native assessment save.
An already-acknowledged interview write is preserved: this check does not claim
to undo or cancel it. The exact manual summary, old native value, history,
existing error/Retry and close-only-after-assessment-success remain intact.

The existing nativeSnapshot also records whether identity-valid live CIS context
is available. Its CIS callback refuses a write without that context. This does
not alter permissions or implementation-group rules: undefined configuration
previously defaulted to group1 and was not itself an availability refusal.
ISO/SOC callback conditions remain unchanged. No new ref, epoch, date sorting,
response fencing, API field, static text, layout or history version was added.
The queued older joined-response negative passed; no fix was justified for it.

An additional native adapter test deliberately uses its existing Guide stub
that ignores disabled, exercising the real parent's callback without child
masking. Against the exact f673 FrameworkDrawer Git blob
`ddc7cf6f37299e0de1232207071128b21c542c44`, that one selected test failed
(1.748s, one PATCH attempt). Twelve other tests were unselected in that focused
baseline probe; none were disabled or altered. The corrected source was restored
in a finally block before the full focused run. This is author-executed parent
API-boundary evidence, not an independently authored or hosted test.

Final connected correction: **seven suites / 256 tests passed, 18.217s**,
covering all twelve immutable timing cases, thirteen prior first-base guards,
thirteen native adapter cases, ISO/SOC guide suites and actual parent native
assessment suites. All old PATCH/CAS/verification/exclusion/duplicate assertions
remain. Existing mocked-DOM onEscapeKeyDown warnings remain visible, with no
suppression or zero-console-error claim. No broad catalog campaign was rerun.

Final source hashes (raw / LF normalized):

- GuidedAssessor: `3e05c812addcb828f90d6562b17de9d00c4a597df382b27df96e6610e971ef68`
  / `cb6f03b47484e4d8c396bc0a8bd5c9fa6b0bc3678d420ee9735eb5e9e9393737`.
- FrameworkDrawer: `0fa9b345942aa5e2b2d35333aad47817e3dc3ebb9895ddf58a3012ae1061121f`
  (raw and LF identical).

| Connected receipt | SHA256 |
| --- | --- |
| `f673-connected-original.log` | `f6353b0fc6311e311d81d923b0b328f2e23fbabaab2c440f44e7f28ad90a3e86` |
| `f673-summary-selector-corrected.log` (fixture error) | `beba2ee0d441e02d304a9bdc1a7b0445dae0eca654834d177384fcea7a17e181` |
| `f673-summary-linked-close-original-red.log` | `b7a821d09ae4f5d841c728e676221b4b89ee0f0a85b2993fe751a0691e8fd0ec` |
| `f673-parent-adapter-original-red.log` | `6c058198d6c9af4a5bbc1a5425ec44a325eee86410b5d21480d6487d25d8865d` |
| `connected-boundaries-corrected-focused.log` | `b3e5557887bf63e70d69743dc341e1af3e2776af36fdcf74a0a41b77eb4828c9` |

Subsequent non-author source review passed on exact 7788775. The independent
four-suite retest passed 43/43 cases in 38.692s with the original assertions;
see [the independent receipt](cis-native-followup-independent-review.md).
Root's two optimized builds also passed on that runtime. Exact composite CI
and controlled hosted retest remain required at this document's cutoff.
Authentication, restricted-user, actual provider fault and deployment evidence
are separate and unwaived.
