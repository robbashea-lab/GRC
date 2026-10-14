import {formatInlineSummary} from './inlineAssessment';
import {omniCisSummary} from './omniCisSummary';
import {catalogForVersion,versionForSafeguard} from './guidedAssessment';
import cis from '@catalogs/cisIG1.json';
beforeEach(()=>jest.useFakeTimers({now:new Date(2026,9,13,12)}));
afterEach(()=>jest.useRealTimers());

test('reported paragraph and supported controls share the multiline native field',()=>{
  expect(formatInlineSummary({paragraph:'Client reports a working inventory.',controls:['Assets are recorded.','Assets are recorded.'],limitations:'Coverage remains partial.',date:'2026-10-13T12:00:00Z'})).toBe('Client reports a working inventory. Coverage remains partial. This assessment reflects practices reported on 2026-10-13; independent verification remains separate.\n\nControls in place\n• Assets are recorded.');
  expect(formatInlineSummary({paragraph:'No current practice is established.',date:'2026-10-13'})).toBe('No current practice is established. This assessment reflects practices reported on 2026-10-13; independent verification remains separate.');
});

test.each(cis.requirements.map(row=>row.id))('%s uses the unchanged evaluator with only supported controls in the inline narrative',id=>{
  const version=versionForSafeguard(id),questions=catalogForVersion(version).safeguards[id];
  const answers=Object.fromEntries(questions.map(q=>[q.id,q.optional?'No':q.type==='matrix'?Object.fromEntries(q.rows.map(row=>[row,'Yes'])):q.type==='text'?'':q.type==='date'?'2026-10-01':q.type==='multi'?['Quarantine or isolate']:q.id==='frequency'?(id==='1.1'?'Every six months':id==='1.3'?'Daily':'Weekly'):q.id==='sources'?'One source':q.id==='unresolved'?'No':q.choices.includes('Yes')?'Yes':q.choices[0]]));
  const before=omniCisSummary(id,answers,version,'Synthetic client'),after=omniCisSummary(id,answers,version,'Synthetic client','2026-10-13T12:00:00Z');
  expect({...after.result,narrative:''}).toEqual({...before.result,narrative:''});
  expect(after.result.narrative).toContain('\n\nControls in place\n• ');
  expect(after.result.narrative).not.toMatch(/OVERVIEW|IMPLEMENTATION BREAKDOWN|ITEMS TO ADDRESS/);
});

test('missing or unknown practices are excluded from Controls in place',()=>{
  const version=versionForSafeguard('1.1');
  for(const inventory of ['No','Not sure']){
    const result=omniCisSummary('1.1',{inventory},version,'Synthetic client','2026-10-13').result;
    expect(result.narrative).not.toContain('Controls in place');
    expect(result.narrative).not.toContain('enterprise asset inventory is maintained');
    expect(result.status).not.toBe('addressed');
  }
});
