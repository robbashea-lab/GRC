import {useCallback, useEffect, useRef, useState} from 'react';

import {useNavigate} from 'react-router-dom';

import api, {formatError, PREVIEW_MODE} from '@/lib/api';

import {useAuth} from '@/context/AuthContext';

import {useOrg} from '@/context/OrgContext';

import {grcLead} from '@/lib/clientRelationships';

import {usePortfolioView} from '@/lib/usePortfolioView';

import {usePortfolioRefresh} from '@/lib/usePortfolioRefresh';

import {clientDestination} from '@/lib/clientSelection';

import {applicableCounts, currentPercentage, portfolioGroups, programIdentity, periodChange, validImplementationPosition} from '@/lib/portfolioProgress';

import {inactiveDays, STALE_AFTER_DAYS} from '@/lib/portfolioOverview';

import PortfolioHistoryDialog, {PortfolioStatusBar, PortfolioSparkline, sparklineSpan, programLanguage, formatPortfolioDate} from '@/components/PortfolioReports';

import {Input} from '@/components/ui/input';

import {ChevronRight, Clock, Search, Sun} from 'lucide-react';

import {useBrawndoTheme, useBrawndoPortalTheme} from '@/lib/brawndoTheme';

import './GoverNaraPortfolio.css';
import EnhancedPortfolioBoundary from './EnhancedPortfolio';



const DAY = 86400000;

const SORTS = [['name', 'Client name A–Z'], ['name-desc', 'Client name Z–A'], ['progress-desc', 'Implementation, highest first'], ['progress', 'Implementation, lowest first'], ['change-desc', '90-day change, largest first'], ['activity-desc', 'Most recent activity']];

const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`;



export default function ClientDirectory() {

  const {user} = useAuth();

  const portfolio = user ? <Portfolio key={JSON.stringify([user.user_id, user.role, !!user.all_clients, [...(user.client_ids || [])].sort()])} user={user} /> : null;
  return user && PREVIEW_MODE === true && user.workspace_mode === 'demo'
    ? <EnhancedPortfolioBoundary>{portfolio}</EnhancedPortfolioBoundary> : portfolio;

}



function Portfolio({user}) {

  const nav = useNavigate(), {switchClient} = useOrg();

  const [view, update, restoreScroll] = usePortfolioView(user);

  const [theme, setTheme] = useBrawndoTheme();

  useBrawndoPortalTheme(true, theme);

  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');

  const [selection, setSelection] = useState(null);

  const [refreshToken, setRefreshToken] = useState(0);

  const generation = useRef(0), opener = useRef(null), search = useRef(null);

  const load = useCallback(async () => {

    const request = ++generation.current;

    setError('');

    try {

      const overview = await api.get('/portfolio/reporting/overview', {params: {range: '90d', include_archived: false}});

      if (!Array.isArray(overview.data?.clients) || !Array.isArray(overview.data?.programs) || !Number.isFinite(Date.parse(overview.data?.as_of))) throw new Error('The portfolio response is incomplete.');

      if (request === generation.current) {

        setData(overview.data);

        setRefreshToken(value => value + 1);

      }

    } catch (failure) {

      if (request === generation.current) setError(formatError(failure));

    } finally {

      if (request === generation.current) setLoading(false);

    }

  }, []);

  useEffect(() => { const sequence = generation; load(); return () => { sequence.current++; }; }, [load]);

  usePortfolioRefresh(load);

  useEffect(() => { if (!loading) restoreScroll(); });

  const clients = data?.clients || [];

  const accessibleIds = new Set(clients.map(client => client.client_id));

  const programs = (data?.programs || []).filter(program => accessibleIds.has(program.client_id));

  const groups = portfolioGroups(clients, programs, view, user.user_id);

  const count = groups.reduce((total, group) => total + group.programs.length, 0);

  const options = [...new Map(programs.map(program => [program.program_key, program.program_label])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const selectedFrameworkRemoved = !!data && view.framework && view.framework !== 'all' && !options.some(([key]) => key === view.framework);

  useEffect(() => {

    if (selectedFrameworkRemoved) update({framework: 'all', scroll: 0});

  }, [selectedFrameworkRemoved, update]);

  const span = sparklineSpan(groups.flatMap(group => group.programs), data?.as_of);

  const selectedClient = selection && clients.find(client => client.client_id === selection.client_id);

  const clientPrograms = selection ? programs.filter(program => program.client_id === selection.client_id) : [];

  const selectedProgram = clientPrograms.find(program => programIdentity(program) === selection?.identity);

  useEffect(() => {

    if (selection && data && (!selectedClient || !selectedProgram)) setSelection(null);

  }, [selection, data, selectedClient, selectedProgram]);

  const enter = (client, path = '/dashboard') => {

    switchClient(client.client_id);

    nav(clientDestination(client.client_id, path));

  };

  const openHistory = (client, program, trigger) => {

    opener.current = trigger;

    setSelection({client_id: client.client_id, identity: programIdentity(program)});

  };

  const closeHistory = () => setSelection(null);

  const focusOpener = event => {

    event.preventDefault();

    if (opener.current?.isConnected) opener.current.focus();

    else search.current?.focus();

  };

  const clear = () => update({search: '', framework: 'all', scroll: 0});

  const narrowed = !!(view.search?.trim() || view.framework && view.framework !== 'all');



  return <section className="governara-portfolio" data-theme={theme}>

    <header className="gp-head"><h1>Client Portfolio</h1>

      <button type="button" className="gp-theme" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>

        <Sun size={16} aria-hidden="true" /><span>{theme === 'dark' ? 'Light' : 'Dark'}</span>

      </button>

    </header>

    <div className="gp-register">

      <div className="gp-toolbar" data-testid="client-directory-filters">

        <div className="gp-search"><Search size={15} aria-hidden="true" /><Input ref={search} type="search" aria-label="Search clients" data-testid="client-directory-search" placeholder="Search client, lead or framework…" value={view.search || ''} onChange={event => update({search: event.target.value, scroll: 0})} /></div>

        <div className="gp-segmented" role="group" aria-label="Client scope">{[[false, 'All Clients'], [true, 'Assigned to Me']].map(([mine, label]) => <button key={label} type="button" aria-pressed={!!view.mine === mine} onClick={() => update({mine, scroll: 0})}>{label}</button>)}</div>

        <label className="gp-field">Framework <select aria-label="Framework" value={view.framework || 'all'} onChange={event => update({framework: event.target.value, scroll: 0})}><option value="all">All frameworks</option>{options.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>

        <label className="gp-field gp-sort">Sort by <select aria-label="Sort clients" value={view.sort || 'name'} onChange={event => update({sort: event.target.value, scroll: 0})}>{SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>

      </div>

      <div className="gp-countbar"><span>{loading ? 'Loading clients…' : error ? 'Portfolio unavailable' : <><strong>{groups.length}</strong> {groups.length === 1 ? 'client' : 'clients'} · <strong>{count}</strong> {count === 1 ? 'program' : 'programs'}</>}</span></div>

      {error ? <div className="gp-empty" role="alert"><p>{error}</p><button type="button" className="gp-link" onClick={load}>Retry</button></div> : <div className="gp-table-frame" role="region" aria-label="Client portfolio">

        <table className="gp-table" aria-label="Client portfolio"><thead><tr><th scope="col">Client</th><th scope="col">GRC Lead</th><th scope="col">Framework</th><th scope="col">Implementation progress</th><th scope="col">Last activity</th></tr></thead>

          <tbody>{loading ? <tr><td colSpan={5} className="gp-empty" role="status">Loading client programs…</td></tr> : !groups.length ? <tr><td colSpan={5} className="gp-empty"><p>{!clients.length ? 'No clients are currently available to you.' : view.mine && !narrowed ? 'No clients are currently assigned to you.' : 'No client programs match this search or filter.'}</p>{narrowed && <button type="button" className="gp-link" onClick={clear}>Clear search and filter</button>}</td></tr> : groups.map(({client, programs: visible}, groupIndex) => {

            const lead = grcLead(client), grouped = Math.max(1, visible.length);
            const firstRow = 1 + groups.slice(0, groupIndex).reduce((total, group) => total + Math.max(1, group.programs.length), 0);
            const groupRows = {gridRow: `${firstRow} / span ${grouped}`};

            const identityCells = <><td data-label="Client" rowSpan={grouped} style={groupRows}><div className="gp-client"><span className="gp-client-initial" aria-hidden="true">{client.name?.trim().charAt(0) || '—'}</span><div><button type="button" className="gp-client-name" onClick={() => enter(client)}>{client.name}</button><span className="gp-industry">{client.industry || '—'}</span></div></div></td><td data-label="GRC Lead" rowSpan={grouped} style={groupRows}><span className={!client.assigned_owner_id && !client.grc_lead_id ? 'gp-muted' : 'gp-lead'}>{lead.name}</span>{lead.notice && <span className="sr-only">{lead.notice}</span>}</td></>;

            const activity = <td data-label="Last activity" rowSpan={grouped} style={groupRows}><LastActivity activity={client.last_activity} asOf={data.as_of} /></td>;

            return visible.length ? visible.map((program, index) => <tr key={programIdentity(program)} className={index ? '' : 'gp-first-row'} data-client-id={client.client_id} data-program-id={programIdentity(program)}>

              {!index && identityCells}<td data-label="Framework" style={{gridRow: firstRow + index}}><button type="button" className="gp-framework" aria-label={`Open ${program.program_label} for ${client.name}`} onClick={() => enter(client, program.to)}>{program.program_label}</button></td>

              <td data-label="Implementation progress" style={{gridRow: firstRow + index}}><ProgressCell client={client} program={program} asOf={data.as_of} span={span} onOpen={event => openHistory(client, program, event.currentTarget)} /></td>{!index && activity}

            </tr>) : <tr key={client.client_id} data-client-id={client.client_id} className="gp-first-row">{identityCells}<td data-label="Framework" style={{gridRow: firstRow}} className="gp-muted">None selected</td><td data-label="Implementation progress" style={{gridRow: firstRow}} className="gp-muted">No enabled programs</td>{activity}</tr>;

          })}</tbody>

        </table>

      </div>}

    </div>

    {selectedClient && selectedProgram && <PortfolioHistoryDialog client={selectedClient} programs={clientPrograms} selected={selection.identity} onSelect={identity => setSelection(value => ({...value, identity}))} onClose={closeHistory} onCloseAutoFocus={focusOpener} onNavigate={path => enter(selectedClient, path)} chartView={view.chartView || 'line'} onChartViewChange={chartView => update({chartView})} referenceHistory={PREVIEW_MODE === true && user.workspace_mode === 'demo'} refreshToken={refreshToken} asOf={data.as_of} />}

  </section>;

}



function ProgressCell({client, program, asOf, span, onOpen}) {

  const current = program.current, percentage = currentPercentage(current), language = programLanguage(program);

  const valid = validImplementationPosition(current), counts = applicableCounts(current), noScope = valid && current.denominator === 0;

  const assessed = valid ? current.denominator - counts.find(value => value.key === 'not_assessed').count : null;

  const comparison = periodChange(program.snapshots_90d, current, new Date(Date.parse(asOf) - 90 * DAY).toISOString(), {comparison: program.comparison_90d, scopeChanges: program.scope_changes_90d});

  const label = percentage == null ? noScope ? 'No applicable scope' : current?.denominator === 0 ? 'Scope unavailable' : 'Unavailable' : current.not_started === true ? 'Not started' : `${percentage.toFixed(1)}%`;

  const firstSaved = program.snapshots_90d?.find(point => Number.isFinite(Date.parse(point.captured_at)));

  return <button type="button" className="gp-progress" onClick={onOpen} aria-label={`${client.name} ${program.program_label}: ${label}. ${assessed != null ? `${assessed} of ${current.denominator} assessed.` : 'Assessed count unavailable.'} ${comparison.comparable ? `90-day change ${signed(comparison.change_pp)} percentage points.` : '90-day change unavailable.'} Open implementation history`}>

    <span><strong className={percentage == null || current.not_started ? 'gp-percent is-muted' : 'gp-percent'}>{percentage != null && !current.not_started ? <>{percentage.toFixed(1)}<span className="gp-unit">%</span></> : label}</strong><span className="gp-progress-count">{percentage != null ? `${current.implemented} of ${current.denominator} ${language.verb}` : current?.reason || current?.notice || (noScope ? 'No applicable units' : 'Implementation data unavailable')}</span></span>

    <span><PortfolioStatusBar snapshot={current} /><span className="gp-progress-caption">{assessed != null ? `Assessed ${assessed} of ${current.denominator}` : 'Assessed count unavailable'}{comparison.scope_changed && <span> · Scope changed</span>}</span></span>

    {comparison.comparable ? <span className="gp-trend"><PortfolioSparkline program={program} asOf={asOf} span={span} /><span className="gp-delta"><b className={comparison.change_pp < 0 ? 'is-down' : ''}>{comparison.change_pp !== 0 && <svg className="gp-delta-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d={comparison.change_pp > 0 ? 'M6 10V2.5M2.5 6 6 2.5 9.5 6' : 'M6 2v7.5M2.5 6 6 9.5 9.5 6'} /></svg>} {Math.abs(comparison.change_pp).toFixed(1)} pts</b> · 90 days</span></span>

      : <span className="gp-tracking"><Clock size={14} aria-hidden="true" />{current.not_started ? 'No assessments yet' : firstSaved ? `Tracking since ${formatPortfolioDate(firstSaved.captured_at, {year: undefined})}` : 'History unavailable'}</span>}

    <ChevronRight size={14} aria-hidden="true" />

  </button>;

}



function LastActivity({activity, asOf}) {

  const days = inactiveDays(activity, new Date(asOf));

  if (!activity) return <span className="gp-activity">No activity recorded<br /><span className="gp-inactive"><Clock size={13} aria-hidden="true" />Never active</span></span>;

  return <span className="gp-activity"><time dateTime={activity.at}>{formatPortfolioDate(activity.at, {year: undefined})}</time><small>{activity.label}</small>{days >= STALE_AFTER_DAYS && <span className="gp-inactive"><Clock size={13} aria-hidden="true" />{days} days inactive</span>}</span>;

}
