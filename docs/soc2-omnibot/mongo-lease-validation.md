# SOC save deadline: real-Mongo evidence

## Scope and reproduced defect

2026-10-10, Agent 2 isolated local target. This is backend/database evidence,
not hosted browser authentication, TLS/cookie, or restricted-account acceptance.
Agent 1 remains the only Render deployer and shared-session owner.

At frozen runtime `b384b28d121a698f162cf4701a25e5158fed8da9`, a native save
returned 503 after its unchanged 90-second timeout. A second OS process then
saved interview revision 2 (`needs_attention`). Releasing the first process's
pending real PyMongo executor allowed its older native revision 1 (`addressed`)
to commit, including native history. The only injected fault delayed the
synthetic native collection's real driver thread before its CAS send. Mongo,
Motor, the application writer and timeout bounds were not mocked.

Independent reviewer Bacon reproduced that ordering using Python 3.12.14,
Motor 3.7.1, PyMongo 4.18.2 and MongoDB 8.0.28. No shared data was touched.

## Narrow correction

`backend/soc_guided_lease.py` now applies one 80-second PyMongo CSOT context
around the SOC operation, below the existing 90-second coroutine timeout and
120-second lease. Motor propagates that context into its executor. A queued
command cannot start after that deadline merely because its coroutine was
cancelled.

Cancellation, coroutine/driver timeout and indeterminate connection/write-
acknowledgement errors retain the owner's lease until expiry. Competitors get
409 rather than a chance to update beneath the pending command. Cancellation
is re-raised; uncertain errors return 503 with reload/confirm guidance. Normal
success and terminal validation errors release the owner-matched lease outside
the deadline context. CIS and global Mongo client settings are unchanged.

This follows the existing supported driver API: [PyMongo CSOT, including Motor
and partial outcomes](https://pymongo.readthedocs.io/en/4.14.1/examples/timeouts.html)
and [PyMongo 4.18.2 timeout/network/write-acknowledgement exceptions](https://pymongo.readthedocs.io/en/4.18.2/api/pymongo/errors.html).
The runtime pins Motor 3.7.1/PyMongo 4.18.2; installed implementation/context
propagation and actual behavior were checked with those versions. No upgrade.

Cancellation does **not** undo an already accepted native write. It can finish
while the retained lease prevents a later interview from interleaving. Reload
is required to determine the state; no successful-looking response is invented.

## Executions on the corrected working tree

| Case | Actual result | Boundary |
| --- | --- | --- |
| Focused SOC routes | 15 tests / 67 subtests passed | Offline authorized ASGI fixture, Mongo mock |
| Same 15 route tests with actual Motor/Mongo | Passed, zero failures/errors; includes all 61 criterion/native/history cases | Real database, fixture authentication; not browser login |
| Two independent OS processes competing for the same lease | Contender 409; exactly one write; owner lease released | Actual process/database boundary |
| Original real-driver delayed-send timeout | Native 503; successor 409; released executor timed out without committing; actual 120-second expiry followed by successor 200; native unchanged | Unmodified timeout/lease bounds; before-send fault injection |
| Early external caller cancellation | Cancellation propagated; successor 409; the pending native write could finish while held; actual lease expiry followed by successor 200; no native change after that successor | Demonstrates serialization, not rollback |
| Actual 120-second process/event-loop stall before final lease check | Old holder 503, no stale write; successor token retained and one write | Unchanged bounds, real process barrier |
| Isolated child clock 180 seconds ahead before final lease check | Old holder 409, no stale write; successor token retained and one write | No machine clock change; not after-last-check fencing |

Independent reviewer Bacon passed both corrected real-Motor fault probes plus
77 tests / 2,214 subtests. Reviewed lease-file SHA256:
`9577ae472c02fe47d7623bd60ac40b9167ee63e05a24527cb93f1df31bbf9c74`.
No material defect remained in this bounded patch; review ownership released.
Final commit/CI and any hosted retest are recorded in the PR/coordination record;
they must not be inferred from this local table. The two executable regressions
fail the original immediate-unlock behavior at the expected 409 assertion.

### Frozen correction and current hosted attribution

The correction was committed at `5c3594c2c5b012e547c86990286f4a1790ae5fa0`;
the committed lease hash above was independently reread and matches the
executed probe correction. [CI #134](https://github.com/robbashea-lab/GRC/actions/runs/38092857199)
passed at this exact source. Agent 1 verified Live Render deployment
`dep-db5cbcbrjlhs73d606o0` and subsequently completed all 61 positive native
save/refresh/resume paths. Those are coordinator-owned browser results, not
Agent 2's real-Mongo probe results or restricted-user evidence.

SOC-U10 is a separate, subsequent two-line frontend message/notice correction:
the boolean native-save adapter must not describe an uncertain outcome as
“not saved” or retain an earlier success notice after failure. It does not
change this deadline/lease implementation or strengthen its guarantees. Its
exact source/CI and affected hosted retest are recorded on PR #66.

## Reproduce using an already approved disposable Mongo process

From the repository root, with existing project runtime/test dependencies:

```powershell
.\.soc-test-venv\Scripts\python.exe backend/scripts/verify_soc_motor_deadline.py --mongo-url mongodb://127.0.0.1:58739 --mode timeout
.\.soc-test-venv\Scripts\python.exe backend/scripts/verify_soc_motor_deadline.py --mongo-url mongodb://127.0.0.1:58739 --mode cancel
.\.soc-test-venv\Scripts\python.exe backend/scripts/verify_soc_lease_boundaries.py --mongo-url mongodb://127.0.0.1:58739 --routes --processes
.\.soc-test-venv\Scripts\python.exe backend/scripts/verify_soc_lease_boundaries.py --mongo-url mongodb://127.0.0.1:58739 --expiry --clock-skew
```

The URL is explicit and validated as credential-free loopback only. Each run
creates a UUID-named synthetic database, drops only that database in `finally`,
and terminates only its own child workers if needed. No default connection,
secrets, Atlas, browser credentials or shared fixture is used. These are opt-in
probes, not newly installed services or a CI/provider configuration change.
The timeout/cancellation runs wait for real bounds and each takes about two
minutes; do not shorten those bounds and then claim the real-bound case passed.

## Target provenance and retained resources

An existing portable MongoDB Community 8.0.28 package from the earlier PR #24
preparation was reused, without touching its old data/certificates or cleanup:

- Official archive SHA256 fetched over HTTPS and matched:
  `a6573419fc1d8767b7a86911c4a1b832fa408d4b8bd32d281f049b87a30073cf`.
  [Publisher checksum](https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.28.zip.sha256).
- Extracted `mongod.exe` SHA256:
  `286584860a3bccbfe8a97330307b3d9b2e9b92f7ea061d92928307fe3e074983`,
  matched against its archive entry. Authenticode reported **NotSigned**; this
  is checksum/origin evidence, not a signature claim.
- New run-owned process PID 22884, loopback `127.0.0.1:58739` only. New data/log
  directory `.soc-test-venv/mongo-lease-20261010/`; no machine service, trust
  store, elevated operation or install. Local implementing interpreter 3.13;
  independent reproducer used staging-compatible Python 3.12.14.
- The new log/data and original failing probes are retained locally as evidence.
  PID 22884 was stopped after its exact loopback bind/port/data path were
  verified; only UUID-named probe databases were dropped. Remaining databases
  were admin/config/local. Stopping that run-owned process is separate from
  deleting retained resources.
  No old PR #24 certificate/private-key/data/package cleanup is authorized here.

## Remaining limitations

The lease remains an expiring, client-clock-based coordination mechanism, not a
cross-document transaction or server-side fencing token. Pre-check expiry and
isolated clock-skew probes do not prove protection against takeover **after**
the last ownership check. An already-dispatched server command can have an
indeterminate outcome; CSOT does not establish rollback or transactional
atomicity. Extreme clock skew/process suspension after the last check and
server-dispatch/acknowledgement ambiguity remain explicitly open limitations.
Do not claim universal multiworker safety or close restricted hosted access,
browser persistence, file access, or Agent 1 acceptance gates from this evidence.
