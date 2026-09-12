# Shared table investigation controls

This is a presentation-only enhancement. No API contracts, models, permissions, scores, lifecycle transitions, record mutations, navigation, or business metrics have changed.

## Architecture

- `tableFilters.js`: pure calendar-date predicates, stable null-last sorting, multi-value matching (OR within a column, AND across columns), and the shared Review preset predicate.
- `tableColumns.js`: column capabilities and display accessors for existing registers. Schema-backed tables reuse `SCHEMAS` options. Other choices come from authorized records already loaded by the module; no additional tenant/user lookup is performed.
- `TableControls.jsx`: session state, small portaled Radix header menus, individual removable chips, clear-all, and filtered empty states. Menus are non-modal and support keyboard navigation, Escape, and outside dismissal.
- Existing page renderers, row actions, exports, search, and quick-filter counts remain in place. Search and presets feed the shared precision-filter pass; explicit column sorting takes precedence over the original default ordering.
- Review quick presets and column statuses use `reviewMatches`. Selecting a precise status removes the conflicting quick status constraint. Quick presets replace the matching column constraint, while other precision filters remain additive.
- Audit Log uses a controlled adapter to the existing server-side query state, not filters applied to a single fetched page. Client, actor, action, entity and date controls share the toolbar state and retain existing authorization and pagination.

## Scope

Reviews, Findings, Tasks, Policies, Contacts & Roles, Requirements, Risk Register, Vendor Register, Action Items, Evidence, Client Management, Portfolio client table, and Users & Access use shared controls. Audit Log shares header menus and active chips with its existing server-backed filters. Dashboard operational tables receive sorting only.

Only existing columns are enhanced. Contact records are not converted into users. Evidence uses filename, MIME type, uploader email, upload date, and linked module; no unsupported statuses or metadata are added. Contract Renewal filtering uses the same renewal/expiration/end-date fallback as its displayed cell.

## Session and data boundaries

Column preferences are in-memory for the current account and client. They survive same-client module navigation. Changing account, client, or platform/client scope clears them before the next table renders. Refresh resets precision filters; existing URL-backed search, presets and deep links continue to work. There are no permanent saved views or new browser-storage records. Owner options enumerate only owners referenced by that client's loaded records, plus Unassigned; no unrelated account list is exposed. Client assignment options are bounded by the authorized client response.

## Deliberate limits

- Registers filter the authorized data already returned by their existing endpoints. This does not add new server pagination/search or remove existing endpoint limits.
- Audit facets remain single-choice within each category because the existing server query is single-choice. They combine across categories and with its existing custom date range. Event order remains the existing newest-first server order.
- Searchable option lists render at most 100 matching choices at once; no select-all or query builder.
- Dashboard has no precision-filter menus, saved views, column rearrangement or new reporting surfaces.
- Counts retain their prior dataset/preset meaning. Exports retain their existing scope rather than silently becoming filtered exports.

## Validation

Pure and component tests cover date boundaries, nulls, rank/numeric/text ordering, filter combinations, shared Review predicates, visible options, removable chips, clear-all, and account/client state reset. Browser checks exercise Reviews, Vendors, Risks and Action Items with isolated demo-session records, and smoke-test Policies, Contacts, Evidence, Client Management, Portfolio, Users and Audit. Browser checks also cover search, empty states, quick presets, same-client navigation, client switching, refresh, keyboard/Escape/outside dismissal and menu containment at normal desktop widths. No production records are used for QA.
