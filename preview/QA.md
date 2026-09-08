# Interactive demo QA — updated 2026-09-08

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
- Reviews do not yet offer a dedicated related-policies picker. Existing notes,
  findings, evidence, owner, status, and scheduling fields remain available.

## Focused onboarding baseline — 2026-09-08

Supersedes the earlier onboarding browser coverage above. The current interface
has four steps, 17 policy assessments, five requirements, and 17 selectable review
areas. The matching catalogs live in backend/routes/onboarding_catalog.json and
frontend/src/lib/onboardingCatalog.json; a backend test verifies their parity.

Automated: all 30 frontend tests and four backend tests pass. New checks cover
stable client-scoped keys, response validation before writes, repeated finalization,
manual review metadata preservation, historical-record preservation, selection
counts, empty scheduling fields, session storage, and tenant/write authorization.
The production build passes with eight pre-existing hook-dependency warnings.

Browser: created Baseline QA through Client Management; opened its workspace;
verified four steps, 17 Yes/No/Unsure response groups and no notes inputs; entered
all policy responses and all five requirement responses; refreshed and verified
responses persisted. All 17 review areas started selected. Deselected Risk
Assessment, finalized, and saw exactly 16 Needs Scheduling records, no scheduled
dates/cadence/owners, Upcoming 0 and Overdue 0. Reopened and finalized again with
16 records remaining. Policies displayed all 17 baseline assessments with the
correct reported-existing/missing/confirmation distinctions. Switched to Globex,
entered a different draft response, and returned to Baseline QA's separate saved
summary. Its dashboard remained zero overdue/upcoming, with useful empty states.

Manual preservation of review fields, compliance storage values, calendar absence,
and backend permission failures were tested automatically, not through every
browser control. The complete flow was finalized for one new client; isolation
was checked using a second client's draft. Other module browser coverage remains
as described above. Legacy six-step drafts are not converted into the new draft;
existing policy and requirement records can prefill matching baseline responses.

## Client-specific compliance navigation — 2026-09-08

Navigation derives from the existing completed baseline and finalized requirement
records. Draft applicability changes do not alter it. Stable client/requirement
keys and the canonical five-entry catalog prevent duplicate sidebar items. No
onboarding, backend, authentication, or permission code changed.

All 33 frontend tests and the production build pass (the same eight existing lint
warnings remain). Automated checks cover draft versus finalized selections,
repeat completion, changed applicability, no applicable requirements, client
isolation, direct page rendering, retained existing links, and load errors.

Browser checks: selected HIPAA, ISO 27001, and CMMC as Applies for Baseline QA;
confirmed CMMC absent before completion and all three present afterward. Opened
each empty page, refreshed the CMMC route, finalized again, and confirmed one
link per requirement. CIS IG1 (Does Not Apply) and NIST CSF 2.0 (Unsure) stayed
hidden. Globex displayed only the unchanged original navigation. Changes from
Applies to other answers were tested automatically. Pages are intentionally empty
shells; detailed compliance functionality is not implemented.
