import {focusedOmniEnabled,focusedRecommendations,nextFocusedQuestion,correctFocusedAnswer,focusedNarrative,focusedResult} from './focusedOmni';
import {versionForSafeguard,visibleQuestions,generateResult,catalogForVersion} from './guidedAssessment';
const version=versionForSafeguard('1.1',true);

test('stable identity, framework, IG1, enablement and exact safeguard boundaries',()=>{
  const user={workspace_mode:'demo'};
  expect(focusedOmniEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},'1.1')).toBe(true);
  for(const [client,framework,group,id] of [['demo_initech','cis-ig1',1,'1.1'],['demo_brawndo','soc-2',1,'1.1'],['demo_brawndo','cis-ig1',2,'1.1'],['demo_brawndo','cis-ig1',3,'1.1'],['demo_brawndo','cis-ig1',1,'1.3'],['demo_brawndo','cis-ig1',1,'2.1']])expect(focusedOmniEnabled(client,user,framework,{implementation_group:group},id)).toBe(false);
  expect(focusedOmniEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1,focused_omni_enabled:false})).toBe(false);
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
  expect(corrected).toEqual({inventory:'No',evidence:'Inventory export'});
  expect(answers.coverage.Servers).toBe('Yes');
  expect(focusedNarrative('1.1',corrected,version)).not.toContain('NinjaOne');
  expect(generateResult('1.1',corrected,new Date(),version).status).toBe('needs_attention');
});

test('recommendations contain only justified 1.1/1.2 work, with recorded foundation rationale',()=>{
  const rows=[{definition_id:'1.2',framework_assessment_id:'handling',status:'not_assessed'},{definition_id:'1.1',framework_assessment_id:'inventory',status:'needs_attention'},{definition_id:'3.5',status:'needs_attention'}];
  const items=focusedRecommendations(rows,{},false);
  expect(items.map(r=>r.definition_id)).toEqual(['1.1','1.2']);expect(items[0].reason).toContain('supports unauthorized-asset comparison');
  expect(focusedRecommendations(rows,{'1.2':{revision:2,completed:false}},false)[0].definition_id).toBe('1.2');
  expect(focusedRecommendations([{definition_id:'1.1',status:'addressed',verification:'verified',work:{context_complete:true,open_findings:0,open_actions:0}}],{},true)).toEqual([]);
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
