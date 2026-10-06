# Final integration hosted acceptance

## Verified revision and delivery

On 2026-10-06, remote main and Render's live deployment were
`842b195ffb0c92bba399c20766c853139b7c5bb5` (PR45). Reviewed PR41 introduced the
required fail-closed Release gate; PR39 supplied the narrow CIS-group subtitle
correction; PR45 documented the connected provider and rollback procedure.
Main-push [CI run 37388162818](https://github.com/robbashea-lab/GRC/actions/runs/37388162818)
passed 215 frontend suites / 1,552 tests / one snapshot, both normal and Demo
builds, 631 backend tests plus 690 subtests and 99 isolated real-Mongo checks.
Render then deployed that exact merge automatically:
`dep-db23b1nlk1mc738fiqgg`, trigger **Auto-Deploy**, duration 1m52s. No manual
deployment substituted for this proof. The existing Free Docker service remains
main / **After CI Checks Pass**, `DEMO_MODE=false`; Atlas remains Free.

The served normal bundle fingerprint `main.c51bbfa5.js` and CSS
`main.098381cb.css` match this exact main CI build. Served JS SHA-256:
`50a6ca4fc0b0ede874c814e90473528bab08a3b753e2bc032b4465a4524eeeeb`;
CSS: `07bb533d7502bf4465488700e81eed03c651ce47511892fe395b44cc7de85344`.
Windows local JS byte-equivalence was not established; its differently named
bundle is not evidence of another deployed revision. The owner-only private
ChatGPT preview separately published version **112**, source **842b195**, at its
unchanged URL. GitHub-to-Render automation does not publish that preview.

## Observed authenticated checks on 842b195

The owner entered the existing administrator credentials privately. The normal
session survived reload and independent Demo operations. Users & Access showed
four existing users: exactly one active Staging Administrator and three disabled
fictional test users. No account was created, activated or password reset.
Testing used the existing **Synthetic PR36 Assessment Release QA** client,
`cli_9c7a9f63724399124cd08368aaed747586c1f149adb35ecccc08090389e8aa07`.

- Dashboard tiles: Past Due 1, Due in 30 Days 1, All Open 28, Unassigned 28.
  Due-date filters opened the corresponding labelled Actions. All Open pagination
  showed 1–25 and 26–28, with the final three expected Reviews; Unassigned rows
  had no owner. The saved due-soon Action title (`tsk_8a634f92a4fa`) survived
  reload and appeared on the dashboard as “final 842b195 saved”.
- All 21 distinct status/attention filter destinations matched their displayed
  totals. CIS: 0/1/0/152 of 153; ISO: 0/1/0/122 of 123; SOC: 0/1/0/32 of 33.
  Each had one gap without a Finding and zero stale/unevidenced implemented
  records. CIS showed the correct full IG3 subtitle and Demo Initech IG2/130.
- Manual Action and Review summaries had zero editable input/textarea/select
  controls and opened their correct operational IDs. ISO source navigation from
  the linked corrective Action opened clause 7.1.
- ISO and CIS assessment tabs opened. An unsaved ISO draft prompted “Leave
  unsaved changes?” and Keep editing retained it. A labelled ISO note saved and
  reopened after reload with Not Assessed unchanged. CIS 1.1 checklist change
  and labelled note survived tab changes, save and reload, with Partially
  Implemented / Not verified unchanged. ISO 7.1 currently has no checklist items;
  its 111 source comparisons remain unresolved content dependencies.
- The existing unified ticket `finding:fw_143f724a90c25dabbd15a8a3703a19a2`
  accepted a planned-action edit from Action Items, showed it when opened from
  ISO 7.1, accepted a reverse edit there and reopened with that reverse value
  after reload. No duplicate Finding or ticket was created.
- A labelled synthetic 188-byte text Evidence file uploaded through the normal
  UI and reopened after reload. Stored filename, uploader, size and SHA-256
  matched the prepared file:
  `197923ec4443fc53c0b195c771f82c10018081f668e06335d21c9e94aa9b43d8`.
  The browser's download event timed out after 15 seconds; downloaded bytes and
  browser file delivery remain unverified. No credential/cookie extraction was
  used to work around this limitation.
- Demo displayed four fictional clients; its labelled Initech Review note
  survived reload and remained absent from the backend Review. Demo sign-out
  returned its tab to login while the real administrator remained authenticated.
  However, the normal selected-client preference changed after reload, exposing
  the selection-cache defect below. Normal logout remains pending final delivery.

## Demonstrated correction and final acceptance handoff

On 842b195, OrgContext wrote both modes to shared localStorage `grc_client_id`;
mode transitions and Demo reset removed that key. Entering/selecting/exiting
Demo in another tab therefore changed the normal workspace selection. This did
not demonstrate backend record leakage or server authorization bypass, but it
violated the required cache isolation. The correction uses tab-local
sessionStorage for Demo selection, preserves the normal preference during Demo
transitions, and updates Contacts navigation and Demo reset to use that same
boundary. Normal authentication transitions still clear prior normal selection;
server authorization and eligible-client filtering remain authoritative.

Focused regression checks, independent review, both builds, exact PR/main CI,
deployment and hosted re-verification must complete for the correcting revision.
The correcting PR's final acceptance handoff records those SHAs/results and
supersedes the pending items here. PR42, PR43 and PR44 remain sequentially queued
until that explicit handoff; no concurrent administrator logout is permitted.

## Limits retained

Administrator browsing is not tenant-isolation proof. Hosted anonymous reads
of clients/tasks/assessments/users/synthetic Evidence returned 401; the backend
Demo entry returned 404, and invalid-session logout probes returned foreign
Origin 403 / trusted Origin 401. Restricted-role and cross-tenant denial were
tested separately in the 99 disposable Mongo checks, not with new hosted accounts.
Hosted restricted-identity acceptance, browser-download bytes, email delivery,
Atlas backup/restore and outage/restart recovery remain unavailable or unverified.
Earlier full Windows frontend verification timed out in the unchanged ten-year
Brawndo simulation (214 suites / 1,543 tests passed, seven failed); the exact CI
revision passed the complete suite. No assertions or timeouts were weakened.
Keep the 111 ISO comparisons as content dependencies. These observations are
workflow acceptance evidence, not certification or whole-application assurance.

Operating and data-preserving rollback instructions:
[render-release-operations.md](render-release-operations.md). Prefer a reviewed
revert through the same gate. Application rollback does not roll back Mongo data;
never reset/reseed Atlas. Recheck and restore After CI Checks Pass after a Render
dashboard rollback or manual deployment; publish the private preview separately.
