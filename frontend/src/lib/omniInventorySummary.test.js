import {inventorySummary,inventorySummaryEnabled} from './omniInventorySummary';
import {versionForSafeguard,visibleQuestions} from './guidedAssessment';
import {focusedResult} from './focusedOmni';
import {formatInlineSummary} from './inlineAssessment';
import {omniCisSummary} from './omniCisSummary';
const version=versionForSafeguard('1.1',true),user={workspace_mode:'demo'};
const record={client_id:'demo_brawndo',framework_key:'cis-ig1',definition_id:'1.1'};
test('inline unknown inventory describes its genuine confirmation work without an empty controls section or hidden context',()=>{
  const answers={inventory:'Not sure',additional_gap:'No',additional_confirmation:'No',gaps:'HIDDEN GAP',unknowns:'HIDDEN CONFIRMATION'};
  const {result}=inventorySummary(answers,version,'Synthetic QA','2026-10-13');
  expect(result.status).toBe('not_assessed');expect(result.narrative).toContain('Confirm the current enterprise asset inventory position.');
  expect(result.narrative).not.toMatch(/Controls in place|HIDDEN|An enterprise asset inventory is maintained/);
  expect(result.narrative).toContain('independent verification remains separate');
  const absent=inventorySummary({...answers,inventory:'No'},version,'Synthetic QA','2026-10-13').result;
  expect(absent.status).toBe('needs_attention');expect(absent.narrative).toContain('Establish or complete the enterprise asset inventory.');
  expect(absent.narrative).not.toContain('Controls in place');
});
test('inline controls include only reported practices and keep the existing heading and deduplication when supported',()=>{
  const input={paragraph:'Reported position.',date:'2026-10-13'};
  expect(formatInlineSummary({...input,controls:['','  ']})).not.toContain('Controls in place');
  expect(formatInlineSummary({...input,controls:['Reported practice.',' Reported practice. ']})).toContain('\n\nControls in place\n• Reported practice.');
});
test('current program professional output excludes intent selectors and states operating context once while preserving source controls',()=>{
  const id='18.5',version='cis-v8.1-program-5',operation='Synthetic annual exercise workflow',answers={practice:'Yes',operation,additional_gap:'No',additional_confirmation:'No'};
  for(const q of visibleQuestions(id,answers,version))if(q.type==='matrix')answers[q.id]=Object.fromEntries(q.rows.map(row=>[row,'Yes']));
  const output=omniCisSummary(id,answers,version,'Synthetic QA','2026-10-13').result;
  expect(output.status).toBe('addressed');expect(output.narrative.split(operation)).toHaveLength(2);
  expect(output.narrative).not.toMatch(/additional gap|additional confirmation|Day-to-day operation/);
  for(const q of visibleQuestions(id,answers,version).filter(q=>q.type==='matrix'))for(const row of q.rows)expect(output.narrative).toContain(row);
  expect(output.narrative).toContain('\n\nControls in place\n• ');
});
test('matching identity, configured CIS group and applicable safeguard gate',()=>{
  expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},record)).toBe(true);
  for(const other of [{...record,client_id:'other'},{...record,framework_key:'iso-27001'}])expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},other)).toBe(false);
  for(const group of [1,2,3])expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:group},record)).toBe(true);
  expect(inventorySummaryEnabled('demo_brawndo',user,'cis-ig1',{implementation_group:1},{...record,definition_id:'1.2'})).toBe(true);
});

test('unknown inventory details do not establish partial implementation and stale hidden exclusions are ignored',()=>{
  const unknown={inventory:'Yes'};
  for(const q of visibleQuestions('1.1',unknown,version).filter(q=>q.critical&&q.id!=='inventory'))unknown[q.id]=q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Not sure'])):q.type==='date'?'':'Not sure';
  expect(inventorySummary(unknown,version,'Synthetic QA','2026-10-13').result.status).toBe('not_assessed');
  const hidden={inventory:'No',coverage:{'Cloud-hosted assets':'Not applicable'},scope_reason:'STORED OLD SCOPE'};
  expect(visibleQuestions('1.1',hidden,version).some(q=>q.id==='scope_reason')).toBe(false);
  expect(inventorySummary(hidden,version,'Synthetic QA','2026-10-13').result.narrative).not.toContain('STORED OLD SCOPE');
  expect(hidden.scope_reason).toBe('STORED OLD SCOPE');
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

test.each([
  ['No','is not currently performed'],
  ['Partially','is only partly performed'],
  ['Not sure','has not been confirmed']
])('optional comparison %s remains context without a mandatory assessment gap', (reconciled,reportedFact)=>{
  const answers={...complete(),last_review:new Date().toISOString().slice(0,10),reconciled};
  const original=JSON.parse(JSON.stringify(answers));
  const summary=inventorySummary(answers,version,'Synthetic QA Client');
  expect(summary.result.status).toBe('addressed');
  expect(summary.deficiencies).toEqual([]);expect(summary.confirmations).toEqual([]);
  expect(summary.result.narrative).toContain('Reported operating context');
  expect(summary.result.narrative).toContain('Optional comparison with other device records');
  expect(summary.result.narrative).toContain(reportedFact);
  expect(summary.result.narrative).not.toMatch(/Remediation|Confirmation work|Address the reported gaps in comparison|Confirm the comparison process/);
  expect(summary.result.narrative).toContain('No confirmed deficiencies were identified');
  expect(summary.result.narrative).toContain('No outstanding next steps were identified');
  expect(answers).toEqual(original);
});
