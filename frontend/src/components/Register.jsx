import { Plus, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ColumnControl } from './TableControls';

// Shared register primitives (docs/client-section-design-system.md). Pages keep their own filters
// and domain logic; the grammar — where things sit and how they look — comes from here.

// Header actions: secondary actions first, the page's single primary action last (rightmost).
export function HeaderActions({ children }) {
  return <div className="header-actions">{children}</div>;
}

// The page's primary action. One per page, always "New <Record>" (or the repository's verb).
export function PrimaryAction({ label, onClick, testid, icon: Icon = Plus, ...props }) {
  return <Button type="button" onClick={onClick} data-testid={testid} {...props}><Icon aria-hidden="true" />{label}</Button>;
}

// Subordinate actions: export, reference material, navigation to a related page.
export function SecondaryAction({ label, onClick, testid, icon: Icon, children, ...props }) {
  return <Button type="button" variant="outline" onClick={onClick} data-testid={testid} {...props}>{Icon && <Icon aria-hidden="true" />}{label}{children}</Button>;
}

// Search: same position (first in the toolbar), size and icon on every register and repository.
export function SearchField({ value, onChange, label, placeholder = 'Search…', testid, inputProps = {} }) {
  return <div className="register-search relative">
    <Search aria-hidden="true" className="register-search-icon" />
    <Input aria-label={label} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} data-testid={testid} className="pl-8" {...inputProps} />
  </div>;
}

// Lifecycle or status views with their counts. One view is pressed at a time; counts are the
// register's summary, so pages do not repeat them in cards.
export function ViewTabs({ views, active, onPick, counts, label, testid, testIdPrefix }) {
  return <div className="quick-filters inline-flex items-center" role="group" aria-label={label} data-testid={testid}>
    {views.map(view => <button key={view.id} type="button" aria-pressed={active === view.id} onClick={() => onPick(view.id)}
      data-testid={testIdPrefix ? testIdPrefix + view.id : undefined}>
      {view.label}{counts && <span>{counts[view.id] ?? 0}</span>}
    </button>)}
  </div>;
}

// "Shown / total", right-aligned at the end of the toolbar.
export function RegisterCount({ shown, total, testid }) {
  return <div className="register-count" data-testid={testid}>{shown} / {total}</div>;
}

// Column header: the shared sort-and-filter control, with the sort state announced on the cell.
export function sortState(table, key) {
  const sort = table.state.sort;
  return sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
}
export function SortableHeader({ table, columnKey, column, className = '', ...props }) {
  return <th scope="col" className={`tbl-head ${className}`.trim()} aria-sort={sortState(table, column?.key || columnKey)} {...props}>
    <ColumnControl table={table} columnKey={columnKey} column={column} />
  </th>;
}
