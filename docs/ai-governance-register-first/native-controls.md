# Shared AI register native controls

Robb approved the visible header-row exception on 2026-10-27. The shared AI register restores the original nine `ColumnControl` menus inside one header cell spanning the existing six presentation columns. It does not use a More controls disclosure, add body columns or keep a separate legacy table for unenrolled clients.

The existing `useTableControls` owns menu options, sorting, filtering and actor/client session state. Apply it once after the existing search, quick-view and active/inactive population rules. Native `TableFilterChips` stays visible with zero matches; removing one chip affects only that filter. Its Clear all removes table filters and sorting while preserving the independent search and quick view. Preferences remain in memory; no durable browser preference store, URL state or data migration is added.

Generic clients retain saved-field search, saved-alert attention and the original Inactive-only destination (suspended/retired records). Earlier shared-framework clients retain their approved derived screening/attention rules and include-inactive checkbox. Verified enrollment may replace an obsolete Inactive-only selection with All active; transient loading must not reset it. This is a native capability distinction, not a client-name exception or a condition for accessing guided onboarding.

The four cards, existing quick views, six presentation columns, native expansion/full record, profile, tool picker, autofill, screening, linked Risk, Save/Cancel and permission guards remain authoritative. Viewing, sorting and filtering perform no writes. No approval, score, date, history, seed, account or access change is part of this correction.

`AINativeControls.test.jsx` exercises the real page/controller/Radix menus across Demo and authenticated contexts, including empty values, date/rank filters, combined constraints, reset semantics, stale/client/member identity, read-only boundaries and later enrollment. Full native authenticated browser, visual/zoom, exact-head CI, both builds and hosted deployment are separate evidence gates; mocked contexts do not certify them.

Agent007 is the sole integration and release coordinator. Candidate-specific receipts and the current handoff are in this task's `outputs/QA009-New-Client-Visuals-20261027/approved-ai-header-20261027/`. The prior authenticated QA startup rejection remains unresolved and is not bypassed by this implementation. No main merge or production deployment is authorized.
