import {isoAuditCatalog,auditPackage,auditActivationPlan,auditProgress,initialAuditState,AUDIT_STATUSES,AUDIT_RESULTS} from '../lib/isoAudit';
import criteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import {record,write,now,audit,clone} from './store';
import {clientAccess,validateAssignment} from './assignmentEligibility';
import {reviewView,reviewSchedule,occurrenceId,assertCurrentOccurrence,belongsToOccurrence} from '../lib/reviewOccurrences';

const fail=(message,status=422)=>{const error=new Error(message);error.status=status;throw error;};
function scoped(db,cid){if(!clientAccess(db.user,cid))fail('Forbidden for this client',403);return record(db,'clients',cid);}
function evidence(db,review,id){const e=db.evidence.find(e=>e.client_id===review.client_id&&e.evidence_id===id&&!e.archived_at);if(!e)fail('Select available Evidence from this client');return e;}
function validateItem(db,review,item){
  if(!AUDIT_STATUSES[item.status]||item.result&&!AUDIT_RESULTS[item.result])fail('Invalid audit status or result');
  if(typeof item.notes!=='string'||item.notes.length>20000||typeof item.na_rationale!=='string'||item.na_rationale.length>4000)fail('Invalid audit notes');
  if(item.status==='not_applicable'&&(!item.na_rationale.trim()||item.result))fail('Document N/A rationale without an audit result');
  for(const key of ['evidence_ids','finding_ids'])if(!Array.isArray(item[key])||item[key].length>50)fail('Invalid audit relationships');
  item.evidence_ids.forEach(id=>evidence(db,review,id));
  item.finding_ids.forEach(id=>{if(!db.findings.some(f=>f.finding_id===id&&f.client_id===review.client_id&&f.review_id===review.review_id&&belongsToOccurrence(f,review)))fail('Select a Finding from this audit occurrence');});
}
export function isoCompletionSnapshot(db,review){
  const output={};
  if(review.iso_audit){
    const state=review.iso_audit,p=auditProgress(state);
    if(p.complete!==p.total)fail('Complete every applicable audit item and record each result before closing the package');
    Object.values(state.items).forEach(i=>{validateItem(db,review,i);if(['observation','nonconformity'].includes(i.result)&&!i.finding_ids.length)fail('Link an Observation or Nonconformity to a shared Finding before package closure');});
    if(!state.report_evidence_id)fail('Link the issued audit report before closing the package');
    const ids=[...new Set([...Object.values(state.items).flatMap(i=>i.evidence_ids),state.report_evidence_id])];
    output.iso_audit={...clone(state),methodology_source:isoAuditCatalog.source,progress:p,evidence:ids.map(id=>{const e=evidence(db,review,id);return {evidence_id:id,filename:e.filename,version:e.version,sha256:e.sha256};})};
  }
  if((review.framework_drivers||[review]).some(d=>d.framework_plan_key==='iso-soa-review')){
    output.iso_soa_snapshot={assessments:db.framework_assessments.filter(a=>a.client_id===review.client_id&&a.framework_key==='iso-27001'&&a.definition_id.startsWith('A.')).map(({assessment_history,...a})=>clone(a)),profile:clone(record(db,'clients',review.client_id).profile||null),captured_at:now()};
  }
  return output;
}
export function isoAuditRequest(db,parts,method,params,body){
  const [kind,id,action,itemKey]=parts;
  if(kind==='iso-audit'){
    const cid=body.client_id||params.client_id,client=scoped(db,cid);
    if(method==='post'&&id==='activate'){
      if(!['super_admin','platform_admin'].includes(db.user.role))fail('Program administrator required',403);
      if(Object.keys(body).some(k=>!['client_id','start_date','first_package','auditor_id','scope','independence'].includes(k)))fail('Unknown configuration field');
      if(!db.requirements.some(r=>r.client_id===cid&&r.baseline_key==='iso-27001'&&r.baseline_response==='applies'))fail('Enable ISO in Client Profile first',409);
      const schedule=auditActivationPlan(body.start_date,body.first_package);
      if(!schedule.length||!client.iso_audit_program&&body.start_date<now().slice(0,10))fail('Activation must be prospective, not before today');
      if(!body.scope?.trim()||body.scope.length>4000||!body.independence?.trim()||body.independence.length>4000||!body.auditor_id)fail('Document scope and auditor objectivity');
      validateAssignment(db,'reviews',{client_id:cid,owner_id:body.auditor_id});
      if(client.iso_audit_program){
        if(JSON.stringify(client.iso_audit_program.configuration)!==JSON.stringify(body))fail('Program already configured. Adjust package dates and assignments in Reviews',409);
      }else{
        const at=now();client.iso_audit_program={configuration:clone(body),activated_at:at,activated_by:db.user.user_id,status:'active',schedule};
        schedule.forEach(p=>{
          const rid='demo_isoa_'+cid+'_'+p.package_key;
          const review={review_id:rid,client_id:cid,title:'Internal Audit — '+p.title,review_type:'requirements',owner_id:body.auditor_id,recurrence:'annual',due_date:p.due_date,status:'upcoming',scope:body.scope,
            created_at:at,updated_at:at,created_by:db.user.user_id,framework_key:'iso-27001',framework_safeguards:[...new Set(auditPackage(p.package_key).items.map(i=>i.definition_id))],
            framework_basis:'Organization-defined internal audit program',framework_source_cadence:'Planned intervals; four staggered annual packages are organization-defined, not an ISO-prescribed quarterly frequency.',
            governance_context:{category:'organizational',rationale:body.scope,cadence_source:'organization_defined',cadence_rationale:'Management selected four staggered annual audit packages for planned coverage. ISO requires planned intervals, not this quarterly rotation.'},
            iso_audit:initialAuditState(p.package_key),audit_independence:body.independence,audit_program_start:body.start_date,occurrences:[]};
          Object.assign(review,reviewSchedule(review),{current_occurrence_id:occurrenceId(review)});db.reviews.push(review);
        });
        audit(db,'ISO audit program activated','clients',client);
      }
    }else if(method!=='get')fail('Unsupported audit operation');
    return {program:client.iso_audit_program||null,reviews:db.reviews.filter(r=>r.client_id===cid&&r.iso_audit).map(reviewView)};
  }
  if(kind==='reviews'&&action==='iso-audit'&&method==='patch'){
    const review=record(db,'reviews',id);scoped(db,review.client_id);
    assertCurrentOccurrence(review,body.occurrence_id);
    if(!Object.prototype.hasOwnProperty.call(body,'expected_updated_at')||body.expected_updated_at!==(review.updated_at??null))fail('Audit package changed; reload before saving',409);
    if(!review.iso_audit)fail('This Review is not an audit package');
    const allowed=itemKey?['status','result','notes','na_rationale','evidence_ids','finding_ids','assessment_checks']:['report_evidence_id'];
    if(Object.keys(body).some(k=>!['expected_updated_at','occurrence_id',...allowed].includes(k)))fail('Unknown audit fields');
    const state=clone(review.iso_audit);
    if(itemKey){
      const definition=auditPackage(state.package_key).items.find(i=>i.key===itemKey);
      if(!definition)fail('Audit item not found',404);
      const item=Object.fromEntries(allowed.filter(k=>k!=='assessment_checks').map(k=>[k,body[k]]));
      const previous=state.items[itemKey]||{};
      if(Object.prototype.hasOwnProperty.call(body,'assessment_checks')){
        const entry=criteria.requirements[definition.definition_id]||{};
        const valid=new Set([...(entry.coverage==='verified'?entry.criteria.map(c=>c.id):[]),...(previous.assessment_checks||[])]);
        if(!Array.isArray(body.assessment_checks)||body.assessment_checks.length>30||body.assessment_checks.some(c=>typeof c!=='string'||!valid.has(c)))fail('Invalid ISO audit assessment checks');
        item.assessment_checks=[...new Set(body.assessment_checks)];
      }else if('assessment_checks' in previous)item.assessment_checks=previous.assessment_checks;
      validateItem(db,review,item);
      state.items[itemKey]={...item,updated_at:now(),updated_by:db.user.user_id};
    }else{if(body.report_evidence_id)evidence(db,review,body.report_evidence_id);state.report_evidence_id=body.report_evidence_id;}
    write(db,'reviews',{iso_audit:state},id);audit(db,'Audit work updated','reviews',review,{occurrence_id:occurrenceId(review)});
    return reviewView(record(db,'reviews',id));
  }
}
