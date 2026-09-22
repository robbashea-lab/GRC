import { validateAssignment } from './assignmentEligibility';
import {CATALOGS,frameworkCatalog,frameworkDefinition,FRAMEWORKS,ASSESSMENT_STATUSES,CADENCES,reviewConfig} from '../lib/frameworks';
import {record,write,audit,now,ids} from './store';
import {action} from './workflows';
const stable=(cid,kind,key,framework='cis-ig1')=>`fw_${cid}_${kind}_${framework==='cis-ig1'?'':framework+'_'}${key}`;
const assessmentTitle=a=>`${a.framework_key==='cis-ig1'?'CIS':a.framework_key.toUpperCase()} ${a.definition_id} · ${frameworkDefinition(a.framework_key,a.definition_id)?.title||a.definition_id}`;
const writable=db=>{if(!['super_admin','platform_admin','client_contributor'].includes(db.user.role))throw new Error('Read-only role');};
export function frameworkScope(db,cid){
  record(db,'clients',cid);
  if(db.user.role!=='super_admin'&&!(db.user.role==='platform_admin'&&!db.user.client_ids?.length)&&!db.user.client_ids?.includes(cid))throw new Error('Forbidden');
}
export function validateFrameworkConfig(state){
  const configs=state.framework_reviews||{};
  if(typeof configs!=='object'||Array.isArray(configs)||Object.keys(configs).some(k=>!Object.values(CATALOGS).some(c=>c.review_plans.some(p=>p.key===k))))throw new Error('Invalid framework Review configuration');
  for(const c of Object.values(configs)){
    if(!c||Object.keys(c).some(k=>!['enabled','recurrence','custom_recurrence_days','due_date'].includes(k)))throw new Error('Invalid framework Review fields');
    if((c.enabled!=null&&typeof c.enabled!=='boolean')||(c.recurrence&&!CADENCES.includes(c.recurrence)))throw new Error('Invalid client cadence');
    if(c.recurrence==='custom'&&(!Number.isInteger(c.custom_recurrence_days)||c.custom_recurrence_days<1||c.custom_recurrence_days>3650))throw new Error('Custom cadence must be 1–3650 days');
    if(c.due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(c.due_date))throw new Error('Invalid Review date');
  }
}
export function reconcileFramework(db,cid,state){
  db.framework_assessments||=[];
  for(const [key,catalog] of Object.entries(CATALOGS)){
    if(!(key in (state.requirements||{})))continue;
    if(state.requirements[key]!=='applies'){
      for(const r of db.reviews.filter(r=>r.client_id===cid&&r.framework_key===key))r.framework_driver_active=false;
      continue;
    }
    reconcileCatalog(db,cid,state,key,catalog);
  }
}
function reconcileCatalog(db,cid,state,key,catalog){
  for(const d of catalog.requirements){
    const aid=stable(cid,'assessment',d.id,key);
    if(!db.framework_assessments.some(a=>a.framework_assessment_id===aid))db.framework_assessments.push({framework_assessment_id:aid,client_id:cid,framework_key:key,framework_version:catalog.version,definition_id:d.id,status:'not_assessed',implementation:'',technology:'',notes:'',na_rationale:'',owner_id:null,process_owner_id:null,created_at:now(),related_links:[],assessment_history:[]});
  }
  for(const p of catalog.review_plans){
    const equivalent=Object.values(CATALOGS).flatMap(c=>c.review_plans).filter(other=>p.baseline_key&&other.baseline_key===p.baseline_key).map(other=>other.key);
    const c=reviewConfig(state,p),old=db.reviews.find(r=>r.client_id===cid&&r.framework_plan_key===p.key)||(p.baseline_key&&db.reviews.find(r=>r.client_id===cid&&(r.baseline_key===p.baseline_key||equivalent.includes(r.framework_plan_key))));
    if(!c.enabled){if(old?.framework_key===key)old.framework_driver_active=false;continue;}
    const mapping={framework_key:key,framework_version:catalog.version,framework_plan_key:p.key,framework_driver_active:true,framework_safeguards:p.safeguards,framework_basis:p.basis,framework_source_cadence:p.source_cadence,framework_default_cadence:p.default_cadence};
    let review=old;
    for(const field of ['purpose','evidence_expectations','completion_criteria'])if(p[field])mapping['framework_'+field]=p[field];
    if(old){if(!old.framework_key||old.framework_key===key)Object.assign(old,mapping);}
    else review=write(db,'reviews',{client_id:cid,title:p.title,review_type:p.review_type,status:'needs_scheduling',due_date:c.due_date||null,recurrence:c.recurrence,custom_recurrence_days:c.custom_recurrence_days,owner_id:null,...mapping});
    for(const a of db.framework_assessments.filter(a=>a.client_id===cid&&a.framework_key===key&&p.safeguards.includes(a.definition_id))){
      if(!a.related_links.some(l=>l.kind==='reviews'&&l.id===review.review_id))a.related_links.push({kind:'reviews',id:review.review_id});
    }
  }
}
export function frameworkRelated(db,row){
  const cid=row.client_id,aid=row.framework_assessment_id,did=row.definition_id,result={};
  for(const kind of ['reviews','findings','tasks','risks','policies','requirements','evidence','vendors']){
    const direct=(row.related_links||[]).filter(l=>l.kind===kind).map(l=>l.id);
    result[kind]=(db[kind]||[]).filter(r=>r.client_id===cid&&(direct.includes(r[ids[kind]])||r.framework_assessment_id===aid||
      (kind==='reviews'&&r.framework_key===row.framework_key&&r.framework_safeguards?.includes(did))||
      (kind==='policies'&&frameworkCatalog(row.framework_key)?.policy_mappings.some(p=>p.policy_key===r.baseline_key&&p.safeguards.includes(did)))||
      (kind==='evidence'&&['framework_assessment','framework_assessments'].includes(r.linked_type)&&r.linked_id===aid)));
  }
  const rids=result.reviews.map(r=>r.review_id);
  result.findings=[...new Map([...result.findings,...db.findings.filter(f=>f.client_id===cid&&rids.includes(f.review_id))].map(r=>[r.finding_id,r])).values()];
  const fids=result.findings.map(f=>f.finding_id);
  result.tasks=[...new Map([...result.tasks,...db.tasks.filter(t=>t.client_id===cid&&(fids.includes(t.finding_id)||rids.includes(t.review_id)))].map(r=>[r.task_id,r])).values()];
  result.evidence=[...new Map([...result.evidence,...db.evidence.filter(e=>e.client_id===cid&&['review','reviews'].includes(e.linked_type)&&rids.includes(e.linked_id))].map(r=>[r.evidence_id,r])).values()];
  result.evidence=result.evidence.filter(e=>!row.unlinked_evidence_ids?.includes(e.evidence_id));
  return result;
}
export function frameworkReverse(db,kind,source,result){
  if(kind==='framework_assessments')return frameworkRelated(db,source);
  const fid=source.finding_id,aid=source.framework_assessment_id||(kind==='evidence'&&['framework_assessment','framework_assessments'].includes(source.linked_type)?source.linked_id:null)||db.findings.find(f=>f.client_id===source.client_id&&f.finding_id===fid)?.framework_assessment_id;
  result.framework_assessments=(db.framework_assessments||[]).filter(a=>a.client_id===source.client_id&&(a.framework_assessment_id===aid||a.related_links?.some(l=>l.kind===kind&&l.id===source[ids[kind]])||(kind==='reviews'&&a.framework_key===source.framework_key&&source.framework_safeguards?.includes(a.definition_id))||(kind==='policies'&&frameworkCatalog(a.framework_key)?.policy_mappings.some(m=>m.policy_key===source.baseline_key&&m.safeguards.includes(a.definition_id)))))
    .filter(a=>kind!=='evidence'||!a.unlinked_evidence_ids?.includes(source.evidence_id)).map(a=>({...a,title:assessmentTitle(a)}));
  return result;
}
export function frameworkRequest(db,path,method,params,body){
  db.framework_assessments||=[];
  const [,kind,id,operation]=path.split('/');
  if(kind==='frameworks'&&method==='get'){
    frameworkScope(db,params.client_id);const framework=FRAMEWORKS.find(f=>f.key===id);if(!framework)throw new Error('Framework not found');
    const assessments=framework.implemented?db.framework_assessments.filter(a=>a.client_id===params.client_id&&a.framework_key===id):[];
    return {framework,selected:db.requirements.some(r=>r.client_id===params.client_id&&r.baseline_key===id&&r.baseline_response==='applies'),configured:!!assessments.length,definitions:assessments.length?frameworkCatalog(id)?.requirements||[]:[],assessments};
  }
  const row=record(db,'framework_assessments',id);frameworkScope(db,row.client_id);if(method!=='get')writable(db);
  if(method==='get'&&!operation)return row;
  if(method==='get'&&operation==='related')return frameworkRelated(db,row);
  if(method==='get'&&operation==='activity')return db.logs.filter(l=>l.client_id===row.client_id&&l.entity_id===id);
  if(method==='patch'&&!operation){
    const fields=['status','implementation','technology','notes','na_rationale','owner_id','process_owner_id','addressable_decision','addressable_rationale'];
    if(Object.keys(body).some(k=>!fields.includes(k)))throw new Error('Unknown or immutable assessment fields');
    const data={...row,...body};if(!ASSESSMENT_STATUSES[data.status]||['implementation','technology','notes','na_rationale'].some(k=>typeof data[k]!=='string'))throw new Error('Invalid assessment');
    if(data.status==='not_applicable'&&!data.na_rationale.trim())throw new Error('N/A rationale is required');
    if(data.status==='addressed'&&!data.implementation.trim())throw new Error('Describe implementation before marking Addressed');
    const definition=frameworkDefinition(row.framework_key,row.definition_id);
    if(body.addressable_decision!=null&&!['','as_written','equivalent_alternative','not_reasonable_appropriate'].includes(body.addressable_decision))throw new Error('Invalid addressability decision');
    if(body.addressable_rationale!=null&&(typeof body.addressable_rationale!=='string'||body.addressable_rationale.length>4000))throw new Error('Invalid addressability rationale');
    if(definition?.specification==='addressable'){
      if(data.status==='not_applicable')throw new Error('Addressable is not optional; record an addressability decision instead of N/A');
      if(data.status==='addressed'&&(!data.addressable_decision||!data.addressable_rationale?.trim()))throw new Error('Document the addressability decision and rationale before marking Addressed');
    }else if(body.addressable_decision||body.addressable_rationale)throw new Error('Addressability fields apply only to addressable specifications');
    validateAssignment(db, 'framework_assessments', data, row);
    if(data.process_owner_id&&!db.contacts.some(c=>c.client_id===row.client_id&&c.contact_id===data.process_owner_id))throw new Error('Process owner must be a client Contact');
    const changed=Object.keys(body).filter(k=>body[k]!==row[k]);
    if(changed.length){Object.assign(row,body,{last_assessed:now(),assessed_by:db.user.user_id});row.assessment_history.push({...Object.fromEntries(fields.map(k=>[k,row[k]])),at:row.last_assessed,by:row.assessed_by});audit(db,'Framework assessment updated','framework_assessments',row,{changed_fields:changed,status:row.status});}
    return row;
  }
  if(method==='post'&&operation==='links'){
    if(!['reviews','findings','tasks','risks','policies','evidence','requirements','vendors'].includes(body.kind))throw new Error('Unsupported relationship');
    const target=record(db,body.kind,body.id);if(target.client_id!==row.client_id)throw new Error('Relationship must belong to this client');
    if(body.kind==='evidence')row.unlinked_evidence_ids=(row.unlinked_evidence_ids||[]).filter(id=>id!==body.id);
    if(!row.related_links.some(l=>l.kind===body.kind&&l.id===body.id))row.related_links.push({kind:body.kind,id:body.id});audit(db,'Framework record linked','framework_assessments',row,body);return {ok:true};
  }
  if(method==='delete'&&operation==='links'){
    if(body.kind!=='evidence')throw new Error('Only Evidence relationships can be unlinked here');
    const target=record(db,'evidence',body.id);if(target.client_id!==row.client_id)throw new Error('Relationship must belong to this client');
    row.related_links=row.related_links.filter(l=>!(l.kind==='evidence'&&l.id===body.id));
    row.unlinked_evidence_ids=[...new Set([...(row.unlinked_evidence_ids||[]),body.id])];
    audit(db,'Framework Evidence unlinked','framework_assessments',row,body);return {ok:true};
  }
  if(method==='post'&&operation==='findings'){
    if(!body.title?.trim()||!body.remediation_title?.trim()||!body.request_id||!['low','medium','high','critical'].includes(body.severity||'medium'))throw new Error('Finding and Action titles, valid severity and request ID are required');
    const fid=stable(row.client_id,'finding',id+':'+body.request_id);let f=db.findings.find(f=>f.finding_id===fid);
    if(!f){f={finding_id:fid,client_id:row.client_id,title:body.title.trim(),description:body.description||'',severity:body.severity||'medium',status:'open',framework_assessment_id:id,source:assessmentTitle(row),owner_id:row.owner_id,remediation_title:body.remediation_title.trim(),created_at:now(),updated_at:now()};validateAssignment(db, 'findings', f);db.findings.push(f);audit(db,'Finding raised','framework_assessments',row,{finding_id:fid});audit(db,'create','findings',f);}
    action(db,'findings',fid,'create-task',{title:f.remediation_title});return f;
  }
  throw new Error('Unsupported framework operation; assessment history is retained');
}
