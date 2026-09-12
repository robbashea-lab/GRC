import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { applyTableFilters, columnOptions } from '@/lib/tableFilters';

// In-memory session preferences: no owner IDs in URLs or durable browser storage.
// A changed tenant/account resets every module's state before rendering its controls.
const sessions = new Map();
let activeScope;
let generation = 0;
export function useTableControls({ columns, rows, module, scope, onFilterChange }) {
  if (activeScope !== scope) { sessions.clear(); activeScope = scope; generation++; }
  const key = `${generation}:${scope}:${module}`;
  const [local, setLocal] = useState(() => ({ key, state: sessions.get(key) || { filters: {} } }));
  const state = local.key === key ? local.state : sessions.get(key) || { filters: {} };
  const update = next => { sessions.set(key, next); setLocal({ key, state: next }); };
  const setFilter = (columnKey, values) => {
    const filters = { ...state.filters };
    if (values.length) filters[columnKey] = values; else delete filters[columnKey];
    update({ ...state, filters }); onFilterChange?.(columnKey, values);
  };
  const clear = () => { update({ filters: {} }); onFilterChange?.(null, []); };
  return { columns, state, setFilter, clear, total: rows.length,
    setSort: (key, dir) => update({ ...state, sort: key ? { key, dir } : null }),
    apply: data => applyTableFilters(data, columns, state),
    options: column => columnOptions(column, rows),
  };
}

export function ColumnControl({ table, column: supplied, columnKey }) {
  const [query, setQuery] = useState('');
  const c = supplied || table.columns.find(c => c.key === columnKey);
  if (!c) return null;
  const selected = table.state.filters[c.key] || [];
  const sorting = table.state.sort?.key === c.key;
  const options = c.filter ? table.options(c) : [];
  const labels = c.rank || c.numeric ? ['Lowest First', 'Highest First'] : c.dateKind === 'history' ? ['Oldest', 'Most Recent'] : c.dateKind === 'due' ? ['Soonest Due', 'Furthest Due'] : c.dateKind ? ['Soonest', 'Furthest'] : ['A → Z', 'Z → A'];
  return <DropdownMenu modal={false} onOpenChange={() => setQuery('')}>
    <DropdownMenuTrigger asChild><button type="button" aria-label={`${c.label}: sort and filter`} className={`inline-flex items-center gap-1 whitespace-nowrap rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 normal-case tracking-normal ${selected.length || sorting ? 'text-ink-primary underline decoration-slate-400 underline-offset-4' : 'hover:text-ink-primary'}`}>
      {c.label}<ChevronDown aria-hidden="true" className={`h-3 w-3 ${selected.length || sorting ? 'opacity-100' : 'opacity-40'}`} />
    </button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56 max-h-80" aria-label={`${c.label} options`}>
      <DropdownMenuLabel>{c.label}</DropdownMenuLabel>
      {c.sortable !== false && <>{['asc','desc'].map((dir,i) => <DropdownMenuCheckboxItem key={dir} checked={sorting && table.state.sort.dir === dir} onCheckedChange={() => table.setSort(c.key,dir)}>{labels[i]}</DropdownMenuCheckboxItem>)}{sorting && <DropdownMenuItem onSelect={() => table.setSort(null)}>Reset sort</DropdownMenuItem>}<DropdownMenuSeparator /></>}
      {options.length > 20 && <input aria-label={`Find ${c.label} options`} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation(); }} className="m-1 w-[calc(100%-8px)] rounded border border-line p-2 text-sm" placeholder="Find an option…" />}
      {options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())).slice(0,100).map(o => <DropdownMenuCheckboxItem key={o.value} checked={selected.includes(o.value)} onSelect={e => e.preventDefault()} onCheckedChange={() => table.setFilter(c.key, selected.includes(o.value) ? selected.filter(v => v !== o.value) : [...selected,o.value])}>{o.label}</DropdownMenuCheckboxItem>)}
      {options.length > 100 && <div className="px-2 py-1 text-xs text-ink-help">Search to narrow the available options.</div>}
      {!!selected.length && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => table.setFilter(c.key,[])}>Clear {c.label}</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
export function TableFilterChips({ table }) {
  const chips = table.columns.flatMap(c => (table.state.filters[c.key] || []).map(value => ({ column:c, value, label:table.options(c).find(o => o.value === value)?.label || 'Unavailable value' })));
  if (!chips.length) return null;
  return <div aria-label="Active table filters" className="flex flex-wrap items-center gap-2 py-2 text-xs text-ink-secondary">
    <span>Filters:</span>{chips.map(({ column:c,value,label }) => <button key={`${c.key}:${value}`} type="button" onClick={() => table.setFilter(c.key,table.state.filters[c.key].filter(v => v !== value))} aria-label={`Remove ${c.label}: ${label}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-card px-2 py-1 hover:bg-surface-subtle">{c.label}: {label}<X className="h-3 w-3" aria-hidden="true" /></button>)}
    <button type="button" onClick={table.clear} className="underline underline-offset-2">Clear all</button>
  </div>;
}
export function FilterEmpty({ table, name, onClear }) {
  if (table.total === 0) return <div>No {name} have been added yet.</div>;
  return <div>No {name} match the current filters. <button type="button" className="underline underline-offset-2" onClick={() => { table.clear(); onClear?.(); }}>Clear filters</button></div>;
}
