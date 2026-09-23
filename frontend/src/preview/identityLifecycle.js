// Isolated demonstration only: never sends mail or establishes standard authentication.
import { assignmentFields, assignmentCandidates, clientAccess, eligible } from './assignmentEligibility';
import { record, write, audit, ids, now } from './store';
import rules from '@/lib/grcRules.json';
import cis from '@/lib/cisIG1.json';

const clientRoles = ['client_grc_manager', 'client_contributor', 'client_readonly'];
const roles = ['super_admin', 'platform_admin', ...clientRoles];
const admin = (db, cid) => {
  if (!['super_admin', 'platform_admin'].includes(db.user.role) || cid && !clientAccess(db.user, cid)) throw new Error('Not authorized to manage accounts for this client');
};
const manageable = (db, target) => {
  admin(db);
  if (db.user.role === 'super_admin') return;
  if (!clientRoles.includes(target.role) ||
      !target.client_ids?.some(cid => db.user.client_ids?.includes(cid))) throw new Error('Not authorized to manage this user');
};
const simulate = (db, user) => {
  if (user.status !== 'invited') throw new Error('Only pending invitations can be resent');
  user.invitation_delivery = 'simulated';
  user.invitation_requested_at = now();
  audit(db, 'invite', 'users', user, { delivery: 'simulated' });
  return { user, simulated: true, delivery: 'simulated' };
};
function createAccount(db, body) {
  admin(db);
  if (!roles.includes(body.role) || db.user.role !== 'super_admin' && !clientRoles.includes(body.role)) throw new Error('Not authorized for this role');
  const client_ids = [...new Set(body.client_ids || [])];
  if (body.role === 'platform_admin' && !client_ids.length && db.user.role !== 'super_admin') throw new Error('Only a Super Admin can authorize global internal scope');
  for (const cid of client_ids) { admin(db, cid); record(db, 'clients', cid); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !body.name?.trim()) throw new Error('Name and email are required');
  if (db.users.some(u => u.email?.toLowerCase() === email)) throw new Error('Account already exists. Use explicit account linking and authorized client membership management.');
  const user = write(db, 'users', { name: body.name, email, role: body.role, client_ids, status: 'invited' });
  return simulate(db, user);
}

export function identityRequest(db, path, method, params, body) {
  const [, kind, id, action] = path.split('/');
  if (kind === 'clients' && action === 'members' && method === 'get') {
    if (!clientAccess(db.user, id)) throw new Error('Forbidden for this client');
    record(db, 'clients', id);
    const historicalOwners = new Set();
    if (['super_admin', 'platform_admin'].includes(db.user.role)) {
      for (const [type, fields] of Object.entries(assignmentFields)) for (const row of db[type] || []) {
        if (row.client_id === id) for (const field of [...fields, ...(type === 'tasks' ? ['owner_id'] : [])]) if (row[field]) historicalOwners.add(row[field]);
      }
    }
    return db.users.filter(u => u.role === 'super_admin' || u.client_ids?.includes(id) || historicalOwners.has(u.user_id)).map(u => ({
      user_id: u.user_id, name: u.name, email: u.email, status: u.status, role: u.role,
      client_ids: (u.client_ids || []).filter(cid => clientAccess(db.user, cid)),
      ...(!clientAccess(u, id) ? {orphaned: true} : {}),
    }));
  }
  if (kind === 'clients' && action === 'contact-accounts' && method === 'get') {
    if (!clientAccess(db.user, id)) throw new Error('Forbidden for this client');
    const linked = new Set(db.contacts.filter(c => c.client_id === id).map(c => c.linked_user_id));
    return db.users.filter(u => linked.has(u.user_id)).map(u => ({ user_id: u.user_id, name: u.name,
      email: u.email, status: u.status, has_client_access: clientAccess(u, id) }));
  }
  if (kind === 'contacts' && ['account-candidates', 'account-link', 'invite'].includes(action)) {
    const contact = record(db, 'contacts', id);
    admin(db, contact.client_id);
    if (action === 'account-candidates' && method === 'get') return assignmentCandidates(db, contact.client_id, params);
    if (method !== 'post' || !body.confirmed) throw new Error('Confirm the identity action');
    if (action === 'account-link') {
      if (Object.prototype.hasOwnProperty.call(body, 'expected_linked_user_id') && body.expected_linked_user_id !== (contact.linked_user_id ?? null)) throw new Error('Account link changed; reload before retrying');
      if (body.user_id && !eligible(db.users.find(u => u.user_id === body.user_id), contact.client_id)) throw new Error('Choose an active account already authorized for this client');
      const previous_user_id = contact.linked_user_id;
      contact.linked_user_id = body.user_id || null;
      contact.updated_at = now();
      audit(db, body.user_id ? 'link-account' : 'unlink-account', 'contacts', contact, { previous_user_id, user_id: body.user_id });
      return contact;
    }
    if (contact.linked_user_id) throw new Error('Contact already linked to a platform user');
    if (body.client_id !== contact.client_id || !clientRoles.includes(body.role)) throw new Error('Confirm the client and a permitted client role');
    const result = createAccount(db, { name: contact.name, email: contact.email, role: body.role, client_ids: [contact.client_id] });
    contact.linked_user_id = result.user.user_id;
    audit(db, 'invite-contact', 'contacts', contact, { user_id: result.user.user_id });
    return result;
  }
  if (kind !== 'users') return undefined;
  if (method === 'get' && action === 'open_assignments') {
    if (db.user.user_id !== id) admin(db);
    if (params.client_id && !clientAccess(db.user, params.client_id)) throw new Error('Forbidden for this client');
    const counts = {}, items = [];
    for (const [type, fields] of Object.entries(assignmentFields)) {
      const terminal = [...(rules.closed[type] || []), ...({ vendors: ['inactive', 'terminated'], policies: ['retired', 'not_applicable'], framework_assessments: ['not_applicable'], ai_systems: ['retired'] }[type] || [])];
      const rows = (db[type] || []).filter(row => clientAccess(db.user, row.client_id) && (!params.client_id || row.client_id === params.client_id) &&
        !terminal.includes(row.status) && (fields.some(f => row[f] === id) || type === 'tasks' && !row.assignee_id && row.owner_id === id));
      counts[type] = rows.length;
      items.push(...rows.slice(0, 100).map(row => ({ kind: type, id: row[ids[type] || (type === 'framework_assessments' ? 'framework_assessment_id' : 'ai_system_id')],
        client_id: row.client_id, title: row.title || row.name || cis.requirements.find(d => d.id === row.definition_id)?.title || 'Untitled record', status: row.status, due_date: row.due_date })));
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { ...counts, total, items, truncated: total > items.length };
  }
  admin(db);
  if (!id && method === 'get') return db.users.filter(u => db.user.role === 'super_admin' || u.client_ids?.some(cid => db.user.client_ids?.includes(cid))).map(u => ({
    user_id: u.user_id, name: u.name, email: u.email, role: u.role, status: u.status, last_login_at: u.last_login_at, updated_at:u.updated_at,
    client_ids: db.user.role === 'platform_admin' && db.user.client_ids?.length ? (u.client_ids || []).filter(cid => db.user.client_ids.includes(cid)) : u.client_ids,
  }));
  if (!id && method === 'post') return createAccount(db, body);
  const target = record(db, 'users', id);
  manageable(db, target);
  if(method==='patch'&&Object.prototype.hasOwnProperty.call(body,'expected_updated_at')&&body.expected_updated_at!==(target.updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
  const foreign = (target.client_ids || []).filter(cid => !db.user.client_ids?.includes(cid));
  if (method === 'patch' && action === 'client-memberships') {
    for (const cid of body.client_ids || []) { admin(db, cid); record(db, 'clients', cid); }
    const preserved = (target.client_ids || []).filter(cid => !clientAccess(db.user, cid));
    const desired = [...new Set([...body.client_ids, ...preserved])];
    if (target.role === 'platform_admin' && !desired.length && db.user.role !== 'super_admin') throw new Error('Removing the last membership would grant global internal scope');
    const previous = target.client_ids;
    target.client_ids = desired;
    target.updated_at=new Date(Math.max(Date.now(),(Date.parse(target.updated_at)||0)+1)).toISOString();
    audit(db, 'update-memberships', 'users', target, { previous, client_ids: desired });
    return { user_id: target.user_id, client_ids: desired.filter(cid => clientAccess(db.user, cid)), updated_at:target.updated_at };
  }
  if (method === 'post' && action === 'resend-invite') {
    if (db.user.role !== 'super_admin' && foreign.length) throw new Error('Invitation administration requires authority over all client memberships');
    return simulate(db, target);
  }
  if (method !== 'patch' || action) throw new Error('Unsupported identity operation');
  if (db.user.role !== 'super_admin' && foreign.length && ['name', 'role', 'status'].some(f => body[f] != null)) throw new Error('Account-wide changes require authority over all client memberships');
  if (body.role && (!roles.includes(body.role) || db.user.role !== 'super_admin' && !clientRoles.includes(body.role))) throw new Error('Not authorized for this role');
  if (body.status && !['active', 'disabled', 'invited'].includes(body.status)) throw new Error('Invalid account status');
  if (target.user_id === db.user.user_id && (body.role || body.status === 'disabled')) throw new Error('You cannot change your own role or disable yourself');
  if ((target.status === 'invited' || target.invitation_requested_at) && body.status === 'active') throw new Error('The account must complete its invitation before activation');
  if (body.client_ids) for (const cid of new Set([...(target.client_ids || []), ...body.client_ids])) {
    if ((target.client_ids || []).includes(cid) !== body.client_ids.includes(cid)) admin(db, cid);
  }
  if ((body.role || target.role) === 'platform_admin' && !(body.client_ids || target.client_ids)?.length && db.user.role !== 'super_admin') throw new Error('Only a Super Admin can authorize global internal scope');
  const patch = Object.fromEntries(['name', 'role', 'status', 'client_ids'].filter(f => body[f] != null).map(f => [f, body[f]]));
  const previous = { status: target.status, client_ids: target.client_ids };
  Object.assign(target, patch, { updated_at: new Date(Math.max(Date.now(),(Date.parse(target.updated_at)||0)+1)).toISOString() });
  audit(db, 'update-account', 'users', target, { previous, changes: patch });
  return target;
}
