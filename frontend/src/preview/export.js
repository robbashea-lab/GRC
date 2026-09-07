export function exportDemoCsv(rows, kind) {
  const fields = [...new Set(rows.flatMap(Object.keys))].filter(k => !['content_base64'].includes(k));
  const cell = value => {
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = [fields.map(cell).join(','), ...rows.map(r => fields.map(k => cell(r[k])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {
    type: 'text/csv;charset=utf-8'
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `demo-${kind}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
