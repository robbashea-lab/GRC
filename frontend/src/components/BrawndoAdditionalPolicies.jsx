import { ChevronRight, Search } from 'lucide-react';
import { PolicyAlignment } from './BrawndoPolicyDetails';
import { ColumnControl, TableFilterChips } from './TableControls';
import { policyStatus, policyStatusLabel, policyViewMatches } from '@/lib/brawndoPolicies';
import { policyOverview, policyVisualMatches } from '@/lib/brawndoAdditionalPolicyVendor';
import { AdditionalOwner, savedDate, relativePolicyDate } from './BrawndoAdditionalPolicyVendorCells';
import { personLabel } from '@/lib/people';
import { Checkbox } from './ui/checkbox';
import './BrawndoAdditionalPolicyVendor.css';

const VIEWS = [['', 'All'], ['approved', 'Approved'], ['awaiting', 'Awaiting approval'], ['missing', 'Missing']];
const statusTone = status => status === 'approved' ? 'approved' : status === 'needs_creation' ? 'missing' : ['draft', 'in_review', 'pending_approval'].includes(status) ? 'awaiting' : 'other';
const STATUS_BAR_ORDER = { approved: 0, awaiting: 1, missing: 2, other: 3 };

export default function BrawndoAdditionalPolicies({
  rows = [], filteredRows = rows, reviews = [], users = [], programs = [], assessments = [], cisGroup = 1,
  alignmentError = '', loading = false, error = '', onRetry, q = '', onSearch, view = '', onView,
  category = '', onCategory, onClear, table, onOpen, onOpenReview, onAlignment, actions, pendingDecisions, nativeControls,
  selectedIds, onToggle, onSelectAll, rowActions,
  theme = 'light',
}) {
  const overview = policyOverview(rows, reviews, programs, assessments, cisGroup);
  const statusRows = [...rows].sort((a, b) => STATUS_BAR_ORDER[statusTone(policyStatus(a))] - STATUS_BAR_ORDER[statusTone(policyStatus(b))]);
  const visible = filteredRows.filter(row => policyVisualMatches(row, view, category, programs, assessments, cisGroup));
  const count = id => rows.filter(row => policyViewMatches(row, id) && policyVisualMatches(row, id, '', programs, assessments, cisGroup)).length;
  const figures = [
    ['approved', 'Approved', overview.approved], ['awaiting', 'Awaiting approval', overview.awaiting],
    ['missing', 'Missing', overview.missing], ['mapped', `Mapped to CIS IG${cisGroup}`, alignmentError ? null : overview.mapped],
  ];
  const review = overview.review;
  const reviewDate = { next_review_date: review?.due_date };
  const reviewWarning = policyViewMatches(reviewDate, 'overdue') || policyViewMatches(reviewDate, 'due30');
  const header = (key, label) => table ? <ColumnControl table={table} column={{ ...table.columns.find(column => column.key === key), key, label }} /> : label;
  const clear = onClear || (() => { onSearch?.(''); onView?.(''); onCategory?.(''); table?.clear(); });

  return <div className="brawndo-additional bap-page" data-theme={theme} data-testid="additional-policies">
    <div className="bapv-page-head"><div><h1>Brawndo Policies</h1><p>Policy library · {rows.length} {rows.length === 1 ? 'policy' : 'policies'}</p></div><div className="bapv-head-actions">{actions}</div></div>
    <section className="bapv-card bap-overview" aria-labelledby="bap-status-heading">
      <div className="bap-status">
        <div><h2 id="bap-status-heading">Policy status</h2><p className="bapv-sub">{rows.length} {rows.length === 1 ? 'policy' : 'policies'} in the Brawndo register. Select a figure to filter.</p></div>
        <div className="bap-status-bar" role="img" aria-label={loading ? 'Loading policy status' : `${overview.approved} approved, ${overview.awaiting} awaiting approval, ${overview.missing} missing, ${rows.length - overview.approved - overview.awaiting - overview.missing} other recorded states`}>
          {!loading && statusRows.map(row => <i key={row.policy_id} className={statusTone(policyStatus(row))} title={`${row.title}: ${policyStatusLabel(policyStatus(row))}`} />)}
        </div>
        <div className="bap-legend"><span><i className="approved" />Approved {overview.approved}</span><span><i className="awaiting" />Awaiting approval {overview.awaiting}</span><span><i className="missing" />Missing {overview.missing}</span>{rows.some(row => statusTone(policyStatus(row)) === 'other') && <span><i className="other" />Other recorded states</span>}</div>
        <div className="bapv-kstrip" aria-label="Policy summary. Select a figure to filter the register.">
          {figures.map(([id, label, value]) => <button type="button" className="bapv-kcell" key={id} aria-pressed={view === id} disabled={id === 'mapped' && !!alignmentError} onClick={() => onView?.(view === id ? '' : id)} data-testid={`additional-policy-metric-${id}`}><span>{label}</span><strong>{loading || value === null ? '—' : value}{['approved', 'mapped'].includes(id) && <em>of {rows.length}</em>}</strong></button>)}
        </div>
      </div>
      <div className="bap-review" aria-labelledby="bap-review-heading">
        <div className="bap-review-top"><h3 id="bap-review-heading">{review?.recurrence === 'annual' ? 'Annual policy review' : 'Policy review'}</h3>{review && <button type="button" className="bapv-link" onClick={() => onOpenReview?.(review)}>Open in Reviews <span aria-hidden="true">↗</span></button>}</div>
        <div className="bap-review-date"><strong>{loading ? '—' : savedDate(review?.due_date) || 'Not scheduled'}</strong><small className={reviewWarning ? 'warn' : ''}>{review ? `Next review · ${relativePolicyDate(review.due_date).toLowerCase()}` : 'No active linked policy review'}</small></div>
        <dl><dt>Last closed</dt><dd>{savedDate(overview.lastClosed) || 'Not recorded'}</dd><dt>Covers</dt><dd>{review ? `${overview.covered.length} of ${rows.length} policies` : 'No linked membership'}</dd><dt>Assigned to</dt><dd>{review ? personLabel(users, review.owner_id) : 'Unassigned'}</dd></dl>
        {review && <p className="bap-review-note">{review.title}{overview.scheduledCount > 1 ? ` · ${overview.scheduledCount} active linked reviews` : ''}</p>}
      </div>
    </section>
    {pendingDecisions}
    <section className="bapv-card" aria-label="Policy register">
      <div className="bapv-filters">
        <label className="bapv-search"><span className="sr-only">Search policies</span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search policies…" value={q} onChange={event => onSearch?.(event.target.value)} data-testid="policies-search" /></label>
        <div className="bapv-segment" role="group" aria-label="Show policies">{VIEWS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => onView?.(id)} data-testid={`additional-policy-view-${id || 'all'}`}>{label}<span>{loading ? '' : count(id)}</span></button>)}</div>
        <label className="bapv-field">Category <select value={category} onChange={event => onCategory?.(event.target.value)} aria-label="Policy category"><option value="">All</option>{[...new Set(rows.map(row => row.category).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      {table && <TableFilterChips table={table} />}
      {error && <div className="bapv-empty" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Retry</button></div>}
      <div className="bap-table" role="table" aria-label="Policies" data-has-selection={!!onToggle}>
        <div className="bap-row bap-header" role="row">{onToggle && <div role="columnheader" className="bap-selection"><Checkbox aria-label="Select all policies" checked={visible.length > 0 && visible.every(row => selectedIds?.has(row.policy_id)) ? true : visible.some(row => selectedIds?.has(row.policy_id)) ? 'indeterminate' : false} onCheckedChange={onSelectAll} /></div>}<div role="columnheader">{header('title', 'Policy')}</div><div role="columnheader">{header('alignment', `CIS IG${cisGroup} safeguards`)}</div><div role="columnheader">{header('status', 'Status')}</div><div role="columnheader">{header('owner_id', 'Owner')}</div><div role="columnheader">{header('last_reviewed_at', 'Last review')}</div><span aria-hidden="true" /></div>
        {loading && <div className="bapv-empty" role="status">Loading policies…</div>}
        {!loading && !error && !visible.length && <div className="bapv-empty"><h3>No policies match</h3><p>Try a different search or filter.</p><button type="button" onClick={clear}>Clear filters</button></div>}
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
      <div className="bapv-summary bap-summary"><span className="bap-summary-left"><span role="status">Showing {visible.length} of {rows.length} {rows.length === 1 ? 'policy' : 'policies'}</span>{view && <button type="button" className="bapv-filter-chip" onClick={() => onView?.('')}>{figures.find(item => item[0] === view)?.[1] || view} ×</button>}</span><span>CIS mappings are catalog support mappings, not evidence that a safeguard is implemented.</span></div>
    </section>
    {nativeControls}
  </div>;
}
