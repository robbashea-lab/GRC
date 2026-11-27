import {cisDemoFixtureDates} from '../cisDemoFixtureDates';
import {socConfiguration} from '../../lib/socReadiness';

const CLIENT_ID = 'demo_prestige';
const ANCHOR = '2026-11-02T00:00:00.000Z';
const CATEGORIES = ['security', 'availability', 'confidentiality'];
const ID_FIELDS = {
  organizational_controls: 'control_id', framework_assessments: 'framework_assessment_id',
  ai_systems: 'ai_system_id', reviews: 'review_id', findings: 'finding_id', risks: 'risk_id',
  policies: 'policy_id', vendors: 'vendor_id', assets: 'asset_id', tasks: 'task_id',
  exceptions: 'exception_id', requirements: 'requirement_id', evidence: 'evidence_id',
  assessments: 'assessment_id', comments: 'comment_id', logs: 'audit_id', notifications: 'notification_id',
};
const SHARED_ARRAYS = ['clients', 'users', 'contacts'];
const copy = value => JSON.parse(JSON.stringify(value));
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('Private Prestige onboarding fixture: ' + message); };
const ownsProgram = row => row.client_id === CLIENT_ID
  || typeof row.program_id === 'string' && row.program_id.startsWith(CLIENT_ID + ':');

// Inspect relationship fields, including frozen snapshots; incidental prose is not a link.
function referencesOwnedRecord(value, ownedIds) {
  if (Array.isArray(value)) return value.some(item => referencesOwnedRecord(item, ownedIds));
  if (!object(value)) return false;
  if (typeof value.kind === 'string' && ownedIds.has(value.id)) return true;
  return Object.entries(value).some(([key, item]) =>
    key.endsWith('_id') && typeof item === 'string' && ownedIds.has(item)
    || key.endsWith('_ids') && Array.isArray(item) && item.some(id => ownedIds.has(id))
    || referencesOwnedRecord(item, ownedIds));
}

// Explicit fresh-source preparation only. No startup import, access grant or retained-store upgrade.
export function preparePrestigeNativeOnboarding(source, {clock, purpose} = {}) {
  if (purpose !== 'native_onboarding_qa') fail('an explicit native-onboarding QA purpose is required.');
  if (!object(source) || source.user?.workspace_mode !== 'demo'
    || source.user?.role !== 'super_admin' || source.user?.status !== 'active' || !source.user.user_id)
    fail('the original active Demo seed actor is required.');
  if (!clock || cisDemoFixtureDates(clock).anchor !== ANCHOR) fail('use the frozen scenario day.');
  if (!Array.isArray(source.clients) || !Array.isArray(source.users) || !Array.isArray(source.contacts))
    fail('native clients, users and contacts are required.');
  const clients = source.clients.filter(row => row.client_id === CLIENT_ID);
  const client = clients[0];
  if (clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.archived || client.archived_at || source.baselines?.[CLIENT_ID]?.completed !== true
    || source.baselines[CLIENT_ID].requirements?.['soc-2'] !== 'applies')
    fail('one completed canonical SOC 2 Demo client is required.');
  if (Object.entries(source.baselines[CLIENT_ID].requirements).some(([key, value]) => key !== 'soc-2' && value === 'applies'))
    fail('another enrolled program must not be removed by SOC-only preparation.');
  const categories = socConfiguration(client).categories;
  if (!Array.isArray(categories) || categories.length !== CATEGORIES.length
    || new Set(categories).size !== CATEGORIES.length || !CATEGORIES.every(category => categories.includes(category)))
    fail('preserve the enrolled Security, Availability and Confidentiality categories.');

  const ownedIds = new Set(), assessmentIds = new Set(), removedRecordIds = {};
  for (const [kind, rows] of Object.entries(source)) {
    if (!Array.isArray(rows)) continue;
    if (rows.some(row => !object(row))) fail(kind + ' must contain decoded native records.');
    if (SHARED_ARRAYS.includes(kind)) continue;
    removedRecordIds[kind] = [];
    for (const row of rows.filter(value => value.client_id === CLIENT_ID)) {
      if (!ID_FIELDS[kind] || typeof row[ID_FIELDS[kind]] !== 'string') fail('unrecognized owned record in ' + kind + '.');
      if (kind === 'framework_assessments' && row.framework_key !== 'soc-2')
        fail('another framework assessment must not be removed by SOC-only preparation.');
      ownedIds.add(row[ID_FIELDS[kind]]);
      removedRecordIds[kind].push(row[ID_FIELDS[kind]]);
      if (kind === 'framework_assessments') assessmentIds.add(row.framework_assessment_id);
    }
  }
  // Collect every owned ID before checking arrays, regardless of their storage order.
  for (const [kind, rows] of Object.entries(source)) {
    if (Array.isArray(rows) && !SHARED_ARRAYS.includes(kind)
      && rows.some(row => row.client_id !== CLIENT_ID && referencesOwnedRecord(row, ownedIds)))
      fail('another client references a Prestige-owned record.');
  }

  const backup = copy(source), db = copy(source), inventory = {};
  for (const [kind, rows] of Object.entries(db)) {
    if (!Array.isArray(rows) || SHARED_ARRAYS.includes(kind)) continue;
    inventory[kind] = rows.filter(row => row.client_id === CLIENT_ID).length;
    db[kind] = rows.filter(row => row.client_id !== CLIENT_ID);
  }
  const clientMaps = ['drafts', 'ai_intake', 'ai_counters', 'riskSequences'];
  for (const key of [...clientMaps, 'baselines']) {
    if (db[key] && Object.entries(db[key]).some(([id, value]) => id !== CLIENT_ID && referencesOwnedRecord(value, ownedIds)))
      fail('another client references Prestige-owned records in ' + key + '.');
  }
  for (const key of clientMaps) {
    if (db[key]) delete db[key][CLIENT_ID];
  }
  for (const key of ['guided_assessment_pilot', 'guided_assessment_history']) {
    if (!db[key]) continue;
    db[key] = Object.fromEntries(Object.entries(db[key]).filter(([id, row]) => {
      const ownedKey = [...assessmentIds].some(assessmentId => id.startsWith(assessmentId + ':'));
      if (ownedKey && row.client_id && row.client_id !== CLIENT_ID) fail(key + ' has conflicting ownership.');
      if (!ownedKey && assessmentIds.has(row.assessment_id)) fail(key + ' has an inconsistent assessment key.');
      if (row.client_id === CLIENT_ID && row.assessment_id && !assessmentIds.has(row.assessment_id))
        fail(key + ' has a foreign assessment.');
      return !ownedKey && row.client_id !== CLIENT_ID;
    }));
  }
  for (const key of ['create_requests', 'vendor_action_requests', 'command_requests']) {
    if (!db[key]) continue;
    db[key] = Object.fromEntries(Object.entries(db[key]).filter(([scope, row]) => {
      let parts;
      try { parts = JSON.parse(scope); } catch { fail('unreadable ' + key + ' scope.'); }
      if (!Array.isArray(parts)) fail('invalid ' + key + ' scope.');
      if (parts[1] === CLIENT_ID && row.client_id && row.client_id !== CLIENT_ID)
        fail('conflicting ' + key + ' scope.');
      if (parts[1] !== CLIENT_ID && (row.client_id === CLIENT_ID || referencesOwnedRecord(row, ownedIds)))
        fail('foreign ' + key + ' references Prestige-owned records.');
      return parts[1] !== CLIENT_ID;
    }));
  }
  if (db.portfolio_reporting) {
    for (const key of ['snapshots', 'identities', 'scope_events', 'source_refresh_proofs']) {
      const rows = db.portfolio_reporting[key];
      if (!rows) continue;
      if (rows.some(row => !ownsProgram(row) && referencesOwnedRecord(row, ownedIds)))
        fail('another Portfolio program references Prestige-owned records.');
      for (const row of rows.filter(ownsProgram)) {
        if (row.client_id && row.client_id !== CLIENT_ID
          || row.program_id && !row.program_id.startsWith(CLIENT_ID + ':'))
          fail('conflicting Portfolio program ownership.');
      }
      db.portfolio_reporting[key] = rows.filter(row => !ownsProgram(row));
    }
    if (db.portfolio_reporting.activity_proofs) {
      if (Object.entries(db.portfolio_reporting.activity_proofs)
        .some(([id, value]) => !ownedIds.has(id) && referencesOwnedRecord(value, ownedIds)))
        fail('another activity proof references Prestige-owned records.');
      for (const id of ownedIds) delete db.portfolio_reporting.activity_proofs[id];
    }
  }

  const baseline = {version: 3, step: 0, completed: false, updated_at: null,
    policies: {}, selected_policy_keys: [], requirements: {}, reviews: [], framework_reviews: {}};
  db.baselines = {...db.baselines, [CLIENT_ID]: baseline};
  const preparedClient = db.clients.find(row => row.client_id === CLIENT_ID);
  delete preparedClient.initial_program_baseline;
  preparedClient.onboarding_baseline = copy(baseline);
  return {db, backup, clientId: CLIENT_ID, anchor: ANCHOR, inventory, removedRecordIds};
}
