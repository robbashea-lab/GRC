import {pilotEnabled,visibleQuestions as runtimeQuestions,generateResult as runtimeResult,validateAnswers as runtimeValidate,catalogForPilot,versionForSafeguard as currentVersion,prioritizeGuidedRows,updateGuidedMultiAnswer,updateGuidedAnswer,catalogForVersion} from './guidedAssessment';
import control1V4 from '@catalogs/guidedControl1V4.json';
import control1V5 from '@catalogs/guidedControl1V5.json';
const guidedCatalog=catalogForPilot(false),versionForSafeguard=id=>currentVersion(id,false);
const visibleQuestions=(id,answers,version=versionForSafeguard(id))=>runtimeQuestions(id,answers,version);
const generateResult=(id,answers,today,version=versionForSafeguard(id))=>runtimeResult(id,answers,today,version);
const validateAnswers=(id,answers,version=versionForSafeguard(id))=>runtimeValidate(id,answers,version);
const today=new Date(2026,9,7);
test('Omni priorities are bounded, deterministic and preserve input records',()=>{
  const rows=[{definition_id:'1.4',status:'not_assessed'},{definition_id:'1.3',status:'not_assessed'},{definition_id:'1.2',status:'addressed',work:{overdue_reviews:1}},{definition_id:'1.1',status:'in_progress'},{definition_id:'2.1',status:'not_assessed'}];
  const before=JSON.stringify(rows);
  expect(prioritizeGuidedRows(rows,{'1.1':{revision:2,completed:false}}).map(r=>r.definition_id)).toEqual(['1.4','2.1','1.3','1.1','1.2']);
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
  expect(currentVersion('1.1')).toBe('cis-v8.1-control1-5');
  expect(generateResult('1.1',{inventory:'Not sure'},today).version).toBe('cis-v8.1-control1-2');
  expect(versionForSafeguard('2.1')).toBe('cis-v8.1-program-1');
  expect(currentVersion('2.1')).toBe('cis-v8.1-program-5');
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

test.each([control1V4.version,control1V5.version])('%s UI response selections honor exclusivity while external invalid arrays remain rejected',version=>{
  const original=Object.freeze(['Remove from network']);
  let selected=updateGuidedMultiAnswer(original,'Deny remote connection',true,version);
  expect(selected).toEqual(['Remove from network','Deny remote connection']);
  expect(original).toEqual(['Remove from network']);
  selected=updateGuidedMultiAnswer(selected,'None',true,version);expect(selected).toEqual(['None']);
  expect(()=>runtimeValidate('1.2',{actions:selected},version)).not.toThrow();
  selected=updateGuidedMultiAnswer(selected,'Not sure',true,version);expect(selected).toEqual(['Not sure']);
  expect(()=>runtimeValidate('1.2',{actions:selected},version)).not.toThrow();
  selected=updateGuidedMultiAnswer(selected,'Quarantine or isolate',true,version);expect(selected).toEqual(['Quarantine or isolate']);
  selected=updateGuidedMultiAnswer(selected,'Quarantine or isolate',false,version);expect(selected).toEqual([]);
  expect(()=>runtimeValidate('1.2',{actions:selected},version)).not.toThrow();
  for(const actions of [['None','Remove from network'],['Not sure','None'],['Remove from network','Remove from network'],['Unrecognized response'],'None']){
    expect(()=>runtimeValidate('1.2',{actions},version)).toThrow('Invalid answer selection');
  }
});

test('legacy multi-select UI and validator retain historical combinations',()=>{
  const version=versionForSafeguard('1.2');
  let selected=updateGuidedMultiAnswer(['Remove from network'],'None',true,version);
  selected=updateGuidedMultiAnswer(selected,'Not sure',true,version);
  expect(selected).toEqual(['Remove from network','None','Not sure']);
  expect(()=>runtimeValidate('1.2',{actions:selected},version)).not.toThrow();
  expect(updateGuidedMultiAnswer(selected,'None',false,version)).toEqual(['Remove from network','Not sure']);
  expect(()=>runtimeValidate('1.2',{actions:['None','None']},version)).toThrow('Invalid answer selection');
});

test.each([control1V4.version,control1V5.version])('%s checkbox repeats and removals retain concrete choices without mutating input',version=>{
  const original=Object.freeze(['Remove from network','Deny remote connection']);
  const repeated=updateGuidedMultiAnswer(original,'Remove from network',true,version);
  expect(repeated).toEqual(['Remove from network','Deny remote connection']);
  expect(updateGuidedMultiAnswer(original,'Remove from network',false,version)).toEqual(['Deny remote connection']);
  expect(updateGuidedMultiAnswer(original,'Quarantine or isolate',false,version)).toEqual(original);
  expect(updateGuidedMultiAnswer(Object.freeze(['None']),'None',true,version)).toEqual(['None']);
  expect(updateGuidedMultiAnswer(Object.freeze(['Not sure']),'Not sure',false,version)).toEqual([]);
  expect(original).toEqual(['Remove from network','Deny remote connection']);
});

test.each([control1V4.version,control1V5.version])('%s explicitly clearing a select omits only that answer and preserves its context',version=>{
  const question=catalogForVersion(version).safeguards['1.2'].find(item=>item.id==='frequency');
  const actions=Object.freeze(['Quarantine or isolate']);
  const original=Object.freeze({process:'Yes',frequency:'Weekly',frequency_detail:'Preserved response context',actions});
  const cleared=updateGuidedAnswer(original,question,'');
  expect(Object.prototype.hasOwnProperty.call(cleared,'frequency')).toBe(false);
  expect(cleared).toEqual({process:'Yes',frequency_detail:'Preserved response context',actions});
  expect(original.frequency).toBe('Weekly');expect(cleared).not.toBe(original);
  expect(()=>runtimeValidate('1.2',cleared,version)).not.toThrow();
  expect(()=>runtimeValidate('1.2',{...original,frequency:''},version)).toThrow('Invalid answer selection');
  const answered=updateGuidedAnswer(cleared,question,'Monthly');
  expect(answered.frequency).toBe('Monthly');expect(answered.frequency_detail).toBe(original.frequency_detail);
  expect(Object.prototype.hasOwnProperty.call(cleared,'frequency')).toBe(false);
});

test.each([versionForSafeguard('1.1'),control1V5.version])('%s matrix clears omit only empty rows and preserve a valid partial checkpoint',version=>{
  const question=catalogForVersion(version).safeguards['1.1'].find(item=>item.id==='coverage');
  const [clearedRow,missingRow,unknownRow]=question.rows;
  const recorded=Object.freeze({[clearedRow]:'Yes',[missingRow]:'No',[unknownRow]:'Not sure'});
  const original=Object.freeze({inventory:'Yes',coverage:recorded,coverage_detail:'Preserved evidence context',owner:'Original owner'});
  const edit=Object.freeze({...recorded,[clearedRow]:''});
  const cleared=updateGuidedAnswer(original,question,edit);
  expect(Object.prototype.hasOwnProperty.call(cleared.coverage,clearedRow)).toBe(false);
  expect(cleared.coverage).toEqual({[missingRow]:'No',[unknownRow]:'Not sure'});
  expect(cleared.coverage).not.toBe(edit);expect(cleared.coverage).not.toBe(recorded);
  expect(cleared.coverage_detail).toBe(original.coverage_detail);expect(cleared.owner).toBe(original.owner);
  expect(recorded[clearedRow]).toBe('Yes');expect(edit[clearedRow]).toBe('');
  expect(()=>runtimeValidate('1.1',cleared,version)).not.toThrow();
  expect(()=>runtimeValidate('1.1',{...original,coverage:edit},version)).toThrow('Invalid matrix answer');
  const empty=updateGuidedAnswer(cleared,question,Object.fromEntries(Object.keys(cleared.coverage).map(row=>[row,''])));
  expect(Object.prototype.hasOwnProperty.call(empty,'coverage')).toBe(true);expect(empty.coverage).toEqual({});
  expect(()=>runtimeValidate('1.1',empty,version)).not.toThrow();
  const answered=updateGuidedAnswer(cleared,question,{...cleared.coverage,[clearedRow]:'Partially'});
  expect(answered.coverage).toEqual({[missingRow]:'No',[unknownRow]:'Not sure',[clearedRow]:'Partially'});
  expect(Object.prototype.hasOwnProperty.call(cleared.coverage,clearedRow)).toBe(false);
});

test('UI clears preserve blank text/date values and other answer types without broad falsy normalization',()=>{
  for(const type of ['text','date','multi']){
    const question={id:'recorded',type},value=type==='multi'?[]:'';
    const original=Object.freeze({recorded:'Previous value',recorded_detail:'Preserved note',other:'Preserved answer'});
    const next=updateGuidedAnswer(original,question,value);
    expect(Object.prototype.hasOwnProperty.call(next,'recorded')).toBe(true);expect(next.recorded).toBe(value);
    expect(next.recorded_detail).toBe(original.recorded_detail);expect(next.other).toBe(original.other);
    expect(original.recorded).toBe('Previous value');
  }
  const question={id:'frequency',type:'select'};
  for(const value of [null,undefined,false,0,' ']){
    const next=updateGuidedAnswer({process:'Yes'},question,value);
    expect(Object.prototype.hasOwnProperty.call(next,'frequency')).toBe(true);expect(next.frequency).toBe(value);
    expect(()=>runtimeValidate('1.2',next,control1V5.version)).toThrow('Invalid answer selection');
  }
});

test('UI matrix edits do not coerce malformed values or discard nonempty unsupported rows',()=>{
  const question=catalogForVersion(control1V5.version).safeguards['1.1'].find(item=>item.id==='coverage');
  for(const value of [null,undefined,false,42,[],{Foreign:'Yes'}]){
    const next=updateGuidedAnswer({inventory:'Yes'},question,value);
    expect(next.coverage).toEqual(value);
    expect(()=>runtimeValidate('1.1',next,control1V5.version)).toThrow('Invalid matrix answer');
  }
  const rows=Object.freeze({Retained:'Not applicable',Cleared:''});
  expect(updateGuidedAnswer({},question,rows).coverage).toEqual({Retained:'Not applicable'});
  expect(rows).toEqual({Retained:'Not applicable',Cleared:''});
});
