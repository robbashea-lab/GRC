import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Menu,Moon,Sun,Search,ChevronDown} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useCompliance} from '@/context/ComplianceContext';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {dashboardRecordHref} from '@/lib/dashboardItemSummary';
import {ProfileMenu} from './BrawndoSidebar';
import NotificationBell from './NotificationBell';
import './BrawndoWorkspace.css';

const PAGES=[['Dashboard','/dashboard'],['Calendar','/calendar'],['Reviews','/reviews'],['Action Items','/action-items'],['Risks','/risks'],['Policies','/policies'],['Vendors','/vendors'],['Evidence Library','/evidence'],['Contacts','/contacts'],['Systems & Scope','/systems'],['AI Governance','/ai-governance'],['Client Profile','/client-profile']];

function WorkspaceSearch({clientId}){
  const [query,setQuery]=useState(''),[result,setResult]=useState(null),[open,setOpen]=useState(false);
  const input=useRef(null),{items:frameworks}=useCompliance();
  const pages=[...PAGES,...frameworks.map(f=>[f.label,f.to])].filter(([label])=>label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{
    const shortcut=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('[role="dialog"][data-state="open"]')){e.preventDefault();input.current?.focus();}};
    window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);
  },[]);
  useEffect(()=>{
    setResult(null);if(!query.trim())return;
    const controller=new AbortController();
    const timer=setTimeout(()=>api.get('/dashboard',{params:{client_id:clientId,scope:'org',work_queue:true,detail:'all',offset:0,limit:8,search:query.trim()},signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted){if(data.client_id!==clientId)throw new Error('Search results could not be verified.');setResult({items:data.items||[]});}})
      .catch(e=>{if(!controller.signal.aborted)setResult({error:formatError(e)});}),250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[clientId,query]);
  function close(){setOpen(false);}
  return <div className="bwp-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))close();}}>
    <Search size={18} aria-hidden="true"/><input ref={input} type="search" maxLength={200} value={query} onChange={e=>{setQuery(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onKeyDown={e=>{if(e.key==='Escape'){close();input.current?.blur();}}} aria-label="Search workspace pages and active work" aria-expanded={open} aria-controls="bwp-search-results" placeholder="Search pages and active work…"/><kbd aria-hidden="true">Ctrl K</kbd>
    {open&&<div id="bwp-search-results" className="bwp-search-results">
      <p>Workspace pages</p>{pages.map(([label,to])=><Link key={to} to={to} onClick={close}>{label}</Link>)}
      {!!query.trim()&&<><p>Active work in this client</p>{!result?<span role="status">Searching…</span>:result.error?<span role="alert">{result.error}</span>:result.items.length?result.items.map(item=>{
        const idKey={tasks:'task_id',findings:'finding_id',reviews:'review_id',risks:'risk_id',policies:'policy_id',vendors:'vendor_id',exceptions:'exception_id',requirements:'requirement_id'}[item.kind];
        const href=idKey&&dashboardRecordHref(item.kind,{[idKey]:item.id,client_id:clientId});
        return href?<Link key={item.key} to={href} onClick={close}>{item.title}<small>{item.type}</small></Link>:null;
      }):<span>No matching active work.</span>}</>}
    </div>}
  </div>;
}

export default function BrawndoWorkspace({children}){
  const {currentClientId,currentClient}=useOrg(),[theme,setTheme]=useBrawndoTheme(),[navigation,setNavigation]=useState(false),navigate=useNavigate();
  useEffect(()=>{
    const root=document.documentElement;root.dataset.brawndoWorkspace=theme;
    return()=>{delete root.dataset.brawndoWorkspace;};
  },[theme]);
  return <div className="brawndo-workspace-pilot" data-theme={theme} data-navigation={navigation?'open':'closed'}>
    <header className="bwp-topbar">
      <button type="button" className="bwp-mobile-nav" aria-label="Toggle client navigation" aria-expanded={navigation} onClick={()=>setNavigation(!navigation)}><Menu size={22}/></button>
      <Link to="/dashboard" className="bwp-brand"><span className="bwp-mark" aria-hidden="true"/><span>Omnisciente<small>CLARITY FOR A STRONGER TOMORROW</small></span></Link>
      <WorkspaceSearch key={currentClientId} clientId={currentClientId}/>
      <button type="button" className="bwp-client" onClick={()=>navigate('/clients')}>{currentClient?.name}<ChevronDown size={15} aria-hidden="true"/><span className="sr-only">Open authorized client directory</span></button>
      <button type="button" className="bwp-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Use light workspace theme':'Use dark workspace theme'}>{theme==='dark'?<Sun size={20}/>:<Moon size={20}/>}</button>
      <NotificationBell/><ProfileMenu compact/>
    </header>
    {navigation&&<button type="button" className="bwp-nav-backdrop" aria-label="Close client navigation" onClick={()=>setNavigation(false)}/>}
    <div className="bwp-body" onClick={e=>{if(e.target.closest('.bsb-nav a'))setNavigation(false);}}>{children}</div>
  </div>;
}
