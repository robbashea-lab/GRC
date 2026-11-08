import axios from 'axios';
import {previewAdapter} from './adapter';
import {cisClientProgram,cisExperienceEligible} from '../lib/cisExperience';
import {additionalSectionSurface} from '../lib/brawndoAdditionalScope';
import {readStore,saveStore} from './store';
import {cisDemoSelection} from './cisDemoSelection';

const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});

test.each([1,2,3])('native new-client IG%i onboarding publishes saved enrollment on authorized client reads and reload',async group=>{
  const created=(await api.post('/clients',{name:`Synthetic new CIS IG${group}`})).data;
  const cid=created.client_id,setup=(await api.get('/onboarding/baseline',{params:{client_id:cid}})).data;
  const selection=cisDemoSelection(group),policyKeys=selection.selected_policy_keys;
  const state={...setup.state,version:3,selected_policy_keys:policyKeys,
    policies:Object.fromEntries(policyKeys.map(key=>[key,'no'])),
    requirements:Object.fromEntries(setup.catalog.requirements.map(row=>[row.key,row.key==='cis-ig1'?'applies':'does_not_apply'])),
    framework_settings:{'cis-ig1':{implementation_group:group}},reviews:[]};
  await api.post('/onboarding/baseline',{client_id:cid,finalize:true,state,
    expected_updated_at:setup.state.updated_at??null,expected_records:setup.record_versions},
    {headers:{'Idempotency-Key':`synthetic-cis-onboarding-${group}`}});
  const clients=(await api.get('/clients')).data,client=clients.find(row=>row.client_id===cid);
  expect(cisClientProgram(client)).toMatchObject({clientId:cid,implementationGroup:group});
  expect(client.status).toBe(created.status);
  const db=readStore(),actor=db.user;
  const context={workspaceMode:'demo',user:actor,clients,currentClientId:cid,currentClient:client,selectedClientId:cid,loadedClientId:cid};
  expect(cisExperienceEligible(context)).toBe(true);
  expect(additionalSectionSurface({...context,pathname:'/policies'})).toBe('policies');
  // The returned projection is a copy; editing it cannot mutate saved enrollment.
  client.onboarding_baseline.requirements['cis-ig1']='does_not_apply';
  expect(readStore().baselines[cid].requirements['cis-ig1']).toBe('applies');
  saveStore(readStore());
  const reloaded=(await api.get('/clients')).data.find(row=>row.client_id===cid);
  expect(cisClientProgram(reloaded).implementationGroup).toBe(group);
  expect((await api.get('/policies',{params:{client_id:cid}})).data).toHaveLength(policyKeys.length);
  const reviews=(await api.get('/reviews',{params:{client_id:cid}})).data;
  expect(reviews.some(row=>row.baseline_key==='policy-review')).toBe(false);
  expect(readStore().policies.filter(row=>row.client_id===cid).every(row=>!row.approval_history?.length&&!row.approved_at)).toBe(true);
  const savedSetup=(await api.get('/onboarding/baseline',{params:{client_id:cid}})).data;
  await api.post('/onboarding/baseline',{client_id:cid,finalize:false,expected_updated_at:savedSetup.state.updated_at,
    state:{...savedSetup.state,requirements:{...savedSetup.state.requirements,'cis-ig1':'does_not_apply'}}});
  const draftClient=(await api.get('/clients')).data.find(row=>row.client_id===cid);
  expect(draftClient.onboarding_baseline.requirements['cis-ig1']).toBe('does_not_apply');
  expect(draftClient.cis_program.selected).toBe(true);
  expect(cisClientProgram(draftClient).implementationGroup).toBe(group);
  expect((await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.selected).toBe(true);
});
