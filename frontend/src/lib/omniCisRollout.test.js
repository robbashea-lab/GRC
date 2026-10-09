import cis from '@catalogs/cisIG1.json';
import {guidedCatalog,catalogForVersion,versionForSafeguard,visibleQuestions,generateResult,validateAnswers,compatibleInterviewAnswers} from './guidedAssessment';
import {focusedOmniEnabled,correctFocusedAnswer} from './focusedOmni';
import {inventorySummaryEnabled} from './omniInventorySummary';
import {omniGroups} from './refinedOmni';
import {omniCisSummary} from './omniCisSummary';

const user={user_id:'test-operator',role:'client_grc_manager'};
const complete=id=>Object.fromEntries(guidedCatalog.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':q.type==='date'?new Date().toISOString().slice(0,10):q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?(id==='1.1'?'Every six months':id==='1.3'?'Daily':'Weekly'):q.id==='sources'?'One source':q.id==='unresolved'?'No':q.choices.includes('Yes')?'Yes':q.choices[0]]));
const programIds=cis.requirements.filter(definition=>definition.control!==1).map(definition=>definition.id);
const matrixAnswers=(id,response)=>Object.fromEntries(guidedCatalog.safeguards[id].filter(q=>q.type==='matrix').map(q=>[q.id,Object.fromEntries(q.rows.map(row=>[row,response]))]));

test('339 applicable placements use the same configured eligibility and authoritative save adapter',()=>{
  let placements=0;
  for(const [group,count] of [[1,56],[2,130],[3,153]]){
    const client='new-cis-client-'+group,eligible=cis.requirements.filter(row=>row.implementation_group<=group);
    expect(eligible).toHaveLength(count);
    for(const row of cis.requirements){
      const record={client_id:client,framework_key:'cis-ig1',definition_id:row.id},expected=row.implementation_group<=group;
      expect(focusedOmniEnabled(client,user,'cis-ig1',{implementation_group:group},row.id)).toBe(expected);
      expect(inventorySummaryEnabled(client,user,'cis-ig1',{implementation_group:group},record)).toBe(expected);
      if(expected)placements++;
      expect(inventorySummaryEnabled('another-client',user,'cis-ig1',{implementation_group:group},record)).toBe(false);
      for(const framework of ['iso-27001','soc-2','hipaa'])expect(focusedOmniEnabled(client,user,framework,{implementation_group:group},row.id)).toBe(false);
    }
  }
  expect(placements).toBe(339);
  expect(focusedOmniEnabled('new',null,'cis-ig1',{implementation_group:3},'1.1')).toBe(false);
  expect(focusedOmniEnabled('new',user,'cis-ig1',{implementation_group:3,guided_assessment_enabled:false},'1.1')).toBe(false);
});

test.each(cis.requirements.map(row=>row.id))('%s has complete grouped questions and exact whole-write-up serialization without a fallback',id=>{
  const version=versionForSafeguard(id),answers=complete(id),groups=omniGroups(id,answers,version),questions=visibleQuestions(id,answers,version);
  const grouped=groups.flatMap(group=>group.questions.map(q=>q.id));
  expect(grouped.slice().sort()).toEqual(questions.map(q=>q.id).sort());expect(new Set(grouped).size).toBe(grouped.length);
  const text=omniCisSummary(id,answers,version,'Client '+id).result.narrative;
  expect(text).toMatch(/^OVERVIEW\n\n/);expect(text).toContain('\n\nIMPLEMENTATION BREAKDOWN\n\n');expect(text).toContain('\n\nITEMS TO ADDRESS\n\n');
  expect(text).toContain('Client '+id);expect(text).not.toMatch(/Brawndo|Not recorded|Proposed Implementation Status/);expect(text.length).toBeLessThanOrEqual(20000);
  const reviewed=text+'\n\nOperator edit\n- Line one\n- Line two\n';
  const body={implementation:reviewed,status:generateResult(id,answers,new Date(),version).status};
  expect(JSON.parse(JSON.stringify(body))).toEqual(body);expect(body.implementation.endsWith('\n')).toBe(true);
});

test.each(programIds)('%s uses substantive source answers instead of interview completion or aggregate percentages',id=>{
  const version=versionForSafeguard(id);
  for(const practice of ['Yes','Partially','Not sure'])expect(generateResult(id,{practice,...matrixAnswers(id,'Not sure')},new Date(),version).status).toBe('not_assessed');
  for(const practice of ['Yes','Partially','No','Not sure'])expect(generateResult(id,{practice,...matrixAnswers(id,'No')},new Date(),version).status).toBe('needs_attention');
  expect(generateResult(id,{practice:'Not sure',...matrixAnswers(id,'Yes')},new Date(),version).status).toBe('addressed');
  expect(generateResult(id,{practice:'No',...matrixAnswers(id,'Yes')},new Date(),version).status).toBe('in_progress');
  expect(generateResult(id,{practice:'Yes',...matrixAnswers(id,'Yes'),system:'',owner:'',evidence:''},new Date(),version).status).toBe('addressed');
  const first=guidedCatalog.safeguards[id].find(q=>q.type==='matrix'),mixed={practice:'Yes',...matrixAnswers(id,'Yes')};mixed[first.id][first.rows[0]]='Not sure';
  expect(generateResult(id,mixed,new Date(),version).status).toBe(first.rows.length===1&&guidedCatalog.definitions[id].elements.length===1?'not_assessed':'in_progress');
  mixed[first.id][first.rows[0]]='No';const output=generateResult(id,mixed,new Date(),version);
  expect(output.status).toBe(guidedCatalog.definitions[id].elements.length===1?'needs_attention':'in_progress');expect(output.gaps.join(' ')).toContain(first.rows[0]);
  const unknown={practice:'Not sure',...matrixAnswers(id,'Not sure')};unknown[first.id][first.rows[0]]='No';
  expect(generateResult(id,unknown,new Date(),version).status).toBe(guidedCatalog.definitions[id].elements.length===1?'needs_attention':'not_assessed');
  for(const q of guidedCatalog.safeguards[id].filter(q=>q.type==='matrix'&&!q.choices.includes('Not applicable')))expect(()=>validateAnswers(id,{[q.id]:{[q.rows[0]]:'Not applicable'}},version)).toThrow();
});

test('1.2 source alternatives and weekly cadence score independently of optional neighbor context',()=>{
  const version=versionForSafeguard('1.2'),base={process:'Yes',frequency:'Weekly'};
  for(const action of ['Remove from network','Deny remote connection','Quarantine or isolate'])expect(generateResult('1.2',{...base,actions:[action]},new Date(),version).status).toBe('addressed');
  for(const frequency of ['Every two weeks','Monthly','Ad hoc'])expect(generateResult('1.2',{...base,frequency,actions:['Quarantine or isolate']},new Date(),version).status).toBe('in_progress');
  for(const unresolved of ['Yes','No','Not sure'])expect(generateResult('1.2',{...base,actions:['Quarantine or isolate'],inventory_dependency:'No',detection:'Not sure',unresolved},new Date(),version).status).toBe('addressed');
  expect(()=>validateAnswers('1.2',{actions:['None','Quarantine or isolate']},version)).toThrow();
  expect(generateResult('1.2',{process:'No'},new Date(),version).status).toBe('needs_attention');
  expect(generateResult('1.2',{process:'Not sure',frequency:'Not sure',actions:['Not sure']},new Date(),version).status).toBe('not_assessed');
});

test('version upgrade copies only unchanged active semantics and leaves changed/new rows unanswered',()=>{
  const id='2.1',oldVersion='cis-v8.1-program-2',old=catalogForVersion(oldVersion),answers=Object.fromEntries(old.safeguards[id].map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'Synthetic supplied context':'Yes']));
  const mapped=compatibleInterviewAnswers(id,answers,oldVersion,versionForSafeguard(id));
  expect(mapped.practice).toBe('Yes');expect(mapped.requirements_0).toEqual(answers.requirements_0);expect(mapped.system).toBe(answers.system);
  const hidden=compatibleInterviewAnswers(id,{...answers,practice:'No'},oldVersion,versionForSafeguard(id));expect(hidden.requirements_0).toBeUndefined();expect(answers.requirements_0).toBeTruthy();
  const legacy={'process':'Yes','frequency':'Weekly','actions':['Quarantine or isolate'],'gaps':'Unknown or missing old steps'};
  const upgraded=compatibleInterviewAnswers('1.2',legacy,'brawndo-cis-pilot-1',versionForSafeguard('1.2'));
  expect(upgraded.process).toBe('Yes');expect(upgraded.frequency).toBe('Weekly');expect(upgraded.gaps).toBeUndefined();expect(upgraded.unknowns).toBeUndefined();expect(legacy.gaps).toContain('Unknown');
});

test('inactive historical answers remain stored while current results and generated text exclude them',()=>{
  const version=versionForSafeguard('1.1'),answers={inventory:'Yes',system:'HistoricalTool',coverage:{Servers:'Yes'}},question=visibleQuestions('1.1',answers,version)[0];
  const updated=correctFocusedAnswer('1.1',answers,question,'No',version);expect(updated.system).toBe('HistoricalTool');expect(updated.coverage).toEqual(answers.coverage);
  expect(omniCisSummary('1.1',updated,version,'Future client').result.narrative).not.toContain('HistoricalTool');
});

test('summary overview and breakdown follow substantive requirements when aggregate answers conflict',()=>{
  const id='2.1',version=versionForSafeguard(id);
  const absent=omniCisSummary(id,{practice:'Yes',...matrixAnswers(id,'No')},version,'Synthetic client').result;
  expect(absent.status).toBe('needs_attention');expect(absent.narrative.split('IMPLEMENTATION BREAKDOWN')[0]).toContain('not currently in place');
  expect(absent.narrative).not.toContain('Reported practice: Yes.');expect(absent.narrative).toContain('Reported as absent.');
  const unknown=omniCisSummary(id,{practice:'Yes',...matrixAnswers(id,'Not sure')},version,'Synthetic client').result;
  expect(unknown.status).toBe('not_assessed');expect(unknown.narrative.split('IMPLEMENTATION BREAKDOWN')[0]).toContain('needs confirmation');
  const supported=omniCisSummary(id,{practice:'Not sure',...matrixAnswers(id,'Yes')},version,'Synthetic client').result;
  expect(supported.status).toBe('addressed');expect(supported.narrative.split('IMPLEMENTATION BREAKDOWN')[0]).toContain('is in place');
});
