# Vendor governance

## Scope and authoritative records

The register and existing drawer are retained. Vendor records describe the relationship; normal Reviews own recurring execution and immutable occurrences; Tasks own remediation; Risks own exposure; existing Evidence IDs link assurance and contracts. No separate findings, tasks, risk scores, procurement or CLM engine was added.

## Lifecycle and register

New records require name and Service / Product and start Onboarding. Starting the primary Review moves Onboarding to Under Review. An authorized user explicitly moves a reviewed relationship to Active; Review completion alone is not approval or certification. Active may return to Under Review or enter Offboarding. Offboarding may become Inactive. Optional offboarding dates create real one-time Reviews. Inactive Vendors retain their identity, evidence and relationships; future normal Vendor/Assurance/Contract Reviews are cancelled without deleting occurrences. Outstanding offboarding work can remain.

All Active includes Offboarding. Reviews Due uses actual primary obligations due within 90 calendar days, including overdue work. Critical, High, Security Assurance Due, Contracts Expiring and Inactive presets retain shared column filters/search. Four cards use the same signals. Contract and assurance warning windows default to 90 days. Last/Next Review project from actual linked Reviews; old date metadata is retained when no linked obligation exists, but does not pretend to be an operational Review.

## Scheduling and completion

`backend/vendor_governance.py` plans optional purposes and uses `review_occurrences` to schedule; it is not another recurrence engine. Deterministic IDs/upserts and a Vendor mutation lease protect the existing obligation. Multiple ambiguous active legacy obligations are reported instead of silently merged or removed. One primary Review accumulates completed occurrences. Linked Reviews open the existing Review drawer. Completion updates Vendor dates, leaves open remediation intact and preserves scheduled-date recurrence anchors.

Assurance Reviews are opt-in for distinct schedules. Same-date assurance is consolidated into the primary Review; prior separate occurrences remain. Assurance Review completion records review metadata, not a false evidence receipt or a new expiry date. Contract Reviews are explicitly enabled and one-time against the legal renewal date minus configured lead days (30/60/90 or another positive integer). March 25, 2027 minus 90 days is December 25, 2026. Completing one never changes legal renewal dates. Changing a legal date can reschedule the same obligation while retaining its occurrence history.

## Assurance, contracts, related work

Expected artifact types are selected per Vendor. No expectation means Not Required. Missing IDs or received/refresh dates means Missing; elapsed refresh dates mean Expired; the configured warning window means Due Soon; otherwise Current. Actual Evidence records are linked, not copied. SOC 2, ISO 27001, questionnaires, penetration-test summaries, cyber insurance, PCI and Other are supported. Current evidence is not a claim of security or compliance. Referenced evidence and inactive Vendor evidence cannot be archived away.

Contracts retain effective/renewal/expiration dates, auto-renewal, DPA/BAA/addendum flags, requirements, termination notes and Evidence IDs. No legal negotiation/signature workflows were added.

Create Action Item preselects and locks the Vendor source. Vendor Review Findings propagate Vendor, Review, occurrence and Finding IDs to the same Task. Existing Risks can be linked without replacing their originating source; new Risks use Vendor source. Both directions resolve the same records. Activity uses authorized record-scoped audit entries, not access to the platform Audit Log. Owner choices use client members; all related IDs are checked against the current client.

## Compatibility and rollout

`service` is the authoritative editable field and falls back to legacy `services`. Conflicting legacy text remains visible and is never erased. Legacy assurance summary/date fields remain visible as historical metadata; expectations are not inferred from them. Existing taxonomy and criticality values are preserved, with three explicit access classifications added. Legacy Terminated is presented as historical Inactive without deleting the stored value.

`backend/migrate_vendor_governance.py` is an explicit client-scoped dry-run by default. It requires an authorized administrator actor. `--apply` adopts eligible existing first-review dates through the normal guarded scheduler. Missing service/date/owner information and duplicate active obligations require administrator reconciliation. It never matches a Vendor by title/scope text, fabricates completion history, or runs automatically at startup. No production migration was run as part of the private demo publication.

Production remains FastAPI/MongoDB. The owner-private static preview remains the explicitly labeled browser-session demo and mirrors these workflows; it is not a backend deployment or production data migration.

## Validation

Automated backend coverage includes calendar-date contract lead times, repeated scheduling, recurring completion, historical retention, proportional assurance, forbidden client/owner/evidence references, contributor configuration restrictions, Finding→Task provenance, open remediation after Review completion, and optional assurance consolidation. Frontend tests cover the corresponding demo and register controls. Existing Risk, Review, Task, onboarding and governance regression suites are retained.

Browser QA uses isolated demo sessions for CloudCore creation, assurance upload/link, contract configuration, authoritative Task creation, Review completion, Offboarding/Inactive history, tenant switching, normal desktop widths and module routes. Final build QA is run against the static artifact that is packaged for the private preview. No QA artifacts, credentials or generated build output belong in Git.

## Deliberate limits

No automatic Vendor approval, universal assurance requirements, permanent saved views, document interpretation, compliance certification, procurement or full contract management. New Vendors may remain unscheduled until an authorized administrator chooses their first Review date. Ambiguous legacy duplicate obligations are not auto-merged. Assurance refresh due dates are explicit evidence-governance dates, not automatically renewed by completing a Review.
