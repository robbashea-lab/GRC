import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
import {applyTool,blankDraft,snapshot,onboardingPayload,annualDate} from '../lib/aiOnboarding';
const api=axios.create({adapter:previewAdapter});
const cid='demo_brawndo';
const key='ai-onboarding-fixture-0001';
const add=body=>api.post('/ai_systems/onboard',body,{headers:{'Idempotency-Key':key}});
function payload(mode='none'){
  const draft=applyTool(blankDraft('2026-10-25'),0);
  draft.vendor={...draft.vendor,mode};
  draft.confirmations=Object.fromEntries(['details','screening','risk'].map(step=>[step,snapshot(draft,step)]));
  return onboardingPayload(cid,draft);
}
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
test('one final command persists native linked records and exactly replays without duplicates',async()=>{
  const before=readStore(),body=payload('create'),first=(await add(body)).data;
  const second=(await add(body)).data,after=readStore();
  expect(first).toEqual(second);
  expect(after.ai_systems).toHaveLength(before.ai_systems.length+1);
  expect(after.risks).toHaveLength(before.risks.length+1);
  expect(after.vendors).toHaveLength(before.vendors.length+1);
  expect(after.reviews.filter(row=>row.ai_system_id===first.ai_system_id)).toHaveLength(1);
  expect(after.reviews.filter(row=>row.risk_id===first.risk_id)).toHaveLength(1);
  expect(first.ai_system).toMatchObject({status:'draft',approval_status:'pending_assessment',vendor_id:first.vendor_id,onboarding_screening:{answers:body.screening.answers}});
  expect(first.ai_system.next_review.slice(0,10)).toBe(annualDate(first.ai_system.created_at.slice(0,10)));
  expect(after.risks.find(row=>row.risk_id===first.risk_id).likelihood_score).toBe(body.risk.likelihood);
  await expect(add({...body,ai:{...body.ai,name:'Changed intent'}})).rejects.toThrow(/different data/);
});
test('invalid or unauthorized requests retain no partial native records',async()=>{
  const before=readStore(),body=payload('create');body.risk.likelihood=5;
  await expect(add(body)).rejects.toThrow(/override/);
  expect(readStore().ai_systems).toEqual(before.ai_systems);
  expect(readStore().vendors).toEqual(before.vendors);
  const db=readStore();db.user.role='client_contributor';saveStore(db);
  await expect(add(payload())).rejects.toThrow();
  expect(readStore().ai_systems).toEqual(before.ai_systems);
});
test('completed replay rechecks enrollment and returns current native projection',async()=>{
  const body=payload(),first=(await add(body)).data,db=readStore();
  db.ai_systems.find(row=>row.ai_system_id===first.ai_system_id).name='Native saved edit';saveStore(db);
  expect((await add(body)).data.ai_system.name).toBe('Native saved edit');
  const withdrawn=readStore();withdrawn.requirements=withdrawn.requirements.filter(row=>row.client_id!==cid||row.baseline_key!=='cis-ig1');saveStore(withdrawn);
  await expect(add(body)).rejects.toThrow(/active CIS/);
});
test('verified Vendor IDs are explicit; matching names never deduplicate',async()=>{
  const body=payload('create'),db=readStore();body.vendor.name=db.vendors.find(row=>row.client_id===cid).name;
  const existingIds=db.vendors.map(row=>row.vendor_id),first=(await add(body)).data;
  expect(existingIds).not.toContain(first.vendor_id);
});

test('reviewed screening preserves history and rejects contradictory classifications',async()=>{
  const first=(await add(payload())).data.ai_system,original=first.onboarding_screening;
  const review={schema_version:1,catalog_version:'2026-10-25',answers:{...original.answers,managed:!original.answers.managed},reviewed:true};
  await expect(api.patch('/ai_systems/'+first.ai_system_id,{expected_updated_at:first.updated_at,data_types:['No Sensitive Data','PII'],onboarding_screening:review})).rejects.toThrow(/cannot be combined/);
  const saved=(await api.patch('/ai_systems/'+first.ai_system_id,{expected_updated_at:first.updated_at,onboarding_screening:review})).data;
  expect(saved.onboarding_screening.recorded_at).toBe(original.recorded_at);
  expect(saved.onboarding_screening.recorded_by).toBe(original.recorded_by);
  expect(saved.onboarding_screening.history).toEqual([original]);
  expect(saved.onboarding_screening.answers).toEqual(review.answers);
  expect(saved.approval_status).toBe('pending_assessment');
});
