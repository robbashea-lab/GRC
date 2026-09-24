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
