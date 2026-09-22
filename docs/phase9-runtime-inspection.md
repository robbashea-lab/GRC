# Phase 9 — runtime inspection

2026-09-22, before deployment changes.

## Confirmed infrastructure

- Frontend: owner-private Sites static build; published Demo-only. Sign In is
  deliberately disabled and standard requests blocked in the preview build.
- Dedicated Railway project: Omnisciente Development
  (`cc2a2570-6bb4-4c1c-a360-fb11473db43c`), created 2026-09-15.
  Railway's environment is named `production`; the project is the established
  development/staging environment, not the older iVenture GRC Test project.
- API: FastAPI Dockerfile service; GitHub robbashea-lab/GRC/main, explicitly
  pinned to old commit 2db6afdd5b6775a20c53aded709c35d4f3c5840f.
- MongoDB: running service, private networking and existing 500 MB persistent
  volume mounted at /data/db. No database reset or volume change is authorized.
- Runtime variable names exist for MongoDB, JWT, hashed bootstrap account,
  CORS and initialization settings. Connector redacts values. No secrets are
  copied into source, frontend or this report.
- Backend uses bcrypt, JWT and an existing OAuth session exchange. Current
  password login normalizes email; authorization reloads the User from storage.
- Invitations depend on the existing email integration; no email credentials
  or APP_BASE_URL are listed for this development API. Real delivery not verified.
- Board PDF uses the backend's local ReportLab implementation.
- Local Docker/Mongo binaries and listeners were not present during inspection.

## Objective defects found

1. Docker image/context omitted onboardingHandoffFields.json, required by the
   Phase 5 handoff endpoint. Add only that existing catalog and a packaging test.
2. A legacy client-management test's internal-user fixture omitted active status,
   inconsistent with authoritative assignment eligibility from Phase 4B.
   Correct the fixture, not application permissions or assertions.

The stale deployment must be updated to tested source before claiming persistent
verification of Phases 7/8. Preview publication alone does not update FastAPI.
Uncertain or historical credentials are not used as an authentication bypass.
