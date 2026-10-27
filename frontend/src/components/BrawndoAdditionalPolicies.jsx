import { ChevronRight, Search } from 'lucide-react';
import { PolicyAlignment } from './BrawndoPolicyDetails';
import { ColumnControl, TableFilterChips } from './TableControls';
import { policyStatus, policyStatusLabel, policyViewMatches } from '@/lib/brawndoPolicies';
import { policyOverview, policyVisualMatches, policyMappingPresentation, policyMappedFilterUnavailable } from '@/lib/brawndoAdditionalPolicyVendor';
import { AdditionalOwner, savedDate, relativePolicyDate } from './BrawndoAdditionalPolicyVendorCells';
import { personLabel } from '@/lib/people';
import { formatAcceptedRefresh } from '@/lib/acceptedRefreshPresentation';
import { Checkbox } from './ui/checkbox';
import { annualPolicyReview } from '@/lib/policiesConcept';
import './BrawndoAdditionalPolicyVendor.css';
import './PoliciesConcept.css';

const VIEWS = [['', 'All'], ['approved', 'Approved'], ['awaiting', 'Awaiting approval'], ['missing', 'Missing']];
const STATUS_ICONS = [
  <><path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6"/><path d="m8 15 3 3 5-6"/></>,
  <><path d="M13 2H5v20h7M13 2v6h6l-6-6Zm6 6v3"/><circle cx="16" cy="17" r="5"/><path d="M16 14v3l2 1"/></>,
  <><path d="M14 2H5v20h14V8l-5-6Zm0 0v6h5"/><path d="m9 12 6 6m-6 0 6-6"/></>,
];
const statusTone = status => status === 'approved' ? 'approved' : status === 'needs_creation' ? 'missing' : ['draft', 'in_review', 'pending_approval'].includes(status) ? 'awaiting' : 'other';

export default function BrawndoAdditionalPolicies({
  clientId, clientName = 'Client', rows = [], filteredRows = rows, reviews = [], users = [], programs = [], assessments = [], cisGroup = 1, frameworkKeys = [],
  alignmentError = '', loading = false, error = '', onRetry, q = '', onSearch, view = '', onView,
  category = '', onCategory, onClear, table, onOpen, onOpenReview, onAlignment, actions, pendingDecisions, nativeControls,
  selectedIds, onToggle, onSelectAll, rowActions,
  theme = 'light', acceptedRefresh = null, refreshing = loading,
}) {
  const overview = policyOverview(rows, reviews, programs, assessments, cisGroup);
  // Enrollment labels remain known after an alignment read fails; they never supply mapping counts.
  const mapping = policyMappingPresentation(programs.length ? programs : frameworkKeys, cisGroup);
  const mappingUnavailable = policyMappedFilterUnavailable(view, alignmentError, programs, frameworkKeys, !!table?.state?.filters?.alignment?.length);
  const visible = mappingUnavailable ? [] : filteredRows.filter(row => policyVisualMatches(row, view, category, programs, assessments, cisGroup));
  const count = id => rows.filter(row => policyViewMatches(row, id) && policyVisualMatches(row, id, '', programs, assessments, cisGroup)).length;
  const figures = [
    ['approved', 'Approved', overview.approved], ['awaiting', 'Awaiting approval', overview.awaiting],
    ['missing', 'Missing', overview.missing], ['mapped', mapping.mappedLabel, alignmentError ? null : overview.mapped],
  ];
  const { review, lastClosed } = annualPolicyReview(reviews, clientId || rows[0]?.client_id);
  const unavailable = loading || !!error;
  const reviewDate = { next_review_date: review?.due_date };
  const reviewTone = policyViewMatches(reviewDate, 'overdue') ? 'bad' : policyViewMatches(reviewDate, 'due30') ? 'warn' : '';
  const refreshLabel = !refreshing && !error ? formatAcceptedRefresh(acceptedRefresh) : '';
  const header = (key, label) => table ? <ColumnControl table={table} column={{ ...table.columns.find(column => column.key === key), key, label }} /> : label;
  const clear = onClear || (() => { onSearch?.(''); onView?.(''); onCategory?.(''); table?.clear(); });

  return <div className="brawndo-additional bap-page policies-concept" data-theme={theme} data-testid="additional-policies">
    <div className="bapv-page-head"><div><h1>{clientName} Policies</h1><p>Policy register · {refreshing ? 'Loading policies…' : error ? 'Policies unavailable' : `${rows.length} ${rows.length === 1 ? 'policy' : 'policies'}`}{refreshLabel && ` · As of ${refreshLabel}`}</p></div><div className="bapv-head-actions">{actions}</div></div>
    <section className="pc-overview" aria-label="Policy overview">
      <div className="bap-status">
        <h2 id="bap-status-heading">Policy status</h2>
        <div className="pc-status-cards">
          {figures.slice(0, 3).map(([id, label, value], index) => {
            return <button type="button" className={`pc-status-card ${id}`} key={id} aria-pressed={view === id} disabled={unavailable} onClick={() => onView?.(view === id ? '' : id)} data-testid={`additional-policy-metric-${id}`}><span className="pc-status-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{STATUS_ICONS[index]}</svg></span><span className="pc-card-copy"><strong>{unavailable ? '—' : value}</strong><b>{label}</b><small>{unavailable ? '—' : `of ${rows.length} ${rows.length === 1 ? 'policy' : 'policies'}`}</small></span></button>;
          })}
        </div>
        <div className="pc-approval-track" role="img" aria-label={unavailable ? 'Policy status unavailable' : `${overview.approved} of ${rows.length} policies approved`}><span style={{width: unavailable || !rows.length ? '0%' : `${overview.approved / rows.length * 100}%`}} /></div>
        <div className="pc-status-foot"><span>{unavailable ? '—' : <><strong>{overview.approved} of {rows.length}</strong> policies approved</>}</span><button type="button" className="pc-mapping" data-testid="additional-policy-metric-mapped" aria-pressed={view === 'mapped'} disabled={unavailable || !!alignmentError} onClick={() => onView?.(view === 'mapped' ? '' : 'mapped')}>{mapping.mappedLabel}: <strong>{unavailable || alignmentError ? '—' : `${overview.mapped} of ${rows.length}`}</strong></button></div>
      </div>
      <div className="bap-review" aria-labelledby="bap-review-heading">
        <div className="bap-review-top"><h3 id="bap-review-heading">Annual policy review</h3>{review && !unavailable && <button type="button" className="bapv-link" onClick={() => onOpenReview?.(review)}>Open in Reviews <span aria-hidden="true">↗</span></button>}</div>
        <div className="bap-review-date"><strong>{unavailable ? '—' : savedDate(review?.due_date) || 'Not scheduled'}</strong><small className={reviewTone}>{unavailable ? '—' : review ? `Next review · ${relativePolicyDate(review.due_date).toLowerCase()}` : 'No active linked policy review'}</small></div>
        <dl><dt>Last reviewed</dt><dd>{unavailable ? '—' : savedDate(lastClosed) || 'Not recorded'}</dd><dt>Assigned to</dt><dd>{unavailable ? '—' : review ? personLabel(users, review.owner_id) : 'Unassigned'}</dd></dl>
      </div>
    </section>
    {(pendingDecisions || nativeControls) && <div className="pc-native-toolbar" aria-label="Native policy controls">{pendingDecisions}{nativeControls}</div>}
    <section className="bapv-card" aria-label="Policy register">
      <div className="bapv-filters">
        <label className="bapv-search"><span className="sr-only">Search policies</span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search policies…" value={q} onChange={event => onSearch?.(event.target.value)} data-testid="policies-search" /></label>
        <div className="bapv-segment" role="group" aria-label="Show policies">{VIEWS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} disabled={unavailable} onClick={() => onView?.(id)} data-testid={`additional-policy-view-${id || 'all'}`}>{label}<span>{unavailable ? '—' : count(id)}</span></button>)}</div>
        <label className="bapv-field">Category <select value={category} onChange={event => onCategory?.(event.target.value)} aria-label="Policy category"><option value="">All</option>{[...new Set(rows.map(row => row.category).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      {table && <TableFilterChips table={table} />}
      {error && <div className="bapv-empty" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Retry</button></div>}
      <div className="bap-table" role="table" aria-label="Policies" data-has-selection={!!onToggle}>
        <div className="bap-row bap-header" role="row">{onToggle && <div role="columnheader" className="bap-selection"><Checkbox aria-label="Select all policies" checked={visible.length > 0 && visible.every(row => selectedIds?.has(row.policy_id)) ? true : visible.some(row => selectedIds?.has(row.policy_id)) ? 'indeterminate' : false} onCheckedChange={onSelectAll} /></div>}<div role="columnheader">{header('title', 'Policy')}</div><div role="columnheader">{header('alignment', mapping.alignmentHeading)}</div><div role="columnheader">{header('status', 'Status')}</div><div role="columnheader">{header('owner_id', 'Owner')}</div><div role="columnheader">{header('last_reviewed_at', 'Last review')}</div><span aria-hidden="true" /></div>
        {loading && <div className="bapv-empty" role="status">Loading policies…</div>}
        {!loading && !error && !visible.length && <div className="bapv-empty" role={mappingUnavailable?'alert':undefined}><h3>{mappingUnavailable?'Policy mappings unavailable':'No policies match'}</h3><p>{mappingUnavailable?'The saved mapping filter cannot be evaluated. Clear filters to view saved policies.':'Try a different search or filter.'}</p><button type="button" onClick={clear}>Clear filters</button></div>}
        {!loading && !error && visible.map((row, index) => {
          const status = policyStatus(row);
          return <div className="bap-row" role="row" key={row.policy_id} onClick={() => onOpen?.(row)} data-testid={`policies-row-${index}`}>
            {onToggle && <div role="cell" className="bap-selection" onClick={event => event.stopPropagation()}><Checkbox aria-label={`Select ${row.title}`} checked={selectedIds?.has(row.policy_id) || false} onCheckedChange={() => onToggle(row.policy_id)} /></div>}
            <div role="cell" className="bap-item"><button type="button" className="bapv-name" onClick={event => { event.stopPropagation(); onOpen?.(row); }}>{row.title}</button>{row.category && <div className="bapv-meta">{row.category}</div>}</div>
            <div role="cell" className="bap-alignment">{alignmentError || <PolicyAlignment record={row} programs={programs} assessments={assessments} cisGroup={cisGroup} onOpen={onAlignment} />}</div>
            <div role="cell" className="bap-state"><span className={`bap-state-label ${statusTone(status)}`}><i />{policyStatusLabel(status)}</span><small>{row.version ? `Version ${row.version}` : 'Version not recorded'}{status === 'approved' && row.approved_at ? ` · ${savedDate(row.approved_at, true)}` : ''}</small></div>
            <div role="cell" className="bap-owner"><AdditionalOwner users={users} id={row.owner_id} /></div>
            <div role="cell" className="bap-last"><span>{savedDate(row.last_reviewed_at) || 'Not recorded'}</span><button type="button" onClick={event => { event.stopPropagation(); onOpen?.(row); }} title="Open the full policy and its review schedule">Next: {savedDate(row.next_review_date, true) || 'Not scheduled'}</button></div>
            {rowActions ? <div className="bap-row-actions" role="cell" onClick={event => event.stopPropagation()}>{rowActions(row, index)}</div> : <ChevronRight className="bapv-chevron" size={16} aria-hidden="true" />}
          </div>;
        })}
      </div>
      <div className="bapv-summary bap-summary"><span className="bap-summary-left"><span role="status">{unavailable ? error ? 'Policy counts unavailable.' : 'Loading policies…' : mappingUnavailable ? 'Policy mapping counts unavailable.' : `Showing ${visible.length} of ${rows.length} ${rows.length === 1 ? 'policy' : 'policies'}`}</span>{view && <button type="button" className="bapv-filter-chip" onClick={() => onView?.('')}>{figures.find(item => item[0] === view)?.[1] || view} ×</button>}</span><span>{selectedIds?.size ? `${selectedIds.size} selected` : 'Select a policy to open its record.'}</span></div>
    </section>
  </div>;
}
