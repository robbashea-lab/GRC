import {recordUuid} from '../lib/recordUuid';
import {serviceFormFields} from '../preview/approvedV3Registers';
import aiCatalog from '../lib/aiGovernanceCatalog.json';

const idFields={risks:'risk_id',policies:'policy_id',vendors:'vendor_id',ai_systems:'ai_system_id',reviews:'review_id'};
const kinds={risk:'risks',policy:'policies',vendor:'vendors',ai:'ai_systems'};
const labels={Open:'open','In treatment':'in_progress',Identified:'identified',Assessed:'assessed',Escalated:'escalated'};
const decisions={Approved:'approved','Approved with conditions':'approved_with_conditions','Not approved':'not_approved'};
const policyStates={'Draft':'draft','Needs creation':'needs_creation','Reported existing':'needs_verification','Needs confirmation':'needs_verification'};
const frequencies={'':'annual',A:'annual',Y:'annual',M:'monthly',Q:'quarterly',S:'semiannual','1':'none'};
const own=(row,key)=>Object.hasOwn(row || {},key);
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const nonempty=row=>Object.keys(row).length>0;
const scopeError=()=>{throw Error('This record is unavailable in the selected client. Reload the workspace.');};
const pathFor=(table,id)=>'/'+table+'/'+encodeURIComponent(id);
const snapshot=row=>({expected_updated_at:row.updated_at??null});
const stateRows=(state,cid,table)=>table==='ai_systems'?state.records?.[cid]?.ai || []:
  state.programs?.[cid]?.[{risks:'risks',vendors:'vendors',policies:'pols'}[table]] || [];
const rowKey=row=>row?.wfId || row?.id;
const reviewRows=(s,cid)=>s.work?.[cid]?.revs || [];
const detailReason=details=>String(typeof details==='string'?details:details?.reason || details?.rationale || '').trim();
function dateOnly(value) {
  if(value==null||value==='')return null;
  if(value?.$date)return dateOnly(new Date(value.$date));
  if(value instanceof Date && !Number.isFinite(value.getTime()))throw Error('Enter a valid review date.');
  if(value instanceof Date)return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
  const day=String(value?.$date||value).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)
    throw Error('Enter a valid review date.');
  return day;
}
function frequency(value) {
  if(own(frequencies,value))return {recurrence:frequencies[value]};
  const days=Number(value?.unit==='days'?value.interval:/^D:(\d+)$/.exec(value)?.[1]);
  if(!Number.isInteger(days)||days<1||days>3660)throw Error('Choose a supported review cadence.');
  return {recurrence:'custom',custom_recurrence_days:days};
}
function ownerId(value,userIds) {
  if(!value||value==='Unassigned'||value==='—')return null;
  const id=userIds instanceof Map?userIds.get(value):own(userIds,value)?userIds[value]:null;
  if(!id)throw Error('Choose a current platform user with access to this client.');
  return id;
}
function linked(state,cid,kind,key,purpose) {
  return reviewRows(state,cid).filter(r=>r.link?.kind===kind && r.link.id===key && (!purpose||(r.link.purpose||'review')===purpose));
}
function sourceFieldPatch(table,old,row,userIds,skipScores) {
  const changes={};
  const assign=(source,target,normalize=v=>v)=>{if(own(row,source)&&!same(old?.[source],row[source]))changes[target]=normalize(row[source]);};
  assign(table==='risks'?'title':'name',table==='policies'||table==='risks'?'title':'name');
  assign('owner',table==='vendors'?'business_owner_id':'owner_id',v=>ownerId(v,userIds));
  if(table==='risks'){
    assign('description','description');
    if(!skipScores){assign('L','likelihood_score');assign('I','impact_score');}
    if(row.strategy && row.strategy!=='Accept')assign('strategy','treatment',v=>v.toLowerCase());
    if(labels[row.st])assign('st','status',v=>labels[v]);
  }
  if(table==='policies'){
    assign('cat','category');assign('ver','version',v=>v==='—'?null:v);assign('description','summary');
    if(policyStates[row.st] && (!old||row.st!==old.st)){
      changes.status=policyStates[row.st];
      if(row.st!=='Draft')changes.presence=({'Reported existing':'reported_existing','Needs creation':'reported_missing','Needs confirmation':'needs_confirmation'})[row.st];
    }
  }
  if(table==='vendors'){
    assign('desc','service');assign('crit','criticality',v=>v==='Moderate'?'medium':String(v).toLowerCase());
    if(old?.critProvisional&&!row.critProvisional){changes.confirm_criticality=true;changes.criticality=row.crit==='Moderate'?'medium':row.crit.toLowerCase();}
    assign('access','data_types');assign('renew','contract_renewal',dateOnly);assign('expires','contract_expiration',dateOnly);
    if(!same(old?.dataHandling,row.dataHandling)&&row.dataHandling){
      const h=row.dataHandling;
      changes.data_types=[...new Set([...(h.types||[]),...(h.dataCategories||[])])];
      changes.data_relationship=h.status==='none'?['none']:(h.operations||[]).map(k=>({store:'stores',process:'processes',access:'accesses'})[k]||k);
      if(nonempty(h.details||{}) || h.accessLevels?.length)throw Error('Record detailed vendor access and handling information in the native Vendor record.');
    }
  }
  if(table==='ai_systems'){
    assign('prov','provider');assign('purpose','description');
    if(!same(old?.dataHandling,row.dataHandling)&&row.dataHandling){
      const types=row.dataHandling.types||[];
      changes.data_types=types.map(type=>{
        const equivalent={'source code':'Source Code / IP'}[type.toLowerCase()]||type;
        const canonical=aiCatalog.data_types.find(t=>t.toLowerCase()===equivalent.toLowerCase());
        if(!canonical)throw Error('Choose a native AI data classification for “'+type+'” before saving.');
        return canonical;
      });
      if(row.dataHandling.status==='none'&&types.length)throw Error('The AI data handling choices conflict.');
    }
  }
  return changes;
}

/** Persist the selected client's register edits using the native domain commands. */
export async function applyRegisterChanges({before,after,records,clientId,sourceId,api,identityMaps={},userIds={},
  commands=[],handled:previouslyHandled={},pendingRequests=new Map()}) {
  const client=records.clients?.find(c=>c.client_id===clientId);
  if(!client || (client.source_client_id && client.source_client_id!==sourceId) ||
    (identityMaps.clientIds?.[sourceId]&&identityMaps.clientIds[sourceId]!==clientId))scopeError();
  const maps=(identityMaps.recordIds ||= Object.create(null))[clientId] ||= Object.create(null);
  const handled={reviews:[],risks:[],policies:[],vendors:[],ai_systems:[]};
  let didWrite=false;
  function handledIds(table,...ids){for(const id of ids)if(id && !handled[table].includes(id))handled[table].push(id);}
  function remember(table,key,row,expected){
    const id=row?.[idFields[table]];
    if(!id || row.client_id!==clientId || (expected && id!==expected))scopeError();
    const rows=records[table] ||= [],index=rows.findIndex(r=>r[idFields[table]]===id);
    if(index>=0){if(rows[index].client_id!==clientId)scopeError();rows[index]={...rows[index],...row};}
    else rows.push(row);
    (maps[table] ||= Object.create(null))[key]=id;
    handledIds(table,key,id);
    return row;
  }
  function lookup(table,key){
    const id=maps[table]?.[key] || key;
    const candidates=(records[table]||[]).filter(r=>r.client_id===clientId &&
      (r[idFields[table]]===id || r.source_record_id===key));
    if(candidates.length>1 || candidates[0] && maps[table]?.[key] && candidates[0][idFields[table]]!==id)scopeError();
    return candidates[0];
  }
  function intent(key){
    const name=['register',clientId,key].join('|');
    if(!pendingRequests.has(name))pendingRequests.set(name,recordUuid());
    return {headers:{'Idempotency-Key':pendingRequests.get(name)}};
  }
  async function change(method,table,key,suffix,body,options){
    const current=lookup(table,key);
    if(!current)scopeError();
    const id=current[idFields[table]];
    const response=await api[method](pathFor(table,id)+suffix,{...body,...(options?.approval?{}:snapshot(current))});
    didWrite=true;
    return remember(table,key,response.data,id);
  }
  function claimReviews(kind,key,purpose,returned){
    const matches=[...linked(before,sourceId,kind,key,purpose),...linked(after,sourceId,kind,key,purpose)];
    for(const rev of matches)handledIds('reviews',rev.id,lookup('reviews',rev.id)?.review_id);
    if(returned?.review_id){
      if(returned[idFields[kinds[kind]]]!==lookup(kinds[kind],key)?.[idFields[kinds[kind]]])scopeError();
      const active=linked(after,sourceId,kind,key,purpose);
      if(active.length===1)remember('reviews',active[0].id,returned);
    }
  }
  async function claimGenerated(kind,key,purpose) {
    const candidates=linked(after,sourceId,kind,key,purpose);
    const sourceReview=candidates[0];
    if(candidates.length>1)throw Error('More than one linked review matches this schedule. Reload the register.');
    if(!sourceReview || lookup('reviews',sourceReview.id)){claimReviews(kind,key,purpose);return;}
    const idField=idFields[kinds[kind]],nativeId=lookup(kinds[kind],key)?.[idField];
    // Native scheduling creates its own Review ID. Resolve the actual parent linkage
    // rather than guessing it from the source ID, title or date.
    const {data:reviews}=await api.get('/reviews',{params:{client_id:clientId}});
    const active=reviews.filter(r=>r.client_id===clientId && r[idField]===nativeId && !['cancelled','completed'].includes(r.status) &&
      (kind!=='vendor' || (r.vendor_purpose||'vendor')===(purpose==='review'?'vendor':purpose)));
    if(active.length!==1)throw Error('The saved record could not be matched to one active review. Reload its native schedule.');
    claimReviews(kind,key,purpose,active[0]);
  }
  function commandRow(cmd){
    const [cid,kindOrKey,id,extra]=cmd.args||[];
    const scheduling=cmd.name==='saveRecordSchedule';
    const kind=scheduling?kindOrKey:({savePolicyApproval:'policy',closeRisk:'risk',offboardVendor:'vendor',retireAI:'ai',materialAIChange:'ai'})[cmd.name];
    if(!kind)return null;
    if(cid!==sourceId || !own(kinds,kind))scopeError();
    const table=kinds[kind],arg=scheduling?id:kindOrKey,rawKey=typeof arg==='object'?rowKey(arg):arg;
    if(typeof rawKey!=='string'||!rawKey.trim())scopeError();
    const rows=stateRows(after,sourceId,table).filter(r=>[rowKey(r),r.id,r.name].includes(rawKey));
    if(rows.length!==1)scopeError();
    return {name:cmd.name,kind,table,key:rowKey(rows[0]),fields:(scheduling?extra:id)||{},row:rows[0]};
  }
  const actions=commands.map(commandRow).filter(Boolean);
  const workActions=commands.filter(c=>['completeReview','rescheduleReview'].includes(c.name)&&c.args?.[0]===sourceId);
  function reviewOwns(kind,key){return linked(before,sourceId,kind,key).some(r=>workActions.some(c=>c.args[1]===r.id));}
  async function policyDecision(key,decision,note){
    const row=lookup('policies',key);
    if(!row)scopeError();
    if(decision==='Pending approval')return change('post','policies',key,'/submit-review',{});
    if(!['Approved','Rejected'].includes(decision))throw Error('Choose a policy approval decision.');
    if(!row.approval_request_id)throw Error('Submit this policy with its approval document or external reference and version before recording a decision.');
    return change('post','policies',key,decision==='Approved'?'/approve':'/reject',
      {approval_request_id:row.approval_request_id,comment:note},{approval:true});
  }
  const priorProfile=before.services?.[sourceId],profile=after.services?.[sourceId];
  const serviceChanged=profile&&!same(priorProfile,profile);
  if(serviceChanged){
    const next=serviceFormFields(profile),old=priorProfile&&serviceFormFields(priorProfile);
    if(!same(old,next)){
      const nativeServices=client.profile?.services||{},existing=nativeServices.custom_tools||[];
      const areas=Object.fromEntries(Object.entries(next.areas).filter(([id,area])=>!same(old?.areas[id],area)));
      const modified=next.custom_tools.filter(t=>!same(old?.custom_tools.find(previous=>previous.tool_id===t.tool_id),t));
      if(old?.custom_tools.some(t=>!next.custom_tools.some(retained=>retained.tool_id===t.tool_id)))
        throw Error('Use the native tool retirement workflow to retain a custom tool’s history.');
      const body={areas,preset:old&&old.preset===next.preset?nativeServices.preset??null:next.preset,
        ...snapshot(client),custom_tools:modified.map(t=>{
        const native=existing.find(saved=>saved.tool_id===t.tool_id);
        return {...native,...t,retired:native?.retired||false};
      })};
      const url=pathFor('clients',clientId)+'/services';
      await api.post(url,body,intent('services:'+String(client.updated_at)));
      didWrite=true;
      const {data:saved}=await api.get(url);
      if(saved.client_id!==clientId || !saved.services || !own(saved,'updated_at'))scopeError();
      if(!same(body.preset,saved.services.preset) || Object.entries(areas).some(([id,area])=>!same(saved.services.areas?.[id],area)) ||
        body.custom_tools.some(t=>!saved.services.custom_tools?.some(value=>value.tool_id===t.tool_id&&Object.entries(t).every(([k,v])=>same(v,value[k])))))
        throw Error('The saved services profile changed before it could be confirmed. Reload this client.');
      client.updated_at=saved.updated_at;
      client.profile={...client.profile,services:saved.services};
      const provider=stateRows(after,sourceId,'vendors').find(v=>v.auto==='svc');
      if(provider && !stateRows(before,sourceId,'vendors').some(v=>rowKey(v)===rowKey(provider))){
        if(!saved.services.provider_vendor_id)throw Error('The existing provider relationship requires reconciliation in the Vendor register.');
        const id=saved.services.provider_vendor_id;
        remember('vendors',rowKey(provider),(await api.get(pathFor('vendors',id))).data,id);
      }
    }
  }
  for(const [kind,table] of Object.entries(kinds)){
    const beforeRows=stateRows(before,sourceId,table),afterRows=stateRows(after,sourceId,table);
    const previous=new Map(beforeRows.map(r=>[rowKey(r),r]));
    const keys=new Set(afterRows.map(rowKey));
    if(keys.size!==afterRows.length||keys.has(undefined))throw Error('The register contains missing or duplicate record identities. Reload the client.');
    for(const old of beforeRows)if(!keys.has(rowKey(old)))throw Error('Use the native record lifecycle to remove a register item.');
    for(const row of afterRows){
      const key=rowKey(row),old=previous.get(key),wasHandled=previouslyHandled[table]||[];
      if(same(old,row) || wasHandled.includes(key) || wasHandled.includes(maps[table]?.[key]) || handled[table].includes(key))continue;
      const current=lookup(table,key);
      if(old&&!current)scopeError();
      if(!old && current)throw Error('A native record already exists for this source item. Reload before creating another.');
      const owned=actions.filter(a=>a.kind===kind&&a.key===key);
      const workOwns=reviewOwns(kind,key);
      const patch=sourceFieldPatch(table,old,row,userIds,workOwns);
      const ownsSchedule=!workOwns&&!owned.some(a=>['saveRecordSchedule','offboardVendor','closeRisk'].includes(a.name))&&
        (kind==='risk'||kind==='vendor')&&(!old||old.st===row.st)&&!same(old?.next,row.next);
      if(ownsSchedule)patch.next_review=dateOnly(row.next);
      if(kind==='vendor'&&!owned.some(a=>a.name==='saveRecordSchedule') && own(row,'reviewFrequency') && !same(old?.reviewFrequency,row.reviewFrequency)){
        const f=frequency(row.reviewFrequency);
        patch.review_frequency=f.recurrence==='none'?'as_needed':f.recurrence;
        if(f.custom_recurrence_days)patch.custom_recurrence_days=f.custom_recurrence_days;
      }
      if(kind==='vendor'&&old&&!workOwns && ['asr','asrSt','asrPeriod','follow'].some(f=>!same(old[f],row[f])))
        throw Error('Record the assurance artifact, actual receipt or review date, and reviewer in the native Vendor assurance form.');
      if(kind==='vendor'&&old&&!workOwns&&!same(old.rating,row.rating))
        throw Error('Record the residual risk assessment in a linked native Risk. Vendor criticality is a separate rating.');
      // The native AI Review owner is separate from the AI system owner.
      if(table==='ai_systems'&&owned.some(a=>a.name==='saveRecordSchedule'&&a.fields.owner===row.owner))delete patch.owner_id;
      if(table==='vendors'&&!same(old?.assuranceTypes,row.assuranceTypes)&&row.assuranceTypes){
        const artifacts=current?.assurance_records||[];
        patch.assurance_required=!!row.assuranceRequired;
        patch.assurance_records=artifacts.map(a=>({...a,required:row.assuranceTypes.includes(a.document_name||a.type)}));
        for(const type of row.assuranceTypes)if(!patch.assurance_records.some(a=>(a.document_name||a.type)===type))
          patch.assurance_records.push({type,document_name:type,required:true,evidence_ids:[]});
      }else if(table==='vendors'&&!same(old?.assuranceRequired,row.assuranceRequired)&&own(row,'assuranceRequired'))
        patch.assurance_required=row.assuranceRequired;
      if(table==='ai_systems'&&old && old.tier!==row.tier)throw Error('Complete the native AI screening questions to change the calculated screening tier.');
      if(!old){
        // New Risks start open; a subsequent decision records the selected treatment.
        const startsInTreatment=kind==='risk'&&row.st==='In treatment';
        if(startsInTreatment)delete patch.status;
        const {data:saved}=await api.post('/'+table,{client_id:clientId,...patch},intent('create:'+table+':'+key));
        didWrite=true;
        remember(table,key,saved);
        if(startsInTreatment)await change('patch',table,key,'',{status:'in_progress',treatment:'mitigate'});
      }else if(nonempty(patch))await change('patch',table,key,'',patch);
      if(ownsSchedule)await claimGenerated(kind,key,'review');
      if(kind==='risk'&&row.st==='Accepted' && (!old||old.st!==row.st||!same(old.acceptance,row.acceptance)))
        await change('post',table,key,'/accept',{rationale:row.acceptance?.why||'',expiry_date:dateOnly(row.acceptance?.exp)});
      if(kind==='ai'&&decisions[row.st]&&(!old||old.st!==row.st||old.cond!==row.cond))
        await change('post',table,key,'/approval',{status:decisions[row.st],note:row.cond||''});
      if(kind==='ai'&&!same(old?.risk,row.risk) && (old?.risk&&old.risk!=='—' || row.risk&&row.risk!=='—')){
        const ai=lookup(table,key),priorRisk=(ai.related_links||[]).some(l=>l.kind==='risks');
        if(priorRisk)throw Error('Existing AI risk links are retained. Review this relationship in native AI Governance.');
        const target=records.risks?.filter(r=>r.client_id===clientId && r.display_id===row.risk);
        if(target?.length!==1)throw Error('Choose a risk from this client’s native Risk Register.');
        await api.post(pathFor(table,ai.ai_system_id)+'/links',{kind:'risks',id:target[0].risk_id,classification:'Context'});
        didWrite=true;handledIds(table,key,ai.ai_system_id);
      }
      if(kind==='policy'&&old && old.st!==row.st && ['Pending approval','Approved','Rejected'].includes(row.st) && !owned.some(a=>a.name==='savePolicyApproval'))
        await policyDecision(key,row.st,row.approval?.reason||'');
      // Legacy forms sometimes update the selected record directly.
      if(old?.st!==row.st && kind==='risk' && row.st==='Closed' && !owned.some(a=>a.name==='closeRisk'))
        actions.push({name:'closeRisk',kind,table,key,row,fields:{reason:row.closeWhy}});
      if(old?.st!==row.st && kind==='ai' && row.st==='Retired' && !owned.some(a=>a.name==='retireAI'))
        actions.push({name:'retireAI',kind,table,key,row,fields:{reason:row.inactiveReason}});
      if(old?.st!==row.st && kind==='vendor' && row.st==='Offboarded' && !owned.some(a=>a.name==='offboardVendor'))
        actions.push({name:'offboardVendor',kind,table,key,row,fields:{reason:row.inactiveReason}});
    }
  }
  for(const {name,kind,table,key,fields,row} of actions){
    const saved=lookup(table,key);
    if(!saved)scopeError();
    if(name==='savePolicyApproval')await policyDecision(key,fields.decision,detailReason(fields));
    if(name==='closeRisk'){
      if(!detailReason(fields))throw Error('Enter the reason for closing the risk.');
      await change('post',table,key,'/close',{reason:fields.closureReason||'other',note:detailReason(fields)});
      claimReviews(kind,key);
    }
    if(name==='retireAI'){
      if(!detailReason(fields))throw Error('Enter the reason for retiring the AI system.');
      await change('patch',table,key,'',{status:'retired',governance_notes:[saved.governance_notes,detailReason(fields)].filter(Boolean).join('\n')});
      claimReviews(kind,key);
    }
    if(name==='offboardVendor'){
      const reason=detailReason(fields);
      if(!reason)throw Error('Enter the reason for offboarding the vendor.');
      const notes=saved.notes?.split('\n').at(-1)===reason?saved.notes:[saved.notes,reason].filter(Boolean).join('\n');
      if(saved.status!=='offboarding')await change('patch',table,key,'',{status:'offboarding',notes});
      await change('patch',table,key,'',{status:'inactive',...(saved.status==='offboarding'&&notes!==saved.notes&&{notes})});
      claimReviews(kind,key);
    }
    if(name==='materialAIChange')await change('post',table,key,'/material-change',{note:fields.note||detailReason(fields)});
    if(name==='saveRecordSchedule' && !reviewOwns(kind,key)){
      const purpose=fields.purpose||'review';
      const priorReview=linked(before,sourceId,kind,key,purpose)[0],nextReview=linked(after,sourceId,kind,key,purpose)[0];
      // Policy reviews and existing AI reviews are writable through their own Review form.
      if(kind==='policy'||(kind==='ai'&&priorReview))continue;
      const due=dateOnly(own(fields,'next')?fields.next:own(fields,'due')?fields.due:nextReview?.due || row.next);
      const cadence=frequency(own(fields,'cad')?fields.cad:nextReview?.cad??priorReview?.cad??'');
      if(kind==='ai'){
        if(!due)throw Error('Choose the first AI review date.');
        const owner=ownerId(fields.owner||nextReview?.owner,userIds);
        const {data:review}=await api.post(pathFor(table,saved.ai_system_id)+'/reviews',{due_date:due,...cadence,owner_id:owner,...snapshot(saved)});
        didWrite=true;claimReviews(kind,key,purpose,review);
      }else{
        const patch={};
        if(kind==='risk')Object.assign(patch,{next_review:due,review_cadence:cadence.recurrence});
        else if(purpose==='review')Object.assign(patch,{next_review:due,review_frequency:cadence.recurrence==='none'?'as_needed':cadence.recurrence});
        else if(purpose==='assurance')Object.assign(patch,{separate_assurance_review:!!due,assurance_review_date:due,assurance_cadence:cadence.recurrence});
        else throw Error('Configure this vendor review in the native vendor contract or offboarding schedule.');
        if(cadence.custom_recurrence_days)patch.custom_recurrence_days=cadence.custom_recurrence_days;
        await change('patch',table,key,'',patch);
        await claimGenerated(kind,key,purpose);
      }
    }
  }
  return {didWrite,identityMaps,handled};
}
