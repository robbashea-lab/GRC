// A UI explanation only. The native server rechecks the current records and actor.
export function independentValidationIssue(actions,userId) {
  if(!actions.length||actions.some(task=>!['done','cancelled'].includes(task.status)))return 'Complete outstanding corrective work before independent validation.';
  const workers=[];
  for(const task of actions) {
    if(task.submission_history!=null&&!Array.isArray(task.submission_history))return 'Reconcile unknown legacy work submitter identities before validation.';
    for(const submission of task.submission_history||[])workers.push(submission?.by);
    if(task.status==='done'||task.completed_at||task.completed_by)workers.push(task.completed_by);
  }
  if(!workers.length||workers.some(worker=>typeof worker!=='string'||!worker.trim()))return 'Reconcile unknown legacy work submitter identities before validation.';
  if(workers.includes(userId)||actions.some(task=>(task.assignee_id||task.owner_id)===userId))return 'Validation requires a different account from every work submitter and current Action owner.';
  return null;
}

export function workSubmissionPatch(previous,changes,actorId,at) {
  if(changes.status!=='done'||previous.status==='done')return {};
  if(typeof actorId!=='string'||!actorId.trim())throw new Error('An authenticated worker is required.');
  if(previous.submission_history!=null&&!Array.isArray(previous.submission_history))throw new Error('Reconcile the retained work submission history before saving.');
  const history=(previous.submission_history||[]).map(entry=>({...entry}));
  if(previous.completed_by||previous.completed_at) {
    const prior={by:previous.completed_by??null,at:previous.completed_at??null};
    if(!history.some(entry=>entry.by===prior.by&&entry.at===prior.at))history.push(prior);
  }
  return {completed_by:actorId,completed_at:at,submission_history:[...history,{by:actorId,at}]};
}
