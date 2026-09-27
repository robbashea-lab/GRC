# Framework workspace operating model

## Scope and preservation

This change covers CIS IG1, ISO/IEC 27001 and SOC 2 only. Existing assessments,
organizational Controls, Evidence, Findings, Action Items and Reviews remain
authoritative. No sample reset, historical backfill or external publication is
part of this work.

## Presentation

One composable assessment shell owns the wide dialog, navigation, focus and
footer. Framework assessment content uses native status and reference metadata;
ISO audit content uses independent audit progress and results. Category tiles
are a navigation layer over the same searchable assessment records.

ISO exposes ISMS Requirements, Statement of Applicability and Internal Audit
Program. SoA applicability is separate from implementation state; existing
included/excluded storage tokens are retained for compatibility.

## Audit methodology and persistence

The supplied workbook has four packages containing 28, 28, 40 and 28 audit
items. Its dedicated 6.1.3(d) SoA check maps to clause 6.1.3, not an invented
additional requirement. Guidance is user-provided audit methodology, not
licensed ISO text. Workbook organization names, fixed dates, sample notes,
cached dashboard values and SharePoint placeholders are not imported.

Activation is explicit and prospective. Four ordinary recurring Reviews own
package schedules and assignments. Current audit item work belongs to those
Review records; completed occurrence snapshots preserve the cycle. Reviewed
and Conforming are different concepts. Completing an audit does not close its
remediation or update framework assessment conclusions.

No parallel Evidence, Finding, Action or recurrence engine is introduced.
Existing generic internal-audit Reviews and their history must not be silently
deleted or rescheduled. Client scope and normal server authorization apply to
all audit endpoints, references and completion.

## Delivery boundary

Validate locally using synthetic data. Push only the existing PR #6 branch.
Do not merge main, deploy Railway, publish ChatGPT Sites or update a hosted
preview.

## Local validation checkpoint (2026-09-27)

- Full frontend: 115 suites / 627 tests passed, including five-year coexistence
  and ten-year CIS simulations. Subsequent affected-component run: 34 passed.
- Isolated backend: 417 tests / 567 subtests passed. Includes five audit cycles,
  stale-write rejection, cross-client links, roles, evidence retention and
  future SoA occurrence snapshots.
- Browser (local Demo only): CIS category navigation and keyboard return;
  SOC 2 criterion search, native readiness statuses, evidence and remediation,
  Save & next / Previous; ISO clause vs Annex A views, 93-control SoA filters,
  independent applicability/status save and reload. ISO clause N/A is absent.
- Browser audit: explicit future activation, four prospective dates, workpaper
  progress/result independence, evidence linking, normal Finding + one Action,
  save/reload, draft warning, central Review linkage and premature closure
  rejection. Wide dialog inspected at 1440, 1024 and 768 CSS pixels. Keyboard
  traversal, Escape and opener restoration work; no captured console warnings.
- Optimized normal and Demo builds succeed. Existing PlatformAdmin hook warning,
  Node fs.F_OK deprecation and FastAPI on_event deprecations remain unrelated.
- Not an independent accessibility/compliance certification; native 200% browser
  zoom and a deployed persistent staging database were not validated here.
