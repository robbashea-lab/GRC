import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Moon,Sun,ArrowRight,Building2} from 'lucide-react';
import {displayDay} from '@/lib/managementDates';
import {dashboardStatus as statusLabel} from '@/lib/dashboardItemSummary';
import FrameworkProgramCard,{shortName} from './FrameworkProgramCard';
import {ViewTabs} from './Register';
import {formatError} from '@/lib/api';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import './BrawndoDashboard.css';

// Brawndo reference dashboard. Color carries one meaning throughout, in both themes:
// green = good (implemented), amber = attention (partial, due soon), red = critical
// (not implemented, overdue, high severity), grey = not assessed. Text always carries it too.
const FILTERS=[['all','All'],['pastDue','Overdue'],['due30','Due in 30 days'],['unassigned','Unassigned']];
const STATUS_TONE={overdue:'critical',in_progress:'info',remediated:'attention',pending_validation:'attention',upcoming:'neutral',open:'neutral'};

function WorkTable({items,onOpen,asOf}) {
  return <div className="bd-table-scroll" role="region" aria-label="Work queue" tabIndex={0}>
    <table className="bd-table"><caption className="sr-only">Current actionable work, ordered by lateness and priority. Open an item to work in its authoritative record.</caption>
      <thead><tr><th scope="col">Due</th><th scope="col">Item</th><th scope="col">Owner</th><th scope="col">Status</th></tr></thead>
      <tbody>{items.map(item=>{
        return <tr key={item.key} onClick={event=>onOpen(item,event.currentTarget.querySelector('button'))}>
          <td><time className="bd-date" dateTime={item.due_date||undefined}>{displayDay(item.due_date)||'Not scheduled'}</time></td>
          <td><button type="button" className="bd-item" onClick={e=>{e.stopPropagation();onOpen(item,e.currentTarget);}}>{item.title}</button></td>
          <td className={item.unassigned?'is-attention bd-strong':''}>{item.unassigned?'Unassigned':item.owner}</td>
          <td><span className={`bd-status is-${STATUS_TONE[item.status]||'neutral'}`}>{statusLabel(item.status)}</span></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export default function ClientWorkDashboard({queue,programs,programRows,cisRows,clientName='Client',filter,onFilter,onOpen,loadDetail}) {
  const rowsFor=programRows||(cisRows?{'cis-ig1':cisRows}:{});
  const [expanded,setExpanded]=useState(false),[page,setPage]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [framework,setFramework]=useState(''),[search,setSearch]=useState('');
  const selectionKey=JSON.stringify([filter,framework,search]);
  const [theme,setTheme]=useBrawndoTheme();useBrawndoPortalTheme(true,theme);
  const request=useRef(null),retry=useRef(null),mounted=useRef(true),load=useRef(loadDetail);
  load.current=loadDetail;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  const group=queue.groups[filter],current=page?.key===selectionKey?page:null;
  const items=current?current.items:framework||search?[]:group.items;
  const total=current?.total??(framework||search?0:group.total);
  const counts=current?.counts||(framework||search?{}:Object.fromEntries(Object.entries(queue.groups).map(([key,g])=>[key,g.total])));
  const carded=programs.filter(p=>rowsFor[p.key]),primary=carded.length===1?carded[0]:null;
  const fetchPage=useCallback(async(offset,key=filter,full=false)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    retry.current={offset,key,full};
    setLoading(true);setError('');
    try {const result=await load.current(key,offset,controller.signal,{framework:framework||undefined,search,limit:full?25:9});if(!controller.signal.aborted&&mounted.current){setPage({...result,key:JSON.stringify([key,framework,search])});setExpanded(full);}}
    catch(e){if(!controller.signal.aborted&&mounted.current)setError(formatError(e));}
    finally{if(!controller.signal.aborted&&mounted.current)setLoading(false);}
  },[filter,framework,search]);
  const previousFilter=useRef(selectionKey);
  useEffect(()=>{if(previousFilter.current!==selectionKey){previousFilter.current=selectionKey;setPage(null);setExpanded(false);fetchPage(0);}},[selectionKey,fetchPage]);
  function select(key){onFilter(key);if(key===filter)fetchPage(0,key);}
  const toggleTheme=()=>setTheme(theme==='dark'?'light':'dark');
  return <div className="bdash" data-theme={theme}>
    <header className="bd-header">
      <div className="bd-heading-group"><span className="bd-client-mark"><Building2 size={22} aria-hidden="true"/></span><div><p className="bd-eyebrow">{primary?`${shortName(primary)} program`:'GRC program'}</p><h1>{clientName} Dashboard</h1></div></div>
      <div className="bd-header-side">{queue.as_of&&<span className="bd-muted bd-small">As of {displayDay(queue.as_of)}</span>}
        <button type="button" className="bd-theme" onClick={toggleTheme} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button></div>
    </header>
    <div className="bd-grid">
      <aside className="bd-aside" aria-label="Program condition">
        {carded.map(p=><FrameworkProgramCard key={p.key} program={p} rows={rowsFor[p.key]}/>)}
        {programs.filter(p=>!rowsFor[p.key]).map(p=><section key={p.key} className="bd-card"><h2>{p.label}</h2><p className="bd-muted bd-small">{p.explanation}</p><Link to={p.to}>Open workspace</Link></section>)}
        {!programs.length&&<section className="bd-card"><p className="bd-empty">No frameworks configured. <Link to="/client-profile">Review client configuration</Link></p></section>}
      </aside>
      <section className="bd-card bd-queue" aria-labelledby="client-priority-heading" id="client-priority-queue">
        <div className="bd-card-head"><div><h2 id="client-priority-heading">Priority overview</h2></div>
          {total>9&&!expanded&&<button type="button" className="bd-button" disabled={loading} onClick={()=>fetchPage(0,filter,true)}>View all {total} items <ArrowRight size={14} aria-hidden="true"/></button>}
          {expanded&&<button type="button" className="bd-button" onClick={()=>fetchPage(0)}>Show top 9</button>}</div>
        <div className="bd-filter-bar"><ViewTabs views={FILTERS.map(([id,label])=>({id,label}))} active={filter} onPick={select} counts={counts} label="Priority overview filters" testid="priority-filters"/>
          <label className="bd-framework-filter">Framework <select aria-label="Framework" value={framework} onChange={e=>setFramework(e.target.value)}><option value="">All frameworks</option>{programs.map(p=><option key={p.key} value={p.key}>{shortName(p)}</option>)}</select></label>
          <label className="sr-only" htmlFor="priority-search">Search priority work</label><input id="priority-search" className="bd-search" type="search" placeholder="Search priority work…" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/>
          {(filter!=='all'||framework||search)&&<button type="button" className="bd-button" onClick={()=>{setFramework('');setSearch('');onFilter('all');}}>Reset filters</button>}
        </div>
        <div className="bd-results sr-only" role="status" aria-live="polite">{loading?'Loading…':`${total} matching items`}</div>
        {error&&<div className="bd-error" role="alert">{error} <button type="button" className="bd-link" onClick={()=>fetchPage(retry.current.offset,retry.current.key,retry.current.full)}>Retry</button></div>}
        {items.length?<WorkTable items={items} onOpen={onOpen} asOf={queue.as_of}/>:<p className="bd-empty">{loading?'Loading priority work…':error?'Priority work could not be loaded.':'No items match these filters.'}</p>}
        {expanded&&current&&<nav className="bd-pagination" aria-label="Work queue pages"><button type="button" className="bd-button" disabled={loading||current.offset===0} onClick={()=>fetchPage(Math.max(0,current.offset-current.limit),filter,true)}>Previous page</button><span>Page {Math.floor(current.offset/current.limit)+1} of {Math.max(1,Math.ceil(current.total/current.limit))}</span><button type="button" className="bd-button" disabled={loading||!current.has_more} onClick={()=>fetchPage(current.offset+current.limit,filter,true)}>Next page</button></nav>}
      </section>

    </div>
  </div>;
}
