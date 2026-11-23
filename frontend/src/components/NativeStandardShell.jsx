import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {ArrowLeft, Briefcase, Building2, CalendarDays, ChevronDown, ClipboardCheck, FileText, FolderArchive, LayoutDashboard, ListChecks, Lock, LogOut, Menu as MenuIcon, Search, Server, Settings2, ShieldAlert, ShieldCheck, Sparkles, Users, Wrench} from 'lucide-react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {useCompliance} from '@/context/ComplianceContext';
import api, {formatError} from '@/lib/api';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {clientDestination} from '@/lib/clientSelection';
import {dashboardRecordHref} from '@/lib/dashboardItemSummary';
import {canExportReports, isInternal} from '@/lib/permissions';
import {nativeRoleLabel} from '@/lib/plannedRoleModel';
import {usePortfolioRefresh} from '@/lib/usePortfolioRefresh';
import {ticketRecords} from '@/lib/remediationTickets';
import {pilotActionMatches} from '@/lib/brawndoActions';
import DemoNotice from '@/preview/DemoNotice';
import ClientIdentityMark from './ClientIdentityMark';
import NotificationBell from './NotificationBell';

const ADMIN = [
  ['/admin/clients', 'Client Management', Building2], ['/admin/users', 'Users & Access', Users],
  ['/admin/roles', 'Roles & Permissions', ShieldCheck], ['/admin/security', 'Security & Auth', Lock],
  ['/admin/audit', 'Audit Log', FileText], ['/admin/tools', 'Tool Catalog', Wrench],
];
const WORK = [['/dashboard', 'Dashboard', LayoutDashboard], ['/calendar', 'Calendar', CalendarDays], ['/reviews', 'Reviews', ClipboardCheck], ['/action-items', 'Action Items', ListChecks]];
const PROGRAM = [['/risks', 'Risks', ShieldAlert], ['/policies', 'Policies', FileText], ['/vendors', 'Vendors', Building2], ['/ai-governance', 'AI Governance', Sparkles], ['/iv-setup', 'iVenture Setup', Wrench]];
const CLIENT = [['/contacts', 'Contacts', Users], ['/reports', 'Reports', FileText], ['/evidence', 'Evidence Library', FolderArchive], ['/client-profile', 'Client Profile', Settings2]];
const RELATED = [['/systems', 'Systems & Scope', Server], ['/findings', 'Findings', ShieldAlert], ['/requirements', 'Requirements', ListChecks], ['/exceptions', 'Exceptions', ShieldCheck]];

function ClientMark({client, size = 22}) {
  return <span className="tile" aria-hidden="true" style={{width:size, height:size, flex:'none', borderRadius:Math.round(size * .28)}}><ClientIdentityMark client={client} portfolio/></span>;
}

export default function NativeStandardShell({children}) {
  const auth = useAuth(), org = useOrg(), {items:frameworks} = useCompliance();
  const {pathname} = useLocation(), navigate = useNavigate();
  const {user} = auth, internal = isInternal(user);
  const [theme, setTheme] = useBrawndoTheme('dark');
  const [menu, setMenu] = useState(null), [navigation, setNavigation] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState(''), [selected, setSelected] = useState(0);
  const [activeWork, setActiveWork] = useState({items:[], loading:false, error:''});
  const [badges, setBadges] = useState(null);
  const badgeRequest = useRef(0);
  const root = useRef(null), navigationTrigger = useRef(null), trigger = useRef(null), input = useRef(null), results = useRef(null);
  const platform = internal && (pathname === '/clients' || pathname === '/account' || pathname.startsWith('/admin/'));
  const client = platform ? null : org.currentClient;
  const clientId = client?.client_id;
  const clients = useMemo(() => org.error || org.loading ? [] : [...new Map((org.clients || []).filter(c => !c.archived && !c.archived_at && !['archived','retired'].includes(c.status)).map(c => [c.client_id, c])).values()], [org.clients, org.error, org.loading]);
  const canReports = canExportReports(user);
  const clientPages = [...WORK, ...frameworks.map(f => [f.to, f.label, ShieldCheck]), ...PROGRAM, ...CLIENT.filter(([to]) => to !== '/reports' || canReports), ...RELATED];
  const pages = [...(internal ? [['/clients', 'Portfolio', Briefcase], ...ADMIN.filter(([to]) => to !== '/admin/audit' || user?.role === 'super_admin')] : []), ...(clientId ? clientPages : []), ['/account', 'My Account', Users]];
  const routeLabel = pages.find(([to]) => to.split('?')[0] === pathname)?.[1] || (pathname === '/tasks' ? 'Tasks' : 'Workspace');
  const titleClient = pathname !== '/account' && !org.loading && !org.error && clientId === org.currentClientId ? client?.name : null;
  const pageTitle = `${routeLabel}${titleClient ? ' · ' + titleClient : ''} | GoverNara`;
  useEffect(() => {
    document.title = pageTitle;
    return () => {if (document.title === pageTitle) document.title = 'GoverNara';};
  }, [pageTitle]);
  const term = query.trim().toLowerCase();
  const matchingPages = pages.filter(([, label]) => label.toLowerCase().includes(term));
  const matchingClients = clients.filter(c => [c.name, c.grc_lead?.name || ''].join(' ').toLowerCase().includes(term));
  const work = activeWork.items.map(item => {
    const key = {tasks:'task_id', findings:'finding_id', reviews:'review_id', risks:'risk_id', policies:'policy_id', vendors:'vendor_id', exceptions:'exception_id', requirements:'requirement_id'}[item.kind];
    const href = key && dashboardRecordHref(item.kind, {[key]:item.id, client_id:clientId}, {occurrence:item.occurrence_id});
    return href ? {...item, href} : null;
  }).filter(Boolean);
  const count = matchingPages.length + matchingClients.length + work.length;
  const initials = (user?.name || user?.email || '').trim().split(/\s+/).map(part => part[0]).slice(0,2).join('').toUpperCase();
  const role = nativeRoleLabel(user?.role);
  const loadBadges = useCallback(async () => {
    const request = ++badgeRequest.current;
    if (!clientId || org.loading || org.error) {setBadges(null); return;}
    try {
      const responses = await Promise.all([
        ...['/dashboard','/findings','/tasks'].map(path => api.get(path, {params:{client_id:clientId, scope:'org'}})),
        api.get(`/clients/${encodeURIComponent(clientId)}/iv-setup`).catch(() => ({data:null})),
      ]);
      if (request !== badgeRequest.current || responses[0].data.client_id !== clientId) return;
      const summary = responses[0].data, vendor = summary.posture?.vendorHealth?.find(row => row.key === 'assurance');
      setBadges({clientId, counts:{'/reviews':summary.kpis?.overdue_reviews, '/action-items':ticketRecords({findings:responses[1].data, tasks:responses[2].data}, clientId).filter(ticket => pilotActionMatches(ticket,'overdue')).length, '/risks':summary.kpis?.significant_risks, '/vendors':vendor?.total ?? vendor?.items?.length, '/iv-setup':responses[3].data?.outstanding_count}});
    } catch {if (request === badgeRequest.current) setBadges(null);}
  }, [clientId, org.loading, org.error]);
  const invalidateBadges = useCallback(() => {badgeRequest.current++;}, []);
  useEffect(() => {loadBadges(); return invalidateBadges;}, [loadBadges, invalidateBadges]);
  usePortfolioRefresh(loadBadges);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.nativeStandard = theme;
    html.dataset.brawndoWorkspace = theme;
    return () => {delete html.dataset.nativeStandard; delete html.dataset.brawndoWorkspace;};
  }, [theme]);
  useEffect(() => {setNavigation(false); setMenu(null);}, [pathname]);
  useEffect(() => {
    if (!navigation) return;
    const closeNavigation = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !navigationTrigger.current?.getClientRects().length ||
          document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"],[role="listbox"][data-state="open"]')) return;
      event.preventDefault();
      setNavigation(false);
      navigationTrigger.current.focus();
    };
    window.addEventListener('keydown', closeNavigation);
    return () => window.removeEventListener('keydown', closeNavigation);
  }, [navigation]);
  useEffect(() => {
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('[role="dialog"][data-state="open"]')) {
        event.preventDefault(); setMenu(null); setQuery(''); setSelected(0); setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!searchOpen || !clientId || !term) {setActiveWork({items:[], loading:false, error:''}); return;}
    const controller = new AbortController();
    setActiveWork({items:[], loading:true, error:''});
    const timer = setTimeout(() => api.get('/dashboard', {params:{client_id:clientId, scope:'org', work_queue:true, detail:'all', offset:0, limit:8, search:term}, signal:controller.signal})
      .then(({data}) => {if (!controller.signal.aborted) {if (data.client_id !== clientId) throw new Error('Search results could not be verified.'); setActiveWork({items:data.items || [], loading:false, error:''});}})
      .catch(error => {if (!controller.signal.aborted) setActiveWork({items:[], loading:false, error:formatError(error)});}), 250);
    return () => {clearTimeout(timer); controller.abort();};
  }, [searchOpen, clientId, term]);

  function openSearch() {setMenu(null); setQuery(''); setSelected(0); setSearchOpen(true);}
  function openClient(next) {
    if (org.switchClient(next.client_id) === false) return;
    setSearchOpen(false); setMenu(null); navigate(clientDestination(next.client_id));
  }
  function openPage(to) {setSearchOpen(false); navigate(clientId && !to.startsWith('/admin/') && !['/clients','/account'].includes(to) ? clientDestination(clientId, to) : to);}
  const link = ([to, label, Icon]) => {
    const count = badges && badges.clientId === clientId ? badges.counts[to] : null;
    return <NavLink key={to} to={clientId ? clientDestination(clientId, to) : to} className="nav" data-testid={`nav-${to.replace(/^\//,'').replaceAll('/','-')}`}><Icon size={16} aria-hidden="true"/>{label}{Number.isFinite(count) && count > 0 && <span className="badge-n" aria-label={`${count} ${label} needing attention`}>{count}</span>}</NavLink>;
  };
  const clientState = org.error ? <div className="pop-empty" role="alert">Clients could not be loaded. <button className="link-btn" type="button" onClick={org.refresh}>Retry</button></div> : org.loading ? <div className="pop-empty" role="status">Loading clients…</div> : !clients.length ? <div className="pop-empty">No clients available.</div> : null;

  return <div ref={root} className="native-standard portfolio-reference brawndo-workspace-pilot app-shell" data-theme={theme} data-native-navigation={navigation ? 'open' : 'closed'}>
    <header className="topbar">
      <button ref={navigationTrigger} type="button" className="icon-btn native-mobile-nav" aria-label="Toggle client navigation" aria-expanded={navigation} onClick={() => setNavigation(value => !value)}><MenuIcon size={20}/></button>
      <Link className="brand" to={internal ? '/clients' : '/dashboard'}>
        <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--accent)'}}><path d="M27 4C16 5 8 12 6 25M27 4c-1 9-7 16-17 18M12 19l6-6M15 21l7-7M10 16l5-5M6 25l-2 3"/></svg>
        <span><span className="brand-name">GoverNara</span><br/><span className="brand-tag">Turn complexity into clarity.</span></span>
      </Link>
      <button ref={trigger} type="button" className="search-btn" aria-label="Search pages and active work" onClick={openSearch}><Search size={16}/><span className="lbl">Search pages and active work…</span><span className="kbd">Ctrl K</span></button>
      <div className="top-actions">
        <Menu.Root open={menu === 'workspace'} onOpenChange={open => setMenu(open ? 'workspace' : null)}>
          <Menu.Trigger asChild><button type="button" className="ws-btn" aria-label="Switch workspace"><span className="lbl">{client?.name || 'Portfolio'}</span><ChevronDown size={14}/></button></Menu.Trigger>
          <Menu.Portal container={root.current}><Menu.Content className="pop native-menu" align="end" sideOffset={10}>
            <div className="pop-head">WORKSPACE</div>
            {internal && <Menu.Item asChild><Link className="pop-item" to="/clients"><Briefcase size={16}/>Portfolio</Link></Menu.Item>}
            <Menu.Separator className="pop-sep"/>
            {clientState || clients.map(next => <Menu.Item key={next.client_id} asChild><button type="button" className="pop-item" onClick={() => openClient(next)}><ClientMark client={next}/>{next.name}</button></Menu.Item>)}
          </Menu.Content></Menu.Portal>
        </Menu.Root>
        <button type="button" className="icon-btn native-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Use light workspace theme' : 'Use dark workspace theme'}>{theme === 'dark' ? '☀' : '☾'}</button>
        <NotificationBell/>
        <DemoNotice renderTrigger={(openStorage, storageOpener) => <Menu.Root open={menu === 'account'} onOpenChange={open => setMenu(open ? 'account' : null)}>
          <Menu.Trigger asChild><button ref={storageOpener} type="button" className="avatar-btn" data-testid="profile-menu-trigger" aria-label={`Account menu for ${user?.name || user?.email}`}>{initials}</button></Menu.Trigger>
          <Menu.Portal container={root.current}><Menu.Content className="pop native-menu" align="end" sideOffset={12}>
            <div className="native-account-label"><b>{user?.name || user?.email}</b><div className="sub">{user?.email} · {role}</div></div><Menu.Separator className="pop-sep"/>
            <Menu.Item asChild><Link className="pop-item" to="/account" data-testid="profile-menu-account"><Users size={16}/>My Account</Link></Menu.Item>
            {openStorage && <Menu.Item asChild><button type="button" className="pop-item" data-testid="profile-menu-storage" onClick={openStorage}>Demo storage &amp; recovery</button></Menu.Item>}
            <Menu.Separator className="pop-sep"/>
            <Menu.Item asChild><button type="button" className="pop-item danger" data-testid="logout-button" onClick={async () => {if (await auth.logout()) navigate('/login');}}><LogOut size={16}/>Sign out</button></Menu.Item>
          </Menu.Content></Menu.Portal>
        </Menu.Root>}/>
      </div>
    </header>
    <div className="shell">
      {navigation && <button type="button" className="native-nav-scrim" aria-label="Close client navigation" onClick={() => setNavigation(false)}/>}
      <nav className="side" aria-label={platform ? 'Platform' : 'Client workspace'} data-testid={platform ? 'sidebar-platform' : 'sidebar-client'} onClick={event => {if (event.target.closest('a,button')) setNavigation(false);}}>
        {platform ? <>
          <NavLink className="nav" to="/clients" end data-testid="nav-clients"><Briefcase size={16}/>Portfolio</NavLink><span className="side-label">CLIENTS</span>
          <div data-testid="sidebar-client-list">{clientState || clients.map(next => <button key={next.client_id} type="button" className="nav" data-testid={`sidebar-open-${next.client_id}`} onClick={() => openClient(next)}><ClientMark client={next}/><span className="ellip">{next.name}</span></button>)}</div>
          <span className="side-label">ADMINISTRATION</span>{ADMIN.filter(([to]) => to !== '/admin/audit' || user?.role === 'super_admin').map(link)}
        </> : <>
          {internal && <Link className="nav" to="/clients" data-testid="return-to-portfolio"><ArrowLeft size={14}/>Portfolio</Link>}
          <div className="ws-card"><ClientMark client={client} size={32}/><div style={{minWidth:0}}><b className="ellip">{client?.name || 'Client workspace'}</b><div className="sub">{client?.industry || 'Industry not set'}</div></div></div>
          <span className="side-label">WORK</span>{WORK.map(link)}<span className="side-label">PROGRAM</span>{frameworks.map(f => link([f.to, f.label, ShieldCheck]))}{PROGRAM.map(link)}
          <span className="side-label">CLIENT</span>{CLIENT.filter(([to]) => to !== '/reports' || canReports).map(link)}
          <details className="native-related"><summary>Related workspaces</summary>{RELATED.map(link)}</details>
        </>}
      </nav>
      <main className="main app-workspace" data-client-workspace-content>{children}</main>
    </div>
    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog.Portal container={root.current}>
      <Dialog.Overlay className="scrim"/><Dialog.Content className="palette native-palette" aria-describedby={undefined} onOpenAutoFocus={event => {event.preventDefault(); input.current?.focus();}} onCloseAutoFocus={event => {event.preventDefault(); trigger.current?.focus();}} onKeyDown={event => {
        if (!count || !['ArrowDown','ArrowUp','Enter'].includes(event.key)) return;
        const options = results.current?.querySelectorAll('[role="option"]');
        if (event.key === 'Enter') {event.preventDefault(); const focused = event.target.closest('[role="option"]'); (focused || options?.[selected % count])?.click();}
        else {event.preventDefault(); setSelected(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);}
      }}>
        <Dialog.Title className="sr">Search</Dialog.Title><label className="field"><Search size={18}/><span className="sr">Search pages and clients</span><input ref={input} type="search" maxLength={200} value={query} onChange={event => {setQuery(event.target.value); setSelected(0);}} placeholder="Search pages and active work…"/><span className="kbd">Esc</span></label>
        <div className="pal-list" ref={results} role="listbox" aria-label="Results">
          {!!matchingPages.length && <><div className="pop-head">WORKSPACE PAGES</div>{matchingPages.map(([to,label,Icon], index) => <button key={to} type="button" role="option" className="pop-item" aria-selected={selected % (count || 1) === index} onClick={() => openPage(to)}><Icon size={16}/>{label}</button>)}</>}
          {!!matchingClients.length && <><div className="pop-head">CLIENTS</div>{matchingClients.map((next,index) => <button key={next.client_id} type="button" role="option" className="pop-item" aria-selected={selected % (count || 1) === matchingPages.length + index} onClick={() => openClient(next)}><ClientMark client={next}/>{next.name}</button>)}</>}
          {!!work.length && <><div className="pop-head">ACTIVE WORK</div>{work.map((item,index) => <button key={item.key || item.href} type="button" role="option" className="pop-item" aria-selected={selected % (count || 1) === matchingPages.length + matchingClients.length + index} onClick={() => {setSearchOpen(false); navigate(item.href);}}><ClipboardCheck size={16}/>{item.title}</button>)}</>}
          {activeWork.loading && <div className="pop-empty" role="status">Searching active work…</div>}{activeWork.error && <div className="pop-empty" role="alert">{activeWork.error}</div>}
          {!count && !activeWork.loading && <div className="pop-empty">No pages or clients match “{query}”.</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </div>;
}
