import {SETUP_FILTERS,unansweredPolicies,onboardingPreview,currentHandoff,reviewConfigurationIssues} from './onboardingHandoff';
import catalog from './onboardingCatalog.json';
import {cis} from './frameworks';
test('Unsure is answered; missing and invalid answers remain required',()=>{
  const state={policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'unsure']))};
  expect(unansweredPolicies(catalog,state)).toHaveLength(0);
  state.policies[catalog.policies[0].key]='';delete state.policies[catalog.policies[1].key];state.policies[catalog.policies[2].key]='invalid';
  expect(unansweredPolicies(catalog,state)).toHaveLength(3);
});
test('setup filters use existing schedule semantics and exclude historical/retired work',()=>{
  for(const status of ['completed','cancelled']){
    expect(SETUP_FILTERS.reviews.scheduling.matches({status})).toBe(false);
    expect(SETUP_FILTERS.reviews.ownership.matches({status})).toBe(false);
  }
  expect(SETUP_FILTERS.reviews.scheduling.matches({status:'upcoming',due_date:'2027-01-01',recurrence:null})).toBe(true);
  expect(SETUP_FILTERS.reviews.scheduling.matches({status:'needs_scheduling',due_date:'2027-01-01',recurrence:'annual'})).toBe(false);
  expect(SETUP_FILTERS.policies.verification.matches({presence:'verified_existing',status:'draft'})).toBe(false);
  expect(SETUP_FILTERS.policies.missing.matches({presence:'reported_missing',status:'retired'})).toBe(false);
});
test('preview keeps title-matched generic records and mapped overrides without double creation',()=>{
  const plan=cis.review_plans.find(p=>p.baseline_key),item=catalog.reviews.find(r=>r.key===plan.baseline_key);
  const state={policies:{},requirements:{'cis-ig1':'applies'},reviews:[item.key],framework_reviews:{}};
  const records={policies:[{title:catalog.policies[0].name}],reviews:[{baseline_key:plan.baseline_key,status:'upcoming',due_date:'2027-01-01',recurrence:'annual',owner_id:'owner'}],framework_assessments:[]};
  const preview=onboardingPreview(catalog,state,records);
  expect(preview.reviews.total).toBe(cis.review_plans.length);
  expect(preview.reviews.retain).toBe(1);expect(preview.reviews.owners).toBe(1);
  expect(preview.policies.retain).toBe(1);
});
test('tenant guard rejects wrong summary and excludes foreign records from all counts',()=>{
  const snapshot={client:{client_id:'a'},records:{reviews:[{client_id:'b',status:'needs_scheduling'}],policies:[],requirements:[],framework_assessments:[]}};
  expect(currentHandoff(snapshot,'a').counts.reviews.scheduling).toBe(0);
  expect(()=>currentHandoff(snapshot,'b')).toThrow();
});
test('invalid custom configuration is visible before leaving Reviews; dates/owners are optional',()=>{
  const key=cis.review_plans[0].key,state={requirements:{'cis-ig1':'applies'},framework_reviews:{[key]:{recurrence:'custom',custom_recurrence_days:0}}};
  expect(reviewConfigurationIssues(state)).toHaveLength(1);
  state.framework_reviews[key].custom_recurrence_days=90;
  expect(reviewConfigurationIssues(state)).toHaveLength(0);
});
