import {identityRequest} from './identityLifecycle';
import {assignmentCandidates} from './assignmentEligibility';

test('demo owner eligibility preserves history and minimal projection independently of caller assignment rights',()=>{
  const account=(user_id,role,client_ids,status='active')=>({user_id,name:user_id,role,client_ids,status,email:user_id+'@example.test',password_hash:'private',private_field:'excluded'});
  const db={user:account('reader','client_readonly',['a']),clients:[{client_id:'a'},{client_id:'b'}],
    users:[account('eligible','client_contributor',['a']),account('global','super_admin',[]),
      account('removed','client_contributor',['b']),account('disabled','client_contributor',['a'],'disabled'),
      account('foreign','client_contributor',['b'])],
    tasks:['global','removed','disabled'].map(uid=>({task_id:uid,client_id:'a',assignee_id:uid,completed_by:uid,status:'done'}))};
  const before=JSON.stringify(db.tasks);
  expect(assignmentCandidates(db,'a',{},db.user).items).toEqual([]);
  const rows=Object.fromEntries(identityRequest(db,'/clients/a/members','get',{},{}).map(row=>[row.user_id,row]));
  expect(rows.eligible.assignment_eligible).toBe(true);
  expect(rows.global).toMatchObject({assignment_eligible:true,orphaned:true});
  expect(rows.removed).toMatchObject({assignment_eligible:false,orphaned:true});
  expect(rows.disabled.assignment_eligible).toBe(false);
  expect(rows.foreign).toBeUndefined();
  for(const row of Object.values(rows))expect(Object.keys(row).every(key=>['user_id','name','status','assignment_eligible','orphaned'].includes(key))).toBe(true);
  expect(JSON.stringify(db.tasks)).toBe(before);
  expect(()=>identityRequest(db,'/clients/b/members','get',{},{})).toThrow('Forbidden');
});
