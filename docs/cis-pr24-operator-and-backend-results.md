# PR #24: operator boundary and real backend results

Verified 2026-10-03, America/New_York. This supersedes the earlier preparation-only status for the explicitly executed backend cases, not for the full browser integration gate.

## Execution location and access

`hostname` returned **MikeHawk**; `whoami` returned **MIKEHAWK\RobbA**. The command process is in Windows session **1**. `query user` identifies **RobbA, console, ID 1, Active**. Existing Codex/WebView2 browser processes are also in session 1. No application test browser was launched during this backend-only run.

This establishes the local execution location, not that Robb can physically or remotely operate it. Human access to that console remains unconfirmed. Approval on another computer or another Windows account will not change this user's certificate trust. There are **no pending certificate-import dialogs**: the previous import sessions were cancelled. No new import was attempted this turn.

If Robb cannot access MikeHawk's RobbA console, the minimum alternative is an approved operator at that console (or access through an already authorized remote-desktop path into that session). Do not set up new remote exposure or machine-wide trust. Alternatively provide an already trusted private HTTPS endpoint/certificate usable by the actual test browser.

## Actual certificate, rechecked before requesting action

| Attribute | Verified value |
| --- | --- |
| Subject | `CN=localhost` |
| Subject alternative name | `DNS Name=localhost`; no IP SAN |
| Thumbprint | `E32C313DA5EE7EF16E2DCC4716986C07259C9124` |
| Validity, Eastern time | October 3, 2026 3:30:27 PM through October 5, 2026 3:40:27 PM |
| Enhanced key usage | Server Authentication `1.3.6.1.5.5.7.3.1`; also Client Authentication |
| Key usage | Digital Signature, Key Encipherment |
| Current User Personal (`My`) | Present, `HasPrivateKey=True` |
| Current User Trusted Root | Absent |
| Local Machine Personal / Trusted Root | This thumbprint absent; neither store changed |
| Public file | `localhost.cer` matches subject/thumbprint/validity; does not contain private key |

Suitable while valid for **https://localhost:8446**, not HTTPS addressed as `127.0.0.1` or another hostname. The explicit-certificate backend TLS checks verified chain/hostname without disabling TLS validation. That is NOT proof of Windows/browser trust. No replacement is currently necessary; recheck validity before resumption and identify any replacement before operator approval.

## Exact human action — stop here for browser resumption

On **MikeHawk**, signed in as **RobbA** in the interactive console:

1. Open this public file in File Explorer:
   `C:\Users\RobbA\Documents\Codex\2026-09-08\files-pasted-by-the-user-iventure\outputs\pr24-integration-20261003\localhost.cer`.
2. In certificate Details, verify the subject, localhost SAN, Server Authentication usage, validity and thumbprint above. Cancel if any differ or it has expired.
3. Select **Install Certificate**, choose **Current User**, then **Place all certificates in the following store** → **Trusted Root Certification Authorities**. Do not choose Local Machine.
4. Finish the wizard. Approve the Windows trust warning only for this exact localhost certificate/thumbprint. Do not suppress the warning or bypass a browser certificate-error page.
5. Tell this task that installation is complete and that this was MikeHawk/RobbA. The agent must then verify the store and actual trusted browser HTTPS before running browser cases. No server/browser is being kept running in the background awaiting approval.

An operator may instead run the normal `Import-Certificate` command interactively, using that exact public file and `Cert:\CurrentUser\Root`, and approve its warning. [Microsoft's Import-Certificate documentation](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate?view=windowsserver2025-ps) describes the user-scoped store parameter. No elevation is needed for the proposed user-scoped action. If policy blocks the action, report that specific error; do not circumvent policy.

## Exact tested source and environment

- Fetched main remained `c57a57f0f5549dce7d4c9dc128387823a85af617`; intake PR head was `b8b0a59fa2c1079dfbfddb2a9b6afc4457b2e6b9`. No intervening product or ISO changes.
- Final executed test commit: **`d17e713c52060226952c7a7b87d977779ad68380`**. Only the opt-in integration runner was added; application behavior is unchanged from product commit `5525f543ef1f952bbeefa336cb95036baa189a62`.
- MongoDB Community 8.0.28, `127.0.0.1:27026`, `--auth`, new dedicated persistent directory `backend-checks-5/data`, database **`staging_cis_pr24_0e18e69f4436`**. Separate bootstrap Mongo administrator for user creation/shutdown; application connection has `readWrite` only on that database. All credentials generated in memory.
- Normal `server:app` in a separate real Uvicorn process on loopback 8446, `APP_ENV=staging`, `APP_BASE_URL=CORS_ORIGINS=https://localhost:8446`, unique test JWT secret, normal insert-only administrator bootstrap. Demo and legacy migration switches disabled; no ambient `.env`, mocks, patched authentication or external delivery credentials.
- TLS uses the verified existing localhost certificate and an encrypted run-owned key export. HTTPX uses a standard SSL context with this exact public certificate as its explicit trust anchor, hostname verification enabled, no `verify=False` or certificate-error bypass. This avoids needing Windows user trust for these nonbrowser checks; it does not install that trust.
- Normal password login, normal JWT identity/scope reload, normal account/client creation, normal onboarding, explicit bearer and cookie requests over real HTTPS sockets. Two synthetic CIS-only clients, scoped provider writer, scoped read-only and other-client writer. No Demo export data.
- Existing normal frontend build retained; no rebuild or browser execution this turn. It was built at `bde9f38179f9dedc2b3846650f1b5aa02532e65c`, with Demo false/sign-in true/API base `https://localhost:8446`; subsequent changes are tests/docs only.

## Executed results — backend/database-only

Final command: existing `workflow-venv/Scripts/python.exe backend/scripts/verify_cis_persistent.py`, with explicit run-owned `--mongod`, `--certificate`, `--key`, `--output` paths. Exit **0**, **15 PASS / 0 FAIL**:

1. Normal network TLS API login and JWT authentication.
2. Secure/HttpOnly/SameSite=Lax cookie issuance; API cookie-authenticated mutations reject missing/foreign Origin, permit trusted Origin, and preserve records after denial. Not browser-cookie behavior.
3. Legacy assessment lacking `cis_operation`: read/unrelated save preserves status.
4. Operating arrangement, narrative, independent implementation/verification and assessment history persist.
5. Real upload/download content equals original bytes and SHA-256; size/hash metadata matches.
6. Exact Review/Evidence links persist and reopen.
7. Completed Review conclusion, client-written scope, recurrence, due date and occurrence/history survive onboarding replay.
8. Cross-client assessment/workspace/Review/file requests denied, including writer/read-only A → B files and B → A files.
9. Read-only arrangement/status/verification/narrative/link/unlink/upload mutations denied with assessment unchanged; authorized file reads allowed.
10. Unauthenticated file retrieval denied.
11. Backend Demo entry rejected.
12. Controlled backend restart, fresh normal login: assessment, actual file bytes, Review history/schedules unchanged.
13. MongoDB process shutdown/restart with SAME data directory, fresh login: same checks unchanged.
14. API outage: attempted write gets transport failure, stored record remains unchanged after restart, retained request payload retries successfully with one history entry. This does not verify frontend draft retention.
15. Stale assessment edit snapshot rejected.

Final uploaded SHA-256: `3d7fd3e5c53ab806f8050160c0883f83a8e3ca16b7a8d078fd64392e76dfe4fe`.

Earlier runner executions exposed missing test-request idempotency/edit-version fields (422/428); the runner was corrected to use the existing frontend/API contract, not weaken it. An intermediate run had 11 passing cases and two missing-version failures. Final execution is fully rerun at the exact commit above; no product defect or unrelated application defect was demonstrated. Raw responses, passwords, JWTs and file contents are not included in this report. Sanitized local results: `backend-checks-5/results.json`.

## Not executed / gate

Actual Windows-browser trusted HTTPS, frontend login/refresh/session behavior, frontend saves/reopening/navigation/evidence workflows, frontend save-error display/draft retention/safe navigation and browser lifecycle cases remain **NOT EXECUTED**. API cookie checks do not substitute for a browser. Backend restarts and file durability now have real evidence, but do not close the full handoff gate. PR #24 remains draft/unmerged. No preview publication or deployment.

## Residual resource inventory and scoped cleanup

All run-owned API/Mongo processes were stopped by the runner; Mongo shutdown used its test-only administrator, retaining its directory for restart before final shutdown. No certificate-import process remains. Original Demo server/shared dependencies/ISO work untouched.

Base directory is exactly:
`C:\Users\RobbA\Documents\Codex\2026-09-08\files-pasted-by-the-user-iventure\outputs\pr24-integration-20261003`.

| Identified resource | Disposition / exact operator cleanup target |
| --- | --- |
| CurrentUser/My certificate and associated private key | Retain for approved HTTPS resumption. After tests, delete only the Personal certificate with the verified thumbprint in Certificate Manager. Physical private-key deletion has not been verified; do not delete a whole key store. |
| `localhost.cer`, `server-certificate.pem` | Public certificate artifacts retained for verification/resumption. Remove only these files when no longer needed. |
| `server-encrypted.pfx`, `server-encrypted-key.pem` | Encrypted private-key exports created for backend TLS. Passwords were memory-only and not retained; remove these exact files manually after preserving public certificate identity. They are outside Git. |
| `frontend` | Existing non-Demo build retained for browser resumption; remove this exact generated directory after testing. |
| `mongo`, `mongodb.zip`, `mongodb.zip.sha256` | Official portable runtime/package/checksum retained to avoid downloading/reinstalling; remove these exact artifacts if no longer needed. |
| `data`, `mongo.log` | Original empty-runtime directory/log from prior preparation; retained pending manual cleanup. |
| `backend-checks-1` through `backend-checks-5` | Each is a separate run-owned persistent Mongo directory and API/Mongo logs/results, synthetic-only. Preserve sanitized `results.json` and this report first, then remove only these five exact directories through File Explorer. No broad output/workspace deletion. |

No deletion retry or alternate deletion mechanism was used to circumvent the earlier execution-policy rejection. Encrypted exports and persisted synthetic databases are deliberately inventoried, not claimed removed. No credentials/certificates/private keys/test payloads were committed. No application schema or dependency change.
