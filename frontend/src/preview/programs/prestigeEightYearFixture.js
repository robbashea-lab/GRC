import {ids} from '../store';
import {stable} from '../commandRequests';
import {fixtureFingerprint} from '../cisDemoHistoryContext';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {socConfiguration} from '../../lib/socReadiness';
import {clientAccess, eligible, validateAssignment} from '../assignmentEligibility';

const CID = 'demo_prestige', VERSION = 'prestige-eight-year-v1';
const ANCHOR = '2026-11-02T00:00:00.000Z';
const MARKER = 'prestige_eight_year_fixture';
const MAPS = ['baselines', 'drafts', 'ai_intake', 'ai_counters', 'riskSequences'];
const REQUESTS = ['create_requests', 'vendor_action_requests', 'command_requests'];
const GUIDED = ['guided_assessment_pilot', 'guided_assessment_history'];
const REPORTING = ['snapshots', 'identities', 'scope_events', 'source_refresh_proofs'];
const PATCH = ['notes', 'profile', 'onboarding_baseline', 'initial_program_baseline'];
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Prestige canonical fixture: ' + message); };
const ownProgram = row => (row.client_id === CID || row.program_id === CID + ':soc-2')
  && (!row.client_id || row.client_id === CID) && (!row.program_id || row.program_id === CID + ':soc-2');
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const recordId = (kind, row) => kind === 'logs' ? row.audit_id || row.log_id : row[ids[kind] || 'notification_id'];
const kinds = () => [...Object.keys(ids).filter(kind => !['clients', 'users', 'contacts'].includes(kind)), 'logs', 'notifications'];

function requestOwner(key) {
  let parts;
  try { parts = JSON.parse(key); } catch { fail('a native request scope is unreadable.'); }
  if (!Array.isArray(parts)) fail('a native request scope is invalid.');
  return parts[1];
}
function pooled(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, '_portfolio_source_index') || Object.hasOwn(value, '_portfolio_scope_index')) return true;
  return Object.values(value).some(pooled);
}
function consistentOwnership(value) {
  if (!value || typeof value !== 'object') return true;
  if (value.client_id && value.client_id !== CID || value.program_id && value.program_id !== CID + ':soc-2') return false;
  return Object.values(value).every(consistentOwnership);
}
function logAliases(row) { return [...new Set([row.audit_id, row.log_id].filter(value => value != null && value !== ''))]; }
function requiredUsers(db, value) {
  const users = new Map(db.users.map(row => [row.user_id, row])), found = new Set();
  const walk = item => {
    if (typeof item === 'string' && users.has(item)) found.add(item);
    else if (item && typeof item === 'object') Object.values(item).forEach(walk);
  };
  walk(value);
  return [...found].sort().map(id => ({user_id: id, role: users.get(id).role,
    status: users.get(id).status, client_access: clientAccess(users.get(id), CID)}));
}

// Generation uses native async commands. Runtime seed loading only clones their qualified owned slice.
export async function materializePrestigeEightYearFixture(candidate) {
  if (candidate?.clientId !== CID || candidate.anchor !== ANCHOR || !candidate.backup
    || candidate.scenarioManifest?.client_id !== CID || candidate.scenarioManifest.status !== 'source_complete')
    fail('qualify the complete source scenario before materializing it.');
  const db = candidate.db, clients = db.clients.filter(row => row.client_id === CID);
  if (clients.length !== 1 || clients[0].environment !== 'Demo' || db.user?.workspace_mode !== 'demo')
    fail('one exact canonical Demo client is required.');
  const assessmentIds = new Set(db.framework_assessments.filter(row => row.client_id === CID).map(row => row.framework_assessment_id));
  const collections = Object.fromEntries(kinds().map(kind => [kind, copy((db[kind] || []).filter(row => row.client_id === CID))]));
  const ownedIds = new Set(Object.entries(collections).flatMap(([kind, rows]) => rows.map(row => recordId(kind, row))));
  const clientPatch = Object.fromEntries(PATCH.filter(key => Object.hasOwn(clients[0], key)).map(key => [key, copy(clients[0][key])]));
  // Only SOC settings travel with its native source context. Other enrollments/settings stay in the receiving seed.
  clientPatch.framework_settings = {'soc-2': copy(clients[0].framework_settings['soc-2'])};
  const maps = Object.fromEntries(MAPS.filter(key => Object.hasOwn(db[key] || {}, CID)).map(key => [key, copy(db[key][CID])]));
  const requests = Object.fromEntries(REQUESTS.map(key => [key,
    Object.fromEntries(Object.entries(db[key] || {}).filter(([scope]) => requestOwner(scope) === CID).map(([scope, row]) => [scope, copy(row)]))]));
  const guided = Object.fromEntries(GUIDED.map(key => [key,
    Object.fromEntries(Object.entries(db[key] || {}).filter(([scope, row]) => row.client_id === CID
      || [...assessmentIds].some(id => scope.startsWith(id + ':'))).map(([scope, row]) => [scope, copy(row)]))]));
  for (const key of REPORTING) if ((db.portfolio_reporting?.[key] || []).some(row =>
    (row.client_id === CID || row.program_id === CID + ':soc-2') && !ownProgram(row)))
    fail('reporting ownership is inconsistent.');
  const reporting = Object.fromEntries(REPORTING.map(key => [key, copy((db.portfolio_reporting?.[key] || []).filter(ownProgram))]));
  if (pooled(reporting)) fail('materialize expanded reporting records, never global storage-pool indices.');
  reporting.activity_proofs = Object.fromEntries(Object.entries(db.portfolio_reporting?.activity_proofs || {})
    .filter(([id]) => ownedIds.has(id)).map(([id, value]) => [id, copy(value)]));
  const payload = {schema_version: 1, version: VERSION, client_id: CID, anchor: ANCHOR,
    client_patch: clientPatch, collections, maps, requests, guided, reporting};
  payload.required_users = requiredUsers(db, payload);
  payload.required_contacts = db.contacts.filter(row => row.client_id === CID)
    .map(row => ({contact_id: row.contact_id, status: row.status, linked_user_id: row.linked_user_id ?? null}));
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(payload)));
  return {payload, fingerprint: fixtureFingerprint(payload),
    payload_sha256: Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''),
    provenance: copy(candidate.scenarioManifest)};
}

// Missing markers in retained visitor data never authorize replacement.
export function installPrestigeEightYearFixture(source, fixture, {fresh = false, clock = new Date()} = {}) {
  if (!fresh || source.user?.workspace_mode !== 'demo'
    || !source.clients?.some(row => row.client_id === CID)
    || source.clients?.find(row => row.client_id === CID)?.demo_program_version === VERSION)
    return {db: source, installed: false};
  if (!Number.isFinite(+new Date(clock))) fail('a valid fresh-seed clock is required.');
  if (new Date(clock) < new Date(ANCHOR)) return {db: source, installed: false};
  if (source[MARKER]) fail('preserve an existing or inconsistent fixture receipt.');
  const payload = fixture?.payload;
  if (!exact(payload, ['schema_version', 'version', 'client_id', 'anchor', 'client_patch', 'collections', 'maps', 'requests', 'guided', 'reporting', 'required_users', 'required_contacts'])
    || payload.schema_version !== 1 || payload.version !== VERSION || payload.client_id !== CID
    || payload.anchor !== ANCHOR || !/^[a-f0-9]{64}$/.test(fixture.payload_sha256 || '')
    || fixtureFingerprint(payload) !== fixture.fingerprint || pooled(payload.reporting)
    || !exact(payload.collections, kinds()) || !plain(payload.maps) || !plain(payload.client_patch)
    || kinds().some(kind => !Array.isArray(payload.collections[kind]))
    || !exact(payload.requests, REQUESTS) || !exact(payload.guided, GUIDED)
    || !exact(payload.reporting, [...REPORTING, 'activity_proofs']) || !Array.isArray(payload.required_users)
    || !Array.isArray(payload.required_contacts) || payload.required_contacts.length !== 6
    || Object.keys(payload.maps).some(key => !MAPS.includes(key))
    || Object.keys(payload.client_patch || {}).some(key => ![...PATCH, 'framework_settings'].includes(key))
    || Object.keys(payload.client_patch.framework_settings || {}).some(key => key !== 'soc-2'))
    fail('the bundled materialized fixture changed or has unsupported fields.');
  if (!payload.maps.baselines?.completed || payload.maps.baselines.requirements?.['soc-2'] !== 'applies'
    || payload.collections.framework_assessments.length !== 38
    || new Set(payload.collections.framework_assessments.map(row => row.definition_id)).size !== 38
    || payload.collections.framework_assessments.some(row => row.framework_key !== 'soc-2')
    || payload.collections.policies.length !== 16 || payload.collections.vendors.length !== 23
    || payload.collections.ai_systems.length !== 4 || payload.collections.risks.length < 30
    || payload.collections.organizational_controls.length !== 25 || payload.collections.reviews.length < 103
    || !Number.isSafeInteger(payload.maps.riskSequences) || !Number.isSafeInteger(payload.maps.ai_counters))
    fail('the complete native baseline, criterion cohort and counters are required.');
  for (const [kind, map, prefix] of [['risks', 'riskSequences', 'RISK'], ['ai_systems', 'ai_counters', 'AI']]) {
    const values = payload.collections[kind].map(row => Number(new RegExp('^' + prefix + '-(\\d{3,})$').exec(row.display_id || '')?.[1]));
    if (values.some(value => !Number.isSafeInteger(value) || value < 1)
      || new Set(values).size !== values.length || payload.maps[map] < Math.max(...values))
      fail('native display identities and counters must remain consistent.');
  }
  const {db, backup} = preparePrestigeNativeOnboarding(source,
    {clock: new Date(ANCHOR), purpose: 'native_onboarding_qa'});
  const original = source.clients.find(row => row.client_id === CID);
  const intended = socConfiguration({framework_settings: payload.client_patch.framework_settings}).categories;
  const actual = socConfiguration(original).categories;
  if (stable([...actual].sort()) !== stable([...intended].sort())) fail('preserve the existing selected SOC categories.');
  const actor = db.users.find(row => row.user_id === source.user.user_id);
  if (!eligible(actor, CID) || actor.role !== source.user.role) fail('the retained native administrator is unavailable.');
  const {required_users: declaredUsers, required_contacts: declaredContacts, ...unrosteredPayload} = payload;
  if (stable(requiredUsers(db, unrosteredPayload)) !== stable(declaredUsers))
    fail('the complete retained recording-actor roster is required.');
  for (const expected of declaredUsers) {
    const user = db.users.find(row => row.user_id === expected.user_id);
    if (!user || user.role !== expected.role || user.status !== expected.status
      || clientAccess(user, CID) !== expected.client_access) fail('a retained native recording actor changed.');
  }
  for (const expected of declaredContacts) {
    const matches = db.contacts.filter(row => row.client_id === CID && row.contact_id === expected.contact_id);
    if (matches.length !== 1 || matches[0].status !== expected.status
      || (matches[0].linked_user_id ?? null) !== expected.linked_user_id)
      fail('a retained business Contact or its account relationship changed.');
  }
  const ownedIds = new Set();
  for (const kind of kinds()) {
    const rows = payload.collections[kind], seen = new Set((db[kind] || []).flatMap(row => kind === 'logs' ? logAliases(row) : [recordId(kind, row)]));
    if (!Array.isArray(rows)) fail('native fixture collections must be arrays.');
    for (const row of rows) {
      const id = recordId(kind, row);
      const aliases = kind === 'logs' ? logAliases(row) : [id];
      if (!plain(row) || row.client_id !== CID || !aliases.length
        || aliases.some(value => typeof value !== 'string' || !value || seen.has(value)))
        fail('duplicate, foreign or missing ' + kind + ' identity.');
      aliases.forEach(value => seen.add(value));
      ownedIds.add(id);
      validateAssignment(db, kind, row);
      if (row.process_owner_id && !db.contacts.some(contact => contact.client_id === CID
        && contact.contact_id === row.process_owner_id && contact.status === 'active'))
        fail('a process owner must remain an active same-client business Contact.');
    }
    db[kind] = [...(db[kind] || []), ...copy(rows)];
  }
  for (const [key, value] of Object.entries(payload.maps)) (db[key] ||= {})[CID] = copy(value);
  for (const key of REQUESTS) for (const [scope, value] of Object.entries(payload.requests?.[key] || {})) {
    const parts = JSON.parse(scope);
    if (requestOwner(scope) !== CID || !eligible(db.users.find(row => row.user_id === parts[0]), CID)
      || !consistentOwnership(value) || Object.hasOwn(db[key] || {}, scope)) fail('request scope collides with another source.');
    (db[key] ||= {})[scope] = copy(value);
  }
  for (const key of GUIDED) for (const [scope, value] of Object.entries(payload.guided?.[key] || {})) {
    const assessment = payload.collections.framework_assessments.find(row => row.framework_assessment_id === value.assessment_id);
    const draftKey = value.assessment_id + ':' + value.user_id;
    const expectedScope = key === 'guided_assessment_history' ? draftKey + ':' + value.revision : draftKey;
    if (value.client_id !== CID || !assessment || scope !== expectedScope
      || key === 'guided_assessment_history' && (!Number.isInteger(value.revision) || value.revision < 1)
      || !eligible(db.users.find(row => row.user_id === value.user_id), CID)
      || Object.hasOwn(db[key] || {}, scope)) fail('guided history scope collides with another source.');
    (db[key] ||= {})[scope] = copy(value);
  }
  const client = db.clients.find(row => row.client_id === CID);
  for (const key of PATCH) if (Object.hasOwn(payload.client_patch, key)) client[key] = copy(payload.client_patch[key]);
  client.framework_settings = {...client.framework_settings, 'soc-2': copy(payload.client_patch.framework_settings['soc-2'])};
  client.demo_program_version = VERSION;
  for (const key of REPORTING) {
    if ((payload.reporting[key] || []).some(row => !ownProgram(row))) fail('foreign reporting data cannot be imported.');
    (db.portfolio_reporting ||= {})[key] = [...(db.portfolio_reporting?.[key] || []), ...copy(payload.reporting[key] || [])];
  }
  for (const [id, value] of Object.entries(payload.reporting.activity_proofs || {})) {
    if (!ownedIds.has(id) || !consistentOwnership(value) || Object.hasOwn(db.portfolio_reporting?.activity_proofs || {}, id))
      fail('activity proof ownership or identity collides with another source.');
    ((db.portfolio_reporting ||= {}).activity_proofs ||= {})[id] = copy(value);
  }
  db[MARKER] = {version: VERSION, client_id: CID, anchor: ANCHOR,
    fingerprint: fixture.fingerprint, generated_payload_sha256: fixture.payload_sha256,
    ...(fixture.provenance?.reporting ? {history: copy(fixture.provenance.reporting)} : {})};
  return {db, backup, installed: true, clientId: CID, anchor: ANCHOR};
}
