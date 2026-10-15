import { identityRequest } from './identityLifecycle';
import { contactAccess } from '@/lib/contactAccess';
import { invitationFeedback } from '@/lib/invitationFeedback';

let db;
const call = (path, method = 'get', body = {}, params = {}) => identityRequest(db, path, method, params, body);
beforeEach(() => {
  db = { user: { user_id: 'actor', role: 'platform_admin', client_ids: ['a'], name: 'Scoped admin' },
    clients: [{client_id:'a'}, {client_id:'b'}], logs: [], contacts: [
      { contact_id: 'maya', client_id: 'a', name: 'Maya', email: 'maya@example.com', role: 'Policy Approver' },
    ], users: [
      {user_id:'alex', name:'Same Name', email:'alex@example.com', role:'client_contributor', client_ids:['a'], status:'active'},
      {user_id:'shared', name:'Internal', role:'platform_admin', client_ids:['a','b'], status:'active'},
      {user_id:'foreign', name:'Same Name', email:'foreign@example.com', role:'client_contributor', client_ids:['b'], status:'active'},
      {user_id:'former', name:'Former', role:'client_contributor', client_ids:['a'], status:'disabled'},
      {user_id:'super', name:'Super', role:'super_admin', client_ids:[], status:'active'},
    ], reviews: [{review_id:'review', title:'Active Review', client_id:'a', owner_id:'alex', reviewer_id:'alex', status:'in_progress', completed_by:'alex'}],
    tasks: [], findings: [], risks: [], vendors: [], policies: [], assets: [], requirements: [], exceptions: [],
  };
});

test('explicit all-client entitlement persists and scopes provider account administration', () => {
  db.user = {user_id:'owner', role:'super_admin', client_ids:[]};
  const created = call('/users', 'post', {name:' Global provider ',email:'GLOBAL@example.com',role:'platform_admin',client_ids:[],all_clients:true}).user;
  expect(created.all_clients).toBe(true);
  expect(created.name).toBe('Global provider');
  db.user = {...created,status:'active'};
  expect(call('/users').map(u => u.user_id)).toContain('foreign');
  expect(call('/users').map(u => u.user_id)).not.toContain('super');
  call('/users/foreign','patch',{name:'Authorized edit'});
  expect(() => call('/users/foreign','patch',{password_change_required:true})).toThrow('standard authentication');
  db.user.all_clients = false;
  expect(call('/users')).toEqual([]);
});
test('link is explicit, candidates scoped, no permissions or membership copied', () => {
  expect(call('/contacts/maya/account-candidates').items.map(u => u.user_id)).toEqual(['shared', 'alex', 'super']);
  const users = JSON.stringify(db.users);
  expect(() => call('/contacts/maya/account-link', 'post', {user_id:'alex'})).toThrow('Confirm');
  expect(() => call('/contacts/maya/account-link', 'post', {user_id:'foreign', confirmed:true})).toThrow('authorized');
  call('/contacts/maya/account-link', 'post', {user_id:'alex', confirmed:true});
  expect(JSON.stringify(db.users)).toBe(users);
  expect(db.logs.at(-1).action).toBe('link-account');
  call('/contacts/maya/account-link', 'post', {user_id:null, confirmed:true});
  expect(JSON.stringify(db.users)).toBe(users);
  expect(db.contacts[0].linked_user_id).toBeNull();
});
test('invitation is pending and simulated, existing email does not silently link', () => {
  const result = call('/contacts/maya/invite', 'post', {role:'client_readonly', client_id:'a', confirmed:true});
  expect(result.user.status).toBe('invited'); expect(result.user.role).toBe('client_readonly');
  expect(result.delivery).toBe('simulated'); expect(result.invite_link).toBeUndefined();
  expect(invitationFeedback(result)).toContain('no email was sent');
  expect(() => call(`/users/${result.user.user_id}`, 'patch', {status:'active'})).toThrow('complete its invitation');
  db.contacts.push({contact_id:'duplicate', client_id:'a', name:'Duplicate', email:'MAYA@example.com'});
  expect(() => call('/contacts/duplicate/invite', 'post', {role:'client_readonly', client_id:'a', confirmed:true})).toThrow('already exists');
  expect(db.contacts[1].linked_user_id).toBeUndefined();
});
test('disabled work preserved; report counts once and excludes historical and unrelated records', () => {
  db.reviews.push({review_id:'historical',client_id:'a',owner_id:'alex',status:'completed'},
    {review_id:'foreign',client_id:'b',owner_id:'alex',status:'in_progress'});
  const before = JSON.stringify(db.reviews);
  call('/users/alex', 'patch', {status:'disabled'});
  expect(JSON.stringify(db.reviews)).toBe(before);
  expect(call('/users/alex/open_assignments').total).toBe(1);
  expect(call('/users/alex/open_assignments').items[0].id).toBe('review');
  db.assets.push({asset_id:'system',client_id:'a',owner_id:'alex',status:'active'});
  expect(call('/users/alex/open_assignments').assets).toBe(1);
  db.assets[0].status='retired';
  expect(call('/users/alex/open_assignments').assets).toBe(0);
  expect(db.assets[0].owner_id).toBe('alex');
  expect(call('/contacts/maya/account-candidates').items.some(u => u.user_id === 'alex')).toBe(false);
});
test('visible membership edit preserves other clients and Contact association', () => {
  db.users.find(u => u.user_id === 'shared').role = 'client_contributor';
  db.contacts[0].linked_user_id = 'shared';
  call('/users/shared/client-memberships', 'patch', {client_ids:[]});
  expect(db.users.find(u => u.user_id === 'shared').client_ids).toEqual(['b']);
  expect(db.contacts[0].linked_user_id).toBe('shared');
  const members = call('/clients/a/contact-accounts');
  expect(members[0].has_client_access).toBe(false);
  expect(contactAccess(db.contacts[0], 'a', {clientId:'a', status:'ready', members}).label).toBe('No client access');
  expect(members[0].client_ids).toBeUndefined();
});
test('scoped admin cannot manage Super Admin, foreign account, or grant global scope', () => {
  expect(() => call('/users/super', 'patch', {status:'disabled'})).toThrow('Not authorized');
  expect(() => call('/users/foreign/client-memberships', 'patch', {client_ids:['a','b']})).toThrow('Not authorized');
  expect(() => call('/users/alex/client-memberships', 'patch', {client_ids:['a','b']})).toThrow('Not authorized');
  expect(() => call('/users/shared', 'patch', {status:'disabled'})).toThrow('Not authorized');
  expect(() => call('/users/alex', 'patch', {role:'platform_admin'})).toThrow('Not authorized');
  expect(call('/users').some(u => u.user_id === 'foreign')).toBe(false);
});
test('Contact-only and business role cannot invite or grant access', () => {
  db.user = db.users[0];
  expect(() => call('/contacts/maya/account-link', 'post', {user_id:'alex', confirmed:true})).toThrow('Not authorized');
  expect(() => call('/contacts/maya/invite', 'post', {role:'client_readonly', client_id:'a', confirmed:true})).toThrow('Not authorized');
  expect(invitationFeedback({delivery:'unavailable'})).toContain('unavailable');
});

test('assessment actor names are client scoped and do not grant membership or expose email', () => {
  db.framework_assessments = [{client_id:'a', assessed_by:'super'}, {client_id:'b', assessed_by:'foreign'}];
  db.user = {user_id:'alex', role:'client_readonly', client_ids:['a']};
  const before = JSON.stringify(db.users);
  const members = call('/clients/a/members');
  expect(members.find(u => u.user_id === 'super')).toEqual({user_id:'super', name:'Super', status:'active', orphaned:true});
  expect(members.some(u => u.user_id === 'foreign')).toBe(false);
  expect(JSON.stringify(db.users)).toBe(before);
});

test('members match the backend contract: referenced former accounts included, client roles get names and status only', () => {
  db.risks = [{risk_id:'r', client_id:'a', owner_id:'alex', accepted_by:'super'}];
  const admin = call('/clients/a/members');
  expect(admin.map(u => u.user_id).sort()).toEqual(['alex', 'former', 'shared', 'super']);
  expect(admin.find(u => u.user_id === 'super').orphaned).toBe(true);
  expect(admin.find(u => u.user_id === 'alex').email).toBe('alex@example.com');
  db.user = {user_id:'alex', role:'client_readonly', client_ids:['a']};
  const reader = call('/clients/a/members');
  expect(reader.map(u => u.user_id).sort()).toEqual(['alex', 'former', 'shared', 'super']);
  reader.forEach(row => expect(Object.keys(row).every(k => ['user_id', 'name', 'status', 'orphaned'].includes(k))).toBe(true));
  expect(reader.find(u => u.user_id === 'former').status).toBe('disabled');
});
