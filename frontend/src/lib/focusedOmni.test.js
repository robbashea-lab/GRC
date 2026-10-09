import {focusedOmniEnabled,focusedRecommendations,nextFocusedQuestion,correctFocusedAnswer,focusedNarrative,focusedResult} from './focusedOmni';
import {versionForSafeguard as runtimeVersion,visibleQuestions,generateResult,catalogForVersion} from './guidedAssessment';
const versionForSafeguard=id=>id==='1.2'?runtimeVersion(id,false):runtimeVersion(id,true);
const version=versionForSafeguard('1.1',true);

test('configured CIS group and canonical safeguard boundaries apply to every client',()=>{
  const user={workspace_mode:'demo'};
  expect(focusedOmniEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},'1.1')).toBe(true);
  for(const [client,framework,group,id] of [['demo_brawndo','soc-2',1,'1.1'],['future-client','cis-ig1',1,'1.3'],['future-client','cis-ig1',2,'1.5']])expect(focusedOmniEnabled(client,user,framework,{implementation_group:group},id)).toBe(false);
  for(const client of ['demo_initech','future-client'])for(const group of [1,2,3])expect(focusedOmniEnabled(client,user,'cis-ig1',{implementation_group:group},'1.1')).toBe(true);
  expect(focusedOmniEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1,guided_assessment_enabled:false})).toBe(false);
});

test('resume distinguishes absent inventory from known partial coverage without inferring tools',()=>{
  expect(visibleQuestions('1.1',{},version)[nextFocusedQuestion('1.1',{},version)].id).toBe('inventory');
  expect(visibleQuestions('1.1',{inventory:'No'},version)[nextFocusedQuestion('1.1',{inventory:'No'},version)].id).toBe('inventory');
  const answers={inventory:'Yes',system:'NinjaOne',coverage:{'End-user devices':'Yes'}};
  expect(visibleQuestions('1.1',answers,version)[nextFocusedQuestion('1.1',answers,version)].id).toBe('coverage');
  const partial={...answers,inventory:'Partially'};
  expect(visibleQuestions('1.1',partial,version)[nextFocusedQuestion('1.1',partial,version)].id).toBe('coverage');
  expect(generateResult('1.1',answers,new Date(),version).status).not.toBe('addressed');
});

test('changed prerequisite invalidates dependent current conclusions; unrelated reported context survives',()=>{
  const answers={inventory:'Yes',coverage:{Servers:'Yes'},system:'NinjaOne',evidence:'Inventory export'};
  const root=visibleQuestions('1.1',answers,version)[0];
  const corrected=correctFocusedAnswer('1.1',answers,root,'No',version);
  expect(corrected).toEqual({...answers,inventory:'No'});
  expect(answers.coverage.Servers).toBe('Yes');
  expect(focusedNarrative('1.1',corrected,version)).not.toContain('NinjaOne');
  expect(generateResult('1.1',corrected,new Date(),version).status).toBe('needs_attention');
});

test('recommendations contain only justified 1.1/1.2 work, with recorded foundation rationale',()=>{
  const rows=[{definition_id:'1.2',framework_assessment_id:'handling',status:'not_assessed'},{definition_id:'1.1',framework_assessment_id:'inventory',status:'needs_attention'},{definition_id:'3.5',status:'needs_attention'}].map(row=>({...row,framework_key:'cis-ig1'}));
  const items=focusedRecommendations(rows,{},false);
  expect(items.map(r=>r.definition_id)).toEqual(['1.1','1.2']);expect(items[0].reason).toContain('supports unauthorized-asset comparison');
  expect(focusedRecommendations(rows,{'1.2':{revision:2,completed:false}},false)[0].definition_id).toBe('1.2');
  expect(focusedRecommendations([{framework_key:'cis-ig1',definition_id:'1.1',status:'addressed',verification:'verified',work:{context_complete:true,open_findings:0,open_actions:0}}],{},true)).toEqual([]);
});

const complete=id=>{
  const current=new Date(),day=[current.getFullYear(),String(current.getMonth()+1).padStart(2,'0'),String(current.getDate()).padStart(2,'0')].join('-');
  return Object.fromEntries(catalogForVersion(versionForSafeguard(id,true)).safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':q.type==='date'?day:q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?(id==='1.1'?'Every six months':'Weekly'):q.id==='sources'?'One source':q.id==='unresolved'?'No':'Yes']));
};

test('all material criteria must be addressed, not merely answered, and verification is separate',()=>{
  const answers=complete('1.1');expect(focusedResult('1.1',answers,version).status).toBe('addressed');
  for(const value of ['No','Partially','Not sure']){
    const changed={...answers,coverage:{...answers.coverage,Servers:value}};
    expect(focusedResult('1.1',changed,version).status).not.toBe('addressed');
    expect(focusedResult('1.1',changed,version).verification).toBeUndefined();
  }
});

test('1.2 weekly handling, response, and comparison contradictions are assessed independently of 1.1',()=>{
  const answers=complete('1.2'),v=versionForSafeguard('1.2',true);
  expect(focusedResult('1.2',answers,v).status).toBe('addressed');
  expect(focusedResult('1.2',{...answers,frequency:'Monthly'},v).status).not.toBe('addressed');
  const conflict={...answers,inventory_dependency:'No'};
  expect(focusedResult('1.2',conflict,v).status).not.toBe('addressed');
  expect(visibleQuestions('1.2',conflict,v)[nextFocusedQuestion('1.2',conflict,v)].id).toBe('inventory_dependency');
  expect(focusedNarrative('1.2',conflict,v)).toContain('comparison basis remains unresolved');
});

test.each(['1.1','1.2'])('%s narrative names material gaps and removes them when resolved',id=>{
  const answers=complete(id),v=versionForSafeguard(id,true);
  const deficient=id==='1.1'?{...answers,coverage:{...answers.coverage,Servers:'No'}}:{...answers,frequency:'Monthly',unresolved:'Yes'};
  const result=focusedResult(id,deficient,v);
  expect(result.status).toBe('in_progress');expect(result.gaps.length).toBeGreaterThan(0);
  for(const gap of result.gaps)expect(result.narrative).toContain(gap);
  const resolved=focusedResult(id,answers,v);
  expect(resolved.status).toBe('addressed');expect(resolved.gaps).toEqual([]);
  for(const gap of result.gaps)expect(resolved.narrative).not.toContain(gap);
});

test.each(['1.1','1.2'])('%s narrative names unknown requirements without claiming evidence verification',id=>{
  const answers=complete(id),v=versionForSafeguard(id,true);
  const uncertain=id==='1.1'?{...answers,attributes:{...answers.attributes,'Hardware address':'Not sure'}}:{...answers,detection:'Not sure'};
  const result=focusedResult(id,uncertain,v);
  expect(result.status).toBe('in_progress');expect(result.unknowns.length).toBeGreaterThan(0);
  for(const unknown of result.unknowns)expect(result.narrative).toContain(unknown);
  expect(result.verification).toBeUndefined();
});

test.each(['1.1','1.2'])('%s targeted tool correction replaces obsolete facts and retains unrelated reported details',id=>{
  const v=versionForSafeguard(id,true),answers={...complete(id),system:'Legacy inventory product',owner:'Client IT and provider security team'};
  const question=visibleQuestions(id,answers,v).find(q=>q.id==='system');
  const updated=correctFocusedAnswer(id,answers,question,'NinjaOne',v),result=focusedResult(id,updated,v);
  expect(result.narrative).toContain('Maintained using: NinjaOne.');
  expect(result.narrative).not.toContain('Legacy inventory product');
  expect(result.narrative).toContain('Client IT and provider security team');
  expect(result.status).toBe('addressed');expect(result.verification).toBeUndefined();
  expect(answers.system).toBe('Legacy inventory product');
});

test('1.2 narrative records comparison and operation as reported facts without new implementation criteria',()=>{
  const v=versionForSafeguard('1.2',true),answers={...complete('1.2'),disposition:'Partially',confirmation:'Not sure',exceptions:'No exceptions used',reconciled:'No'};
  const result=focusedResult('1.2',answers,v);
  for(const fact of ['authorized inventory available for comparison: Yes','identification of unauthorized assets: Yes','tracking of disposition decisions: Partly','confirmation that assets are no longer reachable or otherwise addressed: Not sure','exception approval and tracking: No exceptions used','reconciliation against authorized inventory: No','assets unresolved beyond the required response interval: No'])expect(result.narrative).toContain('Reported '+fact+'.');
  expect(result.status).toBe(generateResult('1.2',answers,new Date(),v).status);
  expect(result.status).toBe('addressed');expect(result.verification).toBeUndefined();
});

test('a lost 1.2 prerequisite does not carry hidden affirmative process details into the narrative',()=>{
  const v=versionForSafeguard('1.2',true),answers={...complete('1.2'),process:'No',system:'Obsolete detector'};
  const result=focusedResult('1.2',answers,v);
  expect(result.status).toBe('needs_attention');
  expect(result.narrative).not.toContain('Obsolete detector');
  expect(result.narrative).not.toContain('Reported identification of unauthorized assets: Yes');
  expect(result.narrative).not.toContain('Reported authorized inventory available for comparison: Yes');
});
