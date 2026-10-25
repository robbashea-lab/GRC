import {useQuarterClock} from './QuarterlyProgramTimeline';
import * as Tooltip from '@radix-ui/react-tooltip';
import {useEffect, useState} from 'react';
import { formatAcceptedRefresh } from '@/lib/acceptedRefreshPresentation';
import { BriefcaseBusiness, TriangleAlert, CalendarDays, ChevronRight, Search } from 'lucide-react';
import RegisterIdentityLogo from './RegisterIdentityLogo';
import {registerCatalogLogo} from '@/lib/registerCatalogLogo';
import {vendorOutstandingWork, vendorWorkUnits} from '@/lib/vendorOutstandingWork';
import VendorsConceptTimeline, {VendorsEventList} from './VendorsConceptTimeline';
import { ColumnControl, TableFilterChips } from './TableControls';
import { assuranceAttention, assuranceName, assuranceState, vendorMatches } from '@/lib/brawndoVendors';
import { calendarDay, managementDay } from '@/lib/managementDates';
import { vendorOverview, vendorTimelineEvents, timelineBounds, eventCycleProgress } from '@/lib/brawndoAdditionalPolicyVendor';
import { AdditionalOwner, savedDate, relativeDate } from './BrawndoAdditionalPolicyVendorCells';
import './BrawndoAdditionalPolicyVendor.css';
import './CisVendorsConcept.css';

const VIEWS = [['all_active', 'All active'], ['review_due', 'Reviews due'], ['review_overdue', 'Reviews past due'], ['critical_high', 'Critical / High'], ['renewal_soon', 'Renewal / notice actions'], ['assurance', 'Assurance follow-up due'], ['inactive', 'Inactive']];
const EXTRA_VIEWS = [['contract_soon', 'Contracts expiring'], ['assurance_attention', 'Assurance needs attention'], ['unassigned', 'Unassigned'], ['all', 'All records'], ['critical', 'Critical'], ['high', 'High']];
const CRITICALITY = { critical: 'Critical', high: 'High', medium: 'Moderate', moderate: 'Moderate', low: 'Low' };


// Only facts already loaded for this exact event; legal dates imply no past renewal.
function eventContext(event) {
  const value = event.document
    ? [assuranceName(event.document), assuranceState(event.document)].filter(Boolean).join(' · ')
    : event.review?.description || event.review?.notes || event.vendor.service || event.vendor.services || '';
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

export function vendorQuarterlyTimelineEvents(rows, reviews = []) {
  return vendorTimelineEvents(rows, reviews).map(event => ({
    ...event,
    kind: event.review?.vendor_purpose === 'assurance' ? 'asr' : event.review?.vendor_purpose === 'contract' ? 'ren' : event.kind,
    title: event.vendor.name,
    detail: eventContext(event),
    record: event.review || event.vendor,
    // A past legal date does not establish overdue work; an active linked Review does.
    overdueEligible: !!event.review || event.kind !== 'ren',
  }));
}

function VendorTimeline({ rows, reviews, onOpen, onOpenReview, theme }) {
  const now = new Date(), { start, end, months, position } = timelineBounds(now);
  const active = rows.filter(vendor => vendorMatches(vendor, 'all_active')).sort((a, b) => ({ critical: 0, high: 1, medium: 2, moderate: 2, low: 3 }[a.criticality] ?? 4) - ({ critical: 0, high: 1, medium: 2, moderate: 2, low: 3 }[b.criticality] ?? 4) || String(a.name).localeCompare(String(b.name)));
  const events = vendorTimelineEvents(active, reviews);
  const openEvent = event => event.review && onOpenReview ? onOpenReview(event.review) : onOpen(event.vendor, event.tab);
  return <Tooltip.Provider delayDuration={150} skipDelayDuration={100}><div className="bav-timeline">
    <div className="bav-up" style={{ gridRow: `1 / span ${active.length + 1}` }}><h4>Coming up</h4>
      {events.slice(0, 3).map(event => {
        const days = calendarDay(event.date) - start, progress = eventCycleProgress(event, now);
        return <button type="button" className={`bav-up-item${days <= 30 ? ' soon' : ''}`} key={event.id} onClick={() => openEvent(event)} aria-label={`${event.label} for ${event.vendor.name}, ${savedDate(event.date)}, ${relativeDate(event.date)}. Open the full record.`}>
          <strong>{Math.abs(days)}<small>{days < 0 ? days === -1 ? 'day late' : 'days late' : days === 1 ? 'day' : 'days'}</small></strong>
          <b><i className={`bav-marker ${event.kind}`} aria-hidden="true" />{event.label} · {savedDate(event.date, true)}</b><span>{event.vendor.name}</span>
          {progress !== null && <span className="bav-cycle" title={`${Math.round(progress)}% of the recorded cycle has run`}><i style={{ width: `${progress}%` }} /></span>}
        </button>;
      })}
      {!events.length && <p className="bapv-sub">No saved upcoming dates.</p>}
    </div>
    <div className="bav-axis" aria-hidden="true">{months.map((month, index) => <span key={month.toISOString()} className={`${index % 2 ? 'alternate' : ''}${month.getUTCMonth() === 0 ? ' year' : ''}`} style={{ left: `calc(${position(month.toISOString())}% + 4px)` }}>{month.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short' })}{month.getUTCMonth() === 0 && <small> {month.getUTCFullYear()}</small>}</span>)}</div>
    {active.map(vendor => {
      const dated = events.filter(event => event.vendor.vendor_id === vendor.vendor_id && calendarDay(event.date) <= end);
      return <div className="bav-lane" key={vendor.vendor_id} role="group" aria-label={`${vendor.name}: ${dated.map(event => `${event.label} ${savedDate(event.date)}`).join(', ') || 'No saved dates in the next 12 months'}`}>
        {months.map(month => <i key={month.toISOString()} className="bav-gridline" aria-hidden="true" style={{ left: `${position(month.toISOString())}%` }} />)}
        <button type="button" className="bav-lane-open" aria-label={`Open ${vendor.name}`} onClick={() => onOpen(vendor, 'reviews_tab')} />
        {dated.map(event => {
          const point = Math.max(0, position(event.date)), days = calendarDay(event.date) - start;
          return <Tooltip.Root key={event.id}><Tooltip.Trigger asChild><button type="button" className={`bav-event ${event.kind}${days <= 30 ? ' soon' : ''}${point > 86 ? ' flip' : ''}`} style={{ left: `${point}%` }} onClick={() => openEvent(event)} aria-label={`${vendor.name}, ${event.label}, ${savedDate(event.date)}. Open the full record.`}><i className={`bav-marker ${event.kind}`} aria-hidden="true" /><span>{savedDate(event.date, true)}</span></button></Tooltip.Trigger>
            <Tooltip.Portal><Tooltip.Content className="bav-event-preview" data-theme={theme} sideOffset={10} collisionPadding={{top:68,right:8,bottom:8,left:8}} avoidCollisions hideWhenDetached>
              <div className="bav-preview-kind">{event.review ? 'Linked Review' : event.kind === 'rev' ? 'Vendor review' : event.label}</div>
              <strong>{event.vendor.name}</strong><span>{event.label}</span>
              <div className="bav-preview-date">{savedDate(event.date)} · {relativeDate(event.date)}</div>
              {eventContext(event) && <p>{eventContext(event)}</p>}
            </Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
        })}
      </div>;
    })}
  </div></Tooltip.Provider>;
}

export default function BrawndoAdditionalVendors({ clientName = 'Client', rows = [], filteredRows = rows, reviews = [], tasks = [], workAvailable = true, workError = '', users = [], loading = false, error = '', onRetry, q = '', onSearch, view = 'all_active', onView, table, onOpen, onOpenReview, onOpenTask, actions, theme = 'light', acceptedRefresh = null, quarterlyChart = false, scopeKey = '', recordOpen = false }) {
  const [selection, setSelection] = useState(null);
  useEffect(() => setSelection(null), [scopeKey]);
  const [now] = useQuarterClock();
  const work = vendorOutstandingWork(rows, reviews, tasks, now);
  const selectEvents = (events, title, opener) => setSelection({scope: scopeKey, ids: events.map(event => event.id), title, opener});
  const openEvent = event => event.task ? onOpenTask?.(event.task) : event.review && onOpenReview ? onOpenReview(event.review) : onOpen(event.vendor, event.tab, event.assuranceId);
  const refreshLabel = !loading && !error ? formatAcceptedRefresh(acceptedRefresh) : '';
  const metrics = vendorOverview(rows);
  const figures = [['critical_high', 'Critical / High'], ['review_due', 'Reviews due in 30 days'], ['assurance', 'Assurance follow-up due'], ['renewal_soon', 'Renewal / notice actions in 30 days']];
  const header = (key, label) => table ? <ColumnControl table={table} column={{ ...table.columns.find(column => column.key === key), key, label }} /> : label;
  const today = managementDay();
  const counts = Object.fromEntries([...VIEWS, ...EXTRA_VIEWS].map(([id]) => [id, rows.filter(row => vendorMatches(row, id)).length]));
  const countsAvailable = !loading && !error;
  const cohort = Object.prototype.hasOwnProperty.call(counts, view) ? view : 'all_active';
  const cohortLabel = cohort === 'inactive' ? 'inactive ' : cohort === 'all_active' ? 'active ' : '';
  const summary = countsAvailable ? `Showing ${filteredRows.length} of ${counts[cohort]} ${cohortLabel}${counts[cohort] === 1 ? 'vendor' : 'vendors'}` : error ? 'Vendor counts unavailable.' : 'Loading vendors…';
  const workReady = countsAvailable && workAvailable;
  const activeCount = rows.filter(vendor => vendorMatches(vendor, 'all_active')).length;
  const inactiveCount = rows.filter(vendor => vendorMatches(vendor, 'inactive')).length;
  const critical = rows.filter(vendor => vendorMatches(vendor, 'critical')).length;
  const high = rows.filter(vendor => vendorMatches(vendor, 'high')).length;
  const cards = [
    {id: 'all', label: 'All vendors', count: rows.length, detail: `${activeCount} active · ${inactiveCount} inactive`, Icon: BriefcaseBusiness, open: () => onView('all'), ready: countsAvailable},
    {id: 'critical_high', label: 'Critical / High', count: critical + high, detail: `${critical} critical · ${high} high`, Icon: TriangleAlert, open: () => onView('critical_high'), ready: countsAvailable},
    {id: 'overdue', label: 'Overdue', count: work.overdue.length, detail: vendorWorkUnits(work.overdue), Icon: TriangleAlert, open: event => selectEvents(work.overdue, 'Overdue vendor work', event.currentTarget), ready: workReady},
    {id: 'due30', label: 'Due in 30 days', count: work.due30.length, detail: vendorWorkUnits(work.due30), Icon: CalendarDays, open: event => selectEvents(work.due30, 'Due in the next 30 days', event.currentTarget), ready: workReady},
  ];
  return <div className={`brawndo-additional bav-page${quarterlyChart ? ' cv-page' : ''}`} data-theme={theme} data-testid="additional-vendors">
    <div className="bapv-page-head"><div><h1>{clientName} Vendors</h1><p>{countsAvailable ? `Third-party register · ${counts.all_active} active ${counts.all_active === 1 ? 'vendor' : 'vendors'}` : 'Third-party register'}{refreshLabel && ` · As of ${refreshLabel}`}</p></div><div className="bapv-head-actions">{actions}</div></div>
    <section className={quarterlyChart ? 'cv-overview' : 'bapv-card bav-overview'} aria-label="Vendor overview">
      {quarterlyChart ? <><div className="cv-kpis" aria-label="Vendor summaries">{cards.map(({id, label, count, detail, Icon, open, ready}) => <button type="button" key={id} className={`cv-kpi bapv-kcell${id === 'overdue' && count ? ' has-overdue' : ''}`} disabled={!ready} onClick={open} data-testid={`additional-vendor-metric-${id}`}><Icon aria-hidden="true"/><div><span>{label}</span><strong>{ready ? count : '—'}</strong><small>{ready ? detail : 'Counts unavailable'}</small></div></button>)}</div>{workError && <p className="cv-work-error" role="alert">{workError} Work counts unavailable.</p>}
      <VendorsConceptTimeline key={scopeKey} scopeKey={scopeKey} events={work.events} users={users} available={workReady} theme={theme} onSelect={selectEvents}/></> : <><div className="bapv-kstrip" aria-label="Vendor summary. Select a figure to filter the register.">{figures.map(([id, label], index) => <button type="button" className="bapv-kcell" key={id} aria-pressed={view === id} disabled={!countsAvailable} onClick={() => onView(view === id ? 'all_active' : id)} data-testid={`additional-vendor-metric-${id}`}><span>{label}</span><strong>{countsAvailable ? metrics[index] : '—'}</strong></button>)}</div><div><div className="bav-timeline-head"><div><h3>Next 12 months</h3><p className="bapv-sub">Reviews, assurance follow-ups and contract renewals for each vendor.</p></div><div className="bav-legend" aria-label="Timeline markers"><span><i className="bav-marker rev" />Review</span><span><i className="bav-marker asr" />Assurance follow-up</span><span><i className="bav-marker ren" />Contract renewal</span></div></div>{!loading && !error && <VendorTimeline key={acceptedRefresh || 'unacknowledged'} rows={rows} reviews={reviews} onOpen={onOpen} onOpenReview={onOpenReview} theme={theme} />}</div></>}
    </section>
    <section className="bapv-card" aria-label="Vendor register">
      {quarterlyChart && <div className="cv-register-heading"><h2>Vendor register</h2></div>}
      <div className="bapv-filters"><label className="bapv-search"><span className="sr-only">Search vendors</span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search vendors…" value={q} onChange={event => onSearch(event.target.value)} data-testid="vendor-search" /></label><div className="bapv-segment" role="group" aria-label="Show vendors">{VIEWS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => onView(id)} data-testid={`vendor-view-${id}`}>{label}<span>{countsAvailable ? counts[id] : '—'}</span></button>)}</div><label className="bapv-field">More views <select aria-label="Other vendor views" value={EXTRA_VIEWS.some(([id]) => id === view) ? view : ''} onChange={event => onView(event.target.value || 'all_active')}><option value="">Select</option>{EXTRA_VIEWS.map(([id, label]) => <option value={id} key={id}>{countsAvailable ? `${label} (${counts[id]})` : label}</option>)}</select></label></div>
      {table && <TableFilterChips table={table} />}
      {error && <div className="bapv-empty" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Retry</button></div>}
      <div className="bav-table" role="table" aria-label="Vendors">
        <div className="bav-row bav-header" role="row">{[['name', 'Vendor'], ['criticality', 'Criticality'], ['data_types', quarterlyChart ? 'Data access' : 'Data types'], ['business_owner_id', quarterlyChart ? 'Owner' : 'Business owner'], ['next_review', 'Next review'], ['security_assurance', 'Security assurance'], ['contract_renewal', quarterlyChart ? 'Renewal' : 'Contract renewal']].map(([key, label]) => <div role="columnheader" key={key}>{header(key, label)}</div>)}<span aria-hidden="true" /></div>
        {loading && <div className="bapv-empty" role="status">Loading vendors…</div>}
        {!loading && !error && !filteredRows.length && <div className="bapv-empty"><h3>No vendors match</h3><p>Try a different search or filter.</p><button type="button" onClick={() => { onSearch(''); onView('all_active'); table?.clear(); }}>Clear filters</button></div>}
        {!loading && !error && filteredRows.map((vendor, index) => {
          const documents = (vendor.assurance_records || []).filter(document => !document.superseded_by), document = documents[0];
          const followup = document?.next_follow_up || document?.refresh_due;
          const nextDay = calendarDay(vendor.next_review), renewalDay = calendarDay(vendor.contract_renewal);
          return <div className="bav-row" role="row" key={vendor.vendor_id} onClick={() => onOpen(vendor)} data-testid={`vendor-row-${index}`}>
            <div role="cell" className="bav-item">{quarterlyChart && <RegisterIdentityLogo kind="vendor" src={registerCatalogLogo('vendors', vendor)}/>}<div><button type="button" className="bapv-name" onClick={event => { event.stopPropagation(); onOpen(vendor); }}>{vendor.name}</button><div className="bapv-meta">{[vendor.service || vendor.services, vendor.status !== 'active' ? vendor.status : ''].filter(Boolean).join(' · ')}</div></div></div>
            <div role="cell" className="bav-criticality"><span className={`bav-critical ${vendor.criticality}`}><i />{CRITICALITY[vendor.criticality] || vendor.criticality || 'Not recorded'}</span></div>
            <div role="cell" className="bav-types">{vendor.data_types?.length ? vendor.data_types.map(type => <span className="bav-data-type" key={type}>{type}</span>) : <span>Not recorded</span>}</div>
            <div role="cell" className="bav-owner"><AdditionalOwner users={users} id={vendor.business_owner_id} /></div>
            <div role="cell" className="bav-next bapv-two"><span>{savedDate(vendor.next_review) || 'Not scheduled'}</span><small className={nextDay !== null && nextDay <= today + 30 ? 'warn' : ''}>{vendor.next_review ? relativeDate(vendor.next_review) : ''}{vendor.last_review ? `${vendor.next_review ? ' · ' : ''}last ${savedDate(vendor.last_review, true)}` : ''}</small></div>
            <div role="cell" className="bav-assurance">{quarterlyChart ? documents.length ? documents.map((item, index) => <div className="cv-assurance" key={item.assurance_id || index}><button type="button" onClick={event => {event.stopPropagation(); onOpen(vendor, 'assurance', item.assurance_id || `legacy:${vendor.assurance_records.indexOf(item)}`);}}>{assuranceName(item)}</button><span className={`cv-assurance-status cv-status-${item.review_status || 'recorded'}`}>{assuranceState(item)}</span>{(item.next_follow_up || item.refresh_due) && <small className={assuranceAttention(item).length ? 'warn' : ''}>Follow-up {savedDate(item.next_follow_up || item.refresh_due, true)}</small>}</div>) : <button type="button" onClick={event => {event.stopPropagation(); onOpen(vendor, 'assurance');}}>No assurance recorded</button> : <><button type="button" onClick={event => { event.stopPropagation(); onOpen(vendor, 'assurance'); }}>{document ? assuranceName(document) : 'No assurance recorded'}{documents.length > 1 ? ` +${documents.length - 1}` : ''}</button>{document && <small className={assuranceAttention(document).length ? 'warn' : ''}>{assuranceState(document)}{followup ? ` · Follow-up ${savedDate(followup, true)}` : ''}</small>}</>}</div>
            <div role="cell" className="bav-renewal bapv-two"><span>{savedDate(vendor.contract_renewal) || 'No renewal date'}</span><small className={renewalDay !== null && renewalDay >= today && renewalDay <= today + 30 ? 'warn' : ''}>{relativeDate(vendor.contract_renewal)}</small>{vendor.contract_notice_deadline && <small>Notice {savedDate(vendor.contract_notice_deadline, true)}</small>}</div>
            <ChevronRight size={16} className="bapv-chevron" aria-hidden="true" />
          </div>;
        })}
      </div>
      <div className="bapv-summary" role="status">{summary}{view !== 'all_active' && <button type="button" className="bapv-filter-chip" onClick={() => onView('all_active')}>{[...VIEWS, ...EXTRA_VIEWS].find(([id]) => id === view)?.[1] || view} ×</button>}</div>
    </section>
    {quarterlyChart && <VendorsEventList now={now} selection={selection?.scope === scopeKey ? selection : null} events={work.events} available={workReady} recordOpen={recordOpen} users={users} theme={theme} onClose={() => setSelection(null)} onOpen={openEvent}/>}
  </div>;
}
