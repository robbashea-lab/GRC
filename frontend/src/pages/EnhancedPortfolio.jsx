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
import { ClientMark, Attention, signedPoints } from '@/components/EnhancedPortfolioShared';
import { enhancedPortfolioEligible, filterPortfolio, PORTFOLIO_KPIS, portfolioKpiValue, operationalItems, trailingChange } from '@/lib/enhancedPortfolio';
import { PortfolioSparkline, PortfolioStatusBar, sparklineSpan, formatPortfolioDate } from '@/components/PortfolioReports';
import EnhancedPortfolioHistory from '@/components/EnhancedPortfolioHistory';
import './EnhancedPortfolio.css';

// Portfolio appearance is independent of the currently selected operational client.
export default function EnhancedPortfolioBoundary({
  children
}) {
  const auth = useAuth(), location = useLocation();
  const eligible = enhancedPortfolioEligible({
    user: auth.user,
    pathname: location.pathname,
    authLoading: auth.loading,
    authError: auth.error
  });
  if (location.pathname === '/clients' && (auth.loading || auth.error)) {
    return <section className="enhanced-portfolio"><p className="ep-empty" role={auth.error ? 'alert' : 'status'}>{auth.error ? 'Portfolio unavailable' : 'Loading client portfolio…'}</p></section>;
  }
  const identity = JSON.stringify([auth.user?.user_id, auth.user?.role, auth.user?.workspace_mode, !!auth.user?.all_clients, [...(auth.user?.client_ids || [])].sort()]);
  return eligible ? <EnhancedPortfolio key={identity} user={auth.user} /> : children;
}
export function EnhancedPortfolio({
  user
}) {
  const navigate = useNavigate(),
    {
      switchClient
    } = useOrg();
  const [theme, setTheme] = useBrawndoTheme();
  useBrawndoPortalTheme(true, theme);
  const [preferences, updatePreferences, restoreScroll] = usePortfolioView(user);
  const state = {
    search: preferences.search || '', mine: !!preferences.mine,
    framework: preferences.framework === 'all' ? '' : preferences.framework || '',
    sort: preferences.enhancedSort || 'attention', view: preferences.enhancedView || 'clients',
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
  const frameworks = [...new Map(programs.map(program => [program.program_key, program.program_label]))];
  const demoContext = {trustedDemo: PREVIEW_MODE, workspaceMode: useAuth().workspaceMode, user};
  const base = data ? filterPortfolio(clients, programs, state, user.user_id, asOf, false, demoContext) : [];
  const visible = data ? filterPortfolio(clients, programs, state, user.user_id, asOf, true, demoContext) : [];
  const span = data ? sparklineSpan(programs, asOf) : 8;
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
  return <section className="enhanced-portfolio" data-theme={theme}>
    <header className="ep-heading"><div><h1>Client portfolio</h1><p>{report.loading ? "Loading client portfolio…" : report.error ? "Portfolio unavailable" : <>{clients.length} clients · {programs.length} programs · as of {formatPortfolioDate(asOf)}</>}</p></div><div className="ep-segment" role="group" aria-label="Theme">{['light', 'dark'].map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</div></header>
    <div className="ep-kpis" role="group" aria-label="Portfolio summary">{PORTFOLIO_KPIS.map(([key, label, help]) => <button key={key} type="button" className="ep-kpi" aria-pressed={state.kpi === key} disabled={!data || key === 'notstarted' && portfolioKpiValue(key, base, asOf) == null} onClick={() => update({
        kpi: state.kpi === key ? null : key
      })}><span>{label}</span><strong>{data ? portfolioKpiValue(key, base, asOf) ?? '—' : '—'}</strong><small>{key === "notstarted" && data && portfolioKpiValue(key, base, asOf) == null ? "Onboarding state unavailable" : help}</small></button>)}</div>
    <div className="ep-box"><div className="ep-toolbar">
      <input ref={search} type="search" placeholder="Search client, lead or framework…" aria-label="Search clients" value={state.search} onChange={event => update({
          search: event.target.value
        })} />
      <div className="ep-segment" role="group" aria-label="Scope">{[[false, 'All clients'], [true, 'Assigned to me']].map(([value, label]) => <button key={label} type="button" aria-pressed={state.mine === value} onClick={() => update({
            mine: value
          })}>{label}</button>)}</div>
      <select aria-label="Framework" value={state.framework} onChange={event => update({
          framework: event.target.value
        })}><option value="">All frameworks</option>{frameworks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <label>Sort <select aria-label="Sort clients" value={state.sort} onChange={event => update({
            sort: event.target.value
          })}><option value="attention">Needs attention first</option><option value="name">Client name A–Z</option><option value="next">Next key date</option></select></label>
      <div className="ep-segment" role="group" aria-label="View">{[['clients', 'Clients'], ['leads', 'By lead']].map(([value, label]) => <button key={value} type="button" aria-pressed={state.view === value} onClick={() => update({
            view: value
          })}>{label}</button>)}</div>
    </div>
    {report.loading ? <p className="ep-empty" role="status">Loading client portfolio…</p> : report.error ? <div className="ep-empty" role="alert"><p>{report.error}</p><button type="button" className="ep-button" onClick={load}>Retry</button></div> : state.view === 'clients' ? <div role="table" aria-label="Client portfolio"><div className="ep-columns" role="row">{['Client', 'Attention', 'Programs', 'Trend · 90 days', 'GRC lead', 'Next key date', 'History preview'].map(label => <span role="columnheader" key={label}>{label === 'History preview' ? <span className="sr-only">{label}</span> : label}</span>)}</div><div role="rowgroup">{visible.map(client => {
            const visiblePrograms = programs.filter(program => program.client_id === client.client_id && (!state.framework || program.program_key === state.framework));
            const lead = grcLead(client),
              work = operationalItems(client, asOf),
              first = visiblePrograms[0];
            return <div className="ep-row" role="row" key={client.client_id} data-client-id={client.client_id}>
        <div className="ep-client" role="cell"><ClientMark client={client} /><div><button type="button" className="ep-client-link" onClick={() => enter(client)}>{client.name}</button><small>{client.industry || 'Not set'}</small></div></div>
        <div role="cell"><Attention client={client} asOf={asOf} /></div>
        <div className="ep-programs" role="cell">{visiblePrograms.map(program => <ProgramCell key={programIdentity(program)} client={client} program={program} onPreview={event => preview(client, program, event)} />)}{!visiblePrograms.length && <><small>No enabled programs</small><button type="button" className="ep-link" onClick={event => preview(client, null, event)}>View existing work</button></>}</div>
        <div className="ep-trends" role="cell">{visiblePrograms.map(program => {
                  const change = trailingChange(program, asOf);
                  return <div key={programIdentity(program)}><PortfolioSparkline program={program} asOf={asOf} span={span} /><small>{change.comparable ? <><b>{signedPoints(change.change_pp)} pts</b> · 90 days{change.scope_changed ? ' · scope changed' : ''}</> : 'Insufficient history'}</small></div>;
                })}</div>
        <div className="ep-lead" role="cell"><span aria-hidden="true">{lead.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>{lead.name}</div>
        <div className="ep-key-date" role="cell">{work.next ? <><b>{formatPortfolioDate(work.next.due_date, {
                      year: undefined
                    })}</b><small>{work.next.overdue ? 'Overdue · ' : ''}{work.next.title}</small></> : <><b>—</b><small>Nothing scheduled</small></>}</div>
        <div role="cell"><button type="button" className="ep-preview" aria-label={`Preview ${client.name} implementation`} onClick={event => preview(client, first, event)}>›</button></div>
      </div>;
          })}</div></div> : <div className="ep-leads">{groups.map(([id, group]) => <div className="ep-lead-card" key={id}><header><b>{group.lead}</b><small>{group.clients.length} clients</small></header><div className="ep-lead-numbers">{[['overdue', 'Overdue'], ['attention', 'Need attention'], ['due30', 'Due in 30 days']].map(([key, label]) => <div key={key}><b>{portfolioKpiValue(key, group.clients, asOf)}</b><small>{label}</small></div>)}</div><div className="ep-tags">{group.clients.map(client => <button key={client.client_id} type="button" onClick={() => enter(client)}>{client.name}</button>)}</div></div>)}</div>}
    {!report.loading && !report.error && !visible.length && <div className="ep-empty">{state.mine && !state.search.trim() && !state.framework && !state.kpi
      ? <>No clients are currently assigned to you. <button type="button" className="ep-button" onClick={() => update({mine:false})}>Show all clients</button></>
      : <>No clients match the selected filters. <button type="button" className="ep-button" onClick={clear}>Clear filters</button></>}</div>}
    <footer><span>Showing {visible.length} of {base.length} matching clients</span><span>Assessment progress, not a compliance determination. Percentages aren't comparable across frameworks, so there's no portfolio-wide ranking by %.</span></footer></div>
    {selectionAvailable && <EnhancedPortfolioHistory client={selected} programs={selectedPrograms} selected={selection.programId} onSelect={programId => setSelection(previous => ({
      ...previous,
      programId
    }))} asOf={asOf} refreshToken={report.revision} onClose={() => setSelection(null)} onCloseAutoFocus={restoreFocus} onNavigate={path => enter(selected, path)} theme={theme} />}
  </section>;
}
function ProgramCell({
  client,
  program,
  onPreview
}) {
  const current = program.current,
    percentage = currentPercentage(current),
    valid = validImplementationPosition(current);
  const assessed = valid ? current.denominator - (applicableCounts(current).find(value => value.key === 'not_assessed')?.count || 0) : null;
  const progressLabel = percentage == null ? 'Implementation unavailable' : `${percentage.toFixed(1)}%, ${current.implemented} of ${current.denominator} implemented`;
  const assessedLabel = assessed == null ? 'Assessment unavailable' : `Assessed ${assessed} of ${current.denominator}`;
  const statusLabel = valid ? applicableCounts(current).map(value => `${value.count} ${value.label}`).join(', ') : 'Status counts unavailable';
  return <button type="button" className="ep-program" onClick={onPreview} aria-haspopup="dialog" aria-label={`${client.name} ${program.program_label} implementation history; ${progressLabel}; ${assessedLabel}; ${statusLabel}`}><span className="ep-framework">{program.program_label}</span><span className="ep-progress">{percentage == null ? '—' : `${percentage.toFixed(1)}%`} <small>{valid ? `${current.implemented}/${current.denominator}` : ''}</small></span><PortfolioStatusBar snapshot={current} /><span className="ep-assessed">{assessed == null ? 'Implementation unavailable' : `Assessed ${assessed} of ${current.denominator}`}</span></button>;
}
