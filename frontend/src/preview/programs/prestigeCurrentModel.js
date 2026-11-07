import {stable} from '../commandRequests';
import {cisDemoFixtureDates} from '../cisDemoFixtureDates';
import {baselineRecordVersions, saveBaseline} from '../baseline';
import {frameworkRequest, prepareGuidedContext} from '../frameworks';
import {eligible} from '../assignmentEligibility';
import {now} from '../store';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {PRESTIGE_POLICY_DOCUMENT_FACTS, PRESTIGE_GOVERNANCE_REVIEW_FACTS,
  prestigeGovernanceOnboardingState, createPrestigeCurrentGovernance} from './prestigeCurrentGovernance';
import {PRESTIGE_VENDOR_FACTS, PRESTIGE_RISK_FACTS, PRESTIGE_AI_FACTS,
  createPrestigeCurrentRegisters} from './prestigeEightYearRegisters';
import {PRESTIGE_CURRENT_ASSESSMENTS, PRESTIGE_CURRENT_QUESTION_VERSION,
  preparePrestigeCurrentAssessment} from './prestigeEightYearContent';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const START = '2018-11-02T00:00:00.000Z', VERSION = 'prestige-current-model-v1';
const MARKER = 'prestige_current_model_fixture';
const GOVERNANCE = 'prestige_current_governance_fixture', REGISTERS = 'prestige_current_register_fixture';
const ASSESSMENT_ACTOR = 'demo_prestige_user_0';
const copy = value => JSON.parse(JSON.stringify(value));
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('Private Prestige current model: ' + message); };

async function digest(value) {
  if (!globalThis.crypto?.subtle) fail('native Web Crypto is required for source provenance.');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function preparationIdentity(prepared) {
  return {clientId: prepared.clientId, anchor: prepared.anchor,
    inventory: prepared.inventory, removedRecordIds: prepared.removedRecordIds};
}

function withoutReceipt(db) {
  const result = copy(db);
  delete result[MARKER];
  return result;
}

function sourceIntent() {
  return {version: VERSION, client_id: CID, start: START, anchor: ANCHOR,
    policies: PRESTIGE_POLICY_DOCUMENT_FACTS, reviews: PRESTIGE_GOVERNANCE_REVIEW_FACTS,
    vendors: PRESTIGE_VENDOR_FACTS, risks: PRESTIGE_RISK_FACTS, ai: PRESTIGE_AI_FACTS,
    question_version: PRESTIGE_CURRENT_QUESTION_VERSION, content: PRESTIGE_CURRENT_ASSESSMENTS,
    assessment_actor_id: ASSESSMENT_ACTOR, blocked_populations: ['C09-chains']};
}

function validateEnvelope(prepared, clock, purpose, expectedSourceHash) {
  if (purpose !== 'current_model_source_qa' || !clock || cisDemoFixtureDates(clock).anchor !== ANCHOR)
    fail('the explicit source-only purpose and frozen source day are required.');
  if (!object(prepared) || prepared.clientId !== CID || prepared.anchor !== ANCHOR
    || !object(prepared.db) || !object(prepared.backup)
    || !object(prepared.inventory) || !object(prepared.removedRecordIds))
    fail('use the explicit canonical preparation envelope with its full original backup.');
  // A source operator must pin the original input; this is never an implicit visitor upgrade.
  if (typeof expectedSourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSourceHash))
    fail('pin the full original source SHA-256 before construction.');
  const original = prepared.backup;
  if ([MARKER, GOVERNANCE, REGISTERS].some(key => Object.hasOwn(original, key)))
    fail('an already assembled or partial source cannot be prepared again.');
  const ownedIds = new Set((original.framework_assessments || [])
    .filter(row => row.client_id === CID).map(row => row.framework_assessment_id));
  for (const key of ['guided_assessment_pilot', 'guided_assessment_history']) {
    if (Object.entries(original[key] || {}).some(([id, row]) => row?.client_id === CID
      || ownedIds.has(row?.assessment_id) || [...ownedIds].some(assessmentId => id.startsWith(assessmentId + ':'))))
      fail('retain visitor interview work; it is not a fresh source input.');
  }
}

function diagnostics(db) {
  const serialized = stable(withoutReceipt(db));
  return {native_counts: Object.fromEntries(Object.entries(db).filter(([, rows]) => Array.isArray(rows))
    .map(([kind, rows]) => [kind, rows.filter(row => row?.client_id === CID).length])),
  source_interval: {start: START, end: ANCHOR}, raw_characters: serialized.length,
  raw_utf8_bytes: new TextEncoder().encode(serialized).length,
  boundaries: {full_history_constructed: false, evidence_materialized: false,
    browser_onboarding_proved: false, capacity_qualified: false, C09: 'unrecorded'}};
}

function result(prepared, db, manifest) {
  return {...copy(preparationIdentity(prepared)), db: copy(db), backup: copy(prepared.backup),
    manifest: copy(manifest), diagnostics: diagnostics(db)};
}

async function applyCurrentAssessments(db) {
  const originalActor = copy(db.user);
  const actor = db.users.find(row => row.user_id === ASSESSMENT_ACTOR);
  if (!actor || !eligible(actor, CID)) fail('retain the existing eligible assessment recorder.');
  const assessmentIds = {};
  db.user = copy(actor);
  try {
    const rows = db.framework_assessments.filter(row => row.client_id === CID);
    if (rows.length !== 38 || new Set(rows.map(row => row.definition_id)).size !== 38)
      fail('the unchanged 38-criterion baseline is required.');
    for (const row of rows) {
      if (row.framework_key !== 'soc-2' || row.status !== 'not_assessed')
        fail('current answers require untouched native baseline assessments.');
      const content = preparePrestigeCurrentAssessment(row.definition_id);
      const path = '/framework_assessments/' + row.framework_assessment_id;
      frameworkRequest(db, path, 'patch', {}, {...content.ownership,
        technology: content.technology, notes: content.notes,
        expected_last_assessed: row.last_saved ?? row.last_assessed ?? null});
      const context = await prepareGuidedContext(db, path + '/guided-assessment', 'get', {});
      const initial = frameworkRequest(db, path + '/guided-assessment', 'get', {}, {}, context);
      if (initial.version !== content.version) fail('review changed native interview versions before construction.');
      const draft = frameworkRequest(db, path + '/guided-assessment', 'put', {}, {
        version: content.version, answers: content.answers, narrative: content.result.narrative,
        result: content.result, summary_review: {version: content.version, answers: content.answers},
        completed: true, step: 0, expected_revision: initial.revision,
        base_assessment_token: initial.current_assessment_token,
        base_scope_fingerprint: initial.current_scope_fingerprint}, context);
      // Refresh the trusted native context instead of manufacturing a scope/revision token.
      const saveContext = await prepareGuidedContext(db, path, 'patch', {guided_assessment_source: {}});
      const saved = frameworkRequest(db, path, 'patch', {}, {
        implementation: draft.narrative, status: draft.result.status, record_assessment: true,
        expected_last_assessed: row.last_saved ?? row.last_assessed ?? null,
        guided_assessment_source: {version: draft.version, revision: draft.revision, generated_at: draft.generated_at}}, saveContext);
      if (saved.status !== content.result.status || saved.framework_assessment_id !== row.framework_assessment_id)
        fail('native current assessment result or identity changed.');
      assessmentIds[row.definition_id] = saved.framework_assessment_id;
    }
  } finally {
    db.user = originalActor;
  }
  return assessmentIds;
}

function checkPreservation(db, fresh, clock, originalClients) {
  // Reuse the preparation boundary to remove only this client's generated slice.
  // It also rejects foreign inbound links rather than hiding them in a projection.
  const finalSource = withoutReceipt(db);
  delete finalSource[GOVERNANCE];
  delete finalSource[REGISTERS];
  const remaining = preparePrestigeNativeOnboarding(finalSource, {clock, purpose: 'native_onboarding_qa'});
  // Native commands can create these scoped containers; cleanup removes their rows, not the empty roots.
  // Reconcile only this comparison projection, retaining every originally present or nonempty map.
  for (const key of ['ai_intake', 'command_requests', 'guided_assessment_pilot']) {
    if (!Object.hasOwn(fresh.db, key) && object(finalSource[key])
      && object(remaining.db[key]) && Object.keys(remaining.db[key]).length === 0)
      delete remaining.db[key];
  }
  // Only the exact native CIS default may be removed from this comparison projection.
  if (!Array.isArray(fresh.db.clients) || !Array.isArray(remaining.db.clients))
    fail('client registries changed during source preservation.');
  const freshClients = fresh.db.clients.filter(row => row?.client_id === CID);
  const finalClients = remaining.db.clients.filter(row => row?.client_id === CID);
  if (originalClients.length !== 1 || freshClients.length !== 1 || finalClients.length !== 1)
    fail('the unique original client is required for source preservation.');
  const originalClient = originalClients[0], freshClient = freshClients[0], finalClient = finalClients[0];
  const hadSettings = Object.hasOwn(originalClient, 'framework_settings');
  const originalSettings = hadSettings ? originalClient.framework_settings : {};
  if (Object.hasOwn(freshClient, 'framework_settings') !== hadSettings
    || hadSettings && stable(freshClient.framework_settings) !== stable(originalSettings))
    fail('original framework settings changed during source preparation.');
  let comparison = remaining.db;
  if ((!hadSettings || object(originalSettings)) && !Object.hasOwn(originalSettings, 'cis-ig1')
    && object(finalClient.framework_settings)
    && stable(finalClient.framework_settings) === stable({...originalSettings, 'cis-ig1': {implementation_group: 1}})) {
    const projectedClient = {...finalClient};
    if (hadSettings) projectedClient.framework_settings = copy(originalSettings);
    else delete projectedClient.framework_settings;
    comparison = {...remaining.db, clients: remaining.db.clients.map(row => row === finalClient ? projectedClient : row)};
  }
  if (stable(comparison) !== stable(fresh.db)) fail('foreign data, identity, source maps or unrelated settings changed.');
  const counts = diagnostics(db).native_counts;
  for (const [kind, count] of Object.entries({policies: 16, reviews: 101, vendors: 23, risks: 30,
    ai_systems: 4, framework_assessments: 38, organizational_controls: 0, evidence: 0})) {
    if ((counts[kind] || 0) !== count) fail('unexpected current subset count for ' + kind + '.');
  }
}

// Explicit disconnected source construction. No startup import, storage commit or visitor migration.
export async function createPrestigeCurrentModel(prepared, {clock, purpose, expected_source_sha256: expectedSourceHash} = {}) {
  validateEnvelope(prepared, clock, purpose, expectedSourceHash);
  const input = copy(prepared);
  const sourceHash = await digest(input.backup);
  if (sourceHash !== expectedSourceHash) fail('the original source no longer matches its admitted fingerprint.');
  const factsHash = await digest(sourceIntent());
  const preparationHash = await digest(preparationIdentity(input));
  const prior = input.db[MARKER];
  // Child receipts describe earlier stages. Never replay/re-sign them after assessment writes.
  if (prior) {
    const {receipt_sha256: receiptHash, ...receipt} = prior;
    if (prior.version !== VERSION || prior.client_id !== CID || prior.anchor !== ANCHOR
      || prior.source_sha256 !== sourceHash || prior.facts_sha256 !== factsHash
      || prior.preparation_sha256 !== preparationHash || receiptHash !== await digest(receipt)
      || prior.state_sha256 !== await digest(withoutReceipt(input.db))
      || input.manifest && stable(input.manifest) !== stable(prior))
      fail('terminal source, intent or provenance changed; refusing a mismatched retry.');
    return result(input, input.db, prior);
  }
  if (input.manifest || input.db[GOVERNANCE] || input.db[REGISTERS])
    fail('partial child construction is not an aggregate retry.');
  // Snapshot the pinned source before the preparation helper or native writes.
  if (!Array.isArray(input.backup.clients)) fail('the original client registry is required for source preservation.');
  const originalClients = copy(input.backup.clients.filter(row => row?.client_id === CID));
  const fresh = preparePrestigeNativeOnboarding(input.backup, {clock, purpose: 'native_onboarding_qa'});
  if (stable(preparationIdentity(input)) !== stable(preparationIdentity(fresh)) || stable(input.db) !== stable(fresh.db))
    fail('the prepared source was edited or already finalized; preserve that work separately.');
  // The entry snapshot keeps these native writes isolated from the caller.
  const db = input.db;
  saveBaseline(db, CID, prestigeGovernanceOnboardingState(), true, {
    expected_updated_at: db.baselines?.[CID]?.updated_at ?? null,
    expected_records: baselineRecordVersions(db, CID)});
  const governance = await createPrestigeCurrentGovernance({...input, db}, {clock, purpose: 'current_governance_source_qa'});
  const registers = await createPrestigeCurrentRegisters({...input, db: governance.db}, {clock, purpose: 'current_register_source_qa'});
  const assessmentIds = await applyCurrentAssessments(registers.db);
  checkPreservation(registers.db, fresh, clock, originalClients);
  const manifest = {version: VERSION, client_id: CID, anchor: ANCHOR,
    scope: 'current_governance_registers_and_guided_assessments_only', actor_id: registers.db.user.user_id,
    assessment_actor_id: ASSESSMENT_ACTOR, source_sha256: sourceHash, facts_sha256: factsHash,
    preparation_sha256: preparationHash, policy_ids: copy(governance.manifest.policy_ids),
    review_ids: copy(governance.manifest.review_ids), vendor_ids: copy(registers.manifest.vendor_ids),
    risk_ids: copy(registers.manifest.risk_ids), ai_ids: copy(registers.manifest.ai_ids), assessment_ids: assessmentIds,
    child_receipts: {governance: copy(governance.manifest), registers: copy(registers.manifest)},
    blocked_populations: ['C09-chains'], deferred: ['organizational_controls_and_observations', 'eight_year_history',
      'material_evidence', 'two_additional_organization_reviews', 'browser_and_release_acceptance'],
    recorded_at: now(), state_sha256: await digest(withoutReceipt(registers.db))};
  manifest.receipt_sha256 = await digest(manifest);
  registers.db[MARKER] = copy(manifest);
  return result(input, registers.db, manifest);
}
