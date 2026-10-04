// Fresh synthetic setup only. Shared CIS configuration supplies all assessment behavior.
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../../lib/frameworks';
import {demoDates} from '../demoPortfolio';
export const INITECH_VERSION='cis81-ig2-greenfield-v1';
const people=[['Bill Lumbergh','Executive sponsor'],['Peter Gibbons','Program coordinator / service owner'],['Michael Bolton','Engineering lead'],['Samir Nagheenanajar','Infrastructure, identity and recovery lead'],['Tom Smykowski','Vendor / business relationship owner'],['Milton Waddams','Asset / facilities liaison'],['Nina','Workforce communications and awareness coordinator']];
export function addInitech(db,clock=new Date()){
  const cid='demo_initech',at=demoDates(clock)(0)+'T12:00:00.000Z';
  if(db.clients.some(c=>c.client_id===cid))return false;
  const state={version:3,step:3,completed:true,updated_at:at,policies:{},reviews:[],framework_reviews:{},
    requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),framework_settings:{'cis-ig1':{implementation_group:2}}};
  db.clients.push({client_id:cid,name:'Initech',environment:'Demo',status:'active',demo_program_version:INITECH_VERSION,
    assigned_owner_id:null,primary_contact_id:cid+'_contact_1',created_at:at,updated_at:at,
    onboarding_baseline:state,framework_settings:state.framework_settings,
    initial_program_baseline:{state,completed_at:at,completed_by:'demo_admin',policies:0,reviews:15},
    notes:'Fictional fresh CIS IG2 program. Operating methods, dates and assessment results are not established.'});
  for(const [index,[name,role]] of people.entries())db.contacts.push({contact_id:cid+'_contact_'+index,client_id:cid,name,role,title:role,status:'active',created_at:at,updated_at:at,notes:'Fictional business Contact. No application account or access grant.'});
  for(const item of baseline.requirements)db.requirements.push({requirement_id:cid+'_requirement_'+item.key,client_id:cid,baseline_key:item.key,title:item.name,
    category:item.category,baseline_response:state.requirements[item.key]||'does_not_apply',applicability:item.key==='cis-ig1'?'applicable':'not_applicable',status:'under_review',created_at:at,updated_at:at});
  db.baselines[cid]=state;
  for(const user of [...db.users,db.user].filter(Boolean))if(user.role==='super_admin'&&!(user.client_ids||[]).includes(cid))(user.client_ids||=[]).push(cid);
  return true;
}
// Fixture identity/time normalization only; shared reconciliation supplies the behavior.
export function finishInitech(db,clock=new Date()){
  const cid='demo_initech',at=demoDates(clock)(0)+'T12:00:00.000Z',reviewIds=new Map();
  for(const row of db.reviews.filter(r=>r.client_id===cid)){
    const id=cid+'_review_'+row.framework_plan_key;reviewIds.set(row.review_id,id);
    Object.assign(row,{review_id:id,current_occurrence_id:'occ_'+id,created_at:at,updated_at:at,occurrences:[]});
  }
  for(const row of db.framework_assessments.filter(r=>r.client_id===cid)){
    row.created_at=at;
    row.related_links=row.related_links.map(link=>link.kind==='reviews'?{...link,id:reviewIds.get(link.id)||link.id}:link);
  }
  db.logs=db.logs.filter(row=>row.client_id!==cid);
}
