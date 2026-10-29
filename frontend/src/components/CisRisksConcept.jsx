import {Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import api, {formatError} from '@/lib/api';
import {riskCoordinates} from './BrawndoRiskMatrix';
import {riskLevel} from '@/lib/grcWork';
import {riskIsClosed} from '@/lib/riskRegister';
import {pilotRiskStatus} from '@/lib/brawndoRisks';
import {personLabel} from '@/lib/people';
import {actionStatus} from '@/lib/actionItems';
import {riskReviewDate} from '@/lib/brawndoRisksPresentation';
import {currentQuarter, shiftQuarter, quarterlyRiskEvents, isOverdue} from '@/lib/quarterlyProgramTimeline';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {RISK_CONCEPT_TYPES, riskDate, riskUrgency, riskConceptFigures, riskConceptQuarter, riskTreatmentRelations} from '@/lib/cisRisksConcept';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from './ui/dialog';
import DeadlineClock from './DeadlineClock';

const bands = [['low', '1–4 Low'], ['moderate', '5–9 Moderate'], ['high', '10–14 High'], ['critical', '15–25 Critical']];
const eventType = event => RISK_CONCEPT_TYPES.find(type => type.kind === event.kind);
const idLabel = risk => risk.display_id || risk.risk_id;
const levelLabel = level => level[0].toUpperCase() + level.slice(1);
// Robb approved distinct legacy labels while retaining native Closed membership.
const statusLabel = risk => risk.status === 'retired' ? 'Retired (legacy)' : pilotRiskStatus(risk.status || 'open');

function Icon({name}) {
  const shapes = {
    file: <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6"/>,
    alert: <path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4m10-4v4M7 14h2m4 0h2m-8 4h2m4 0h2"/></>,
    users: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    grid: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18m6-18v18"/></>,
    download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>,
    plus: <path d="M12 4v16M4 12h16"/>,
    filter: <path d="M3 5h18M6 12h12M9 19h6"/>,
    left: <path d="m14 6-6 6 6 6"/>,
    right: <path d="m9 6 6 6-6 6"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{shapes[name]}</svg>;
}

function Score({risk}) {
  const coordinates = riskCoordinates(risk);
  if (!coordinates) return <span className="risk-id">Needs assessment</span>;
  const score = risk.likelihood_score * risk.impact_score, level = riskLevel(score);
  return <span className={`score-badge ${level}`}>{score} · {levelLabel(level)}</span>;
}

function riskScoreText(risk) {
  if (!riskCoordinates(risk)) return 'Needs assessment';
  const score = risk.likelihood_score * risk.impact_score;
  return `${score} ${levelLabel(riskLevel(score))}`;
}

function RiskStatus({risk}) {
  return <span className={`risk-status ${statusLabel(risk).toLowerCase().replaceAll(' ', '-')}`}>{statusLabel(risk)}</span>;
}

function DateBadge({value, now}) {
  const urgency = riskUrgency(value, now);
  return <span className={`due-badge ${urgency.className}`}>{urgency.className==='overdue'?<DeadlineClock>{urgency.text}</DeadlineClock>:urgency.text}</span>;
}

// This component projects the authorized collections; all commands remain in RiskRegister/RecordDrawer.
export default function CisRisksConcept({rows, filtered, users, matches, view, onView, search, onSearch,
  table, filters, onOpenRisk, onOpenEvent, onNewRisk, onRiskScale, onExport, canWrite,
  clientId, clientName, refreshLabel, scope, recordOpen = false, nativeDefaultOrder = false, now = new Date()}) {
  const [theme] = useBrawndoTheme();
  const [quarter, setQuarter] = useState(() => currentQuarter(now));
  const [mode, setMode] = useState('upcoming');
  const [kind, setKind] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [list, setList] = useState(null);
  const [tip, setTip] = useState(null);
  const [width, setWidth] = useState(500);
  const [linked, setLinked] = useState({rows: null, scope: null, relations: {}, error: ''});
  const plotRef = useRef(null), tipRef = useRef(null), filterRef = useRef(null), filterButton = useRef(null);
  const listOpener = useRef(null), mounted = useRef(false), nativeOpen = useRef(recordOpen);
  const filtersOpen = useRef(showFilters);
  filtersOpen.current = showFilters;
  nativeOpen.current = recordOpen;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    // /related has a 200-Action display cap. The native complete collection fails explicitly above its bound.
    if (!clientId) return () => controller.abort();
    api.get('/tasks', {params: {client_id: clientId}, signal: controller.signal}).then(({data}) => {
      const relations = riskTreatmentRelations(rows, data, clientId);
      if (!controller.signal.aborted) setLinked({rows, scope, relations, error: ''});
    }).catch(error => {
      if (!controller.signal.aborted) setLinked({rows, scope, relations: {}, error: formatError(error)});
    });
    return () => controller.abort();
  }, [rows, scope, clientId]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return undefined;
    let active = true;
    const measure = () => { if (active) { setWidth(plot.clientWidth || 500); setTip(null); } };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(plot);
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    const close = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      setTip(null);
      if (event.type === 'keydown' && filtersOpen.current && !nativeOpen.current) {
        setShowFilters(false);
        if (filterButton.current?.isConnected) filterButton.current.focus({preventScroll: true});
      }
    };
    window.addEventListener('scroll', close, true);
    document.addEventListener('keydown', close);
    return () => { window.removeEventListener('scroll', close, true); document.removeEventListener('keydown', close); };
  }, []);
  useEffect(() => {
    if (!showFilters) return undefined;
    filterRef.current?.querySelector('button,select,input')?.focus({preventScroll: true});
    const outside = event => {
      // Native column menus are portals and retain their own dismissal/focus behavior.
      if (!filterRef.current?.contains(event.target) && !filterButton.current?.contains(event.target)
        && !event.target.closest?.('[role="menu"]')) setShowFilters(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [showFilters]);
  useEffect(() => { setTip(null); }, [quarter, kind, theme]);
  useEffect(() => { if (recordOpen) { setList(null); setShowFilters(false); setTip(null); } }, [recordOpen]);

  const ready = linked.rows === rows && linked.scope === scope;
  const projection = useMemo(() => quarterlyRiskEvents(rows, ready ? linked.relations : {}), [rows, ready, linked.relations]);
  const allQuarter = riskConceptQuarter(projection.events, quarter, width, now);
  const timeline = riskConceptQuarter(projection.events.filter(event => !kind || event.kind === kind), quarter, width, now);
  const upcoming = allQuarter.events.filter(event => event.day >= allQuarter.today);
  const overdue = allQuarter.events.filter(event => isOverdue(event, now));
  const agenda = mode === 'overdue' ? overdue : upcoming;
  const figures = riskConceptFigures(rows, matches, now);
  const active = rows.filter(risk => matches(risk, 'all_active', now));
  const accepted = rows.filter(risk => matches(risk, 'accepted', now));
  const closed = rows.filter(riskIsClosed);
  const registerRows = table.state.sort || nativeDefaultOrder ? filtered : [...filtered].sort((a, b) => String(idLabel(a)).localeCompare(String(idLabel(b)), undefined, {numeric: true}) || a.risk_id.localeCompare(b.risk_id));
  const filterCount = Object.values(table.state.filters || {}).filter(values => values.length).length
    + (!['all_active', 'accepted', 'closed'].includes(view) ? 1 : 0);
  const selectedTab = view === 'all' ? null : view === 'closed' ? 'closed' : view === 'accepted' ? 'accepted' : 'active';
  const owner = record => record.owner_id ? personLabel(users, record.owner_id) : 'Unassigned';
  const eventOwner = event => event.kind === 'action' ? (event.record.assignee_id ? personLabel(users, event.record.assignee_id) : 'Unassigned') : owner(event.risk);
  const openList = (selection, opener) => { setTip(null); setShowFilters(false); listOpener.current = opener; setList(selection); };
  const enterRisk = risk => { setList(null); setTip(null); onOpenRisk(risk); };
  const enterEvent = event => { setList(null); setTip(null); onOpenEvent(event.kind === 'action' ? 'tasks' : 'risks', event.record); };
  const openDate = (date, highlight, opener) => openList({
    eyebrow: 'SAVED RISK EVENTS', title: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'}),
    subtitle: `${timeline.events.filter(event => event.date.slice(0, 10) === date).length} saved events · ${riskUrgency(date, now).text.toLowerCase()}`,
    eventSource: 'date', date, highlight,
  }, opener);

  // Selection identity stays local; async collection refreshes supply the list's current records.
  const listEvents = !list?.eventSource ? null : list.eventSource === 'date'
    ? timeline.events.filter(event => event.date.slice(0, 10) === list.date)
    : list.eventSource === 'agenda' ? agenda : timeline.events;
  const listRisks = list?.coordinates ? active.filter(risk => riskCoordinates(risk) === list.coordinates.join(':')) : null;
  const listDetails = listEvents ? {...list, events: listEvents,
    subtitle: list.subtitle.replace(/^\d+/, String(listEvents.length)) + (!ready ? ' · linked Actions loading' : linked.error ? ' · linked Actions unavailable' : ''),
  } : listRisks ? {...list, risks: listRisks, title: `${listRisks.length} ${listRisks.length === 1 ? 'risk' : 'risks'} at score ${list.coordinates[0] * list.coordinates[1]}`} : list;

  useLayoutEffect(() => {
    if (!tip || !tipRef.current || !tip.anchor.isConnected) return;
    const anchor = tip.anchor.getBoundingClientRect(), box = tipRef.current.getBoundingClientRect();
    const left = anchor.right + 10 + box.width > window.innerWidth - 10 ? anchor.left - box.width - 10 : anchor.right + 10;
    tipRef.current.style.left = `${Math.max(10, Math.min(window.innerWidth - box.width - 10, left))}px`;
    tipRef.current.style.top = `${Math.max(10, Math.min(window.innerHeight - box.height - 10, anchor.top - box.height / 2 + 12))}px`;
  }, [tip]);

  return <div className="cis-risks-concept" data-theme={theme} data-testid="cis-risks-concept">
    <header className="page-heading"><div><div className="eyebrow">{clientName} · Risk register</div><h1>{clientName} Risks</h1><p>Risk register · current assessed likelihood × impact{refreshLabel ? ` · As of ${refreshLabel}` : ''}</p></div>
      <div className="page-actions"><button type="button" className="button" onClick={onRiskScale} data-testid="risk-matrix-btn"><Icon name="grid"/>Risk scale</button><button type="button" className="button" onClick={onExport} data-testid="risks-export"><Icon name="download"/>Export CSV</button>{canWrite && <button type="button" className="button primary" onClick={onNewRisk} data-testid="new-risk"><Icon name="plus"/>New risk</button>}</div></header>
    <section className="kpis" aria-label="Risk summaries">{figures.map((figure, index) => <button type="button" key={figure.id} className={`kpi kpi-${['active', 'high', 'due30', 'accepted'][index]}`} onClick={() => onView(figure.id)}><span className="kpi-icon"><Icon name={['file', 'alert', 'calendar', 'users'][index]}/></span><span><span className="label">{figure.label}</span><strong>{figure.count}</strong><small>{figure.detail}</small></span></button>)}</section>
    <div className="overview-grid">
      <section className="matrix-panel" aria-labelledby="cis-risk-matrix-title"><div className="panel-title"><h2 id="cis-risk-matrix-title">Risk matrix</h2><p>Current assessed likelihood × impact</p></div>
        <div className="matrix-grid" role="group" aria-label="Risk matrix: likelihood 5 to 1; impact 1 to 5">{[5, 4, 3, 2, 1].map(likelihood => <Fragment key={likelihood}><span className="matrix-axis" aria-hidden="true">{likelihood}</span>{[1, 2, 3, 4, 5].map(impact => {
          const score = likelihood * impact, members = active.filter(risk => riskCoordinates(risk) === `${likelihood}:${impact}`);
          return <button type="button" key={impact} className={`matrix-cell ${riskLevel(score)}${members.length ? ' occupied' : ''}`} aria-label={`Likelihood ${likelihood}, impact ${impact}, score ${score}, ${riskLevel(score)}: ${members.length} ${members.length === 1 ? 'risk' : 'risks'}`} onClick={event => openList({eyebrow: 'CURRENT ASSESSED RISK', title: `${members.length} ${members.length === 1 ? 'risk' : 'risks'} at score ${score}`, subtitle: `Likelihood ${likelihood} × Impact ${impact} · ${levelLabel(riskLevel(score))}`, coordinates: [likelihood, impact]}, event.currentTarget)}><span className="matrix-score">{score}</span>{members.length > 0 && <span className="matrix-count">{members.length} {members.length === 1 ? 'risk' : 'risks'}</span>}</button>;
        })}</Fragment>)}<span className="matrix-axis" aria-hidden="true"/>{[1, 2, 3, 4, 5].map(impact => <span key={impact} className="matrix-axis" aria-hidden="true">{impact}</span>)}</div>
        <div className="matrix-axis-labels"><span>↑ Likelihood</span><span>Impact →</span></div><div className="matrix-legend">{bands.map(([band, label]) => <span className="matrix-legend-item" key={band}><span className={`matrix-legend-dot ${band}`} aria-hidden="true"/>{label}</span>)}</div>
      </section>
      <section className="quarter-card" aria-labelledby="cis-risk-quarter-title"><div className="quarter-heading"><div><h2 id="cis-risk-quarter-title">Calendar quarter</h2><p>Saved reviews, treatment deadlines and acceptance expiries.</p></div><div className="quarter-controls">
        <button type="button" className="icon-button" aria-label="Previous quarter" onClick={() => setQuarter(selection => shiftQuarter(selection, -1))}><Icon name="left"/></button><strong>Q{quarter.quarter} {quarter.year}</strong><button type="button" className="icon-button" aria-label="Next quarter" onClick={() => setQuarter(selection => shiftQuarter(selection, 1))}><Icon name="right"/></button>
        <select aria-label="Year" value={quarter.year} onChange={event => setQuarter(selection => ({...selection, year: Number(event.target.value)}))}>{Array.from({length: 9}, (_, index) => quarter.year - 4 + index).map(year => <option key={year}>{year}</option>)}</select>
        <div className="segmented quarters" aria-label="Choose quarter">{[1, 2, 3, 4].map(value => <button type="button" key={value} aria-pressed={quarter.quarter === value} onClick={() => setQuarter(selection => ({...selection, quarter: value}))}>Q{value}</button>)}</div><button type="button" className="this-quarter" onClick={() => { setQuarter(currentQuarter(now)); setKind(null); }}>This quarter</button>
      </div></div>
        <div className="quarter-content"><div className="agenda"><div className="segmented agenda-switch">{[['upcoming', 'Upcoming', upcoming.length], ['overdue', 'Overdue', overdue.length]].map(([value, label, count]) => <button type="button" key={value} data-mode={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label} <span>{count}</span></button>)}</div><div className="agenda-caption">Saved events · Q{quarter.quarter} {quarter.year}</div><div className="agenda-list" id="agendaList">{agenda.length ? agenda.slice(0, 3).map(event => <button type="button" key={event.id} className={`agenda-entry${isOverdue(event, now) ? ' overdue' : ''}`} onClick={() => enterEvent(event)}><span className="agenda-title">{event.title}</span><span className="agenda-bottom"><span className="agenda-date">{eventType(event).label} · {riskDate(event.date, {year: false})}</span><DateBadge value={event.date} now={now}/></span></button>) : <div className="agenda-empty"><b>No {mode} events</b>{mode === 'overdue' ? 'No saved events are overdue in this quarter.' : 'Choose another quarter to explore saved dates.'}</div>}</div>
          {agenda.length > 3 && <button type="button" className="text-link agenda-all" onClick={event => openList({eyebrow: `Q${quarter.quarter} ${quarter.year}`, title: mode === 'overdue' ? 'Overdue risk events' : 'Upcoming risk events', subtitle: `${agenda.length} saved events in the selected quarter`, eventSource: 'agenda'}, event.currentTarget)}>View all {agenda.length} {mode} events →</button>}
        </div><div className="timeline-column"><div className="legend" aria-label="Filter timeline event type">{RISK_CONCEPT_TYPES.map(type => <button type="button" key={type.kind} style={{'--cadence': type.color}} aria-pressed={!kind || kind === type.kind} aria-label={kind === type.kind ? 'Show all event types' : `Show ${type.label.toLowerCase()} events`} onClick={() => setKind(value => value === type.kind ? null : type.kind)}><span className="legend-dot" aria-hidden="true"/>{type.label}</button>)}</div>
          <div className="timeline-scroll" onScroll={() => setTip(null)}><div className="timeline-inner"><div className="month-row">{timeline.months.map(day => <span key={day} className="month-name" style={{left: `${(day - timeline.start) / (timeline.end - timeline.start) * 100}%`}}>{new Date(day * 86400000).toLocaleDateString('en-US', {month: 'short', ...(new Date(day * 86400000).getUTCMonth() === 0 ? {year: 'numeric'} : {}), timeZone: 'UTC'})}</span>)}</div>
            <div className="plot" ref={plotRef} aria-label="Quarter saved Risk event timeline" style={{height: timeline.height}}>{timeline.today > timeline.start && <div className="past-area" style={{width: Math.min(width, Math.max(0, timeline.position(Math.min(timeline.end, timeline.today))))}}/>}{timeline.ticks.map(day => <div className="grid-line" key={day} style={{left: timeline.position(day)}}/>)}{timeline.months.slice(1).map(day => <div key={day} className="grid-line month-line" style={{left: timeline.position(day)}}/>)}{[1, 2].map(row => <div className="h-line" key={row} style={{top: `${row / 3 * 100}%`}}/>)}
              {timeline.today >= timeline.start && timeline.today <= timeline.end && <div className="today-line" style={{left: timeline.position(timeline.today)}}><span className="today-label">Today<br/>{riskDate(new Date(timeline.today * 86400000).toISOString(), {year: false})}</span></div>}
              {!timeline.groups.length && <div className="chart-empty"><div><b>No saved {kind ? `${eventType({kind}).label.toLowerCase()} ` : ''}events in Q{quarter.quarter}</b>Choose another quarter{kind ? ' or select the legend again to show all' : ''}.</div></div>}
              {timeline.groups.map(group => <div className="date-group" data-date={group.date} key={group.date} style={{left: group.left, top: 20 + group.lane * 54, width: group.width}}><div className="circle-row">{group.items.map(event => <button type="button" className={`review-dot${isOverdue(event, now) ? ' late' : ''}`} key={event.id} data-event-id={event.id} style={{'--cadence': eventType(event).color}} aria-label={`${eventType(event).label}, ${event.title}, ${riskDate(event.date)}, ${riskUrgency(event.date, now).text}. Open this date’s events.`} aria-describedby={tip?.event.id === event.id ? 'cis-risk-event-tooltip' : undefined} onMouseEnter={entry => setTip({event, anchor: entry.currentTarget})} onMouseLeave={entry => { if (document.activeElement !== entry.currentTarget) setTip(null); }} onFocus={entry => setTip({event, anchor: entry.currentTarget})} onBlur={() => setTip(null)} onClick={entry => openDate(group.date, event.id, entry.currentTarget)}><span className="dot" aria-hidden="true"/></button>)}</div><span className="date-stem" aria-hidden="true"/><button type="button" className={`date-label ${riskUrgency(group.date, now).className}`} aria-label={`${riskDate(group.date)}: ${group.items.length} ${group.items.length === 1 ? 'event' : 'events'}`} onClick={event => openDate(group.date, null, event.currentTarget)}>{riskDate(group.date, {year: false})}</button></div>)}
            </div><div className="date-axis" aria-hidden="true">{timeline.ticks.filter((_, index) => index % 2 === 0 || index === timeline.ticks.length - 1).map(day => <span key={day} className="axis-label" style={{left: timeline.position(day)}}>{riskDate(new Date(day * 86400000).toISOString(), {year: false})}</span>)}</div></div></div>
          <div className="timeline-foot"><span>{kind ? `${eventType({kind}).label} · select the legend again to show all.` : 'One circle per saved event. Hover for details; click to open.'}</span><button type="button" className="text-link" onClick={event => openList({eyebrow: `Q${quarter.quarter} ${quarter.year}`, title: 'Saved risk events', subtitle: `${timeline.events.length} events · ${kind ? eventType({kind}).label : 'all event types'}`, eventSource: 'timeline'}, event.currentTarget)}>View data</button></div>
          {!ready && <p role="status">Loading linked Action deadlines…</p>}{ready && linked.error && <p role="alert">Linked Action deadlines unavailable: {linked.error}</p>}{projection.conflictingActions.length > 0 && <p role="alert">Linked Action dates conflict. Refresh to load current dates.</p>}
        </div></div>
      </section>
    </div>
    <section id="register" className="panel register" aria-labelledby="cis-risk-register-title"><div className="register-heading"><h2 id="cis-risk-register-title">Risk register</h2><div className="register-actions"><div className="segmented" aria-label="Records">{[['active', 'Active', active.length, 'all_active'], ['accepted', 'Accepted', accepted.length, 'accepted'], ['closed', 'Closed', closed.length, 'closed']].map(([tab, label, count, destination]) => <button type="button" key={tab} data-testid={`risk-view-${tab}`} aria-pressed={selectedTab === tab} onClick={() => onView(destination)}>{label} <span>{count}</span></button>)}</div><button type="button" ref={filterButton} className="button filter-button" aria-expanded={showFilters} aria-controls="cis-risk-filters" onClick={() => setShowFilters(value => !value)}><Icon name="filter"/>Filters{filterCount > 0 && <span id="filterBadge">{filterCount}</span>}</button></div></div>
      <div className="register-toolbar"><label className="register-search"><Icon name="search"/><input type="search" aria-label="Search risks" placeholder="Search risks…" value={search} onChange={event => onSearch(event.target.value)} data-testid="risk-search"/></label>{(search || filterCount > 0) && <><span id="matchCount">{filtered.length} matching {filtered.length === 1 ? 'risk' : 'risks'}</span><button type="button" id="clearFilters" className="text-link" onClick={() => onView(!selectedTab || selectedTab === 'active' ? 'all_active' : selectedTab)}>Clear filters</button></>}</div>
      {showFilters && <div className="filter-panel" id="cis-risk-filters" ref={filterRef} aria-label="Risk filters">{filters}</div>}
      <div className="table-scroll"><table className="risk-table"><thead><tr>{['Risk', 'Score', 'Owner', 'Status', 'Next review'].map(label => <th scope="col" key={label}>{label}</th>)}<th scope="col" className="open-col"><span className="sr-only">Open risk</span></th></tr></thead><tbody id="actionRows">{registerRows.length ? registerRows.map((risk, index) => <tr key={risk.risk_id} data-risk-row={risk.risk_id} data-testid={`risk-row-${index}`} onClick={event => { if (!event.target.closest('button,a,input,select,textarea,label')) enterRisk(risk); }}><td><div className="risk-title-cell"><span className="risk-id">{idLabel(risk)}</span><button type="button" className="risk-title" onClick={() => enterRisk(risk)}>{risk.title}</button></div></td><td><Score risk={risk}/></td><td><span className="risk-owner">{owner(risk)}</span></td><td><RiskStatus risk={risk}/></td><td className="next-review-cell"><time dateTime={risk.next_review || undefined}>{risk.next_review ? riskDate(risk.next_review) : 'Not scheduled'}</time><span className={`review-relative${riskUrgency(risk.next_review, now).days < 0 ? ' overdue' : ''}`}>{risk.next_review ? <>{riskUrgency(risk.next_review, now).days < 0 ? <DeadlineClock>{riskUrgency(risk.next_review, now).text}</DeadlineClock> : riskUrgency(risk.next_review, now).text}{' · '}</> : ''}Last {riskReviewDate(risk.last_reviewed, {compact: true, now}) || 'Never reviewed'}</span></td><td className="open-col"><button type="button" className="row-open" aria-label={`Open ${idLabel(risk)}: ${risk.title}`} onClick={() => enterRisk(risk)}><Icon name="right"/></button></td></tr>) : <tr><td className="empty-row" colSpan={6}><strong>{view === 'closed' ? 'No closed risks' : 'No risks match this selection'}</strong><span>{rows.length ? 'Clear filters or choose another register tab.' : 'No risks have been added yet.'}</span></td></tr>}</tbody></table></div><div className="register-footer" data-testid="risk-count">{filtered.length} {selectedTab ? `${selectedTab} ` : ''}{filtered.length === 1 ? 'risk' : 'risks'}{search || filterCount ? ' matching this selection' : ''}</div>
    </section>
    <Dialog open={!!list} onOpenChange={open => { if (!open) setList(null); }}><DialogContent className="cis-risks-concept cr-list-dialog" data-theme={theme} showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); if (mounted.current && !nativeOpen.current && listOpener.current?.isConnected) listOpener.current.focus({preventScroll: true}); }}><div className="dialog-shell"><div className="dialog-heading"><div><div className="eyebrow">{listDetails?.eyebrow}</div><DialogTitle>{listDetails?.title}</DialogTitle><DialogDescription>{listDetails?.subtitle}</DialogDescription></div><button type="button" className="dialog-close" aria-label="Close risk list" onClick={() => setList(null)}><Icon name="close"/></button></div><div className="dialog-content">{listDetails?.eventSource && !ready && <p role="status">Loading linked Action deadlines…</p>}{listDetails?.eventSource && ready && linked.error && <p role="alert">Linked Action deadlines unavailable: {linked.error}</p>}<div className="date-list">{listDetails?.risks?.map(risk => <button type="button" key={risk.risk_id} className="date-review" onClick={() => enterRisk(risk)}><span className="list-title">{risk.title}</span><span className="list-details"><span>{idLabel(risk)}</span><Score risk={risk}/><span>{owner(risk)}</span><RiskStatus risk={risk}/></span><span className="list-bottom"><span>Next review {riskDate(risk.next_review)}</span><span className="open-text">Open risk →</span></span></button>)}{listDetails?.events?.map(event => <button type="button" key={event.id} className={`date-review${event.id === listDetails.highlight ? ' highlight' : ''}`} onClick={() => enterEvent(event)}><span className="list-title">{event.title}</span><span className="list-details"><span className="event-label" style={{'--cadence': eventType(event).color}}>{eventType(event).label}</span><span>{idLabel(event.risk)}</span><span>{eventOwner(event)}</span></span><span className="list-bottom"><span>{riskDate(event.date)} &nbsp; <DateBadge value={event.date} now={now}/></span><span className="open-text">{event.kind === 'action' ? 'Open action item' : 'Open risk'} →</span></span></button>)}{listDetails && (!listDetails.eventSource || ready && !linked.error) && !(listDetails.risks || listDetails.events)?.length && <div className="agenda-empty"><b>{listDetails.risks ? 'No risks in this cell' : 'No saved events in this selection'}</b>{listDetails.risks ? 'There are no active risks at this likelihood and impact.' : 'Choose another quarter or event type.'}</div>}</div></div><div className="dialog-footer"><span>Select a record to open its full native details.</span><button type="button" className="button" onClick={() => setList(null)}>Close</button></div></div></DialogContent></Dialog>
    {tip && createPortal(<div className="cis-risks-concept cr-tooltip-root" data-theme={theme}><div className="tooltip" role="tooltip" id="cis-risk-event-tooltip" ref={tipRef}><div className="tip-type" style={{'--cadence': eventType(tip.event).color}}>{eventType(tip.event).label}</div><h3>{tip.event.title}</h3><div className="tip-due"><span>{riskDate(tip.event.date)}</span><DateBadge value={tip.event.date} now={now}/></div><div className="tip-meta">{idLabel(tip.event.risk)} · {eventOwner(tip.event)}<br/>{tip.event.kind === 'action' ? `Action ${actionStatus(tip.event.record.status)}` : <>{statusLabel(tip.event.risk)} · {riskScoreText(tip.event.risk)}</>}</div><div className="tip-hint">Click to see the events saved for this date.</div></div></div>, document.body)}
  </div>;
}
