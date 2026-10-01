import {findingOpen,findingOverdue,findingCounts,workItems} from './findingMetrics';
const today=new Date('2026-10-01T15:00:00Z');
const f=(id,status,due)=>({finding_id:id,client_id:'c',status,due_date:due});
test('Pending Validation is open; overdue follows the target date; closed and accepted are excluded',()=>{
  expect(findingOpen(f('a','remediated'))).toBe(true);
  expect(findingOverdue(f('a','remediated','2026-10-08'),today)).toBe(false);
  expect(findingOverdue(f('a','remediated','2026-09-30'),today)).toBe(true);
  expect(findingOverdue(f('a','in_remediation','2026-10-01'),today)).toBe(false);
  for(const s of ['closed','accepted']){expect(findingOpen(f('a',s))).toBe(false);expect(findingOverdue(f('a',s,'2020-01-01'),today)).toBe(false);}
  expect(findingCounts([f('a','open','2026-09-01'),f('b','remediated','2026-09-01'),f('c','remediated','2027-01-01'),f('d','closed','2026-09-01')],today))
    .toEqual({open:3,pendingValidation:2,overdue:2,closed:1});
});
test('work items count each remediation once',()=>{
  const findings=[f('a','in_remediation'),f('b','remediated'),f('c','open'),f('d','closed')];
  const tasks=[{task_id:'t1',client_id:'c',finding_id:'a',status:'open'},{task_id:'t2',client_id:'c',finding_id:'b',status:'done'},{task_id:'t3',client_id:'c',status:'in_progress'}];
  expect(workItems(findings,tasks).map(w=>w.record.task_id||w.record.finding_id)).toEqual(['t1','t3','b','c']);
});
