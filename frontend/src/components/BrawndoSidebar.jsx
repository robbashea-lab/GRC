import {useEffect,useMemo,useState} from 'react';
import {NavLink,useNavigate} from 'react-router-dom';
import {LayoutDashboard,CalendarDays,ClipboardCheck,ListChecks,ShieldAlert,FileText,Building2,FolderArchive,Users,Server,Sparkles,Settings2,ShieldCheck,ArrowLeft,ChevronsUpDown,UserCircle2,LogOut,Briefcase} from 'lucide-react';
import api from '@/lib/api';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import NotificationBell from './NotificationBell';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from './ui/dropdown-menu';
import './BrawndoSidebar.css';

// Brawndo reference sidebar: grouped navigation, one theme with the workspace,
// and counts that show where attention is needed from anywhere in the client.
const GROUPS=[
  ['Work',[['/dashboard','Dashboard',LayoutDashboard,'nav-dashboard'],['/calendar','Calendar',CalendarDays,'nav-calendar'],['/reviews','Reviews',ClipboardCheck,'nav-reviews','reviews'],['/action-items','Action Items',ListChecks,'nav-action-items','actions']]],
  ['Program',[['COMPLIANCE'],['/risks','Risks',ShieldAlert,'nav-risks','risks'],['/policies','Policies',FileText,'nav-policies'],['/vendors','Vendors',Building2,'nav-vendors','vendors'],['/evidence','Evidence Library',FolderArchive,'nav-evidence']]],
  ['Client',[['/contacts','Contacts',Users,'nav-contacts'],['/systems','Systems & Scope',Server,'nav-systems'],['/ai-governance','AI Governance',Sparkles,'nav-ai-governance'],['/client-profile','Client Profile',Settings2,'nav-client-profile']]],
];
const BADGE_LABEL={reviews:'overdue reviews',actions:'overdue action items',risks:'significant risks',vendors:'vendors with assurance needing attention'};

// One summary request per client; counts are the dashboard's own authoritative totals.
export function sidebarCounts(summary){
  const k=summary?.kpis||{},v=(summary?.posture?.vendorHealth||[]).find(g=>g.key==='assurance');
  return {reviews:[k.overdue_reviews||0,'critical'],actions:[(k.overdue_actions||0),'critical'],risks:[k.significant_risks||0,'critical'],vendors:[v?.total??v?.items?.length??0,'attention']};
}

function ProfileMenu(){
  const {user,logout}=useAuth(),nav=useNavigate();
  return <div className="bsb-foot">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" data-testid="profile-menu-trigger" className="bsb-profile">
            <span className="bsb-avatar" aria-hidden="true">{user?.name?.[0]||user?.email?.[0]?.toUpperCase()}</span>
            <span className="min-w-0 flex-1 text-left"><span className="bsb-client-name">{user?.name||user?.email}</span><span className="bsb-group-label">{(user?.role||'').replace('_',' ')}</span></span>
            <ChevronsUpDown size={14} aria-hidden="true"/>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem onClick={()=>nav('/account')} data-testid="profile-menu-account" className="text-sm"><UserCircle2 className="h-3.5 w-3.5 mr-2"/> My Account</DropdownMenuItem>
          <DropdownMenuSeparator/><div className="px-2 py-1"><NotificationBell/></div><DropdownMenuSeparator/>
          <DropdownMenuItem data-testid="logout-button" onClick={async()=>{await logout();nav('/login');}} className="text-sm text-semantic-critical focus:text-semantic-critical"><LogOut className="h-3.5 w-3.5 mr-2"/> Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>;
}
const Brand=()=><div className="bsb-brand"><span className="bsb-mark" aria-hidden="true">O</span><span><span className="bsb-name">Omnisciente</span><span className="bsb-sub">Prestige Worldwide</span></span></div>;

// Portfolio (platform) context in the reference theme: Portfolio, the client navigator, Administration.
export function BrawndoPlatformSidebar({adminItems=[]}){
  const {user}=useAuth(),{clients,switchClient,loading,error,refresh}=useOrg(),nav=useNavigate();
  const [theme]=useBrawndoTheme(),[filter,setFilter]=useState('all'),[q,setQ]=useState('');
  const active=useMemo(()=>(clients||[]).filter(c=>(c.status||'active')!=='archived'),[clients]);
  const scoped=useMemo(()=>{let list=active;
    if(filter==='assigned')list=list.filter(c=>(c.grc_lead_id||c.assigned_owner_id)===user?.user_id);
    const s=q.trim().toLowerCase();if(s)list=list.filter(c=>(c.name||'').toLowerCase().includes(s));
    return [...list].sort((a,b)=>(a.name||'').trim().localeCompare((b.name||'').trim()));},[active,filter,user?.user_id,q]);
  const empty=loading?'Loading clients…':filter==='assigned'?'None assigned to you.':q?'No matches.':'No clients available.';
  return <aside className="app-sidebar bsb w-64 shrink-0 hidden lg:flex flex-col h-screen sticky top-0" data-theme={theme}>
    <div className="bsb-head"><Brand/></div>
    <nav className="bsb-nav" data-testid="sidebar-platform" aria-label="Platform">
      <div className="bsb-group" data-testid="sidebar-clients-section">
        <NavLink to="/clients" end data-testid="nav-clients" className={({isActive})=>`bsb-link${isActive?' is-active':''}`}><Briefcase size={17} aria-hidden="true"/><span>Portfolio</span></NavLink>
        <div className="bsb-group-label bsb-sub-label">Clients</div>
        <div className="bsb-seg" role="group" aria-label="Client list scope">{[['all','All'],['assigned','Mine']].map(([id,label])=><button key={id} type="button" data-testid={`sidebar-filter-${id}`} aria-pressed={filter===id} className={filter===id?'is-active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
        {active.length>8&&<input className="bsb-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search clients…" aria-label="Search clients" data-testid="sidebar-client-search"/>}
        <div data-testid="sidebar-client-list">
          {error?<div className="bsb-note" role="alert" data-testid="sidebar-client-error">Clients could not be loaded. <button type="button" onClick={refresh}>Retry</button></div>
          :scoped.length===0?<div className="bsb-note" data-testid="sidebar-client-empty">{empty}</div>
          :scoped.map(c=><div key={c.client_id} data-testid={`sidebar-client-${c.client_id}`}><button type="button" className="bsb-link bsb-client-link" data-testid={`sidebar-open-${c.client_id}`} onClick={()=>{switchClient(c.client_id);nav('/dashboard');}}><span className="bsb-dot" aria-hidden="true">{c.name?.[0]}</span><span className="truncate">{c.name}</span></button></div>)}
        </div>
      </div>
      {adminItems.length>0&&<div className="bsb-group" role="group" aria-labelledby="bsb-admin"><div id="bsb-admin" className="bsb-group-label">Administration</div>
        {adminItems.map(({to,label,icon:Icon,testid})=><NavLink key={to} to={to} data-testid={testid} className={({isActive})=>`bsb-link${isActive?' is-active':''}`}><Icon size={17} aria-hidden="true"/><span>{label}</span></NavLink>)}
      </div>}
    </nav>
    <ProfileMenu/>
  </aside>;
}

export default function BrawndoSidebar({complianceItems=[],isInternal}){
  const {currentClient,currentClientId}=useOrg(),nav=useNavigate();
  const [theme]=useBrawndoTheme(),[counts,setCounts]=useState({});
  useEffect(()=>{
    if(!currentClientId)return;const c=new AbortController();
    api.get('/dashboard',{params:{client_id:currentClientId,scope:'org'},signal:c.signal})
      .then(({data})=>{if(!c.signal.aborted&&data.client_id===currentClientId)setCounts(sidebarCounts(data));})
      .catch(()=>{/* badges are supplementary; navigation never depends on them */});
    return()=>c.abort();
  },[currentClientId]);
  const link=([to,label,Icon,testid,badge])=>{const [n,tone]=counts[badge]||[];
    return <NavLink key={to} to={to} data-testid={testid} className={({isActive})=>`bsb-link${isActive?' is-active':''}`}>
      <Icon size={17} aria-hidden="true"/><span>{label}</span>
      {n>0&&<span className={`bsb-badge is-${tone}`} aria-label={`${n} ${BADGE_LABEL[badge]}`}>{n}</span>}
    </NavLink>;};
  return <aside className="app-sidebar bsb w-64 shrink-0 hidden lg:flex flex-col h-screen sticky top-0" data-theme={theme}>
    <div className="bsb-head">
      <Brand/>
      {isInternal&&<button type="button" className="bsb-back" onClick={()=>nav('/clients')} data-testid="return-to-portfolio"><ArrowLeft size={13} aria-hidden="true"/>Portfolio</button>}
      <div className="bsb-client" data-testid="context-header-client"><span className="bsb-client-mark" aria-hidden="true">{currentClient?.name?.[0]||'•'}</span><span className="min-w-0"><span className="bsb-group-label">Client</span><span className="bsb-client-name">{currentClient?.name||'Select a client…'}</span></span></div>
    </div>
    <nav className="bsb-nav" data-testid="sidebar-client" aria-label="Client workspace">
      {GROUPS.map(([group,items])=><div key={group} className="bsb-group" role="group" aria-labelledby={`bsb-${group}`}>
        <div id={`bsb-${group}`} className="bsb-group-label">{group}</div>
        {items.flatMap(item=>item[0]==='COMPLIANCE'?complianceItems.map(c=>link([c.to,c.label,ShieldCheck,`nav-compliance-${c.key}`])):[link(item)])}
      </div>)}
    </nav>
    <ProfileMenu/>
  </aside>;
}
