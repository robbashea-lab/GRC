// DEMO — SYNTHETIC DATA. Program records are created through product APIs.
import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY} from './store';
import baseline from '@catalogs/onboardingCatalog.json';
import {CATALOGS,FRAMEWORKS,activeDefinitions} from '../lib/frameworks';
import {reviewSchedule} from '../lib/reviewOccurrences';

const api=axios.create({adapter:previewAdapter});
const {setImmediate:yieldLoop}=jest.requireActual('timers');
const get=async(path,cid,params={})=>(await api.get(path,{params:{client_id:cid,...params}})).data;
async function write(method,path,body){const r=await api[method](path,body);jest.runOnlyPendingTimers();await new Promise(resolve=>yieldLoop(resolve));return r.data;}
const post=(p,b)=>write('post',p,b),patch=(p,b)=>write('patch',p,b);
const clock=day=>jest.setSystemTime(new Date(day.slice(0,10)+'T14:00:00Z'));
const db=()=>JSON.parse(sessionStorage.getItem(STORE_KEY));
const copy=x=>JSON.parse(JSON.stringify(x));
const count=(rows,key)=>rows.reduce((out,r)=>(out[r[key]||'not_recorded']=(out[r[key]||'not_recorded']||0)+1,out),{});
const report={};
beforeEach(async()=>{jest.useFakeTimers({doNotFake:['performance','nextTick','queueMicrotask']});clock('2026-09-30');sessionStorage.clear();localStorage.clear();await post('/demo/enter');});
afterEach(()=>jest.useRealTimers());

test('greenfield CIS-only intake retains 24 months of authoritative operations',async()=>{
 const catalog=CATALOGS['cis-ig1'];
 const before=db(),foreign=Object.fromEntries(['reviews','policies','findings','tasks','risks','vendors','framework_assessments'].map(k=>[k,copy(before[k])]));
 const client=await post('/clients',{name:'CIS Lifecycle QA — 24 Month Automation',industry:'Synthetic business services'}),cid=client.client_id;
 const state={version:3,step:3,requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,f.key==='cis-ig1'?'applies':'does_not_apply'])),
  policies:Object.fromEntries(baseline.policies.map((p,i)=>[p.key,['yes','no','unsure'][i%3]])),reviews:[],
  framework_reviews:Object.fromEntries(catalog.review_plans.filter(p=>p.default_enabled!==false&&p.safeguards.some(id=>catalog.requirements.find(r=>r.id===id)?.implementation_group===1)).map(p=>[p.key,{enabled:true,recurrence:p.default_cadence,due_date:'2026-10-31'}]))};
 await post('/onboarding/baseline',{client_id:cid,state,finalize:true});
 let ws=await get('/frameworks/cis-ig1',cid),reviews=await get('/reviews',cid),policies=await get('/policies',cid);
 expect(ws.assessments).toHaveLength(56);expect(new Set(activeDefinitions('cis-ig1').map(r=>r.control)).size).toBe(15);
 expect(ws.assessments.every(a=>a.status==='not_assessed'&&!a.owner_id)).toBe(true);
 expect(db().framework_assessments.filter(a=>a.client_id===cid&&a.framework_key!=='cis-ig1')).toHaveLength(0);
 expect(reviews).toHaveLength(12);expect(policies).toHaveLength(17);
 expect(reviews.every(r=>r.due_date==='2026-10-31'&&!r.owner_id)).toBe(true);
 const originalBaseline=copy((await get('/clients/'+cid+'/profile')).baseline);
 report.baseline={client_id:cid,assessments:56,controls:15,verification:count(ws.assessments,'verification'),counts:Object.fromEntries(['reviews','policies','findings','tasks','risks','vendors','evidence','requirements'].map(k=>[k,db()[k].filter(r=>r.client_id===cid).length]))};
 report.cadence=reviews.map(r=>({title:r.title,safeguards:r.framework_safeguards,cadence:r.recurrence,due:r.due_date,basis:r.framework_basis,source:r.framework_source_cadence,plan:r.framework_plan_key}));
 report.policies=policies.map(p=>({title:p.title,key:p.baseline_key,status:p.status,cadence:p.review_cadence||p.recurrence||null,next_review:p.next_review_date||null,mappings:catalog.policy_mappings.filter(m=>m.policy_key===p.baseline_key)}));
 const cal=await get('/calendar',cid,{start:'2026-09-30',end:'2027-09-30',scope:'all'});
 report.baseline.calendar=Object.values(cal).flatMap(b=>Object.values(b).flat()).length;
 expect(Object.values(cal.reviews).flat()).toHaveLength(12);
 // Replay intake; never manufacture missing records after declaring baseline.
 await post('/onboarding/baseline',{client_id:cid,state,finalize:true});
 expect((await get('/reviews',cid)).map(r=>r.review_id)).toEqual(reviews.map(r=>r.review_id));
 expect((await get('/policies',cid)).map(p=>p.policy_id)).toEqual(policies.map(p=>p.policy_id));
 // Isolated account fixtures only: Demo cannot accept invitations. No program data inserted.
 const accountStore=db();
 accountStore.users.push(...['a','b'].map(s=>({user_id:'cis_qa_owner_'+s,name:'Synthetic Operator '+s,email:s+'@cis-qa.example.test',role:'client_contributor',status:'active',client_ids:[cid]})));
 sessionStorage.setItem(STORE_KEY,JSON.stringify(accountStore));
 const owner='cis_qa_owner_a',nextOwner='cis_qa_owner_b';
 for(const r of reviews)await patch('/reviews/'+r.review_id,{owner_id:owner,expected_occurrence_id:r.current_occurrence_id});
 const ap=a=>'/framework_assessments/'+a.framework_assessment_id;
 for(const [i,a] of ws.assessments.entries()){
  const d=catalog.requirements.find(d=>d.id===a.definition_id);
  const status=a.definition_id==='4.4'?'not_applicable':i<35?'addressed':i<45?'in_progress':i<51?'needs_attention':'not_assessed';
  const verification=status==='addressed'?(i%2?'needs_validation':'verified'):status==='needs_attention'?'gap_identified':'not_verified';
  await patch(ap(a),{status,verification,owner_id:i%2?owner:nextOwner,na_rationale:status==='not_applicable'?'SYNTHETIC scoped organization uses endpoints and SaaS only; no enterprise-managed servers. Reassess on scope change.':'',
   implementation:status==='not_assessed'?'':`DEMO — SYNTHETIC DATA. ${d.title}. ${status==='addressed'?'The operations owner records execution and reviews current samples.':status==='in_progress'?'The documented process operates, but newly added assets remain outside the current evidence sample.':status==='not_applicable'?'Scope decision documented above.':'Operating procedure and verification evidence are missing; corrective work is required.'}`});
 }
 ws=await get('/frameworks/cis-ig1',cid);report.initialAssessment={status:count(ws.assessments,'status'),verification:count(ws.assessments,'verification')};
 const assessmentHistory=copy(ws.assessments.map(a=>({id:a.framework_assessment_id,first:a.assessment_history[0]})));
 const findingIds=[];
 for(const [i,id] of ['1.1','2.1','5.1','4.1','7.1','6.1'].entries()){
  const a=ws.assessments.find(a=>a.definition_id===id),body={request_id:'cis-qa-'+id,title:['Asset coverage incomplete','Software register stale','Leaver access not reconciled','Configuration exceptions undocumented','Patch exceptions lack approval','Access grants lack evidence'][i],description:'DEMO — SYNTHETIC DATA. Sampling identified an incomplete operational record. Retain corrective evidence and validate the changed process.',severity:i%2?'medium':'high',remediation_title:'Reconcile the affected records and independently validate coverage',due_date:'2026-11-30'};
  const f=await post(ap(a)+'/findings',body),again=await post(ap(a)+'/findings',body);
  expect(again.finding_id).toBe(f.finding_id);findingIds.push(f.finding_id);
  const tasks=(await get('/tasks',cid)).filter(t=>t.finding_id===f.finding_id);expect(tasks).toHaveLength(1);expect(tasks[0].assignee_id).toBe(a.owner_id);
  report.findingTargetDatePreserved=f.due_date==='2026-11-30'&&tasks[0].due_date==='2026-11-30';
  // Explicit operational scheduling, not an onboarding repair.
  await patch('/findings/'+f.finding_id,{due_date:'2026-11-30'});await patch('/tasks/'+tasks[0].task_id,{due_date:'2026-11-30'});
 }
 const evidence=await post('/evidence',{client_id:cid,linked_type:'framework_assessment',linked_id:ws.assessments[0].framework_assessment_id,filename:'DEMO-asset-register.txt',mime_type:'text/plain',content_base64:btoa('DEMO - SYNTHETIC DATA\nAsset sampling record')});
 for(let n=0;n<2;n++)await post(ap(ws.assessments[1])+'/links',{kind:'evidence',id:evidence.evidence_id});
 expect((await get('/related',null,{entity_type:'framework_assessments',entity_id:ws.assessments[1].framework_assessment_id})).evidence.filter(e=>e.evidence_id===evidence.evidence_id)).toHaveLength(1);
 const firstTask=(await get('/tasks',cid)).find(t=>t.finding_id===findingIds[0]);
 for(const [kind,id] of [['finding',findingIds[0]],['task',firstTask.task_id],['policy',policies[0].policy_id]])await post('/evidence',{client_id:cid,linked_type:kind,linked_id:id,filename:'DEMO-'+kind+'-validation.txt',mime_type:'text/plain',content_base64:btoa('DEMO - SYNTHETIC DATA\nCorrective validation sample')});
 await post('/comments',{entity_type:'framework_assessments',entity_id:ws.assessments[0].framework_assessment_id,body:'DEMO: keep the original sample and compare it at annual reassessment.'});
 const riskList=[];
 for(const title of ['Unmanaged endpoint access','Supplier outage concentration','Unverified privileged access','Retired file-transfer service'])riskList.push(await post('/risks',{client_id:cid,title,likelihood_score:3,impact_score:3,owner_id:owner,next_review:'2026-12-31',review_cadence:'annual',treatment:'mitigate'}));
 await post('/risks/'+riskList[1].risk_id+'/accept',{rationale:'SYNTHETIC: limited concentration risk accepted with annual monitoring.',expiry_date:'2029-09-30'});
 await patch('/risks/'+riskList[2].risk_id,{status:'in_progress'});
 await post('/risks/'+riskList[3].risk_id+'/close',{reason:'system_process_retired',note:'SYNTHETIC service retired; exposure removed.'});
 const treatment=await post('/tasks',{client_id:cid,title:'Validate privileged-access treatment',assignee_id:owner,due_date:'2027-01-31'});
 await post('/risks/'+riskList[2].risk_id+'/link-action-item',{task_id:treatment.task_id});await patch('/tasks/'+treatment.task_id,{status:'done'});
 expect((await get('/risks/'+riskList[2].risk_id)).status).not.toBe('closed');
 const vendor=await post('/vendors',{client_id:cid,name:'Synthetic Managed Hosting',service:'Managed endpoint support',business_owner_id:owner,next_review:'2026-12-31',review_frequency:'annual',assurance_required:true,assurance_records:[{type:'Security Questionnaire',required:true}],separate_assurance_review:true,assurance_review_date:'2027-02-28',assurance_cadence:'annual',contract_review_enabled:true,contract_renewal:'2027-06-30'});
 expect(new Set((await get('/reviews',cid)).filter(r=>r.vendor_id===vendor.vendor_id).map(r=>r.vendor_purpose))).toEqual(new Set(['vendor','assurance','contract']));
 const policy=policies.find(p=>p.baseline_key==='policy-information-security-policy');
 const policyReview=await post('/reviews',{client_id:cid,title:'Synthetic annual information-security policy review',review_type:'policy',policy_id:policy.policy_id,recurrence:'annual',due_date:'2026-12-31',owner_id:owner});
 const histories=new Map(),timeline=[];
 async function remediate(fid){const tasks=(await get('/tasks',cid)).filter(t=>t.finding_id===fid);for(const t of tasks)await patch('/tasks/'+t.task_id,{status:'done'});expect((await get('/findings/'+fid)).status).toBe('remediated');await post('/findings/'+fid+'/validate',{rationale:'SYNTHETIC: independent sampling confirmed corrective operation.'});}
 for(let month=1;month<=24;month++){
  const day=new Date(Date.UTC(2026,9+month,0)).toISOString().slice(0,10);clock(day);
  let executions=0;
  for(const r of await get('/reviews',cid)){
   if(!r.due_date||r.due_date.slice(0,10)>day||['completed','cancelled'].includes(r.status)||month===24&&r.framework_plan_key==='software-support')continue;
   await post('/reviews/'+r.review_id+'/start',{occurrence_id:r.current_occurrence_id});
   const ev=await post('/evidence',{client_id:cid,linked_type:'review',linked_id:r.review_id,occurrence_id:r.current_occurrence_id,filename:`DEMO-${month}-${r.review_type}.txt`,mime_type:'text/plain',content_base64:Buffer.from('DEMO - SYNTHETIC DATA\nExecuted '+r.title,'utf8').toString('base64')});
   if(month===3&&[policyReview.review_id,...(await get('/reviews',cid)).filter(x=>x.vendor_id===vendor.vendor_id&&x.vendor_purpose==='vendor').map(x=>x.review_id)].includes(r.review_id)){
    const f=await post('/reviews/'+r.review_id+'/create-finding',{occurrence_id:r.current_occurrence_id,request_id:'cycle-gap-'+r.review_id,title:'Current documentation omits the changed support process',description:'SYNTHETIC: update the operating record and sample it independently.',remediation_title:'Update support-process documentation and verify it',severity:'medium',due_date:'2027-02-28'});findingIds.push(f.finding_id);
   }
   const body={occurrence_id:r.current_occurrence_id,completion_notes:'DEMO — SYNTHETIC DATA. Reviewed current records and retained the sample.'};
   const done=await post('/reviews/'+r.review_id+'/complete',body);
   expect(done.occurrence.due_date).toBe(r.due_date);expect(done.occurrence.completed_at.slice(0,10)).toBe(day);
   expect(done.occurrence.evidence.map(e=>e.evidence_id)).toContain(ev.evidence_id);
   expect(done.review.due_date).toBe(reviewSchedule(r).next_review_date||r.due_date);
   expect((await post('/reviews/'+r.review_id+'/complete',body)).occurrence).toEqual(done.occurrence);
   histories.set(done.occurrence.occurrence_id,copy(done.occurrence));executions++;
  }
  if(month===3)await remediate(findingIds[0]);
  if(month===6)for(const fid of [...findingIds.slice(1,3),...findingIds.slice(6)])await remediate(fid);
  if(month===8){for(const r of (await get('/reviews',cid)).slice(0,3))await patch('/reviews/'+r.review_id,{owner_id:nextOwner,expected_occurrence_id:r.current_occurrence_id});}
  if(month===9){
   const beforeDisable=copy((await get('/tasks',cid)).map(t=>({id:t.task_id,owner:t.assignee_id,status:t.status})));
   await patch('/users/'+owner,{status:'disabled'});
   expect((await get('/tasks',cid)).map(t=>({id:t.task_id,owner:t.assignee_id,status:t.status}))).toEqual(beforeDisable);
   const task=(await get('/tasks',cid)).find(t=>t.status!=='done');await patch('/tasks/'+task.task_id,{assignee_id:null});
   await expect(patch('/tasks/'+task.task_id,{assignee_id:owner})).rejects.toThrow();
  }
  if(month===12||month===24)await patch(ap(ws.assessments[0]),{implementation:'DEMO — SYNTHETIC DATA. Annual inventory reconciliation now includes newly enrolled endpoints. Prior sample retained.',owner_id:nextOwner,verification:'verified'});
  if(month===15){
   const a=ws.assessments.find(a=>a.definition_id==='2.2');
   const f=await post(ap(a)+'/findings',{request_id:'year-two-support-gap',title:'New application support exception not approved',description:'DEMO: application introduced during year two lacks the recorded business exception.',remediation_title:'Obtain approval or replace the unsupported application',severity:'medium'});
   findingIds.push(f.finding_id);const task=(await get('/tasks',cid)).find(t=>t.finding_id===f.finding_id);await patch('/tasks/'+task.task_id,{status:'in_progress',due_date:'2028-03-31'});
   await patch(ap(a),{status:'in_progress',verification:'gap_identified'});
  }
  const live=await get('/reviews',cid),tasks=await get('/tasks',cid),dash=await get('/dashboard',cid);
  const reviewPast=live.filter(r=>!['completed','cancelled'].includes(r.status)&&r.due_date?.slice(0,10)<day).length;
  expect(dash.kpis.overdue_reviews).toBe(reviewPast);
  expect(dash.kpis.overdue_actions).toBe(tasks.filter(t=>!['done','cancelled'].includes(t.status)&&t.due_date?.slice(0,10)<day).length);
  expect(dash.kpis.open_findings).toBe((await get('/findings',cid)).filter(f=>!['closed','accepted','cancelled'].includes(f.status)).length);
  for(const key of ['past_due','due_30d','due_31_90d','unassigned']) {
   const items=dash.management.metric_items[key];
   expect(items).toHaveLength(dash.kpis[key]);
   expect(new Set(items.map(item=>item.key)).size).toBe(items.length);
   expect(items.every(item=>item.record.client_id===cid)).toBe(true);
  }
  const calendar=await get('/calendar',cid,{start:day.slice(0,8)+'01',end:day,scope:'all'}),entries=Object.values(calendar).flatMap(bucket=>Object.values(bucket).flat());
  expect(new Set(entries.map(e=>e.key)).size).toBe(entries.length);expect(entries.every(e=>e.client_id===cid)).toBe(true);
  const monthStart=day.slice(0,8)+'01',inWindow=r=>r.due_date&&r.due_date.slice(0,10)>=monthStart&&r.due_date.slice(0,10)<=day;
  const expectedReviewKeys=live.flatMap(r=>[...(inWindow(r)?['review:'+r.review_id+':'+r.current_occurrence_id]:[]),...(r.occurrences||[]).filter(inWindow).map(o=>'review:'+r.review_id+':'+o.occurrence_id)]);
  expect(Object.values(calendar.reviews).flat().map(e=>e.key).sort()).toEqual([...new Set(expectedReviewKeys)].sort());
  for(const r of live)for(const o of r.occurrences||[])expect(o).toEqual(histories.get(o.occurrence_id));
  if([12,24].includes(month)){
   for(const original of assessmentHistory)expect((await get('/framework_assessments/'+original.id)).assessment_history[0]).toEqual(original.first);
   expect((await get('/clients/'+cid+'/profile')).baseline).toEqual(originalBaseline);
  }
  timeline.push({month,day,executions,history:histories.size,calendar:entries.length,kpis:dash.kpis});
 }
 const library=await get('/evidence/catalog',cid),search=await get('/evidence/catalog',cid,{q:'DEMO-asset-register'});
 expect(search.total).toBe(1);expect(library.total).toBe((await get('/evidence',cid)).length);
 expect((await get('/evidence-library/items/'+evidence.evidence_id)).references.filter(r=>r.kind==='framework_assessments')).toHaveLength(2);
 expect((await get('/comments',null,{entity_type:'framework_assessments',entity_id:ws.assessments[0].framework_assessment_id}))).toHaveLength(1);
 report.evidenceFolders={program_counts:library.program_counts,folder_counts:library.folder_counts,search_total:search.total};
 report.timeline=timeline;report.history=histories.size;
 report.final={assessments:count((await get('/frameworks/cis-ig1',cid)).assessments,'status'),findings:count(await get('/findings',cid),'status'),tasks:count(await get('/tasks',cid),'status'),risks:count(await get('/risks',cid),'status'),evidence:(await get('/evidence',cid)).length,storeCharacters:sessionStorage.getItem(STORE_KEY).length};
 for(const kind of Object.keys(foreign))expect(db()[kind].filter(r=>r.client_id!==cid)).toEqual(foreign[kind]);
 const reloaded=axios.create({adapter:previewAdapter});expect((await reloaded.get('/reviews',{params:{client_id:cid}})).data.flatMap(r=>r.occurrences||[])).toHaveLength(histories.size);
 if(process.env.CIS_QA_OUTPUT_DIR){const fs=jest.requireActual('fs'),path=jest.requireActual('path');fs.mkdirSync(process.env.CIS_QA_OUTPUT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.CIS_QA_OUTPUT_DIR,'24-month-report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(process.env.CIS_QA_OUTPUT_DIR,'24-month-store.json'),JSON.stringify({synthetic_lifecycle_fixture:true,client_id:cid,store:db()}));}
 console.info('CIS 24-month result',report.baseline,report.initialAssessment,report.final,{occurrences:histories.size,targetDatePreserved:report.findingTargetDatePreserved});
},180000);

test.each([['monthly',null,'2027-01-31'],['quarterly',null,'2027-03-31'],['semiannual',null,'2027-06-30'],['annual',null,'2027-12-31'],['custom',7,'2027-01-07'],['custom',45,'2027-02-14']])('schedule anchor survives early/on-time/late %s %s',async(recurrence,days,expected)=>{
 const cid=(await post('/clients',{name:'Disposable recurrence edge QA'})).client_id;
 for(const completion of ['2026-12-20','2026-12-31','2027-02-10']){
  const r=await post('/reviews',{client_id:cid,title:'Synthetic schedule edge '+completion,review_type:'access',recurrence,custom_recurrence_days:days,due_date:'2026-12-31'});clock(completion);
  const done=await post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id});
  expect(done.review.due_date.slice(0,10)).toBe(expected);expect(done.occurrence.due_date).toBe('2026-12-31');
 }
},30000);

test('missed monthly periods remain sequential backlog; none are silently skipped',async()=>{
 const cid=(await post('/clients',{name:'Disposable missed occurrence QA'})).client_id;
 let r=await post('/reviews',{client_id:cid,title:'Synthetic missed monthly obligation',review_type:'access',recurrence:'monthly',due_date:'2026-09-01'});clock('2026-11-10');
 for(const expected of ['2026-10-01','2026-11-01','2026-12-01']){r=(await post('/reviews/'+r.review_id+'/complete',{occurrence_id:r.current_occurrence_id})).review;expect(r.due_date.slice(0,10)).toBe(expected);}
 expect(r.occurrences.map(o=>o.due_date.slice(0,10))).toEqual(['2026-09-01','2026-10-01','2026-11-01']);
});
