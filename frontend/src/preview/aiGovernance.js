import {AI_DEFAULTS,AI_KEYS,aiProjection,aiClientAvailable,validateAI,catalog} from '../lib/aiGovernance';
import {validateCatalogKey} from '../lib/registerCatalogIdentity';
import {record,write,audit,uid,now,ids} from './store';
import {reviewView,scheduledDate} from '../lib/reviewOccurrences';
import { validateAssignment, clientAccess } from './assignmentEligibility';
import {AI_PILOT_DEFAULTS,AI_PILOT_KEYS,aiScope} from '../lib/brawndoAI';
import {reviewedScreening,screeningReviewSnapshot} from '../lib/aiOnboarding';

// Shared native Demo writer; callers own their external or onboarding authorization contract.
export function scheduleAIReview(db,old,body){
  const existing=db.reviews.find(r=>r.client_id===old.client_id&&r.ai_system_id===old.ai_system_id&&r.ai_review_purpose==='periodic'&&!['completed','cancelled'].includes(r.status));if(existing)return reviewView(existing);
  const review=write(db,'reviews',{client_id:old.client_id,ai_system_id:old.ai_system_id,ai_review_purpose:'periodic',title:`AI Governance Review - ${old.display_id} - ${old.name}`,review_type:'ai_governance',owner_id:body.owner_id,due_date:body.due_date,recurrence:body.recurrence,custom_recurrence_days:body.custom_recurrence_days||null});
  audit(db,'AI Governance Review scheduled','ai_systems',old,{review_id:review.review_id});return review;
}

export function aiRequest(db,path,method,params,body){
  db.ai_systems||=[];db.ai_intake||={};db.ai_counters||={};
  const view=row=>aiProjection(row,db.reviews,db.risks);
  const writable=()=>{if(!['super_admin','platform_admin','client_contributor'].includes(db.user.role))throw new Error('Read-only role');};
  const admin=()=>{if(!['super_admin','platform_admin'].includes(db.user.role))throw new Error('Only platform administrators can make this decision');};
  const checkClient=cid=>{record(db,'clients',cid);if(!clientAccess(db.user,cid))throw new Error('Forbidden');};
  if(method!=='get')writable();
  if(path==='/ai-intake'){
    const cid=params.client_id||body.client_id;checkClient(cid);
    if(method==='get')return db.ai_intake[cid]||{client_id:cid,usage:'unsure',indicators:[]};
    if(Object.prototype.hasOwnProperty.call(body,'expected_updated_at')&&body.expected_updated_at!==(db.ai_intake[cid]?.updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
    if(method!=='post'||!['yes','no','unsure'].includes(body.usage)||!Array.isArray(body.indicators)||body.indicators.some(i=>!catalog.intake_indicators.includes(i)))throw new Error('Invalid AI intake');
    db.ai_intake[cid]={client_id:cid,usage:body.usage,indicators:body.usage==='yes'?body.indicators:[],updated_at:now()};audit(db,'AI intake updated','clients',record(db,'clients',cid));return db.ai_intake[cid];
  }
  const [, ,id,action]=path.split('/');
  if(!id&&method==='get'){checkClient(params.client_id);return db.ai_systems.filter(r=>r.client_id===params.client_id).map(view);}
  const old=id?record(db,'ai_systems',id):null;checkClient(old?.client_id||body.client_id);
  const aiWorkflow=aiClientAvailable(record(db,'clients',old?.client_id||body.client_id));
  if(method==='get'&&action==='reviews'&&path.endsWith('/pending')){admin();return {pending:null};}
  if(method==='post'&&action==='reviews'&&path.endsWith('/recover')){admin();throw new Error('No interrupted Review schedule exists in this Demo session');}
  if(method==='get'&&action==='activity'){
    const reviewIds=db.reviews.filter(r=>r.client_id===old.client_id&&r.ai_system_id===id).map(r=>r.review_id);
    return db.logs.filter(l=>l.client_id===old.client_id&&[id,...reviewIds].includes(l.entity_id));
  }
  if(old?.status==='retired')throw new Error('Retired AI records remain historical');
  if(action==='approval'&&method==='post'){
    admin();if(!aiWorkflow)throw new Error('This client is unavailable for AI approval');
    if(body.expected_updated_at!==(old.updated_at??null))throw new Error('Record changed since it was opened; reload before deciding');
    if(Object.keys(body).some(k=>!['status','note','expected_updated_at'].includes(k)))throw new Error('Unknown decision fields');
    if(!['approved','approved_with_conditions','not_approved'].includes(body.status)||typeof body.note!=='string'||!body.note.trim()||body.note.length>10000)throw new Error('Choose a decision and document its rationale');
    if(['approved','approved_with_conditions'].includes(body.status)&&(!old.environment?.trim()||!old.description?.trim()||!old.permitted_data_types?.length))throw new Error('Document the environment, uses and permitted data before approval');
    if(body.status==='approved_with_conditions'&&!old.restrictions?.trim())throw new Error('Document approval conditions before conditional approval');
    const decision={status:body.status,note:body.note.trim(),scope:aiScope(old),at:now(),by:db.user.user_id,by_name:db.user.name||db.user.email};
    old.approval_history=[...(old.approval_history||[]),decision];old.approval_status=body.status;
    old.updated_at=new Date(Math.max(Date.now(),(Date.parse(old.updated_at)||0)+1)).toISOString();
    audit(db,'AI approval decision recorded','ai_systems',old,{status:body.status});return view(old);
  }
  if(action==='reviews'&&method==='post'){
    admin();if(old.status==='suspended')throw new Error('Inactive AI cannot start periodic reviews');
    if(!Object.hasOwn(body,'expected_updated_at'))throw Object.assign(new Error('Reopen this AI record before scheduling a Review'),{status:428});
    if(body.expected_updated_at!==(old.updated_at??null))throw Object.assign(new Error('Record changed since it was opened; reload before scheduling a Review'),{status:409});
    if(Object.keys(body).some(key=>!['due_date','recurrence','custom_recurrence_days','owner_id','expected_updated_at'].includes(key)))throw new Error('Unknown AI Review scheduling fields');
    if(typeof body.owner_id!=='string'||!body.owner_id)throw new Error('Choose an eligible Review owner');
    validateAssignment(db,'reviews',{client_id:old.client_id,owner_id:body.owner_id});
    if(!['quarterly','semiannual','annual','custom'].includes(body.recurrence)||!scheduledDate(body.due_date))throw new Error('Choose a valid date and cadence');
    if(body.recurrence==='custom'&&(!Number.isInteger(body.custom_recurrence_days)||body.custom_recurrence_days<1||body.custom_recurrence_days>3660))throw new Error('Custom recurrence must be 1â€“3660 days');
    return scheduleAIReview(db,old,body);
  }
  if(action==='material-change'&&method==='post'){
    admin();
    if(!aiWorkflow)throw new Error('This client is unavailable for AI reassessment');
    if(Object.keys(body).some(key=>!['note','expected_updated_at'].includes(key)))throw new Error('Unknown material-change fields');
    if(typeof body.note!=='string'||!body.note.trim()||body.note.length>10000)throw new Error('Describe the material change in at most 10,000 characters');
    if(!Object.hasOwn(body,'expected_updated_at'))throw Object.assign(new Error('Reopen this AI record before recording a material change'),{status:428});
    if(body.expected_updated_at!==(old.updated_at??null))throw Object.assign(new Error('Record changed since it was opened; reload before recording a material change'),{status:409});
    const at=new Date(Math.max(Date.now(),(Date.parse(old.updated_at)||0)+1)).toISOString();
    if(['approved','approved_with_conditions','not_approved'].includes(old.approval_status))old.approval_status='pending_assessment';
    old.material_change_at=at;old.material_change_note=body.note;old.updated_at=at;
    audit(db,'AI material change recorded','ai_systems',old,{note:body.note});return view(old);
  }
  if(action==='links'&&method==='post'){
    if(!['risks','findings','tasks','policies','requirements','vendors'].includes(body.kind))throw new Error('Unsupported relationship');
    const target=record(db,body.kind,body.id);if(target.client_id!==old.client_id)throw new Error('Relationship must belong to the same client');
    const classification=body.classification||'Context';if(!catalog.relationship_classes.includes(classification))throw new Error('Invalid relationship classification');
    if(/^(Explicit|Required)/.test(classification)&&!(body.source?.trim()&&body.rationale?.trim()))throw new Error('Requirement claims need an authoritative source and applicability rationale');
    const link={kind:body.kind,id:body.id,classification,source:body.source||'',rationale:body.rationale||''};old.related_links||=[];if(!old.related_links.some(l=>JSON.stringify(l)===JSON.stringify(link)))old.related_links.push(link);audit(db,'AI record linked','ai_systems',old,link);return {ok:true};
  }
  if(action||!['post','patch'].includes(method)||(!id&&method!=='post')||(id&&method!=='patch'))throw new Error('AI records are retained; use the supported lifecycle controls');
  if(old&&!Object.hasOwn(body,'expected_updated_at'))throw Object.assign(new Error('Reopen this AI record before saving'),{status:428});
  if(old&&body.expected_updated_at!==(old.updated_at??null))throw Object.assign(new Error('Record changed since it was opened; reload before saving'),{status:409});
  body={...body};delete body.expected_updated_at;
  const screeningReview=body.onboarding_screening;
  if(Object.hasOwn(body,'onboarding_screening')&&(!old||!aiWorkflow||!screeningReview))throw new Error('Screening review requires an existing versioned AI record for an active or onboarding client');
  delete body.onboarding_screening;
  if(Object.keys(body).some(k=>![...AI_KEYS,...(aiWorkflow?AI_PILOT_KEYS:[]),'client_id'].includes(k)))throw new Error('Unknown or read-only AI fields');
  if(Object.prototype.hasOwnProperty.call(body,'catalog_key'))body.catalog_key=validateCatalogKey('ai_systems',body.catalog_key);
  const row={...AI_DEFAULTS,...AI_PILOT_DEFAULTS,...old,...body};validateAI(db,row,old);validateAssignment(db,'ai_systems',row,old);
  if(!old||row.name!==old.name) {
    const nameKey=row.name.trim().toLowerCase();
    if(db.ai_systems.some(item=>item.ai_system_id!==old?.ai_system_id&&item.client_id===row.client_id&&item.name?.trim().toLowerCase()===nameKey)) {
      throw Object.assign(new Error('An AI system with this name already exists for this client'),{status:409});
    }
    row.ai_name_key=nameKey;
  }
  if(!Object.hasOwn(old||{},'no_client_data')&&!Object.hasOwn(body,'no_client_data'))delete row.no_client_data;
  if(old)for(const [key,value] of Object.entries(AI_PILOT_DEFAULTS))
    if(!Object.hasOwn(old,key)&&!Object.hasOwn(body,key)&&JSON.stringify(row[key])===JSON.stringify(value))delete row[key];
  if(screeningReview)row.onboarding_screening=reviewedScreening(old,row,screeningReview,db.user.user_id,now());
  if(aiWorkflow){
    for(const key of ['environment','restrictions','data_settings'])if(Object.hasOwn(row,key)&&(typeof row[key]!=='string'||row[key].length>10000))throw new Error('Invalid '+key);
    if(Object.hasOwn(row,'permitted_data_types')&&(!Array.isArray(row.permitted_data_types)||row.permitted_data_types.some(v=>!catalog.data_types.includes(v))))throw new Error('Invalid permitted data classifications');
    if(!old)row.approval_status='pending_assessment';
    else if((JSON.stringify(aiScope(old))!==JSON.stringify(aiScope(row))||screeningReview&&screeningReviewSnapshot(old)!==screeningReviewSnapshot(row))&&['approved','approved_with_conditions','not_approved'].includes(old.approval_status)){
      row.approval_status='pending_assessment';row.material_change_at=now();row.material_change_note='Approval boundaries changed; reassessment required.';
      audit(db,'AI approval boundaries changed; reassessment required','ai_systems',row);
    }
  }
  if(['active','suspended','retired'].includes(row.status)&&old?.status!==row.status)admin();
  if(row.status==='retired')for(const r of db.reviews.filter(r=>r.ai_system_id===id&&r.client_id===row.client_id&&!['completed','cancelled'].includes(r.status))){write(db,'reviews',{recurrence:'none',status:r.status==='in_progress'?'in_progress':'cancelled'},r.review_id);audit(db,'AI retired; recurring review stopped','reviews',r);}
  if(!old){db.ai_counters[row.client_id]=(db.ai_counters[row.client_id]||0)+1;row.ai_system_id=uid('ai');row.display_id=`AI-${String(db.ai_counters[row.client_id]).padStart(3,'0')}`;row.created_at=now();row.created_by=db.user.user_id;row.related_links=[];db.ai_systems.push(row);}else Object.assign(old,row);
  row.updated_at=new Date(Math.max(Date.now(),(Date.parse(old?.updated_at)||0)+1)).toISOString();if(old)old.updated_at=row.updated_at;audit(db,!old?'AI use case created':row.status==='retired'?'AI retired':'AI governance updated','ai_systems',row);return view(row);
}
export function aiRelated(db,kind,source,data){
  const cid=source.client_id,id=source[ids[kind]],aiRows=(db.ai_systems||[]).filter(a=>a.client_id===cid);
  if(kind==='ai_systems'){
    const reviewIds=db.reviews.filter(r=>r.client_id===cid&&r.ai_system_id===id).map(r=>r.review_id);
    for(const k of ['risks','findings','tasks','policies','requirements','vendors']){
      const keys=(source.related_links||[]).filter(x=>x.kind===k).map(x=>x.id);
      data[k]=(db[k]||[]).filter(r=>r.client_id===cid&&(keys.includes(r[ids[k]])||reviewIds.includes(r.review_id)||k==='vendors'&&r.vendor_id===source.vendor_id));
    }
    data.reviews=db.reviews.filter(r=>reviewIds.includes(r.review_id));
    data.evidence=db.evidence.filter(e=>e.client_id===cid&&(e.linked_id===id&&['ai_system','ai_systems'].includes(e.linked_type)||reviewIds.includes(e.linked_id)&&['review','reviews'].includes(e.linked_type)));
  }else data.ai_systems=aiRows.filter(a=>(a.related_links||[]).some(l=>l.kind===kind&&l.id===id)||a.ai_system_id===source.ai_system_id||db.reviews.some(r=>r.client_id===cid&&r.review_id===source.review_id&&r.ai_system_id===a.ai_system_id)||kind==='vendors'&&a.vendor_id===id);
  return data;
}
