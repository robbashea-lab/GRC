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
