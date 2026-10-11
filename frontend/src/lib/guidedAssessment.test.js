import {pilotEnabled,visibleQuestions as runtimeQuestions,generateResult as runtimeResult,validateAnswers as runtimeValidate,catalogForPilot,versionForSafeguard as currentVersion,prioritizeGuidedRows} from './guidedAssessment';
const guidedCatalog=catalogForPilot(false),versionForSafeguard=id=>currentVersion(id,false);
const visibleQuestions=(id,answers,version=versionForSafeguard(id))=>runtimeQuestions(id,answers,version);
const generateResult=(id,answers,today,version=versionForSafeguard(id))=>runtimeResult(id,answers,today,version);
const validateAnswers=(id,answers,version=versionForSafeguard(id))=>runtimeValidate(id,answers,version);
const today=new Date(2026,9,7);
test('Omni priorities are bounded, deterministic and preserve input records',()=>{
  const rows=[{definition_id:'1.4',status:'not_assessed'},{definition_id:'1.3',status:'not_assessed'},{definition_id:'1.2',status:'addressed',work:{overdue_reviews:1}},{definition_id:'1.1',status:'in_progress'},{definition_id:'2.1',status:'not_assessed'}];
  const before=JSON.stringify(rows);
  expect(prioritizeGuidedRows(rows,{'1.1':{revision:2,completed:false}}).map(r=>r.definition_id)).toEqual(['1.1','1.2','1.3']);
  expect(JSON.stringify(rows)).toBe(before);
  expect(prioritizeGuidedRows([{definition_id:'1.2',status:'not_assessed'},{definition_id:'1.1',status:'not_assessed'}]).map(r=>r.definition_id)).toEqual(['1.1','1.2']);
  expect(prioritizeGuidedRows([{definition_id:'1.1',status:'addressed',verification:'verified',work:{next_review_due:'2026-12-01'}},{definition_id:'1.2',status:'addressed',verification:'verified',work:{next_review_due:'2026-11-01'}}]).map(r=>r.definition_id)).toEqual(['1.2','1.1']);
});
const complete=id=>Object.fromEntries(guidedCatalog.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(k=>[k,'Yes'])):q.type==='text'?'':q.type==='date'?'2026-09-01':q.type==='multi'?['Quarantine or isolate']:q.id==='sources'?'One source':q.id==='frequency'?id==='1.1'?'Every six months':'Weekly':q.id==='unresolved'?'No':'Yes']));
test('strict client framework group and safeguard gate',()=>{
  expect(pilotEnabled('demo_brawndo','cis-ig1',{implementation_group:1},'1.1')).toBe(true);
  for(const [client,framework,group,id] of [['demo_brawndo','soc-2',1,'1.1'],['demo_brawndo','iso-27001',1,'1.1'],['demo_brawndo','cis-ig1',1,'1.3'],['new-client','cis-ig1',2,'1.5'],['new-client','cis-ig1',3,'99.1']])expect(pilotEnabled(client,framework,{implementation_group:group},id)).toBe(false);
  for(const group of [1,2,3])for(const id of ['1.1','1.2'])expect(pilotEnabled('new-client','cis-ig1',{implementation_group:group},id)).toBe(true);
  for(const group of [2,3])for(const id of ['1.3','1.4'])expect(pilotEnabled('new-client','cis-ig1',{implementation_group:group},id)).toBe(true);
  expect(pilotEnabled('new-client','cis-ig1',{implementation_group:3},'1.5')).toBe(true);
});
test.each(['1.1','1.2'])('%s foundational No branches without detailed questions',id=>{
  const key=id==='1.1'?'inventory':'process',answers={[key]:'No',existing:'Manual list'};
  expect(visibleQuestions(id,answers).map(q=>q.id)).toEqual([key,'existing','evidence','gaps','unknowns']);
  expect(generateResult(id,answers,today).status).toBe('needs_attention');
  expect(generateResult(id,{[key]:'Not sure'},today).status).toBe('not_assessed');
});
test.each(['1.1','1.2'])('%s complete reported requirements remain separate from verification',id=>{
  const answers={...complete(id),system:'Inventory system',owner:'IT Operations'};
  const output=generateResult(id,answers,today);
  expect(output.status).toBe('addressed');expect(output.narrative).not.toContain('Brawndo');expect(output.narrative).toContain('IT Operations');
  expect(output.verification).toBeUndefined();expect(output.version).toBe(versionForSafeguard(id));
  answers.owner='';expect(generateResult(id,answers,today).status).toBe('addressed');
});
test('1.1 missing coverage, old review, uncertain attributes cannot recommend Implemented',()=>{
  const a={...complete('1.1'),system:'RMM',owner:'IT'};
  a.coverage['Network devices']='Not sure';expect(generateResult('1.1',a,today).unknowns.length).toBe(1);
  a.coverage['Network devices']='No';expect(generateResult('1.1',a,today).gaps.length).toBe(1);
  a.coverage['Network devices']='Yes';a.last_review='2026-04-06';expect(generateResult('1.1',a,today).status).toBe('in_progress');
  a.last_review='2026-04-07';expect(generateResult('1.1',a,today).status).toBe('addressed');
});
test('1.2 frequency, response alternatives and unresolved assets are evaluated specifically',()=>{
  const a={...complete('1.2'),system:'Alerts',owner:'IT'};
  expect(generateResult('1.2',a,today).status).toBe('addressed');
  a.frequency='Every two weeks';expect(generateResult('1.2',a,today).status).toBe('in_progress');
  a.frequency='Weekly';a.unresolved='Yes';expect(generateResult('1.2',a,today).gaps).toEqual(expect.arrayContaining([expect.stringContaining('Unresolved unauthorized assets')]));
});
test('applicability requires explanation, unknowns never invent facts',()=>{
  const a={...complete('1.1'),system:'RMM',owner:'IT'};
  a.coverage['Cloud-hosted assets']='Not applicable';expect(visibleQuestions('1.1',a).map(q=>q.id)).toContain('scope_reason');
  expect(generateResult('1.1',a,today).status).toBe('in_progress');
  a.scope_reason='No cloud environments; confirmed against system scope';expect(generateResult('1.1',a,today).status).toBe('addressed');
  expect(generateResult('1.1',{inventory:'Not sure'},today).narrative).not.toContain('NinjaOne');
});
test('bounded known question schemas and per-question metadata',()=>{
  expect(()=>validateAnswers('1.1',{owner:'x'.repeat(2001)})).toThrow();
  expect(()=>validateAnswers('1.1',{foreign:'secret'})).toThrow();
  expect(()=>validateAnswers('1.1',{coverage:{'Foreign asset':'Yes'}})).toThrow();
  for(const [id,questions] of Object.entries(guidedCatalog.safeguards))for(const q of questions){expect(q.safeguard_id).toBe(id);expect(q.question_set_version).toBe(versionForSafeguard(id,true));expect(q.status_impact).toBeTruthy();expect(q.evidence_guidance).toBeTruthy();}
});
test('historical callers can explicitly retain original versions; new CIS interviews default to current source',()=>{
  expect(versionForSafeguard('1.1')).toBe('cis-v8.1-control1-2');
  expect(currentVersion('1.1')).toBe('cis-v8.1-control1-3');
  expect(generateResult('1.1',{inventory:'Not sure'},today).version).toBe('cis-v8.1-control1-2');
  expect(versionForSafeguard('2.1')).toBe('cis-v8.1-program-1');
  expect(currentVersion('2.1')).toBe('cis-v8.1-program-3');
});
test('confirmed matrix gaps remain distinct from unknown coverage and response alternatives are readable',()=>{
  const a={...complete('1.1'),system:'RMM',owner:'IT'};
  a.coverage['Network devices']='No';a.coverage['Cloud-hosted assets']='Not sure';
  const output=generateResult('1.1',a,today);
  expect(output.gaps.join(' ')).toContain('Network devices: No');
  expect(output.gaps.join(' ')).not.toContain('Cloud-hosted assets');
  expect(output.unknowns.join(' ')).toContain('Cloud-hosted assets: Not sure');
  expect(output.unknowns.join(' ')).not.toContain('Network devices');
  expect(generateResult('1.2',{...complete('1.2'),system:'EDR',owner:'IT'},today).answers.find(a=>a.prompt.includes('permitted response')).answer).toBe('Quarantine or isolate');
});
