# Assessment Findings tabs verification

PR #43 changes assessment presentation only. The shared tabs are Requirement & implementation (default), Assessment criteria, and Findings. Existing Findings components, creation commands, request identities, permissions, and completion/validation rules are reused. Removed footer panels do not remove stored ownership, evidence relationships, or history. ISO applicability, justification, and audit workpaper fields remain.

## Verified locally, 2026-10-05

- Application source: `1fdb7bb86f1c5dae2f1d79a22998042b8e485431`; final test corrections: `d1134f2a6973c14948a78a016a9c9a6bd9629f09`.
- Frontend: CRACO/Jest with `CI=true`, `--watchAll=false --runInBand --runTestsByPath`: AssessmentLayout, BrawndoCisAssessment, PrestigeSocAssessment, IsoAssessment, IsoAuditWorkspace, AssessmentShell, FindingRemediationDrawer, RemediationUX, remediationTickets, assessmentVerification, isoAssessmentSave: **340 tests in 11 suites passed**. FrameworkOperator and BrawndoCisFindings: **9 tests in 2 suites passed**.
- Backend: `python -m unittest test_remediation_tickets test_framework_governance test_iso_audit_program` with backend and backend/tests on PYTHONPATH: **40 tests passed**, using isolated mocked persistence and real route logic.
- Builds: `node scripts/staging.cjs` and `node scripts/preview.cjs build` passed. Existing bundle-size advisories and test-mock React event warnings remain.
- Independent review of both commits found no blocking defect. Requested SOC history assertions and ISO audit draft coverage were corrected and rereviewed.

## Browser evidence

Disposable loopback MongoDB 8.0.28 and the normal FastAPI/Render wrapper served the staging build. Fictional local clients exercised CIS IG1, IG2, IG3, SOC 2, ISO ISMS requirements, SoA, Annex A, and internal-audit workpapers. Every variant passed tab order/default selection, assessment/checklist/Finding draft round trips, and explicit save checks. SoA justification persisted into the Annex A assessment. Keyboard tab navigation, Escape draft protection, and source focus return were observed.

Normal and browser-local Demo Finding creation appeared immediately in Action Items. Work completion required administrator validation; completed tickets remained retrievable from the source Findings tab. Action Item edits were visible through the linked authoritative ticket. Existing unit/route tests cover retry identity, repeated clicks, reopening, history, evidence, and validation constraints.

Demo used the established fictional clients and ordinary implementation-group configuration. Both light and dark views were inspected; a 390 × 844 dark audit Findings form had no horizontal overflow. A digest comparison confirmed normal MongoDB clients, assessments, Findings, Tasks, and Reviews were unchanged by Demo edits.

Four disposable local identities verified server permissions: read-only and unassigned contributor assessment/Finding writes returned 403; client manager and assigned service-provider administrator assessment writes succeeded; all four were denied access to an unassigned client; logout invalidated each session. No staging login account was created or enabled.

## Remaining release verification

- Configured `python -m pytest -c backend/pytest.ini -q backend/tests/test_remediation_tickets.py backend/tests/test_framework_governance.py backend/tests/test_iso_audit_program.py` failed before collection because `test_dashboard_work_queue.py` is unclassified. PR #41 owns the suite-classification/release-gate reconciliation; this change does not bypass it.
- DOM automation initially failed to populate the unchanged native Finding target-date input. Native accessibility setValue succeeded: 2026-12-20 survived a tab round trip and the created Demo ticket displayed that due date and the supplied description. No application change was necessary.
- Final main reconciliation, required GitHub gates, merge, Render deployment, and private-preview publication are pending release coordination. Local browser results are not hosted verification. Hosted source, preview version, access settings, and representative workflows must be confirmed after publication.
- No recording was available in the accessible task attachments; the explicit requested structure was used as the reference.
