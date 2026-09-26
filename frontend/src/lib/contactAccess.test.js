import { contactAccess, contactResponsibilities, ownerAccountNote } from './contactAccess';

const contact = { client_id: 'a', linked_user_id: 'alex', name: 'Alex Morgan', email: 'alex@example.test' };
const account = { user_id: 'alex', status: 'active', client_ids: ['a'], role: 'client_contributor' };
const context = members => ({ clientId: 'a', status: 'ready', members });
test('explicit link plus client access and active account are required', () => {
  expect(contactAccess(contact, 'a', context([account])).label).toBe('Active account');
});
test.each(['Maya Chen', 'Jane Smith', 'Jordan Lee'])('unlinked %s is a valid business contact, not proven account absence', name => {
  expect(contactAccess({ ...contact, name, linked_user_id: null }, 'a', context([account])).label).toBe('Account not linked');
});
test('matching name/email never infers a link or account existence', () => {
  expect(contactAccess({ ...contact, linked_user_id: null }, 'a', context([{ ...account, ...contact }])).label).toBe('Account not linked');
});
test('business roles and contact status never grant account access', () => {
  expect(contactAccess({ ...contact, linked_user_id: null, status: 'active', role: 'Policy Approver' }, 'a', context([account])).label).toBe('Account not linked');
  expect(contactAccess({ ...contact, status: 'inactive' }, 'a', context([account])).label).toBe('Active account');
});
test('disabled account is distinct from contact status', () => {
  expect(contactAccess(contact, 'a', context([{ ...account, status: 'disabled' }])).label).toBe('Disabled account');
});
test.each(['invited', undefined, 'unknown'])('does not assert invitation progress for status %s', status => {
  expect(contactAccess(contact, 'a', context([{ ...account, status }])).label).toBe('Account status unverified');
});
test.each([[[]], [['b']]])('does not trust a historical owner or unrelated membership %j', client_ids => {
  expect(contactAccess(contact, 'a', context([{ ...account, client_ids, orphaned: true }])).label).toBe('Access not verified');
});
test('missing linked account and failed requests are not proof of absence', () => {
  expect(contactAccess(contact, 'a', context([])).label).toBe('Access not verified');
  expect(contactAccess(contact, 'a', { clientId: 'a', status: 'error' }).label).toBe('Access not verified');
});
test('another client contact cannot use the current membership context', () => {
  expect(contactAccess({ ...contact, client_id: 'b' }, 'a', context([account])).label).toBe('Access not verified');
});
test('old client context and in-flight requests cannot produce active state', () => {
  expect(contactAccess(contact, 'a', { ...context([account]), clientId: 'b' }).label).toBe('Checking access…');
  expect(contactAccess(contact, 'a', { ...context([account]), status: 'loading' }).label).toBe('Checking access…');
});
test.each(['super_admin', 'platform_admin'])('existing global %s access does not require invented membership', role => {
  expect(contactAccess(contact, 'a', context([{ ...account, role, client_ids: [] }])).label).toBe('Active account');
});
test('exposes no unrelated identity or membership details and mutates nothing', () => {
  const data = context([{ ...account, client_ids: ['b'], email: 'private@example.test', name: 'Private person' }]);
  const before = JSON.stringify([contact, data]);
  expect(JSON.stringify(contactAccess(contact, 'a', data))).not.toMatch(/private|alex|client_ids|user_id/i);
  expect(JSON.stringify([contact, data])).toBe(before);
});
test('business responsibilities are preserved, deduplicated and optional', () => {
  expect(contactResponsibilities({ role: 'Executive Sponsor', grc_roles: ['Executive Sponsor', 'Policy Approver'] })).toBe('Executive Sponsor · Policy Approver');
  expect(contactResponsibilities({})).toBe('Not specified');
});

test('open work owned by a disabled account is surfaced; finished history is not flagged', () => {
  const users = [{ user_id: 'frito', status: 'disabled' }, { user_id: 'joe', status: 'active' }];
  expect(ownerAccountNote(users, 'frito', 'open')).toBe('Disabled account');
  expect(ownerAccountNote(users, 'frito', 'accepted')).toBe('Disabled account');
  expect(ownerAccountNote(users, 'frito', 'completed')).toBeNull();
  expect(ownerAccountNote(users, 'joe', 'open')).toBeNull();
  expect(ownerAccountNote(users, 'unknown', 'open')).toBeNull();
  expect(ownerAccountNote([], null, 'open')).toBeNull();
});
