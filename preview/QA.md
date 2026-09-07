# Interactive demo QA — 2026-09-07

The preview uses synthetic records in sessionStorage. Application requests never
reach a backend in an explicit demo build. Normal backend authentication and
permissions have not been changed. The simulated administrator is not a real
user account; invitations and notifications do not send messages.

## Automated checks

- 27 frontend tests: client lifecycle and empty initialization, session persistence,
  logout/re-entry, isolated onboarding drafts and idempotent finalization,
  review completion/recurrence, finding-to-task/risk links, risk scoring/history,
  policy approval, vendor review scheduling, contacts/invitation simulation,
  evidence upload/download/delete, comments, bulk completion, invalid requests,
  cross-client mutation rejection, storage-quota failure, and reset.
- Portfolio totals and client KPI responses compared against backend-generated
  synthetic fixtures, including stored dashboard scopes.
- Existing dashboard aggregation, navigation, login, and planned-role tests pass.
- Optimized build succeeds. Existing hook-dependency warnings remain.

## Actual browser checks completed

- One-click demo entry and portfolio load.
- Add Client validation prevents an empty organization name.
- Created client immediately appears in Client Management and sidebar.
- New client dashboard loads with zero counts and useful empty states.
- Onboarding policy response/note saved; navigated away, switched to a sample
  client, returned, refreshed, and confirmed the draft remained separate.
- Continued through requirements and contacts steps.
- Created a review through its existing drawer and verified its list row.
- Edited the review title and reopened the saved record.

The browser connection stalled at the review completion confirmation, then its
recovery timed out. Browser verification of completion, final onboarding submit,
other module editing, and Reset Demo could not be finished. These mutations are
covered by the automated adapter tests; that is not equivalent to complete
browser end-to-end coverage.

## Functional limitations

- Data belongs to this browser tab's session, not other browsers or users. Closing
  the session clears temporary work (subject to browser session restoration).
- Evidence: 1 MiB per file and the browser's overall sessionStorage quota. Saving
  rejects quota failures; sample evidence without file content cannot download.
- Board Report PDF requires the reporting server; its demo action explicitly
  reports that it is unavailable. Record and audit CSV exports use demo records.
- Password changes, real provisioning, and real authorization testing require a
  configured backend. No external invitations or notifications are delivered.
- The existing six-step onboarding design and its business rules are retained;
  this change does not implement a redesigned onboarding workflow.
