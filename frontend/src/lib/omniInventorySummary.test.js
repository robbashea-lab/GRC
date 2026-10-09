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
  expect(summary.result.narrative).toContain('The inventory only partly includes');
  expect(summary.breakdown.find(row=>row.area===coverage.rows[0]).state).toBe('Incomplete or missing');expect(summary.breakdown.find(row=>row.area===coverage.rows[1]).state).toBe('Needs confirmation');
});
