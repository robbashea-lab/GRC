import facts from './prestigeCurrentControlFacts.json';
import {stable} from '../commandRequests';
import {organizationalControlRequest} from '../organizationalControls';
import {socConfiguration} from '../../lib/socReadiness';

const CID = 'demo_prestige', VERSION = 'prestige-current-control-designs-v1';
const MARKER = 'prestige_current_control_designs_fixture';
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Prestige Control fixture: ' + message); };
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function withoutReceipt(db) { const result = copy(db); delete result[MARKER]; return result; }

function boundId(db, map, key, kind, field) {
  const id = map?.[key];
  if (typeof id !== 'string' || db[kind].filter(row => row.client_id === CID && row[field] === id).length !== 1)
    fail('resolve one actual same-client ' + kind + ' binding for ' + key + '.');
  return id;
}

// Design creation is a separate stage: no operating observation or file availability is inferred.
export async function createPrestigeCurrentControlDesigns(current, {clock, purpose} = {}) {
  if (purpose !== 'current_control_designs_source_qa' || !clock
    || new Date(clock).toISOString().slice(0, 10) !== facts.anchor.slice(0, 10)
    || current?.clientId !== CID || current.anchor !== facts.anchor || !current.backup
    || current.manifest?.version !== 'prestige-current-model-v1' || current.manifest.client_id !== CID)
    fail('use the actual current-model envelope and fixed scenario day.');
  const db = copy(current.db);
  const client = db.clients.filter(row => row.client_id === CID);
  const categories = client.length === 1 ? socConfiguration(client[0]).categories : [];
  if (client.length !== 1 || client[0].environment !== 'Demo' || client[0].status !== 'active'
    || categories.length !== 3 || !['security', 'availability', 'confidentiality'].every(key => categories.includes(key))
    || db.user?.workspace_mode !== 'demo' || !['super_admin', 'platform_admin'].includes(db.user.role))
    fail('retain the active canonical Demo client, selected scope and native administrator.');
  const factsHash = await digest(facts), prior = db[MARKER];
  const {receipt_sha256: modelReceiptHash, ...modelReceipt} = current.manifest;
  if (modelReceiptHash !== await digest(modelReceipt)) fail('the current-model ID manifest changed.');
  if (prior) {
    const {receipt_sha256: receiptHash, ...receipt} = prior;
    if (prior.version !== VERSION || prior.client_id !== CID || prior.facts_sha256 !== factsHash
      || receiptHash !== await digest(receipt) || prior.state_sha256 !== await digest(withoutReceipt(db))
      || current.controlsManifest && stable(current.controlsManifest) !== stable(prior))
      fail('Control-stage input changed; refuse a mismatched retry.');
    return {...copy(current), db, controlsManifest: copy(prior)};
  }
  if ((db.organizational_controls || []).some(row => row.client_id === CID))
    fail('preserve existing Controls instead of overwriting their designs or observations.');
  const assessmentRows = db.framework_assessments.filter(row => row.client_id === CID);
  if (assessmentRows.length !== 38 || assessmentRows.some(row => row.framework_key !== 'soc-2'))
    fail('retain all 38 enrolled native SOC criteria.');
  const inputHash = await digest(db), controlIds = {};
  // Migrate through the native operation; current fresh criteria contain no legacy Control designs.
  const migration = organizationalControlRequest(db, ['organizational-controls', 'migrate'], 'post', {}, {client_id: CID});
  if (migration.created !== 0) fail('legacy Control work requires a separate reconciliation.');
  for (const fact of facts.controls) {
    const assessmentIds = fact.criterion_ids.map(key =>
      boundId(db, current.manifest.assessment_ids, key, 'framework_assessments', 'framework_assessment_id'));
    if (assessmentIds.some((id, index) => assessmentRows.find(row => row.framework_assessment_id === id)?.definition_id !== fact.criterion_ids[index]))
      fail('criterion contribution identities do not match their native definitions.');
    const links = [
      ...fact.links.policy_fact_keys.map(key => ({kind: 'policies', id: boundId(db, current.manifest.policy_ids, key, 'policies', 'policy_id')})),
      ...fact.links.review_plan_keys.map(key => ({kind: 'reviews', id: boundId(db, current.manifest.review_ids, key, 'reviews', 'review_id')})),
      ...fact.links.vendor_fact_keys.map(key => ({kind: 'vendors', id: boundId(db, current.manifest.vendor_ids, key, 'vendors', 'vendor_id')})),
    ];
    const row = organizationalControlRequest(db, ['organizational-controls'], 'post', {}, {
      client_id: CID, request_id: fact.request_id, ...copy(fact.design),
      assessment_ids: assessmentIds, related_links: links,
    });
    controlIds[fact.key] = row.control_id;
  }
  const manifest = {version: VERSION, client_id: CID, anchor: facts.anchor,
    facts_sha256: factsHash, input_sha256: inputHash, control_ids: controlIds,
    source_model_receipt_sha256: current.manifest.receipt_sha256,
    state_sha256: await digest(db), observations_recorded: 0,
    limitation: 'Operating populations require substantive workpapers and actual historical-stage bindings before recording.'};
  manifest.receipt_sha256 = await digest(manifest);
  db[MARKER] = copy(manifest);
  return {...copy(current), db, controlsManifest: manifest};
}
