import {aiRequest} from './aiGovernance';
import {commandRequest} from './commandRequests';
import {isCisClient} from './cisCapability';
import {clientAccess} from './assignmentEligibility';
import {record,write,audit,now} from './store';
import {aiProjection} from '../lib/aiGovernance';
import {annualDate,questions,proposalFor,detailsError,screeningScope} from '../lib/aiOnboarding';

const reject=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).length===keys.length&&keys.every(key=>Object.hasOwn(object,key));
export function aiOnboardingRequest(db,body,key) {
  const cid=body.client_id;
  if(!['super_admin','platform_admin'].includes(db.user.role)||!clientAccess(db.user,cid))reject('AI onboarding is not permitted for this client',403);
  if(!isCisClient(db,cid))reject('AI onboarding requires an active CIS client',403);
  if(db.ai_intake?.[cid]?.usage==='no')reject('Update the client AI profile before adding an AI system',409);
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key))reject('Invalid Idempotency-Key');
  const result=commandRequest(db,'/ai_systems/onboard',cid,key,body,()=>{
    if(!exact(body,['client_id','ai','screening','vendor','risk','confirmations'])||!exact(body.confirmations,['details','screening','risk'])||Object.values(body.confirmations).some(value=>value!==true))reject('Review all three onboarding steps');
    const {ai,screening,vendor,risk}=body;
    if(!exact(screening,['schema_version','catalog_version','answers'])||screening.schema_version!==1||screening.catalog_version!=='2026-10-25'||!exact(screening.answers,questions.map(question=>question.id))||Object.values(screening.answers).some(value=>value!==null&&typeof value!=='boolean'))reject('Use the reviewed ten-question screening');
    const aiFields=['catalog_key','name','provider','environment','description','owner_id','restrictions','purposes','data_types','permitted_data_types','access'];
    if(!ai||Object.keys(ai).some(field=>!aiFields.includes(field)))reject('Unknown AI details');
    for(const [field,max] of [['name',150],['provider',150],['environment',200],['description',1500],['restrictions',2000]])if(typeof ai[field]!=='string'||ai[field].length>max)reject('Invalid '+field);
    for(const field of ['purposes','data_types','permitted_data_types','access'])if(!Array.isArray(ai[field]))reject('Invalid '+field);
    if(!vendor||Object.keys(vendor).some(field=>!['mode','id','expected_updated_at','name','service','owner_id'].includes(field))||!['none','link','create'].includes(vendor.mode))reject('Invalid Vendor choice');
    const problem=detailsError({...ai,vendor});if(problem)reject(problem);
    for(const [field,max] of [['name',150],['service',250]])if(typeof vendor[field]!=='string'||vendor[field].length>max)reject('Invalid Vendor '+field);
    if(!exact(risk,['title','description','likelihood','impact','rationale','override'])||typeof risk.override!=='boolean')reject('Invalid Risk assessment');
    for(const [field,max] of [['title',240],['description',3000],['rationale',5000]])if(typeof risk[field]!=='string'||!risk[field].trim()||risk[field].length>max)reject('Document Risk '+field);
    for(const field of ['likelihood','impact'])if(risk[field]!==null&&(!Number.isInteger(risk[field])||risk[field]<1||risk[field]>5))reject('Risk ratings must be whole numbers from 1 to 5');
    if((risk.likelihood===null)!==(risk.impact===null)||risk.override&&risk.likelihood===null)reject('Choose both rating values');
    const proposal=proposalFor({...ai,answers:screening.answers});
    if(!risk.override&&(risk.likelihood!==proposal.likelihood||risk.impact!==proposal.impact))reject('The rating differs from the proposal; document a human override');
    let vendorId=null;
    if(vendor.mode==='link'){
      const existing=record(db,'vendors',vendor.id);
      if(existing.client_id!==cid||['offboarded','retired','inactive','terminated'].includes(existing.status))reject('Choose an available Vendor belonging to this client');
      if(existing.updated_at!==vendor.expected_updated_at)reject('The selected Vendor changed; review its current record',409);
      vendorId=existing.vendor_id;
    }
    // All effects and the receipt are committed together by the adapter's isolated snapshot.
    const anchor=now(),annual=annualDate(anchor.slice(0,10));
    if(vendor.mode==='create')vendorId=write(db,'vendors',{client_id:cid,name:vendor.name,service:vendor.service,business_owner_id:vendor.owner_id||ai.owner_id,next_review:annual,review_frequency:'annual',status:'onboarding'}).vendor_id;
    const created=aiRequest(db,'/ai_systems','post',{}, {...ai,client_id:cid,status:'draft',vendor_id:vendorId});
    const saved=record(db,'ai_systems',created.ai_system_id);
    saved.created_at=anchor;
    saved.onboarding_screening={...screening,scope:screeningScope(saved),recorded_at:anchor,recorded_by:db.user.user_id};
    const linked=write(db,'risks',{client_id:cid,title:risk.title,description:risk.description,owner_id:ai.owner_id,likelihood_score:risk.likelihood,impact_score:risk.impact,assessment_rationale:risk.rationale,next_review:annual,review_cadence:'annual',status:'identified'});
    Object.assign(linked,{created_at:anchor,date_identified:anchor});
    if(vendor.mode==='create')record(db,'vendors',vendorId).created_at=anchor;
    const review=aiRequest(db,`/ai_systems/${saved.ai_system_id}/reviews`,'post',{}, {due_date:annual,recurrence:'annual'});
    const relationship={kind:'risks',id:linked.risk_id,classification:'Context',source:'',rationale:risk.rationale};
    saved.related_links.push(relationship);audit(db,'AI record linked','ai_systems',saved,relationship);
    return {ai_system_id:saved.ai_system_id,risk_id:linked.risk_id,review_id:review.review_id,vendor_id:vendorId};
  });
  const ai=record(db,'ai_systems',result.ai_system_id),risk=record(db,'risks',result.risk_id),review=record(db,'reviews',result.review_id),vendor=result.vendor_id?record(db,'vendors',result.vendor_id):null;
  if([ai,risk,review,...(vendor?[vendor]:[])].some(row=>row.client_id!==cid)||ai.vendor_id!==result.vendor_id||review.ai_system_id!==ai.ai_system_id||!ai.related_links?.some(link=>link.kind==='risks'&&link.id===risk.risk_id))reject('Required onboarding relationships changed; no saved record was overwritten',409);
  return {...result,ai_system:aiProjection(ai,db.reviews,db.risks)};
}
