import rules from '@catalogs/cmmcWorkbook.json';
import {buildCmmcWorkspace} from '../lib/cmmcWorkspace';
import {downloadCmmcExport} from '../lib/cmmcExports';
import {recordUuid} from '../lib/recordUuid';
import {stableJson} from '../lib/stableJson';

const endpoint='/frameworks/cmmc/workbook';
const own=(row,key)=>Object.hasOwn(row||{},key);
const equal=(a,b)=>stableJson(a??null)===stableJson(b??null);
const text=v=>v==null?'':String(v);
const token=r=>r.last_saved||r.last_assessed||r.updated_at||'';
const programs=(state,key)=>state.clients?.find(c=>c.id===key)?.progs?.filter(p=>p.k==='cmmc'&&!p.retired&&!p.ws)||[];
const taskRows=(state,key)=>[...(state.work?.[key]?.acts||[]),...(state.work?.[key]?.done||[])];
const isPoamTask=t=>t.source==='CMMC POA&M'&&t.fromProgram==='cmmc:800171r2'&&!!t.fromItem;
const sourceAssetKey=a=>a.id?'id:'+a.id:JSON.stringify([a.name,a.type||'',a.loc||'']);
const sspFields=rules.sspFields.map(f=>f.id);
const fieldMap=(fields,obj)=>Object.fromEntries(fields.filter(k=>own(obj,k)).map(k=>[k,text(obj[k])]));
const different=(before,after)=>Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])]
  .filter(k=>text(before[k])!==text(after[k])).map(k=>[k,text(after[k])]));
const assessmentSections=new Set(['plans','exceptions','decisions']);
function checkPacket(packet,clientId,level){
  if(!clientId||packet?.client?.client_id!==clientId||packet?.records?.client_id!==clientId||
    packet?.data?.configuration?.level!==level||packet.records.level!==level||![1,2].includes(level)||
    !Number.isInteger(packet.records.revision)||packet.records.revision<0)throw Error('Reload the saved CMMC workbook for this client and level.');
}
function scopedAssets(state,ctx){
  const systems=state.records?.[ctx.sourceId]?.systems||[],assets=ctx.records.assets||[];
  const mapping=new Map();
  for(const [i,system] of systems.entries()){
    const raw=String(system.sourceRecordId??system.wfId??i+1),native=ctx.identityMaps?.recordIds?.[ctx.clientId]?.assets?.[raw] || raw;
    const matches=assets.filter(a=>a.client_id===ctx.clientId&&(a.asset_id===native||String(a.source_record_id)===raw));
    const key=sourceAssetKey(system);
    if(matches.length===1)mapping.set(key,mapping.has(key)?null:matches[0].asset_id);
  }
  return mapping;
}
function planValues(entry){
  const row=fieldMap(rules.fields.plans.filter(k=>k!=='due_date'),entry);
  if(own(entry,'due'))row.due_date=text(entry.due);
  // Rendering an open gap in the reference can materialize a display-only snapshot.
  if(row.status==='Open'&&!Object.keys(row).some(k=>k!=='status'&&row[k])&&!entry?.updatedAt)delete row.status;
  return row;
}
function workbookInputs(state,program,ctx){
  const inputs=new Map(),level=program.level,draft=program.cmmcSsp?.[level]||{},book=program.cmmcWorkspace||{};
  const add=(section,target,values)=>{if(Object.keys(values).length)inputs.set(JSON.stringify([section,target]),values);};
  add('ssp','',fieldMap(sspFields,draft));
  const assets=scopedAssets(state,ctx);
  for(const key of new Set([...Object.keys(draft.assets||{}),...Object.keys(draft.assetTreatment||{})])){
    const id=assets.get(key);
    if(!id)throw Error('Reopen the asset scope list. Each classification must identify one current client system.');
    add('assets',id,{category:text(draft.assets?.[key]),treatment:text(draft.assetTreatment?.[key])});
  }
  for(const [id,decision] of Object.entries(draft.applicabilityDecisions||{}))
    add('decisions',id,fieldMap(rules.fields.decisions,decision));
  for(const [id,entry] of Object.entries({...book.milestones,...book.poamEntries}))add('plans',id,planValues(entry));
  for(const [id,value] of Object.entries(book.exceptions||{}))add('exceptions',id,{value:text(value)});
  if(book.posting)add('posting','',fieldMap(rules.fields.posting,book.posting));
  if(own(book,'conditionalStatusDate'))add('conditional','',{date:text(book.conditionalStatusDate)});
  return inputs;
}
function memo(pending,key,body){
  const fingerprint=stableJson(key);
  if(!pending.has(fingerprint))pending.set(fingerprint,{body:{...body,request_id:recordUuid()}});
  return pending.get(fingerprint);
}
function exactAssessment(records,clientId,id){
  const rows=records.framework_assessments?.filter(r=>r.client_id===clientId&&r.framework_key==='cmmc'&&r.definition_id===id)||[];
  if(rows.length!==1)throw Error('Reload the current CMMC requirement before saving.');
  return rows[0];
}

export async function applyCmmcChanges({before,after,records,clientId,sourceId,api,identityMaps={},userIds={},pendingRequests=new Map(),handled={}}){
  const previous=programs(before,sourceId),current=programs(after,sourceId);
  const result={didWrite:false,identityMaps,handled:{tasks:[],findings:[]}};
  if(current.length>1)throw Error('Resolve the duplicate active CMMC programs before saving.');
  const program=current[0],prior=previous[0];
  if(!program||!prior||program.level!==prior.level)return result; // Enrollment owns the active level.
  const existingTasks=new Set(taskRows(before,sourceId).map(t=>t.id));
  const newTasks=taskRows(after,sourceId).filter(t=>!existingTasks.has(t.id)&&isPoamTask(t)&&!handled.tasks?.includes(t.id));
  if(!newTasks.length&&equal(prior.cmmcSsp,program.cmmcSsp)&&equal(prior.cmmcWorkspace,program.cmmcWorkspace))return result;
  const ctx={records,clientId,sourceId,identityMaps},level=program.level;
  const old=workbookInputs(before,prior,ctx),next=workbookInputs(after,program,ctx);
  const edits=[];
  for(const key of new Set([...next.keys(),...old.keys()])){
    const [section,target]=JSON.parse(key),values=different(old.get(key)||{},next.get(key)||{});
    if(!Object.keys(values).length)continue;
    if(section==='exceptions'&&!next.has(key)){
      // Changing the requirement invalidates the old exception automatically via its assessment token.
      const oldItem=prior.reg?.items?.find(row=>row.id===target),item=program.reg?.items?.find(row=>row.id===target);
      if(oldItem&&item&&!equal(oldItem,item))continue;
    }
    if(section==='plans'){
      const previousStatus=old.get(key)?.status,currentEntry=program.cmmcWorkspace?.poamEntries?.[target];
      if(previousStatus==='Closed'&&values.status&&values.status!=='Closed'){
        const reason=currentEntry?.history?.slice().reverse().find(e=>e.action==='Reopened')?.note;
        if(reason)values.closeout=reason;
      }
    }
    edits.push({section,target,values});
  }
  if(!edits.length&&!newTasks.length)return result;
  const packet=records.cmmcWorkbook;
  checkPacket(packet,clientId,level);
  let revision=packet.records.revision;
  const client=records.clients?.find(c=>c.client_id===clientId);
  if(!client||client.source_client_id&&client.source_client_id!==sourceId)throw Error('The active CMMC client changed.');
  const maps=(identityMaps.recordIds ||= Object.create(null))[clientId] ||= Object.create(null);
  for(const {section,target,values} of edits){
    const assessed=assessmentSections.has(section)?exactAssessment(records,clientId,target):null;
    const body={client_id:clientId,level,section,target,values,revision,assessed_version:assessed?token(assessed):''};
    const attempt=memo(pendingRequests,['cmmc-edit',body],body);
    if(!attempt.response)attempt.response=(await api.put(endpoint,attempt.body)).data;
    if(![revision,revision+1].includes(attempt.response?.revision))throw Error('The CMMC workbook revision could not be confirmed. Reload the saved workbook.');
    revision=attempt.response.revision;
    result.didWrite=true;
  }
  for(const task of newTasks){
    const assessment=exactAssessment(records,clientId,task.fromItem);
    if(level!==2||!['in_progress','needs_attention'].includes(assessment.status))throw Error('Open the saved CMMC Level 2 requirement gap before adding corrective work.');
    const owner=userIds instanceof Map?userIds.get(task.owner):own(userIds,task.owner)?userIds[task.owner]:null;
    if(!owner)throw Error('Choose a current platform user with access to this client for the POA&M action.');
    const due=task.due instanceof Date ? [task.due.getFullYear(),String(task.due.getMonth()+1).padStart(2,'0'),String(task.due.getDate()).padStart(2,'0')].join('-') : task.due?.$date || task.due;
    const body={title:assessment.title||task.title,remediation_title:task.title,description:task.detail||'',
      severity:({Critical:'critical',High:'high',Medium:'medium',Low:'low'})[task.pri]||'medium',owner_id:owner,
      due_date:due?String(due).slice(0,10):null,cmmc_gap_version:token(assessment)};
    const attempt=memo(pendingRequests,['cmmc-action',clientId,task.id,assessment.framework_assessment_id],body);
    if(!attempt.response)attempt.response=(await api.post('/framework_assessments/'+encodeURIComponent(assessment.framework_assessment_id)+'/findings',attempt.body)).data;
    const finding=attempt.response;
    if(!finding?.finding_id||finding.client_id!==clientId||finding.framework_assessment_id!==assessment.framework_assessment_id)
      throw Error('The saved CMMC finding could not be verified against the requirement.');
    const {data:tasks}=await api.get('/tasks',{params:{client_id:clientId}});
    const actual=tasks.filter(t=>t.client_id===clientId&&t.finding_id===finding.finding_id&&(!finding.primary_task_id||t.task_id===finding.primary_task_id));
    if(actual.length!==1||!actual[0].task_id)throw Error('The saved finding needs reconciliation with its corrective action.');
    const taskId=actual[0].task_id;
    (maps.tasks ||= Object.create(null))[task.id]=taskId;
    result.handled.tasks.push(task.id,taskId);result.handled.findings.push(finding.finding_id);
    for(const [table,row,id] of [['tasks',actual[0],'task_id'],['findings',finding,'finding_id']]){
      const rows=records[table]||=[];
      if(!rows.some(r=>r[id]===row[id]))rows.push(row);
    }
    result.didWrite=true;
  }
  return result;
}

// Only saved native workbook inputs are projected. Assessment outcomes and action
// ownership continue to come from their respective native resources.
export function overlayCmmcWorkbook(state,packet,ctx){
  const program=programs(state,ctx.sourceId)[0];
  if(!program)return state;
  checkPacket(packet,ctx.clientId,program.level);
  const book=packet.records,model=buildCmmcWorkspace(packet.data,book,packet.client);
  const draft={...book.ssp},assets=scopedAssets(state,ctx);
  for(const [key,id] of assets){
    if(!id||!book.assets?.[id])continue;
    (draft.assets||={})[key]=book.assets[id].category||'';
    (draft.assetTreatment||={})[key]=book.assets[id].treatment||'';
  }
  const workspace={};
  if(book.posting?.date)workspace.posting={...book.posting,score:Number(book.posting.score)};
  if(book.conditional)workspace.conditionalStatusDate=book.conditional.date||'';
  const edits=(book.history||[]).slice().sort((a,b)=>a.revision-b.revision);
  for(const row of model.rows){
    if(row.rationale)(workspace.exclusions||={})[row.id]=row.rationale;
    if(row.exception)(workspace.exceptions||={})[row.id]=row.exception;
    if(row.decision)(draft.applicabilityDecisions||={})[row.id]={...row.decision,statusAtDecision:'X',rationaleAtDecision:row.decision.rationale};
    if(!row.plan)continue;
    const p=row.plan,assessment=p.assessment||{},points=assessment.points??null;
    const entry={...fieldMap(rules.fields.plans.filter(k=>k!=='due_date'),p),...(own(p,'due_date')&&{due:p.due_date}),
      status:p.status||'Open',openedAt:p.opened_at||'',assessment:{points,pointLabel:assessment.pointLabel||'',deductionMin:assessment.deductionMin??null,
        deductionMax:assessment.deductionMax??null,bucket:row.weight===null?'prerequisite':points===null?'unresolved':String(points),
        eligibility:assessment.eligibility||row.eligibility,gapNotes:assessment.narrative||row.narrative},history:[]};
    for(const e of edits.filter(e=>e.section==='plans'&&e.target===row.id)){
      const changed=e.before?.status!==e.after?.status;
      const action=e.after?.status==='Closed'&&changed?'Closed':e.before?.status==='Closed'&&changed?'Reopened':changed?'Status changed':'Plan updated';
      entry.history.push({at:e.at,by:e.actor_name||e.actor,action,status:e.after?.status||'Open',note:e.after?.closeout||e.after?.notes||'',
        evidence:e.after?.evidence||'',points:e.after?.assessment?.points??null,pointLabel:e.after?.assessment?.pointLabel||''});
      entry.updatedAt=e.at;
      if(action==='Closed'){entry.closedAt=e.at;entry.closedBy=e.actor_name||e.actor;}
      else if(action==='Reopened'){delete entry.closedAt;delete entry.closedBy;}
    }
    (workspace.poamEntries||={})[row.id]=entry;
  }
  const sspEdited=edits.filter(e=>['ssp','assets','decisions'].includes(e.section)).at(-1);
  if(sspEdited?.at){
    // Legacy date-only entries retain their calendar day. Real audit timestamps retain their exact instant.
    const at=sspEdited.at;
    draft.savedOn=new Date(/^\d{4}-\d{2}-\d{2}$/.test(at)?at+'T00:00:00':at);
  }
  if(Object.keys(draft).length)(program.cmmcSsp||={})[program.level]=draft;
  else if(program.cmmcSsp)delete program.cmmcSsp[program.level];
  if(Object.keys(workspace).length)program.cmmcWorkspace=workspace;else delete program.cmmcWorkspace;
  program.nativeCmmcReadiness={...model.score,deducted:model.score.knownDeduction+model.score.withheld,unresolvedDeduction:model.score.withheld,
    possibleDeduction:model.score.knownDeduction+model.score.withheld};
  return state;
}

export async function downloadApprovedCmmc({clientId,level,kind,api,isCurrent=()=>true}){
  if(!['ssp','poam','sprs'].includes(kind)||!isCurrent())throw Error('Reopen the current CMMC download.');
  const {data:packet}=await api.post(endpoint+'/export',{client_id:clientId,level,kind,request_id:recordUuid()});
  checkPacket(packet,clientId,level);
  if(!isCurrent())throw Error('The selected CMMC client changed before downloading.');
  return downloadCmmcExport(kind,buildCmmcWorkspace(packet.data,packet.records,packet.client),isCurrent);
}
