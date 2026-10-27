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

test.each(['demo_dunder','demo_prestige'])('native shared onboarding for %s retains existing records, reloads exact links and preserves approval denials',async clientId=>{
  const before=readStore(),body={...payload('create'),client_id:clientId};
  const first=(await add(body)).data;
  expect((await add(body)).data).toEqual(first);
  const after=readStore();
  for(const kind of ['ai_systems','risks','reviews','vendors','policies','framework_assessments']) {
    const id={ai_systems:'ai_system_id',risks:'risk_id',reviews:'review_id',vendors:'vendor_id',policies:'policy_id',framework_assessments:'framework_assessment_id'}[kind];
    for(const row of before[kind]||[])expect(after[kind].find(saved=>saved[id]===row[id])).toEqual(row);
  }
  const reloaded=(await api.get('/ai_systems',{params:{client_id:clientId}})).data.find(row=>row.ai_system_id===first.ai_system_id);
  expect(reloaded).toMatchObject({client_id:clientId,environment:body.ai.environment,permitted_data_types:body.ai.permitted_data_types,
    onboarding_screening:{answers:body.screening.answers},vendor_id:first.vendor_id,approval_status:'pending_assessment'});
  expect(reloaded.related_links).toContainEqual(expect.objectContaining({kind:'risks',id:first.risk_id}));
  expect(after.reviews.filter(row=>row.ai_system_id===first.ai_system_id)).toHaveLength(1);
  expect(after.reviews.find(row=>row.review_id===first.review_id)).toMatchObject({client_id:clientId,recurrence:'annual'});
  expect(after.risks.find(row=>row.risk_id===first.risk_id)).toMatchObject({client_id:clientId,likelihood_score:body.risk.likelihood,impact_score:body.risk.impact});
  await expect(api.post('/ai_systems/'+first.ai_system_id+'/approval',{status:'approved',note:'Not authorized by this rollout',expected_updated_at:reloaded.updated_at})).rejects.toThrow(/configured CIS/);
  const patch={schema_version:1,catalog_version:'2026-10-25',answers:{...reloaded.onboarding_screening.answers,managed:!reloaded.onboarding_screening.answers.managed},reviewed:true};
  const reviewed=(await api.patch('/ai_systems/'+first.ai_system_id,{expected_updated_at:reloaded.updated_at,onboarding_screening:patch})).data;
  expect(reviewed.onboarding_screening.history).toEqual([reloaded.onboarding_screening]);
  expect(reviewed.onboarding_screening.answers).toEqual(patch.answers);
  const db=readStore();db.user.role='client_readonly';saveStore(db);
  const frozen=readStore().ai_systems;
  await expect(api.post('/ai_systems/onboard',body,{headers:{'Idempotency-Key':key+'-denied'}})).rejects.toThrow();
  expect(readStore().ai_systems).toEqual(frozen);
});

test.each(['iso-27001','soc-2'].flatMap(framework=>['approved','approved_with_conditions'].map(status=>[framework,status])))(
  'retained %s AI %s cannot acquire changed approval boundaries after CIS retirement',async(framework,status)=>{
    const body=payload();body.ai.restrictions='Use only the recorded managed training environment';
    const created=(await add(body)).data.ai_system;
    const approved=(await api.post('/ai_systems/'+created.ai_system_id+'/approval',{
      status,note:'Synthetic original decision',expected_updated_at:created.updated_at,
    })).data;
    const db=readStore();
    db.requirements=db.requirements.filter(row=>row.client_id!==cid||row.baseline_key!=='cis-ig1');
    db.requirements.push({requirement_id:'synthetic-later-'+framework,client_id:cid,baseline_key:framework,baseline_response:'applies'});
    saveStore(db);
    const noop=(await api.patch('/ai_systems/'+created.ai_system_id,{environment:approved.environment,expected_updated_at:approved.updated_at})).data;
    expect(noop.approval_status).toBe(status);expect(noop.approval_history).toEqual(approved.approval_history);
    const before=readStore().ai_systems;
    await expect(api.patch('/ai_systems/'+created.ai_system_id,{environment:'Different unapproved account',expected_updated_at:noop.updated_at})).rejects.toThrow(/recorded AI approval scope/);
    const screening={schema_version:1,catalog_version:'2026-10-25',reviewed:true,
      answers:{...noop.onboarding_screening.answers,managed:!noop.onboarding_screening.answers.managed}};
    await expect(api.patch('/ai_systems/'+created.ai_system_id,{onboarding_screening:screening,expected_updated_at:noop.updated_at})).rejects.toThrow(/recorded AI approval scope/);
    expect(readStore().ai_systems).toEqual(before);
    await expect(api.post('/ai_systems/'+created.ai_system_id+'/approval',{status,note:'No new authority',expected_updated_at:noop.updated_at})).rejects.toThrow(/configured CIS/);
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
