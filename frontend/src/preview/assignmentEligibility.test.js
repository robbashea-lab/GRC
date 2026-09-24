import { assignmentCandidates, assignmentFields, validateAssignment } from './assignmentEligibility';

const account = (user_id, role, client_ids, status = 'active') => ({user_id, name:'Same Name', email:user_id+'@example.test', role, client_ids, status});
const db = () => ({user:account('actor','client_contributor',['a']), users:[
  account('alex','client_contributor',['a']), account('internal','platform_admin',['a','b']),
  account('super','super_admin',[]), account('global','platform_admin',[]),
  account('foreign','client_contributor',['b']), account('foreign_internal','platform_admin',['b']),
  account('former','client_contributor',['a'],'disabled'), account('invited','client_contributor',['a'],'invited'),
], contacts:[{contact_id:'maya',client_id:'a',name:'Maya Chen',status:'active'}]});

test('authorized candidate contract excludes contacts, foreign and inactive accounts',()=>{
  const result=assignmentCandidates(db(),'a');
  expect(result.items.map(u=>u.user_id).sort()).toEqual(['alex','internal','super']);
  result.items.forEach(u=>expect(Object.keys(u).sort()).toEqual(['email','name','user_id']));
  expect(()=>assignmentCandidates(db(),'b')).toThrow('Forbidden');
});
test('bounded literal identity search and paging',()=>{
  expect(assignmentCandidates(db(),'a',{search:'ALEX@'}).items.map(u=>u.user_id)).toEqual(['alex']);
  expect(assignmentCandidates(db(),'a',{search:'.*'}).items).toEqual([]);
  expect(assignmentCandidates(db(),'a',{limit:2}).has_more).toBe(true);
  expect(assignmentCandidates(db(),'a',{limit:2,offset:2}).items).toHaveLength(1);
  expect(()=>assignmentCandidates(db(),'a',{limit:101})).toThrow();
});
test.each(Object.entries(assignmentFields))('%s uses the baseline without losing existing assignments',(kind,fields)=>{
  for(const field of fields){
    for(const id of ['alex','internal','super',null]) expect(()=>validateAssignment(db(),kind,{client_id:'a',[field]:id})).not.toThrow();
    for(const id of ['global','maya','foreign','foreign_internal','former','invited','missing']) expect(()=>validateAssignment(db(),kind,{client_id:'a',[field]:id})).toThrow();
    const old={client_id:'a',[field]:'former'};
    expect(()=>validateAssignment(db(),kind,{...old,title:'Edited'},old)).not.toThrow();
    expect(()=>validateAssignment(db(),kind,{...old,[field]:null},old)).not.toThrow();
  }
});
test('legacy Action attribution and intentional business/approval exceptions survive',()=>{
  expect(()=>validateAssignment(db(),'tasks',{client_id:'a',assignee_id:'former'},{client_id:'a',owner_id:'former'})).not.toThrow();
  expect(assignmentFields.framework_assessments).not.toContain('process_owner_id');
  expect(assignmentFields.policies).not.toContain('approver_id');
  expect(assignmentFields.contacts).toBeUndefined();
});
