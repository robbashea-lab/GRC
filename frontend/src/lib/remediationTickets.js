// Non-destructive compatibility: identity never depends on lifecycle or row order.
export function ticketRecords(records,clientId) {
  const findings=(records.findings||[]).filter(f=>f.client_id===clientId);
  const tasks=(records.tasks||[]).filter(t=>t.client_id===clientId);
  const byFinding=new Map(findings.map(f=>[f.finding_id,[]]));
  for(const task of tasks)byFinding.get(task.finding_id)?.push(task);
  return [
    ...findings.map(finding=>{
      const actions=byFinding.get(finding.finding_id);
      const primary=finding.primary_task_id?actions.find(t=>t.task_id===finding.primary_task_id):actions.length===1?actions[0]:null;
      const diagnostic=finding.primary_task_id&&!primary?'Primary Action unavailable':!primary&&actions.length>1?'Multiple Actions — primary not recorded':!actions.length?'No Action linked':null;
      return {ticketId:'finding:'+finding.finding_id,kind:'findings',raw:finding,finding,actions,primary,diagnostic,
        title:primary?.title||finding.remediation_title||finding.title,issue:finding.description||'',
        owner_id:primary?primary.assignee_id??primary.owner_id:finding.owner_id,
        due_date:primary?primary.due_date:finding.due_date,
        resolution:primary?.resolution||'',priority:primary?.priority||finding.severity};
    }),
    ...tasks.filter(t=>!byFinding.has(t.finding_id)).map(task=>({ticketId:'task:'+task.task_id,kind:'tasks',raw:task,primary:task,actions:[task],
      title:task.title,issue:'',owner_id:task.assignee_id??task.owner_id,due_date:task.due_date,
      resolution:task.resolution||'',priority:task.priority,diagnostic:task.finding_id?'Linked Finding unavailable':null})),
  ];
}

export function ticketStage(ticket) {
  const active=ticket.actions.filter(t=>!['done','cancelled'].includes(t.status));
  // Inconsistent historical closure never hides outstanding work.
  if(active.some(t=>t.status==='blocked'))return 'blocked';
  if(active.some(t=>t.status==='in_progress'||t.started_at))return 'in_progress';
  if(active.length)return 'open';
  if(ticket.finding?.status==='accepted')return 'accepted';
  if(ticket.finding){
    if(ticket.finding.status==='closed')return 'completed';
    if(ticket.finding.status==='remediated')return 'pending_validation';
    return 'open';
  }
  return ticket.raw.status==='cancelled'?'cancelled':ticket.raw.status==='done'?'completed':'open';
}
