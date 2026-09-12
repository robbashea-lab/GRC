// Presentation-only table operations. Never fetch data or modify records here.
export const EMPTY = '__empty__';
export const labelValue = value => String(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
export const ranks = { low: 1, medium: 2, moderate: 2, high: 3, critical: 4, immediate: 4 };
export const valueOf = (column, row) => column.value ? column.value(row) : row[column.key];
export const valuesOf = value => (Array.isArray(value) ? value : [value]).filter(v => v !== null && v !== undefined && v !== '').map(String);
export function calendarDay(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const n = Date.UTC(y, m - 1, d);
  const date = new Date(n);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? n : null;
}
export function dateMatches(value, range, now = new Date()) {
  const day = calendarDay(value);
  if (range === EMPTY) return day === null;
  if (day === null) return false;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (day - today) / 86400000;
  if (range === 'overdue') return delta < 0;
  if (range === 'today') return delta === 0;
  if (range === 'next7') return delta >= 0 && delta <= 7;
  if (range === 'next30') return delta >= 0 && delta <= 30;
  if (range === 'next90') return delta >= 0 && delta <= 90;
  if (range === 'next31_90') return delta >= 31 && delta <= 90;
  if (range === 'last30') return delta >= -30 && delta <= 0;
  if (range === 'last90') return delta >= -90 && delta <= 0;
  if (range === 'last12') return day >= Date.UTC(now.getFullYear() - 1, now.getMonth(), now.getDate()) && delta <= 0;
  return false;
}
export function reviewMatches(row, status) {
  const closed = ['completed', 'cancelled'].includes(row.status);
  const overdue = !closed && row.status !== 'needs_scheduling' && dateMatches(row.due_date, 'overdue');
  if (status === 'active') return !closed;
  if (status === 'all') return true;
  if (status === 'overdue') return overdue;
  if (status === 'upcoming') return row.status === 'upcoming' && !overdue;
  if (status === 'completed') return closed;
  return row.status === status;
}
export function dateOptions(column) {
  const options = column.dateKind === 'history'
    ? [['last30', 'Last 30 Days'], ['last90', 'Last 90 Days'], ['last12', 'Last 12 Months']]
    : [['overdue', 'Overdue'], ...(column.dateKind === 'due' ? [['today', 'Due Today'], ['next7', 'Next 7 Days']] : []), ['next30', 'Next 30 Days'], ['next31_90', 'Next 31–90 Days'], ...(column.renewal ? [['next90', 'Next 90 Days']] : [])];
  return [...options.map(([value, label]) => ({ value, label })), { value: EMPTY, label: column.emptyLabel || 'No Date' }];
}
export function columnOptions(column, rows) {
  if (column.dateKind) return dateOptions(column);
  const known = new Map((column.options || []).map(o => [String(o.value), o.label]));
  if (!column.optionsOnly) rows.forEach(r => valuesOf(valueOf(column, r)).forEach(v => { if (!known.has(v)) known.set(v, column.labelValue ? column.labelValue(v) : labelValue(v)); }));
  const options = [...known].map(([value, label]) => ({ value, label }));
  options.sort((a,b) => column.rank ? (column.rank[b.value] || 0) - (column.rank[a.value] || 0) : a.label.localeCompare(b.label, undefined, {numeric:true}));
  if (column.emptyLabel) options.push({ value: EMPTY, label: column.emptyLabel });
  return options;
}
export function applyTableFilters(rows, columns, state, now = new Date()) {
  const filters = state.filters || {};
  const filtered = rows.filter(row => columns.every(column => {
    const selected = filters[column.key];
    if (!selected?.length) return true;
    const value = valueOf(column, row);
    return selected.some(v => column.matches ? column.matches(row, v) : column.dateKind ? dateMatches(value, v, now) : v === EMPTY ? !valuesOf(value).length : valuesOf(value).includes(v));
  }));
  const column = columns.find(c => c.key === state.sort?.key);
  if (!column || column.sortable === false) return filtered;
  const direction = state.sort.dir === 'desc' ? -1 : 1;
  return [...filtered].sort((a,b) => {
    const rawA = valueOf(column,a), rawB = valueOf(column,b);
    const va = column.dateKind ? calendarDay(rawA) : rawA;
    const vb = column.dateKind ? calendarDay(rawB) : rawB;
    const emptyA = va === null || va === undefined || va === '', emptyB = vb === null || vb === undefined || vb === '';
    if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
    if (column.rank) return ((column.rank[va] || 0) - (column.rank[vb] || 0)) * direction;
    if (column.numeric || column.dateKind) return (Number(va) - Number(vb)) * direction;
    const label = v => column.labelValue ? column.labelValue(v) : (column.options || []).find(o => String(o.value) === String(v))?.label || String(v);
    return label(va).localeCompare(label(vb), undefined, {numeric:true,sensitivity:'base'}) * direction;
  });
}
