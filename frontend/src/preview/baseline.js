import catalog from '@/lib/onboardingCatalog.json';
import { list, write, record, audit, clone } from './store';
import {frameworkScope,validateFrameworkConfig,reconcileFramework} from './frameworks';
import {genericReviews} from '../lib/frameworks';
export const matches = (row, item) => row.baseline_key === item.key || !row.baseline_key && [item.name,...(item.aliases||[])].some(n=>n.toLowerCase()===(row.title||'').trim().toLowerCase());
const findExisting=(db,kind,cid,item)=>list(db,kind,cid).find(r=>r.baseline_key===item.key)||list(db,kind,cid).find(r=>matches(r,item));
export function baselineState(db,cid) {
  record(db,'clients',cid);
  const saved=db.baselines?.[cid];
  if(saved)return clone(saved);
  const policies={},requirements={};
  for(const item of catalog.policies) {
    const r=findExisting(db,'policies',cid,item);
    policies[item.key]={reported_existing:'yes',verified_existing:'yes',reported_missing:'no',needs_confirmation:'unsure'}[r?.presence]||'';
  }
  for(const item of catalog.requirements) {
    const r=findExisting(db,'requirements',cid,item);
    requirements[item.key]={applicable:'applies',not_applicable:'does_not_apply',potentially_applicable:'unsure',needs_review:'unsure'}[r?.applicability]||'';
  }
  return {version:2,step:0,policies,requirements,reviews:catalog.reviews.map(r=>r.key),completed:false};
}
export function saveBaseline(db,cid,state,finalize) {
  record(db,'clients',cid);
  frameworkScope(db,cid);
  if(!['super_admin','platform_admin','client_contributor'].includes(db.user.role))throw new Error('Read-only role');
  state=clone(state);validateFrameworkConfig(state);
  state.requirements||={};state.requirements['soc-2']||='does_not_apply';
  if(state.version>=3)for(const item of catalog.requirements)state.requirements[item.key]||='does_not_apply';
  for(const group of ['policies','requirements']) for(const [key,value] of Object.entries(state[group]||{})) {
    if(!catalog[group].some(i=>i.key===key)||!(group==='policies'?['','yes','no','unsure']:['','applies','does_not_apply','unsure']).includes(value))throw new Error('Invalid baseline response.');
  }
  if(!Array.isArray(state.reviews)||state.reviews.some(k=>!catalog.reviews.some(r=>r.key===k)))throw new Error('Invalid review selection.');
  if(finalize)for(const group of ['policies','requirements'])if(catalog[group].some(i=>!state[group]?.[i.key]))throw new Error('Please answer every policy and requirement before completing onboarding.');
  if(finalize) {
    if(state.version>=3)state.reviews=genericReviews(catalog,state).map(r=>r.key);
    for(const item of catalog.policies) {
      const old=findExisting(db,'policies',cid,item), response=state.policies[item.key];
      const status={yes:'needs_verification',no:'needs_creation',unsure:'needs_verification'}[response];
      const presence = ['verified_existing','not_applicable'].includes(old?.presence) ? old.presence : {yes:'reported_existing',no:'reported_missing',unsure:'needs_confirmation'}[response];
      write(db,'policies',{client_id:cid,title:old?.title||item.name,category:old?.category||item.category,baseline_key:item.key,baseline_response:response,presence,is_client_reported:true,status:old&&(['verified_existing','not_applicable'].includes(old.presence)||!['draft','needs_verification','needs_creation','not_applicable',''].includes(old.status||''))?old.status:status},old?.policy_id);
    }
    for(const item of catalog.requirements) {
      const old=findExisting(db,'requirements',cid,item), response=state.requirements[item.key];
      // Baseline Does Not Apply is retained without requiring a detailed rationale.
      const row={client_id:cid,title:old?.title||item.name,category:old?.category||item.category,baseline_key:item.key,baseline_response:response,applicability:{applies:'applicable',does_not_apply:'not_applicable',unsure:'needs_review'}[response],status:old?.status||'under_review',is_client_reported:true};
      write(db,'requirements',row,old?.requirement_id);
    }
    for(const item of catalog.reviews.filter(i=>state.reviews.includes(i.key))) {
      const old=findExisting(db,'reviews',cid,item);
      if(old) {write(db,'reviews',{baseline_key:item.key,baseline_selection:'selected'},old.review_id);continue;}
      write(db,'reviews',{client_id:cid,title:item.name,review_type:item.review_type,baseline_key:item.key,baseline_selection:'selected',source:'GRC Program Onboarding',status:'needs_scheduling',due_date:null,next_review_date:null,recurrence:null,owner_id:null});
    }
    audit(db,'onboarding-complete','clients',record(db,'clients',cid));
    if(state.version>=3)reconcileFramework(db,cid,state);
  }
  db.baselines||={};db.baselines[cid]={...clone(state),version:state.version>=3?3:2,completed:finalize||!!db.baselines[cid]?.completed};
  return db.baselines[cid];
}
