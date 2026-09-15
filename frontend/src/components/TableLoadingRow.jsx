// One quiet loading treatment for registers. No invented rows or moving skeletons.
export default function TableLoadingRow({ colSpan }) {
  return <tr><td colSpan={colSpan} className="tbl-cell text-center text-ink-help py-10">
    <span role="status" className="table-loading-state">Loading…</span>
  </td></tr>;
}
