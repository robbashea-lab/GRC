// Explicitly local demo counterpart of the server's atomic tenant counter.
export function initializeRiskIds(db) {
  db.riskSequences ||= {};
  const clients = new Set((db.risks || []).map(r=>r.client_id));
  for (const cid of clients) {
    const rows = db.risks.filter(r=>r.client_id===cid).sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||'') || a.risk_id.localeCompare(b.risk_id));
    let sequence = Math.max(db.riskSequences[cid] || 0, ...rows.map(r=>Number(/^RISK-(\d{3,})$/.exec(r.display_id||'')?.[1] || 0)));
    for (const row of rows) if (!/^RISK-\d{3,}$/.test(row.display_id||'')) {
      row.legacy_display_id = row.display_id || row.risk_id.slice(-6).toUpperCase();
      row.display_id = `RISK-${String(++sequence).padStart(3,'0')}`;
    }
    db.riskSequences[cid] = sequence;
  }
  return db;
}
export function allocateRiskId(db,cid) {
  initializeRiskIds(db);
  db.riskSequences[cid] = (db.riskSequences[cid] || 0) + 1;
  return `RISK-${String(db.riskSequences[cid]).padStart(3,'0')}`;
}
