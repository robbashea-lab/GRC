// The v1 rollout remains a compatibility stage for retained sessions. The v2
// fresh canonical fixture and its new posture are exercised in cisDemoRefresh.
import {buildLegacyDemoStore as seedStore} from './store';
import {applyCisDemoRollout} from './cisDemoRollout';
import {CIS_DEMO_SCENARIOS,cisDemoSelection} from './cisDemoSelection';
import {activeDefinitions} from '../lib/frameworks';
import {captureDemoReporting,demoCurrentPositions} from './portfolioReporting';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {readFileSync} from 'fs';
import path from 'path';
import {addInitech,finishInitech} from './programs/initech';
import {reconcileFramework,frameworkRequest} from './frameworks';
const clock=new Date('2026-10-21T12:00:00.000Z');
const make=()=>{const db=seedStore(clock);applyCisDemoRollout(db,{clock,fresh:true});return db;};

test.each(CIS_DEMO_SCENARIOS)('$name has the actual cumulative IG set and strict selected content',scenario=>{
  const db=make(),cid=scenario.client_id,selection=cisDemoSelection(scenario.implementation_group);
  const rows=db.framework_assessments.filter(a=>a.client_id===cid&&a.framework_key==='cis-ig1');
  expect(new Set(rows.map(a=>a.definition_id))).toEqual(new Set(activeDefinitions('cis-ig1',{implementation_group:scenario.implementation_group}).map(d=>d.id)));
  expect(rows).toHaveLength({1:56,2:130,3:153}[scenario.implementation_group]);
  expect(db.baselines[cid].selected_policy_keys).toEqual(selection.selected_policy_keys);
  expect(db.baselines[cid].reviews).toEqual([]);
  if(cid==='demo_brawndo'){
    const initial=db.clients.find(c=>c.client_id===cid).initial_program_baseline;
    expect(initial.state.selected_policy_keys).toEqual(selection.selected_policy_keys);
    expect(initial.state.reviews).toEqual([]);expect(initial.counts.policies).toBe(10);
    expect(db.policies.filter(p=>p.client_id===cid)).toHaveLength(10);
    expect(db.reviews.some(r=>r.client_id===cid&&r.baseline_key==='policy-review')).toBe(false);
  }
  const policies=db.policies.filter(p=>p.client_id===cid&&p.status!=='retired');
  expect(new Set(policies.map(p=>p.baseline_key))).toEqual(new Set(selection.selected_policy_keys));
  expect(selection.framework_reviews.filter(p=>p.include)).toHaveLength(scenario.implementation_group===1?12:15);
  for(const policy of policies.filter(p=>p.status==='approved')){
    expect(policy.approval_subject).toMatchObject({client_id:cid,policy_id:policy.policy_id,version:policy.version});
    expect(policy.decision_history.some(event=>event.subject?.subject_id===policy.approval_subject.subject_id)).toBe(true);
  }
  expect(db.reviews.filter(r=>r.client_id===cid&&r.baseline_key==='policy-review'&&!r.demo_seed_retired)).toEqual([]);
  const extra=db.reviews.filter(r=>r.client_id===cid&&!['completed','cancelled'].includes(r.status)
    &&!selection.selected_framework_plan_keys.includes(r.framework_plan_key)
    &&!r.framework_drivers?.some(d=>selection.selected_framework_plan_keys.includes(d.framework_plan_key)));
  expect(extra.map(r=>r.review_id).sort()).toEqual(selection.native_followups.map(r=>r.review_id).sort());
  for(const followup of selection.native_followups){
    expect(extra.find(r=>r.review_id===followup.review_id).recurrence).toBe(followup.recurrence);
    expect(db[followup.source_kind].some(row=>row[followup.source_kind==='policies'?'policy_id':followup.source_kind==='vendors'?'vendor_id':followup.source_kind==='risks'?'risk_id':'ai_system_id']===followup.source_id&&row.client_id===cid)).toBe(true);
  }
});

test.each(CIS_DEMO_SCENARIOS)('$name published selection manifest equals the runtime registry',scenario=>{
  const file=path.resolve(__dirname,'../../../docs/cis-rollout',scenario.client_id+'-selection.json');
  expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(cisDemoSelection(scenario.implementation_group));
});

test('new scenarios use company-specific identities and connected native work',()=>{
  const db=make();
  for(const cid of ['demo_initech','demo_krusty_krab']){
    const finding=db.findings.find(f=>f.client_id===cid),task=db.tasks.find(t=>t.finding_id===finding.finding_id);
    expect(task.client_id).toBe(cid);expect(finding.primary_task_id).toBe(task.task_id);
    const risk=db.risks.find(r=>r.client_id===cid),ai=db.ai_systems.find(a=>a.client_id===cid);
    expect(risk).toMatchObject({likelihood_score:3,impact_score:4,status:'in_progress'});
    expect(ai.related_links).toContainEqual({kind:'risks',id:risk.risk_id});
    expect(db.contacts.filter(c=>c.client_id===cid)).not.toHaveLength(0);
    expect(db.evidence.find(e=>e.client_id===cid).size).toBeLessThan(1024);
    expect(db.reviews.filter(r=>r.client_id===cid).some(r=>r.occurrences?.length)).toBe(true);
    expect(db.framework_assessments.filter(a=>a.client_id===cid).some(a=>a.assessment_history.length)).toBe(true);
    for(const row of db.framework_assessments.filter(a=>a.client_id===cid)){
      expect(db.contacts.some(contact=>contact.client_id===cid&&contact.contact_id===row.process_owner_id)).toBe(true);
      expect(db.users.some(user=>user.user_id===row.owner_id)).toBe(true);
    }
    for(const row of db.framework_assessments.filter(a=>a.client_id===cid&&a.assessment_history.length))
      expect(Date.parse(row.last_saved)).toBeGreaterThanOrEqual(Math.max(...row.assessment_history.map(event=>Date.parse(event.at))));
    const history=db.portfolio_reporting.snapshots.filter(s=>s.client_id===cid);
    expect(history).toHaveLength(5);
    expect(history.every(s=>s.current.provenance.fixture_revision==='cis81-standard-demo-v1')).toBe(true);
    expect(history[0].current.implemented).toBeLessThan(history.at(-1).current.implemented);
    expect(db.portfolio_reporting.scope_events.some(e=>e.client_id===cid)).toBe(false);
  }
});

test.each(['demo_initech','demo_krusty_krab'])('%s native safeguard save accepts its Contact process owner and rejects a foreign Contact',cid=>{
  const db=make(),row=db.framework_assessments.find(a=>a.client_id===cid),notes='Synthetic native save with valid process Contact';
  frameworkRequest(db,'/framework-assessments/'+row.framework_assessment_id,'patch',{},
    {notes,process_owner_id:row.process_owner_id,expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(row.notes).toBe(notes);
  const before=JSON.stringify(row);
  expect(()=>frameworkRequest(db,'/framework-assessments/'+row.framework_assessment_id,'patch',{},
    {process_owner_id:'demo_brawndo_contact_0',expected_last_assessed:row.last_saved??row.last_assessed??null})).toThrow('Process owner must be a client Contact');
  expect(JSON.stringify(row)).toBe(before);
});

test('actual new-scenario status changes update current counts and append native history',()=>{
  const db=make(),cid='demo_krusty_krab',before=JSON.parse(JSON.stringify(db));
  const row=db.framework_assessments.find(a=>a.client_id===cid&&a.status==='not_assessed');
  row.status='addressed';row.last_saved='2026-10-22T12:00:00.000Z';
  const start=demoCurrentPositions(before,before.clients).find(p=>p.client_id===cid).current.implemented;
  captureDemoReporting(db,before,'2026-10-22T12:00:00.000Z');
  expect(demoCurrentPositions(db,db.clients).find(p=>p.client_id===cid).current.implemented).toBe(start+1);
  expect(db.portfolio_reporting.snapshots.filter(s=>s.client_id===cid)).toHaveLength(6);
});

test('fixture history context requires authorized Demo identity and actual retained source events',()=>{
  const db=make(),cid='demo_initech',at='2026-10-22T12:00:00.000Z';
  expect(getCisDemoScenarioContext(db,cid,at)).toMatchObject({version:'cis81-standard-demo-v1',client_id:cid});
  const source=db.framework_assessments.find(row=>row.client_id===cid&&row.assessment_history.length);
  source.status='addressed';source.assessment_history.push({at,status:'addressed'});
  expect(getCisDemoScenarioContext(db,cid,at)).not.toBeNull();
  const saved=source.assessment_history.shift();
  expect(getCisDemoScenarioContext(db,cid,at)).toBeNull();source.assessment_history.unshift(saved);
  const mode=db.user.workspace_mode;db.user.workspace_mode='standard';
  expect(getCisDemoScenarioContext(db,cid,at)).toBeNull();db.user.workspace_mode=mode;
  db.user.client_ids=db.user.client_ids.filter(id=>id!==cid);
  expect(getCisDemoScenarioContext(db,cid,at)).toBeNull();
});

test('re-entry is idempotent, preserves edits and leaves unrelated clients unchanged',()=>{
  const db=make(),cid='demo_initech',row=db.framework_assessments.find(a=>a.client_id===cid);
  row.notes='User-authored retained draft';db.clients.find(c=>c.client_id===cid).framework_settings['cis-ig1'].implementation_group=3;
  const before=JSON.stringify(db);
  expect(applyCisDemoRollout(db,{clock})).toBe(false);expect(JSON.stringify(db)).toBe(before);
});

test('unmarked legacy optional records are inventoried and never silently archived',()=>{
  const db=make();delete db.cis_demo_rollout;
  const optional={policy_id:'demo_brawndo_policy-acceptable-use-policy',client_id:'demo_brawndo',baseline_key:'policy-acceptable-use-policy',title:'Acceptable Use Policy',status:'draft',notes:'User retained edits'};
  db.policies.push(optional);
  const before=JSON.stringify(optional),other=JSON.stringify(db.clients.filter(c=>['demo_dunder','demo_prestige'].includes(c.client_id)));
  applyCisDemoRollout(db,{clock});
  expect(JSON.stringify(optional)).toBe(before);
  expect(db.cis_demo_rollout.reconciliation_required).toContainEqual(expect.objectContaining({kind:'policies',id:optional.policy_id}));
  expect(JSON.stringify(db.clients.filter(c=>['demo_dunder','demo_prestige'].includes(c.client_id)))).toBe(other);
});

test('retained untouched Initech keeps original creation metadata during explicit fixture upgrade',()=>{
  const db=make(),cid='demo_initech';
  for(const [key,value] of Object.entries(db))if(Array.isArray(value))db[key]=value.filter(row=>row.client_id!==cid);
  delete db.baselines[cid];delete db.cis_demo_rollout.clients[cid];
  db.portfolio_reporting.snapshots=db.portfolio_reporting.snapshots.filter(row=>row.client_id!==cid);
  db.portfolio_reporting.identities=db.portfolio_reporting.identities.filter(row=>row.program_id!==cid+':cis-ig1');
  const oldClock=new Date('2026-10-15T12:00:00.000Z');addInitech(db,oldClock);reconcileFramework(db,cid,db.baselines[cid]);finishInitech(db,oldClock);
  const original=new Map(['clients','contacts','reviews','framework_assessments'].flatMap(kind=>db[kind].filter(row=>row.client_id===cid).map(row=>[row.client_id+':'+(row.contact_id||row.review_id||row.framework_assessment_id||'client'),row.created_at])));
  const originalReviewIds=db.reviews.filter(row=>row.client_id===cid).map(row=>row.review_id);
  applyCisDemoRollout(db,{clock});
  expect(db.reviews.filter(row=>row.client_id===cid).map(row=>row.review_id)).toEqual(expect.arrayContaining(originalReviewIds));
  for(const kind of ['clients','contacts','reviews','framework_assessments'])for(const row of db[kind].filter(row=>row.client_id===cid)){
    const key=row.client_id+':'+(row.contact_id||row.review_id||row.framework_assessment_id||'client');
    if(original.has(key))expect(row.created_at).toBe(original.get(key));
  }
  expect(db.cis_demo_rollout.clients[cid].ownership).toBe('untouched_greenfield_revision');
  expect(db.policies.filter(row=>row.client_id===cid)).toHaveLength(10);
});

test('ordinary authenticated fixtures never receive fictional data',()=>{
  const db={user:{workspace_mode:'normal'},clients:[{client_id:'real',name:'Customer'}]};
  const before=JSON.stringify(db);expect(applyCisDemoRollout(db,{clock})).toBe(false);expect(JSON.stringify(db)).toBe(before);
});

test('before-noon UTC creation never writes a future current scenario observation',()=>{
  const early=new Date('2026-10-21T07:15:00.000Z'),db=seedStore(early);
  for(const cid of ['demo_initech','demo_krusty_krab']){
    const context=getCisDemoScenarioContext(db,cid,early.toISOString());
    expect(context).not.toBeNull();expect(Date.parse(context.anchor)).toBeLessThanOrEqual(+early);
    expect(db.portfolio_reporting.snapshots.filter(p=>p.client_id===cid).every(p=>Date.parse(p.effective_at)<=+early)).toBe(true);
    expect(Date.parse(db.cis_demo_rollout.clients[cid].applied_at)).toBeLessThanOrEqual(+early);
    for(const review of db.reviews.filter(row=>row.client_id===cid))for(const occurrence of review.occurrences||[])
      expect(Date.parse(occurrence.completed_at)).toBeLessThanOrEqual(+early);
    for(const row of db.framework_assessments.filter(row=>row.client_id===cid))for(const event of row.assessment_history||[])
      expect(Date.parse(event.at)).toBeLessThanOrEqual(+early);
  }
});

test('two fresh constructions retain exact fictional Review occurrence and linked identities',()=>{
  const first=make(),second=make(),cid='demo_krusty_krab';
  const relevant=db=>Object.fromEntries(['reviews','findings','tasks','evidence','framework_assessments','logs'].map(kind=>[kind,db[kind].filter(row=>row.client_id===cid)]));
  expect(relevant(second)).toEqual(relevant(first));
  for(const review of first.reviews.filter(row=>row.client_id===cid&&row.framework_plan_key)){
    expect(review.review_id).toBe(`${cid}_framework_${review.framework_plan_key}`);
    expect(review.current_occurrence_id).toBe('occ_'+review.review_id);
    for(const occurrence of review.occurrences||[])expect(occurrence.occurrence_id.startsWith(review.review_id+'_')||occurrence.occurrence_id==='occ_'+review.review_id).toBe(true);
  }
});
