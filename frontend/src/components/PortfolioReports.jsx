import { useEffect, useRef, useState } from 'react';
import api, { formatError } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Building2, ChartNoAxesCombined, ChevronRight, FileText, History, Info, Layers3, Shield, AlertTriangle } from 'lucide-react';
import './PortfolioReports.css';

const RANGES = [['30d', '30 days'], ['6m', '6 months'], ['12m', '12 months']];
const EMPTY_PROGRAMS = [];
const TYPES = ['Assessments', 'Findings', 'Risks', 'Policies', 'Evidence', 'Scope'];
const EVENT_ICONS = { Assessments: ChartNoAxesCombined, Findings: AlertTriangle, Risks: Shield, Policies: FileText, Evidence: FileText, Scope: Layers3 };
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unavailable';
const dateTime = value => value ? new Date(value).toLocaleString() : 'Unavailable';
const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
const rate = snapshot => Number.isFinite(snapshot?.percentage) ? `${number(snapshot.percentage)}%` : '—';
const programId = program => JSON.stringify([program.client_id, program.program_key]);
const snapshotAt = snapshot => snapshot?.captured_at || snapshot?.at;
const counts = snapshot => Array.isArray(snapshot?.counts) ? snapshot.counts : [];
const tone = key => ({ addressed: 'implemented', implemented: 'implemented', in_progress: 'partial', partially_implemented: 'partial', partial: 'partial', needs_attention: 'not', not_implemented: 'not', not_assessed: 'unassessed', unassessed: 'unassessed', excluded: 'excluded', not_applicable: 'excluded', unresolved: 'unassessed', applicability_unknown: 'unassessed' })[key] || 'unassessed';
const provenanceLabel = snapshot => typeof snapshot?.provenance === 'string' ? snapshot.provenance : snapshot?.provenance?.label || (snapshot?.provenance?.kind === 'reconstructed' ? 'Reconstructed from retained source history' : 'Captured source position');
const chartCounts = snapshot => counts(snapshot).filter(value => !['not_applicable', 'excluded', 'scope_undetermined', 'undetermined_applicability', 'missing'].includes(value.key));
const actorLabel = event => typeof event?.actor === 'string' ? event.actor : event?.actor?.name || 'Unknown actor';

// A response from an old cohort or selection is never rendered under a new scope.
function useReport(path, params, enabled = true) {
  const key = JSON.stringify([path, params]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: '', data: null, loading: true, error: '' });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: '' });
    const [, requestParams] = JSON.parse(key);
    api.get(path, { params: requestParams, signal: controller.signal }).then(({ data }) => {
      const list = path.endsWith('/overview') ? 'programs' : path.endsWith('/history') ? 'snapshots' : 'events';
      if (!data || !Array.isArray(data[list]) || (path.endsWith('/overview') && !Array.isArray(data.frameworks))) throw new Error('The reporting response is incomplete.');
      if (active) setState({ key, data, loading: false, error: '' });
    }).catch(error => {
      if (active) setState({ key, data: null, loading: false, error: formatError(error) });
    });
    return () => { active = false; controller.abort(); };
  }, [path, key, attempt, enabled]);
  const result = !enabled ? { data: null, loading: false, error: '' } : state.key === key ? state : { data: null, loading: true, error: '' };
  return { ...result, retry: () => setAttempt(value => value + 1) };
}

function ReportState({ report, empty, children }) {
  if (report.loading) return <div className="pr-empty" role="status">Loading report…</div>;
  if (report.error) return <div className="pr-empty" role="alert"><h3>Report unavailable</h3><p>{report.error}</p><button type="button" className="pr-link" onClick={report.retry}>Retry</button></div>;
  if (!report.data) return <div className="pr-empty">{empty || 'No report is available.'}</div>;
  return children;
}

function Coverage({ coverage, asOf }) {
  if (!coverage && !asOf) return null;
  return <div className="pr-coverage">
    {asOf && <span>As of {dateTime(asOf)}</span>}
    {coverage?.started_at && <span>History available from {date(coverage.started_at)}</span>}
    {coverage?.first_event_at && <span>Available activity begins {dateTime(coverage.first_event_at)}</span>}
    {coverage?.last_captured_at && <span>Last captured {dateTime(coverage.last_captured_at)}</span>}
    {coverage?.delayed && <span className="pr-partial">Collection is delayed; captured history may be incomplete.</span>}
    {coverage?.incomplete && <span className="pr-partial">The latest collection did not complete.</span>}
    {coverage?.catch_up_complete === false && <span className="pr-partial">Activity capture is catching up; this count may be incomplete.</span>}
    {coverage?.note && <span className={coverage.status === 'partial' ? 'pr-partial' : ''}>{coverage.note}</span>}
    {coverage?.notice && <span className={coverage.partial ? 'pr-partial' : ''}>{coverage.notice}</span>}
  </div>;
}

function RangeControls({ value, onChange }) {
  return <div className="pr-segmented" role="group" aria-label="Progress comparison period">{RANGES.map(([key, label]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

function Legend({ snapshots = [] }) {
  const values = [...new Map(snapshots.flatMap(counts).map(item => [item.key, item])).values()];
  return <div className="pr-legend">{values.map(item => <span key={item.key}><i aria-hidden="true" className={`pr-dot is-${tone(item.key)}`} />{item.label}</span>)}</div>;
}

function Stack({ snapshot, label }) {
  const values = chartCounts(snapshot);
  const total = values.reduce((sum, value) => sum + value.count, 0);
  return <div className="pr-stack" role="img" aria-label={`${label || 'Implementation breakdown'}: ${values.map(value => `${value.count} ${value.label}`).join(', ') || 'unavailable'}`}>{values.map(value => value.count > 0 && <span key={value.key} className={`is-${tone(value.key)}`} style={{ width: `${total ? value.count / total * 100 : 0}%` }} title={`${value.label}: ${value.count}`} />)}</div>;
}

function Delta({ comparison }) {
  if (comparison?.scope_changed) return <span className="pr-delta is-neutral"><Layers3 size={14} aria-hidden="true" />Scope changed</span>;
  if (!comparison?.comparable || !Number.isFinite(comparison.change_pp)) return <span className="pr-delta is-neutral">No comparable baseline</span>;
  const change = comparison.change_pp;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`pr-delta is-${change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'}`} title={comparison.baseline_before_requested_start ? `Baseline ${dateTime(comparison.baseline.captured_at)} predates the selected period. Change is between captured positions.` : undefined}>{change !== 0 && <Icon size={14} aria-hidden="true" />}{change > 0 ? '+' : ''}{number(change)} pp{comparison.baseline_before_requested_start && <small className="pr-bar-subtext">Baseline {date(comparison.baseline.captured_at)} · before selected period</small>}</span>;
}

function ProgramCount({ snapshot }) {
  return <><strong>{rate(snapshot)}</strong><small>{Number.isFinite(snapshot?.implemented) && Number.isFinite(snapshot?.denominator) ? `${snapshot.implemented} of ${snapshot.denominator} implemented` : 'Implementation unavailable'}</small>{snapshot?.availability === 'partial' && <small>Partial source data</small>}</>;
}

function Components({ snapshot }) {
  if (!snapshot?.components?.length) return null;
  return <div className="pr-native-components">{snapshot.components.map(component => <div key={component.key}><h4>{component.label}</h4>{counts(component).length ? <><Stack snapshot={component} label={component.label} /><p>{counts(component).map(value => `${value.count} ${value.label.toLowerCase()}`).join(' · ')}</p></> : <dl>{[['included', 'Included'], ['excluded', 'Excluded'], ['undetermined', 'Undetermined'], ['unavailable', 'Unavailable'], ['total', 'Total']].map(([key, label]) => component[key] != null && <div key={key}><dt>{label}</dt><dd>{component[key]}</dd></div>)}</dl>}{(component.notice || component.reason) && <p>{component.notice || component.reason}</p>}</div>)}</div>;
}

function HistoryChart({ snapshots, scopeChanges = [] }) {
  const [active, setActive] = useState(null);
  const [showData, setShowData] = useState(false);
  const selected = snapshots.find(value => (value.snapshot_id || snapshotAt(value)) === active) || snapshots.at(-1);
  const allCounts = [...new Map(snapshots.flatMap(counts).map(item => [item.key, item])).values()];
  const width = Math.max(760, snapshots.length * 60 + 70), height = 240, top = 24, bottom = 198, left = 45;
  const first = new Date(snapshotAt(snapshots[0])).getTime(), last = new Date(snapshotAt(snapshots.at(-1))).getTime();
  const position = at => last > first ? left + 28 + (new Date(at).getTime() - first) / (last - first) * (width - left - 72) : width / 2;
  return <div className="pr-chart-card">
    <div className="pr-chart-top"><h4>Implementation history</h4><button type="button" className="pr-link" aria-expanded={showData} aria-controls="portfolio-history-data" onClick={() => setShowData(value => !value)}>{showData ? 'Hide data' : 'View data'}</button></div>
    <Legend snapshots={snapshots} />
    {snapshots.length < 2 && <div className="pr-history-empty"><History size={28} aria-hidden="true" /><h4>Not enough history for a trend</h4><p>{selected ? `One snapshot is available, dated ${date(snapshotAt(selected))}. Earlier periods are unavailable.` : 'No captured snapshots are available.'}</p></div>}
    {snapshots.length > 0 && <div className="pr-chart-scroll" tabIndex={0} role="region" aria-label="Discrete implementation snapshots, scroll for more dates"><svg className="pr-history-svg" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: snapshots.length > 12 ? width : undefined }} aria-label="Discrete implementation snapshots. Select a column or use View data for exact counts.">
      <title>Implementation history</title><desc>Each column is a captured snapshot. Gaps are not interpolated; scope changes are marked.</desc>
      {[0, 25, 50, 75, 100].map(value => <g key={value}><line className="pr-chart-grid" x1={left} x2={width - 15} y1={bottom - (bottom - top) * value / 100} y2={bottom - (bottom - top) * value / 100} /><text className="pr-chart-axis" x={left - 9} y={bottom - (bottom - top) * value / 100 + 4} textAnchor="end">{value}%</text></g>)}
      {snapshots.map((snapshot, index) => {
        const values = chartCounts(snapshot), total = snapshot.denominator;
        const x = position(snapshotAt(snapshot)); let y = bottom;
        return <g key={snapshot.snapshot_id || snapshotAt(snapshot)}>
          <g tabIndex={0} role="button" className={`pr-chart-bar ${selected === snapshot ? 'is-active' : ''}`} aria-label={`${date(snapshotAt(snapshot))}: ${values.map(value => `${value.count} ${value.label}`).join(', ')}`} aria-pressed={selected === snapshot} onFocus={() => setActive(snapshot.snapshot_id || snapshotAt(snapshot))} onMouseEnter={() => setActive(snapshot.snapshot_id || snapshotAt(snapshot))} onClick={() => setActive(snapshot.snapshot_id || snapshotAt(snapshot))} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setActive(snapshot.snapshot_id || snapshotAt(snapshot)); } }}>
            <rect className="pr-focus-outline" x={x - 24} y={top - 4} width={48} height={bottom - top + 8} rx={4} />
            {values.map(value => { const size = total > 0 ? value.count / total * (bottom - top) : 0; y -= size; return <rect key={value.key} className={`is-${tone(value.key)}`} x={x - 18} y={y} width={36} height={size} />; })}
          </g>
          {(snapshots.length <= 6 || index === 0 || index === snapshots.length - 1 || index % 2 === 0) && <text className="pr-chart-axis" x={x} y={222} textAnchor="middle">{new Date(snapshotAt(snapshot)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>}
        </g>;
      })}
      {scopeChanges.filter(change => new Date(change.at).getTime() >= first && new Date(change.at).getTime() <= last).map((change, index) => <g key={`${change.at}:${index}`}><line className="pr-scope-marker" x1={position(change.at)} x2={position(change.at)} y1={15} y2={bottom} /><text className="pr-scope-text" x={Math.min(position(change.at) + 6, width - 110)} y={12}>Scope changed</text></g>)}
    </svg></div>}
    {selected && <div className="pr-snapshot-detail" aria-live="polite"><strong>{dateTime(snapshotAt(selected))}</strong>{counts(selected).map(value => <span key={value.key}><i className={`pr-dot is-${tone(value.key)}`} aria-hidden="true" />{value.count} {value.label.toLowerCase()}</span>)}<small>{provenanceLabel(selected)}</small></div>}
    <p className="pr-chart-caption">Each column is a discrete snapshot. Focus or select a column for its counts.</p>
    {showData && <div className="pr-data-scroll" id="portfolio-history-data"><table className="pr-data-table"><caption className="sr-only">Captured implementation snapshot counts</caption><thead><tr><th scope="col">Recorded</th>{allCounts.map(value => <th scope="col" key={value.key}>{value.label}</th>)}<th scope="col">Implemented denominator</th><th scope="col">Excluded</th><th scope="col">Total</th><th scope="col">Provenance</th></tr></thead><tbody>{snapshots.map(snapshot => <tr key={snapshot.snapshot_id || snapshotAt(snapshot)}><td>{dateTime(snapshotAt(snapshot))}</td>{allCounts.map(value => <td key={value.key}>{counts(snapshot).find(item => item.key === value.key)?.count ?? '—'}</td>)}<td>{snapshot.denominator ?? '—'}</td><td>{snapshot.excluded ?? '—'}</td><td>{snapshot.total ?? '—'}</td><td>{provenanceLabel(snapshot)}</td></tr>)}</tbody></table></div>}
  </div>;
}

function ProgramHistory({ report, programs, selected, onSelect, onBack, range, setRange }) {
  const data = report.data, program = programs.find(item => programId(item) === selected);
  const comparison = data?.comparison, current = data?.current || data?.snapshots?.at(-1), baseline = comparison?.baseline;
  const snapshots = [...(data?.snapshots || [])];
  if (current && snapshotAt(snapshots.at(-1)) !== snapshotAt(current)) snapshots.push({...current,
    snapshot_id: 'current-source-read', provenance: {kind: 'current_source_read', label: 'Current authorized source read; not retained history'}});
  return <><div className="pr-detail-toolbar"><button type="button" className="pr-back" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />All client programs</button><RangeControls value={range} onChange={setRange} /></div>
    <div className="pr-detail-client"><span className="gp-client-initial" aria-hidden="true">{program?.client_name?.charAt(0)}</span><div><h3>{program?.client_name}</h3><small>{program?.program_label}{program?.scope_label && ` · ${program.scope_label}`}</small></div><label className="sr-only" htmlFor="portfolio-history-program">Select client program</label><select id="portfolio-history-program" value={selected} onChange={event => onSelect(event.target.value)}>{programs.map(item => <option key={programId(item)} value={programId(item)} label={`${item.client_name} · ${item.program_label}`} />)}</select></div>
    <ReportState report={report}>
      <div className="pr-trend-metrics"><div><span>{baseline ? dateTime(snapshotAt(baseline)) : 'Period baseline'}</span><ProgramCount snapshot={baseline} />{!baseline && <small>Earlier history unavailable</small>}</div><div><span>{snapshotAt(current) ? dateTime(snapshotAt(current)) : 'Current position'}</span><ProgramCount snapshot={current} /></div><div><span>Change between captured positions</span><Delta comparison={comparison} /><small>{comparison?.baseline_before_requested_start && 'Baseline predates the requested period. '}{comparison?.scope_changed ? 'Different scope · not like-for-like' : comparison?.comparable ? 'Percentage points · same scope' : comparison?.reason || 'No comparable baseline'}</small></div></div>
      {comparison?.scope_changed && <div className="pr-notice"><Layers3 size={16} aria-hidden="true" /><span><strong>Program scope changed.</strong> {comparison.reason || 'Requirement identities, configuration, or applicability changed during this period.'}{baseline && current && ` Baseline: ${baseline.total} total, ${baseline.denominator} in the denominator. Current: ${current.total} total, ${current.denominator} in the denominator.`} The endpoint positions are not a like-for-like improvement measure.</span></div>}
      {(data?.scope_changes || []).map((change, index) => <div key={`${change.at}:${index}`} className="pr-scope-entry">Scope changed {dateTime(change.at)}{change.before && change.after && ` · ${change.before.total} → ${change.after.total} total · ${change.before.denominator} → ${change.after.denominator} in the denominator`}</div>)}
      <Components snapshot={current} />
      <HistoryChart key={selected + range} snapshots={snapshots} scopeChanges={data?.scope_changes || []} />
      <Coverage coverage={data?.coverage} asOf={data?.as_of} />
      <p className="pr-help"><Info size={14} aria-hidden="true" /><span>Progress tracks reported implementation. Applicability, assessment and verification remain separate.{current?.excluded > 0 && ' Excluded requirements remain visible in View data.'}{(current?.notice || current?.reason) && ` ${current.notice || current.reason}`}</span></p>
    </ReportState>
  </>;
}

function SafeValue({ value }) {
  if (value == null) return <span>Not recorded</span>;
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}

function ActivityPanel({ rows, cohort, includeArchived, asOf, initialClient, onSource }) {
  const [days, setDays] = useState(7), [client, setClient] = useState(initialClient || ''), [type, setType] = useState(''), [selected, setSelected] = useState(null), [pagination, setPagination] = useState({ key: '', cursor: '' });
  const [pages, setPages] = useState({ key: '', events: [] });
  const filterKey = JSON.stringify([cohort, includeArchived, days, client, type, asOf]);
  const cursor = pagination.key === filterKey ? pagination.cursor : '';
  const report = useReport('/portfolio/reporting/activity', { client_ids: cohort, include_archived: includeArchived, days, client_id: client || undefined, type: type || undefined, cursor: cursor || undefined, as_of: asOf || undefined });
  const scroll = useRef(null), feedScroll = useRef(0);
  useEffect(() => { setSelected(null); setPages({ key: filterKey, events: [] }); }, [filterKey]);
  useEffect(() => {
    if (!report.data) return;
    setPages(previous => ({ key: filterKey, events: [...new Map([...(cursor && previous.key === filterKey ? previous.events : []), ...(report.data.events || [])].map(event => [event.event_id, event])).values()] }));
  }, [report.data, filterKey, cursor]);
  const events = pages.key === filterKey ? pages.events : [];
  const openEvent = event => { feedScroll.current = scroll.current?.scrollTop || 0; setSelected(event); scroll.current?.scrollTo?.(0, 0); };
  const back = () => { setSelected(null); requestAnimationFrame(() => { scroll.current?.scrollTo?.(0, feedScroll.current); }); };
  let lastDay;
  return <div className="pr-panel-body" ref={scroll}>
    {selected ? <><button type="button" className="pr-back" onClick={back}><ArrowLeft size={14} aria-hidden="true" />Back to recent changes</button><div className="pr-record-heading"><p>{selected.client_name} · {selected.type}</p><h3>{selected.title}</h3><p>{selected.description}</p></div>
      {(selected.before != null || selected.after != null) && <div className="pr-record-change"><div><small>Before</small><SafeValue value={selected.before} /></div><ArrowRight size={20} aria-hidden="true" /><div><small>After</small><SafeValue value={selected.after} /></div></div>}
      <dl className="pr-record-grid"><div><dt>Changed by</dt><dd>{actorLabel(selected)}</dd></div><div><dt>Recorded</dt><dd><time dateTime={selected.at}>{dateTime(selected.at)}</time></dd></div><div><dt>Framework</dt><dd>{selected.program_label || 'Client-level change'}</dd></div><div><dt>Event ID</dt><dd>{selected.event_id}</dd></div></dl>
      {selected.note && <p className="pr-help">{selected.note}</p>}
      {selected.source?.available && selected.source.to ? <button type="button" className="pr-source-button" onClick={() => onSource(selected)}>Open source record<ArrowRight size={14} aria-hidden="true" /></button> : <div className="pr-notice"><Info size={16} aria-hidden="true" /><span>{selected.source?.notice || 'The source record is unavailable, deleted, archived, or outside your current access.'}</span></div>}
    </> : <><div className="pr-activity-tools"><label>Time period<select value={days} onChange={event => setDays(Number(event.target.value))}>{[7, 30, 90].map(value => <option key={value} value={value} label={`Last ${value} days`} />)}</select></label><label>Client<select value={client} onChange={event => setClient(event.target.value)}><option value="">All clients in view</option>{rows.map(row => <option key={row.client_id} value={row.client_id} label={row.name} />)}</select></label><label>Change type<select value={type} onChange={event => setType(event.target.value)}><option value="">All changes</option>{TYPES.map(value => <option key={value} value={value} label={value} />)}</select></label></div>
      <div className="pr-activity-meta"><span>{report.data ? `${report.data.total} ${report.data.total === 1 ? 'change' : 'changes'} · Last ${days} days` : 'Changes'}</span><span>Newest first · your local time</span></div>
      <Coverage coverage={report.data?.coverage} asOf={report.data?.as_of} />
      <ReportState report={report}>
        {!events.length ? <div className="pr-empty"><History size={28} aria-hidden="true" /><h3>No changes in this view</h3><p>No recorded events match this client, type and period.</p></div> : events.map(event => {
          const day = new Date(event.at).toLocaleDateString(), heading = day !== lastDay; lastDay = day;
          const Icon = EVENT_ICONS[event.type] || History;
          return <div key={event.event_id}>{heading && <h3 className="pr-activity-day">{date(event.at)}</h3>}<button type="button" className="pr-event-card" onClick={() => openEvent(event)} aria-label={`${event.client_name}, ${event.title}. View change details`}><span className="pr-event-icon"><Icon size={17} aria-hidden="true" /></span><span className="pr-event-content"><span className="pr-event-kicker"><strong>{event.client_name}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></span><strong className="pr-event-title">{event.title}</strong><span>{event.description}</span><small>{actorLabel(event)} · {event.type}{event.program_label && ` · ${event.program_label}`}</small></span><ChevronRight size={15} aria-hidden="true" /></button></div>;
        })}
        {report.data?.next_cursor && <button type="button" className="pr-load-more" onClick={() => setPagination({ key: filterKey, cursor: report.data.next_cursor })}>Load more changes</button>}
      </ReportState>
    </>}
  </div>;
}

export default function PortfolioReports({ rows, loading, error, includeArchived, panel, setPanel, onFramework, onSource }) {
  const [range, setRange] = useState('30d'), [selected, setSelected] = useState('');
  const cohort = rows.map(row => row.client_id).sort().join(',');
  const overview = useReport('/portfolio/reporting/overview', { client_ids: cohort, include_archived: includeArchived, range }, !loading && !error);
  const programs = overview.data?.programs || EMPTY_PROGRAMS;
  const opener = useRef(null);
  const selection = selected && programs.find(program => programId(program) === selected);
  const panelClientInView = !panel?.client_id || rows.some(row => row.client_id === panel.client_id);
  const history = useReport('/portfolio/reporting/history', { client_id: selection?.client_id, program_key: selection?.program_key, range, include_archived: includeArchived }, !!selection && panel?.type === 'progress');
  useEffect(() => {
    setSelected('');
  }, [cohort, includeArchived]);
  useEffect(() => { if (!panelClientInView) setPanel(null); }, [panelClientInView, setPanel]);
  useEffect(() => {
    if (panel?.type !== 'progress') { setSelected(''); return; }
    if (panel.client_id && programs.length && !selected) {
      const program = programs.find(value => value.client_id === panel.client_id && (!panel.program_key || value.program_key === panel.program_key));
      if (program) setSelected(programId(program));
    }
  }, [panel, programs, selected]);
  const available = !loading && !error;
  const close = () => setPanel(null);
  const restoreFocus = event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus({ preventScroll: true }); } };
  const rememberFocus = () => { opener.current = document.activeElement; };
  const open = type => { setSelected(''); setPanel({ type }); };
  const cards = [
    { Icon: Building2, label: 'Total clients', value: available ? overview.data?.total_clients ?? rows.length : null },
    { Icon: Layers3, label: 'Active frameworks', value: overview.data ? overview.data.frameworks.length : null, type: 'frameworks' },
    { Icon: ChartNoAxesCombined, label: 'Framework progress', text: 'View client progress', type: 'progress' },
    { Icon: History, label: 'Recent changes', value: overview.data?.recent_changes_count, text: 'In the last 7 days', type: 'activity' },
  ];
  return <>
    <section className="gp-metrics" aria-label="Portfolio overview" data-testid="portfolio-summary-cards">{cards.map(({ Icon, label, value, text, type }) => {
      const Tag = type ? 'button' : 'div';
      return <Tag key={label} type={type ? 'button' : undefined} className={`gp-metric ${type ? 'is-interactive' : ''} ${type === 'progress' ? 'is-progress' : ''}`} onClick={type ? () => open(type) : undefined} aria-haspopup={type ? 'dialog' : undefined} disabled={type ? !available : undefined}>
        <span className="gp-metric-icon"><Icon size={23} aria-hidden="true" /></span><span className="gp-metric-content">{type === 'progress' ? <span className="gp-metric-link-title">{label}</span> : <><strong className="gp-metric-value">{value ?? '—'}{value == null && <span className="sr-only"> unavailable</span>}</strong><span className="gp-metric-label">{label}</span></>}{text && <span className="gp-metric-sub">{text}</span>}</span>{type && <ArrowUpRight size={15} className="gp-metric-arrow" aria-hidden="true" />}
      </Tag>;
    })}</section>
    {overview.error && available && <div className="pr-summary-error" role="alert">Reporting unavailable. {overview.error} <button type="button" className="pr-link" onClick={overview.retry}>Retry reporting</button></div>}
    <Dialog open={['frameworks', 'progress'].includes(panel?.type)} onOpenChange={isOpen => { if (!isOpen) close(); }}><DialogContent className={`portfolio-report-panel pr-dialog ${panel?.type === 'frameworks' ? 'is-frameworks' : 'is-progress'}`} data-testid="portfolio-report-dialog" onOpenAutoFocus={rememberFocus} onCloseAutoFocus={restoreFocus}>
      <DialogHeader className="pr-panel-header"><DialogTitle>{panel?.type === 'frameworks' ? 'Active frameworks' : 'Framework progress'}</DialogTitle><DialogDescription>{panel?.type === 'frameworks' ? 'Configured framework identities in the current portfolio view.' : 'Compare client programs, then explore their progress over time.'}</DialogDescription></DialogHeader>
      <div className="pr-panel-body">
        {panel?.type === 'frameworks' ? <ReportState report={overview}><p className="pr-panel-context">{overview.data?.total_clients} clients in the current view. Enabled program identities remain distinct.</p><div className="pr-framework-list">{overview.data?.frameworks.map(framework => <button type="button" key={framework.key} className="pr-framework-item" onClick={() => { onFramework(framework.key); close(); }}><Layers3 size={18} aria-hidden="true" /><span><strong>{framework.label}</strong><small>{framework.clients.map(client => client.name).join(' · ')}</small></span><span className="pr-tag">{framework.client_count} {framework.client_count === 1 ? 'client' : 'clients'}</span><ArrowRight size={16} aria-hidden="true" /></button>)}</div>{!overview.data?.frameworks.length && <div className="pr-empty"><h3>No active frameworks in this view</h3><p>Adjust the portfolio filters.</p></div>}<p className="pr-help">Select a framework to filter the client register.</p></ReportState> : selected && selection ? <ProgramHistory report={history} programs={programs} selected={selected} onSelect={setSelected} onBack={() => { setSelected(''); setPanel({ type: 'progress' }); }} range={range} setRange={setRange} /> : <><div className="pr-panel-toolbar"><div><h3>Current position</h3><p className="pr-panel-context">{rows.length} clients in view{overview.data?.as_of && ` · ${dateTime(overview.data.as_of)}`}</p></div><RangeControls value={range} onChange={setRange} /></div><ReportState report={overview}>
          <Legend snapshots={programs.map(program => program.current)} />
          {programs.length ? <><div className="pr-comparison-head"><span>Client / framework</span><span>Implementation breakdown</span><span>Implemented</span><span>Captured-position change</span><span /></div><div className="pr-program-list">{programs.map(program => <button type="button" key={programId(program)} className="pr-program-row" onClick={() => setSelected(programId(program))} aria-label={`${program.client_name}, ${program.program_label}, ${rate(program.current)} implemented. View history`}><span className="pr-program-id"><span className="gp-client-initial" aria-hidden="true">{program.client_name.charAt(0)}</span><span><strong>{program.client_name}</strong><small>{program.program_label}</small>{program.scope_label && <small>{program.scope_label}</small>}</span></span><span><Stack snapshot={program.current} label={program.client_name} /><span className="pr-bar-subtext">{program.current?.denominator ?? '—'} in implementation denominator{program.current?.excluded > 0 && ` · ${program.current.excluded} excluded`}{(program.current?.notice || program.current?.reason) && ` · ${program.current.notice || program.current.reason}`}</span></span><span className="pr-rate-block"><ProgramCount snapshot={program.current} /></span><Delta comparison={program.comparison} /><ChevronRight size={15} aria-hidden="true" /></button>)}</div><p className="pr-help">Select a client program to explore its history.</p></> : <div className="pr-empty"><h3>No enabled client programs in this view</h3><p>Adjust the portfolio filters.</p></div>}
          <Coverage coverage={overview.data?.coverage} asOf={overview.data?.as_of} /><p className="pr-help"><Info size={14} aria-hidden="true" /><span>Implementation and verification remain separate. Scope changes are flagged instead of presented as like-for-like progress.</span></p>
        </ReportState></>}
      </div><div className="pr-panel-footer">Implementation is not verification.</div>
    </DialogContent></Dialog>
    <Sheet open={panel?.type === 'activity'} onOpenChange={isOpen => { if (!isOpen) close(); }}><SheetContent className="portfolio-report-panel pr-activity-panel" data-testid="portfolio-activity-panel" onOpenAutoFocus={rememberFocus} onCloseAutoFocus={restoreFocus}><SheetHeader className="pr-panel-header"><SheetTitle>Recent changes</SheetTitle><SheetDescription>Meaningful recorded changes across the current portfolio view.</SheetDescription></SheetHeader>{panel?.type === 'activity' && <ActivityPanel key={cohort + ':' + (panel.client_id || '')} rows={rows} cohort={cohort} includeArchived={includeArchived} asOf={overview.data?.as_of} initialClient={panel.client_id} onSource={event => { close(); onSource(event); }} />}<div className="pr-panel-footer">Committed business changes · read-only report</div></SheetContent></Sheet>
  </>;
}
