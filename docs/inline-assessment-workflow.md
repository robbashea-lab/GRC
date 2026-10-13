# Inline assessment workflow

Scope: the shared individual assessment workflow for CIS IG1–IG3, SOC 2, and ISO 27001. The interview lives inside Requirement summary. Current implementation contains the reviewed paragraph and Controls in place bullets; Items to address holds working follow-up. Dashboard/program OmniBot recommendations, canonical content, framework scope, independent verification, and native Finding/Action workflows remain separate.

## Implementation and persistence

Interview progress retains the existing `guided_assessment_pilot` collection, question versions, per-user revisions, base assessment/scope fingerprints, and interview history. Saving progress does not commit a native assessment. Applying the final reviewed summary uses the existing native assessment PATCH and reconciles Items from validated answers against the current framework-specific question semantics. Client-submitted result signals/text do not determine task origins.

Date-sensitive CIS results optionally record `result.evaluation_date` as the browser-local calendar day actually used by the existing evaluator. New dates must be valid `YYYY-MM-DD` values within one day of the server's UTC completion day. Unchanged answers retain an already known day across resumed saves. Replaying the same version, answers, and evaluator output (allowing narrative wording edits) preserves its original `generated_at`; the save's `updated_at` and revision still advance. The existing own-application rebase can recover this clock only from the immediately preceding completed archived snapshot bound by server-native actor, version, answers, revision, and generation provenance. Changed evaluator fields or answers advance the generation clock.

Older snapshots without this metadata retain their known generation basis. Date-origin extraction compares the adjacent plausible local days around its UTC timestamp: unanimous conclusions retain the existing gap/non-gap outcome, while a boundary disagreement yields that question's existing confirmation template. Missing or invalid legacy timestamps also yield scoped confirmation. These clock fields do not participate in Item answer fingerprints or change native evaluator status rules.

`framework_assessments.items_to_address` stores stable opaque item IDs, question origin, gap/confirmation kind, text, source version/fingerprint, state (`open`, `resolved`, `superseded`), resolution notes, Finding link, timestamps, and attributed history. IDs derive from assessment identity plus originating question and kind; matrix origins aggregate every affected row. `items_revision` is an independent optimistic concurrency token, defaulting to zero for older records.

Unchanged answers preserve resolved state, notes, history, and links. Changed originating answers can reopen a continuing gap. Removed items become superseded without losing history; a later reintroduction opens the item while retaining its resolution history and Finding link. Checklist resolution does not update native implementation status, text, verification, or assessment dates.

## API and authorization

| Operation | Contract |
| --- | --- |
| `PUT /api/framework_assessments/{aid}/guided-assessment` | Existing interview progress/review contract; separate from native persistence. |
| `PATCH /api/framework_assessments/{aid}` | Existing reviewed guided provenance triggers server-side task reconciliation. Status, implementation, Items, and native history commit in one assessment-document update. No caller-supplied Items payload is accepted. |
| `PATCH /api/framework_assessments/{aid}/items/{item_id}` | `{expected_revision, state: "open" or "resolved", resolution}`; returns the full updated assessment. |
| `POST /api/framework_assessments/{aid}/findings` | Existing required Finding/Action fields and request identity, plus optional `item_id`. Explicit creation links the originating item and never resolves it automatically. |

Item edits use the existing native tenant, writable-role, assignment, and archived-client authorization boundaries. Originating items must belong to the authorized assessment. Native guided saves predicate both the native write token and Items revision; concurrent item edits cannot be overwritten or recorded as stale state in a successful native save. Existing SOC/ISO lease and guided lineage checks are retained. Interview and native-assessment writes remain separate operations; no cross-collection transaction is claimed.

Finding creation retains existing ownership validation, required fields, audit, Action creation, and durable request receipts. An assessment/item-specific Mongo `_id` prevents different actors or request intents from creating duplicate Findings for the same item. Interrupted creation can recover the original Finding/Action/link even if reassessment subsequently superseded the item; it cannot create a new Finding from a superseded origin.

## Existing data

This is additive storage. No bulk narrative rewrite, destructive migration, reset, or free-text checklist parsing is performed. Existing narratives, answers, criterion checks, evidence, relationships, permissions, and histories remain intact. New task reconciliation occurs only through a reviewed native guided save. Historical collection/component names remain for compatibility.

## Verification

Before the date-provenance follow-up, the focused offline Items suite passed 9 tests and 5,540 source-derived origin parity subtests across every current CIS, SOC 2, and ISO interview record. It covers answer choices, matrix rows, legacy frequency/date semantics, whitespace, forged result metadata, reconciliation, native CAS, authorization, duplicate Finding intents, and interrupted recovery. The focused Demo Items suite passed 3 tests. These are isolated/API-modeled and Demo evidence, not hosted persistence proof.

The date follow-up's three focused backend regressions passed: two actual API cases cover bounded/invalid metadata, known snapshot retention, native-bound archived replay, mismatched provenance, legacy wording-only replay, resolution-note preservation, and changed-answer clock advancement; one pure case covers the reproduced UTC/New York day boundary and conservative legacy ambiguity. Full final-source parity, frontend, and browser verification remain part of the final gate.

From the repository root, with the project's existing runtime/test dependencies:

```powershell
python -m pytest -c backend/pytest.ini -n 0 -q backend/tests/test_assessment_items.py
```

From `frontend`, with `CI=true`:

```powershell
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand src/preview/assessmentItems.test.js src/components/PlatformCisNativeGuideRefresh.test.jsx src/components/PlatformCisMinimizedNativeGuide.test.jsx
```

The existing disposable Mongo runner includes all `AssessmentItemsTests` API cases and one additional reconnect case in its default suite. The reconnect case verifies Items, resolution notes/history, native fields, exact Finding receipt replay, and one retained Finding/Action using a fresh database connection. Pure reconciliation/parity tests remain in the offline suite. Invoke `backend/scripts/verify_mongo_recovery.py` with its mandatory `--mongo-url` pointing to the deliberately started loopback test Mongo instance; its existing generated-database cleanup boundary is unchanged.

CI 155 at commit `5abf` passed the full frontend suites and builds, backend offline tests, the disposable Mongo runner including the new Items cases, and the release gate. The date-provenance follow-up, final integration/merge, and final browser/lifecycle gate remain pending. Hosted authentication and production persistence are unverified; no deployment claim is made by this document.
