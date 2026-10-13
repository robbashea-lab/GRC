import {useEffect, useRef, useState} from 'react';
import api, {formatError} from '@/lib/api';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/components/ui/tabs';
import {grcLead} from '@/lib/clientRelationships';
import {applicableCounts, calendarRangeStart, currentPercentage, forecastImplementation, historyWindow, periodChange, programIdentity, snapshotTime, validImplementationPosition} from '@/lib/portfolioProgress';
import './PortfolioReports.css';

const DAY = 86400000;
const RANGES = [['1m', '1 month', 1], ['3m', '3 months', 3], ['6m', '6 months', 6], ['12m', '12 months', 12], ['36m', '3 years', 36]];
const tone = key => ({addressed: 'implemented', in_progress: 'partial', needs_attention: 'not', not_assessed: 'unassessed'})[key];
const signed = (value, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;
const rate = value => currentPercentage(value) == null ? validImplementationPosition(value) && value.denominator === 0 ? 'N/A' : 'Unavailable' : `${currentPercentage(value).toFixed(1)}%`;
const identity = value => value.snapshot_id || `${snapshotTime(value)}:${value.source_revision || ''}`;
export const formatPortfolioDate = (value, options = {}) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...options}) : 'Unavailable';
const dateTime = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'}) : 'Unavailable';

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
    const rates = historyWindow(program.snapshots_90d, start, asOf).map(currentPercentage).filter(value => value != null);
    if (rates.length > 1) span = Math.max(span, Math.max(...rates) - Math.min(...rates));
  }
  return Math.max(8, span * 1.12);
}

export function PortfolioSparkline({program, asOf, span}) {
  const start = new Date(Date.parse(asOf) - 90 * DAY).toISOString();
  const points = historyWindow(program.snapshots_90d, start, asOf).filter(point => currentPercentage(point) != null);
  const percentages = points.map(currentPercentage), middle = points.length ? (Math.min(...percentages) + Math.max(...percentages)) / 2 : 0;
  const x = point => 3 + (Date.parse(snapshotTime(point)) - Date.parse(start)) / (90 * DAY) * 128;
  const y = point => 26 - (currentPercentage(point) - (middle - span / 2)) / span * 22;
  return <svg className="gp-sparkline" viewBox="0 0 136 30" aria-hidden="true" data-start={start} data-end={asOf}>
    <line className="gp-spark-base" x1="2" x2="134" y1="29" y2="29" />
    {points.length > 1 && <polyline className="gp-spark-line" points={points.map(point => `${x(point)},${y(point)}`).join(' ')} />}
    {points.length > 0 && <circle className="gp-spark-end" cx={x(points.at(-1))} cy={y(points.at(-1))} r="3" />}
  </svg>;
}

function useHistory(client, program, range, refreshToken) {
  const key = JSON.stringify([client.client_id, program.program_key, range, refreshToken]);
  const [state, setState] = useState({key: '', data: null, loading: true, error: ''}), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({key, data: null, loading: true, error: ''});
    const [client_id, program_key, selectedRange] = JSON.parse(key);
    api.get('/portfolio/reporting/history', {params: {client_id, program_key, range: selectedRange, include_archived: false}, signal: controller.signal}).then(({data}) => {
      if (!Array.isArray(data?.snapshots) || !data.current || !Number.isFinite(Date.parse(data.as_of))) throw new Error('The history response is incomplete.');
      if (data.client_id && data.client_id !== client_id || data.program_key && data.program_key !== program_key) throw new Error('The history does not belong to the selected client program.');
      if (active) setState({key, data, loading: false, error: ''});
    }).catch(failure => { if (active) setState({key, data: null, loading: false, error: formatError(failure)}); });
    return () => { active = false; controller.abort(); };
  }, [key, attempt]);
  return {...(state.key === key ? state : {data: null, loading: true, error: ''}), retry: () => setAttempt(value => value + 1)};
}

export default function PortfolioHistoryDialog({client, programs, selected, onSelect, onClose, onCloseAutoFocus, onNavigate, chartView, onChartViewChange, refreshToken, asOf: overviewAsOf}) {
  const [range, setRange] = useState('3m'), [showData, setShowData] = useState(false);
  const program = programs.find(value => programIdentity(value) === selected);
  const report = useHistory(client, program, range, refreshToken);
  const current = report.data?.current || program.current, asOf = report.data?.as_of || overviewAsOf || current.retrieved_at || current.captured_at;
  const language = programLanguage({...program, current}), months = RANGES.find(([key]) => key === range)[2], start = calendarRangeStart(asOf, months);
  const points = historyWindow(report.data?.snapshots, start, asOf), scopeChanges = report.data?.scope_changes || [];
  const comparison = periodChange(report.data?.snapshots, current, start, {comparison: report.data?.comparison, scopeChanges});
  const forecast = forecastImplementation(report.data?.forecast_snapshots, current, asOf, {scopeChanges: report.data?.forecast_scope_changes, verb: language.verb});
  const percentage = currentPercentage(current), valid = validImplementationPosition(current), noScope = valid && current.denominator === 0;
  const counts = applicableCounts(current), assessed = valid ? current.denominator - counts.find(value => value.key === 'not_assessed').count : null;
  const lead = grcLead(client);
  const details = <>
    <div className="ph-program-head"><div><h3>{program.program_label}</h3><p>{program.scope_label}</p></div><button type="button" className="ph-link" onClick={() => onNavigate(program.to)}>Open {program.program_label} workspace →</button></div>
    <div className="ph-range"><div className="ph-segmented" role="group" aria-label="History period">{RANGES.map(([key, label]) => <button key={key} type="button" aria-pressed={key === range} onClick={() => setRange(key)}>{label}</button>)}</div><span>{formatPortfolioDate(start)} – {formatPortfolioDate(asOf)} · UTC</span></div>
    <div className="ph-metrics">
      <div className="ph-metric"><span>Current {language.noun}</span><strong className={percentage == null ? 'is-text' : ''}>{percentage != null ? `${percentage.toFixed(1)}%` : noScope ? 'No applicable scope' : 'Unavailable'}</strong><p>{percentage != null ? `${current.implemented} of ${current.denominator} ${language.unit} ${language.verb} · ${assessed} of ${current.denominator} assessed` : current.reason || current.notice || (noScope ? 'No applicable implementation units.' : 'Current implementation data is unavailable.')}</p><small>As of {dateTime(asOf)}</small></div>
      <div className="ph-metric"><span>Change · {RANGES.find(([key]) => key === range)[1]}</span><strong className={comparison.comparable ? comparison.change_pp > 0 ? 'is-up' : comparison.change_pp < 0 ? 'is-down' : '' : 'is-text'}>{comparison.comparable ? comparison.change_pp === 0 ? 'No change' : `${signed(comparison.change_pp)} points` : 'Unavailable'}</strong><p>{comparison.comparable ? `${signed(comparison.change_count, 0)} ${language.verb} · from ${rate(comparison.baseline)} on ${formatPortfolioDate(snapshotTime(comparison.baseline))}` : report.loading ? 'Loading saved period history…' : report.error || comparison.reason}</p>{comparison.scope_changed && <small>Scope changed. Each saved position uses its own applicable denominator; a denominator reduction is not additional implemented work.</small>}</div>
      <div className="ph-metric"><span>Potential full {language.noun} <small className="ph-estimate">Estimate</small></span><strong className={forecast.ok ? '' : 'is-text'}>{forecast.label}</strong><p>{forecast.note}</p></div>
    </div>
    <div className="ph-chart-card">
      <div className="ph-chart-top"><div><h4>Implementation history</h4><p>{chartView === 'mix' ? `Share of applicable ${language.unit} in each status at each saved position` : `${counts[0]?.label || 'Implemented'} ${language.unit} as a percentage of applicable scope`}</p></div><div className="ph-chart-tools"><div className="ph-segmented" role="group" aria-label="Chart view">{[['line', 'Implemented'], ['mix', 'Status mix']].map(([key, label]) => <button key={key} type="button" aria-pressed={key === chartView} onClick={() => onChartViewChange(key)}>{label}</button>)}</div><button type="button" className="ph-link" aria-expanded={showData} aria-controls="portfolio-history-data" onClick={() => setShowData(value => !value)}>{showData ? 'Hide data' : 'View data'}</button></div></div>
      {report.loading ? <div className="ph-empty" role="status">Loading saved history…</div> : report.error ? <div className="ph-empty" role="alert"><p>{report.error}</p><button type="button" className="ph-link" onClick={report.retry}>Retry</button></div> : <>
        <PortfolioHistoryChart key={selected + ':' + range} points={points} start={start} asOf={asOf} view={chartView} current={current} scopeChanges={scopeChanges} />
        <div className="ph-disclosure">{!points.length && <p>No saved positions are available in this period. Current status is shown independently below.</p>}{points.length > 0 && Date.parse(snapshotTime(points[0])) > Date.parse(start) && <p>The first observation in this period is {dateTime(snapshotTime(points[0]))}; the shaded part has no saved positions.</p>}<p>{report.data?.capture_method || 'Genuine committed events and retained sampled observations only.'} {points.length} {points.length === 1 ? 'position' : 'positions'} in this period. Connecting lines are not additional captures; unobserved intervening states are not proven. Status mix columns show only the observed states.</p>{scopeChanges.map((change, index) => <p key={index}>{dateTime(change.effective_at || change.at)}: Scope changed{change.before?.denominator != null && change.after?.denominator != null ? ` (${change.before.denominator} → ${change.after.denominator} applicable)` : ''}.</p>)}{report.data?.coverage?.notice && <p>{report.data.coverage.notice}</p>}</div>
        {showData && <div className="ph-data" id="portfolio-history-data"><table><caption className="sr-only">Genuine implementation positions, newest effective date first</caption><thead><tr><th scope="col">Position date</th>{counts.map(value => <th scope="col" key={value.key}>{value.label}</th>)}<th scope="col">Applicable</th><th scope="col">{counts[0]?.label || 'Implemented'} %</th></tr></thead><tbody>{[...points].reverse().map(point => <tr key={identity(point)}><td>{dateTime(snapshotTime(point))}{point.effective_at && point.captured_at && Date.parse(point.effective_at) !== Date.parse(point.captured_at) && <small>Captured {dateTime(point.captured_at)}</small>}</td>{counts.map(value => <td key={value.key}>{validImplementationPosition(point) ? applicableCounts(point).find(item => item.key === value.key)?.count ?? '—' : 'Unavailable'}</td>)}<td>{validImplementationPosition(point) ? point.denominator : 'Unavailable'}</td><td>{rate(point)}</td></tr>)}</tbody></table>{!points.length && <p className="ph-empty">No saved positions in this period.</p>}</div>}
      </>}
      <div className="ph-current-status"><div><h4>Current status</h4><span>{valid ? `${current.denominator} applicable ${language.unit}` : 'Applicable scope unavailable'}</span></div><PortfolioStatusBar snapshot={current} />{valid ? <div className="ph-legend">{counts.map(value => <div key={value.key}><span><i className={`ph-dot is-${tone(value.key)}`} aria-hidden="true" />{value.label}</span><strong>{value.count}<small>{current.denominator > 0 ? `${(value.count / current.denominator * 100).toFixed(1)}%` : 'N/A'}</small></strong></div>)}</div> : <p>{current.reason || current.notice || 'Current status counts are unavailable.'}</p>}{valid && current.notice && <p>{current.notice}</p>}</div>
    </div>
  </>;
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

export function PortfolioHistoryChart({points, start, asOf, view, current, scopeChanges}) {
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
  const values = points.map(currentPercentage).filter(value => value != null);
  let low = 0, high = 100;
  if (view === 'line' && values.length) {
    low = Math.max(0, Math.floor((Math.min(...values) - 4) / 10) * 10);
    high = Math.min(100, Math.ceil((Math.max(...values) + 4) / 10) * 10);
    if (high - low < 20) { high = Math.min(100, low + 20); low = Math.max(0, high - 20); }
  }
  const height = 264, left = 44, right = width - 12, top = 12, bottom = height - 32;
  const x = point => left + (Date.parse(snapshotTime(point)) - Date.parse(start)) / (Date.parse(asOf) - Date.parse(start)) * (right - left);
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  const step = high - low <= 30 ? 5 : high - low <= 60 ? 10 : 25, ticks = [];
  for (let value = low; value <= high; value += step) ticks.push(value);
  let line = '', previous = null;
  for (const point of points) {
    const percentage = currentPercentage(point);
    if (percentage == null) { previous = null; continue; }
    line += `${previous && previous.scope_signature === point.scope_signature ? 'L' : 'M'}${x(point)},${y(percentage)} `;
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
  return <div ref={box} className="ph-chart">
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" tabIndex={points.length ? 0 : undefined} aria-label="Implementation history over the selected period. Use Left, Right, Home and End to read genuine positions." onKeyDown={keyboard} onBlur={() => setActive(null)}>
      <title>Implementation history</title><desc>Each marker is a saved observation at its genuine effective date. The text readout and View data provide exact counts.</desc>
      {shadeEnd > left && <rect className="ph-no-history" x={left} y={top} width={shadeEnd - left} height={bottom - top} />}
      {ticks.map(value => <g key={value}><line className="ph-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={left - 8} y={y(value) + 4} textAnchor="end">{`${value}%`}</text></g>)}
      {view === 'mix' && points.map(point => {
        if (currentPercentage(point) == null) return null;
        let sum = 0;
        return <g key={identity(point)}>{applicableCounts(point).map(value => {
          const before = sum; sum += value.count / point.denominator * 100;
          return <rect key={value.key} className={`ph-band is-${tone(value.key)}`} x={x(point) - 6} width={12} y={y(sum)} height={Math.max(0, y(before) - y(sum))} />;
        })}</g>;
      })}
      <path className="ph-line" d={line} />
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
    <div className="ph-readout" aria-live="polite">{selected ? <><strong>{dateTime(snapshotTime(selected))}{currentMatch && ' · matches current committed state'}</strong>{selectedValid ? <>{applicableCounts(selected).map(value => <span key={value.key}><i className={`ph-dot is-${tone(value.key)}`} aria-hidden="true" />{value.label} {value.count}{value.key === 'addressed' && ` · ${rate(selected)}`}</span>)}<span>of {selected.denominator} applicable</span></> : <><span>Implementation/counts unavailable</span><span>{selected.reason || selected.notice || 'This saved position has unavailable implementation data.'}</span></>}{selected.effective_at && selected.captured_at && Date.parse(selected.effective_at) !== Date.parse(selected.captured_at) && <span>Captured {dateTime(selected.captured_at)}</span>}</> : <span>No saved position selected.</span>}</div>
  </div>;
}
