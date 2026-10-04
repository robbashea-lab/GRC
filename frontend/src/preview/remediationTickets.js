export function retainFinding(db,finding){
  const fid=finding.finding_id,cid=finding.client_id;
  if(finding.decision_history?.length||finding.closed_at||finding.validated_at||['closed','accepted','remediated'].includes(finding.status)
    ||db.comments.some(c=>['finding','findings'].includes(c.entity_type)&&c.entity_id===fid&&c.client_id===cid)
    ||db.logs.some(l=>l.entity_id===fid&&l.client_id===cid&&!['create','Finding raised'].includes(l.action))
    ||db.tasks.some(t=>t.finding_id===fid&&t.client_id===cid)
    ||db.evidence.some(e=>e.client_id===cid&&(['finding','findings'].includes(e.linked_type)&&e.linked_id===fid||e.relationships?.some(r=>r.kind==='findings'&&r.id===fid))))
    throw Object.assign(new Error('Findings with remediation or retained history must be preserved'),{status:409});
}
