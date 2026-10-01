import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Moon,Sun,ArrowRight} from 'lucide-react';
import {WORK_FILTERS} from '@/lib/dashboardWorkQueue';
import {calendarDay,displayDay} from '@/lib/managementDates';
import FrameworkProgramCard,{shortName} from './FrameworkProgramCard';
import {formatError} from '@/lib/api';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import './BrawndoDashboard.css';

// Brawndo reference dashboard. Color carries one meaning throughout, in both themes:
// green = good (implemented), amber = attention (partial, due soon), red = critical
// (not implemented, overdue, high severity), grey = not assessed. Text always carries it too.
const TILE={pastDue:'critical',due30:'attention',all:'info',unassigned:'neutral'};
const priorityLabel={critical:'Critical',high:'High',medium:'Moderate',moderate:'Moderate',low:'Low'};
const statusLabel=s=>s==='remediated'?'Pending Validation':s?String(s).replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()):'—';
const STATUS_TONE={overdue:'critical',in_progress:'info',remediated:'attention',pending_validation:'attention',upcoming:'neutral',open:'neutral'};
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

function tileContext(key,group,today){
  const items=group.items,complete=items.length===group.total;
  if(!group.total)return key==='unassigned'?'Every item has an owner':'None open';
  if(key==='pastDue'){
    const days=items.map(i=>calendarDay(i.due_date)).filter(d=>d!==null&&today!==null).map(d=>today-d),late=days.length?Math.max(...days):0;
    const kinds=complete&&items.every(i=>i.type)?Object.entries(items.reduce((m,i)=>({...m,[i.type]:(m[i.type]||0)+1}),{})).map(([t,n])=>plural(n,t.toLowerCase())).join(' · '):null;
    return [kinds,late>0?`Oldest ${late}d late`:null].filter(Boolean).join(' · ');
  }
  if(key==='due30'){const next=items[0];return next?[`Next: ${next.title}`,displayDay(next.due_date)].filter(Boolean).join(' · '):'';}
  if(key==='unassigned')return items[0]?.title||'';
  const high=items.filter(i=>['critical','high'].includes(i.severity)).length;
  return complete&&high?`${high} high or critical`:'Reviews, findings and actions';
}

function WorkTable({items,onOpen,asOf}) {
  const today=calendarDay(asOf);
  return <div className="bd-table-scroll" role="region" aria-label="Work queue" tabIndex={0}>
    <table className="bd-table"><caption className="sr-only">Current actionable work, ordered by lateness and priority. Open an item to work in its authoritative record.</caption>
      <thead><tr><th scope="col">Due</th><th scope="col">Item</th><th scope="col">Owner</th><th scope="col">Status</th></tr></thead>
      <tbody>{items.map(item=>{
        const day=calendarDay(item.due_date),late=day!==null&&day<today?today-day:0,soon=day!==null&&!late?day-today:null;
        const meta=[item.type,item.severity&&priorityLabel[item.severity]?.toLowerCase(),item.source_label].filter(Boolean).join(' · ');
        return <tr key={item.key} onClick={()=>onOpen(item)}>
          <td className={late?'is-critical':''}><time className="bd-date" dateTime={item.due_date||undefined}>{displayDay(item.due_date)||'Not scheduled'}</time>
            {late?<span className="bd-due-note">{late}d late</span>:soon!==null&&<span className="bd-due-note is-muted">in {soon}d</span>}</td>
          <td><button type="button" className="bd-item" onClick={e=>{e.stopPropagation();onOpen(item);}}>{item.title}</button><span className="bd-meta">{meta}</span></td>
          <td className={item.unassigned?'is-attention bd-strong':''}>{item.unassigned?'Unassigned':item.owner}</td>
          <td><span className={`bd-status is-${late?'critical':STATUS_TONE[item.status]||'neutral'}`}>{late?'Overdue':statusLabel(item.status)}</span></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function PostureCard({posture}) {
  const t=posture?.totals||{},vendor=key=>(posture?.vendorHealth||[]).find(g=>g.key===key);
  const count=g=>g?.total??g?.items?.length??0;
  const cells=[['Significant risks',t.significantRisks??posture?.significantRisks?.length??0,'/risks?view=significant','critical'],
    ['High / critical findings',t.materialFindings??posture?.materialFindings?.length??0,'/findings?signal=material','critical'],
    ['Assurance needs attention',count(vendor('assurance')),'/vendors?view=assurance_attention','attention'],
    ['Vendor reviews past due',count(vendor('vendorReviewsPast')),'/vendors?view=review_overdue','critical']];
  return <section className="bd-card" aria-labelledby="bd-posture-heading"><h2 id="bd-posture-heading">Posture</h2>
    <div className="bd-posture">{cells.map(([label,n,to,tone])=><Link key={label} to={to}><span className="bd-muted bd-small">{label}</span><strong className={n?`is-${tone}`:''}>{n}</strong></Link>)}</div>
  </section>;
}

export default function ClientWorkDashboard({queue,programs,programRows,cisRows,posture,clientName='Client',filter,onFilter,onOpen,loadDetail}) {
  const rowsFor=programRows||(cisRows?{'cis-ig1':cisRows}:{});
  const [expanded,setExpanded]=useState(false),[page,setPage]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [theme,setTheme]=useBrawndoTheme();useBrawndoPortalTheme(true,theme);
  const request=useRef(null),mounted=useRef(true),load=useRef(loadDetail);
  load.current=loadDetail;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  const group=queue.groups[filter],spec=WORK_FILTERS.find(f=>f.key===filter),today=calendarDay(queue.as_of);
  const items=expanded&&page?page.items:group.items;
  const carded=programs.filter(p=>rowsFor[p.key]),primary=carded[0];
  async function fetchPage(offset) {
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setLoading(true);setError('');
    try {const result=await load.current(filter,offset,controller.signal);if(!controller.signal.aborted&&mounted.current){setPage(result);setExpanded(true);}}
    catch(e){if(!controller.signal.aborted&&mounted.current)setError(formatError(e));}
    finally{if(!controller.signal.aborted&&mounted.current)setLoading(false);}
  }
  function select(key){request.current?.abort();setLoading(false);setExpanded(false);setPage(null);setError('');onFilter(key);}
  const toggleTheme=()=>setTheme(theme==='dark'?'light':'dark');
  return <div className="bdash" data-theme={theme}>
    <header className="bd-header">
      <div><p className="bd-eyebrow">{primary?`${shortName(primary)} program`:'GRC program'}</p><h1>{clientName} Dashboard</h1></div>
      <div className="bd-header-side">{queue.as_of&&<span className="bd-muted bd-small">As of {displayDay(queue.as_of)}</span>}
        <button type="button" className="bd-theme" onClick={toggleTheme} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button></div>
    </header>
    <div className="bd-tiles" role="group" aria-label="Filter current work">{WORK_FILTERS.map(({key,label})=>{const g=queue.groups[key];
      return <button type="button" key={key} className={`bd-tile is-${g.total?TILE[key]:'clear'}`} aria-pressed={filter===key} aria-controls="client-priority-queue" onClick={()=>select(key)}>
        <span className="bd-tile-label">{label}</span><span className="bd-tile-value">{g.total}</span><span className="bd-tile-context">{tileContext(key,g,today)}</span>
      </button>;})}</div>
    <p className="bd-muted bd-small bd-count-note" data-testid="bd-work-note">Work items: each Review, Action Item and obligation counts once. A Finding counts as its active Action Item; with no active Action (including Pending Validation) it counts itself.</p>
    <div className="bd-grid">
      <section className="bd-card bd-queue" aria-labelledby="client-priority-heading" id="client-priority-queue">
        <div className="bd-card-head"><div><h2 id="client-priority-heading">Work next</h2><p className="bd-muted bd-small">Ranked by lateness, then severity. Open an item to work it.</p></div>
          {group.total>9&&!expanded&&<button type="button" className="bd-button" disabled={loading} onClick={()=>fetchPage(0)}>View all {group.total} items <ArrowRight size={14} aria-hidden="true"/></button>}
          {expanded&&<button type="button" className="bd-button" onClick={()=>{request.current?.abort();setLoading(false);setExpanded(false);setPage(null);setError('');}}>Show top 9</button>}</div>
        <div className="bd-results" role="status" aria-live="polite">{spec.label} · {loading?'Loading…':group.total?`Showing ${expanded&&page?page.offset+1:1}–${(expanded&&page?page.offset:0)+items.length} of ${group.total} items`:'0 items'}</div>
        {error&&<div className="bd-error" role="alert">{error} <button type="button" className="bd-link" onClick={()=>fetchPage(page?.offset||0)}>Retry</button></div>}
        {items.length?<WorkTable items={items} onOpen={onOpen} asOf={queue.as_of}/>:<p className="bd-empty">{spec.empty}</p>}
        {expanded&&page&&<nav className="bd-pagination" aria-label="Work queue pages"><button type="button" className="bd-button" disabled={loading||page.offset===0} onClick={()=>fetchPage(Math.max(0,page.offset-page.limit))}>Previous page</button><span>Page {Math.floor(page.offset/page.limit)+1} of {Math.max(1,Math.ceil(page.total/page.limit))}</span><button type="button" className="bd-button" disabled={loading||!page.has_more} onClick={()=>fetchPage(page.offset+page.limit)}>Next page</button></nav>}
      </section>
      <aside className="bd-aside" aria-label="Program condition">
        {carded.map(p=><FrameworkProgramCard key={p.key} program={p} rows={rowsFor[p.key]}/>)}
        {programs.filter(p=>!rowsFor[p.key]).map(p=><section key={p.key} className="bd-card"><h2>{p.label}</h2><p className="bd-muted bd-small">{p.explanation}</p><Link to={p.to}>Open workspace</Link></section>)}
        {!programs.length&&<section className="bd-card"><p className="bd-empty">No frameworks configured. <Link to="/client-profile">Review client configuration</Link></p></section>}
        {posture&&<PostureCard posture={posture}/>}
      </aside>
    </div>
  </div>;
}
