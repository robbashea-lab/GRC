import { useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { PortfolioHistoryChart, formatPortfolioDate, programLanguage, useHistory } from './PortfolioReports';
import { applicableCounts, calendarRangeStart, currentPercentage, forecastImplementation, historyWindow, periodChange, programIdentity, validImplementationPosition } from '@/lib/portfolioProgress';
import { grcLead } from '@/lib/clientRelationships';
import { clientAttention, operationalItems } from '@/lib/enhancedPortfolio';
import { Attention, ClientMark, WorkList, signedPoints } from './EnhancedPortfolioShared';
import {useAuth} from '@/context/AuthContext';
import {PREVIEW_MODE} from '@/lib/api';
import {namedDemoClient} from '@/lib/demoClients';
const PERIODS = [['1m', 1], ['3m', 3], ['6m', 6], ['12m', 12]];
const OVERVIEW_TABS = [['overview', 'Overview'], ['history', 'Implementation history'], ['work', 'Reviews & actions']];

function OverviewTabs({active, onChange}) {
  function move(event, index) {
    const length = OVERVIEW_TABS.length;
    const keys = {ArrowRight:(index + 1) % length, ArrowLeft:(index + length - 1) % length, Home:0, End:length - 1};
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    const next = keys[event.key];
    event.currentTarget.parentElement.children[next].focus();
    onChange(OVERVIEW_TABS[next][0]);
  }
  return <div className="ep-overview-tabs" role="tablist" aria-label="Client overview sections">
    {OVERVIEW_TABS.map(([key, label], index) => <button key={key} id={`overview-tab-${key}`} type="button"
      role="tab" aria-controls="client-overview-pane" aria-selected={active === key} tabIndex={active === key ? 0 : -1}
      onKeyDown={event => move(event, index)} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

function OverviewFooter({onLedger, program, onNavigate}) {
  return <footer className="m-foot"><span>Assessment progress, not a compliance determination.</span>
    {onLedger && <button type="button" className="ep-link" onClick={onLedger}>Program status ledger →</button>}
    {onLedger && program?.to && <button type="button" className="ep-link" onClick={() => onNavigate(program.to)}>{program.program_label} workspace →</button>}
  </footer>;
}

function DirectoryProgramStatus({program, current}) {
  const valid = validImplementationPosition(current);
  const counts = valid ? applicableCounts(current) : [];
  const unassessed = counts.find(bucket => bucket.key === 'not_assessed');
  return <section className="ep-directory-status" aria-label={`${program.program_label} status`}>
    <header><h3>{program.program_label} status</h3>
      {unassessed && <small>{current.denominator - unassessed.count} of {current.denominator} assessed</small>}
    </header>
    {valid ? <div className="ep-directory-status-grid">{counts.map((bucket, index) =>
      <div key={bucket.key} className="ep-directory-status-cell" style={{'--meter-ink':`var(--s${index + 1})`}}>
        <span>{bucket.label}</span>
        <div><strong>{current.denominator ? (100 * bucket.count / current.denominator).toFixed(1) + '%' : '—'}</strong>
          <small>{bucket.count} of {current.denominator}</small></div>
        <meter min="0" max={current.denominator || 1} value={bucket.count} aria-label={`${bucket.label}: ${bucket.count} of ${current.denominator}`} />
      </div>)}</div> : <p>{current?.reason || 'Current implementation unavailable'}</p>}
  </section>;
}
const percentage = value => currentPercentage(value) == null ? '—' : `${currentPercentage(value).toFixed(1)}%`;
function CompactBreakdown({
  current
}) {
  const valid = validImplementationPosition(current);
  return <div className="legend ep-breakdown" aria-label="Current status breakdown">{applicableCounts(current).map((count, index) => {
      const share = valid && current.denominator > 0 ? count.count / current.denominator * 100 : null;
      return <div className="leg-row ep-breakdown-row" key={count.key}><span className="leg-name"><i className={`ep-status-${index}`} />{({addressed:'Implemented',in_progress:'Partially implemented',needs_attention:'Not implemented',not_assessed:'Not assessed'})[count.key] || count.label}</span><span className="leg-track ep-breakdown-track" aria-hidden="true"><i className={`ep-status-${index}`} style={{
            width: `${share ?? 0}%`
          }} /></span><span className="leg-val">{share == null ? '—' : `${share.toFixed(1)}%`} <small>{count.count}/{current.denominator}</small></span></div>;
    })}</div>;
}
export default function EnhancedPortfolioHistory(props) {
  return props.programs.length ? <ProgramHistory {...props} /> : <WorkOnlyPreview {...props} />;
}
function WorkOnlyPreview({
  programs,
  client,
  asOf,
  onClose,
  onCloseAutoFocus,
  onNavigate,
  onLedger,
  theme
}) {
  const [tab, setTab] = useState('overview');
  const work = operationalItems(client, asOf);
  return <Dialog open onOpenChange={open => {
    if (!open) onClose();
  }}><DialogContent showCloseButton={false} overlayClassName="portfolio-reference-overlay" className="portfolio-history-dialog portfolio-reference enhanced-portfolio ep-history" data-directory-overview={onLedger ? true : undefined} data-theme={theme} data-testid="enhanced-portfolio-history" onCloseAutoFocus={onCloseAutoFocus}>
    <header className="m-head ep-dialog-heading"><ClientMark client={client} /><div>{onLedger && <div className="eyebrow">Client overview</div>}<DialogTitle className="m-title">{client.name}</DialogTitle><DialogDescription className="m-meta">GRC lead · {grcLead(client).name} <span className={"st ep-attention-chip ep-" + clientAttention(client, asOf).tone}><i />{clientAttention(client, asOf).label}</span></DialogDescription></div><div className="ep-dialog-actions"><button type="button" className="cta ep-button" onClick={() => onNavigate(onLedger ? '/client-profile' : '/dashboard')}>Open client portal <ArrowUpRight size={16} aria-hidden="true" /></button><DialogClose className="icon-btn ep-close" aria-label="Close implementation preview"><X size={18} aria-hidden="true" /></DialogClose></div></header>
    {onLedger && <OverviewTabs active={tab} onChange={setTab} />}
    <div className="m-body ep-history-body" {...(onLedger ? {id:'client-overview-pane',role:'tabpanel',tabIndex:0,'aria-labelledby':'overview-tab-'+tab} : {})}>
      {(!onLedger || tab !== 'history') && <div className="ep-glance"><WorkList key={client.client_id+':overdue'} client={client} items={work.overdue} title="Overdue" asOf={asOf} onNavigate={onNavigate} /><WorkList key={client.client_id+':due30'} client={client} items={work.due30} title="Next 30 days" asOf={asOf} onNavigate={onNavigate} /></div>}
      {(!onLedger || tab === 'overview') && <Attention client={client} asOf={asOf} />}
      {(!onLedger || tab !== 'work') && <div className="ep-notice">No enabled program is recorded. Existing work remains available.</div>}
    </div><OverviewFooter onLedger={onLedger} />
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
  onLedger,
  theme
}) {
  const [tab, setTab] = useState('overview');
  const program = programs.find(value => programIdentity(value) === selected) || programs[0];
  const auth=useAuth();
  const demoClient = namedDemoClient(client.client_id);
  const demoScenario=PREVIEW_MODE && auth.user?.workspace_mode==='demo' && client.environment==='Demo'
    && !!demoClient?.historyVersion && (program.framework_key==='cis-ig1' && !demoClient.historyFramework
      || demoClient.historyFramework==='iso-27001' && program.framework_key==='iso-27001' && program.program_key==='iso-27001'
        && program.client_id===client.client_id
        && program.program_id===`${client.client_id}:iso-27001`);
  const [range, setRange] = useState('3m');
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
  const showProvenance = points.some(point => point.observation_kind === 'demo_fixture');
  return <Dialog open onOpenChange={open => {
    if (!open) onClose();
  }}><DialogContent showCloseButton={false} overlayClassName="portfolio-reference-overlay" className="portfolio-history-dialog portfolio-reference enhanced-portfolio ep-history" data-directory-overview={onLedger ? true : undefined} data-theme={theme} data-testid="enhanced-portfolio-history" onCloseAutoFocus={onCloseAutoFocus}>
    <header className="m-head ep-dialog-heading"><ClientMark client={client} /><div>{onLedger && <div className="eyebrow">Client overview</div>}<DialogTitle className="m-title">{client.name}</DialogTitle><DialogDescription className="m-meta">GRC lead · {grcLead(client).name} <span className={"st ep-attention-chip ep-" + clientAttention(client, asOf).tone}><i />{clientAttention(client, asOf).label}</span></DialogDescription></div><div className="ep-dialog-actions"><button type="button" className="cta ep-button" onClick={() => onNavigate('/dashboard')}>Open client portal <ArrowUpRight size={16} aria-hidden="true" /></button><DialogClose className="icon-btn ep-close" aria-label="Close implementation preview"><X size={18} aria-hidden="true" /></DialogClose></div></header>
    {onLedger && <OverviewTabs active={tab} onChange={setTab} />}
    <div className="m-body ep-history-body ph-body" data-overview-tab={onLedger ? tab : undefined} {...(onLedger ? {id:"client-overview-pane",role:"tabpanel",tabIndex:0,"aria-labelledby":"overview-tab-"+tab} : {})}>
      {/* Context keys reset disclosure state without resetting history controls on refresh. */}
      <div className="ep-glance"><WorkList key={JSON.stringify([client.client_id, programIdentity(program), 'overdue'])} client={client} items={work.overdue} title="Overdue" asOf={cutoff} onNavigate={onNavigate} /><WorkList key={JSON.stringify([client.client_id, programIdentity(program), 'due30'])} client={client} items={work.due30} title="Next 30 days" asOf={cutoff} onNavigate={onNavigate} /></div>
      <div className="ep-program-switch"><span>Program</span><div className="prog-tabs ep-segment" role="group" aria-label="Select program">{programs.map(value => <button key={programIdentity(value)} type="button" className={`prog-tab${programIdentity(value) === programIdentity(program) ? ' active' : ''}`} aria-pressed={programIdentity(value) === programIdentity(program)} onClick={() => onSelect(programIdentity(value))}>{value.program_label}</button>)}</div></div>
      {onLedger ? <DirectoryProgramStatus program={program} current={current} /> : <section className="impl ep-current"><div><p>{program.program_label} · current implementation</p><strong className="impl-big">{value == null ? percentage(current) : <>{value.toFixed(1)}<small>%</small></>}</strong><p>{valid ? `${current.implemented} of ${current.denominator} implemented · assessed ${current.denominator - (counts.find(count => count.key === 'not_assessed')?.count || 0)} of ${current.denominator}` : current?.reason || 'Current implementation unavailable'}</p><small>As of {formatPortfolioDate(current?.effective_at || current?.captured_at || cutoff)}</small><button type="button" className="ep-link" onClick={() => onNavigate(program.to)}>Open {program.program_label} workspace →</button></div><CompactBreakdown current={current} /></section>}
      <div className="tiles ep-periods" role="group" aria-label="Implementation changes">{PERIODS.map(([key, months]) => {
            const saved = reports[key],
              data = saved.data;
            const comparison = data && periodChange(data.snapshots, data.current, calendarRangeStart(data.as_of, months), {
              comparison: data.comparison,
              scopeChanges: data.scope_changes, demoScenario:data.scenario_context
            });
            return <button key={key} type="button" className={`tile-btn${range === key ? ' active' : ''}`} aria-pressed={range === key} onClick={() => setRange(key)}><span className="tile-lbl">{months} month{months === 1 ? '' : 's'}</span><strong className={`tile-val${comparison?.comparable ? comparison.change_pp < 0 ? ' ep-red' : ' ep-green' : ''}`}>{comparison?.comparable ? <>{signedPoints(comparison.change_pp)} <small>pts</small></> : '—'}</strong><small className="tile-sub">{saved.error ? 'History unavailable' : saved.loading ? 'Loading saved history…' : comparison?.comparable ? `${formatPortfolioDate(calendarRangeStart(data.as_of, months), {
                  year: undefined
                })}–${formatPortfolioDate(data.as_of, {
                  year: undefined
                })}${comparison.scope_changed ? ' · scope changed' : ''}` : 'Not enough history'}</small></button>;
          })}</div>
      <section className="card est ep-forecast"><div><p>Estimated completion</p><strong className="est-big">{forecast.ok ? forecast.estimated_at ? formatPortfolioDate(forecast.estimated_at, {
                day: undefined
              }) : forecast.label : 'Estimate unavailable'}</strong><p className="est-txt">{forecast.ok ? forecast.note : report.loading ? 'Loading saved progress…' : forecast.reason}</p>{forecast.ok && forecast.monthly_pace != null && <p className="est-txt">{current.denominator - current.implemented} remaining · {forecast.monthly_pace.toFixed(1)} {language.unit}/month</p>}</div>{value != null && <div className="ep-forecast-track"><span>{value.toFixed(1)}% now</span><span>100%</span><div><i style={{
                width: `${value}%`
              }} /></div></div>}</section>
      <section className="card ep-history-card"><div className="card-head ep-chart-heading"><h3 className="card-title">Implementation history</h3><div className="ep-segment" role="group" aria-label="History range">{PERIODS.map(([key, months]) => <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{months} month{months === 1 ? '' : 's'}</button>)}</div></div>
        {report.error ? <div role="alert"><p>{report.error}</p><button type="button" className="ep-button" onClick={report.retry}>Retry</button></div> : report.loading && !report.data ? <p role="status">Loading saved history…</p> : <PortfolioHistoryChart key={programIdentity(program) + range} points={points} start={start} asOf={cutoff} view="line" current={current} scopeChanges={changes} unit={language.unit} showProvenance={showProvenance} demoScenario={report.data?.scenario_context} stackedHistory />}
        <div className="ep-chart-legend">{counts.slice(0, 1).map(count => <span key={count.key}><i className="ep-status-0" />{count.label}</span>)}</div>
      </section>
    </div><OverviewFooter onLedger={onLedger} program={program} onNavigate={onNavigate} />
  </DialogContent></Dialog>;
}
