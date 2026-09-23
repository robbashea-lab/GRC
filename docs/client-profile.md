# Persistent Client Profile

## Ownership and routes

`/client-profile` replaces the permanent Onboarding and Client Settings navigation entries.
Incomplete clients use the existing four-step onboarding component. Completion returns
to the profile, not another wizard. Optional enrichment is never required for operations.

Tabs: Overview, Organization, Technical Environment, Security & Data, Program
Configuration, People & Ownership. URL `tab` values preserve deep links.
`/onboarding` redirects to the profile; existing admin-only `/client-settings`
links redirect to People (default/users) or Program Configuration (compliance).
The previous Settings page's requirements summary and UsersTable are reused.

Client name, industry, primary Contact and GRC Lead remain existing Client fields.
Contacts & Roles owns business responsibilities; UsersTable owns account administration.
Systems, Vendors, Policies, Reviews, Evidence and assessments remain authoritative.
No profile selection creates a system, vendor, user, risk or assessment result.

## Data and permissions

The existing Client document receives optional `profile.organization`,
`profile.technical`, and `profile.security` fields. A shared bounded field catalog
drives the editor and strict backend section validation (enumerated selections,
bounded strings/arrays/counts, calendar dates, exclusive Unknown/None choices).
These are context fields, not compliance assessments.

GET/PATCH `/api/clients/{id}/profile` enforce existing tenant authorization.
Profile PATCH is restricted to the same super/platform-admin roles as Client edits,
requires the loaded client timestamp, and uses a conditional write. Core relationships
continue through the existing validated Client edit dialog. No memberships, invitations,
authentication, assignment eligibility or approval authority rules changed.

Program changes retain the existing backend writable-role contract (super admin,
platform admin, client contributor); the existing admin-managed configuration UI
remains admin-managed. Read-only and unrelated-client writes remain forbidden.

Profile updates and program changes use the existing audit log. Client edits now
include before/after values, including ownership. The profile shows the latest 50
relevant events; administrators retain the existing global Audit History link.

Demo has equivalent validation/state within its existing isolated session store.
It does not contact the standard backend or create a standard authenticated session.

## Baseline and migration

First completion captures `initial_program_baseline` once: saved intake, completion
timestamp/actor, actual Policy/Review counts and existing relationship IDs.
Subsequent configuration or profile updates never overwrite it.

Existing completed baseline clients retain saved intake as explicitly labeled legacy
history. The earlier six-step workflow's authoritative onboarding-complete audit event
also establishes completion. Missing historical facts are not reconstructed from
current records. A subsequent legacy intake write freezes the prior record first.
Missing enrichment fields read as Not provided; Unknown, No and Not Applicable remain
different values. No startup migration, deletion, reseeding or forced re-onboarding.

## Program changes

Applicability changes show an impact confirmation and call the existing onboarding
reconciliation service. Implemented frameworks reuse/initialize their existing
assessment and mapped Review architecture; existing operational data is retained.
CMMC currently exposes its existing placeholder only. The confirmation explicitly
does not promise SSP, POA&M or detailed assessments.

Retired maps to non-applicable operational scope and records previous/new state,
reason, effective date, actor and timestamp. Effective dates must be on/before today;
this is an immediate change, not a future scheduler. Retained framework workspaces
remain linked from Program Configuration. Existing recurring Reviews are not cancelled:
retirement removes the active framework driver, not independent work obligations.

## Context, not compliance

Completeness is the unweighted proportion of eight recommended context fields answered:
employee count, headquarters country, workforce model, IT management, cyber insurance,
identity platforms, cloud platforms, and data types. Unknown/blank do not count;
explicit No/None and zero employees are recorded answers. It has no effect on posture.

CUI/CMMC and PHI/HIPAA mismatches produce informational applicability-review prompts
only. No automatic regulatory determination or applicability change occurs.

## Verification and limits

Backend tests exercise actual FastAPI authentication/authorization and conditional
writes against an isolated in-memory database, not the persistent staging database.
Tests cover validation, stale edits, foreign tenants, member write denial, immutable
baseline, audit-only legacy completion, retirement/history and reactivation.
Frontend tests cover Demo parity, field validation, completeness and impact confirmation.

Local production-preview browser checks cover new client creation and all onboarding
steps; enrichment/save/refresh; existing GRC Lead selection; CMMC placeholder and ISO
initialization; retirement without Review/history loss; baseline stability; legacy
routes; all five existing clients; 1440/1280/1024/768 layouts and operational route smoke
checks. No browser page errors observed. No standard-backend live-browser or persistent
database restart claim is made.

Final local results (2026-09-23): 348 backend tests plus 254 subtests; 431 frontend
tests across 79 suites; configured lint zero errors with one existing warning;
production Demo build passed. Read-only client browser controls were also verified.

Configured lint/build retain the existing PlatformAdmin hook warning. An additional
broader CRA lint audit reports existing restricted-global confirm usages in unchanged
PlatformAdmin/RecordListPage; those unrelated changes were not made. No standalone
TypeScript check is configured in this JavaScript project.

Deferred: CMMC functionality not already implemented, automatic system/vendor
relationships or creation, insurance scheduling, legal applicability decisions,
and reconstruction of missing historical information.
