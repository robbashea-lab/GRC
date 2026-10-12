import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { grcLead } from '@/lib/clientRelationships';
import { tableColumns } from '@/lib/tableColumns';
import { portfolioOrder, inactiveDays, isStale, STALE_AFTER_DAYS } from '@/lib/portfolioOverview';
import { usePortfolioView } from '@/lib/usePortfolioView';
import { loadPortfolioRecord } from '@/lib/portfolioRecord';
import { useTableControls, ColumnControl, TableFilterChips } from '@/components/TableControls';
import RecordDrawer from '@/components/RecordDrawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Search, MoreVertical, Archive, ExternalLink, ScrollText, AlertTriangle, SlidersHorizontal, Building2, Layers3, ListTodo, History, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useBrawndoTheme, useBrawndoPortalTheme } from '@/lib/brawndoTheme';
import { Moon, Sun } from 'lucide-react';
import portfolioScene from '@/assets/portfolio-nara-scene.webp';
import './Portfolio.css';
import './GoverNaraPortfolio.css';
// Quick views narrow the table to clients carrying that kind of work (one at a time); the column
// menus still combine filters. "My Team" needs a manager-to-team relationship the data model does not
// have yet (docs/portfolio-command-center.md); scope options are a list so it can be added here without new logic.
const QUICK = [['past_due', 'Past Due'], ['critical_high_issues', 'Critical / High'], ['significant_risks', 'Significant Risks'], ['unassigned', 'Unassigned']];
const SCOPES = [[false, 'All Clients', 'all'], [true, 'Assigned to Me', 'assigned_to_me']];
const METRICS = [['past_due', 'Past Due'], ['due_30d', 'Due ≤30d'], ['due_31_90d', 'Upcoming (31–90d)'], ['critical_high_issues', 'Critical / High'], ['significant_risks', 'Significant Risks'], ['unassigned', 'Unassigned']];
// Red only where the number means genuine urgency; other non-zero counts stay neutral and zeros recede.
// Reference portfolio: counts carry a severity tone; zero always recedes.
const TONE = { past_due: 'critical', critical_high_issues: 'attention', significant_risks: 'attention', unassigned: 'neutral' };
const fmtDate = value => value ? new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric'
}) : '—';
const actionLabel = item => ({
  review: 'Open Review',
  task: 'Open Action',
  finding: 'View Finding',
  risk: 'View Risk',
  vendor: 'View Vendor',
  policy: 'View Policy'
})[item.entity_type] || 'Open record';
export default function ClientDirectory() {
  const {
    user
  } = useAuth();
  return user ? <Portfolio user={user} key={user.user_id + ':' + user.role + ':' + (user.client_ids || []).join(',')} /> : null;
}
function Portfolio({
  user
}) {
  const nav = useNavigate(),
    {
      switchClient,
      refresh: refreshClients
    } = useOrg();
  const [view, update, restoreScroll] = usePortfolioView(user);
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [drill, setDrill] = useState(null),
    [selected, setSelected] = useState(null),
    [members, setMembers] = useState([]);
  const generation = useRef(0),
    recordRequest = useRef(0);
  const globalScope = user.role === 'super_admin' || (user.role === 'platform_admin' && !user.client_ids?.length);
  const canManage = ['super_admin', 'platform_admin'].includes(user.role);
  const [theme, setTheme] = useBrawndoTheme();
  useBrawndoPortalTheme(true, theme);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const {
        data
      } = await api.get('/clients/directory', {
        params: {
          include_archived: view.includeArchived
        }
      });
      if (request === generation.current) setRows(data.clients || []);
    } catch (e) {
      if (request === generation.current) {
        setRows([]);
        setError(formatError(e));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [view.includeArchived]);
  useEffect(() => {
    const requests = generation,
      records = recordRequest;
    load();
    return () => {
      requests.current++;
      records.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!loading) restoreScroll();
  });
  const columns = tableColumns('portfolio', {
    rows
  });
  const table = useTableControls({
    columns,
    rows,
    module: 'portfolio',
    scope: user.user_id + ':platform',
    state: view.table,
    onStateChange: next => update({
      table: next,
      scroll: 0
    })
  });
  const query = view.search.trim().toLowerCase();
  const activeSignal = QUICK.map(([key]) => key).find(key => table.state.filters[key]?.includes('some'));
  // One signal at a time, like the register signal bars; the column menus still combine filters.
  // One state update: sequential setFilter calls would each start from the same stale state.
  const withoutViews = filters => Object.fromEntries(Object.entries(filters || {}).filter(([k]) => !QUICK.some(([q]) => q === k)));
  const pickSignal = key => table.replaceState({ ...table.state, filters: { ...withoutViews(table.state.filters), ...(key && activeSignal !== key ? { [key]: ['some'] } : {}) } });
  const filtered = table.apply([...rows].sort(portfolioOrder).filter(r => (!view.mine || r.grc_lead_id === user.user_id) && (!query || [r.name, r.industry, grcLead(r).name].some(v => v?.toLowerCase().includes(query)))));
  const hasFilters = !!(query || view.mine || Object.keys(view.table.filters).length);
  const clear = () => update({
    search: '',
    mine: false,
    table: {
      filters: {}
    },
    scroll: 0
  });
  const enter = (row, path = '/dashboard') => {
    switchClient(row.client_id);
    nav(path);
  };
  const closeDrill = () => {
    recordRequest.current++;
    setDrill(null);
  };
  const openDrill = (key, row) => {
    const items = row.metric_items?.[key];
    if (!Array.isArray(items) || items.length !== row[key]) {
      toast.error('Complete metric details are unavailable. Refresh the portfolio.');
      return;
    }
    recordRequest.current++;
    setDrill({
      title: METRICS.find(([k]) => k === key)[1] + ' — ' + row.name,
      items: [...items].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.key.localeCompare(b.key))
    });
  };
  const openItem = async item => {
    const request = ++recordRequest.current;
    try {
      const [record, {
        data
      }] = await Promise.all([loadPortfolioRecord(api, item), api.get(`/clients/${encodeURIComponent(item.client_id)}/members`)]);
      if (request !== recordRequest.current) return;
      setMembers(data);
      setDrill(null);
      setSelected(record);
    } catch (e) {
      if (request === recordRequest.current) toast.error(formatError(e));
    }
  };
  // Counts use active authorized directory rows; table filters do not redefine these populations.
  const active = rows.filter(r => !['archived', 'inactive'].includes(r.client_status));
  const frameworkCount = active.every(r => Array.isArray(r.frameworks)) ? new Set(active.flatMap(r => r.frameworks.map(f => f.key === 'cis-ig1' ? `${f.key}:${f.label}` : f.key))).size : null;
  const available = !loading && !error;
  const sort = table.state.sort ? `${table.state.sort.key}:${table.state.sort.dir}` : '';
  return <div className="portfolio-overview governara-portfolio" data-theme={theme}>
    <header className="gp-head">
      <h1>Client Portfolio</h1>
      <button type="button" className="bp-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-pressed={theme === 'dark'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
    </header>
    <section className="gp-hero" aria-labelledby="portfolio-overview-heading">
      <img src={portfolioScene} alt="" aria-hidden="true" className="gp-hero-art" />
      <div className="gp-hero-content"><p className="gp-eyebrow">Portfolio overview</p>
        <h2 id="portfolio-overview-heading">Your clients. <span>A clearer tomorrow.</span></h2>
        <p className="gp-description">A high-level view of all client programs. Select a client to open its portal.</p>
        <div className="gp-metrics" role="group" aria-label="Portfolio totals">
          {[[Building2, 'Total clients', available ? active.length : null, 'Active authorized clients; table filters do not change this total.'],
            [Layers3, 'Active frameworks', available ? frameworkCount : null, 'Distinct configured framework identities across active authorized clients, preserving CIS implementation groups.'],
            [ListTodo, 'Open work items', null, 'Unavailable: the existing directory exposes due-bounded work counts, not a complete open-work population.'],
            [History, 'Recent changes', null, 'Unavailable: the existing directory exposes latest activity, not seven-day event counts.']].map(([Icon, label, value, detail]) => <div key={label} className="gp-metric" title={detail}><span className="gp-metric-icon" aria-hidden="true"><Icon size={24}/></span><div><strong className="gp-metric-value">{value ?? '—'}{value == null && <span className="sr-only"> unavailable</span>}</strong><span className="gp-metric-label">{label}{label === 'Recent changes' && <small>in last 7 days</small>}</span></div></div>)}
        </div>
      </div>
    </section>
    <section className="gp-register" aria-label="Client portfolio register">
    <div className="register-toolbar gp-toolbar" data-testid="client-directory-filters">
      <div className="register-search relative">
        <Search aria-hidden="true" className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
        <Input aria-label="Search clients" data-testid="client-directory-search" placeholder="Search client, industry, lead…" value={view.search} onChange={e => update({
          search: e.target.value,
          scroll: 0
        })} className="pl-8 h-9 w-56 text-sm" />
      </div>
      <div className="quick-filters inline-flex flex-wrap gap-0.5" role="group" aria-label="Portfolio views">
        {SCOPES.map(([mine, label, id]) => {
          // All Clients clears every narrowing view; Assigned to Me combines with a work view.
          const pressed = mine ? view.mine : !view.mine && !activeSignal;
          return <button key={id} type="button" data-testid={`client-filter-${id}`} aria-pressed={pressed} onClick={() => update(mine ? { mine, scroll: 0 } : { mine, scroll: 0, table: { ...view.table, filters: withoutViews(view.table.filters) } })} className={`portfolio-view ${pressed ? 'is-active bg-primary text-primary-foreground' : ''}`}>{label}</button>;
        })}
      </div>
      <label className="gp-sort">Sort by <select aria-label="Sort clients" value={sort} onChange={e => { const [key, dir] = e.target.value.split(':'); table.setSort(key || null, dir); }}><option value="">Most urgent first</option>{columns.filter(c => c.sortable !== false).flatMap(c => ['asc', 'desc'].map(dir => <option key={`${c.key}:${dir}`} value={`${c.key}:${dir}`}>{`${c.label} · ${c.numeric ? dir === 'asc' ? 'Lowest First' : 'Highest First' : c.dateKind ? dir === 'asc' ? 'Oldest' : 'Most Recent' : dir === 'asc' ? 'A → Z' : 'Z → A'}`}</option>))}</select></label>
      <Popover><PopoverTrigger asChild><button type="button" className="gp-filter-button" aria-label="Portfolio filters"><SlidersHorizontal size={15} aria-hidden="true"/>Filters</button></PopoverTrigger>
        <PopoverContent align="end" className="gp-filter-menu" aria-label="Portfolio filters">
          <div className="gp-work-views" role="group" aria-label="Portfolio work views">{QUICK.map(([key, label]) => <button key={key} type="button" data-testid={`client-filter-${key}`} aria-pressed={activeSignal === key} onClick={() => pickSignal(key)} className={`portfolio-view ${activeSignal === key ? 'is-active' : ''}`}>{label}</button>)}</div>
          <div className="gp-column-filters">{columns.map(c => <ColumnControl key={c.key} table={table} column={c} menuClassName="portfolio-column-menu"/>)}</div>
          <label className="inline-flex items-center gap-2 whitespace-nowrap text-ink-secondary"><input type="checkbox" checked={view.includeArchived} onChange={e => update({
            includeArchived: e.target.checked,
            scroll: 0
          })} data-testid="include-archived" />Include archived</label>
        </PopoverContent>
      </Popover>
    </div>
    <div className="gp-register-body">
      <TableFilterChips table={table} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary py-2">
        <span>{loading ? 'Loading clients…' : `${filtered.length} ${filtered.length === 1 ? 'client' : 'clients'}${hasFilters ? ` · ${rows.length} available` : ''}${globalScope ? '' : ' · your authorized clients'}`}</span>
        <span>{table.state.sort ? 'Sorted by column' : 'Most urgent first'}{hasFilters && <button onClick={clear} className="ml-3 underline underline-offset-2">Clear filters</button>}</span>
      </div>
      {error ? <div role="alert" className="border border-line rounded-lg p-5 text-sm">{error}<Button variant="outline" size="sm" onClick={load} className="ml-3">Retry</Button></div> : <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto" data-testid="client-portfolio-table" tabIndex={0} role="region" aria-label="Client portfolio, scroll horizontally for additional columns">
        <table className="portfolio-table w-full text-sm">
          <caption className="sr-only">Authorized client overview. Open Work is unavailable. Priority Risks uses the existing Significant Risks population. Detailed work counts are available in each row's action menu. Last Activity is the latest lifecycle event; logins and generic edits are excluded.</caption>
          <thead><tr>{['name', 'grc_lead_id', 'frameworks'].map(key => <th key={key} scope="col" aria-sort={table.state.sort?.key === key ? table.state.sort.dir === 'asc' ? 'ascending' : 'descending' : undefined} className="tbl-cell text-left"><ColumnControl table={table} columnKey={key} menuClassName="portfolio-column-menu"/></th>)}<th scope="col" className="tbl-cell">Open Work</th><th scope="col" className="tbl-cell">Priority Risks</th><th scope="col" className="tbl-cell"><ColumnControl table={table} columnKey="last_activity" menuClassName="portfolio-column-menu"/></th><th scope="col" className="tbl-cell">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {loading ? <tr><td colSpan={7} className="tbl-cell py-8 text-center text-ink-secondary">Loading directory…</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="tbl-cell py-8 text-center text-ink-secondary">
              <p>{view.mine ? 'No clients are currently assigned to you.' : rows.length ? 'No clients match the current filters.' : 'No clients are currently available to you.'}</p>
              {hasFilters && <button onClick={clear} className="mt-2 underline underline-offset-2">Clear filters</button>}
              {canManage && <button onClick={() => nav('/admin/clients')} className="ml-3 mt-2 underline underline-offset-2">Client Management →</button>}
            </td></tr> : filtered.map((r, i) => {
              const lead = grcLead(r);
              return <tr key={r.client_id} className="row-hover" data-testid={`client-row-${i}`} data-client-id={r.client_id}>
              <td className="tbl-cell"><div className="gp-client"><span className="gp-client-initial" aria-hidden="true">{r.name?.trim().charAt(0) || '—'}</span><div><button onClick={() => enter(r)} data-testid={`client-open-${r.client_id}`} className="text-left hover:underline underline-offset-2 font-medium text-ink-primary">{r.name}</button><div className="text-xs text-ink-secondary">{r.industry || '—'}{['archived', 'inactive', 'onboarding'].includes(r.client_status) && <span className="ml-1 capitalize">· {r.client_status}</span>}</div></div></div></td>
              <td className="tbl-cell"><span className="font-medium text-ink-primary">{lead.name}</span>{lead.notice && <span title={lead.notice} className="inline-flex ml-1"><AlertTriangle className="h-3 w-3 text-ink-secondary" aria-hidden="true" /><span className="sr-only">{lead.notice}</span></span>}</td>
              <td className="tbl-cell"><div className="flex flex-wrap gap-1">{r.frameworks?.length ? r.frameworks.map(f => <button key={f.key} onClick={() => enter(r, f.to)} className="portfolio-framework rounded border border-line bg-surface-subtle text-ink-secondary px-1.5 py-0.5 text-xs hover:bg-surface-hover" aria-label={`Open ${f.label} for ${r.name}`} title={`${f.label} applies. Open the framework workspace for recorded assessments and linked work.`}>{f.label}</button>) : <span className="text-xs text-ink-help">None selected</span>}</div></td>
              <td className="tbl-cell text-ink-help" title="The existing directory does not provide a complete open-work population.">—<span className="sr-only"> unavailable</span></td>
              <td className="tbl-cell"><button type="button" data-metric="significant_risks" className={`portfolio-metric gp-risk is-${r.significant_risks > 0 ? 'attention' : 'zero'}`} aria-label={`${r.name}: Significant Risks, ${r.significant_risks ?? 'unavailable'} items`} onClick={() => enter(r, '/risks?portfolio=significant')}>{r.significant_risks ?? '—'}</button></td>
              <td className="tbl-cell text-xs"><LastActivity activity={r.last_activity} /></td>
              <td className="tbl-cell"><div className="gp-row-actions"><button type="button" className="gp-open-portal" onClick={() => enter(r)} aria-label={`Open Portal for ${r.name}`}>Open Portal<ArrowRight size={14} aria-hidden="true"/></button><ClientRowMenu row={r} index={i} onOpen={() => enter(r)} onMetric={key => key === 'significant_risks' ? enter(r, '/risks?portfolio=significant') : openDrill(key, r)} onArchived={() => { load(); refreshClients(); }} canEdit={canManage} /></div></td>
            </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>
    </section>
    <Sheet open={!!drill} onOpenChange={open => {
      if (!open) closeDrill();
    }}><SheetContent className="w-full sm:max-w-4xl overflow-y-auto" data-testid="drill-dialog">
      <SheetHeader><SheetTitle>{drill?.title || 'Portfolio items'}</SheetTitle><SheetDescription>{drill?.items.length || 0} contributing items · opens authoritative records</SheetDescription></SheetHeader>
      <div className="overflow-x-auto mt-4"><table className="w-full text-sm"><thead><tr>{['Item', 'Type', 'Owner', 'Due', 'Status', 'Action'].map(t => <th key={t} scope="col" className="tbl-cell text-left">{t}</th>)}</tr></thead><tbody className="divide-y divide-line">
        {drill?.items.length === 0 && <tr><td colSpan={6} className="tbl-cell py-8 text-ink-secondary">No items contribute to this metric.</td></tr>}
        {drill?.items.map((item, i) => <tr key={item.key} data-testid={`drill-row-${i}`} data-record-key={item.key}>
          <td className="tbl-cell"><button onClick={() => openItem(item)} className="text-left text-ink-primary hover:underline">{item.title}</button></td>
          <td className="tbl-cell text-xs">{item.type}</td><td className="tbl-cell text-xs">{item.owner_name || 'Unassigned'}</td>
          <td className={`tbl-cell text-xs whitespace-nowrap ${item.overdue ? 'text-semantic-critical' : 'text-ink-secondary'}`}>{fmtDate(item.due_date)}{item.overdue && ' · overdue'}</td>
          <td className="tbl-cell text-xs capitalize">{(item.status || 'Not recorded').replaceAll('_', ' ')}</td>
          <td className="tbl-cell"><button onClick={() => openItem(item)} className="text-xs text-link whitespace-nowrap hover:underline">{actionLabel(item)}</button></td>
        </tr>)}
      </tbody></table></div>
    </SheetContent></Sheet>
    {selected && <RecordDrawer open kind={selected.kind} record={selected.record} clientId={selected.record.client_id} users={members} onSaved={load} onOpenChange={open => {
      if (!open) {
        recordRequest.current++;
        setSelected(null);
      }
    }} />}
  </div>;
}
// Latest meaningful lifecycle event. Quiet by default; flagged once the program has gone stale.
function LastActivity({ activity }) {
  const days = inactiveDays(activity);
  if (!activity) return <span className="portfolio-stale" title="No lifecycle event has been recorded. Logins and generic edits are excluded.">No activity recorded</span>;
  const stale = isStale(activity);
  return <time dateTime={activity.at} title={`${activity.label} · ${new Date(activity.at).toLocaleString()}`} className="block whitespace-nowrap">
    <span className={stale ? 'text-ink-primary' : 'text-ink-secondary'}>{fmtDate(activity.at)}</span>
    {stale && <span className="portfolio-stale block">{days}d inactive</span>}
    <span className="sr-only"> · {activity.label}{stale ? ` · no lifecycle activity for ${days} days (stale after ${STALE_AFTER_DAYS})` : ''}</span>
  </time>;
}
function ClientRowMenu({
  row,
  index,
  onOpen,
  onMetric,
  onArchived,
  canEdit
}) {
  const nav = useNavigate();
  async function setArchived(archived) {
    if (archived && !window.confirm(`Archive ${row.name}?`)) return;
    try {
      await api.patch(`/clients/${row.client_id}`, {
        expected_updated_at: row.updated_at ?? null,
        status: archived ? 'archived' : 'active'
      });
      toast.success(`${row.name} ${archived ? 'archived' : 'restored'}`);
      onArchived();
    } catch (e) {
      toast.error(formatError(e));
    }
  }
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" data-testid={`client-row-menu-${index}`} aria-label={`Actions for ${row.name}`} className="p-1 rounded hover:bg-surface-subtle text-ink-secondary"><MoreVertical className="h-4 w-4" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuItem onClick={onOpen}><ExternalLink className="h-3.5 w-3.5 mr-2" />Open client workspace</DropdownMenuItem>
      <DropdownMenuItem onClick={() => nav(`/admin/audit?client=${encodeURIComponent(row.client_id)}`)}><ScrollText className="h-3.5 w-3.5 mr-2" />View activity</DropdownMenuItem>
      <DropdownMenuSeparator />
      {METRICS.map(([key, label]) => <DropdownMenuItem key={key} data-metric={key} data-client-id={row.client_id} onClick={() => onMetric(key)} className={`gp-work-count is-${row[key] > 0 ? TONE[key] || 'neutral' : 'zero'}`}><span>{label}</span><span>{row[key] ?? '—'}</span></DropdownMenuItem>)}
      {canEdit && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setArchived(row.client_status !== 'archived')}><Archive className="h-3.5 w-3.5 mr-2" />{row.client_status === 'archived' ? 'Restore client' : 'Archive client'}</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
