# Phase 8 verification — 2026-09-22

- 191 backend tests passed across 24 isolated suites (Mongo mock, real routes).
- 318 frontend tests passed across 57 suites.
- Production build passed; the same two pre-existing hook dependency warnings
  remain. No new packages, migrations, auth configuration or fictional seed data.
- Phase 8 Demo browser passed: external v1 submission/approval, generic v2
  version edit returning Draft, separate v2 approval, unchanged v1 snapshot,
  readable current/historical labels, real simulated-file upload, browser
  SHA-256 compared with Node's SHA-256, v3 uploaded-document approval and reload.
- Phase 7 Demo persona/security UX matrix passed again.
- Phase 6 operating-workflow browser regression passed again.
- No page/console errors in these browser runs.
- Backend tests additionally exercise archived Evidence byte retention, foreign
  tenant denial, rejection subject, legacy withdrawal, external-recording
  distinction, ordinary/bulk history tampering and Policy deletion protection.

| Severity | Location | Before | After | Reason |
| --- | --- | --- | --- | --- |
| Integrity | policy_provenance.py | Approval floated on mutable record | Exact submitted subject copied into each decision | History survives later version/content/identity changes |
| Clarity | PolicyApprovalSubject.jsx | No artifact basis | Uploaded hash or external document/version shown | Explain precisely what was approved |
| Clarity | PolicyApprovalPanel.jsx | Undifferentiated history | Current and historical subjects; legacy limitations explicit | Auditable without invented retroactive evidence |

Screenshot inspected at desktop width; changed controls use existing components,
neutral surfaces and restrained disclosure. No visual redesign or new animation.
Persistent restart, real multi-user browser authorization, external-document
content integrity and independent security review are NOT VERIFIED here.
External references are recorded text, never server-fetched; no SSRF surface added.
Legacy approvals remain legacy. No existing non-demo dataset was reset or migrated.

Withdraw-to-Draft is an explicitly audited non-approval action for existing
Policy writers, including legacy pending records without a valid submission
basis. It does not grant approval authority. Source/version configuration is
validated and current authority still checked for every approval.
