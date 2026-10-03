# PR #24 local integration attempt — 2026-10-03

## Exact source and scope

Fetched `main` and `codex/cis-operational-handoff` before preparation. Main remained `c57a57f0f5549dce7d4c9dc128387823a85af617`; PR head remained `bde9f38179f9dedc2b3846650f1b5aa02532e65c`. No intervening changes, no dirty files, and no parallel ISO modifications. Product code is unchanged from `5525f543ef1f952bbeefa336cb95036baa189a62`; the normal frontend build used the exact PR head `bde9f38179f9dedc2b3846650f1b5aa02532e65c`.

Acceptance plan: [persistent integration handoff](cis-pr24-integration-handoff.md). Local preparation was authorized; no external target, production data, paid provisioning, merge or publication was used.

## Executed preparation

- Downloaded MongoDB Community 8.0.28 Windows ZIP and its SHA-256 from `https://fastdl.mongodb.org/windows/`. Computed hash matched the publisher checksum: `a6573419fc1d8767b7a86911c4a1b832fa408d4b8bd32d281f049b87a30073cf`. ZIP executable reported NotSigned; provenance is the official HTTPS download plus matching official checksum, not an Authenticode claim. See [official ZIP installation instructions](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/).
- Extracted only into the task's isolated output directory; no service install, elevation, PATH change or machine-wide configuration.
- Started real `mongod.exe` with `--bind_ip 127.0.0.1 --port 27026 --auth`, dedicated `outputs/pr24-integration-20261003/data` directory and run-specific log. Process ID 23812 was identified as run-owned. No public database listener.
- Existing Motor/PyMongo environment connected to that process: server version was 8.0.28; unauthenticated `framework_assessments.find_one` was denied with MongoDB code 13. This is a database preflight, NOT application authorization validation. No database user, application account or application record was created.
- Built the normal frontend using existing dependencies: `node node_modules/@craco/craco/dist/bin/craco.js build`, with `REACT_APP_PREVIEW=false`, `REACT_APP_STANDARD_SIGN_IN=true`, `REACT_APP_BACKEND_URL=https://localhost:8446`, and a separate output `BUILD_PATH`. Build succeeded. Existing Node `fs.F_OK` deprecation and bundle-size advisory appeared; no product changes or dependency upgrades.
- Created a two-day localhost certificate in `Cert:/CurrentUser/My`, exported only its public certificate, and attempted user-scoped trust through both `Import-Certificate ... Cert:/CurrentUser/Root` and `certutil.exe -user -addstore Root ...`. Neither completed because Windows required interactive trust confirmation. Both commands remained waiting, and the exact certificate was absent from the current-user Root store on subsequent checks.

Certificate thumbprint: `E32C313DA5EE7EF16E2DCC4716986C07259C9124`. No private key was exported. The user was asked to approve only this specific short-lived local certificate; no approval was observed before this attempt ended. No certificate-error bypass, insecure browser flag or TLS-validation disabling was used.

## Configuration actually exercised

| Component | Actual configuration/result |
| --- | --- |
| MongoDB | Real 8.0.28, loopback 27026, `--auth`, run-owned persistent data directory; unauthenticated data read rejected |
| Database | Proposed `staging_cis_pr24_20261003`; no application database or test records created |
| Frontend | Normal optimized build, standard sign-in enabled, Demo disabled, intended HTTPS base `https://localhost:8446` |
| HTTPS | Certificate created; Windows user trust installation blocked; no verified browser HTTPS target established |
| Backend | Not started; staging variables/JWT/bootstrap credentials were not injected |
| Accounts/files | None provisioned/uploaded; no secrets or sensitive test payloads written |

## Acceptance results

| Required case | Result | Reason |
| --- | --- | --- |
| Normal browser authentication / real frontend-backend writes | NOT EXECUTED | Verified browser HTTPS not established |
| CIS arrangement, implementation and verification persistence | NOT EXECUTED | No authenticated application target |
| Legacy assessment compatibility | NOT EXECUTED | No authenticated application target |
| Review/Evidence linkage and reopening | NOT EXECUTED | No authenticated application target |
| Actual uploaded-file retrieval and matching hash | NOT EXECUTED | No application upload/download performed |
| Controlled backend restart persistence | NOT EXECUTED | Backend not started |
| Controlled database restart preserving application data | NOT EXECUTED | No application data created; cleanup termination is not a lifecycle test |
| Cross-client denial, including files | NOT EXECUTED | No synthetic application tenants/accounts |
| Application read-only restrictions | NOT EXECUTED | Mongo unauthenticated denial is not this case |
| Logged-out application file retrieval | NOT EXECUTED | No application upload/file endpoint target |
| Historical conclusions, descriptions, schedules and relationships | NOT EXECUTED | No application baseline established |
| Save failure, draft retention and safe retry | NOT EXECUTED | No authenticated browser target |

**Gate remains OPEN.** No integration assertion failed because none reached execution. Environment preparation was partially successful; certificate trust installation was blocked. No attributable product defect was demonstrated and no product fix was made. Earlier Demo/mock regression results were not rerun or recategorized.

## Cleanup and minimum unblock

Cleanup: the run-owned MongoDB process was stopped and both waiting certificate-import command sessions were cancelled. A combined certificate/output cleanup command was rejected by execution policy and was not executed; it was not bypassed. The run output directory and certificate in CurrentUser/My therefore require manual cleanup. The certificate was not trusted in CurrentUser/Root at the last check. No private key file or application secrets were exported. Preserve this sanitized report; the remaining directory contains the downloaded package, build, public certificate and empty MongoDB runtime data/logs, not customer information. No application data requires cleanup. The existing Demo server and shared runtimes/ISO work were left untouched.

Minimum external action: the operator must approve the specific Windows current-user certificate trust confirmation during a resumed local setup (or provide an already trusted localhost certificate/private HTTPS ingress). No administrator elevation or machine-wide certificate change is required by the proposed setup. Then repeat preparation and execute ALL acceptance cases with normal authentication; the database download/build/preflight alone do not close the gate.

PR #24 stays draft and unmerged. No ChatGPT preview update, production deployment or application-readiness/compliance claim.
