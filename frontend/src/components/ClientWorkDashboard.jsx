import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertCircle,CalendarDays,ListChecks,UserRound,ShieldCheck,ArrowRight} from 'lucide-react';
import {Button} from './ui/button';
import StatusBadge from './StatusBadge';
import {OwnerCell} from './RegisterCells';
import {WORK_FILTERS} from '@/lib/dashboardWorkQueue';
import {calendarDay,displayDay} from '@/lib/managementDates';
import {cisSummary} from '@/lib/cisVerification';
import {CIS_ORDER,CIS_TONE,CisStatusBar,cisLabel,statusCounts} from './CisStatus';
import {formatError} from '@/lib/api';
import './BrawndoCisWorkspace.css';
import './ClientWorkDashboard.css';

const icons={pastDue:AlertCircle,due30:CalendarDays,all:ListChecks,unassigned:UserRound};
const priorityLabel={critical:'Critical',high:'High',medium:'Moderate',moderate:'Moderate',low:'Low'};

function WorkTable({items,onOpen,asOf}) {
  const today=calendarDay(asOf);
  return <div className="client-work-table-scroll" role="region" aria-label="Work queue, scroll horizontally for additional columns" tabIndex={0}>
    <table className="client-work-table"><caption className="sr-only">Current actionable work, ordered by lateness and priority. Open an item to work in its authoritative record.</caption>
      <thead><tr>{['Item','Type','Priority','Owner','Due Date','Status','Source'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{items.map(item=>{
        const day=calendarDay(item.due_date),past=day!==null&&day<today;
        return <tr key={item.key} onClick={()=>onOpen(item)}>
          <td><button type="button" className="register-record-link" onClick={e=>{e.stopPropagation();onOpen(item);}}>{item.title}</button></td>
          <td>{item.type}</td>
          <td>{item.severity?<StatusBadge value={item.severity} label={priorityLabel[item.severity]||item.severity}/>:<span className="text-ink-muted">Not set</span>}</td>
          <td><OwnerCell label={item.owner} assigned={!item.unassigned}/></td>
          <td className={past?'text-semantic-critical':''}><time dateTime={item.due_date||undefined}>{displayDay(item.due_date)||'Not scheduled'}</time>{past&&<span className="client-work-due-note">Past due</span>}</td>
          <td><StatusBadge value={item.status}/></td>
          <td className="client-work-source">{item.source_label}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function CisProgramCard({rows,program}) {
  const summary=cisSummary(rows),counts=statusCounts(rows);
  return <article className="client-program-card" aria-label="CIS IG1 assessment progress">
    <h3><Link to="/compliance/cis-ig1">CIS IG1</Link></h3><p className="text-xs text-ink-secondary">{program.name}</p>
    <div className="client-program-metrics">
      <div className="text-semantic-success"><span>Implemented</span><strong>{summary.implemented}%</strong><small>{summary.addressed} of {summary.applicable}</small></div>
      <div className="text-semantic-info"><span>Assessed</span><strong>{summary.coverage}%</strong><small>{summary.assessed} of {summary.applicable}</small></div>
    </div>
    <CisStatusBar counts={counts}/>
    <ul className="client-program-legend">{CIS_ORDER.filter(s=>s!=='not_applicable'||counts[s]).map(s=><li key={s}>
      <span className={`cis-dot cis-tone-${CIS_TONE[s]}`} aria-hidden="true"/><span>{cisLabel(s)}<strong>{counts[s]}</strong></span>
    </li>)}</ul>
    {summary.na>0&&<p className="text-xs text-ink-secondary">{summary.na} N/A excluded from progress denominators.</p>}
    <div className="client-program-footer"><span title="Progress indicators reflect current assessment and implementation state, not an audit or compliance determination.">Assessment progress, not a compliance determination.</span><Link to="/compliance/cis-ig1" className="register-link">Open workspace <ArrowRight size={14} aria-hidden="true"/></Link></div>
  </article>;
}

export default function ClientWorkDashboard({queue,programs,cisRows,filter,onFilter,onOpen,loadDetail}) {
  const [expanded,setExpanded]=useState(false),[page,setPage]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const request=useRef(null),mounted=useRef(true),load=useRef(loadDetail);
  load.current=loadDetail;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  const group=queue.groups[filter],spec=WORK_FILTERS.find(f=>f.key===filter);
  const items=expanded&&page?page.items:group.items;
  async function fetchPage(offset) {
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setLoading(true);setError('');
    try {const result=await load.current(filter,offset,controller.signal);if(!controller.signal.aborted&&mounted.current){setPage(result);setExpanded(true);}}
    catch(e){if(!controller.signal.aborted&&mounted.current)setError(formatError(e));}
    finally{if(!controller.signal.aborted&&mounted.current)setLoading(false);}
  }
  function select(key){request.current?.abort();setLoading(false);setExpanded(false);setPage(null);setError('');onFilter(key);}
  return <div className="section-body client-work-dashboard">
    <div className="client-work-filters" role="group" aria-label="Filter current work">{WORK_FILTERS.map(({key,label})=>{
      const Icon=icons[key];return <button type="button" key={key} className={`client-work-filter filter-${key}`} aria-pressed={filter===key} aria-controls="client-priority-queue" onClick={()=>select(key)}>
        <Icon size={22} aria-hidden="true"/><span>{label}<strong>{queue.groups[key].total}</strong></span><ArrowRight className="client-work-filter-arrow" size={16} aria-hidden="true"/>
      </button>;
    })}</div>
    <section className="client-work-panel" aria-labelledby="client-priority-heading" id="client-priority-queue">
      <header className="client-work-panel-heading"><div><h2 id="client-priority-heading"><ListChecks size={20} aria-hidden="true"/>Highest Priority Items</h2><p>Ranked by lateness and severity. These are your open items to work.</p></div>
        {group.total>9&&!expanded&&<Button variant="outline" size="sm" disabled={loading} onClick={()=>fetchPage(0)}>View all {group.total} items <ArrowRight size={14} aria-hidden="true"/></Button>}
        {expanded&&<Button variant="outline" size="sm" onClick={()=>{request.current?.abort();setLoading(false);setExpanded(false);setPage(null);setError('');}}>Show top 9</Button>}
      </header>
      <div className="client-work-results" role="status" aria-live="polite">{spec.label} · {loading?'Loading…':group.total?`Showing ${expanded&&page?page.offset+1:1}–${(expanded&&page?page.offset:0)+items.length} of ${group.total} items`:'0 items'}</div>
      {error&&<div className="p-3 text-sm text-semantic-critical" role="alert">{error} <button className="register-link" onClick={()=>fetchPage(page?.offset||0)}>Retry</button></div>}
      {items.length?<WorkTable items={items} onOpen={onOpen} asOf={queue.as_of}/>:<p className="client-work-empty">{spec.empty}</p>}
      {expanded&&page&&<nav className="client-work-pagination" aria-label="Work queue pages"><Button variant="outline" size="sm" disabled={loading||page.offset===0} onClick={()=>fetchPage(Math.max(0,page.offset-page.limit))}>Previous page</Button><span>Page {Math.floor(page.offset/page.limit)+1} of {Math.max(1,Math.ceil(page.total/page.limit))}</span><Button variant="outline" size="sm" disabled={loading||!page.has_more} onClick={()=>fetchPage(page.offset+page.limit)}>Next page</Button></nav>}
    </section>
    <section aria-labelledby="client-programs-heading"><header className="client-work-panel-heading"><div><h2 id="client-programs-heading"><ShieldCheck size={20} aria-hidden="true"/>Compliance Programs</h2><p>Track implementation and assessment progress across your frameworks.</p></div></header>
      <div className="client-program-grid">{programs.map(program=>program.key==='cis-ig1'&&cisRows?<CisProgramCard key={program.key} program={program} rows={cisRows}/>:<article key={program.key} className="client-program-card"><h3>{program.label}</h3><p className="text-sm text-ink-secondary">{program.explanation}</p><Link to={program.to} className="register-link">Open workspace</Link></article>)}</div>
      {!programs.length&&<p className="client-work-empty">No frameworks configured. <Link to="/client-profile" className="register-link">Review client configuration</Link></p>}
    </section>
  </div>;
}
