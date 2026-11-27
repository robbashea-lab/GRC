import { Search, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { formatError, PREVIEW_MODE } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { clientDestination } from '@/lib/clientSelection';
import { usePortfolioRefresh } from '@/lib/usePortfolioRefresh';
import { usePortfolioView } from '@/lib/usePortfolioView';
import { useBrawndoTheme, useBrawndoPortalTheme } from '@/lib/brawndoTheme';
import { grcLead } from '@/lib/clientRelationships';
import { applicableCounts, currentPercentage, programIdentity, validImplementationPosition } from '@/lib/portfolioProgress';
import { ClientMark } from '@/components/EnhancedPortfolioShared';
import { enhancedPortfolioEligible, filterPortfolio, operationalItems, PORTFOLIO_KPIS, portfolioKpiValue, selectedPortfolioProgram } from '@/lib/enhancedPortfolio';
import {calendarDay, managementDay} from '@/lib/managementDates';
import { formatPortfolioDate, programLanguage } from '@/components/PortfolioReports';
import EnhancedPortfolioHistory from '@/components/EnhancedPortfolioHistory';
import PortfolioDirectoryTable from './PortfolioDirectoryTable';
import './PortfolioReference.css';
import './EnhancedPortfolio.css';
import './PortfolioDirectoryTable.css';

// Portfolio appearance is independent of the currently selected operational client.
export default function EnhancedPortfolioBoundary({
  children
}) {
  const auth = useAuth(), location = useLocation();
  const pathname = location.pathname === '/clients/' ? '/clients' : location.pathname;
  const eligible = enhancedPortfolioEligible({
    user: auth.user,
    pathname,
    authLoading: auth.loading,
    authError: auth.error
  });
  if (pathname === '/clients' && (auth.loading || auth.error)) {
    return <section className="enhanced-portfolio"><p className="ep-empty" role={auth.error ? 'alert' : 'status'}>{auth.error ? 'Portfolio unavailable' : 'Loading client portfolio.'}</p></section>;
  }
  const identity = JSON.stringify([auth.user?.user_id, auth.user?.role, auth.user?.workspace_mode, !!auth.user?.all_clients, [...(auth.user?.client_ids || [])].sort()]);
  return eligible ? <EnhancedPortfolio key={identity} user={auth.user} /> : children;
}
export function EnhancedPortfolio({
  user
}) {
  const ledger = new URLSearchParams(useLocation().search).get('view') === 'ledger';
  const navigate = useNavigate(),
    {
      switchClient
    } = useOrg();
  const [theme, setTheme] = useBrawndoTheme('dark');
  useBrawndoPortalTheme(true, theme);
  const [preferences, updatePreferences, restoreScroll] = usePortfolioView(user);
  const state = {
    search: preferences.search || '', mine: !!preferences.mine,
    framework: preferences.framework === 'all' ? '' : preferences.framework || '',
    sort: ['attention','name','next'].includes(preferences.enhancedSort) ? preferences.enhancedSort : 'attention', view: preferences.enhancedView || 'clients',
    kpi: PORTFOLIO_KPIS.some(([key]) => key === preferences.enhancedKpi) ? preferences.enhancedKpi : null,
  };
  const update = useCallback(patch => {
    const {sort, view, kpi, ...common} = patch;
    updatePreferences({...common,
      ...(sort === undefined ? {} : {enhancedSort:sort}),
      ...(view === undefined ? {} : {enhancedView:view}),
      ...(kpi === undefined ? {} : {enhancedKpi:kpi}),
    });
  }, [updatePreferences]);
  const [report, setReport] = useState({
    data: null,
    loading: true,
    error: '',
    revision: 0
  });
  const [selection, setSelection] = useState(null);
  const sequence = useRef(0),
    opener = useRef(null),
    search = useRef(null);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [reporting, operations] = await Promise.all([api.get('/portfolio/reporting/overview', {
        params: {
          range: '90d',
          include_archived: false
        }
      }), api.get('/clients/directory', {
        params: {
          include_archived: false
        }
      })]);
      const data = reporting.data;
      if (!Array.isArray(data?.clients) || !Array.isArray(data.programs) || !Array.isArray(operations.data?.clients) || !Number.isFinite(Date.parse(data.as_of))) throw new Error('The portfolio response is incomplete.');
      const byId = new Map(operations.data.clients.map(client => [client.client_id, client]));
      if (data.clients.some(client => !byId.has(client.client_id) || ['past_due', 'due_30d', 'due_31_90d'].some(key => !Array.isArray(byId.get(client.client_id).metric_items?.[key])))) {
        throw new Error('The operational portfolio response is incomplete. Refresh and try again.');
      }
      const clients = data.clients.map(client => ({
        ...client,
        ...byId.get(client.client_id)
      }));
      if (request === sequence.current) setReport(previous => ({
        data: {
          ...data,
          clients
        },
        loading: false,
        error: '',
        revision: previous.revision + 1
      }));
    } catch (failure) {
      if (request === sequence.current) setReport(previous => ({
        ...previous,
        data: null,
        loading: false,
        error: formatError(failure)
      }));
    }
  }, []);
  useEffect(() => {
    load();
    const requests = sequence;
    return () => {
      requests.current++;
    };
  }, [load]);
  usePortfolioRefresh(load);
  useEffect(() => {if (!report.loading) restoreScroll();});
  const data = report.data,
    clients = data?.clients || [],
    asOf = data?.as_of;
  const authorized = new Set(clients.map(client => client.client_id));
  const programs = (data?.programs || []).filter(program => authorized.has(program.client_id));
  const frameworks = [...new Map(programs.map(program => [program.program_key, program.program_label]))]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const demoContext = {trustedDemo: PREVIEW_MODE, workspaceMode: useAuth().workspaceMode, user};
  const directorySort = preferences.sort === 'name-desc' ? 'name-desc' : 'name';
  const filters = ledger ? state : {...state, sort: directorySort, kpi: null};
  const base = data ? filterPortfolio(clients, programs, filters, user.user_id, asOf, false, demoContext) : [];
  const visible = ledger && state.kpi ? filterPortfolio(clients, programs, state, user.user_id, asOf, true, demoContext) : base;
  const selected = clients.find(client => client.client_id === selection?.clientId);
  const selectedPrograms = programs.filter(program => program.client_id === selected?.client_id);
  const selectionAvailable = selected && !selected.archived && !selected.archived_at
    && !['archived', 'retired'].includes(selected.status)
    && (!selection.programId || selectedPrograms.some(program => programIdentity(program) === selection.programId));
  useEffect(() => {
    if (state.framework && data && !programs.some(program => program.program_key === state.framework)) update({framework:''});
  }, [data, programs, state.framework, update]);
  useEffect(() => {
    if (selection && !report.loading && !selectionAvailable) setSelection(null);
  }, [selection, selectionAvailable, report.loading]);
  const enter = (client, path = '/dashboard') => {
    if (switchClient(client.client_id) === false) return;
    navigate(clientDestination(client.client_id, path));
  };
  const programFor = client => selectedPortfolioProgram(programs, client.client_id, preferences.enhancedPrograms?.[client.client_id], state.framework);
  const chooseProgram = (clientId, programId) => updatePreferences({enhancedPrograms:{...preferences.enhancedPrograms, [clientId]:programId}});
  const preview = (client, program, event) => {
    opener.current = event.currentTarget;
    setSelection({
      clientId: client.client_id,
      programId: program ? programIdentity(program) : null
    });
  };
  const restoreFocus = event => {
    event.preventDefault();
    (opener.current?.isConnected ? opener.current : search.current)?.focus();
  };
  const clear = () => update({
    search: '',
    framework: '',
    kpi: null
  });
  const groups = [...visible.reduce((map, client) => {
    const id = client.grc_lead_id || client.assigned_owner_id || 'unassigned';
    if (!map.has(id)) map.set(id, {
      lead: grcLead(client).name,
      clients: []
    });
    map.get(id).clients.push(client);
    return map;
  }, new Map()).entries()];
  const empty = state.mine && !state.search.trim() && !state.framework && (!ledger || !state.kpi)
    ? <>No clients are currently assigned to you. <button type="button" className="ep-button ghost" onClick={() => update({mine:false})}>Show all clients</button></>
    : <>No clients match these filters. <button type="button" className="ep-button ghost" onClick={clear}>Clear filters</button></>;
  const count = `${clients.length} ${clients.length === 1 ? 'client' : 'clients'}`;
  return <section className={`enhanced-portfolio portfolio-reference wrap${ledger ? '' : ' v3-portfolio-directory'}`} data-theme={theme}>
    <header className="ep-heading page-head">
      <div style={{flex:'1 1 360px'}}><h1 className="page-title">Client portfolio</h1><p className="page-sub" aria-live="polite">{report.loading ? 'Loading client portfolio.' : report.error ? 'Portfolio unavailable' : ledger ? <>{clients.length} clients · {programs.length} programs · as of {formatPortfolioDate(asOf)}</> : visible.length === clients.length ? count : `${visible.length} of ${count}`}</p></div>
      {ledger && <button type="button" className="ep-link" onClick={() => navigate('/clients')}>Client directory</button>}
      <div className="ep-segment seg" role="group" aria-label="Theme">{['light', 'dark'].map(value => <button key={value} type="button" aria-pressed={theme === value} aria-checked={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</div>
    </header>
    <div className="ep-box">
      <div className="ep-toolbar toolbar">
        <label className="field ep-search"><Search size={15} aria-hidden="true" /><input ref={search} type="search" placeholder={ledger ? 'Search client, lead or framework…' : 'Search clients, frameworks, or leads…'} aria-label="Search clients" value={state.search} onChange={event => update({search:event.target.value})} /></label>
        <div className="ep-segment seg" role="group" aria-label="Scope">{[[false, 'All clients'], [true, 'Assigned to me']].map(([value, label]) => <button key={label} type="button" aria-pressed={state.mine === value} aria-checked={state.mine === value} onClick={() => update({mine:value})}>{label}</button>)}</div>
        <select className="select" aria-label="Framework" value={state.framework} onChange={event => update({framework:event.target.value})}><option value="">All frameworks</option>{frameworks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        {ledger ? <><label className="sort-label">Sort <select className="select" aria-label="Sort clients" value={state.sort} onChange={event => update({sort:event.target.value})}><option value="attention">Needs attention first</option><option value="name">Client name A–Z</option><option value="next">Next key date</option></select></label>
        <div className="ep-segment seg" role="group" aria-label="View">{[['clients', 'Clients'], ['leads', 'By lead']].map(([value, label]) => <button key={value} type="button" aria-pressed={state.view === value} aria-checked={state.view === value} onClick={() => update({view:value})}>{label}</button>)}</div></> :
        <select className="select directory-sort" aria-label="Sort clients" value={directorySort} onChange={event => updatePreferences({sort:event.target.value})}><option value="name">Client name A–Z</option><option value="name-desc">Client name Z–A</option></select>}
      </div>
      {ledger && <div className="pf-kstrip">
    <div className="kstrip" role="group" aria-label="Portfolio summary">{PORTFOLIO_KPIS.map(([key, label, help]) => {
      const value = data ? portfolioKpiValue(key, base, asOf) : null;
      return <button key={key} type="button" className="kchip" aria-pressed={state.kpi === key} disabled={!data || key === 'notstarted' && value == null} onClick={() => update({kpi:state.kpi === key ? null : key})}>
        <b className="num" style={{color:value && ['attention','overdue'].includes(key) ? 'var(--kpi-alert)' : key === 'notstarted' ? value ? 'var(--warn)' : 'var(--faint)' : undefined}}>{value == null ? '—' : value}</b><span className="kl">{label}</span>
        <span className="kc">{key === 'notstarted' ? value == null ? 'Onboarding state unavailable' : 'Clients awaiting program onboarding' : help}</span>
      </button>;
    })}</div>
      </div>}
      {report.loading ? <p className="ep-empty empty" role="status">Loading client portfolio.</p> : report.error ? <div className="ep-empty empty" role="alert"><p>{report.error}</p><button type="button" className="ep-button ghost" onClick={load}>Retry</button></div> : !ledger ? <PortfolioDirectoryTable clients={visible} programs={programs} onOpen={(client,event) => preview(client,programFor(client),event)} empty={empty} /> : state.view === 'clients' ? <section className="ep-register ss-panel"><div className="ss-intro"><h2 id="portfolio-ledger-title">Program status ledger</h2><p>Implementation status and assessment coverage for the selected framework.</p></div><div className="ss-table-wrap" tabIndex="0" role="region" aria-label="Program status ledger"><div className="ep-table ss-ledger" role="table" aria-label="Client portfolio" aria-colcount="7">
        <div className="ep-columns ss-head" role="row">{['Client / framework', 'Implemented / addressed', 'Partial implementation', 'With gaps', 'Not assessed', 'Assessed'].map(label => <span role="columnheader" key={label}>{label}</span>)}<span className="sr-only" role="columnheader">Open client</span></div>
        <div role="rowgroup">{visible.map(client => {
          const visiblePrograms = programs.filter(program => program.client_id === client.client_id && (!state.framework || program.program_key === state.framework));
          const lead = grcLead(client), first = programFor(client);
          const overdue = operationalItems(client, asOf).overdue;
          const oldest = Math.max(0, ...overdue.map(item => managementDay(asOf) - calendarDay(item.due_date)));
          const overdueDetail = [...overdue].sort((a,b) => a.due_date.localeCompare(b.due_date)).slice(0,5).map(item => `${item.title} (${managementDay(asOf) - calendarDay(item.due_date)} days)`).join('; ');
          return <div className="ep-row trow ss-row" role="row" key={client.client_id} data-client-id={client.client_id} onClick={event=>{if(!event.target.closest('button,a,input,select'))preview(client,first,{currentTarget:event.currentTarget.querySelector('.ep-client-link')});}}>
            <div className="ep-client ss-ident" role="cell"><ClientMark client={client} /><div className="ss-identity-text"><button type="button" className="ss-client ep-client-link" aria-label={`Open ${client.name} overview`} aria-describedby={`ep-details-${client.client_id}`} onClick={event => preview(client, first, event)}><strong className="client-name">{client.name}</strong></button>
              {visiblePrograms.length > 1 ? <div className="ss-frameworks" role="group" aria-label={`Framework for ${client.name}`}>{visiblePrograms.map(program => <button key={programIdentity(program)} type="button" className="ss-framework-button" aria-pressed={programIdentity(program) === programIdentity(first)} onClick={() => chooseProgram(client.client_id, programIdentity(program))}>{program.program_label}</button>)}</div> : first ? <small>{first.program_label}</small> : <button type="button" className="no-prog" onClick={() => enter(client,'/onboarding')}>No program yet · Start GRC Program Onboarding →</button>}
              <span className="sr-only" id={`ep-details-${client.client_id}`}>{client.industry || 'Industry not set'}; GRC lead: {lead.name}{overdue.length ? `; ${overdue.length} overdue; oldest ${oldest} days; ${overdueDetail}` : ''}</span>
            </div></div>
            <ProgramCells client={client} program={first} onPreview={event => preview(client, first, event)} />
            <div role="cell"><button type="button" className="ep-preview ss-open" aria-label={`Preview ${client.name} implementation`} onClick={event => preview(client, first, event)}><ChevronRight size={16} aria-hidden="true" /></button></div>
          </div>;
        })}</div>
      </div></div></section> : <div className="ep-leads leads">{groups.map(([id, group]) => <div className={`ep-lead-card lead-card${id === 'unassigned' ? ' unassigned' : ''}`} key={id}>
        <header className="ep-group-heading"><span className={`av${id === 'unassigned' ? ' none' : ''}`} aria-hidden="true">{id === 'unassigned' ? '?' : group.lead.split(' ').map(part => part[0]).slice(0,2).join('')}</span><span><b>{group.lead}</b><small className="sub">{group.clients.length} clients</small></span></header>
        <dl className="ep-lead-numbers lead-stats">{[['overdue', 'Overdue'], ['attention', 'Need attention'], ['due30', 'Due in 30 days']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd className="num">{portfolioKpiValue(key, group.clients, asOf)}</dd></div>)}</dl>
        <div className="ep-tags">{group.clients.map(client => <button className="pill-btn" key={client.client_id} type="button" onClick={event => preview(client, programFor(client), event)}><ClientMark client={client}/>{client.name}</button>)}</div>
      </div>)}</div>}
      {ledger && !report.loading && !report.error && !visible.length && <div className="ep-empty empty">{empty}</div>}
      {ledger && <footer className="gt-foot"><span>Showing {visible.length} of {base.length} matching clients</span><span style={{marginLeft:'auto'}}>Assessment progress, not a compliance determination. Percentages aren't comparable across frameworks, so there's no portfolio-wide ranking by %.</span></footer>}
    </div>
    {selectionAvailable && <EnhancedPortfolioHistory client={selected} programs={selectedPrograms} selected={selection.programId} onSelect={programId => {chooseProgram(selected.client_id, programId); setSelection(previous => ({...previous, programId}));}} asOf={asOf} refreshToken={report.revision} onClose={() => setSelection(null)} onCloseAutoFocus={restoreFocus} onLedger={ledger ? undefined : () => { setSelection(null); navigate('/clients?view=ledger'); }} onNavigate={path => enter(selected, path)} theme={theme} />}
  </section>;
}

function ProgramCells({client, program, onPreview}) {
  const current = program?.current, valid = validImplementationPosition(current), scoped = valid && current.denominator > 0;
  const counts = valid ? applicableCounts(current) : [], percentage = currentPercentage(current);
  const assessed = valid ? current.denominator - counts.find(value => value.key === 'not_assessed').count : null;
  const statusLabel = valid ? counts.map(value => `${value.count} ${value.label}`).join(', ') : 'Status counts unavailable';
  const progressLabel = percentage == null ? 'Implementation unavailable' : `${percentage.toFixed(1)}%, ${current.implemented} of ${current.denominator} implemented`;
  const assessedLabel = assessed == null ? 'Assessment unavailable' : `Assessed ${assessed} of ${current.denominator}`;
  const reason = valid && current.denominator === 0 ? 'No applicable items' : 'Applicable scope unavailable';
  const share = count => `${(count / current.denominator * 100).toFixed(1)}%`;
  const unit = program ? programLanguage(program).unit : 'items';
  return <>
    <div role="cell"><button type="button" className={`ep-program ss-primary${scoped ? '' : ' ss-unavailable'}`} onClick={onPreview} aria-haspopup="dialog" aria-label={`${client.name} ${program?.program_label || 'client'} implementation history; ${progressLabel}; ${assessedLabel}; ${statusLabel}`}>
      <span className="ep-framework sr-only">{program?.program_label || 'No program yet'}</span><strong className="ep-progress">{percentage == null ? '-' : `${percentage.toFixed(1)}%`}</strong><small>{scoped ? `${current.implemented} of ${current.denominator} ${unit}` : reason}</small>
      <span className="sr-only">{assessedLabel}; {statusLabel}</span>
    </button></div>
    {['in_progress', 'needs_attention', 'not_assessed'].map((key, index) => {
      const count = counts.find(value => value.key === key);
      return <div key={key} className="ss-status" role="cell"><div className={`ss-stat ${['ss-partial','ss-gap','ss-unassessed'][index]}${!scoped || count.count === 0 ? ' ss-zero' : ''}`} aria-label={scoped ? `${count.label}: ${count.count} of ${current.denominator} (${share(count.count)})` : reason}><strong>{scoped ? count.count : '-'}</strong><span>{scoped ? share(count.count) : <span className="sr-only">{reason}</span>}</span></div></div>;
    })}
    <div className={`ep-assessed ss-assessed${scoped ? '' : ' ss-unavailable'}`} role="cell"><strong>{scoped ? share(assessed) : '-'}</strong><small>{scoped ? `${assessed} of ${current.denominator}` : valid && current.denominator === 0 ? 'No applicable items' : 'Scope unavailable'}</small></div>
  </>;
}
