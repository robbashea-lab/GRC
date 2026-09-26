import { authorizeDemo } from './authorization';

const people = [
  {user_id:'mgr', role:'client_grc_manager', client_ids:['a'], status:'active'},
  {user_id:'con', role:'client_contributor', client_ids:['a'], status:'active'},
  {user_id:'ro', role:'client_readonly', client_ids:['a'], status:'active'},
  {user_id:'prov', role:'platform_admin', client_ids:['a'], status:'active'},
];
const db = role => ({ user: people.find(u => u.role === role) || {user_id:'own', role}, users: people,
  risks: [{risk_id:'r1', client_id:'a', owner_id:'con'}, {risk_id:'r2', client_id:'a', owner_id:'mgr'}],
  tasks: [{task_id:'t1', client_id:'a', assignee_id:'con'}], policies: [{policy_id:'p1', client_id:'a', owner_id:'con'}],
  contacts: [{contact_id:'c1', client_id:'a'}], framework_assessments: [{framework_assessment_id:'fa', client_id:'a', owner_id:'con'}] });
const refused = (role, method, path, body) => { try { authorizeDemo(db(role), method, path.split('/').filter(Boolean), body); return null; } catch (e) { return e.status; } };

test('read-only personas can read but every write is refused with 403', () => {
  expect(refused('client_readonly', 'get', '/risks')).toBeNull();
  for (const [method, path] of [['post','/risks'], ['patch','/risks/r1'], ['delete','/contacts/c1'], ['post','/comments'], ['post','/policies/p1/submit-review']])
    expect(refused('client_readonly', method, path, {})).toBe(403);
});

test('contributors act only on their own work, within the field allowlist', () => {
  expect(refused('client_contributor', 'patch', '/risks/r1', {notes:'Updated'})).toBeNull();
  expect(refused('client_contributor', 'patch', '/risks/r1', {title:'Renamed'})).toBe(403);
  expect(refused('client_contributor', 'patch', '/risks/r2', {notes:'Not mine'})).toBe(403);
  expect(refused('client_contributor', 'post', '/risks', {client_id:'a'})).toBe(403);
  expect(refused('client_contributor', 'post', '/tasks', {client_id:'a', assignee_id:'mgr'})).toBe(403);
  expect(refused('client_contributor', 'post', '/tasks', {client_id:'a', assignee_id:'con'})).toBeNull();
  expect(refused('client_contributor', 'patch', '/framework_assessments/fa', {status:'implemented'})).toBeNull();
  expect(refused('client_contributor', 'post', '/policies/p1/submit-review', {})).toBe(403);
  expect(refused('client_contributor', 'delete', '/contacts/c1')).toBe(403);
});

test('managers may reassign to client users only; providers cannot create clients', () => {
  expect(refused('client_grc_manager', 'patch', '/risks/r1', {owner_id:'ro'})).toBeNull();
  expect(refused('client_grc_manager', 'patch', '/risks/r1', {owner_id:'prov'})).toBe(403);
  expect(refused('platform_admin', 'post', '/clients', {})).toBe(403);
  expect(refused('platform_admin', 'post', '/risks', {client_id:'a'})).toBeNull();
  expect(refused('super_admin', 'post', '/clients', {})).toBeNull();
  expect(refused('client_readonly', 'patch', '/me/preferences', {})).toBeNull();
});
