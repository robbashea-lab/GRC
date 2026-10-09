import {inventorySummary,inventorySummaryEnabled} from './omniInventorySummary';
import {versionForSafeguard,visibleQuestions} from './guidedAssessment';
import {focusedResult} from './focusedOmni';
const version=versionForSafeguard('1.1',true),user={workspace_mode:'demo'};
const record={client_id:'demo_brawndo',framework_key:'cis-ig1',definition_id:'1.1'};
test('exact identity, framework, group and safeguard gate',()=>{
  expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},record)).toBe(true);
  for(const other of [{...record,definition_id:'1.2'},{...record,definition_id:'2.1'},{...record,client_id:'other'},{...record,framework_key:'iso-27001'}])expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},other)).toBe(false);
  expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:2},record)).toBe(false);
});
test.each(['No','Not sure','Partially'])('summary keeps %s evaluator status and distinguishes uncertainty',inventory=>{
  const answers={inventory},summary=inventorySummary(answers,version);
  expect(summary.result.status).toBe(focusedResult('1.1',answers,version).status);
  if(inventory==='Not sure'){expect(summary.deficiencies).toEqual([]);expect(summary.confirmations.length).toBeGreaterThan(0);expect(summary.breakdown[0].state).toBe('Needs confirmation');}
  if(inventory==='No'){expect(summary.deficiencies.length).toBeGreaterThan(0);expect(summary.breakdown[0].state).toBe('Incomplete or missing');}
});
test('inactive retained facts do not leak into narrative or recommendation',()=>{
  const answers={inventory:'No',system:'InactiveTool',owner:'InactiveOwner',sources:'Multiple unreconciled sources',sources_detail:'InactiveSource',coverage:{Servers:'Yes'}};
  const summary=inventorySummary(answers,version);
  expect(summary.result.narrative).not.toMatch(/Inactive/);expect(summary.result.answers.some(item=>item.answer.includes('Inactive'))).toBe(false);expect(answers.system).toBe('InactiveTool');
});
test('coverage and detail prose describes actual answers without fabricated owners or tools',()=>{
  const questions=visibleQuestions('1.1',{inventory:'Yes'},version),coverage=questions.find(q=>q.id==='coverage');
  const answers={inventory:'Yes',system:'SyntheticTool',coverage:Object.fromEntries(coverage.rows.map((row,index)=>[row,index===0?'Partially':'Not sure']))};
  const summary=inventorySummary(answers,version);
  expect(summary.result.narrative).toContain('SyntheticTool');expect(summary.result.narrative).toContain(coverage.rows[0]);expect(summary.result.narrative).not.toContain('Responsibility is held');
  expect(summary.result.narrative).toContain('are missing or incomplete');
  expect(summary.breakdown.find(row=>row.area===coverage.rows[0]).state).toBe('Incomplete or missing');expect(summary.breakdown.find(row=>row.area===coverage.rows[1]).state).toBe('Needs confirmation');
});

const complete=()=>Object.fromEntries(visibleQuestions('1.1',{inventory:'Yes'},version).map(q=>[q.id,q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='date'?'2026-10-09':q.type==='text'?'':q.id==='frequency'?'Every six months':q.id==='sources'?'One source':'Yes']));
test.each([{},complete(),{...complete(),coverage:{...complete().coverage,Servers:'No','Cloud-hosted assets':'Not sure'}}])('complete plain-text write-up preserves evaluator and separates actions',answers=>{
  const {result}=inventorySummary(answers,version);
  expect(result.status).toBe(focusedResult('1.1',answers,version).status);
  expect(result.narrative).toMatch(/^OVERVIEW\n\n/);
  expect(result.narrative).toContain('\n\nIMPLEMENTATION BREAKDOWN\n\n');expect(result.narrative).toContain('\n\nITEMS TO ADDRESS\n\n');
  expect(result.narrative).not.toMatch(/Does an enterprise|Proposed Implementation Status|•|Not recorded/);
  expect(result.narrative).toContain('\n- ');
  if(answers.coverage?.Servers==='No'){expect(result.narrative).toContain('Add or complete inventory coverage for Servers.');expect(result.narrative).toContain('Confirm coverage for Cloud-hosted assets.');expect(result.narrative).not.toContain('Add or complete inventory coverage for Cloud-hosted assets');}
});
test('resolved uncertainty disappears and reported material context remains',()=>{
  const answers={...complete(),system:'SyntheticInventory',owner:'Synthetic owner',sources:'Multiple reconciled sources',sources_detail:'Synthetic endpoint and cloud sources',maintenance_detail:'Synthetic change-ticket process',maintenance_detail_detail:'Synthetic backup responsibility',evidence:'Synthetic export',gaps:'Synthetic confirmed deficiency',unknowns:'Synthetic outstanding confirmation'};
  const text=inventorySummary(answers,version).result.narrative;
  for(const key of ['system','owner','sources_detail','maintenance_detail','maintenance_detail_detail','evidence','gaps','unknowns'])expect(text).toContain(answers[key]);
  const changed={...answers,gaps:'',unknowns:''};const resolved=inventorySummary(changed,version).result;
  expect(resolved.narrative).not.toContain('Needs confirmation');expect(resolved.narrative).not.toContain('Synthetic outstanding confirmation');expect(resolved.status).toBe(focusedResult('1.1',changed,version).status);
});
