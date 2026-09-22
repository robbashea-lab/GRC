import axios from 'axios';
import {previewAdapter} from './adapter';
import catalog from '../lib/onboardingCatalog.json';
import {currentHandoff,onboardingPreview,unansweredPolicies} from '../lib/onboardingHandoff';
import {onboardingDraft} from '../lib/frameworks';
import {readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
let cid,state;
const get=async()=>currentHandoff((await api.get('/onboarding/handoff',{params:{client_id:cid}})).data,cid);
beforeEach(async()=>{
  localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');
  cid=(await api.post('/clients',{name:'Northstar Manufacturing'})).data.client_id;
  state=onboardingDraft((await api.get('/onboarding/baseline',{params:{client_id:cid}})).data.state);
  state.policies=Object.fromEntries(catalog.policies.map((p,i)=>[p.key,['yes','no','unsure'][i%3]]));
  state.requirements={...state.requirements,'cis-ig1':'applies','iso-27001':'unsure'};
  state.reviews=[catalog.reviews[0].key];
});
const complete=()=>api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});

test('preview matches create/retain behavior and live source counts after operations',async()=>{
  expect(unansweredPolicies(catalog,state)).toHaveLength(0);
  const initial=await get(), planned=onboardingPreview(catalog,state,initial.records);
  expect(planned.policies).toMatchObject({create:17,retain:0,yes:6,no:6,unsure:5});
  await complete();
  const before=await get();
  expect(before.records.reviews).toHaveLength(planned.reviews.create);
  expect(before.counts.reviews.scheduling).toBe(planned.reviews.scheduling);
  expect(before.records.framework_assessments).toHaveLength(planned.newAssessments);
  expect(before.programs.map(p=>p.key)).toEqual(['cis-ig1']);
  expect(before.unsurePrograms.map(p=>p.key)).toContain('iso-27001');
  const r=before.records.reviews[0], p=before.records.policies.find(p=>p.presence==='reported_existing');
  const owner=(await api.get(`/clients/${cid}/assignees`)).data.items[0].user_id;
  const full=(await api.get(`/reviews/${r.review_id}`)).data;
  await api.patch(`/reviews/${r.review_id}`,{due_date:'2027-01-15',recurrence:'annual',owner_id:owner,expected_occurrence_id:full.current_occurrence_id || 'occ_'+r.review_id});
  await api.post(`/policies/${p.policy_id}/verify`,{status:'draft',version:'1.0'});
  const a=before.records.framework_assessments[0];
  await api.patch(`/framework_assessments/${a.framework_assessment_id}`,{status:'in_progress'});
  const after=await get();
  expect(after.counts.reviews.scheduling).toBe(before.counts.reviews.scheduling-1);
  expect(after.counts.reviews.ownership).toBe(before.counts.reviews.ownership-1);
  expect(after.counts.policies.verification).toBe(before.counts.policies.verification-1);
  expect(after.programs[0].not_assessed).toBe(before.programs[0].not_assessed-1);
  expect((await api.get('/onboarding/baseline',{params:{client_id:cid}})).data.state.policies).toEqual(state.policies);
  const db=readStore();expect(db.tasks.filter(t=>t.client_id===cid)).toHaveLength(0);expect(db.findings.filter(t=>t.client_id===cid)).toHaveLength(0);
  expect(onboardingPreview(catalog,state,after.records).policies.create).toBe(0);
});

test('scope, disabled users, contact-only and minimal contract',async()=>{
  await complete();const db=readStore();
  db.users.push({user_id:'disabled',status:'disabled',client_ids:[cid],role:'client_contributor'});
  db.contacts.push({contact_id:'maya',client_id:cid,name:'Maya Chen',status:'active'});
  saveStore(db);
  const data=await get();expect(data.people.active_client_users).toBe(0);expect(data.people.contacts).toBe(1);
  expect(JSON.stringify(data.records)).not.toContain('email');
  expect(()=>currentHandoff(data,'unrelated')).toThrow();
  db.user={user_id:'other',status:'active',client_ids:['other'],role:'client_contributor'};saveStore(db);
  await expect(get()).rejects.toBeTruthy();
});

test('program adjustment preserves intake and work, is idempotent, and rejects invalid authority',async()=>{
  await complete();const before=await get();
  const baseline=(await api.get('/onboarding/baseline',{params:{client_id:cid}})).data.state;
  for(const [key,applicability] of [['soc-2','applies'],['cis-ig1','does_not_apply'],['cis-ig1','applies']]) await api.patch(`/onboarding/programs/${key}`,{client_id:cid,applicability});
  const after=await get();expect(after.programs.map(p=>p.key)).toEqual(expect.arrayContaining(['soc-2','cis-ig1']));
  // SOC activation adds its missing Reviews and links the existing baseline risk Review.
  expect(after.records.reviews).toHaveLength(before.records.reviews.length+4);
  for(const review of before.records.reviews)expect(after.records.reviews.find(r=>r.review_id===review.review_id)).toMatchObject(review);
  expect(after.records.policies).toEqual(before.records.policies);
  await api.patch('/onboarding/programs/soc-2',{client_id:cid,applicability:'applies'});
  expect((await get()).records.reviews).toEqual(after.records.reviews);
  expect((await api.get('/onboarding/baseline',{params:{client_id:cid}})).data.state).toEqual(baseline);
  const db=readStore();db.user.role='client_readonly';db.user.client_ids=[cid];saveStore(db);
  await expect(api.patch('/onboarding/programs/cis-ig1',{client_id:cid,applicability:'applies'})).rejects.toBeTruthy();
});
