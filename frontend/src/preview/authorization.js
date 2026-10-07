// Demo-only mirror of backend/authorization.py authorize_request. It lets persona QA in the
// Demo show the same 403s the server returns; it never protects real data.
import { ids } from './store';
import { stable } from './commandRequests';

const OWNER = 'super_admin', PROVIDER = 'platform_admin', MANAGER = 'client_grc_manager';
const CONTRIBUTOR = 'client_contributor', READER = 'client_readonly';
const CLIENT_ROLES = [MANAGER, CONTRIBUTOR, READER];
const ROLES = [OWNER, PROVIDER, ...CLIENT_ROLES];

export const OWNERS = {
  reviews: ['owner_id', 'reviewer_id'], tasks: ['assignee_id', 'owner_id'],
  findings: ['owner_id'], risks: ['owner_id'], policies: ['owner_id'],
  vendors: ['business_owner_id'], assets: ['owner_id'],
  framework_assessments: ['owner_id'], ai_systems: ['owner_id', 'technical_owner_id'],
};

// Self-service routes any signed-in role may call.
const SELF = [/^patch \/me$/, /^patch \/me\/password$/, /^patch \/me\/preferences$/, /^(post|delete) \/me\/favorites\/[^/]+$/,
  /^post \/notifications\/[^/]+\/read$/, /^post \/notifications\/read-all$/, /^post \/auth\/logout$/, /^(get|post|patch|delete) \/demo\//];

class Forbidden extends Error { constructor(message) { super(message); this.status = 403; } }
const deny = message => { throw new Forbidden(message); };
const roleOf = user => user?.role === 'client_viewer' ? READER : user?.role;
const activeClientUser = (db, id, clientId) => db.users.some(u => u.user_id === id && u.status === 'active' && CLIENT_ROLES.includes(u.role) && u.client_ids?.includes(clientId));

export function requireCreationAssignee(db, clientId, assigneeId) {
  const role=roleOf(db.user);
  if(role===CONTRIBUTOR&&![undefined,null,'',db.user.user_id].includes(assigneeId))deny('Contributors may create work only for themselves');
  if(role===MANAGER&&assigneeId&&!activeClientUser(db,assigneeId,clientId))deny('Assign an existing authorized client user');
}

function requireAssigned(user, kind, row) {
  if (kind === 'tasks' && !(row.assignee_id || row.owner_id) && row.created_by === user.user_id) return;
  if (roleOf(user) === CONTRIBUTOR && !(OWNERS[kind] || []).some(f => row[f] === user.user_id)) deny('This activity must be assigned to you');
}

// Returns nothing when allowed; throws an error carrying status 403 when the server would refuse.
export function authorizeDemo(db, method, parts, body = {}, requestKey) {
  const user = db.user, role = roleOf(user);
  if (!ROLES.includes(role)) deny('Unsupported role');
  if (method === 'get') return;
  const route = `${method} /${parts.join('/')}`;
  if (SELF.some(pattern => pattern.test(route))) return;
  if (role === OWNER) return;
  if (role === PROVIDER) {
    if ((method === 'post' && route === 'post /clients') || parts[0] === 'reminders') deny('Platform Owner required');
    return;
  }
  if (role === READER) deny('Read-only role');
  const [kind, id, action] = parts;
  const generic = !!OWNERS[kind] || ['exceptions', 'requirements', 'contacts'].includes(kind);
  const allowed = (method === 'post' && parts.length === 1 && (generic || ['evidence', 'comments'].includes(kind)))
    || (method === 'patch' && parts.length === 2 && generic)
    || (method === 'post' && kind === 'reviews' && ['start', 'complete', 'create-finding'].includes(action) && parts.length === 3)
    || (method === 'patch' && kind === 'reviews' && action === 'iso-audit' && [3,4].includes(parts.length))
    || (method === 'post' && kind === 'framework_assessments' && action === 'findings' && parts.length === 3);
  const guidedWrite=method==='put'&&kind==='framework_assessments'&&action==='guided-assessment'&&parts.length===3;
  if (!allowed&&!guidedWrite) deny('This operation requires a service-provider administrator');
  if (method === 'post' && parts.length === 1 && generic) {
    if (kind !== 'tasks') deny('Creating this record requires a service-provider administrator');
    requireCreationAssignee(db,body.client_id,body.assignee_id);
    return;
  }
  if (!id || !OWNERS[kind]) {
    if (method === 'patch') deny('This resource requires service-provider administration');
    return;
  }
  const row = (db[kind] || []).find(r => r[ids[kind]] === id);
  if (!row) deny('Record unavailable for this client');
  if (!user.client_ids?.includes(row.client_id)) deny('Forbidden for this client');
  if (kind === 'tasks' && method === 'patch' && parts.length === 2 && requestKey) {
    const receipt = db.command_requests?.[JSON.stringify([user.user_id,row.client_id,'/'+parts.join('/'),requestKey])];
    // Demo receipts are committed atomically with their effects. Replay only the
    // exact completed intent, after current role and tenant checks, not a new edit.
    if (receipt) {
      if (receipt.fingerprint !== stable(body)) throw Object.assign(new Error('This request has different data; restore the original request before retrying'), {status:409});
      return;
    }
  }
  requireAssigned(user, kind, row);
  if (method !== 'patch') return;
  for (const field of Object.keys(body).filter(f => OWNERS[kind].includes(f))) {
    if (body[field] === row[field]) continue;
    if (role === CONTRIBUTOR && !(kind === 'tasks' && [null, '', user.user_id].includes(body[field]))) deny('Contributors cannot reassign this activity');
    if (body[field] && !activeClientUser(db, body[field], row.client_id)) deny('Assign an existing authorized client user');
  }
  if (parts.length !== 2) return;
  const changed = Object.entries(body).filter(([field, value]) => !['expected_updated_at', 'expected_occurrence_id', 'expected_last_assessed'].includes(field)
    && value !== row[field] && !([null, undefined, ''].includes(value) && [null, undefined, ''].includes(row[field]))).map(([field]) => field);
  if (kind === 'framework_assessments') return;
  const fields = new Set(['notes']);
  if (kind === 'tasks') ['status', 'description', 'resolution', 'title', 'priority', 'due_date', 'reason', 'context'].forEach(f => fields.add(f));
  if (kind === 'tasks' && role === CONTRIBUTOR && [undefined, null, '', user.user_id].includes(body.assignee_id)) fields.add('assignee_id');
  if (kind === 'findings') fields.add('remediation_plan');
  if (role === MANAGER && ['tasks', 'findings', 'reviews', 'risks', 'policies', 'vendors', 'assets'].includes(kind)) OWNERS[kind].forEach(f => fields.add(f));
  if (changed.some(field => !fields.has(field))) deny('These fields require service-provider administration');
}
