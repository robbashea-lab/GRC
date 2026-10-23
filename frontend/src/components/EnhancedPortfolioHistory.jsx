import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { PortfolioHistoryChart, formatPortfolioDate, programLanguage, scopeNote, useHistory } from './PortfolioReports';
import { applicableCounts, calendarRangeStart, currentPercentage, forecastImplementation, historyWindow, periodChange, programIdentity, snapshotTime, validImplementationPosition } from '@/lib/portfolioProgress';
import { grcLead } from '@/lib/clientRelationships';
import { clientAttention, operationalItems } from '@/lib/enhancedPortfolio';
import { Attention, ClientMark, WorkList, signedPoints } from './EnhancedPortfolioShared';
import {useAuth} from '@/context/AuthContext';
import {PREVIEW_MODE} from '@/lib/api';
import {namedDemoClient} from '@/lib/demoClients';
const PERIODS = [['1m', 1], ['3m', 3], ['6m', 6], ['12m', 12]];
const recordedAt = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short'
}) : 'Unavailable';
const percentage = value => currentPercentage(value) == null ? '—' : `${currentPercentage(value).toFixed(1)}%`;
const basis = point => point.observation_kind === 'demo_fixture' ? 'Illustrative demo scenario' : point.observation_kind === 'current_baseline' ? 'Initial native baseline' : point.observation_kind === 'current_state' ? 'Current native state' : 'Saved demo activity';
function CompactBreakdown({
  current
}) {
  const valid = validImplementationPosition(current);
  return <div className="ep-breakdown" aria-label="Current status breakdown">{applicableCounts(current).map((count, index) => {
      const share = valid && current.denominator > 0 ? count.count / current.denominator * 100 : null;
      return <div className="ep-breakdown-row" key={count.key}><span><i className={`ep-status-${index}`} />{count.key === 'needs_attention' ? 'Not implemented' : count.label}</span><span className="ep-breakdown-track" aria-hidden="true"><i className={`ep-status-${index}`} style={{
            width: `${share ?? 0}%`
          }} /></span><span>{share == null ? '—' : `${share.toFixed(1)}%`} <small>{count.count}/{current.denominator}</small></span></div>;
    })}</div>;
}
export default function EnhancedPortfolioHistory(props) {
  return props.programs.length ? <ProgramHistory {...props} /> : <WorkOnlyPreview {...props} />;
}
function WorkOnlyPreview({
  client,
  asOf,
  onClose,
  onCloseAutoFocus,
  onNavigate,
  theme
}) {
  const work = operationalItems(client, asOf);
  return <Dialog open onOpenChange={open => {
    if (!open) onClose();
  }}><DialogContent showCloseButton={false} className="portfolio-history-dialog enhanced-portfolio ep-history" data-theme={theme} data-testid="enhanced-portfolio-history" onCloseAutoFocus={onCloseAutoFocus}>
    <header className="ep-dialog-heading"><ClientMark client={client} /><div><DialogTitle>{client.name}</DialogTitle><DialogDescription>GRC lead · {grcLead(client).name} · <span className={"ep-attention-chip ep-" + clientAttention(client, asOf).tone}>{clientAttention(client, asOf).label}</span></DialogDescription></div><div className="ep-dialog-actions"><button type="button" className="ep-button" onClick={() => onNavigate('/dashboard')}>Open client portal</button><DialogClose className="ep-close" aria-label="Close implementation preview">×</DialogClose></div></header>
    <div className="ep-history-body"><div className="ep-glance"><WorkList key={`${client.client_id}:overdue`} client={client} items={work.overdue} title="Overdue" asOf={asOf} onNavigate={onNavigate} /><WorkList key={`${client.client_id}:due30`} client={client} items={work.due30} title="Next 30 days" asOf={asOf} onNavigate={onNavigate} /></div><Attention client={client} asOf={asOf} /><div className="ep-notice">No enabled program is recorded. Existing work remains available.</div></div><footer>Assessment progress, not a compliance determination.</footer>
  </DialogContent></Dialog>;
}
function ProgramHistory({
  client,
  programs,
  selected,
  onSelect,
  asOf,
  refreshToken,
  onClose,
  onCloseAutoFocus,
  onNavigate,
  theme
}) {
  const program = programs.find(value => programIdentity(value) === selected) || programs[0];
  const auth=useAuth();
  const demoScenario=PREVIEW_MODE && auth.user?.workspace_mode==='demo' && client.environment==='Demo'
    && !!namedDemoClient(client.client_id)?.historyVersion && program.framework_key==='cis-ig1';
  const [range, setRange] = useState('3m'),
    [mode, setMode] = useState('line'),
    [showData, setShowData] = useState(false);
  // Fixed four native reads provide independent, evidenced calendar-boundary comparisons.
  const expectedScope = program.current?.scope || {};
  const one = useHistory(client, program, '1m', refreshToken, true, demoScenario, expectedScope);
  const three = useHistory(client, program, '3m', refreshToken, true, demoScenario, expectedScope);
  const six = useHistory(client, program, '6m', refreshToken, true, demoScenario, expectedScope);
  const twelve = useHistory(client, program, '12m', refreshToken, true, demoScenario, expectedScope);
  const reports = {
      '1m': one,
      '3m': three,
      '6m': six,
      '12m': twelve
    },
    report = reports[range];
  const current = report.data?.current || program.current,
    cutoff = report.data?.as_of || asOf;
  const language = programLanguage(program),
    valid = validImplementationPosition(current),
    value = currentPercentage(current);
  const start = calendarRangeStart(cutoff, PERIODS.find(([key]) => key === range)[1]);
  const points = historyWindow(report.data?.snapshots, start, cutoff, report.data?.comparison),
    changes = report.data?.scope_changes || [];
  const forecast = forecastImplementation(report.data?.forecast_snapshots, current, cutoff, {
    scopeChanges: report.data?.forecast_scope_changes,
    verb: language.verb, demoScenario:report.data?.scenario_context
  });
  const work = operationalItems(client, cutoff),
    counts = applicableCounts(current);
  const selectedScopeChanges = point => changes.filter(change => change.after_snapshot_id ? change.after_snapshot_id === point.snapshot_id : change.after?.scope_signature === point.scope_signature && Date.parse(change.effective_at || change.at) === Date.parse(snapshotTime(point)));
  const showProvenance = points.some(point => point.observation_kind === 'demo_fixture');
  return <Dialog open onOpenChange={open => {
    if (!open) onClose();
  }}><DialogContent showCloseButton={false} className="portfolio-history-dialog enhanced-portfolio ep-history" data-theme={theme} data-testid="enhanced-portfolio-history" onCloseAutoFocus={onCloseAutoFocus}>
    <header className="ep-dialog-heading"><ClientMark client={client} /><div><DialogTitle>{client.name}</DialogTitle><DialogDescription>GRC lead · {grcLead(client).name} · <span className={"ep-attention-chip ep-" + clientAttention(client, asOf).tone}>{clientAttention(client, asOf).label}</span></DialogDescription></div><div className="ep-dialog-actions"><button type="button" className="ep-button" onClick={() => onNavigate('/dashboard')}>Open client portal</button><DialogClose className="ep-close" aria-label="Close implementation preview">×</DialogClose></div></header>
    <div className="ep-history-body ph-body">
      {/* Context keys reset disclosure state without resetting history controls on refresh. */}
      <div className="ep-glance"><WorkList key={JSON.stringify([client.client_id, programIdentity(program), 'overdue'])} client={client} items={work.overdue} title="Overdue" asOf={cutoff} onNavigate={onNavigate} /><WorkList key={JSON.stringify([client.client_id, programIdentity(program), 'due30'])} client={client} items={work.due30} title="Next 30 days" asOf={cutoff} onNavigate={onNavigate} /></div>
      {!client.grc_lead_id && !client.assigned_owner_id && <div className="ep-notice"><b>No GRC lead assigned</b><p>Existing work and assessment history remain visible.</p><button type="button" className="ep-button" onClick={() => onNavigate('/admin/clients')}>Assign a lead</button></div>}
      {client.monitoring?.onboarding === 'in_progress' && <div className="ep-notice"><b>Onboarding in progress</b><button type="button" className="ep-button" onClick={() => onNavigate('/onboarding')}>Continue onboarding</button></div>}
      <div className="ep-program-switch"><span>Program</span><div className="ep-segment" role="group" aria-label="Select program">{programs.map(value => <button key={programIdentity(value)} type="button" aria-pressed={programIdentity(value) === programIdentity(program)} onClick={() => onSelect(programIdentity(value))}>{value.program_label}</button>)}</div></div>
      <section className="ep-current"><div><p>{program.program_label} · current implementation</p><strong>{value == null ? percentage(current) : <>{value.toFixed(1)}<small>%</small></>}</strong><p>{valid ? `${current.implemented} of ${current.denominator} implemented · assessed ${current.denominator - (counts.find(count => count.key === 'not_assessed')?.count || 0)} of ${current.denominator}` : current?.reason || 'Current implementation unavailable'}</p><small>As of {formatPortfolioDate(current?.effective_at || current?.captured_at || cutoff)}</small><button type="button" className="ep-link" onClick={() => onNavigate(program.to)}>Open {program.program_label} workspace →</button></div><CompactBreakdown current={current} /></section>
      <div className="ep-periods" role="group" aria-label="Implementation changes">{PERIODS.map(([key, months]) => {
            const saved = reports[key],
              data = saved.data;
            const comparison = data && periodChange(data.snapshots, data.current, calendarRangeStart(data.as_of, months), {
              comparison: data.comparison,
              scopeChanges: data.scope_changes, demoScenario:data.scenario_context
            });
            return <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}><span>{months} month{months === 1 ? '' : 's'}</span><strong className={comparison?.comparable ? comparison.change_pp < 0 ? 'ep-red' : 'ep-green' : ''}>{comparison?.comparable ? <>{signedPoints(comparison.change_pp)} <small>pts</small></> : '—'}</strong><small>{saved.error ? 'History unavailable' : saved.loading ? 'Loading saved history…' : comparison?.comparable ? `${formatPortfolioDate(calendarRangeStart(data.as_of, months), {
                  year: undefined
                })}–${formatPortfolioDate(data.as_of, {
                  year: undefined
                })}${comparison.scope_changed ? ' · scope changed' : ''}` : 'Not enough history'}</small></button>;
          })}</div>
      <section className="ep-forecast"><div><p>Estimated completion</p><strong>{forecast.ok ? forecast.estimated_at ? formatPortfolioDate(forecast.estimated_at, {
                day: undefined
              }) : forecast.label : 'Estimate unavailable'}</strong><p>{forecast.ok ? forecast.note : report.loading ? 'Loading saved progress…' : forecast.reason}</p>{forecast.ok && forecast.monthly_pace != null && <p>{current.denominator - current.implemented} remaining · {forecast.monthly_pace.toFixed(1)} {language.unit}/month</p>}</div>{value != null && <div className="ep-forecast-track"><span>{value.toFixed(1)}% now</span><span>100%</span>{forecast.ok && forecast.estimated_at ? <><svg viewBox="0 0 150 62" aria-label="Conditional completion estimate"><line x1="10" y1="52" x2="140" y2="52" stroke="var(--line)" /><line x1="10" y1="10" x2="140" y2="10" stroke="var(--line)" /><path d={`M10 ${52 - value * .42} L140 10`} fill="none" stroke="var(--chart-implemented)" strokeWidth="2" strokeDasharray="4 3" /><circle cx="10" cy={52 - value * .42} r="3" fill="var(--chart-implemented)" /><circle cx="140" cy="10" r="3" fill="var(--card)" stroke="var(--chart-implemented)" strokeWidth="1.5" /></svg><span>{formatPortfolioDate(cutoff, {
                  year: undefined
                })}</span><span>{formatPortfolioDate(forecast.estimated_at, {
                  day: undefined
                })}</span></> : <div><i style={{
                width: `${value}%`
              }} /></div>}</div>}</section>
      <section className="ep-history-card"><div className="ep-chart-heading"><h3>{mode === 'line' ? 'Implementation history' : 'All implementation statuses'}</h3><div className="ep-segment" role="group" aria-label="History range">{PERIODS.map(([key, months]) => <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{months} month{months === 1 ? '' : 's'}</button>)}</div></div>
        {report.error ? <div role="alert"><p>{report.error}</p><button type="button" className="ep-button" onClick={report.retry}>Retry</button></div> : report.loading && !report.data ? <p role="status">Loading saved history…</p> : <PortfolioHistoryChart key={programIdentity(program) + range} points={points} start={start} asOf={cutoff} view={mode} current={current} scopeChanges={changes} unit={language.unit} showProvenance={showProvenance} demoScenario={report.data?.scenario_context} stackedHistory />}
        <div className="ep-chart-legend">{(mode === 'line' ? counts.slice(0, 1) : counts).map((count, index) => <span key={count.key}><i className={`ep-status-${mode === 'line' ? 0 : index}`} />{count.key === 'needs_attention' ? 'Not implemented' : count.label}</span>)}</div>
        <div className="ep-history-actions"><button type="button" className="ep-button" aria-expanded={showData} aria-controls="enhanced-history-data" onClick={() => setShowData(previous => !previous)}>{showData ? 'Hide data' : 'View data'}</button><button type="button" className="ep-button" aria-pressed={mode === 'mix'} onClick={() => setMode(previous => previous === 'line' ? 'mix' : 'line')}>{mode === 'line' ? 'All statuses' : 'Implemented only'}</button></div>
        <p className="ep-history-caption">{PERIODS.find(([key]) => key === range)[1]} calendar month{range === '1m' ? '' : 's'} · percentage of applicable {language.unit} · saved positions</p>
        {showData && <div className="ep-history-data" id="enhanced-history-data"><table><caption className="sr-only">Implementation positions, newest first</caption><thead><tr><th>Saved position</th><th>Applicable</th>{counts.map(count => <th key={count.key}>{count.key === 'needs_attention' ? 'Not implemented' : count.label}</th>)}<th>Implemented %</th></tr></thead><tbody>{[...points].reverse().map((point, index) => <tr key={point.snapshot_id || `${snapshotTime(point)}:${index}`}><td>{recordedAt(snapshotTime(point))}{point.effective_at && point.captured_at && Date.parse(point.effective_at) !== Date.parse(point.captured_at) && <small>Captured {recordedAt(point.captured_at)}</small>}{point.carried && <small>In effect at period start</small>}{showProvenance && <small>{basis(point)}</small>}{selectedScopeChanges(point).map((change, index) => <small key={index}>{scopeNote(change, language.unit, true)}</small>)}</td><td>{validImplementationPosition(point) ? point.denominator : '—'}</td>{counts.map(count => {
                    const countValue = applicableCounts(point).find(value => value.key === count.key)?.count;
                    return <td key={count.key}>{validImplementationPosition(point) ? countValue : '—'}<small>{point.denominator > 0 && countValue != null ? `${(countValue / point.denominator * 100).toFixed(1)}%` : '—'}</small></td>;
                  })}<td>{percentage(point)}</td></tr>)}</tbody></table>{!points.length && <p>No saved positions in this period.</p>}</div>}
      </section>
    </div><footer>Assessment progress, not a compliance determination.</footer>
  </DialogContent></Dialog>;
}
