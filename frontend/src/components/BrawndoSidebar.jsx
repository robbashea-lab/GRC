import {useEffect,useState} from 'react';
import {NavLink,useNavigate} from 'react-router-dom';
import {LayoutDashboard,CalendarDays,ClipboardCheck,ListChecks,ShieldAlert,FileText,Building2,FolderArchive,Users,Server,Sparkles,Settings2,ShieldCheck,ArrowLeft,ChevronsUpDown,UserCircle2,LogOut} from 'lucide-react';
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
  ['Client',[['/contacts','Contacts & Roles',Users,'nav-contacts'],['/systems','Systems & Scope',Server,'nav-systems'],['/ai-governance','AI Governance',Sparkles,'nav-ai-governance'],['/client-profile','Client Profile',Settings2,'nav-client-profile']]],
];
const BADGE_LABEL={reviews:'overdue reviews',actions:'overdue action items',risks:'significant risks',vendors:'vendors with assurance due'};

// One summary request per client; counts are the dashboard's own authoritative totals.
export function sidebarCounts(summary){
  const k=summary?.kpis||{},v=(summary?.posture?.vendorHealth||[]).find(g=>g.key==='assurance');
  return {reviews:[k.overdue_reviews||0,'critical'],actions:[(k.overdue_actions||0),'critical'],risks:[k.significant_risks||0,'critical'],vendors:[v?.total??v?.items?.length??0,'attention']};
}

export default function BrawndoSidebar({complianceItems=[],isInternal}){
  const {user,logout}=useAuth(),{currentClient,currentClientId}=useOrg(),nav=useNavigate();
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
      <div className="bsb-brand"><span className="bsb-mark" aria-hidden="true">O</span><span><span className="bsb-name">Omnisciente</span><span className="bsb-sub">Prestige Worldwide</span></span></div>
      {isInternal&&<button type="button" className="bsb-back" onClick={()=>nav('/clients')} data-testid="return-to-portfolio"><ArrowLeft size={13} aria-hidden="true"/>Portfolio</button>}
      <div className="bsb-client" data-testid="context-header-client"><span className="bsb-client-mark" aria-hidden="true">{currentClient?.name?.[0]||'•'}</span><span className="min-w-0"><span className="bsb-group-label">Client</span><span className="bsb-client-name">{currentClient?.name||'Select a client…'}</span></span></div>
    </div>
    <nav className="bsb-nav" data-testid="sidebar-client" aria-label="Client workspace">
      {GROUPS.map(([group,items])=><div key={group} className="bsb-group" role="group" aria-labelledby={`bsb-${group}`}>
        <div id={`bsb-${group}`} className="bsb-group-label">{group}</div>
        {items.flatMap(item=>item[0]==='COMPLIANCE'?complianceItems.map(c=>link([c.to,c.label,ShieldCheck,`nav-compliance-${c.key}`])):[link(item)])}
      </div>)}
    </nav>
    <div className="bsb-foot">
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
    </div>
  </aside>;
}
