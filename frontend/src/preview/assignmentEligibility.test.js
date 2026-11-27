import { assignmentCandidates, assignmentFields, clientAccess, validateAssignment } from './assignmentEligibility';

const account = (user_id, role, client_ids, status = 'active') => ({user_id, name:'Same Name', email:user_id+'@example.test', role, client_ids, status});
const db = () => ({user:account('actor','client_contributor',['a']), users:[
  account('alex','client_contributor',['a']), account('internal','platform_admin',['a','b']),
  account('super','super_admin',[]), account('global','platform_admin',[]),
  account('foreign','client_contributor',['b']), account('foreign_internal','platform_admin',['b']),
  account('former','client_contributor',['a'],'disabled'), account('invited','client_contributor',['a'],'invited'),
], contacts:[{contact_id:'maya',client_id:'a',name:'Maya Chen',status:'active'}]});

test('client membership requires an array containing the exact client ID for every recognized role', () => {
  for (const role of ['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer']) {
    expect(clientAccess(account('actor', role, ['a']), 'a')).toBe(true);
    if (role === 'super_admin') continue;
    for (const client_ids of ['a', 'a_foreign', ['a_foreign'], undefined, null, false, 1, {0: 'a', length: 1}]) {
      expect(clientAccess(account('actor', role, client_ids), 'a')).toBe(false);
    }
  }
  expect(clientAccess(account('unknown', 'unsupported', ['a']), 'a')).toBe(false);
});

test('only an explicit boolean all-client entitlement grants platform-wide provider access', () => {
  for (const all_clients of [undefined, null, false, 'true', 'false', 1, {}, []]) {
    expect(clientAccess({...account('provider', 'platform_admin', []), all_clients}, 'a')).toBe(false);
  }
  expect(clientAccess({...account('provider', 'platform_admin', null), all_clients: true}, 'a')).toBe(true);
  expect(clientAccess(account('owner', 'super_admin', null), 'a')).toBe(true);
  expect(clientAccess({...account('client', 'client_contributor', []), all_clients: true}, 'a')).toBe(false);
});

test('malformed actor and candidate memberships grant neither candidate reads nor new assignments', () => {
  const d = db();
  d.users.push(account('malformed', 'client_contributor', 'a_foreign'));
  const before = JSON.stringify(d);
  expect(assignmentCandidates(d, 'a').items.some(row => row.user_id === 'malformed')).toBe(false);
  expect(() => validateAssignment(d, 'reviews', {client_id: 'a', owner_id: 'malformed'})).toThrow('Choose an active platform user');
  expect(JSON.stringify(d)).toBe(before);
  d.user.client_ids = 'a_foreign';
  const denied = JSON.stringify(d);
  expect(() => assignmentCandidates(d, 'a')).toThrow('Forbidden');
  expect(JSON.stringify(d)).toBe(denied);
});

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

test('candidates offered to a caller are only the people that caller may assign', () => {
  const d = db();
  const idsFor = caller => assignmentCandidates(d, 'a', {}, caller).items.map(u => u.user_id).sort();
  expect(idsFor(account('ro', 'client_readonly', ['a']))).toEqual([]);
  expect(idsFor(account('alex', 'client_contributor', ['a']))).toEqual(['alex']);
  expect(idsFor(account('mgr', 'client_grc_manager', ['a']))).toEqual(['alex']);
  expect(idsFor(account('super', 'super_admin', []))).toEqual(['alex', 'internal', 'super']);
});
