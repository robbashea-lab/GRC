import { Button } from '@/components/ui/button';

export default function TablePagination({ page, onPageChange, total, pageSize = 25 }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Table pages" className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-secondary">
    <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}` : '0'} of {total}</span>
    <div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
      <span>Page {page} of {pages}</span><Button type="button" size="sm" variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</Button></div>
  </nav>;
}
