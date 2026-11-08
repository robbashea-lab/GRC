import {useEffect,useMemo,useRef,useState} from 'react';
import {Clock3,Search} from 'lucide-react';
import SurfaceThemeAction from './SurfaceThemeAction';
import {calendarDay} from '@/lib/managementDates';
import {dashboardStatus} from '@/lib/dashboardItemSummary';
import {grcLead} from '@/lib/clientRelationships';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import {formatError} from '@/lib/api';
import {DEMO_WORK_FILTERS,DEMO_WORK_PAGE_SIZE,loadCompleteDemoWork,selectDemoWork,demoWorkSummary} from '@/lib/brawndoDemoWork';
import './BrawndoDemoDashboard.css';
import './CisDashboardConcept.css';
import {Tabs,TabsList,TabsTrigger} from './ui/tabs';

// Calendar deadlines retain their literal UTC day; dated snapshots never invent a save instant.
function dashboardDay(value,year=true){
  const day=calendarDay(value);
  return day===null?null:new Date(day*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',...(year?{year:'numeric'}:{}),timeZone:'UTC'});
}
function dashboardAsOf(value){
  if(typeof value!=='string'||!value)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return dashboardDay(value);
  const date=new Date(value);
  return /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)&&!Number.isNaN(date.getTime())?date.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC',timeZoneName:'short'}):null;
}

// Pending/error frames keep the approved presentation without displaying old records.
export function CisDashboardPending({client,children}){
  const [theme,setTheme]=useBrawndoTheme();useBrawndoPortalTheme(true,theme);
  return <div className="brawndo-demo-dashboard" data-theme={theme} data-cis-dashboard-concept="true"><div className="cis-dashboard-concept-presentation"><header className="bdd-heading"><div><h1>{client?.name||'Client'} Dashboard</h1></div><SurfaceThemeAction theme={theme} onTheme={()=>setTheme(theme==='dark'?'light':'dark')}/></header><div className="cis-dashboard-concept-pending">{children}</div></div></div>;
}

export default function BrawndoDemoDashboard({queue,programs=[],client,members=[],filter='all',onFilter,onOpen,loadDetail,refreshVersion=0,concept=false,children,programOptions=[],selectedProgram,onProgramSelect}){
  const [theme,setTheme]=useBrawndoTheme();useBrawndoPortalTheme(true,theme);
  const [work,setWork]=useState(null),[frameworkWork,setFrameworkWork]=useState(null),[error,setError]=useState(''),[frameworkError,setFrameworkError]=useState('');
  const [framework,setFramework]=useState(''),[search,setSearch]=useState(''),[sort,setSort]=useState('due'),[page,setPage]=useState(0),[retry,setRetry]=useState(0);
  const loader=useRef(loadDetail);loader.current=loadDetail;
  const heading=useRef(null);
  useEffect(()=>{const controller=new AbortController();setWork(null);setError('');loadCompleteDemoWork((...args)=>loader.current(...args),controller.signal).then(items=>{if(items.length!==queue.groups.all.total)throw new Error('Work changed while loading. Refresh the dashboard.');if(!controller.signal.aborted)setWork(items);}).catch(e=>{if(!controller.signal.aborted)setError(formatError(e));});return()=>controller.abort();},[refreshVersion,retry,client?.client_id,queue.groups.all.total]);
  useEffect(()=>{setFrameworkWork(null);setFrameworkError('');if(!framework||framework==='__program_wide')return;const controller=new AbortController();loadCompleteDemoWork((...args)=>loader.current(...args),controller.signal,{framework}).then(items=>{if(!controller.signal.aborted)setFrameworkWork({framework,keys:new Set(items.map(item=>item.key))});}).catch(e=>{if(!controller.signal.aborted)setFrameworkError(formatError(e));});return()=>controller.abort();},[framework,refreshVersion,retry,client?.client_id]);
  useEffect(()=>setPage(0),[filter,framework,search,sort]);
  const loading=work===null&&!error||!!framework&&framework!=='__program_wide'&&!frameworkWork&&!frameworkError;
  const rows=useMemo(()=>selectDemoWork(work||[],{filter,asOf:queue.as_of,search,sort,frameworkKeys:framework==='__program_wide'?new Set((work||[]).filter(item=>item.framework_membership_known===true&&Array.isArray(item.framework_keys)&&item.framework_keys.length===0).map(item=>item.key)):framework?(frameworkWork?.framework===framework?frameworkWork.keys:new Set()):null}),[work,filter,queue.as_of,search,sort,framework,frameworkWork]);
  const lastPage=Math.max(0,Math.ceil(rows.length/DEMO_WORK_PAGE_SIZE)-1),currentPage=Math.min(page,lastPage),start=currentPage*DEMO_WORK_PAGE_SIZE;
  useEffect(()=>{if(page>lastPage)setPage(lastPage);},[page,lastPage]);
  const summary=work?demoWorkSummary(work,queue.as_of,value=>dashboardDay(value,false)):null;
  const leadClient=client?.grc_lead?client:{...client,grc_lead:members.find(member=>member.user_id===client?.assigned_owner_id)};
  function choose(key,scroll=false){onFilter(scroll&&filter===key?'all':key);setPage(0);if(scroll){heading.current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});heading.current?.focus({preventScroll:true});}}
  const presentation = <>
    <header className="bdd-heading"><div><h1>{client?.name||'Client'} Dashboard</h1><p>{selectedProgram?.program_label||programs.find(program=>/^cis-ig[123]$/.test(program.key))?.label||(programs.length?programs.map(program=>program.label||program.name||program.key).join(' / '):'GRC')} program · GRC Lead {grcLead(leadClient).name} · As of {dashboardAsOf(queue.as_of)||'unavailable'}</p></div><SurfaceThemeAction theme={theme} onTheme={()=>setTheme(theme==='dark'?'light':'dark')}/></header>
    <section className="bdd-summary" aria-label="Work summary">{DEMO_WORK_FILTERS.map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>choose(key,true)}><span>{label}</span><strong className={key==='pastDue'&&queue.groups[key]?.total?'bdd-late':''}>{queue.groups[key]?.total??'—'}</strong><small className={key==='pastDue'&&queue.groups[key]?.total?'bdd-late':undefined}>{summary?.[key]||(error?'Context unavailable':'Loading context…')}</small></button>)}</section>
    {programOptions.length>1&&<Tabs value={selectedProgram?.framework_key||''} onValueChange={onProgramSelect}><TabsList aria-label="Client frameworks" className="ph-tabs">{programOptions.map(program=><TabsTrigger key={program.program_id} value={program.framework_key} className="ph-tab"><span>{program.program_label}</span></TabsTrigger>)}</TabsList></Tabs>}
    {children}
  </>;
  return <div className="brawndo-demo-dashboard" data-theme={theme} data-cis-dashboard-concept={concept?'true':undefined}>
    {concept?<div className="cis-dashboard-concept-presentation">{presentation}</div>:presentation}
    <section className="bdd-card" aria-labelledby="bdd-work-heading"><header><h2 id="bdd-work-heading" tabIndex={-1} ref={heading}>Priority work</h2><p>Work that needs a decision, an owner, or a next step.</p></header>
      <div className="bdd-controls"><label className="bdd-search"><span className="sr-only">Search item, owner, type or {programs.some(program=>['iso-27001','soc-2'].includes(program.key))||!programs.some(program=>program.key==='cis-ig1')?'framework subject':'safeguard'}</span><Search aria-hidden="true" size={15}/><input type="search" placeholder="Search work…" maxLength={200} value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <div className="bdd-filters" role="group" aria-label="Show work">{DEMO_WORK_FILTERS.map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>choose(key)}>{key==='all'?'All':label} <span>{queue.groups[key]?.total??0}</span></button>)}</div>
        <label>Framework<select value={framework} onChange={event=>setFramework(event.target.value)}><option value="">All frameworks</option>{work?.length>0&&work.every(item=>item.framework_membership_known===true&&Array.isArray(item.framework_keys)&&item.framework_keys.every(key=>typeof key==='string'))&&<option value="__program_wide">Program-wide</option>}{programs.map(program=><option key={program.key} value={program.key}>{program.label||program.name||program.key}</option>)}</select></label>
        <label>Sort by<select value={sort} onChange={event=>setSort(event.target.value)}><option value="due">Due date, soonest first</option><option value="due-desc">Due date, latest first</option><option value="title">Item A–Z</option><option value="owner">Owner A–Z</option><option value="status">Status</option></select></label>
        {(search||framework||filter!=='all')&&<button type="button" onClick={()=>{setSearch('');setFramework('');onFilter('all');}}>Clear filters</button>}
      </div>
      {(error||frameworkError)&&<p role="alert" className="bdd-error">{error||frameworkError} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry loading work</button></p>}
      <div className="bdd-results"><span role="status" aria-live="polite">{loading?'Loading complete work queue…':error||frameworkError?'Work results unavailable':`${rows.length} item${rows.length===1?'':'s'}`}</span><nav aria-label="Priority work pages"><span>{!loading&&!error&&!frameworkError&&rows.length?`${start+1}–${Math.min(start+DEMO_WORK_PAGE_SIZE,rows.length)} of ${rows.length}`:''}</span><button type="button" disabled={loading||!!error||!!frameworkError||currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><button type="button" disabled={loading||!!error||!!frameworkError||currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Next</button></nav></div>
      {!loading&&!error&&!frameworkError&&<div className="bdd-table-scroll" role="region" aria-label="Priority work table" tabIndex={0}>
        <table><caption className="sr-only">Priority work</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open item</span></th></tr></thead>
          <tbody>{rows.slice(start,start+DEMO_WORK_PAGE_SIZE).map(item=>{
            const day=calendarDay(item.due_date),today=calendarDay(queue.as_of),delta=day!==null&&today!==null?day-today:null;
            // Labels and membership come from the complete native queue, never from the client name.
            const associations=[...new Set(item.safeguard_labels?.length?item.safeguard_labels:item.safeguard_label?[item.safeguard_label]:item.framework_keys?.length?item.framework_keys.map(key=>programs.find(program=>program.key===key)?.label||key):item.framework_membership_known?['Program-wide']:[])];
            const initials=item.unassigned?'?':(item.owner||'').trim().split(/\s+/).filter(Boolean).map(word=>word[0]).join('').slice(0,2).toUpperCase();
            return <tr key={item.key} className={delta!==null&&delta<0?'bdd-overdue-row':undefined} onClick={event=>onOpen(item,event.currentTarget.querySelector('button'))}>
              <td className="bdd-cell-item"><button type="button" className="bdd-item" onClick={event=>{event.stopPropagation();onOpen(item,event.currentTarget);}}>{item.title}</button><small className="bdd-meta"><span>{item.type}</span>{associations.map(label=><span className="bdd-framework-chip" key={label} title={label}>{label.replace(/^CIS Controls v8\.1 (\d+\.\d+)$/,'CIS $1')}</span>)}</small></td>
              <td className="bdd-cell-owner"><span className={`bdd-owner${item.unassigned?' bdd-attention':''}`}><i className="bdd-avatar" aria-hidden="true">{initials}</i><span>{item.unassigned?'Unassigned':item.owner}</span></span></td>
              <td className="bdd-cell-due"><time dateTime={day===null?undefined:item.due_date}>{dashboardDay(item.due_date)||'Not scheduled'}</time><small className={delta===null?'':delta<0?'bdd-late':delta===0?'bdd-today':''}>{delta!==null&&delta<=0&&<Clock3 aria-hidden="true" size={13}/>}<span>{delta===null?'No known due date':delta<0?`${-delta} day${delta===-1?'':'s'} overdue`:delta===0?'Due today':`In ${delta} day${delta===1?'':'s'}`}</span></small></td>
              <td className="bdd-cell-status"><span className={`bdd-status bdd-status-${item.status}`}><i aria-hidden="true"/>{dashboardStatus(item.status)}</span></td>
              <td className="bdd-chevron" aria-hidden="true">›</td>
            </tr>;
          })}</tbody>
        </table>{!rows.length&&<div className="bdd-empty"><h3>{!work?.length?'No open work items.':'No work matches these filters'}</h3>{!!work?.length&&<><p>Try a different search, filter or framework.</p><button type="button" className="bdd-clear" onClick={()=>{setSearch('');setFramework('');onFilter('all');}}>Clear filters</button></>}</div>}
      </div>}

    </section>
  </div>;
}
