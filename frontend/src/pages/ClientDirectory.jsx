import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { grcLead } from '@/lib/clientRelationships';
import { tableColumns } from '@/lib/tableColumns';
import { portfolioOrder } from '@/lib/portfolioOverview';
import { usePortfolioView } from '@/lib/usePortfolioView';
import { loadPortfolioRecord } from '@/lib/portfolioRecord';
import { useTableControls, ColumnControl, TableFilterChips } from '@/components/TableControls';
import PageHeader from '@/components/PageHeader';
import RegisterSignalBar from '@/components/RegisterSignalBar';
import RecordDrawer from '@/components/RecordDrawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Search, MoreVertical, Archive, ExternalLink, ScrollText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import './Portfolio.css';
// Signals count clients, not items: each one narrows the table to the clients carrying that work.
const QUICK = [['past_due', 'Past due', 'critical'], ['critical_high_issues', 'Critical / high', 'critical'], ['significant_risks', 'Significant risks', 'moderate'], ['unassigned', 'Unassigned', 'moderate']];
const SIGNALS = QUICK.map(([id, label, tone]) => ({ id, label, tone, test: r => r[id] > 0 }));
// One line under each client: the authoritative program status and the work that drives it.
const STATUS = { action_required: ['Action required', 'critical'], needs_attention: ['Needs attention', 'moderate'], healthy: ['On track', 'success'] };
function statusReason(r) {
  const parts = [[r.past_due, 'past due'], [r.critical_high_issues, 'critical / high'], [r.unassigned, 'unassigned']].filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
  if (parts.length) return parts.slice(0, 2).join(' · ');
  return r.due_30d > 0 ? `${r.due_30d} due in 30 days` : 'No open issues';
}
const METRICS = [['past_due', 'Past Due'], ['due_30d', 'Due ≤30d'], ['critical_high_issues', 'Critical / High'], ['significant_risks', 'Significant Risks'], ['unassigned', 'Unassigned']];
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
  const scopeRows = rows.filter(r => !view.mine || r.grc_lead_id === user.user_id);
  const activeSignal = QUICK.map(([key]) => key).find(key => table.state.filters[key]?.includes('some'));
  // One signal at a time, like the register signal bars; the column menus still combine filters.
  const pickSignal = key => QUICK.forEach(([k]) => table.setFilter(k, k === key && activeSignal !== key ? ['some'] : []));
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
  return <div className="portfolio-overview">
    <PageHeader eyebrow="Platform" title="Portfolio" subtitle={`Where each client program needs attention, who leads it and what is due.${globalScope ? '' : ' Showing your authorized clients.'}`} />
    <div data-testid="client-directory-filters">
      <RegisterSignalBar signals={SIGNALS} rows={scopeRows} active={activeSignal} onPick={pickSignal} label="Clients requiring attention" testIdPrefix="client-filter-"
        describe={(s, n) => `${s.label}: ${n} ${n === 1 ? 'client' : 'clients'}`} />
    </div>
    <div className="register-toolbar flex-wrap">
      <div className="register-search relative">
        <Search aria-hidden="true" className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-help" />
        <Input aria-label="Search clients" data-testid="client-directory-search" placeholder="Search client, industry, lead…" value={view.search} onChange={e => update({
          search: e.target.value,
          scroll: 0
        })} className="pl-8 h-9 w-64 text-sm" />
      </div>
      {globalScope && <div className="quick-filters inline-flex gap-0.5" aria-label="Portfolio scope">
        {[[false, 'All Clients', 'all'], [true, 'Assigned to Me', 'assigned_to_me']].map(([mine, label, id]) => <button key={id} type="button" data-testid={`client-filter-${id}`} aria-pressed={view.mine === mine} onClick={() => update({
          mine,
          scroll: 0
        })} className={`px-2.5 h-8 rounded-md text-xs ${view.mine === mine ? 'bg-primary text-primary-foreground' : 'text-ink-secondary hover:bg-surface-subtle'}`}>{label}</button>)}
      </div>}
      <div className="flex items-center gap-3 text-xs">
        <ColumnControl table={table} columnKey="grc_lead_id" menuClassName="portfolio-column-menu" />
        <ColumnControl table={table} columnKey="frameworks" menuClassName="portfolio-column-menu" />
        <label className="inline-flex items-center gap-2 whitespace-nowrap text-ink-secondary"><input type="checkbox" checked={view.includeArchived} onChange={e => update({
            includeArchived: e.target.checked,
            scroll: 0
          })} data-testid="include-archived" />Include archived</label>
      </div>
    </div>
    <div className="page-gutter pb-5">
      <TableFilterChips table={table} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary py-2">
        <span>{loading ? 'Loading clients…' : `${filtered.length} ${filtered.length === 1 ? 'client' : 'clients'}${hasFilters ? ` · ${rows.length} available` : ''}`}</span>
        <span>{table.state.sort ? 'Sorted by column' : 'Most urgent first'}{hasFilters && <button onClick={clear} className="ml-3 underline underline-offset-2">Clear filters</button>}</span>
      </div>
      {error ? <div role="alert" className="border border-line rounded-lg p-5 text-sm">{error}<Button variant="outline" size="sm" onClick={load} className="ml-3">Retry</Button></div> : <div className="register-table-frame bg-surface-card border border-line rounded-lg overflow-x-auto" data-testid="client-portfolio-table" tabIndex={0} role="region" aria-label="Client portfolio, scroll horizontally for additional columns">
        <table className="portfolio-table w-full text-sm">
          <caption className="sr-only">Authorized client GRC priorities. Critical / High counts open Findings and standalone high-priority Actions; Risks are counted separately.</caption>
          <thead><tr>{columns.map(c => <th key={c.key} scope="col" aria-sort={table.state.sort?.key === c.key ? table.state.sort.dir === 'asc' ? 'ascending' : 'descending' : undefined} className={`tbl-cell font-medium ${c.numeric ? 'text-right' : 'text-left'}`}><ColumnControl table={table} column={c} menuClassName="portfolio-column-menu" /></th>)}<th scope="col" className="tbl-cell"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-line">
            {loading ? <tr><td colSpan={10} className="tbl-cell py-8 text-center text-ink-secondary">Loading directory…</td></tr> : filtered.length === 0 ? <tr><td colSpan={10} className="tbl-cell py-8 text-center text-ink-secondary">
              <p>{view.mine ? 'No clients are currently assigned to you.' : rows.length ? 'No clients match the current filters.' : 'No clients are currently available to you.'}</p>
              {hasFilters && <button onClick={clear} className="mt-2 underline underline-offset-2">Clear filters</button>}
              {canManage && <button onClick={() => nav('/admin/clients')} className="ml-3 mt-2 underline underline-offset-2">Client Management →</button>}
            </td></tr> : filtered.map((r, i) => {
              const lead = grcLead(r);
              return <tr key={r.client_id} className="row-hover" data-testid={`client-row-${i}`} data-client-id={r.client_id}>
              <td className="tbl-cell"><button onClick={() => enter(r)} data-testid={`client-open-${r.client_id}`} className="text-left hover:underline underline-offset-2 font-medium text-ink-primary">{r.name}</button><div className="text-xs text-ink-secondary">{r.industry || '—'}{['archived', 'inactive', 'onboarding'].includes(r.client_status) && <span className="ml-1 capitalize">· {r.client_status}</span>}</div>
                {STATUS[r.program_status] && <div className={`portfolio-status is-${STATUS[r.program_status][1]}`} data-testid={`client-status-${r.client_id}`}><span className="portfolio-status-label">{STATUS[r.program_status][0]}</span><span className="portfolio-status-reason">{statusReason(r)}</span></div>}</td>
              <td className="tbl-cell"><span className="font-medium text-ink-primary">{lead.name}</span>{lead.notice && <span title={lead.notice} className="inline-flex ml-1"><AlertTriangle className="h-3 w-3 text-ink-secondary" aria-hidden="true" /><span className="sr-only">{lead.notice}</span></span>}</td>
              <td className="tbl-cell"><div className="flex flex-wrap gap-1">{r.frameworks?.length ? r.frameworks.map(f => <button key={f.key} onClick={() => enter(r, f.to)} className="portfolio-framework rounded border border-line bg-surface-subtle text-ink-secondary px-1.5 py-0.5 text-xs hover:bg-surface-hover" aria-label={`Open ${f.label} for ${r.name}`} title={`${f.label} applies. Open the framework workspace for recorded assessments and linked work.`}>{f.label}</button>) : <span className="text-xs text-ink-help">None selected</span>}</div></td>
              {METRICS.map(([key, label]) => <td key={key} className="tbl-cell text-right"><button type="button" data-metric={key} aria-label={`${r.name}: ${label}, ${r[key] ?? 'unavailable'} items`} className={`portfolio-metric font-mono tabular-nums font-medium underline-offset-2 hover:underline ${r[key] > 0 ? ['past_due', 'critical_high_issues'].includes(key) ? 'text-semantic-critical' : key === 'unassigned' ? 'text-semantic-duesoon-text' : 'text-ink-primary' : 'text-ink-help'}`} onClick={() => key === 'significant_risks' ? enter(r, '/risks?portfolio=significant') : openDrill(key, r)}>{r[key] ?? '—'}</button></td>)}
              <td className="tbl-cell text-xs text-ink-secondary">{r.last_activity ? <time dateTime={r.last_activity.at} title={`${r.last_activity.label} · ${new Date(r.last_activity.at).toLocaleString()}`}>{fmtDate(r.last_activity.at)}<span className="sr-only"> · {r.last_activity.label}</span></time> : <span title="No supported lifecycle event has been recorded. Generic edits and logins are excluded.">Not recorded</span>}</td>
              <td className="tbl-cell"><ClientRowMenu row={r} index={i} onOpen={() => enter(r)} onArchived={() => { load(); refreshClients(); }} canEdit={canManage} /></td>
            </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>
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
function ClientRowMenu({
  row,
  index,
  onOpen,
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
      {canEdit && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setArchived(row.client_status !== 'archived')}><Archive className="h-3.5 w-3.5 mr-2" />{row.client_status === 'archived' ? 'Restore client' : 'Archive client'}</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
