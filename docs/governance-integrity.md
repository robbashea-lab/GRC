# Governance integrity release

## Scope

Implements the five prioritized product-review fixes without redesigning the application. The hosted Sites build remains an explicitly isolated, session-local demo. Publishing it does **not** deploy the FastAPI service or enforce backend safeguards on an older production deployment.

## Access and decisions

- Super administrators retain global access. Platform administrators with a non-empty client allowlist are restricted to that list; an empty list retains the existing global-admin convention. Client roles never gain global access from an empty list. Client creation adds a scoped creator to the new client.
- Comments resolve and authorize their parent before reads/writes. Evidence validates its parent and client. Notifications and both digest paths recheck current access; disabled users do not receive digests.
- Normal and bulk updates share an editable-field contract. Protected approval, acceptance, validation, completion, and history fields cannot be set through ordinary edits or record creation.
- Platform roles approve policies/exceptions, accept risks/findings, and validate remediation. Risk acceptance is attributed to the authenticated actor and requires rationale plus future expiry; it cannot impersonate another approver.
- Policy verification can record reported external approval metadata. Its decision history explicitly identifies the recording actor and labels this as external metadata, not an in-app approval.
- Finding validation requires pending-validation status, no outstanding remediation tasks, and a rationale. Task completion alone does not constitute validation.
- Existing bulk completion/approval shortcuts now return validation errors. Open the record and use its decision action instead.

## Operational behavior

- Risk and Vendor drawers receive their schemas, current client, and user choices. Regression tests exercise the real drawers from their registers.
- Closed-status definitions, numeric risk bands, and short Review playbooks are shared in `frontend/src/lib/grcRules.json`. The Python service loads that file via `backend/grc_rules.py`; backend deployments must include it at that relative repository path.
- Findings pending validation remain open. Matching remediation deadlines/owners are represented by their tasks, while distinct task deadlines remain visible. My Work recognizes the Review reviewer even when its owner differs.
- Unscheduled Reviews and unassessed Risks remain actionable. Date-only overdue checks use calendar days rather than treating today's midnight as already overdue in the main summaries.
- Only valid numeric 1–5 likelihood/impact values produce risk scores. Legacy text ratings are retained, shown for context, and treated as unassessed rather than silently converted. No production backfill has been run.
- Risk acceptance expiry is independent of routine review dates. Marking a legacy accepted Risk reviewed first preserves its existing acceptance deadline.
- Board report risk selection uses numeric scoring and includes pending-validation Findings. Report totals are no longer calculated from lists capped at 50.

## Review history and minimum evidence support

- Completion requires tested scope, period, conclusion, and confirmation of a short, versioned checklist. Evidence is required unless the user records a reason it is unnecessary.
- Completion records the authenticated actor/time, checklist, and exact evidence IDs/versions. The backend also records file SHA-256 hashes.
- Completed Reviews cannot be edited, reopened, or deleted through ordinary or bulk actions. Corrections are attributed, append-only amendments; legacy completed Reviews are labeled as lacking structured provenance.
- A completion atomically records its successor plan and uses a deterministic, unique Mongo `_id` when materializing the next occurrence. Retrying completion repairs a missing successor without another completion decision. The original is not copied with its historical evidence or conclusion into the new occurrence.
- Evidence linked to a completed outcome is retained. Ordinary backend evidence removal archives its inventory entry rather than erasing its bytes, preserving recoverability if removal races completion. Existing download authorization still applies. There is no automatic purge or retention-period policy in this change.
- Evidence remains one artifact per upload. Full multi-parent reuse, revision replacement UI, and framework mapping are later recommendations, not claimed as implemented here.

## Verification and deployment

- Tests use isolated in-memory Mongo and mocked email delivery; no production database, messages, or external API workflows are used.
- Frontend checks cover existing onboarding/navigation behavior, real Risk/Vendor drawers, decision rejection, completion/evidence retention, and outstanding-work rules.
- Backend checks cover cross-client comments/evidence, scoped admins, forged normal/bulk decisions, risk scoring and expiry, recurrence recovery, amendments, evidence retention, validation, and revoked-access digests.
- Preserve the repository structure when deploying the backend. New optional fields are additive; historical records remain readable without manufactured provenance. Deploy frontend/backend contracts together outside the demo.
- Existing six React Hook dependency lint warnings predate this release. The production build succeeds with those warnings.

## Deliberately not included

No new Controls module, large framework matrix, workflow designer, broad permission builder, AI decisions, procurement features, production data migration, or backend infrastructure deployment. The later recommendations require separate scope approval.
