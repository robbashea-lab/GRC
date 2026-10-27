import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Link,useNavigate,useLocation} from 'react-router-dom';
import {Menu,Moon,Sun,Search,ChevronDown} from 'lucide-react';
import api,{formatError,PREVIEW_MODE} from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import {canExportReports} from '@/lib/permissions';
import {useCompliance} from '@/context/ComplianceContext';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {dashboardRecordHref} from '@/lib/dashboardItemSummary';
import {ProfileMenu} from './BrawndoSidebar';
import NotificationBell from './NotificationBell';
import {BrandMark} from './Brand';
import {brawndoDemoRisksGate} from '@/lib/brawndoDemoRisks';
import {BRAWNDO_DEMO_DASHBOARD_ENABLED} from '@/lib/brawndoDemoDashboard';
import './BrawndoWorkspace.css';
import {visualCorrectionSurface} from '@/lib/visualCorrectionScope';
import {selectedClient} from '@/lib/clientSelection';
import {cisNativeClientRoute,cisPresentationEligible} from '@/lib/cisExperience';
import {sharedClientRoute,sharedNativeClientRoute,sharedPresentationEligible} from '@/lib/sharedExperience';
import './SixSurfaceAppearance.css';
import {additionalAppearanceSurface, additionalSectionChrome, useAdditionalSectionsAppearance} from '@/lib/brawndoAdditionalScope';
import './AdditionalSectionsAppearance.css';
import {CisVisualPublisher} from './BrawndoCisVisualAppearance';
import './CisWorkspaceSizing.css';
import './CisRegisterSizing.css';

const PAGES=[['Dashboard','/dashboard'],['Calendar','/calendar'],['Reviews','/reviews'],['Action Items','/action-items'],['Risks','/risks'],['Policies','/policies'],['Vendors','/vendors'],['Reports','/reports'],['Evidence Library','/evidence'],['Contacts','/contacts'],['Systems & Scope','/systems'],['AI Governance','/ai-governance'],['Client Profile','/client-profile']];

function WorkspaceSearch({clientId}){
  const [query,setQuery]=useState(''),[result,setResult]=useState(null),[open,setOpen]=useState(false);
  const {user}=useAuth();
  const input=useRef(null),{items:frameworks}=useCompliance();
  const pages=(clientId?[...PAGES.filter(([,to])=>to!=='/reports'||canExportReports(user)),...frameworks.map(f=>[f.label,f.to])]:[['Portfolio','/clients'],['My Account','/account']]).filter(([label])=>label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{
    const shortcut=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('[role="dialog"][data-state="open"]')){e.preventDefault();input.current?.focus();}};
    window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);
  },[]);
  useEffect(()=>{
    setResult(null);if(!clientId||!query.trim())return;
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
      {!!clientId&&!!query.trim()&&<><p>Active work in this client</p>{!result?<span role="status">Searching…</span>:result.error?<span role="alert">{result.error}</span>:result.items.length?result.items.map(item=>{
        const idKey={tasks:'task_id',findings:'finding_id',reviews:'review_id',risks:'risk_id',policies:'policy_id',vendors:'vendor_id',exceptions:'exception_id',requirements:'requirement_id'}[item.kind];
        const href=idKey&&dashboardRecordHref(item.kind,{[idKey]:item.id,client_id:clientId});
        return href?<Link key={item.key} to={href} onClick={close}>{item.title}<small>{item.type}</small></Link>:null;
      }):<span>No matching active work.</span>}</>}
    </div>}
  </div>;
}

export default function BrawndoWorkspace({children}){
  const org=useOrg(),auth=useAuth();
  const {currentClientId,currentClient}=org,[theme,setTheme]=useBrawndoTheme(),[navigation,setNavigation]=useState(false),navigate=useNavigate();
  const {user}=auth,{pathname,search}=useLocation();
  const cisScopeKey=JSON.stringify([user?.user_id,user?.role,user?.workspace_mode,auth.workspaceMode,PREVIEW_MODE,currentClientId,pathname,search]);
  const [cisPublication,setCisPublication]=useState(null);
  const publishCis=useCallback(enabled=>setCisPublication(old=>enabled?cisScopeKey:old===cisScopeKey?null:old),[cisScopeKey]);
  const cisVisual=cisPublication===cisScopeKey;
  const chromeContext={...org,...auth,pathname,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id'),authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error};
  const verifiedChrome=sharedPresentationEligible(chromeContext);
  const cisVerifiedChrome=cisPresentationEligible(chromeContext);
  const sizingChrome=(cisVerifiedChrome&&cisNativeClientRoute(pathname))||(verifiedChrome&&sharedClientRoute(pathname));
  const sharedShell=verifiedChrome&&sharedNativeClientRoute(pathname)&&(!cisVerifiedChrome||!cisNativeClientRoute(pathname));
  const risksPresentation=brawndoDemoRisksGate({...org,...auth,pathname,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id'),authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error});
  const visualSurface=visualCorrectionSurface(chromeContext);
  const visualChrome=visualCorrectionSurface({...chromeContext,orgLoading:verifiedChrome?false:org.loading});
  const cisChrome=cisVisual||cisVerifiedChrome&&pathname==='/compliance/cis-ig1'
    &&(auth.workspaceMode==='demo'?PREVIEW_MODE===true:PREVIEW_MODE===false);
  const additionalChrome=additionalSectionChrome({...org,...auth,pathname,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id'),authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error});
  const additionalAppearance=useAdditionalSectionsAppearance();
  const additionalSurface=additionalAppearanceSurface({...org,...auth,pathname,selectedClientId:selectedClient(),routeClientId:new URLSearchParams(search).get('client_id'),authLoading:auth.loading,authError:auth.error,orgLoading:org.loading,orgError:org.error},additionalAppearance);
  const platform=['/clients','/admin','/platform','/account'].some(path=>pathname.startsWith(path));
  const canOpenDirectory=['super_admin','platform_admin'].includes(user?.role);
  const searchClient=platform?null:currentClientId;
  useEffect(()=>{
    const root=document.documentElement;root.dataset.brawndoWorkspace=theme;
    return()=>{delete root.dataset.brawndoWorkspace;};
  },[theme]);
  useLayoutEffect(()=>{
    const root=document.documentElement;
    if(visualSurface){root.dataset.visualSurface=visualSurface;root.dataset.visualTheme=theme;}
    return()=>{delete root.dataset.visualSurface;delete root.dataset.visualTheme;};
  },[visualSurface,theme]);
  useLayoutEffect(()=>{
    const root=document.documentElement;
    if(additionalSurface){root.dataset.additionalSurface=additionalSurface;root.dataset.additionalTheme=theme;}
    return()=>{delete root.dataset.additionalSurface;delete root.dataset.additionalTheme;};
  },[additionalSurface,theme]);
  return <CisVisualPublisher.Provider value={publishCis}><div className="brawndo-workspace-pilot" data-cis-sizing={sizingChrome?'true':undefined} data-shared-shell={sharedShell?'true':undefined} data-cis-dashboard-concept={BRAWNDO_DEMO_DASHBOARD_ENABLED&&pathname==='/dashboard'&&verifiedChrome?'true':undefined} data-additional-surface={additionalChrome||undefined} data-visual-surface={visualChrome||undefined} data-cis-visual={cisChrome||undefined} data-theme={theme} data-navigation={navigation?'open':'closed'}>
    <header className="bwp-topbar">
      <button type="button" className="bwp-mobile-nav" aria-label="Toggle client navigation" aria-expanded={navigation} onClick={()=>setNavigation(!navigation)}><Menu size={22}/></button>
      <Link to={currentClientId?'/dashboard':'/clients'} className="bwp-brand" aria-label="GoverNara"><BrandMark className="bwp-mark"/><span>GoverNara<small>{visualChrome||additionalChrome||risksPresentation||cisChrome||sharedShell?'By Prestige Worldwide':'CLARITY FOR A STRONGER TOMORROW'}</small></span></Link>
      <WorkspaceSearch key={searchClient} clientId={searchClient}/>
      <div className="bwp-top-actions">
      {canOpenDirectory?<button type="button" className="bwp-client" onClick={()=>navigate('/clients')}><span className="bwp-client-name">{platform?'Portfolio':currentClient?.name||'Portfolio'}</span><ChevronDown size={15} aria-hidden="true"/><span className="sr-only">Open authorized client directory</span></button>:<span className="bwp-client">{currentClient?.name||'Client workspace'}</span>}
      <button type="button" className="bwp-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label={theme==='dark'?'Use light workspace theme':'Use dark workspace theme'}>{cisChrome?<svg viewBox="0 0 16 16" aria-hidden="true"><circle className="ic" cx="8" cy="8" r="3"/><path className="ic" d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/></svg>:(visualChrome||additionalChrome||sharedShell)?<Sun size={16}/>:theme==='dark'?<Sun size={20}/>:<Moon size={20}/>}</button>
      <NotificationBell/><ProfileMenu compact storageTools={!!(visualChrome||additionalChrome||cisChrome)}/>
      </div>
    </header>
    {navigation&&<button type="button" className="bwp-nav-backdrop" aria-label="Close client navigation" onClick={()=>setNavigation(false)}/>}
    <div className="bwp-body" onClick={e=>{if(e.target.closest('.bsb-nav a'))setNavigation(false);}}>{children}</div>
  </div></CisVisualPublisher.Provider>;
}
