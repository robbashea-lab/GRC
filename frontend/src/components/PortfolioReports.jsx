import {useEffect, useRef, useState} from 'react';
import api, {formatError} from '@/lib/api';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
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

function ForecastTimeline({asOf, estimatedAt}) {
  const start = Date.parse(asOf), estimate = Date.parse(estimatedAt), end = Math.max(start + 180 * DAY, estimate + 30 * DAY);
  const x = value => 8 + (value - start) / (end - start) * 264;
  return <svg className="ph-forecast-timeline" viewBox="0 0 280 54" role="img" aria-label={`Pace-based completion estimate ${formatPortfolioDate(estimatedAt, {day: undefined})}`}>
    <line x1="8" x2="272" y1="24" y2="24" className="ph-grid" />
    <line x1="8" x2={x(estimate)} y1="24" y2="24" className="ph-line" strokeDasharray="4 4" />
    <circle cx={x(estimate)} cy="24" r="5" className="ph-marker" />
    <text x="8" y="49">Today</text><text x="272" y="49" textAnchor="end">{formatPortfolioDate(new Date(end).toISOString(), {day: undefined})}</text>
    <text x={Math.min(218,Math.max(62,x(estimate)))} y="12" textAnchor="middle">{formatPortfolioDate(estimatedAt, {day: undefined})}</text>
  </svg>;
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
  const cells = counts.map(value => <button type="button" key={value.key} {...interactions(value.key)}
    className={`ph-breakdown-row ${activeStatus === value.key ? 'is-active' : ''}`} aria-pressed={activeStatus === value.key}>
    <span><i className={`ph-dot is-${tone(value.key)}`} aria-hidden="true" />{value.label}</span>
    <span>{share(value)}</span><strong>{value.count} / {total}</strong>
  </button>);
  return <div className="ph-breakdown">
    <div className="ph-interactive-bar" role="group" aria-label="Current status composition">
      {total > 0 && counts.filter(value => value.count > 0).map(value => <button
        type="button" key={value.key} {...interactions(value.key)}
        className={`is-${tone(value.key)} ${activeStatus && activeStatus !== value.key ? 'is-dim' : ''}`}
        style={{flexGrow: value.count}} aria-pressed={activeStatus === value.key}
        aria-label={`${value.label}: ${share(value)}, ${value.count} of ${total}`} />)}
      {selected && <div className="ph-segment-detail" role="status">{selected.label} · {share(selected)} · {selected.count} / {total}</div>}
    </div>
    <div className="ph-breakdown-head"><span>Status breakdown</span><span>{assessed} of {total} assessed</span></div>
    {inline ? <div className="ph-breakdown-cells">{cells}</div> : cells}
  </div>;
}

export default function PortfolioHistoryDialog({client, programs, selected, onSelect, onClose, onCloseAutoFocus, onNavigate, chartView, onChartViewChange, refreshToken, asOf: overviewAsOf, inline = false, onStatusNavigate}) {
  const [range, setRange] = useState('6m'), [showData, setShowData] = useState(false);
  const program = programs.find(value => programIdentity(value) === selected);
  const report = useHistory(client, program, range, refreshToken, inline);
  const current = report.data?.current || program.current || {}, asOf = report.data?.as_of || overviewAsOf || current.retrieved_at || current.captured_at;
  const language = programLanguage({...program, current}), months = RANGES.find(([key]) => key === range)[2], start = calendarRangeStart(asOf, months);
  const points = historyWindow(report.data?.snapshots, start, asOf, report.data?.comparison), scopeChanges = report.data?.scope_changes || [];
  const comparison = periodChange(report.data?.snapshots, current, start, {comparison: report.data?.comparison, scopeChanges});
  const forecast = forecastImplementation(report.data?.forecast_snapshots, current, asOf, {scopeChanges: report.data?.forecast_scope_changes, verb: language.verb});
  const percentage = currentPercentage(current), valid = validImplementationPosition(current), noScope = valid && current.denominator === 0;
  const counts = applicableCounts(current);
  const lead = grcLead(client);
  const details = <>
    <div className="ph-program-head"><div><h3>{inline ? 'CIS IG1 Status' : program.program_label}</h3><p>{program.scope_label}</p></div><button type="button" className="ph-link" onClick={() => onNavigate(program.to)}>Open {program.program_label} workspace →</button></div>
    <div className="ph-current-overview">
      <div className="ph-current-value"><span>Current implementation</span><strong>{percentage != null ? current.not_started ? 'Not started' : `${percentage.toFixed(1)}%` : noScope ? 'No applicable scope' : 'Unavailable'}</strong><p>{percentage != null ? `${current.implemented} of ${current.denominator} ${language.unit} ${language.verb}` : current.reason || current.notice || 'No applicable implementation units.'}</p><small>As of {dateTime(current.effective_at || current.captured_at || asOf)}</small></div>
      <CurrentStatusBreakdown key={selected} current={current} onStatusNavigate={onStatusNavigate} inline={inline} />
    </div>
    <div className="ph-range"><div className="ph-segmented" role="group" aria-label="History period">{RANGES.map(([key, label]) => <button key={key} type="button" aria-pressed={key === range} onClick={() => setRange(key)}>{label}</button>)}</div><span>{formatPortfolioDate(start)} – {formatPortfolioDate(asOf)} · UTC</span></div>
    <div className="ph-metrics">

      <div className="ph-metric"><span>Change · {RANGES.find(([key]) => key === range)[1]}</span><strong className={comparison.comparable ? comparison.change_pp > 0 ? 'is-up' : comparison.change_pp < 0 ? 'is-down' : '' : 'is-text'}>{comparison.comparable ? comparison.change_pp === 0 ? 'No change' : `${signed(comparison.change_pp)} points` : 'Unavailable'}</strong><p>{comparison.comparable ? `${signed(comparison.change_count, 0)} ${language.verb} · from ${rate(comparison.baseline)} on ${formatPortfolioDate(snapshotTime(comparison.baseline))}` : report.loading ? 'Loading saved period history…' : report.error || comparison.reason}</p>{comparison.scope_changed && <small>Scope changed. Each saved position uses its own applicable denominator; a denominator reduction is not additional implemented work.</small>}</div>
      <div className="ph-metric"><span>Estimated completion</span><strong className={forecast.ok ? '' : 'is-text'}>{forecast.label}</strong><p>{forecast.note}</p>{forecast.estimated_at && <ForecastTimeline asOf={asOf} estimatedAt={forecast.estimated_at} />}</div>
    </div>
    <div className="ph-chart-card">
      <div className="ph-chart-top"><div><h4>Implementation history</h4><p>{chartView === 'mix' ? `Share of applicable ${language.unit} in each status at each saved position` : `${counts[0]?.label || 'Implemented'} ${language.unit} as a percentage of applicable scope`}</p></div><div className="ph-chart-tools"><div className="ph-segmented" role="group" aria-label="Chart view">{[['line', 'Implemented'], ['mix', 'Status mix']].map(([key, label]) => <button key={key} type="button" aria-pressed={key === chartView} onClick={() => onChartViewChange(key)}>{label}</button>)}</div><button type="button" className="ph-link" aria-expanded={showData} aria-controls="portfolio-history-data" onClick={() => setShowData(value => !value)}>{showData ? 'Hide data' : 'View data'}</button></div></div>
      {report.loading && !report.data ? <div className="ph-empty" role="status">Loading saved history…</div> : report.error ? <div className="ph-empty" role="alert"><p>{report.error}</p><button type="button" className="ph-link" onClick={report.retry}>Retry</button></div> : <>
        <PortfolioHistoryChart key={selected + ':' + range} points={points} start={start} asOf={asOf} view={chartView} current={current} scopeChanges={scopeChanges} unit={language.unit} />
        <div className="ph-disclosure">{!points.length && <p>No saved positions are available in this period. Current status is shown above.</p>}{points.length > 0 && Date.parse(snapshotTime(points[0])) > Date.parse(start) && <p>The first observation in this period is {dateTime(snapshotTime(points[0]))}; the shaded part has no saved positions.</p>}<p>{report.data?.capture_method || 'Genuine committed events and retained sampled observations only.'} {points.filter(point => !point.carried).length} {points.filter(point => !point.carried).length === 1 ? 'position' : 'positions'} saved in this period. A carried baseline retains its original date and is not an additional save. Connecting lines are not additional captures; unobserved intervening states are not proven. Status mix columns show only the observed states.</p>{scopeChanges.map((change, index) => <p key={index}>{dateTime(change.effective_at || change.at)}: {scopeNote(change, language.unit)}</p>)}{report.data?.coverage?.notice && <p>{report.data.coverage.notice}</p>}</div>
        {showData && <div className="ph-data" id="portfolio-history-data"><table><caption className="sr-only">Genuine implementation positions, newest effective date first</caption><thead><tr><th scope="col">Position date</th>{counts.map(value => <th scope="col" key={value.key}>{value.label}</th>)}<th scope="col">Applicable</th><th scope="col">{counts[0]?.label || 'Implemented'} %</th></tr></thead><tbody>{[...points].reverse().map(point => <tr key={identity(point)}><td>{dateTime(snapshotTime(point))}{point.carried && <small>In effect at period start; original saved date retained.</small>}{point.effective_at && point.captured_at && Date.parse(point.effective_at) !== Date.parse(point.captured_at) && <small>Captured {dateTime(point.captured_at)}</small>}{scopeChangesForPosition(scopeChanges, point).map((change,index)=><small key={index}>{scopeNote(change, language.unit)}</small>)}</td>{counts.map(value => <td key={value.key}>{validImplementationPosition(point) ? applicableCounts(point).find(item => item.key === value.key)?.count ?? '—' : 'Unavailable'}</td>)}<td>{validImplementationPosition(point) ? point.denominator : 'Unavailable'}</td><td>{rate(point)}</td></tr>)}</tbody></table>{!points.length && <p className="ph-empty">No saved positions in this period.</p>}</div>}
      </>}

    </div>
  </>;
  if (inline) return <section className="brawndo-demo-program" aria-label="CIS IG1 Status">
    {details}
    <p className="ph-inline-foot">Assessment progress, not a compliance determination. The estimate uses comparable genuine progress in the latest 90 days, independently of the selected chart period.</p>
  </section>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="portfolio-history-dialog" data-testid="portfolio-history-dialog" onCloseAutoFocus={onCloseAutoFocus}>
    <div className="ph-head"><div className="ph-client"><span className="gp-client-initial" aria-hidden="true">{client.name?.trim().charAt(0)}</span><div><DialogTitle>{client.name}</DialogTitle><DialogDescription>GRC Lead · {lead.name} · {client.industry || 'Industry not recorded'}</DialogDescription></div></div><button type="button" className="ph-button" onClick={() => onNavigate('/dashboard')}>Open client portal</button></div>
    <div className="ph-body">{programs.length > 1 ? <Tabs value={selected} onValueChange={onSelect}><TabsList aria-label="Client frameworks" className="ph-tabs">{programs.map(value => {
      const valid = validImplementationPosition(value.current);
      const summary = !valid ? 'Unavailable' : value.current.denominator === 0 ? 'No applicable scope' : value.current.not_started ? 'Not started' : `${rate(value.current)} ${programLanguage(value).verb}`;
      return <TabsTrigger key={programIdentity(value)} value={programIdentity(value)} className="ph-tab"><span>{value.program_label}</span><small>{summary}</small></TabsTrigger>;
    })}</TabsList><TabsContent value={selected} className="ph-tab-content">{details}</TabsContent></Tabs> : details}</div>
    <div className="ph-foot">{program.framework_key === 'soc-2' ? 'Internal readiness, not an auditor opinion.' : 'Assessment progress, not a compliance determination.'} The estimate uses comparable genuine progress in the latest 90 days, independently of the selected chart period.</div>
  </DialogContent></Dialog>;
}

export function PortfolioHistoryChart({points, start, asOf, view, current, scopeChanges, unit = 'items'}) {
  const box = useRef(null), svg = useRef(null);
  const [width, setWidth] = useState(900), [active, setActive] = useState(null);
  useEffect(() => {
    const measure = () => setWidth(Math.max(300, Math.round(box.current?.getBoundingClientRect().width || 900)));
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (observer) observer.observe(box.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const selected = points.find(point => identity(point) === active) || points.at(-1);
  const low = 0, high = 100;
  const height = 264, left = 44, right = width - 66, top = 12, bottom = height - 32;
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
  const currentMatch = selectedValid && validImplementationPosition(current) && selected.source_revision && selected.source_revision === current.source_revision && selected.scope_signature === current.scope_signature && currentPercentage(selected) === currentPercentage(current);
  const nearest = event => {
    if (!points.length) return;
    const rect = svg.current.getBoundingClientRect();
    if (!rect.width) return;
    const pointer = (event.clientX - rect.left) / rect.width * width;
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
    event.preventDefault(); setActive(identity(points[index]));
  };
  const shadeEnd = points.length ? x(points[0]) : right;
  const endpoint = points.at(-1);
  const endpointMatches = endpoint && validImplementationPosition(endpoint) && validImplementationPosition(current)
    && endpoint.scope_signature === current.scope_signature && endpoint.source_revision === current.source_revision;
  const endpointPercentage = endpointMatches ? currentPercentage(current) : null;
  return <div ref={box} className="ph-chart">
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" tabIndex={points.length ? 0 : undefined} aria-label="Implementation history over the selected period. Use Left, Right, Home and End to read genuine positions." onKeyDown={keyboard} onBlur={() => setActive(null)}>
      <title>Implementation history</title><desc>Each marker is a saved observation at its genuine effective date. The text readout and View data provide exact counts.</desc>
      {shadeEnd > left && <rect className="ph-no-history" x={left} y={top} width={shadeEnd - left} height={bottom - top} />}
      {ticks.map(value => <g key={value}><line className="ph-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={left - 8} y={y(value) + 4} textAnchor="end">{`${value}%`}</text></g>)}
      {view === 'line' && points.slice(1).map((point, index) => {
        const previous = points[index];
        if (!previous.continuity_proven || Date.parse(previous.effective_until) < Date.parse(snapshotTime(point)) || currentPercentage(previous) == null) return null;
        return <path key={identity(point)} d={`M${x(previous)},${bottom}V${y(currentPercentage(previous))}H${x(point)}V${bottom}Z`} fill="var(--chart-area)" />;
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
      {endpointPercentage != null && <g><rect x={right+5} y={y(endpointPercentage)-11} width="54" height="22" rx="5" fill="var(--chart-implemented)"/><text x={right+32} y={y(endpointPercentage)+4} textAnchor="middle" style={{fill:'var(--chart-flag-text, white)'}}>{endpointPercentage.toFixed(1)}%</text></g>}
      {points.map(point => currentPercentage(point) != null && <circle key={identity(point)} className="ph-marker" cx={x(point)} cy={y(currentPercentage(point))} r={3.5} />)}
      {scopeChanges.filter(change => Date.parse(change.effective_at || change.at) >= Date.parse(start) && Date.parse(change.effective_at || change.at) <= Date.parse(asOf)).map((change, index) => <g key={index}><line className="ph-scope-marker" x1={x({effective_at: change.effective_at || change.at})} x2={x({effective_at: change.effective_at || change.at})} y1={top} y2={bottom} /><text x={Math.min(x({effective_at: change.effective_at || change.at}) + 6, right - 90)} y={top + 15}>Scope changed</text></g>)}
      {Array.from({length: width < 520 ? 3 : 5}, (_, index) => {
        const intervals = width < 520 ? 2 : 4;
        const at = new Date(Date.parse(start) + (Date.parse(asOf) - Date.parse(start)) * index / intervals).toISOString();
        return <text key={at} x={left + (right - left) * index / intervals} y={height - 8} textAnchor={index === 0 ? 'start' : index === intervals ? 'end' : 'middle'}>{formatPortfolioDate(at, {year: undefined})}</text>;
      })}
      {!points.length && <text className="ph-chart-empty" x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle">No saved positions in this period</text>}
      {selected && <><line className="ph-crosshair" x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} />{currentPercentage(selected) != null && <circle className="ph-active" cx={x(selected)} cy={y(currentPercentage(selected))} r={5.5} />}</>}
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="transparent" onPointerMove={nearest} onPointerDown={nearest} onPointerLeave={() => { if (document.activeElement !== svg.current) setActive(null); }} />
    </svg>
    {view === 'line' && (low > 0 || high < 100) && <p className="ph-axis-disclosure">Vertical axis zoomed to the data range ({low}–{high}%).</p>}
    <div className="ph-readout" aria-live="polite">{selected ? <><strong>{dateTime(snapshotTime(selected))}{currentMatch && ' · matches current committed state'}</strong>{selectedValid ? <>{applicableCounts(selected).map(value => <span key={value.key}><i className={`ph-dot is-${tone(value.key)}`} aria-hidden="true" />{value.label} {value.count}{value.key === 'addressed' && ` · ${rate(selected)}`}</span>)}<span>of {selected.denominator} applicable</span></> : <><span>Implementation/counts unavailable</span><span>{selected.reason || selected.notice || 'This saved position has unavailable implementation data.'}</span></>}{scopeChangesForPosition(scopeChanges, selected).map((change,index)=><span key={index}>{scopeNote(change, unit)}</span>)}{selected.effective_at && selected.captured_at && Date.parse(selected.effective_at) !== Date.parse(selected.captured_at) && <span>Captured {dateTime(selected.captured_at)}</span>}</> : <span>No saved position selected.</span>}</div>
  </div>;
}
