import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore,STORE_KEY} from './store';
import {effectivePolicySubject,policySetCoverage,advanceCoveredSchedule} from './policyReviewCoverage';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo',at='2026-10-21T12:00:00.000Z';
const subject=id=>({subject_id:id+'-approved-1',policy_id:id,client_id:cid,title:id,version:'1',basis:{type:'external',reference:'https://example.test/'+id,document_version:'1'}});
const policy=(id,status='approved')=>({policy_id:id,client_id:cid,title:id,status,version:'1',updated_at:id+'-v1',approval_subject:status==='approved'?subject(id):null,
  approval_history:status==='approved'?[{action:'approved',at:'2025-01-01T00:00:00.000Z',by:'original-approver',subject:subject(id)}]:[],decision_history:[]});
const annual={review_id:'annual-set',client_id:cid,title:'Native annual set',baseline_key:'policy-review',review_type:'policy',recurrence:'annual',due_date:'2026-10-01',status:'upcoming',current_occurrence_id:'annual-2026'};
const child=id=>({review_id:'child-'+id,client_id:cid,policy_id:id,title:'Native '+id,review_type:'policy',recurrence:'annual',due_date:'2024-01-31',status:'upcoming',current_occurrence_id:id+'-2024'});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});

test('only exact approved subjects qualify, including the effective version beneath a pending replacement',()=>{
  const pending={...policy('C'),status:'in_review',version:'2',approval_subject:{...subject('C'),version:'2',subject_id:'C-pending'},approval_request_id:'pending-v2'};
  pending.approval_history.push({action:'submitted',at:'2026-10-01',subject:pending.approval_subject});
  const original=JSON.stringify(pending);
  const coverage=policySetCoverage({policies:[policy('A'),policy('B','draft'),pending,policy('retired','retired'),{...policy('foreign'),client_id:'demo_dunder'}]},annual,at);
  expect(coverage.map(member=>[member.policy_id,member.subject_id,member.version])).toEqual([['A','A-approved-1','1'],['C','C-approved-1','1']]);
  expect(JSON.stringify(pending)).toBe(original);
  expect(effectivePolicySubject({...policy('future'),effective_date:'2090-01-01'},at)).toBeNull();
  expect(effectivePolicySubject({...policy('missing'),approval_subject:null,approval_history:[]},at)).toBeNull();
  expect(()=>effectivePolicySubject({...policy('bad'),approval_history:[{action:'approved',at:'2025-01-01',subject:{...subject('bad'),client_id:'demo_dunder'}}]},at)).toThrow(/another client/);
  expect(policySetCoverage({policies:[policy('A')]},{...annual,client_id:'demo_dunder'},at)).toBeNull();
  expect(()=>policySetCoverage({policies:[]},{...annual,recurrence:'quarterly'},at)).toThrow(/annual/);
});

test('annual catch-up retains calendar anchors and records missed schedules without fake completions',()=>{
  const result=advanceCoveredSchedule({...annual,due_date:'2020-02-29'},at);
  expect(result.due.slice(0,10)).toBe('2027-02-28');
  expect(result.skipped.map(date=>date.slice(0,10))).toEqual(['2021-02-28','2022-02-28','2023-02-28','2024-02-29','2025-02-28','2026-02-28']);
  expect(()=>advanceCoveredSchedule({...annual,due_date:'2026-02-30'},at)).toThrow(/valid/);
});

test('latest successful approval supersedes the older subject while pending and future approvals do not',()=>{
  const row=policy('versions'),second={...subject('versions'),subject_id:'versions-approved-2',version:'2'},pending={...second,subject_id:'versions-pending-3',version:'3'};
  row.approval_history.push({action:'approved',at:'2026-01-01',by:'second-approver',subject:second},
    {action:'submitted',at:'2026-10-20',subject:pending},
    {action:'approved',at:'2090-01-01',subject:{...pending,subject_id:'future-approved'}});
  Object.assign(row,{status:'in_review',version:'3',approval_subject:pending});
  const before=JSON.stringify(row),saved=effectivePolicySubject(row,at);
  expect(saved.subject_id).toBe('versions-approved-2');expect(saved.version).toBe('2');
  expect(saved.approval.by).toBe('second-approver');expect(JSON.stringify(row)).toBe(before);
  row.decision_history.push({action:'external_approval_recorded',recorded_at:'2026-10-20',reported_approved_at:'2090-01-01',subject:pending});
  expect(effectivePolicySubject(row,at).subject_id).toBe('versions-approved-2');
  expect(effectivePolicySubject({...row,approval_history:[],decision_history:[row.decision_history[0]]},at)).toBeNull();
});

test.each(['retired','not_applicable','needs_verification','needs_creation','unknown'])('native lifecycle %s excludes a historical approval from current coverage',status=>{
  expect(effectivePolicySubject({...policy('inactive'),status},at)).toBeNull();
});

test.each([{archived:true},{archived_at:'2026-01-01'},{presence:'not_applicable'},{presence:'reported_missing'}])('explicit native exclusion %j prevents current coverage',exclusion=>{
  expect(effectivePolicySubject({...policy('excluded'),...exclusion},at)).toBeNull();
});

test('zero identifiable eligible subjects is an explicit empty coverage list, never approval inferred from status',()=>{
  const missing={...policy('missing'),approval_history:[],approval_subject:null};
  expect(policySetCoverage({policies:[missing,policy('draft','draft')]},annual,at)).toEqual([]);
  const original=policy('external');original.approval_history=[];
  original.decision_history=[{action:'external_approval_recorded',recorded_at:'2090-01-01',subject:original.approval_subject}];
  expect(effectivePolicySubject(original,at)).toBeNull();
});

test('native annual completion persists exact membership, completes covered obligations once and retains approvals on reload/replay',async()=>{
  const db=readStore(),a=policy('A'),b=policy('B','draft'),c={...policy('C'),status:'draft',version:'2',approval_subject:null};
  db.policies=[a,b,c];db.reviews=[{...annual},child('A'),child('B'),child('C')];saveStore(db);
  const untouchedChild=(await api.get('/reviews/child-B')).data,untouchedPolicy=(await api.get('/policies/B')).data;
  const approvalBefore=JSON.stringify(db.policies.map(p=>[p.status,p.version,p.approval_subject,p.approval_history,p.decision_history]));
  const body={occurrence_id:annual.current_occurrence_id};
  const completed=(await api.post('/reviews/annual-set/complete',body)).data;
  expect(completed.occurrence.policy_coverage.map(member=>member.policy_id)).toEqual(['A','C']);
  let stored=JSON.parse(sessionStorage.getItem(STORE_KEY));
  expect(JSON.stringify(stored.policies.map(p=>[p.status,p.version,p.approval_subject,p.approval_history,p.decision_history]))).toBe(approvalBefore);
  for(const id of ['A','C']){
    const review=stored.reviews.find(r=>r.review_id==='child-'+id);
    expect(review.occurrences).toHaveLength(1);expect(review.occurrences[0].due_date).toBe('2024-01-31');
    expect(review.occurrences[0].covered_by).toEqual({review_id:'annual-set',occurrence_id:'annual-2026'});
    expect(Date.parse(review.due_date)).toBeGreaterThan(Date.parse(completed.occurrence.completed_at));
    expect(stored.policies.find(p=>p.policy_id===id).review_history).toHaveLength(1);
    const nextEvents=stored.logs.filter(row=>row.entity_id==='child-'+id&&row.action==='Next occurrence scheduled');
    expect(nextEvents).toHaveLength(1);
    expect(nextEvents[0].meta.due_date).toBe(review.due_date);
  }
  expect((await api.get('/reviews/child-B')).data).toEqual(untouchedChild);
  expect((await api.get('/policies/B')).data).toEqual(untouchedPolicy);
  const replay=(await api.post('/reviews/annual-set/complete',body)).data;
  expect(replay.occurrence).toEqual(completed.occurrence);
  expect(readStore().logs.filter(row=>row.entity_id==='child-A'&&row.action==='Next occurrence scheduled')).toHaveLength(1);
  const reloaded=(await api.get('/reviews/annual-set')).data;
  expect(reloaded.occurrences).toHaveLength(1);
  const related=(await api.get('/related',{params:{entity_type:'policies',entity_id:'A'}})).data;
  expect(related.reviews.map(row=>row.review_id)).toEqual(expect.arrayContaining(['annual-set','child-A']));
  const single=(await api.get('/reviews/child-A')).data;
  await api.post('/reviews/child-A/complete',{occurrence_id:single.current_occurrence_id});
  expect((await api.get('/reviews/annual-set')).data.occurrences).toHaveLength(1);
});

test('failed native persistence leaves the annual and child snapshots unchanged, and native retry succeeds',async()=>{
  const db=readStore();db.policies=[policy('A')];db.reviews=[{...annual},child('A')];saveStore(db);
  const before=sessionStorage.getItem(STORE_KEY),nativeSet=Storage.prototype.setItem;
  const fail=jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key===STORE_KEY)throw new DOMException('Synthetic quota','QuotaExceededError');return nativeSet.call(this,key,value);});
  try{await expect(api.post('/reviews/annual-set/complete',{occurrence_id:'annual-2026'})).rejects.toThrow();}
  finally{fail.mockRestore();}
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  const response=(await api.post('/reviews/annual-set/complete',{occurrence_id:'annual-2026'})).data;
  expect(response.occurrence.policy_coverage).toHaveLength(1);
  expect((await api.get('/reviews/child-A')).data.occurrences).toHaveLength(1);
});

test('native deletion remains available outside pending coverage and denies pending parent, child and policy identities',async()=>{
  const db=readStore();db.policies=[policy('A')];
  db.reviews=[{...annual,_policy_coverage_pending:{members:[{policy_id:'A',child:{review_id:'child-A'}}]}},child('A'),
    {review_id:'unretained',client_id:cid,title:'Synthetic unretained Review',review_type:'policy',status:'upcoming',recurrence:'none',due_date:'2026-10-31'}];
  saveStore(db);
  await expect(api.delete('/reviews/unretained')).resolves.toBeDefined();
  expect(readStore().reviews.some(row=>row.review_id==='unretained')).toBe(false);
  for(const path of ['/reviews/annual-set','/reviews/child-A','/policies/A'])await expect(api.delete(path)).rejects.toThrow(/pending annual/);
  for(const [kind,id] of [['reviews','annual-set'],['reviews','child-A'],['policies','A']])await expect(api.post('/bulk',{kind,ids:[id],action:'delete'})).rejects.toThrow(/pending annual/);
  expect(JSON.stringify((await api.get('/reviews/annual-set')).data)).not.toContain('_policy_coverage_pending');
  expect(JSON.stringify((await api.get('/related',{params:{entity_type:'policies',entity_id:'A'}})).data)).not.toContain('_policy_coverage_pending');
});

test('eligible policy with no child uses the annual catch-up date, not another overdue deadline',async()=>{
  const db=readStore();db.policies=[policy('A')];db.reviews=[{...annual,due_date:'2020-02-29'}];saveStore(db);
  const response=(await api.post('/reviews/annual-set/complete',{occurrence_id:'annual-2026'})).data;
  const saved=(await api.get('/policies/A')).data;
  expect(saved.next_review_date).toBe(response.review.due_date);
  expect(Date.parse(saved.next_review_date)).toBeGreaterThan(Date.parse(response.occurrence.completed_at));
  expect(response.occurrence.covered_policy_reviews).toEqual([]);
});
