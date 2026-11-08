import {seedStore,saveStore,readStore} from './store';
import {refreshCanonicalCisDemo} from './cisDemoRefresh';
import {cisDemoFixtureDates,CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {activeDefinitions,cis} from '../lib/frameworks';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {captureDemoReporting,demoCurrentPositions,portfolioReportingRequest} from './portfolioReporting';
import {frameworkRequest} from './frameworks';
import {clearFileCache,lightweightStore,payloadBytes} from './evidenceStorage';
import {effectivePolicySubject} from './policyReviewCoverage';
import {reviewSchedule} from '../lib/reviewOccurrences';
import {restoredCisDemoEvidence} from './cisDemoEvidence';
import {forecastImplementation} from '../lib/portfolioProgress';

const NOW='2026-10-28T17:30:00.000Z';
const clone=value=>JSON.parse(JSON.stringify(value));
const SCENARIOS=[
  {cid:'demo_brawndo',group:1,counts:[41,8,4,3]},
  {cid:'demo_initech',group:2,counts:[120,5,3,2]},
  {cid:'demo_krusty_krab',group:3,counts:[153,0,0,0]},
];
const STATUSES=['addressed','in_progress','needs_attention','not_assessed'];
const TABLE_IDS={contacts:'contact_id',framework_assessments:'framework_assessment_id',reviews:'review_id',
  findings:'finding_id',tasks:'task_id',evidence:'evidence_id',assets:'asset_id',policies:'policy_id',
  risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id'};
const recordsFor=(db,cid)=>db.framework_assessments.filter(row=>row.client_id===cid&&row.framework_key==='cis-ig1');

test('descriptive CIS group metadata agrees with the existing released cumulative scope',()=>{
  expect(cis.implementation_groups).toEqual([1,2,3]);
  expect(cis.implementation_groups).toEqual(cis.available_implementation_groups);
  expect([1,2,3].map(implementation_group=>activeDefinitions('cis-ig1',{implementation_group}).length)).toEqual([56,130,153]);
});

test('fictional completed occurrences retain coherent creation, completion, update and next-cycle dates',()=>{
  const db=seedStore(new Date(NOW));
  for(const review of db.reviews.filter(row=>SCENARIOS.some(scenario=>scenario.cid===row.client_id))){
    for(const occurrence of review.occurrences||[]){
      expect(Date.parse(occurrence.created_at)).toBeLessThanOrEqual(Date.parse(occurrence.completed_at));
      expect(Date.parse(occurrence.updated_at)).toBeLessThanOrEqual(Date.parse(occurrence.completed_at));
      expect(Date.parse(occurrence.completed_at)).toBeLessThanOrEqual(Date.parse(NOW));
      if(occurrence.next_review_date)expect(Date.parse(occurrence.next_review_date)).toBeGreaterThan(Date.parse(occurrence.due_date));
    }
  }
});

beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date(NOW));
  sessionStorage.clear();
  clearFileCache();
});
afterEach(()=>{
  sessionStorage.clear();
  clearFileCache();
  jest.useRealTimers();
});

test.each(SCENARIOS)('$cid current posture is the exact native v8.1 cumulative IG population',({cid,group,counts})=>{
  const db=seedStore(new Date(NOW)),rows=recordsFor(db,cid);
  expect(rows.map(row=>row.definition_id).sort()).toEqual(activeDefinitions('cis-ig1',{implementation_group:group}).map(row=>row.id).sort());
  expect(STATUSES.map(status=>rows.filter(row=>row.status===status).length)).toEqual(counts);
  expect(new Set(rows.map(row=>row.framework_assessment_id)).size).toBe(rows.length);
  expect(rows.every(row=>row.framework_version==='8.1'&&row.framework_assessment_id===`fw_${cid}_assessment_${row.definition_id}`)).toBe(true);
  const current=demoCurrentPositions(db,db.clients,NOW).find(row=>row.client_id===cid).current;
  expect(current.denominator).toBe(counts.reduce((sum,count)=>sum+count,0));
  expect(current.excluded).toBe(0);
  expect(current.implemented).toBe(counts[0]);
  expect(current.included_counts.map(row=>[row.key,row.count])).toEqual(expect.arrayContaining(STATUSES.map((status,i)=>[status,counts[i]])));
  expect(db.cis_demo_refresh).toMatchObject({version:CIS_SHOWCASE_VERSION,anchor:'2026-10-28T00:00:00.000Z',timezone:'UTC'});
  expect(db.cis_demo_refresh.clients[cid]).toBeTruthy();
  expect(db.cis_demo_rollout.clients[cid]).toMatchObject({ownership:'fresh_fixture',superseded_by:CIS_SHOWCASE_VERSION});
  if(process.env.CIS_DEMO_QA_DIAGNOSTICS==='true')console.info('CIS_FIXTURE_RECEIPT',JSON.stringify({
    client_id:cid,implementation_group:group,anchor:db.cis_demo_refresh.anchor,version:CIS_SHOWCASE_VERSION,
    statuses:Object.fromEntries(STATUSES.map(status=>[status,rows.filter(row=>row.status===status).length])),
    implementation_percent:current.implemented/current.denominator*100,
    records:Object.fromEntries(Object.entries(TABLE_IDS).map(([kind])=>[kind,db[kind].filter(row=>row.client_id===cid).length])),
    review_ids:db.reviews.filter(row=>row.client_id===cid).map(row=>row.review_id),
    evidence:db.evidence.filter(row=>row.client_id===cid).map(row=>({id:row.evidence_id,filename:row.filename,size:row.size}))
  }));
});

test.each(SCENARIOS)('$cid fixture history is qualified by actual native assessment events and cannot claim pre-v8.1 assessments',({cid})=>{
  const db=seedStore(new Date(NOW)),context=getCisDemoScenarioContext(db,cid,NOW);
  expect(context).toMatchObject({version:CIS_SHOWCASE_VERSION,client_id:cid,program_id:cid+':cis-ig1'});
  expect(context.point_ids).toHaveLength(6);
  const rows=recordsFor(db,cid),points=db.portfolio_reporting.snapshots.filter(row=>context.point_ids.includes(row.snapshot_id));
  expect(points).toHaveLength(6);
  for(const row of rows){
    for(const event of row.assessment_history||[]){
      expect(Date.parse(event.at)).toBeGreaterThanOrEqual(Date.parse('2024-06-24T00:00:00.000Z'));
      expect(Date.parse(event.at)).toBeLessThanOrEqual(Date.parse(context.anchor));
    }
  }
  for(const point of points){
    expect(point.current.provenance.source_references).toHaveLength(rows.length);
    expect(point.current.denominator).toBe(rows.length);
    expect(point.current.provenance.source_references.every(ref=>ref.framework_version==='8.1')).toBe(true);
    expect(Date.parse(point.effective_at)).toBeGreaterThanOrEqual(Date.parse('2024-06-24T00:00:00.000Z'));
  }
  const source=rows.find(row=>row.assessment_history?.length);
  expect(source).toBeTruthy();
  source.assessment_history.shift();
  expect(getCisDemoScenarioContext(db,cid,NOW)).toBeNull();
});

test.each(SCENARIOS.flatMap(scenario=>['1m','3m','6m','12m'].map(range=>({...scenario,range}))))(
  '$cid $range report compares qualified history against the same native denominator',({cid,group,counts,range})=>{
    const db=seedStore(new Date(NOW));
    const report=portfolioReportingRequest(db,'/portfolio/reporting/history',{
      client_id:cid,program_key:`cis-ig${group}`,range,as_of:NOW,demo_scenario:CIS_SHOWCASE_VERSION,
    });
    expect(report.scenario_context).toMatchObject({version:CIS_SHOWCASE_VERSION,client_id:cid});
    expect(report.current.implemented).toBe(counts[0]);
    expect(report.current.denominator).toBe(counts.reduce((sum,count)=>sum+count,0));
    expect(report.comparison.comparable).toBe(true);
    expect(report.comparison.scope_changed).toBe(false);
    expect(report.comparison.baseline).toBeTruthy();
    expect(report.comparison.baseline.denominator).toBe(report.current.denominator);
    expect(report.snapshots.length).toBeGreaterThan(0);
    const forecast=forecastImplementation(report.forecast_snapshots,report.current,NOW,{
      demoScenario:report.scenario_context,scopeChanges:report.forecast_scope_changes});
    expect(forecast.ok).toBe(true);
    if(group<3){
      expect(forecast.monthly_pace).toBeGreaterThan(0);
      expect(forecast.days).toBeGreaterThan(0);
      expect(forecast.calculation_basis).toBe('demo_scenario');
    }else expect(forecast.days).toBe(0);
  });

test('same UTC day keeps complete fixture bytes and record IDs stable across initialization clocks',()=>{
  const early=seedStore(new Date('2026-10-28T00:10:00.000Z'));
  const late=seedStore(new Date('2026-10-28T23:50:00.000Z'));
  expect(late).toEqual(early);
  expect(cisDemoFixtureDates(new Date(NOW))).toMatchObject({anchor:'2026-10-28T00:00:00.000Z'});
  expect(cisDemoFixtureDates(new Date('2028-03-31T23:00:00Z')).month(-1)).toBe('2028-02-29');
  expect(()=>cisDemoFixtureDates(new Date('invalid'))).toThrow('Invalid CIS Demo initialization date');
});

test('new and historical native links resolve inside the same client without adding application accounts',()=>{
  const db=seedStore(new Date(NOW));
  for(const {cid} of SCENARIOS){
    expect(db.ai_systems.filter(row=>row.client_id===cid).length).toBeGreaterThanOrEqual(3);
    expect(db.risks.filter(row=>row.client_id===cid).length).toBeGreaterThanOrEqual(4);
    for(const [kind,id] of Object.entries(TABLE_IDS)){
      const rows=db[kind].filter(row=>row.client_id===cid);
      expect(new Set(rows.map(row=>row[id])).size).toBe(rows.length);
      for(const row of rows){
        for(const link of [...(row.related_links||[]),...(row.relationships||[])]){
          if(!TABLE_IDS[link.kind])continue;
          expect(db[link.kind].some(target=>target[TABLE_IDS[link.kind]]===link.id&&target.client_id===cid)).toBe(true);
        }
        if(row.risk_id&&kind==='reviews')expect(db.risks.some(risk=>risk.risk_id===row.risk_id&&risk.client_id===cid)).toBe(true);
        if(row.vendor_id&&kind==='reviews')expect(db.vendors.some(vendor=>vendor.vendor_id===row.vendor_id&&vendor.client_id===cid)).toBe(true);
        if(row.ai_system_id&&kind==='reviews')expect(db.ai_systems.some(ai=>ai.ai_system_id===row.ai_system_id&&ai.client_id===cid)).toBe(true);
      }
    }
  }
  expect(db.users.filter(user=>user.user_id.startsWith('demo_initech_')||user.user_id.startsWith('demo_krusty_krab_'))).toEqual([]);
});

test('fresh replacement preserves canonical client and framework identities, people, requirements and unrelated records',()=>{
  const db=seedStore(new Date(NOW)),targets=new Set(SCENARIOS.map(row=>row.cid));
  delete db.cis_demo_refresh;
  db.clients.push({client_id:'clients_demo_outside_refresh',name:'Outside the canonical cohort',environment:'Demo',status:'active'});
  db.risks.push({risk_id:'visitor-risk',client_id:'clients_demo_outside_refresh',title:'Visitor-owned synthetic record',notes:'Preserve exactly'});
  const unrelated=Object.fromEntries(['clients',...Object.keys(TABLE_IDS)].map(kind=>[kind,clone(db[kind].filter(row=>!targets.has(row.client_id)))]));
  const clientIdentity=client=>Object.fromEntries(['client_id','name','logo','logo_url','logo_key','framework_settings','created_at','created_by'].map(key=>[key,client[key]]));
  const originalClients=db.clients.filter(client=>targets.has(client.client_id)).map(clientIdentity);
  const originalAssessments=db.framework_assessments.filter(row=>targets.has(row.client_id)).map(row=>({
    framework_assessment_id:row.framework_assessment_id,client_id:row.client_id,framework_key:row.framework_key,
    framework_version:row.framework_version,definition_id:row.definition_id,created_at:row.created_at,created_by:row.created_by,
  }));
  const programReviews=db.reviews.filter(row=>targets.has(row.client_id)&&row.framework_plan_key).map(row=>({
    review_id:row.review_id,client_id:row.client_id,framework_plan_key:row.framework_plan_key,
  }));
  const contacts=clone(db.contacts),requirements=clone(db.requirements);
  const people=clone(db.users);
  refreshCanonicalCisDemo(db,{clock:new Date(NOW),fresh:true});
  for(const [kind,rows] of Object.entries(unrelated))expect(db[kind].filter(row=>!targets.has(row.client_id))).toEqual(rows);
  expect(db.users).toEqual(people);
  expect(db.contacts).toEqual(contacts);
  expect(db.requirements).toEqual(requirements);
  expect(db.clients.filter(client=>targets.has(client.client_id)).map(clientIdentity)).toEqual(originalClients);
  for(const original of originalAssessments){
    expect(db.framework_assessments.find(row=>row.framework_assessment_id===original.framework_assessment_id)).toMatchObject(original);
  }
  expect(db.reviews.filter(row=>targets.has(row.client_id)&&row.framework_plan_key).map(row=>({
    review_id:row.review_id,client_id:row.client_id,framework_plan_key:row.framework_plan_key,
  }))).toEqual(programReviews);
});

test('intact initialization marker makes ordinary re-entry and repeated fresh calls exact no-ops',()=>{
  const db=seedStore(new Date(NOW)),before=clone(db);
  refreshCanonicalCisDemo(db,{clock:new Date('2026-10-29T10:00:00.000Z'),fresh:false});
  expect(db).toEqual(before);
  refreshCanonicalCisDemo(db,{clock:new Date('2026-10-30T10:00:00.000Z'),fresh:true});
  expect(db).toEqual(before);
});

test('complete fresh seed downloads original canonical bytes after empty-cache reload while preserving other clients and the inline budget',()=>{
  const db=seedStore(new Date(NOW)),targets=new Set(SCENARIOS.map(row=>row.cid));
  const originals=db.evidence.filter(row=>row.content_base64).map(row=>({
    evidence_id:row.evidence_id,client_id:row.client_id,content_base64:row.content_base64,size:row.size,
  }));
  for(const {cid} of SCENARIOS)expect(originals.some(row=>row.client_id===cid)).toBe(true);
  for(const cid of ['demo_dunder','demo_prestige'])expect(originals.some(row=>row.client_id===cid)).toBe(true);
  if(process.env.CIS_DEMO_QA_DIAGNOSTICS==='true')console.info('CIS_EVIDENCE_BUDGET',JSON.stringify(Object.fromEntries(db.clients.map(client=>[client.client_id,{
    records:originals.filter(row=>row.client_id===client.client_id).length,
    payload_bytes:originals.filter(row=>row.client_id===client.client_id).reduce((total,row)=>total+payloadBytes(row.content_base64),0)
  }]))));
  const lightweight=lightweightStore(db);
  const persisted=saveStore(db);
  expect(persisted.evidence.reduce((total,row)=>total+payloadBytes(row.content_base64),0)).toBeLessThanOrEqual(64*1024);
  // The out-of-scope ISO/SOC payloads already exceed the inline budget by
  // themselves. Their existing serializer decisions must remain unchanged.
  for(const original of originals.filter(row=>!targets.has(row.client_id)))
    expect(persisted.evidence.find(row=>row.evidence_id===original.evidence_id)).toEqual(lightweight.evidence.find(row=>row.evidence_id===original.evidence_id));
  clearFileCache();
  const reloaded=readStore();
  const bytes=value=>Uint8Array.from(atob(value.split(',').pop()),character=>character.charCodeAt(0));
  const beforeDownload=clone(reloaded);
  for(const original of originals){
    const saved=persisted.evidence.find(row=>row.evidence_id===original.evidence_id);
    const loaded=reloaded.evidence.find(row=>row.evidence_id===original.evidence_id);
    if(targets.has(original.client_id)){
      const downloaded=loaded.content_base64?loaded:restoredCisDemoEvidence(reloaded,loaded);
      expect(downloaded).toMatchObject(original);
      expect(bytes(downloaded.content_base64)).toEqual(bytes(original.content_base64));
      expect(bytes(downloaded.content_base64)).toHaveLength(original.size);
    }else{
      expect(restoredCisDemoEvidence(reloaded,loaded)).toBeNull();
      expect(loaded.content_base64).toBe(saved.content_base64);
      expect(loaded.demo_file_storage).toBe(saved.demo_file_storage);
    }
  }
  expect(reloaded).toEqual(beforeDownload);
});

test('Policy states preserve real pending, draft and missing semantics while approved versions pass native coverage validation',()=>{
  const db=seedStore(new Date(NOW)),brawndo=db.policies.filter(row=>row.client_id==='demo_brawndo');
  const pending=brawndo.find(row=>row.status==='in_review'),draft=brawndo.find(row=>row.status==='draft');
  const missing=brawndo.find(row=>row.status==='needs_creation');
  expect(pending).toBeTruthy();expect(draft).toBeTruthy();expect(missing).toBeTruthy();
  expect(pending.approval_request_id).toBeTruthy();
  expect(pending.approval_history).toEqual(expect.arrayContaining([expect.objectContaining({
    action:'submitted',approval_request_id:pending.approval_request_id,
    subject:expect.objectContaining({policy_id:pending.policy_id,client_id:pending.client_id,version:pending.version}),
  })]));
  for(const row of [pending,draft,missing]){
    expect(row.approved_at).toBeFalsy();
    expect(effectivePolicySubject(row,NOW)).toBeNull();
    expect((row.approval_history||[]).some(event=>event.action==='approved')).toBe(false);
    expect((row.decision_history||[]).some(event=>event.action==='external_approval_recorded')).toBe(false);
  }
  expect(missing).toMatchObject({presence:'reported_missing',baseline_response:'no',version:''});
  for(const row of db.policies.filter(policy=>SCENARIOS.some(scenario=>scenario.cid===policy.client_id)&&policy.status==='approved')){
    expect(effectivePolicySubject(row,NOW)).toMatchObject({policy_id:row.policy_id,client_id:row.client_id,version:row.version,subject_id:row.approval_subject.subject_id});
  }
});

test('Krusty organization history preserves earlier document approval without inventing earlier v8.1 assessment work or overdue CIS gaps',()=>{
  const db=seedStore(new Date(NOW)),cid='demo_krusty_krab',anchor=cisDemoFixtureDates(new Date(NOW));
  const approved=db.policies.filter(policy=>policy.client_id===cid&&policy.status==='approved');
  expect(approved.length).toBeGreaterThan(0);
  for(const policy of approved){
    const original=policy.decision_history.find(event=>event.subject?.version==='1.0');
    expect(original).toMatchObject({action:'external_approval_recorded',recorded_at:anchor.month(-96)+'T00:00:00.000Z'});
    expect(original.subject.subject_id).not.toBe(policy.approval_subject.subject_id);
    expect(policy.approval_subject.version).toBe('2.0');
    expect(policy.approved_at).toBe(policy.decision_history.find(event=>event.subject?.version==='2.0').recorded_at);
    const review=db.reviews.find(row=>row.client_id===cid&&row.policy_id===policy.policy_id);
    expect(review.occurrences).toHaveLength(8);
    expect(review.occurrences.some(occurrence=>occurrence.completed_at<'2024-06-24T00:00:00.000Z')).toBe(true);
    expect(review.governance_context.category).toBe('organizational');
  }
  const programReviews=db.reviews.filter(row=>row.client_id===cid&&row.framework_plan_key);
  expect(programReviews.length).toBeGreaterThan(0);
  for(const review of programReviews){
    expect(review.due_date.slice(0,10)>=anchor.day(0)).toBe(true);
    const last=review.occurrences.at(-1);
    expect(last).toBeTruthy();
    expect(reviewSchedule({...review,due_date:last.due_date,recurrence_due_date:null}).next_review_date.slice(0,10)).toBe(review.due_date.slice(0,10));
  }
  expect(db.findings.filter(row=>row.client_id===cid&&row.framework_assessment_id)).toEqual([]);
});

test.each([['demo_brawndo','4.1'],['demo_initech','16.6']])('%s remaining %s gap has real connected Finding and open Action without falsely implementing the safeguard',(cid,definition)=>{
  const db=seedStore(new Date(NOW)),assessment=recordsFor(db,cid).find(row=>row.definition_id===definition);
  expect(assessment.status).toBe('needs_attention');
  const finding=db.findings.find(row=>row.client_id===cid&&row.framework_assessment_id===assessment.framework_assessment_id);
  expect(finding).toBeTruthy();
  const action=db.tasks.find(row=>row.task_id===finding.primary_task_id);
  expect(action).toMatchObject({client_id:cid,finding_id:finding.finding_id,framework_assessment_id:assessment.framework_assessment_id,status:'open'});
  expect(assessment.related_links).toEqual(expect.arrayContaining([{kind:'findings',id:finding.finding_id},{kind:'tasks',id:action.task_id}]));
});

test.each(SCENARIOS.filter(scenario=>scenario.group<3))('$cid genuine native assessment edit adds one committed observation without rewriting imported history',({cid,counts})=>{
  const db=seedStore(new Date(NOW)),row=recordsFor(db,cid).find(record=>record.status==='not_assessed');
  const originalContext=getCisDemoScenarioContext(db,cid,NOW);
  const imported=clone(db.portfolio_reporting.snapshots.filter(point=>originalContext.point_ids.includes(point.snapshot_id)));
  const before=clone(db),savedAt='2026-10-29T10:30:00.000Z';
  jest.setSystemTime(new Date(savedAt));
  frameworkRequest(db,'/framework-assessments/'+row.framework_assessment_id,'patch',{},
    {status:'in_progress',notes:'Visitor-authored synthetic follow-up.',expected_last_assessed:row.last_saved??row.last_assessed??null});
  captureDemoReporting(db,before,savedAt);
  const current=demoCurrentPositions(db,db.clients,savedAt).find(position=>position.client_id===cid).current;
  expect(current.included_counts.find(count=>count.key==='not_assessed').count).toBe(counts[3]-1);
  expect(current.included_counts.find(count=>count.key==='in_progress').count).toBe(counts[1]+1);
  // Native capture may append continuity proof to the predecessor. It must keep
  // its saved source population, status judgements, provenance and timestamps.
  const historicalPayload=point=>{
    const payload=clone(point);
    for(const key of ['effective_until','continuity_proven','continuity_source_event'])delete payload.current[key];
    return payload;
  };
  expect(db.portfolio_reporting.snapshots.filter(point=>originalContext.point_ids.includes(point.snapshot_id)).map(historicalPayload)).toEqual(imported.map(historicalPayload));
  expect(db.portfolio_reporting.snapshots.filter(point=>point.client_id===cid&&point.observation_kind==='committed_event')).toHaveLength(1);
  expect(getCisDemoScenarioContext(db,cid,savedAt)).toBeTruthy();
});

test('retained sessions preserve visitor edits, native identities, history, other clients and standard storage',()=>{
  const db=seedStore(new Date(NOW)),cid='demo_brawndo';
  // Removing the new marker models an existing session, not a fresh initialization.
  delete db.cis_demo_refresh;
  recordsFor(db,cid)[0].notes='Retained visitor narrative';
  db.reviews.find(row=>row.client_id===cid).notes='Retained in-progress Review';
  db.clients.push({client_id:'clients_demo_new_visitor',name:'Visitor-created client',environment:'Demo',status:'active'});
  db.drafts[cid]={client_id:cid,notes:'Unsaved onboarding work'};
  db.portfolio_reporting.snapshots.push({snapshot_id:'visitor-observation',client_id:cid,notes:'Never replace retained history'});
  const protectedKeys=['clients','users','baselines','drafts','portfolio_reporting',...Object.keys(TABLE_IDS)];
  const before=Object.fromEntries(protectedKeys.map(key=>[key,clone(db[key])]));
  localStorage.setItem('cis-refresh-standard-sentinel','unchanged');
  try{
    refreshCanonicalCisDemo(db,{clock:new Date('2026-10-29T00:00:00.000Z'),fresh:false});
    for(const key of protectedKeys)expect(db[key]).toEqual(before[key]);
    expect(db.cis_demo_refresh.reconciliation_required.length).toBeGreaterThan(0);
    const after=clone(db);
    refreshCanonicalCisDemo(db,{clock:new Date('2026-10-30T00:00:00.000Z'),fresh:false});
    expect(db).toEqual(after);
    expect(localStorage.getItem('cis-refresh-standard-sentinel')).toBe('unchanged');
  }finally{localStorage.removeItem('cis-refresh-standard-sentinel');}
});

test.each(['normal','standard'])('refresh never installs fictional data into %s authenticated state',workspace_mode=>{
  const db={user:{workspace_mode},clients:[{client_id:'demo_brawndo',environment:'Demo',name:'Brawndo'}]};
  const before=clone(db);
  refreshCanonicalCisDemo(db,{clock:new Date(NOW),fresh:true});
  expect(db).toEqual(before);
});
