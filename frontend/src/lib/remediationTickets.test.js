import {ticketRecords,ticketStage} from './remediationTickets';
const f={client_id:'new-client',finding_id:'f',title:'Finding heading',description:'The actual issue',remediation_title:'Correct it',status:'in_remediation',owner_id:'coordinator'};
const t={client_id:f.client_id,task_id:'t',finding_id:'f',title:'Fix the issue',status:'open',assignee_id:'operator',due_date:'2030-01-01',description:'Plan',resolution:'Actual fix'};
test('one identity and assignment survive completion, validation and reopening without mutating records',()=>{
  for(const [fs,ts,stage] of [['in_remediation','open','open'],['remediated','done','pending_validation'],['closed','done','completed'],['accepted','done','accepted'],['open','done','open']]){
    const records={findings:[{...f,status:fs}],tasks:[{...t,status:ts}]},snapshot=JSON.stringify(records);
    const rows=ticketRecords(records,f.client_id);expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ticketId:'finding:f',title:t.title,issue:f.description,owner_id:'operator',due_date:t.due_date,resolution:'Actual fix'});
    expect(ticketStage(rows[0])).toBe(stage);expect(JSON.stringify(records)).toBe(snapshot);
  }
});
test('multiple Actions never select an arbitrary primary or conceal unfinished work',()=>{
  const tasks=[{...t,status:'done'},{...t,task_id:'other',assignee_id:'different',status:'blocked'}];
  let [row]=ticketRecords({findings:[{...f,status:'closed'}],tasks},f.client_id);
  expect(row.primary).toBeNull();expect(row.diagnostic).toMatch(/Multiple/);expect(row.actions).toEqual(tasks);expect(ticketStage(row)).toBe('blocked');
  [row]=ticketRecords({findings:[{...f,primary_task_id:'t'}],tasks:[...tasks].reverse()},f.client_id);
  expect(row.primary.task_id).toBe('t');expect(row.actions).toHaveLength(2);expect(ticketStage(row)).toBe('blocked');
});
test('unavailable, foreign, standalone and no-Action records are retained without invented Findings',()=>{
  const records={findings:[f,{...f,client_id:'foreign',finding_id:'foreign'}],tasks:[{...t,task_id:'orphan',finding_id:'foreign'},{...t,task_id:'manual',finding_id:null,status:'cancelled'}]};
  const rows=ticketRecords(records,f.client_id);expect(rows.map(r=>r.ticketId)).toEqual(['finding:f','task:orphan','task:manual']);
  expect(rows[0].diagnostic).toBe('No Action linked');expect(rows[1].finding).toBeUndefined();expect(rows[1].diagnostic).toBe('Linked Finding unavailable');expect(ticketStage(rows[2])).toBe('cancelled');
});
