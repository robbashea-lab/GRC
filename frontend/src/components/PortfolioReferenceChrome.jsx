import {useEffect, useMemo, useRef, useState} from 'react';
import {Link, NavLink, useNavigate} from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {clientDestination} from '@/lib/clientSelection';
import {PLANNED_ROLES} from '@/lib/plannedRoleModel';
import {PREVIEW_MODE} from '@/lib/api';
import DemoNotice from '@/preview/DemoNotice';
import ClientIdentityMark from './ClientIdentityMark';
import NotificationBell from './NotificationBell';

const ICONS = {
  portfolio: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
  '/admin/clients': <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>,
  '/admin/users': <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a5 5 0 0 0-4-4.9"/></>,
  '/admin/roles': <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>,
  '/admin/security': <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  '/admin/audit': <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  down: <path d="m6 9 6 6 6-6"/>,
  account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  storage: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>,
  logout: <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>,
};
const REFERENCE_CLIENT_ORDER=['demo_brawndo','demo_dunder','demo_prestige','demo_initech','demo_krusty_krab'];
function Icon({name, size = 16}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'search' || name === 'down' ? 2 : 1.8} strokeLinecap={name === 'search' || name === 'logout' ? 'round' : undefined}>{ICONS[name]}</svg>;
}
function ClientLogo({client, size = 20}) {
  return <span className="tile" aria-hidden="true" style={{width:size, height:size, borderRadius:Math.round(size * .28)}}><ClientIdentityMark client={client} portfolio/></span>;
}

export default function PortfolioReferenceChrome({children, adminItems = []}) {
  const auth = useAuth(), org = useOrg(), navigate = useNavigate();
  const [theme] = useBrawndoTheme('dark');
  const [paletteOpen, setPaletteOpen] = useState(false), [query, setQuery] = useState(''), [selected, setSelected] = useState(0);
  const [menu, setMenu] = useState(null);
  const root = useRef(null), searchButton = useRef(null), searchInput = useRef(null), paletteResults = useRef(null);
  const {user, logout} = auth;
  const clients = useMemo(() => {
    const rows=[...new Map((org.error || org.loading ? [] : org.clients || []).filter(client => !client.archived && !client.archived_at && !['archived','retired'].includes(client.status)).map(client => [client.client_id, client])).values()];
    if(PREVIEW_MODE && auth.workspaceMode==='demo' && user?.workspace_mode==='demo' && user.user_id){
      const rank=client=>client.environment==='Demo' && REFERENCE_CLIENT_ORDER.includes(client.client_id) ? REFERENCE_CLIENT_ORDER.indexOf(client.client_id) : REFERENCE_CLIENT_ORDER.length;
      rows.sort((a,b)=>rank(a)-rank(b));
    }
    return rows;
  }, [org.clients, org.error, org.loading, auth.workspaceMode, user]);
  const pages = [{to:'/clients', label:'Portfolio'}, ...adminItems, {to:'/account', label:'My Account'}];
  const term = query.trim().toLowerCase();
  const matchingPages = pages.filter(page => page.label.toLowerCase().includes(term));
  const matchingClients = clients.filter(client => [client.name, client.grc_lead?.name || ''].join(' ').toLowerCase().includes(term));
  const resultCount = matchingPages.length + matchingClients.length;
  const initials = (user?.name || user?.email || '').trim().replace(/^Dr\.\s*/, '').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  const roleLabel = PLANNED_ROLES.find(role => role.legacyKey === user?.role)?.label || user?.role || '';

  function openPalette() {
    setMenu(null); setQuery(''); setSelected(0); setPaletteOpen(true);
  }
  function openClient(client) {
    if (org.switchClient(client.client_id) === false) return;
    setPaletteOpen(false); setMenu(null); navigate(clientDestination(client.client_id));
  }
  useEffect(() => {
    const html=document.documentElement, existed=html.classList.contains('portfolio-reference-root');
    html.classList.add('portfolio-reference-root');
    return ()=>{if(!existed)html.classList.remove('portfolio-reference-root');};
  },[]);
  useEffect(() => {
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
        && !document.querySelector('[role="dialog"][data-state="open"]')) {
        event.preventDefault(); setMenu(null); setQuery(''); setSelected(0); setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const clientState = org.error ? <div className="pop-empty" role="alert">Clients could not be loaded. <button type="button" className="link-btn" onClick={org.refresh}>Retry</button></div>
    : !clients.length ? <div className="pop-empty" role="status">{org.loading ? 'Loading clients.' : 'No clients available.'}</div> : null;

  return <div ref={root} className="portfolio-reference portfolio-reference-chrome" data-theme={theme}>
    <header className="topbar">
      <Link className="brand" to="/clients">
        <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--accent)'}}><path d="M27 4C16 5 8 12 6 25"/><path d="M27 4c-1 9-7 16-17 18"/><path d="M12 19l6-6M15 21l7-7M10 16l5-5"/><path d="M6 25l-2 3"/></svg>
        <span><span className="brand-name">GoverNara</span><br/><span className="brand-tag">Turn complexity into clarity.</span></span>
      </Link>
      <button ref={searchButton} className="search-btn" type="button" onClick={openPalette} aria-label="Search pages and active work"><Icon name="search"/><span className="lbl">Search pages and active work…</span><span className="kbd">Ctrl K</span></button>
      <div className="top-actions">
        <DropdownMenu.Root open={menu === 'workspace'} onOpenChange={open => setMenu(open ? 'workspace' : null)}>
          <DropdownMenu.Trigger asChild><button className="ws-btn" type="button" aria-label="Switch workspace"><span className="lbl">Portfolio</span><Icon name="down" size={14}/></button></DropdownMenu.Trigger>
          <DropdownMenu.Portal container={root.current}><DropdownMenu.Content className="pop" sideOffset={10} align="end" style={{position:'relative', top:'auto'}} aria-label="Switch workspace">
            <div className="pop-head">WORKSPACE</div>
            <DropdownMenu.Item asChild><Link className="pop-item" to="/clients" style={{fontWeight:600}}><Icon name="portfolio"/>Portfolio</Link></DropdownMenu.Item>
            <DropdownMenu.Separator className="pop-sep"/>
            {clientState || clients.map(client => <DropdownMenu.Item key={client.client_id} asChild><button className="pop-item" type="button" onClick={() => openClient(client)}><ClientLogo client={client} size={22}/>{client.name}</button></DropdownMenu.Item>)}
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
        <div className="portfolio-notifications"><NotificationBell/></div>
        <DemoNotice renderTrigger={(openStorage, storageOpener) => <DropdownMenu.Root open={menu === 'account'} onOpenChange={open => setMenu(open ? 'account' : null)}>
          <DropdownMenu.Trigger asChild><button ref={storageOpener} type="button" className="avatar-btn" data-testid="profile-menu-trigger" aria-label={`Account menu for ${user?.name || user?.email || ''}`}>{initials}</button></DropdownMenu.Trigger>
          <DropdownMenu.Portal container={root.current}><DropdownMenu.Content className="pop" sideOffset={14} align="end" style={{position:'relative', top:'auto'}} aria-label="Account">
            <div style={{padding:'10px 12px 8px'}}><div style={{fontWeight:600}}>{user?.name || user?.email}</div><div style={{fontSize:12, color:'var(--faint)'}}>{user?.email} · {roleLabel}</div></div>
            <DropdownMenu.Separator className="pop-sep"/>
            <DropdownMenu.Item asChild><Link className="pop-item" to="/account" data-testid="profile-menu-account"><Icon name="account"/>My Account</Link></DropdownMenu.Item>
            {openStorage && <DropdownMenu.Item asChild><button className="pop-item" type="button" data-testid="profile-menu-storage" onClick={openStorage}><Icon name="storage"/>Demo storage &amp; recovery</button></DropdownMenu.Item>}
            <DropdownMenu.Separator className="pop-sep"/>
            <DropdownMenu.Item asChild><button className="pop-item danger" type="button" data-testid="logout-button" onClick={async () => {if (await logout()) navigate('/login');}}><Icon name="logout"/>Sign out</button></DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>}/>
      </div>
    </header>
    <div className="shell">
      <nav className="side" aria-label="Main navigation" data-testid="sidebar-platform">
        <NavLink className="nav" to="/clients" end data-testid="nav-clients"><Icon name="portfolio"/>Portfolio</NavLink>
        <span className="side-label">CLIENTS</span>
        <div style={{display:'flex', flexDirection:'column', gap:2}} data-testid="sidebar-client-list">{clientState || clients.map(client => <button key={client.client_id} type="button" className="nav" data-testid={`sidebar-open-${client.client_id}`} onClick={() => openClient(client)}><ClientLogo client={client}/><span className="ellip">{client.name}</span></button>)}</div>
        <span className="side-label">ADMINISTRATION</span>
        {adminItems.map(item => <NavLink className="nav" key={item.to} to={item.to} data-testid={item.testid}><Icon name={item.to}/>{item.label}</NavLink>)}
      </nav>
      <main className="main" data-client-workspace-content>{children}</main>
    </div>
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal container={root.current}>
        <Dialog.Overlay className="scrim"><Dialog.Content className="palette" aria-describedby={undefined} onOpenAutoFocus={event => {event.preventDefault(); searchInput.current?.focus();}} onCloseAutoFocus={event => {event.preventDefault(); searchButton.current?.focus();}}>
          <Dialog.Title className="sr">Search</Dialog.Title>
          <label className="field"><Icon name="search" size={18}/><span className="sr">Search pages and clients</span><input ref={searchInput} type="search" placeholder="Search pages and active work…" autoComplete="off" style={{fontSize:15}} value={query} onChange={event => {setQuery(event.target.value); setSelected(0);}} onKeyDown={event => {
            if (!resultCount) return;
            if (['ArrowDown','ArrowUp'].includes(event.key)) {event.preventDefault(); setSelected(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + resultCount) % resultCount);}
            if (event.key === 'Enter') {event.preventDefault(); paletteResults.current?.querySelectorAll('[role="option"]')[selected % resultCount]?.click();}
          }}/><span className="kbd">Esc</span></label>
          <div ref={paletteResults} className="pal-list" role="listbox" aria-label="Results">
            {!!matchingPages.length && <><div className="pop-head">WORKSPACE PAGES</div>{matchingPages.map((page, index) => <Link key={page.to} className="pop-item" role="option" aria-selected={selected === index} to={page.to} onClick={() => setPaletteOpen(false)}><Icon name="portfolio"/>{page.label}</Link>)}</>}
            {!!matchingClients.length && <><div className="pop-head">CLIENTS</div>{matchingClients.map((client, index) => <button key={client.client_id} className="pop-item" role="option" aria-selected={selected === matchingPages.length + index} type="button" onClick={() => openClient(client)}><ClientLogo client={client} size={22}/><span>{client.name}</span></button>)}</>}
            {!resultCount && <div className="pop-empty">No pages or clients match "{query}".</div>}
          </div>
        </Dialog.Content></Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
