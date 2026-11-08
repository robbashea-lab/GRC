# Executed bounded scale and ordinary-save reliability results

Tested QA commit `7c0f89bbeb750ceeb990dd60be3f84b1ad129495`; unchanged application product baseline `28b806716024ec149af2ec5da621a5a618c669d5`. Test SHA256 `78ebcd6c5707c2b1543eacb5f0d41e93f1c49dbb34a63c5a317027e0b2f84668`. Root-authorized actual Motor/Mongo at exact `127.0.0.1:58749`, isolated synthetic databases and ASGI signed actor. No staging/browser/real-role test.

**Four new real-Mongo cases passed**, including five per-client subtests, in a pytest run reporting **6 passed / 5 subtests passed / 8 existing FastAPI warnings / 16.12s**. The other two passes were incidentally collected imported Harness methods and used their original Mongo-mock fixture. The subprocess completed in16.717s under its600s ceiling. Raw original log, receipt and four case records are retained in `scale-real-7c0f89b-20261011/`.

Independent non-author source recheck passed at exact frozen7c; it did not execute the campaign. The author observed runtime outcomes below.

## Workload and actual results

- Five synthetic configurations asserted56/130/153/123/38 source identities. Source/native records and history were seeded volume; no onboarding or historical-save execution claim.
- Regular workload:60Reviews/7200completed snapshots,2225Tasks,600Evidence records,500native definitions/5000assessment snapshots. Every client returned445exact seeded Task IDs,52current work IDs,14past-due,14due30,zero unassigned. Paging/framework filter/search reconciled independently.
- Each2036historical Calendar returned164exact unique rows (144Review occurrences +20Tasks), without reschedule rights or historical narrative leakage.
- Each Finding retained205exact Actions; Evidence returned120distinct IDs across pages and12exact2036-year records. CSV contained445exact seeded Task IDs.
- All five existing Board Report PDFs generated real bytes; delegated Table spy observed independently expected KPI4/0/0/0 and four overdue Reviews. Exactly five generation events recorded; seeded business fingerprints unchanged. No normal UI entry was proved.
- Cap-only workload:1,000Assets accepted;1,001register rejected413 while1,001CSV exported complete.10,001export rejected413 without partial CSV.5,000Calendar Tasks accepted;5,001rejected413; invalid/reversed/over-limit windows422.
- Ordinary Asset primary write survived injected pre-audit failure503; retry/replay produced one audit event. Eight competing versioned writes yielded one200/seven409. Stale new intent409; replayed old completed intent did not overwrite the winner. Exactly one Asset and two accepted-update audit events.

## Measured local route baseline

| Actual route/status | Samples | Median ms | Max ms | Max bytes |
| --- | ---: | ---: | ---: | ---: |
| GET /api/assets (200) | 1 | 22.312 | 22.312 | 128891 |
| GET /api/assets (413) | 1 | 11.721 | 11.721 | 137 |
| GET /api/assets/scale-retry (200) | 4 | 7.187 | 8.742 | 161 |
| GET /api/calendar (200) | 6 | 47.688 | 167.815 | 1610071 |
| GET /api/calendar (413) | 1 | 24.874 | 24.874 | 94 |
| GET /api/calendar (422) | 3 | 2.854 | 3.71 | 69 |
| GET /api/dashboard (200) | 65 | 41.623 | 72.629 | 85522 |
| GET /api/evidence/catalog (200) | 45 | 53.488 | 81.151 | 30473 |
| GET /api/export/assets (200) | 1 | 21.487 | 21.487 | 65990 |
| GET /api/export/assets (413) | 1 | 32.318 | 32.318 | 123 |
| GET /api/export/tasks (200) | 5 | 108.897 | 260.445 | 5810080 |
| GET /api/related (200) | 5 | 77.137 | 91.357 | 2710293 |
| GET /api/reports/board (200) | 5 | 106.277 | 145.311 | 2572 |
| GET /api/tasks (200) | 5 | 60.114 | 203.77 | 5867841 |
| PATCH /api/assets/scale-retry (200) | 3 | 16.378 | 57.922 | 148 |
| PATCH /api/assets/scale-retry (409) | 1 | 38.286 | 38.286 | 69 |
| PATCH /api/assets/scale-retry (503) | 1 | 42.347 | 42.347 | 113 |

These are heterogeneous local measurements, not p95/throughput/load certification. The existing256,000-byte Dashboard budget passed; other latencies are observations, not invented gates.

## Exact owned cleanup targets

- `platform_acceptance_20261011_scale_449150daedd24421`: author driver drop acknowledged; root independent collection readback pending.
- `platform_acceptance_20261011_scale_c32aa2c901de462c`: author driver drop acknowledged; root independent collection readback pending.
- `platform_acceptance_20261011_scale_a80015ef8f93487d`: author driver drop acknowledged; root independent collection readback pending.
- `platform_acceptance_20261011_scale_bed62b781aaf46fd`: author driver drop acknowledged; root independent collection readback pending.

## Boundaries

- Modeled signed ASGI actor; no real hosted login/Reader/Contributor/wrong-client proof.
- Ten-year histories are seeded load volume; not executed save/approval/closure/scheduler lifecycle.
- Board PDF date/generation/recent-policy cutoff used actual server.datetime; only Review/KPI model clock controlled.
- Performance is local baseline measurements with no latency SLA, p95, throughput or production capacity certification.
- Audit-side fault after Asset CAS/before audit persistence, not network/lost Mongo acknowledgment or multiworker fault.
- No browser UI performance or discoverability result; API Board Report remains separate from unavailable UI control.

No application defect was demonstrated by these passing cases. No product/UI/catalog/account/authentication/mail/provider change or deployment occurred. Only QA artifacts are prepared for integration.

Final QA import cleanup: the fixture module is imported instead of exposing the unittest Harness class to collection; the assertion bodies/runtime paths remain unchanged. Final test SHA256 `8b29c7487fba60e768beabfda0388d4dca94fe188ed4aaf514bb2055ed1148d5`. Root final exact four-method independent execution is pending; the original six-pass log remains attributed to7c/78eb.
