import {AI_DEFAULTS,AI_KEYS,aiProjection,validateAI,catalog} from '../lib/aiGovernance';
import {record,write,audit,uid,now,ids} from './store';
import {reviewView} from '../lib/reviewOccurrences';
import { validateAssignment } from './assignmentEligibility';

export function aiRequest(db,path,method,params,body){
  db.ai_systems||=[];db.ai_intake||={};db.ai_counters||={};
  const view=row=>aiProjection(row,db.reviews,db.risks);
  const writable=()=>{if(!['super_admin','platform_admin','client_contributor'].includes(db.user.role))throw new Error('Read-only role');};
  const admin=()=>{if(!['super_admin','platform_admin'].includes(db.user.role))throw new Error('Only platform administrators can make this decision');};
  const checkClient=cid=>{record(db,'clients',cid);if(db.user.role!=='super_admin'&&!(db.user.role==='platform_admin'&&!db.user.client_ids?.length)&&!db.user.client_ids?.includes(cid))throw new Error('Forbidden');};
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
  if(method==='get'&&action==='activity'){
    const reviewIds=db.reviews.filter(r=>r.client_id===old.client_id&&r.ai_system_id===id).map(r=>r.review_id);
    return db.logs.filter(l=>l.client_id===old.client_id&&[id,...reviewIds].includes(l.entity_id));
  }
  if(old?.status==='retired')throw new Error('Retired AI records remain historical');
  if(action==='reviews'&&method==='post'){
    admin();if(old.status==='suspended')throw new Error('Inactive AI cannot start periodic reviews');
    if(!['quarterly','semiannual','annual','custom'].includes(body.recurrence)||!body.due_date||!Number.isFinite(Date.parse(body.due_date)))throw new Error('Choose a valid date and cadence');
    if(body.recurrence==='custom'&&(!Number.isInteger(body.custom_recurrence_days)||body.custom_recurrence_days<1||body.custom_recurrence_days>3650))throw new Error('Custom recurrence must be 1–3650 days');
    const existing=db.reviews.find(r=>r.ai_system_id===id&&r.ai_review_purpose==='periodic'&&!['completed','cancelled'].includes(r.status));if(existing)return reviewView(existing);
    const r=write(db,'reviews',{client_id:old.client_id,ai_system_id:id,ai_review_purpose:'periodic',title:`AI Governance Review — ${old.display_id} — ${old.name}`,review_type:'ai_governance',owner_id:old.owner_id,due_date:body.due_date,recurrence:body.recurrence,custom_recurrence_days:body.custom_recurrence_days||null});
    audit(db,'AI Governance Review scheduled','ai_systems',old,{review_id:r.review_id});return r;
  }
  if(action==='material-change'&&method==='post'){
    admin();if(!body.note?.trim())throw new Error('Describe the material change');old.material_change_at=now();old.material_change_note=body.note;old.updated_at=now();audit(db,'AI material change recorded','ai_systems',old,{note:body.note});return view(old);
  }
  if(action==='links'&&method==='post'){
    if(!['risks','findings','tasks','policies','requirements','vendors'].includes(body.kind))throw new Error('Unsupported relationship');
    const target=record(db,body.kind,body.id);if(target.client_id!==old.client_id)throw new Error('Relationship must belong to the same client');
    const classification=body.classification||'Context';if(!catalog.relationship_classes.includes(classification))throw new Error('Invalid relationship classification');
    if(/^(Explicit|Required)/.test(classification)&&!(body.source?.trim()&&body.rationale?.trim()))throw new Error('Requirement claims need an authoritative source and applicability rationale');
    const link={kind:body.kind,id:body.id,classification,source:body.source||'',rationale:body.rationale||''};old.related_links||=[];if(!old.related_links.some(l=>JSON.stringify(l)===JSON.stringify(link)))old.related_links.push(link);audit(db,'AI record linked','ai_systems',old,link);return {ok:true};
  }
  if(action||!['post','patch'].includes(method)||(!id&&method!=='post')||(id&&method!=='patch'))throw new Error('AI records are retained; use the supported lifecycle controls');
  if(old&&Object.prototype.hasOwnProperty.call(body,'expected_updated_at')&&body.expected_updated_at!==(old.updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
  body={...body};delete body.expected_updated_at;
  if(Object.keys(body).some(k=>![...AI_KEYS,'client_id'].includes(k)))throw new Error('Unknown or read-only AI fields');
  const row={...AI_DEFAULTS,...old,...body};validateAI(db,row,old);validateAssignment(db,'ai_systems',row,old);
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
