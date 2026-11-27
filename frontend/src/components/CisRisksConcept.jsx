import DeadlineClock from './DeadlineClock';
import V3WorkspaceHeading from '@/components/V3WorkspaceHeading';
import {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import V3QuarterLedger from './V3QuarterLedger';
import api, {formatError} from '@/lib/api';
import {riskCoordinates} from './BrawndoRiskMatrix';
import {riskLevel} from '@/lib/grcWork';
import {riskIsClosed} from '@/lib/riskRegister';
import {pilotRiskStatus} from '@/lib/brawndoRisks';
import {personLabel} from '@/lib/people';
import {riskReviewDate} from '@/lib/brawndoRisksPresentation';
import {quarterlyRiskEvents} from '@/lib/quarterlyProgramTimeline';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {riskDate, riskUrgency, riskConceptFigures, riskTreatmentRelations} from '@/lib/cisRisksConcept';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from './ui/dialog';

const bands = [['low', '1–4 Low'], ['moderate', '5–9 Moderate'], ['high', '10–14 High'], ['critical', '15–25 Critical']];
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


// This component projects the authorized collections; all commands remain in RiskRegister/RecordDrawer.
export default function CisRisksConcept({rows, filtered, users, matches, view, onView, search, onSearch,
  table, filters, onOpenRisk, onOpenEvent, onNewRisk, onRiskScale, onExport, canWrite,
  clientId, clientName, refreshLabel, scope, recordOpen = false, nativeDefaultOrder = false, now = new Date()}) {
  const [theme] = useBrawndoTheme();
  const [showFilters, setShowFilters] = useState(false);
  const [list, setList] = useState(null);
  const [linked, setLinked] = useState({rows: null, scope: null, relations: {}, error: ''});
  const filterRef = useRef(null), filterButton = useRef(null);
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
    const close = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
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
  useEffect(() => { if (recordOpen) { setList(null); setShowFilters(false); } }, [recordOpen]);

  const ready = linked.rows === rows && linked.scope === scope;
  const projection = useMemo(() => quarterlyRiskEvents(rows, ready ? linked.relations : {}), [rows, ready, linked.relations]);
  const figures = riskConceptFigures(rows, matches, now);
  const active = rows.filter(risk => matches(risk, 'all_active', now));
  const accepted = rows.filter(risk => matches(risk, 'accepted', now));
  const closed = rows.filter(riskIsClosed);
  const registerRows = table.state.sort || nativeDefaultOrder ? filtered : [...filtered].sort((a, b) => String(idLabel(a)).localeCompare(String(idLabel(b)), undefined, {numeric: true}) || a.risk_id.localeCompare(b.risk_id));
  const filterCount = Object.values(table.state.filters || {}).filter(values => values.length).length
    + (!['all_active', 'accepted', 'closed'].includes(view) ? 1 : 0);
  const selectedTab = view === 'all' ? null : view === 'closed' ? 'closed' : view === 'accepted' ? 'accepted' : 'active';
  const owner = record => record.owner_id ? personLabel(users, record.owner_id) : 'Unassigned';
  const openList = (selection, opener) => { setShowFilters(false); listOpener.current = opener; setList(selection); };
  const enterRisk = risk => { setList(null); onOpenRisk(risk); };
  const enterEvent = event => { setList(null); onOpenEvent(event.kind === 'action' ? 'tasks' : 'risks', event.record); };
  const listRisks = list?.coordinates ? active.filter(risk => riskCoordinates(risk) === list.coordinates.join(':')) : [];
  const listDetails = list && {...list, risks:listRisks, title:`${listRisks.length} ${listRisks.length === 1 ? 'risk' : 'risks'} at score ${list.coordinates[0] * list.coordinates[1]}`};

  return <div className="cis-risks-concept" data-theme={theme} data-testid="cis-risks-concept">
    <V3WorkspaceHeading clientName={clientName} title="Risks" subtitle={<>Risk register · current assessed likelihood × impact{refreshLabel ? ` · As of ${refreshLabel}` : ''}</>} actionsClass="page-actions"><button type="button" className="button" onClick={onRiskScale} data-testid="risk-matrix-btn"><Icon name="grid"/>Risk scale</button><button type="button" className="button" onClick={onExport} data-testid="risks-export"><Icon name="download"/>Export CSV</button>{canWrite && <button type="button" className="button primary" onClick={onNewRisk} data-testid="new-risk"><Icon name="plus"/>New risk</button>}</V3WorkspaceHeading>
    <V3QuarterLedger key={scope} kind="risks" events={projection.events} now={now} available={ready && !linked.error} recordOpen={recordOpen} describeEvent={event=>personLabel(users, event.record.assignee_id || event.record.owner_id) || undefined} onOpen={enterEvent}/>
    {!ready&&<p role="status">Loading linked Action deadlines…</p>}
    {linked.error&&<p role="alert">Linked Action deadlines unavailable: {linked.error}</p>}
    {projection.conflictingActions.length>0&&<p role="alert">Linked Action dates conflict. Refresh to load current dates.</p>}
    <div className="overview-grid native-risk-overview">
      <section className="panel matrix-panel" aria-labelledby="cis-risk-matrix-title"><div className="panel-head"><div><h2 className="panel-title" id="cis-risk-matrix-title">Risk matrix</h2><p>Current assessed likelihood × impact</p></div></div>
        <div className="matrix-grid" role="group" aria-label="Risk matrix: likelihood 5 to 1; impact 1 to 5">{[5, 4, 3, 2, 1].map(likelihood => <Fragment key={likelihood}><span className="matrix-axis" aria-hidden="true">{likelihood}</span>{[1, 2, 3, 4, 5].map(impact => {
          const score = likelihood * impact, members = active.filter(risk => riskCoordinates(risk) === `${likelihood}:${impact}`);
          return <button type="button" key={impact} className={`matrix-cell ${riskLevel(score)}${members.length ? ' occupied' : ''}`} aria-label={`Likelihood ${likelihood}, impact ${impact}, score ${score}, ${riskLevel(score)}: ${members.length} ${members.length === 1 ? 'risk' : 'risks'}`} onClick={event => openList({eyebrow: 'CURRENT ASSESSED RISK', title: `${members.length} ${members.length === 1 ? 'risk' : 'risks'} at score ${score}`, subtitle: `Likelihood ${likelihood} × Impact ${impact} · ${levelLabel(riskLevel(score))}`, coordinates: [likelihood, impact]}, event.currentTarget)}><span className="matrix-score">{score}</span>{members.length > 0 && <span className="matrix-count">{members.length} {members.length === 1 ? 'risk' : 'risks'}</span>}</button>;
        })}</Fragment>)}<span className="matrix-axis" aria-hidden="true"/>{[1, 2, 3, 4, 5].map(impact => <span key={impact} className="matrix-axis" aria-hidden="true">{impact}</span>)}</div>
        <div className="matrix-axis-labels"><span>↑ Likelihood</span><span>Impact →</span></div><div className="matrix-legend">{bands.map(([band, label]) => <span className="matrix-legend-item" key={band}><span className={`matrix-legend-dot ${band}`} aria-hidden="true"/>{label}</span>)}</div>
      </section>
      <section className="panel native-risk-profile" aria-labelledby="native-risk-profile-title"><div className="panel-head"><div><h2 id="native-risk-profile-title" className="panel-title">Risk profile</h2><p className="panel-desc">How the active register breaks down today.</p></div></div><div className="rp-body">
        <div><h3 className="occ-l">By current score</h3>{[['critical','Critical · 15–25'],['high','High · 10–14'],['moderate','Moderate · 5–9'],['low','Low · 1–4'],['unrated','Needs assessment']].map(([band,label])=>{const count=active.filter(risk=>riskCoordinates(risk)?riskLevel(risk.likelihood_score*risk.impact_score)===band:band==='unrated').length;return <div className={'prof-bar '+band} key={band}><span className="pb-l">{label}</span><span className="pb-t"><span style={{width:(active.length?count/active.length*100:0)+'%'}}/></span><span className="num pb-n">{count}</span></div>;})}</div>
        <div><h3 className="occ-l">By status</h3>{[['treatment','In treatment',active.filter(risk=>['in_progress','treated'].includes(risk.status)).length],['open','Open · decision needed',active.filter(risk=>['identified','assessed','open'].includes(risk.status)).length],['accepted','Accepted',accepted.length]].map(([key,label,count])=><button type="button" className="prof-bar" key={key} onClick={()=>{if(key==='accepted')onView('accepted');else {onView('all_active');table.setFilter('status',key==='treatment'?['In Treatment']:['Open']);}}}><span className="pb-l">{label}</span><span className="pb-t"><span style={{width:(active.length?count/active.length*100:0)+'%'}}/></span><span className="num pb-n">{count}</span></button>)}</div>
        <div className="occ"><div><span className="occ-l">Treatment coverage</span><b className="num">{ready&&!linked.error?active.filter(risk=>risk.status!=='accepted'&&(linked.relations[risk.risk_id]||[]).length).length:'—'} of {active.filter(risk=>risk.status!=='accepted').length}</b><span className="sub">Open or in-treatment risks with a linked action</span></div><div><span className="occ-l">Never reviewed</span><b className="num">{active.filter(risk=>!riskReviewDate(risk.last_reviewed,{now})).length}</b><span className="sub">Active risks without a recorded review</span></div><div><span className="occ-l">Overdue reviews</span><b className="num">{active.filter(risk=>risk.next_review&&riskUrgency(risk.next_review,now).days<0).length}</b><span className="sub">Next review date has passed</span></div></div></div><div className="note">Select a status to filter the register. Unknown scores remain unrated.</div></section>
    </div>
    <section id="register" className="panel register" aria-labelledby="cis-risk-register-title"><div className="panel-head register-heading"><h2 className="panel-title" id="cis-risk-register-title">Risk register</h2><div className="register-actions"><div className="segmented" aria-label="Records">{[['active', 'Active', active.length, 'all_active'], ['accepted', 'Accepted', accepted.length, 'accepted'], ['closed', 'Closed', closed.length, 'closed']].map(([tab, label, count, destination]) => <button type="button" key={tab} data-testid={`risk-view-${tab}`} aria-pressed={selectedTab === tab} onClick={() => onView(destination)}>{label} <span>{count}</span></button>)}</div><button type="button" ref={filterButton} className="button filter-button" aria-expanded={showFilters} aria-controls="cis-risk-filters" onClick={() => setShowFilters(value => !value)}><Icon name="filter"/>Filters{filterCount > 0 && <span id="filterBadge">{filterCount}</span>}</button></div></div>
    <div className="reg-kstrip native-summary" data-native-summary><div className="kstrip" role="group" aria-label="Risk summaries">{figures.map((figure, index) => <button type="button" key={figure.id} className="kchip" onClick={() => onView(figure.id)}><span className="klabel">{figure.label}</span><strong className="kvalue">{figure.count}</strong><small className="kdetail">{figure.detail}</small></button>)}</div></div>
      <div className="register-toolbar"><label className="register-search"><Icon name="search"/><input type="search" aria-label="Search risks" placeholder="Search risks…" value={search} onChange={event => onSearch(event.target.value)} data-testid="risk-search"/></label>{(search || filterCount > 0) && <><span id="matchCount">{filtered.length} matching {filtered.length === 1 ? 'risk' : 'risks'}</span><button type="button" id="clearFilters" className="text-link" onClick={() => onView(!selectedTab || selectedTab === 'active' ? 'all_active' : selectedTab)}>Clear filters</button></>}</div>
      {showFilters && <div className="filter-panel" id="cis-risk-filters" ref={filterRef} aria-label="Risk filters">{filters}</div>}
      <div className="table-scroll"><table className="risk-table"><thead><tr>{['Risk', 'Score', 'Owner', 'Status', 'Next review'].map(label => <th scope="col" key={label}>{label}</th>)}<th scope="col" className="open-col"><span className="sr-only">Open risk</span></th></tr></thead><tbody id="actionRows">{registerRows.length ? registerRows.map((risk, index) => <tr key={risk.risk_id} data-risk-row={risk.risk_id} data-testid={`risk-row-${index}`} onClick={event => { if (!event.target.closest('button,a,input,select,textarea,label')) enterRisk(risk); }}><td><div className="risk-title-cell"><span className="risk-id">{idLabel(risk)}</span><button type="button" className="risk-title" onClick={() => enterRisk(risk)}>{risk.title}</button></div></td><td><Score risk={risk}/></td><td><span className="risk-owner">{owner(risk)}</span></td><td><RiskStatus risk={risk}/></td><td className="next-review-cell"><time dateTime={risk.next_review || undefined}>{risk.next_review ? riskDate(risk.next_review) : 'Not scheduled'}</time><span className={`review-relative${riskUrgency(risk.next_review, now).days < 0 ? ' overdue' : ''}`}>{risk.next_review ? <>{riskUrgency(risk.next_review, now).days < 0 ? <DeadlineClock>{riskUrgency(risk.next_review, now).text}</DeadlineClock> : riskUrgency(risk.next_review, now).text}{' · '}</> : ''}Last {riskReviewDate(risk.last_reviewed, {compact: true, now}) || 'Never reviewed'}</span></td><td className="open-col"><button type="button" className="row-open" aria-label={`Open ${idLabel(risk)}: ${risk.title}`} onClick={() => enterRisk(risk)}><Icon name="right"/></button></td></tr>) : <tr><td className="empty-row" colSpan={6}><strong>{view === 'closed' ? 'No closed risks' : 'No risks match this selection'}</strong><span>{rows.length ? 'Clear filters or choose another register tab.' : 'No risks have been added yet.'}</span></td></tr>}</tbody></table></div><div className="register-footer" data-testid="risk-count">{filtered.length} {selectedTab ? `${selectedTab} ` : ''}{filtered.length === 1 ? 'risk' : 'risks'}{search || filterCount ? ' matching this selection' : ''}</div>
    </section>
    <Dialog open={!!list} onOpenChange={open => { if (!open) setList(null); }}><DialogContent className="cis-risks-concept cr-list-dialog" data-theme={theme} showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); if (mounted.current && !nativeOpen.current && listOpener.current?.isConnected) listOpener.current.focus({preventScroll: true}); }}><div className="dialog-shell"><div className="dialog-heading"><div><div className="eyebrow">{listDetails?.eyebrow}</div><DialogTitle>{listDetails?.title}</DialogTitle><DialogDescription>{listDetails?.subtitle}</DialogDescription></div><button type="button" className="dialog-close" aria-label="Close risk list" onClick={() => setList(null)}><Icon name="close"/></button></div><div className="dialog-content"><div className="date-list">{listDetails?.risks?.map(risk => <button type="button" key={risk.risk_id} className="date-review" onClick={() => enterRisk(risk)}><span className="list-title">{risk.title}</span><span className="list-details"><span>{idLabel(risk)}</span><Score risk={risk}/><span>{owner(risk)}</span><RiskStatus risk={risk}/></span><span className="list-bottom"><span>Next review {riskDate(risk.next_review)}</span><span className="open-text">Open risk →</span></span></button>)}{listDetails && !listRisks.length && <div className="agenda-empty"><b>No risks in this cell</b>There are no active risks at this likelihood and impact.</div>}</div></div><div className="dialog-footer"><span>Select a record to open its full native details.</span><button type="button" className="button" onClick={() => setList(null)}>Close</button></div></div></DialogContent></Dialog>
  </div>;
}
