import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import api, {formatError} from '@/lib/api';
import {Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {X} from 'lucide-react';
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/components/ui/tabs';
import {grcLead} from '@/lib/clientRelationships';
import {applicableCounts, calendarRangeStart, currentPercentage, forecastImplementation, historyWindow, periodChange, programIdentity, snapshotTime, validImplementationPosition} from '@/lib/portfolioProgress';
import './PortfolioReports.css';

const DAY = 86400000;
const RANGES = [['1m', '1 month', 1], ['3m', '3 months', 3], ['6m', '6 months', 6], ['12m', '12 months', 12]];
const tone = key => ({addressed: 'implemented', in_progress: 'partial', needs_attention: 'not', not_assessed: 'unassessed'})[key];
const signed = (value, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;
const rate = value => currentPercentage(value) == null ? validImplementationPosition(value) && value.denominator === 0 ? 'N/A' : 'Unavailable' : `${currentPercentage(value).toFixed(1)}%`;
const identity = value => value.snapshot_id || `${snapshotTime(value)}:${value.source_revision || ''}`;
export const formatPortfolioDate = (value, options = {}) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...options}) : 'Unavailable';
const dateTime = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'}) : 'Unavailable';

export function scopeNote(change, unit = 'items') {
  const before = change.before?.denominator, after = change.after?.denominator;
  const implementedBefore = change.before?.implemented, implementedAfter = change.after?.implemented;
  const membership = change.membership_known === true
    ? [change.added_ids?.length ? `${change.added_ids.length} ${unit} added to scope.` : '', change.removed_ids?.length ? `${change.removed_ids.length} ${unit} removed from scope.` : ''].filter(Boolean).join(' ') || 'Scope membership or version changed.'
    : 'Scope changed.';
  return membership + (Number.isInteger(before) && Number.isInteger(after) ? ` Applicable went from ${before} to ${after}.` : '')
    + (Number.isInteger(implementedBefore) && Number.isInteger(implementedAfter) && implementedBefore !== implementedAfter ? ` Implemented went from ${implementedBefore} to ${implementedAfter}.` : '');
}

const scopeChangesForPosition = (changes, point) => changes.filter(change => change.after_snapshot_id
  ? change.after_snapshot_id === point.snapshot_id
  : change.after?.scope_signature === point.scope_signature && Date.parse(change.effective_at || change.at) === Date.parse(snapshotTime(point)));

// Tooltip content can change size with genuine counts, scope notes, fonts and pane width.
function observeTooltipLayout(container, tooltip, position, {scrollTarget, constrainWidth = false} = {}) {
  const measure = () => {
    const bounds = container.getBoundingClientRect();
    // A portaled status detail keeps the scale's width cap instead of inheriting the dialog's.
    if (constrainWidth) tooltip.style.maxWidth = `${bounds.width}px`;
    const size = tooltip.getBoundingClientRect();
    if (!bounds.width || !size.width) return;
    const point = position(bounds, size);
    tooltip.style.left = `${point.left}px`;
    tooltip.style.top = `${point.top}px`;
  };
  measure();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(container);
  observer?.observe(tooltip);
  window.addEventListener('resize', measure);
  scrollTarget?.addEventListener('scroll', measure);
  return () => { observer?.disconnect(); window.removeEventListener('resize', measure); scrollTarget?.removeEventListener('scroll', measure); };
}

function modalCanvasWidth(element, minimum) {
  const width = element?.getBoundingClientRect().width || 900;
  const body = element?.closest('.ph-body'), content = body?.firstElementChild;
  const bodyWidth = body?.getBoundingClientRect().width, contentWidth = content?.getBoundingClientRect().width;
  let gutter = 0;
  if (bodyWidth && contentWidth) {
    const style = getComputedStyle(body);
    const inset = ['borderLeftWidth', 'borderRightWidth', 'paddingLeft', 'paddingRight'].reduce((sum, property) => sum + (parseFloat(style[property]) || 0), 0);
    // The body's first child must fill its content width; recover the reference's pre-scroll canvas without rounding the gutter.
    gutter = Math.max(0, bodyWidth - inset - contentWidth);
  }
  return Math.max(minimum, Math.round(width + gutter));
}

function ChangeArrow({up}) {
  return <svg className="ph-change-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d={up ? 'M6 10V2.5M2.5 6 6 2.5 9.5 6' : 'M6 2v7.5M2.5 6 6 9.5 9.5 6'} /></svg>;
}

function ForecastTimeline({asOf, estimatedAt}) {
  const start = Date.parse(asOf), estimate = Date.parse(estimatedAt);
  const year = new Date(start).getUTCFullYear(), nextYear = Date.UTC(year + 1, 0, 1);
  const end = Math.max(Date.UTC(year + 2, 0, 1), estimate + 30 * DAY);
  const x = value => 4 + (value - start) / (end - start) * 252;
  return <svg className="ph-forecast-timeline" width="100%" height="48" role="img" aria-label={`Pace-based completion estimate ${formatPortfolioDate(estimatedAt, {day: undefined})}`}>
    <line x1="1.538%" x2="98.462%" y1="24" y2="24" className="ph-timeline-axis" />
    {[[start,'Today','start'],[nextYear,String(year + 1),'middle'],[end,String(new Date(end).getUTCFullYear()),'end']].map(([at,label,anchor]) => <g key={at}>
      <line x1={`${x(at)/260*100}%`} x2={`${x(at)/260*100}%`} y1="20" y2="28" className="ph-timeline-axis" />
      {(anchor !== 'middle' || x(at) > 64 && x(at) < 212) && <text x={`${x(at)/260*100}%`} y="44" textAnchor={anchor}>{label}</text>}
    </g>)}
    <circle cx={`${x(estimate)/260*100}%`} cy="24" r="5" className="ph-marker" />
    <text className="ph-timeline-label" x={`${Math.min(218,Math.max(42,x(estimate)))/260*100}%`} y="12" textAnchor="middle">{formatPortfolioDate(estimatedAt, {day: undefined})}</text>
  </svg>;
}

// Keep the reporting reasons intact in the read model; present concise user-facing states here.
function forecastExplanation(forecast) {
  if (forecast.ok) return forecast.monthly_pace != null
    ? `Based on the current pace of about ${forecast.monthly_pace.toFixed(1)} items a month, if scope stays the same.` : forecast.note;
  const reason = forecast.reason || '';
  if (reason.includes('Scope changed')) return 'Scope changed. An estimate needs three saved positions spanning 60 days on the new scope.';
  if (reason.includes('three genuine') || reason.includes('No genuine')) return 'Needs three saved positions spanning 60 days on the current scope.';
  if (reason.includes('No positive')) return 'No net gain in the latest 90 days on the current scope.';
  if (reason.includes('30 days old')) return 'A recent assessment update is needed.';
  if (reason.includes('match') || reason.includes('source revision') || reason.includes('invalid or unavailable')) return 'Assessment history is not ready for an estimate.';
  return reason;
}

export function programLanguage(program) {
  const achieved = applicableCounts(program.current)[0]?.label?.toLowerCase().includes('achieved');
  return {unit: program.unit_label || program.unit || (program.framework_key === 'cis-ig1' ? 'safeguards' : program.framework_key === 'soc-2' ? 'criteria' : program.framework_key === 'iso-27001' ? 'requirements and controls' : 'items'),
    noun: program.noun || (achieved ? 'achievement' : 'implementation'), verb: program.verb || (achieved ? 'achieved' : 'implemented')};
}

export function PortfolioStatusBar({snapshot}) {
  const valid = validImplementationPosition(snapshot), counts = valid ? applicableCounts(snapshot) : [], total = snapshot?.denominator;
  return <span className="gp-statusbar" role="img" aria-label={`Applicable status counts: ${counts.map(value => `${value.count} ${value.label}`).join(', ') || 'unavailable'}`}>
    {currentPercentage(snapshot) != null && counts.map(value => value.count > 0 && <span key={value.key} className={`is-${tone(value.key)}`} style={{flexGrow: value.count}} />)}
    {valid && total === 0 && <span className="sr-only">No applicable scope</span>}
  </span>;
}

export function sparklineSpan(programs, asOf) {
  if (!Number.isFinite(Date.parse(asOf))) return 8;
  const start = new Date(Date.parse(asOf) - 90 * DAY).toISOString();
  let span = 0;
  for (const program of programs) {
    const rates = historyWindow(program.snapshots_90d, start, asOf, program.comparison_90d).map(currentPercentage).filter(value => value != null);
    if (rates.length > 1) span = Math.max(span, Math.max(...rates) - Math.min(...rates));
  }
  return Math.max(8, span * 1.12);
}

export function PortfolioSparkline({program, asOf, span}) {
  const start = new Date(Date.parse(asOf) - 90 * DAY).toISOString();
  const points = historyWindow(program.snapshots_90d, start, asOf, program.comparison_90d).filter(point => currentPercentage(point) != null);
  const percentages = points.map(currentPercentage), middle = points.length ? (Math.min(...percentages) + Math.max(...percentages)) / 2 : 0;
  const x = point => 3 + (Date.parse(point.display_at || snapshotTime(point)) - Date.parse(start)) / (90 * DAY) * 128;
  const y = point => 26 - (currentPercentage(point) - (middle - span / 2)) / span * 22;
  return <svg className="gp-sparkline" viewBox="0 0 136 30" aria-hidden="true" data-start={start} data-end={asOf}>
    <line className="gp-spark-base" x1="2" x2="134" y1="29" y2="29" />
    {points.length > 1 && <path className="gp-spark-line" d={points.map((point,index) => {
      const previous = points[index-1];
      const continuous = previous?.continuity_proven === true && Date.parse(previous.effective_until) >= Date.parse(snapshotTime(point));
      return continuous ? `H${x(point)}V${y(point)}` : `M${x(point)},${y(point)}`;
    }).join(' ')} />}
    {points.slice(0, -1).map(point => <circle key={identity(point)} className="gp-spark-position" cx={x(point)} cy={y(point)} r="2" fill="var(--chart-implemented)" />)}
    {points.length > 0 && <circle className="gp-spark-end" cx={x(points.at(-1))} cy={y(points.at(-1))} r="3" />}
  </svg>;
}

function useHistory(client, program, range, refreshToken, requireIdentity = false) {
  const key = JSON.stringify([client.client_id, program.program_key, range]);
  const [state, setState] = useState({key: '', data: null, loading: true, error: ''}), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState(previous => ({key, data: previous.key === key ? previous.data : null, loading: true, error: ''}));
    const [client_id, program_key, selectedRange] = JSON.parse(key);
    api.get('/portfolio/reporting/history', {params: {client_id, program_key, range: selectedRange, include_archived: false}, signal: controller.signal}).then(({data}) => {
      if (!Array.isArray(data?.snapshots) || !data.current || !Number.isFinite(Date.parse(data.as_of))) throw new Error('The history response is incomplete.');
      if (data.client_id && data.client_id !== client_id || data.program_key && data.program_key !== program_key) throw new Error('The history does not belong to the selected client program.');
      if(requireIdentity && (data.client_id !== client_id || data.program_key !== program_key)) throw new Error('The history program identity is unavailable.');
      if(requireIdentity && client_id === 'demo_brawndo' && program_key === 'cis-ig1'
        && (data.current.scope?.framework_key !== 'cis-ig1' || data.current.scope?.catalog_version !== '8.1'
          || data.current.scope?.configuration?.implementation_group !== 1)) throw new Error('The CIS history scope does not match the configured IG1 program.');
      if (active) setState({key, data, loading: false, error: ''});
    }).catch(failure => { if (active) setState({key, data: null, loading: false, error: formatError(failure)}); });
    return () => { active = false; controller.abort(); };
  }, [key, attempt, refreshToken, requireIdentity]);
  return {...(state.key === key ? state : {data: null, loading: true, error: ''}), retry: () => setAttempt(value => value + 1)};
}

function CurrentStatusBreakdown({current, onStatusNavigate, inline = false}) {
  const [activeStatus, setActiveStatus] = useState(null);
  const [width, setWidth] = useState(900);
  const scale = useRef(null), bar = useRef(null), tooltip = useRef(null);
  const tooltipHost = !inline ? scale.current?.closest('.portfolio-history-dialog') : null;
  useLayoutEffect(() => {
    if (inline || !scale.current) return;
    const measure = () => setWidth(modalCanvasWidth(scale.current, 280));
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(scale.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [inline, current]);
  useLayoutEffect(() => {
    if (inline || !activeStatus || !validImplementationPosition(current) || !scale.current || !tooltip.current) return;
    const values = applicableCounts(current), selectedIndex = values.findIndex(value => value.key === activeStatus);
    if (selectedIndex < 0) return;
    const before = values.slice(0, selectedIndex).reduce((total, value) => total + value.count, 0);
    return observeTooltipLayout(scale.current, tooltip.current, (bounds, size) => {
      const barBounds = bar.current.getBoundingClientRect();
      const hostBounds = tooltipHost?.getBoundingClientRect() || bounds;
      const share = current.denominator > 0 ? (before + values[selectedIndex].count / 2) / current.denominator : .5;
      const center = barBounds.left - bounds.left + share * barBounds.width;
      return {left:bounds.left - hostBounds.left + Math.max(0, Math.min(bounds.width - size.width, center - size.width / 2)), top:barBounds.top - hostBounds.top - size.height - 10};
    }, {scrollTarget:tooltipHost?.querySelector('.ph-body'), constrainWidth:!!tooltipHost});
  }, [activeStatus, current, inline, tooltipHost, width]);
  if (!validImplementationPosition(current)) {
    return <div className="ph-breakdown"><p>Applicable scope unavailable. {current?.reason || current?.notice || 'Current counts are unavailable.'}</p></div>;
  }
  const counts = applicableCounts(current), total = current.denominator;
  const assessed = total - counts.find(value => value.key === 'not_assessed').count;
  const share = value => total > 0 ? `${(value.count / total * 100).toFixed(1)}%` : 'N/A';
  const interactions = key => ({
    onPointerEnter: () => setActiveStatus(key),
    onPointerLeave: () => setActiveStatus(null),
    onFocus: () => setActiveStatus(key),
    onBlur: () => setActiveStatus(null),
    onClick: () => { setActiveStatus(key); onStatusNavigate?.(key); }
  });
  const selected = counts.find(value => value.key === activeStatus);
  const detail = selected && <div ref={tooltip} className="ph-segment-detail" role="status"><span className={!inline ? 'ph-tip-status-label' : undefined}>{!inline && <i className={`ph-dot is-${tone(selected.key)}`} aria-hidden="true" />}{selected.label}</span><b>{share(selected)}</b><span>{selected.count} / {total}</span></div>;
  const composition = <div ref={bar} className="ph-interactive-bar" role="group" aria-label="Current status composition">
    {total > 0 && counts.filter(value => value.count > 0).map(value => <button
      type="button" key={value.key} {...interactions(value.key)}
      className={`is-${tone(value.key)} ${activeStatus && activeStatus !== value.key ? 'is-dim' : ''}`}
      style={inline ? {flexGrow:value.count} : {flexGrow:0,width:`${value.count / total * 100}%`}} aria-pressed={activeStatus === value.key}
      aria-label={`${value.label}: ${share(value)}, ${value.count} of ${total}`} />)}
    {inline && detail}
  </div>;
  const cells = counts.map(value => <button type="button" key={value.key} {...interactions(value.key)}
    className={`ph-breakdown-row ${activeStatus === value.key ? 'is-active' : ''}`} aria-pressed={activeStatus === value.key}>
    <span className="ph-breakdown-label"><i className={`ph-dot is-${tone(value.key)}`} aria-hidden="true" />{value.label}</span>
    {!inline && <span className="ph-breakdown-track" aria-hidden="true"><span className={`is-${tone(value.key)}`} style={{width:total > 0 ? `${value.count / total * 100}%` : 0}} /></span>}
    <span className="ph-breakdown-value"><b>{share(value)}</b><span>{value.count}{inline ? ' of ' : ' / '}{total}</span></span>
  </button>);
  return <div className="ph-breakdown">
    {inline && <div className="ph-breakdown-head"><span>Status of {total} applicable safeguards</span><span>Assessed {assessed} of {total} · {total ? (assessed/total*100).toFixed(1)+'%' : 'N/A'}</span></div>}
    <div ref={scale} className="ph-status-scale">
      {inline ? composition : <svg className="ph-composition-canvas" viewBox={`0 0 ${width} 62`} width={width} height="62" role="presentation">
        <foreignObject x="4" y="24" width={width - 8} height="14" overflow="visible">{composition}</foreignObject>
        {[0,100].map(value => <text key={value} x={value ? width - 4 : 4} y="56" textAnchor={value ? 'end' : 'start'} aria-hidden="true">{value}%</text>)}
      </svg>}
      {/* Keep modal status details above the scrolling body, inside the native dialog. */}
      {!inline && (tooltipHost ? createPortal(detail, tooltipHost) : detail)}
    </div>
    {!inline && <div className="ph-breakdown-head"><span>Breakdown</span><span>Assessed {assessed} of {total} · {total ? (assessed/total*100).toFixed(1)+'%' : 'N/A'}</span></div>}
    {inline ? <div className="ph-breakdown-cells">{cells}</div> : cells}
  </div>;
}

export default function PortfolioHistoryDialog({client, programs, selected, onSelect, onClose, onCloseAutoFocus, onNavigate, chartView = 'line', onChartViewChange, refreshToken, asOf: overviewAsOf, inline = false, onStatusNavigate, referenceHistory = false}) {
  const [range, setRange] = useState('6m'), [showData, setShowData] = useState(false);
  const historyView = referenceHistory ? 'line' : chartView;
  const program = programs.find(value => programIdentity(value) === selected);
  const report = useHistory(client, program, range, refreshToken, inline);
  const current = report.data?.current || program.current || {}, asOf = report.data?.as_of || overviewAsOf || current.retrieved_at || current.captured_at;
  const language = programLanguage({...program, current}), months = RANGES.find(([key]) => key === range)[2], start = calendarRangeStart(asOf, months);
  const points = historyWindow(report.data?.snapshots, start, asOf, report.data?.comparison), scopeChanges = report.data?.scope_changes || [];
  const comparison = periodChange(report.data?.snapshots, current, start, {comparison: report.data?.comparison, scopeChanges});
  const forecast = forecastImplementation(report.data?.forecast_snapshots, current, asOf, {scopeChanges: report.data?.forecast_scope_changes, verb: language.verb});
  const percentage = currentPercentage(current), valid = validImplementationPosition(current), noScope = valid && current.denominator === 0;
  const counts = applicableCounts(current);
  const retained = [...new Map([...(report.data?.snapshots || []), ...(report.data?.forecast_snapshots || []), ...(report.data?.comparison?.baseline ? [report.data.comparison.baseline] : [])]
    .filter(point => Number.isFinite(Date.parse(snapshotTime(point))))
    .map(point => [identity(point), point])).values()].sort((a,b) => Date.parse(snapshotTime(a))-Date.parse(snapshotTime(b)));
  const historySpan = retained.length > 1 ? Math.floor((Date.parse(snapshotTime(retained.at(-1)))-Date.parse(snapshotTime(retained[0])))/DAY) : 0;
  const sparseModal = !inline && !!report.data && !report.error && valid && !noScope && (current.not_started || retained.length < 2);
  const lead = grcLead(client);
  const referenceFooter = referenceHistory && <div className={inline ? 'ph-foot ph-reference-foot ph-inline-foot' : 'ph-foot ph-reference-foot'}>
    {!inline && program.framework_key === 'soc-2' ? 'Internal readiness, not an auditor opinion.' : 'Assessment progress, not a compliance determination.'} Estimated completion is based on implementation progress over the latest 90 days.
  </div>;
  const details = <>
    <div className="ph-program-head"><div><h3>{inline ? 'CIS IG1 Status' : `${program.program_label} Status`}</h3><span className="sr-only">{program.scope_label}</span></div><button type="button" className="ph-link" onClick={() => onNavigate(program.to)}>Open {program.program_label} workspace →</button></div>
    <div className="ph-current-overview">
      <div className="ph-current-value"><span>Current implementation</span><strong className={percentage == null || current.not_started ? 'is-text' : ''}>{percentage != null ? current.not_started ? 'Not started' : <>{percentage.toFixed(1)}<span className="ph-unit">%</span></> : noScope ? 'No applicable scope' : 'Unavailable'}</strong><p>{percentage != null ? current.not_started ? `0 of ${current.denominator} ${language.unit} assessed` : `${current.implemented} of ${current.denominator} ${language.unit} ${language.verb}` : current.reason || current.notice || 'No applicable implementation units.'}</p><small>As of {dateTime(current.effective_at || current.captured_at || asOf)}</small></div>
      <CurrentStatusBreakdown key={selected} current={current} onStatusNavigate={onStatusNavigate} inline={inline} />
    </div>
    <div className="ph-range"><div className="ph-segmented" role="group" aria-label="History period">{RANGES.map(([key, label]) => <button key={key} type="button" aria-pressed={key === range} onClick={() => setRange(key)}>{label}</button>)}</div><span>{formatPortfolioDate(start)} – {formatPortfolioDate(asOf)} · UTC</span></div>
    <div className="ph-history-panel">{sparseModal ? <div className="ph-metrics ph-metrics-sparse"><div className="ph-metric ph-sparse-card">
      <span>Trend and estimated completion</span>
      <strong className="is-text">{current.not_started ? 'Available after the assessment starts' : 'Available after more saved history'}</strong>
      <p>Change over time needs a second saved position. Estimated completion needs comparable positions spanning 60 days within the latest 90 days.</p>
      <div className="ph-history-meters">
        {[["Saved positions",retained.length,3,`${retained.length} retained`],["History span",historySpan,60,`${historySpan} days`]].map(([label,value,target,caption]) => <div className="ph-history-meter" key={label}>
          <span>{label} · {caption}</span><div className="ph-meter-track" aria-hidden="true"><span style={{width:Math.min(100,value/target*100)+'%'}} /></div>
        </div>)}
      </div>
      {retained.length > 0 && <small>Tracking since {dateTime(snapshotTime(retained[0]))}</small>}
    </div></div> : <div className="ph-metrics">

      <div className="ph-metric"><span>Change · {RANGES.find(([key]) => key === range)[1]}</span>
        <strong className={[comparison.comparable ? comparison.change_pp > 0 ? 'is-up' : comparison.change_pp < 0 ? 'is-down' : '' : 'is-text', !inline && comparison.comparable && comparison.change_pp !== 0 ? 'ph-change-figure' : ''].filter(Boolean).join(' ')}>
          {comparison.comparable ? comparison.change_pp === 0 ? 'No change' : <>
            <span className={`ph-change-badge ${comparison.change_pp > 0 ? 'is-up' : 'is-down'}`} aria-hidden="true">{inline ? comparison.change_pp > 0 ? '↗' : '↘' : <ChangeArrow up={comparison.change_pp > 0} />}</span>
            {inline ? <>{signed(comparison.change_pp)}<span className="ph-unit"> pts</span></> : <span>{signed(comparison.change_pp)}<span className="ph-unit"> pts</span></span>}
          </> : 'Change unavailable'}
        </strong>
        <p>{comparison.comparable ? `${signed(comparison.change_count, 0)} ${language.verb} · from ${rate(comparison.baseline)} on ${formatPortfolioDate(snapshotTime(comparison.baseline))}` : report.loading ? 'Loading saved period history…' : report.error || (comparison.baseline ? 'The saved positions are not comparable.' : 'No saved baseline for the start of this period.')}</p>{comparison.scope_changed && <small>{Number.isInteger(comparison.baseline?.denominator) && Number.isInteger(current.denominator) ? `Scope changed (${comparison.baseline.denominator} → ${current.denominator} applicable).` : 'Scope changed.'}</small>}</div>
      <div className="ph-metric"><span>Estimated completion</span><strong className={forecast.ok ? '' : 'is-text'}>{forecast.ok ? forecast.estimated_at ? formatPortfolioDate(forecast.estimated_at, {day:undefined}) : forecast.label : 'Not estimated yet'}</strong>{forecast.estimated_at && <ForecastTimeline asOf={asOf} estimatedAt={forecast.estimated_at} />}<p>{forecastExplanation(forecast)}</p></div>
    </div>}
    <div className="ph-chart-card">
      <div className="ph-chart-top"><div><h4>Implementation history</h4><p>{historyView === 'mix' ? `Share of applicable ${language.unit} in each status at each saved position` : `${counts[0]?.label || 'Implemented'} ${language.unit} as a share of applicable scope`}</p></div><div className="ph-chart-tools">{!referenceHistory && <details className="ph-chart-options"><summary>Chart view</summary><div className="ph-segmented" role="group" aria-label="Chart view">{[['line', 'Implemented'], ['mix', 'Status mix']].map(([key, label]) => <button key={key} type="button" aria-pressed={key === chartView} onClick={() => onChartViewChange(key)}>{label}</button>)}</div></details>}<button type="button" className="ph-link" aria-expanded={showData} aria-controls="portfolio-history-data" onClick={() => setShowData(value => !value)}>{showData ? 'Hide data' : 'View data'}</button></div></div>
      {report.loading && !report.data ? <div className="ph-empty" role="status">Loading saved history…</div> : report.error ? <div className="ph-empty" role="alert"><p>{report.error}</p><button type="button" className="ph-link" onClick={report.retry}>Retry</button></div> : <>
        <PortfolioHistoryChart key={selected + ':' + range} points={points} start={start} asOf={asOf} view={historyView} current={current} scopeChanges={scopeChanges} unit={language.unit} inline={inline} referenceHistory={referenceHistory} />
        {scopeChanges.length > 0 && <div className="ph-scope-notes">{scopeChanges.map((change,index) => <p key={index}>{formatPortfolioDate(change.effective_at || change.at)}: {scopeNote(change,language.unit)}</p>)}</div>}
        {showData && <div className="ph-data" id="portfolio-history-data"><table><caption className="sr-only">Genuine implementation positions, newest effective date first</caption><thead><tr><th scope="col">Position date</th>{counts.map(value => <th scope="col" key={value.key}>{value.label}</th>)}<th scope="col">Applicable</th><th scope="col">{counts[0]?.label || 'Implemented'} %</th></tr></thead><tbody>{[...points].reverse().map(point => <tr key={identity(point)}><td>{dateTime(snapshotTime(point))}{point.carried && <small>In effect at period start</small>}{point.effective_at && point.captured_at && Date.parse(point.effective_at) !== Date.parse(point.captured_at) && <small>Captured {dateTime(point.captured_at)}</small>}{scopeChangesForPosition(scopeChanges, point).map((change,index)=><small key={index}>{scopeNote(change, language.unit)}</small>)}</td>{counts.map(value => <td key={value.key}>{validImplementationPosition(point) ? applicableCounts(point).find(item => item.key === value.key)?.count ?? '—' : 'Unavailable'}</td>)}<td>{validImplementationPosition(point) ? point.denominator : 'Unavailable'}</td><td>{rate(point)}</td></tr>)}</tbody></table>{!points.length && <p className="ph-empty">No saved positions in this period.</p>}</div>}
      </>}

    </div></div>
  </>;
  if (inline) return <section className="brawndo-demo-program" data-reference-history={referenceHistory ? 'true' : undefined} aria-label="CIS IG1 Status">
    {details}
    {referenceFooter}
  </section>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="portfolio-history-dialog" data-testid="portfolio-history-dialog" onCloseAutoFocus={onCloseAutoFocus}>
    <div className="ph-head"><div className="ph-client"><span className="gp-client-initial" aria-hidden="true">{client.name?.trim().charAt(0)}</span><div><DialogTitle>{client.name}</DialogTitle><DialogDescription>GRC Lead · {lead.name} · {client.industry || 'Industry not recorded'}</DialogDescription></div></div><div className="ph-head-actions"><button type="button" className="ph-button" onClick={() => onNavigate('/dashboard')}>Open client portal</button><DialogClose className="ph-close" aria-label="Close"><X aria-hidden="true" /></DialogClose></div></div>
    <div className="ph-body">{programs.length > 1 ? <Tabs value={selected} onValueChange={onSelect}><TabsList aria-label="Client frameworks" className="ph-tabs">{programs.map(value => {
      const valid = validImplementationPosition(value.current);
      const summary = !valid ? 'Unavailable' : value.current.denominator === 0 ? 'No applicable scope' : value.current.not_started ? 'Not started' : `${rate(value.current)} ${programLanguage(value).verb}`;
      return <TabsTrigger key={programIdentity(value)} value={programIdentity(value)} className="ph-tab"><span>{value.program_label}</span><small>{summary}</small></TabsTrigger>;
    })}</TabsList><TabsContent value={selected} className="ph-tab-content">{details}</TabsContent></Tabs> : details}</div>
    {referenceFooter}

  </DialogContent></Dialog>;
}

function historyTicks(start, asOf, width) {
  const first=Date.parse(start), last=Date.parse(asOf), ticks=[];
  if (last-first<=45*DAY) {
    for(let at=first;at<=last;at+=7*DAY) ticks.push(new Date(at).toISOString());
  } else {
    const date=new Date(first); date.setUTCDate(1); date.setUTCHours(12,0,0,0); date.setUTCMonth(date.getUTCMonth()+1);
    while(date.getTime()<=last) { ticks.push(date.toISOString()); date.setUTCMonth(date.getUTCMonth()+1); }
  }
  const stride=Math.max(1,Math.ceil(ticks.length/(width<520 ? 3 : 6)));
  return ticks.filter((_,index)=>index%stride===0);
}

export function PortfolioHistoryChart({points, start, asOf, view, current, scopeChanges, unit = 'items', inline = false, referenceHistory = false}) {
  const box = useRef(null), svg = useRef(null), tooltip = useRef(null);
  const chartId = useId().replace(/:/g, '');
  const [width, setWidth] = useState(900), [active, setActive] = useState(null), [engaged, setEngaged] = useState(false);
  useEffect(() => {
    const measure = () => setWidth(inline ? Math.max(300, Math.round(box.current?.getBoundingClientRect().width || 900)) : modalCanvasWidth(box.current, 300));
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (observer) observer.observe(box.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [inline]);
  const selected = points.find(point => identity(point) === active) || points.at(-1);
  const low = 0, high = 100;
  const height = inline ? 284 : 296, left = 44, right = width - 72, top = inline ? 32 : 26, bottom = height - 30;
  const x = point => left + (Date.parse(point.display_at || snapshotTime(point)) - Date.parse(start)) / (Date.parse(asOf) - Date.parse(start)) * (right - left);
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  const step = high - low <= 30 ? 5 : high - low <= 60 ? 10 : 25, ticks = [];
  for (let value = low; value <= high; value += step) ticks.push(value);
  let line = '', previous = null;
  for (const point of points) {
    const percentage = currentPercentage(point);
    if (percentage == null) { previous = null; continue; }
    const continuous = previous && previous.continuity_proven === true && Date.parse(previous.effective_until) >= Date.parse(snapshotTime(point));
    line += continuous ? `H${x(point)}V${y(percentage)} ` : `M${x(point)},${y(percentage)} `;
    previous = point;
  }
  const selectedValid = validImplementationPosition(selected);
  const nearest = event => {
    if (!points.length) return;
    const rect = svg.current.getBoundingClientRect();
    if (!rect.width) return;
    const pointer = (event.clientX - rect.left) / rect.width * width;
    setEngaged(true);
    setActive(identity(points.reduce((best, point) => Math.abs(x(point) - pointer) < Math.abs(x(best) - pointer) ? point : best, points[0])));
  };
  const keyboard = event => {
    if (!points.length) return;
    let index = points.indexOf(selected);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = points.length - 1;
    else if (event.key === 'ArrowLeft') index = Math.max(0, index - 1);
    else if (event.key === 'ArrowRight') index = Math.min(points.length - 1, index + 1);
    else return;
    event.preventDefault(); setEngaged(true); setActive(identity(points[index]));
  };
  const shadeEnd = points.length ? x(points[0]) : right;
  const endpoint = points.at(-1);
  const endpointMatches = endpoint && validImplementationPosition(endpoint) && validImplementationPosition(current)
    && endpoint.scope_signature === current.scope_signature && endpoint.source_revision === current.source_revision;
  const endpointPercentage = endpointMatches ? currentPercentage(current) : null;
  const endpointLabel = endpointPercentage == null ? '' : `${endpointPercentage.toFixed(1)}%`;
  const endpointWidth = inline ? 54 : endpointLabel.length * 7 + 14;
  const savedEndpointPercentage = endpointMatches ? currentPercentage(endpoint) : null;
  const showCompleteLabel = inline && referenceHistory && endpointPercentage != null && savedEndpointPercentage != null
    && Math.abs(y(savedEndpointPercentage) - y(100)) > 24;
  const tooltipAnchorX = selected ? x(selected) : 0, tooltipAnchorY = selected ? y(currentPercentage(selected) ?? 0) : 0;
  useLayoutEffect(() => {
    if (inline || !engaged || !selected || !tooltip.current || !box.current) return;
    return observeTooltipLayout(box.current, tooltip.current, (bounds, size) => {
      const chartBounds = svg.current.getBoundingClientRect();
      const anchorX = tooltipAnchorX * chartBounds.width / width;
      const anchorY = tooltipAnchorY * chartBounds.height / height;
      const after = anchorX + 14;
      const left = after + size.width > bounds.width ? anchorX - 14 - size.width : after;
      return {left:Math.max(0, Math.min(bounds.width - size.width, left)), top:Math.max(0, Math.min(chartBounds.height - size.height, anchorY - 30))};
    });
  }, [engaged, selected, inline, width, height, tooltipAnchorX, tooltipAnchorY, view]);
  return <div ref={box} className="ph-chart">
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" tabIndex={points.length ? 0 : undefined} aria-label="Implementation history over the selected period. Use Left, Right, Home and End to read genuine positions." onKeyDown={keyboard} onFocus={() => setEngaged(true)} onBlur={() => {setActive(null);setEngaged(false);}}>
      <title>Implementation history</title><desc>Each marker is a saved observation at its genuine effective date. The text readout and View data provide exact counts.</desc>
      <defs><pattern id={`${chartId}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" className="ph-hatch-line" /></pattern><linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-implemented)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--chart-implemented)" stopOpacity=".02"/></linearGradient></defs>
      {shadeEnd - left >= 130 && points.length > 0 && <g><rect x={left} y={top} width={shadeEnd-left} height={bottom-top} fill={`url(#${chartId}-hatch)`}/><text className="ph-before-tracking" x={(left+shadeEnd)/2} y={(top+bottom)/2} textAnchor="middle">Before tracking began</text></g>}
      {ticks.map(value => <g key={value}><line className={value === 0 ? 'ph-axis' : value === 100 ? 'ph-target' : 'ph-grid'} x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={left - 8} y={y(value) + 4} textAnchor="end">{`${value}%`}</text></g>)}
      {view === 'line' && points.slice(1).map((point, index) => {
        const previous = points[index];
        if (previous.continuity_proven !== true || !(Date.parse(previous.effective_until) >= Date.parse(snapshotTime(point))) || currentPercentage(previous) == null) return null;
        return <path key={identity(point)} d={`M${x(previous)},${bottom}V${y(currentPercentage(previous))}H${x(point)}V${bottom}Z`} fill={`url(#${chartId}-area)`} />;
      })}
      {view === 'mix' && points.map(point => {
        if (currentPercentage(point) == null) return null;
        let sum = 0;
        return <g key={identity(point)}>{applicableCounts(point).map(value => {
          const before = sum; sum += value.count / point.denominator * 100;
          return <rect key={value.key} className={`ph-band is-${tone(value.key)}`} x={x(point) - 6} width={12} y={y(sum)} height={Math.max(0, y(before) - y(sum))} />;
        })}</g>;
      })}
      <path className="ph-line" d={line} />
      {endpointPercentage != null && <g><rect className="ph-current-flag" x={right+9} y={y(endpointPercentage)-11} width={endpointWidth} height="22" rx="6"/><text className="ph-current-flag-label" x={right+9+endpointWidth/2} y={y(endpointPercentage)+4} textAnchor="middle" >{endpointLabel}</text></g>}
      {showCompleteLabel && <text x={right+9} y={y(100)+4}>Complete</text>}
      {points.map(point => currentPercentage(point) != null && <circle key={identity(point)} className="ph-marker" cx={x(point)} cy={y(currentPercentage(point))} r={4} />)}
      {scopeChanges.filter(change => Date.parse(change.effective_at || change.at) >= Date.parse(start) && Date.parse(change.effective_at || change.at) <= Date.parse(asOf)).map((change, index) => <g key={index}><line className="ph-scope-marker" x1={x({effective_at: change.effective_at || change.at})} x2={x({effective_at: change.effective_at || change.at})} y1={top} y2={bottom} /><text x={Math.min(x({effective_at: change.effective_at || change.at}) + 6, right - 90)} y={top + 15}>{change.before?.denominator != null && change.after?.denominator != null ? `Scope ${change.before.denominator} → ${change.after.denominator}` : 'Scope changed'}</text></g>)}
      {historyTicks(start,asOf,width).map(at => <text key={at} x={x({effective_at:at})} y={height-8} textAnchor="middle">{formatPortfolioDate(at,{year:undefined,...(Date.parse(asOf)-Date.parse(start)>45*DAY ? {day:undefined} : {})})}</text>)}
      {!points.length && <text className="ph-chart-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">No saved positions in this period</text>}
      {engaged && selected && <><line className="ph-crosshair" x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} />{currentPercentage(selected) != null && <circle className="ph-active" cx={x(selected)} cy={y(currentPercentage(selected))} r={inline ? 5.5 : 6} />}</>}
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="transparent" onPointerMove={nearest} onPointerDown={nearest} onPointerLeave={() => { if (document.activeElement !== svg.current) {setActive(null);setEngaged(false);} }} />
    </svg>
    {view === 'line' && (low > 0 || high < 100) && <p className="ph-axis-disclosure">Vertical axis zoomed to the data range ({low}–{high}%).</p>}
    {engaged && selected && <div ref={tooltip} className="ph-history-tip" style={inline ? {left:Math.max(0,Math.min(width-270,x(selected)+14)) / width * 100+'%',top:Math.max(0,Math.min(100,y(currentPercentage(selected) ?? 0)-30)) * (box.current?.clientWidth || width) / width} : undefined}>
      <div className="ph-tip-date">{selected.carried ? 'In effect at period start · saved ' : 'Saved '}{formatPortfolioDate(snapshotTime(selected))}</div>
      <strong>{rate(selected)}</strong><p>{selectedValid ? `${selected.implemented} of ${selected.denominator} ${unit} implemented` : selected.reason || 'Implementation unavailable'}</p>
      {selectedValid && <div className="ph-tip-rows">{applicableCounts(selected).map(value => <div key={value.key}><span><i className={`ph-dot is-${tone(value.key)}`} />{value.label}</span><b>{value.count}</b></div>)}</div>}
      {scopeChangesForPosition(scopeChanges,selected).map((change,index)=><p className="ph-tip-scope" key={index}>{scopeNote(change,unit)}</p>)}
    </div>}
    <div className="ph-readout sr-only" aria-live="polite">{selected ? <><strong>{dateTime(snapshotTime(selected))}</strong>{selectedValid ? <>{applicableCounts(selected).map(value => <span key={value.key}><i className={`ph-dot is-${tone(value.key)}`} aria-hidden="true" />{value.label} {value.count}{value.key === 'addressed' && ` · ${rate(selected)}`}</span>)}<span>of {selected.denominator} applicable</span></> : <><span>Implementation/counts unavailable</span><span>{selected.reason || selected.notice || 'This saved position has unavailable implementation data.'}</span></>}{scopeChangesForPosition(scopeChanges, selected).map((change,index)=><span key={index}>{scopeNote(change, unit)}</span>)}{selected.effective_at && selected.captured_at && Date.parse(selected.effective_at) !== Date.parse(selected.captured_at) && <span>Captured {dateTime(selected.captured_at)}</span>}</> : <span>No saved position selected.</span>}</div>
  </div>;
}
