import {recordUuid} from '../lib/recordUuid.js';
import {nativeReviewType} from '../preview/approvedV3Work.js';

const fields={reviews:'review_id',tasks:'task_id',findings:'finding_id',evidence:'evidence_id',risks:'risk_id',vendors:'vendor_id',policies:'policy_id',ai_systems:'ai_system_id',assets:'asset_id',framework_assessments:'framework_assessment_id'};
const programKeys={cis:'cis-ig1',soc:'soc-2',iso:'iso-27001',hipaa:'hipaa',nist:'nist-csf-2',cmmc:'cmmc'};
const fileKinds={Review:'reviews','Action item':'tasks',Finding:'findings',Policy:'policies',Vendor:'vendors',Risk:'risks','AI system':'ai_systems',Asset:'assets','Framework requirement':'framework_assessments'};
const sourceActionStatus={Open:'open','In progress':'in_progress',Blocked:'blocked',Cancelled:'cancelled'};
const recurring={'':'annual',A:'annual',Y:'annual',M:'monthly',Q:'quarterly',S:'semiannual','1':'none'};
const entityPath=(kind,id)=>'/'+kind+'/'+encodeURIComponent(id);
function rawDate(value) {
  if (!value) return null;
  if (value instanceof Date) return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),
    String(value.getDate()).padStart(2,'0')].join('-');
  return (value.$date || value).slice(0,10);
}
const list=row=>row || [];
const text=value=>typeof value==='string' ? value.trim() : '';
const keyText=value=>text(value).replace(/\s+/g,' ');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const allTasks=work=>[...list(work.acts),...list(work.done)];

export function cadencePatch(value) {
  if (Object.hasOwn(recurring,value)) return {recurrence:recurring[value],custom_recurrence_days:null};
  const days=value?.unit==='days' ? Number(value.interval) : Number(/^D:(\d+)$/.exec(value)?.[1]);
  if (Number.isInteger(days) && days>0 && days<=3660) return {recurrence:'custom',custom_recurrence_days:days};
  throw Error('Choose a supported review recurrence before saving.');
}

// The server owns checklist IDs and template versions. A visual step must match unambiguously.
export function nativeReviewCompletion(guide, details, occurrenceId) {
  if (!guide.contract_token || guide.occurrence_id!==occurrenceId) throw Error('The review occurrence changed. Reload its guide.');
  const supplied=details.checklist?.steps || [];
  const used=new Set();
  const results=(guide.steps || []).map(step=>{
    const matches=supplied.filter(item=>item.step_id===step.step_id
      ? !keyText(item.t || item.text) || keyText(item.t || item.text)===keyText(step.text)
      : !item.step_id && keyText(item.t || item.text)===keyText(step.text));
    if (matches.length!==1 || used.has(matches[0])) throw Error('Complete the current native checklist step: '+step.text);
    const answer=matches[0],reason=text(answer.note || answer.reason);
    if (!['Pass','Exception','N/A','NMI'].includes(answer.result) || (answer.result!=='Pass' && !reason)) {
      throw Error('Record a result and the required explanation for '+step.text);
    }
    used.add(answer);
    return {step_id:step.step_id,result:answer.result,reason};
  });
  if (used.size!==supplied.length) throw Error('The supplied checklist differs from the current review template. Reload the guide.');
  const riskAssessment=details.assessment && details.outcome==='Risk review recorded';
  if(riskAssessment && results.some(step=>step.result==='Exception')) throw Error('Record exception follow-up through the review before changing the risk rating.');
  const outcome=riskAssessment ? 'No exceptions noted' : details.outcome;
  if (!['No exceptions noted','Exceptions noted'].includes(outcome)) throw Error('Select a review outcome before completing it.');
  const body={occurrence_id:occurrenceId,expected_updated_at:guide.expected_updated_at ?? null,
    outcome,completion_notes:details.notes || '',
    checklist:{contract_token:guide.contract_token,results},supporting_reference:text(details.supportingReference)};
  if (details.assessment) {
    const {L,I,note}=details.assessment;
    if (![L,I].every(n=>Number.isInteger(Number(n)) && Number(n)>=1 && Number(n)<=5)) throw Error('Supply both risk ratings on the 1–5 scale.');
    body.risk_assessment={likelihood_score:Number(L),impact_score:Number(I),assessment_rationale:text(note)};
  }
  // Specialized Reviews require explicit operator input in addition to the common checklist.
  for (const key of ['conclusion','tested_period','tested_scope','no_evidence_reason','checklist_confirmed','risk_outcome','risk_next_review']) {
    if (Object.hasOwn(details,key)) body[key]=details[key];
  }
  return body;
}

function readFile(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(Error('The selected evidence file could not be read.'));
    reader.onabort=()=>reject(Error('Reading the selected evidence file was cancelled.'));
    reader.readAsDataURL(file);
  });
}

/** Run one client-scoped visual change through native application commands. Callers retain
 * pendingRequests across an uncertain response and discard it when the interaction settles. */
export async function applyWorkChanges({before,after,records,clientId,sourceId,api,identityMaps={},userIds={},commands=[],
  files=new Map(),pendingRequests=new Map(),handled:priorHandled={}}) {
  const previous=before.work?.[sourceId] || {},current=after.work?.[sourceId] || {};
  const handled=Object.fromEntries(['reviews','findings','tasks','evidence'].map(k=>[k,[...(priorHandled[k] || [])]]));
  const scoped=Object.fromEntries(Object.keys(fields).map(kind=>[kind,list(records[kind]).filter(r=>r.client_id===clientId).map(row=>({...row}))]));
  const maps=(identityMaps.recordIds ||= Object.create(null))[clientId] ||= Object.create(null);
  const previousTasks=allTasks(previous),currentTasks=allTasks(current);
  let didWrite=false;
  const getMemo=key=>pendingRequests instanceof Map ? pendingRequests.get(key) : pendingRequests[key];
  const saveMemo=(key,val)=>{if(pendingRequests instanceof Map)pendingRequests.set(key,val);else pendingRequests[key]=val;};
  function remember(kind,id,row) {
    const nativeId=row?.[fields[kind]];
    if (!nativeId || (row.client_id && row.client_id!==clientId)) throw Error('The saved native record could not be matched to this client. Reload before continuing.');
    (maps[kind] ||= Object.create(null))[id]=nativeId;
    const idx=scoped[kind].findIndex(x=>x[fields[kind]]===nativeId);
    if (idx>=0) scoped[kind][idx]={...scoped[kind][idx],...row};
    else scoped[kind].push({...row,client_id:clientId});
    for(const value of [id,nativeId]) if (!handled[kind].includes(value)) handled[kind].push(value);
    return row;
  }
  function locate(kind,raw) {
    if (!raw) return null;
    const id=typeof raw==='string' ? raw : raw.id;
    const candidate=typeof raw==='object' && raw.nativeId || maps[kind]?.[id] || id;
    return scoped[kind].find(row=>row[fields[kind]]===candidate || row.source_record_id===id);
  }
  function must(kind,raw) {
    const row=locate(kind,raw);
    if (!row) throw Error('The selected '+kind+' record is unavailable in this client. Reload the workspace.');
    return row;
  }
  function owner(value) {
    if (!value || value==='Unassigned' || value==='—') return null;
    const users=list(records.users);
    const matches=users.filter(u=>u.name===value || u.email===value || u.user_id===value);
    if(matches.length===1) return matches[0].user_id;
    const mapped=userIds[value] || identityMaps.userIds?.[String(value).toLowerCase()];
    if(mapped && (!users.length || users.some(u=>u.user_id===mapped))) return mapped;
    throw Error('Choose an active native assignee for '+value+'.');
  }
  function assessmentFor(item) {
    if (!item?.fromItem) return null;
    const k=String(item.fromProgram || '').split('|').at(-1).split(':')[0];
    const matches=scoped.framework_assessments.filter(r=>r.definition_id===item.fromItem && (!k || r.framework_key===(programKeys[k] || k)));
    if(matches.length!==1) throw Error('Select the native framework requirement for '+item.fromItem+'.');
    return matches[0];
  }
  function linkedAssessmentItem(task,assessment) {
    if(!assessment || !task) return null;
    const sourceItems=Object.entries(after.ita || {}).filter(([key])=>{
      const [cid,program,ref]=key.split('|');
      return cid===sourceId && ref===assessment.definition_id && programKeys[program?.split(':')[0]]===assessment.framework_key;
    }).flatMap(([,items])=>items).filter(i=>i.act===task.id);
    if(!sourceItems.length) return null;
    const key=String(sourceItems[0].id);
    const native=(assessment.items_to_address || []).filter(i=>i.source_record_id===key || i.request_id==='approved_v3_item_'+key || i.item_id===key);
    if(sourceItems.length!==1 || native.length!==1) throw Error('The linked assessment item changed. Reload the requirement before creating work.');
    return native[0];
  }
  async function request(method,path,logicalKey,prepare,{bodyId=false}={}) {
    const key=JSON.stringify(['approved-v3-work',clientId,method,path,logicalKey]);
    let entry=getMemo(key);
    if (!entry) {
      const body=await prepare();
      const requestId=recordUuid();
      entry={id:requestId,body:bodyId ? {...body,request_id:requestId} : body};
      saveMemo(key,entry);
    }
    if (!entry.acknowledged) {
      try {
        const response=await api[method](path,entry.body,{headers:{'Idempotency-Key':entry.id}});
        entry.data=response.data;entry.acknowledged=true;
      } catch(error) {
        if(error?.response?.headers?.['x-create-rejected']==='true') {
          if(pendingRequests instanceof Map)pendingRequests.delete(key);else delete pendingRequests[key];
        }
        throw error;
      }
    }
    didWrite=true;
    return entry.data;
  }
  function currentOccurrence(row,sourceReview,selection) {
    if (selection && sourceReview?.occurrenceId && selection!==sourceReview.occurrenceId) {
      throw Error('The selected review occurrence changed. Reopen the review before saving.');
    }
    const id=row.current_occurrence_id || 'occ_'+row.review_id;
    const selected=sourceReview?.nativeOccurrenceId || maps.occurrences?.[selection];
    if (selected && selected!==id) throw Error('The native review has advanced to a different occurrence. Reload before saving.');
    return id;
  }
  const workCommands=commands.filter(command=>command.args?.[0]===sourceId);
  const oldFiles=new Set(list(before.files).filter(f=>f.clientId===sourceId).map(f=>f.id));
  const newFiles=list(after.files).filter(f=>f.clientId===sourceId && f.id && !oldFiles.has(f.id));
  // The approved requirement drawer and the Library register form save into their own rows.
  // Resolve those forms' explicit links as well as the occurrence attachments above.
  const oldLines=new Set((before.evidence?.[sourceId]?.rows || '').split('\n'));
  for(const line of (after.evidence?.[sourceId]?.rows || '').split('\n')) {
    if(!line || oldLines.has(line))continue;
    const [name,meta,type,kind,subject,,,,origin,rawId]=line.split('^');
    if(meta!=='v1 · new' || newFiles.some(ref=>rawId && rawId===ref.id))continue;
    let recordId,descriptor={};
    if(kind==='Framework requirement' && origin==='framework-projection' && rawId) {
      const matches=Object.entries(after.itemExtra || {}).filter(([key,items])=>key.split('|')[0]===sourceId && Array.isArray(items) && items.some(item=>item.id===rawId));
      if(matches.length!==1)throw Error('Select the exact framework requirement for the evidence.');
      recordId=matches[0][0];descriptor=matches[0][1].find(item=>item.id===rawId);
    } else if(['Vendor','Policy'].includes(kind)) {
      const table=fileKinds[kind],exact=locate(table,subject);
      const matches=exact ? [exact] : scoped[table].filter(row=>row.name===subject || row.title===subject);
      if(matches.length!==1)throw Error('Select an unambiguous native '+kind.toLowerCase()+' from this client.');
      recordId=matches[0][fields[table]];
    } else continue;
    newFiles.push({...descriptor,id:rawId || [kind,recordId,name,meta].join('|'),clientId:sourceId,kind,recordId,name,type});
  }
  const selectedFiles=new Map();
  for(const ref of newFiles.filter(ref=>!handled.evidence.includes(ref.id))) {
    const file=files.get?.(ref.id) || files.get?.(ref.name);
    if (!file || file.name!==ref.name || !(file instanceof Blob)) {
      throw Error('Select the actual file '+ref.name+' to save this evidence in the native library.');
    }
    selectedFiles.set(ref.id,file);
  }
  for(const item of list(current.revs)) {
    if(list(previous.revs).some(r=>r.id===item.id) || handled.reviews.includes(item.id))continue;
    if(item.link?.kind==='risk') {
      const riskId=locate('risks',item.link.id)?.risk_id;
      const completed=riskId && workCommands.find(c=>c.name==='completeReview' && c.args[2]?.assessment && locate('reviews',c.args[1])?.risk_id===riskId);
      if(completed && workCommands.some(c=>c.name==='saveRecordSchedule' && c.args[1]==='risk' && c.args[2]===item.link.id)) {
        remember('reviews',item.id,must('reviews',completed.args[1]));
        continue; // The native completion command advances the same series even for a new one-time date.
      }
    }
    if(item.onb || (item.link && item.link.kind!=='policy')) {
      throw Error('Reload the originating schedule before saving its new review.');
    }
    const policy=item.link?.kind==='policy' ? must('policies',item.link.id) : null;
    const retained=policy && scoped.reviews.find(r=>r.policy_id===policy.policy_id && !['completed','cancelled'].includes(r.status));
    if(retained) {
      if(retained.title!==item.title || rawDate(item.due)?.slice(0,10)!==retained.due_date?.slice(0,10)) {
        throw Error('An active native review already exists for this policy. Reload its schedule before saving.');
      }
      remember('reviews',item.id,retained);
    }else{
      const body={client_id:clientId,title:item.title,review_type:policy?'policy':nativeReviewType(item.type),owner_id:owner(item.owner),
        scope:item.description || '',due_date:rawDate(item.due),...cadencePatch(item.cad)};
      if(item.basis)body.governance_context={rationale:item.basis};
      if(policy)body.policy_id=policy.policy_id;
      remember('reviews',item.id,await request('post','/reviews',['new-review',item.id],()=>body));
    }
  }
  const newFindings=list(current.findings).filter(f=>!list(previous.findings).some(old=>old.id===f.id) && !handled.findings.includes(f.id));
  for(const finding of newFindings) {
    const children=currentTasks.filter(t=>t.findingId===finding.id || finding.actionIds?.includes(t.id));
    const action=children[0], reviewId=finding.fromRev || action?.fromRev, review=reviewId && must('reviews',reviewId);
    const assessment=assessmentFor(finding.fromItem ? finding : action);
    if(!action?.title || !finding.title) throw Error('A finding requires both a finding title and a corrective action title.');
    const body={title:finding.title,remediation_title:action.title,owner_id:owner(action.owner),due_date:rawDate(action.due)};
    if(finding.severity) body.severity=String(finding.severity).toLowerCase();
    if(finding.description || action.detail) body.description=finding.description || action.detail;
    let path;
    if(review) {
      const prior=list(previous.revs).find(r=>r.id===reviewId);
      path=entityPath('reviews',review.review_id)+'/create-finding';
      body.occurrence_id=currentOccurrence(review,prior,finding.fromOccurrence || action.fromOccurrence || prior?.occurrenceId);
      body.expected_updated_at=review.updated_at ?? null;
    }else if(assessment) {
      path=entityPath('framework_assessments',assessment.framework_assessment_id)+'/findings';
      const linkedItem=linkedAssessmentItem(action,assessment);
      if(linkedItem)body.item_id=linkedItem.item_id;
    }
    else throw Error('Choose an originating review or framework requirement before recording this finding.');
    const saved=await request('post',path,['new-finding',finding.id],()=>body,{bodyId:true});
    remember('findings',finding.id,saved);
    const child=saved.primary_task_id ? {task_id:saved.primary_task_id,client_id:clientId} :
      await request('post',entityPath('findings',saved.finding_id)+'/create-task',['primary-action',finding.id],()=>({title:action.title}));
    remember('tasks',action.id,child);
  }

  for(const item of currentTasks.filter(t=>!previousTasks.some(old=>old.id===t.id) && !handled.tasks.includes(t.id))) {
    if (!item.title) throw Error('Enter a title for the new action.');
    if(item.st && item.st!=='Open') throw Error('Create the action first, then use its native work-completion command.');
    const assessment=assessmentFor(item);
    const linkedItem=linkedAssessmentItem(item,assessment);
    if(linkedItem) {
      const body={title:item.title,description:item.detail || '',assignee_id:owner(item.owner),priority:String(item.pri || 'medium').toLowerCase(),
        due_date:rawDate(item.due),expected_revision:assessment.items_revision || 0};
      const path=entityPath('framework_assessments',assessment.framework_assessment_id)+'/items/'+encodeURIComponent(linkedItem.item_id)+'/task';
      remember('tasks',item.id,await request('post',path,['assessment-item-action',item.id],()=>body));
      continue;
    }
    const body={client_id:clientId,title:item.title,assignee_id:owner(item.owner),due_date:rawDate(item.due),
      description:item.detail || item.origin || '',priority:String(item.pri || 'medium').toLowerCase(),status:'open'};
    if(item.findingId) {
      const finding=must('findings',item.findingId);
      Object.assign(body,{source_type:'finding',source_id:finding.finding_id,finding_id:finding.finding_id});
    }else if(item.vendorId) {
      const vendor=must('vendors',item.vendorId);
      Object.assign(body,{source_type:'vendor',source_id:vendor.vendor_id,vendor_id:vendor.vendor_id});
    }else if(item.fromRev) {
      const review=must('reviews',item.fromRev);
      Object.assign(body,{source_type:'review',source_id:review.review_id,review_id:review.review_id});
    }else if(item.source && !['Manual','Manual / Internal'].includes(item.source)) {
      const risk=scoped.risks.find(r=>r.display_id===item.source || r.risk_key===item.source);
      if(!risk) throw Error('Select the native source record for the new action before saving.');
      Object.assign(body,{source_type:'risk',source_id:risk.risk_id,risk_id:risk.risk_id});
    }else body.source_type='manual';
    const saved=await request('post','/tasks',['new-action',item.id],()=>body);
    remember('tasks',item.id,saved);
  }

  // Evidence must exist server-side before the same interaction tries to complete a Review.
  for(const ref of newFiles.filter(ref=>!handled.evidence.includes(ref.id))) {
    const file=selectedFiles.get(ref.id),kind=fileKinds[ref.kind];
    const parts=String(ref.recordId || '').split('|');
    const subject=kind==='framework_assessments' && parts.length===3
      ? (parts[0]===sourceId && assessmentFor({fromItem:parts[2],fromProgram:parts[1]}))
      : kind && must(kind,ref.recordId);
    if(!subject) throw Error('Choose a native source record for the evidence.');
    const evidenceType=({'Policy document':'Policy / Procedure',Certificate:'Certification'})[ref.type] || ref.type || 'Other';
    const body={client_id:clientId,filename:file.name,mime_type:file.type || 'application/octet-stream',
      linked_type:kind,linked_id:subject[fields[kind]],display_name:file.name,evidence_type:evidenceType};
    if(ref.note || ref.period) body.notes=[ref.note,ref.period && 'Period covered: '+ref.period].filter(Boolean).join('\n');
    if(kind==='reviews') {
      const sourceReview=list(previous.revs).find(r=>r.id===ref.recordId);
      body.occurrence_id=currentOccurrence(subject,sourceReview,ref.occurrenceId);
    }
    const saved=await request('post','/evidence',['file',ref.id],async()=>({...body,content_base64:await readFile(file)}));
    remember('evidence',ref.id,saved);
  }

  for(const change of workCommands) {
    const [,id,arg,options]=change.args;
    const name=change.name;
    if(['rescheduleReview','setReviewDescription','completeReview'].includes(name)) {
      const sourceReview=list(previous.revs).find(r=>r.id===id),row=must('reviews',sourceReview || id);
      if(priorHandled.reviews?.includes(id) || priorHandled.reviews?.includes(row.review_id))continue;
      const path=entityPath('reviews',row.review_id);
      const intent=[name,id,sourceReview?.revision ?? row.updated_at,sourceReview?.occurrenceId,arg,options];
      if(name==='completeReview') {
        const result=await request('post',path+'/complete',intent,async()=>{
          const occurrence=currentOccurrence(row,sourceReview,arg?.occurrenceId || sourceReview?.occurrenceId);
          const {data:guide}=await api.get(path+'/completion-guide');
          if ((guide.expected_updated_at ?? null)!==(row.updated_at ?? null)) throw Error('The review changed after it was opened. Reload the guide before completing it.');
          const details={...arg};
          if(row.risk_id && arg?.assessment) {
            const following=workCommands.slice(workCommands.indexOf(change)+1);
            const reschedule=following.find(cmd=>cmd.name==='rescheduleReview' && cmd.args[1]===id);
            const schedule=following.find(cmd=>cmd.name==='saveRecordSchedule' && cmd.args[1]==='risk' && locate('risks',cmd.args[2])?.risk_id===row.risk_id);
            const next=reschedule?.args[2] || schedule?.args[3]?.next;
            if(next)details.risk_next_review=rawDate(next).slice(0,10);
          }
          return nativeReviewCompletion(guide,details,occurrence);
        });
        remember('reviews',id,result.review);
      }else{
        if(name==='rescheduleReview' && row.risk_id && workCommands.slice(0,workCommands.indexOf(change))
          .some(cmd=>cmd.name==='completeReview' && cmd.args[1]===id && cmd.args[2]?.assessment))continue;
        const occurrence=currentOccurrence(row,sourceReview,sourceReview?.occurrenceId);
        const patch={expected_updated_at:row.updated_at ?? null,expected_occurrence_id:occurrence};
        if(name==='setReviewDescription') patch.scope=arg;
        else{
          patch.due_date=rawDate(arg);
          if(options?.calendarMove) patch.calendar_move=true;
          else {
            const edited=list(current.revs).find(r=>r.id===id);
            if(options && Object.hasOwn(options,'cadence'))Object.assign(patch,cadencePatch(options.cadence));
            else if(edited && !same(edited.cad,sourceReview.cad))Object.assign(patch,cadencePatch(edited.cad));
            if(edited && edited.owner!==sourceReview.owner)patch.owner_id=owner(edited.owner);
            if(edited && edited.description!==sourceReview.description)patch.scope=edited.description || '';
          }
        }
        remember('reviews',id,await request('patch',path,intent,()=>patch));
      }
    } else if(name==='completeAction' || name==='validateFinding') {
      const prior=previousTasks.find(t=>t.id===id),task=must('tasks',prior || id);
      const intent=[name,id,prior?.revision ?? task.updated_at,arg];
      if(name==='completeAction') {
        const resolution=text(arg?.rationale || arg?.done || arg?.workNote);
        if(!resolution)throw Error('Enter the completed work before submitting the action.');
        remember('tasks',id,await request('patch',entityPath('tasks',task.task_id),intent,
          ()=>({status:'done',resolution,expected_updated_at:task.updated_at ?? null})));
      }else{
        const finding=must('findings',prior?.findingId || task.finding_id);
        if(!['Validated','Not validated'].includes(arg?.result) || !text(arg?.rationale || arg?.note)) throw Error('Choose a validation result and record its rationale.');
        if(arg.validator) {
          const {data:actor}=await api.get('/auth/me');
          if(![actor.user_id,actor.email,actor.name].filter(Boolean).includes(arg.validator)) {
            throw Error('The selected validator must sign in to record their own decision.');
          }
        }
        const result=await request('post',entityPath('findings',finding.finding_id)+(arg.result==='Validated'?'/validate':'/reject'),intent,
          ()=>({rationale:arg.rationale || arg.note,expected_updated_at:finding.updated_at ?? null}),{bodyId:true});
        remember('findings',prior?.findingId || finding.finding_id,result.finding || result);
        handled.tasks.push(id);
      }
    }
  }
  for(const item of list(current.revs)) {
    const prev=list(previous.revs).find(r=>r.id===item.id);
    if(!prev || handled.reviews.includes(item.id)) continue;
    const started=item.st==='In progress' && prev.st!==item.st;
    if(!started && !['title','description','owner','due','cad'].some(field=>!same(item[field],prev[field])))continue;
    const row=must('reviews',prev),occurrence=currentOccurrence(row,prev,prev.occurrenceId);
    if(handled.reviews.includes(row.review_id))continue;
    const patch={};
    for(const [from,to,transform] of [['title','title',v=>v],['description','scope',v=>v || ''],['owner','owner_id',owner]]) {
      if(!same(item[from],prev[from]))patch[to]=transform(item[from]);
    }
    if(!same(item.due,prev.due))patch.due_date=rawDate(item.due);
    if(!same(item.cad,prev.cad))Object.assign(patch,cadencePatch(item.cad));
    if(Object.keys(patch).length) {
      Object.assign(patch,{expected_updated_at:row.updated_at ?? null,expected_occurrence_id:occurrence});
      remember('reviews',item.id,await request('patch',entityPath('reviews',row.review_id),['edit',item.id,prev.revision,patch],()=>patch));
    }
    if(started) {
      const saved=await request('post',entityPath('reviews',row.review_id)+'/start',['start',item.id,occurrence],()=>({occurrence_id:occurrence}));
      remember('reviews',item.id,saved.review || saved);
    }
  }
  for(const item of currentTasks) {
    const prev=previousTasks.find(t=>t.id===item.id);
    if(!prev || handled.tasks.includes(item.id)) continue;
    const patch={};
    for(const [from,to,transform] of [['title','title',v=>v],['detail','description',v=>v || ''],
      ['owner','assignee_id',owner],['due','due_date',rawDate],['pri','priority',v=>String(v).toLowerCase()]]) {
      if(!same(item[from],prev[from])) patch[to]=transform(item[from]);
    }
    if(item.st!==prev.st) {
      if(!sourceActionStatus[item.st]) throw Error('Use the work-completion or validation command to close an action.');
      patch.status=sourceActionStatus[item.st];
    }
    if(Object.keys(patch).length) {
      const row=must('tasks',prev);
      patch.expected_updated_at=row.updated_at ?? null;
      remember('tasks',item.id,await request('patch',entityPath('tasks',row.task_id),['edit',item.id,prev.revision,patch],()=>patch));
    }
  }
  for(const item of list(current.revs)) {
    const key=[sourceId,item.id,item.occurrenceId].join('|');
    const draft=after.checklists?.[key];
    if(!draft?.nativeContractToken) continue;
    const prior=before.checklists?.[key];
    const answers=c=>[c?.st || {},c?.note || {},c?.supportingReference || ''];
    if(same(answers(prior),answers(draft))) continue;
    const row=must('reviews',item), occurrence=currentOccurrence(row,item,item.occurrenceId);
    const stored=row.r4_current_checklist;
    const results=(draft.steps || []).flatMap((step,i)=>draft.st?.[i]
      ? [{step_id:step.step_id,result:draft.st[i],reason:draft.note?.[i] || ''}] : []);
    const reference=draft.supportingReference || '';
    const retained=stored?.occurrence_id===occurrence ? stored : {};
    const byId=arr=>[...arr].sort((a,b)=>a.step_id.localeCompare(b.step_id));
    if(same(byId(retained.results || []),byId(results)) && (retained.supporting_reference || '')===reference) continue;
    if(draft.nativeReadOnly) throw Error('This review checklist is read-only for this account.');
    const path=entityPath('reviews',row.review_id)+'/completion-guide';
    const intent=['checkpoint',item.id,occurrence,draft.nativeContractToken,draft.nativeGuideRevision,results,reference];
    const saved=await request('put',path,intent,async()=>{
      const {data:guide}=await api.get(path);
      if(guide.contract_token!==draft.nativeContractToken || guide.occurrence_id!==occurrence ||
        (guide.expected_updated_at ?? null)!==(draft.nativeGuideRevision ?? null)) throw Error('The saved checklist changed. Reload before recording these answers.');
      return {occurrence_id:occurrence,expected_updated_at:guide.expected_updated_at ?? null,
        checklist:{contract_token:guide.contract_token,results},supporting_reference:reference};
    });
    draft.nativeGuideRevision=saved.expected_updated_at;
    remember('reviews',item.id,{...row,updated_at:saved.expected_updated_at});
  }
  // Native creates return their permanent IDs; the originating item's saved link must
  // use the ID that will exist when a different signed-in session opens the program.
  for(const [key,items] of Object.entries(after.ita || {})) {
    if(key.split('|')[0]!==sourceId || !Array.isArray(items))continue;
    for(const item of items) {
      if(item.act && maps.tasks?.[item.act] && handled.tasks.includes(item.act)) {
        const nativeTask=locate('tasks',item.act);
        if(nativeTask && !nativeTask.source_record_id) item.act=nativeTask.task_id;
      }
    }
  }
  return {didWrite,identityMaps,handled};
}
