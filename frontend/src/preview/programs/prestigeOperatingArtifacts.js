import controlSource from './prestigeCurrentControlFacts.json';
import {stable} from '../commandRequests';
import {DEMO_FILE_LIMIT, DEMO_INLINE_LIMIT} from '../../lib/demoStorageErrors';
import {occurrenceId, scheduledDate} from '../../lib/reviewOccurrences';
import {evidenceKind, evidenceSources} from '../../lib/evidenceReferences';
import {PRESTIGE_CURRENT_ASSESSMENTS} from './prestigeEightYearContent';
import {PRESTIGE_EIGHT_YEAR_PLAN as scenario} from './prestigeEightYear';
import {PRESTIGE_POLICY_DOCUMENT_FACTS, PRESTIGE_GOVERNANCE_REVIEW_FACTS, PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY} from './prestigeCurrentGovernance';
import {PRESTIGE_VENDOR_FACTS, PRESTIGE_RISK_FACTS, PRESTIGE_AI_FACTS} from './prestigeEightYearRegisters';

// Disconnected source content: importing this module never installs records or recovers files.
const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const VERSION = 'prestige-operating-artifacts-v1', MODEL_VERSION = 'prestige-current-model-v1';
const PLANNING_SHA256 = '7983245609dcfd350c95e1ecfc743f29e360041d45e9f03d653eab108157f17b';
const copy = value => JSON.parse(JSON.stringify(value));
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('Prestige operating artifacts: ' + message); };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Authored fictional design/population intent; these are never submitted as native API requests.
export const PRESTIGE_OPERATING_CONTROL_FACTS = freeze(controlSource.controls.map(control => ({
  key: control.key, create_request_id: control.request_id, ...control.design,
  criteria: copy(control.criterion_ids), bindings: copy(control.links),
  populations: copy(control.populations),
})));

const BUNDLES = freeze([
  {key: 'pw-foundation-2018', date: '2018-11-02', title: 'Foundation boundary and commitments', chains: [],
    subjects: ['Initial account and asset inventory', 'Information Security version 1', 'Customer commitments and responsibilities']},
  {key: 'pw-named-access-2019', date: '2019-10-18', title: 'Named-access exception and separate validation', chains: ['SHARED-ACCESS'],
    subjects: ['Shared delivery credentials', 'Named project grants and expiring links', 'Correction and independent validation remain separate']},
  {key: 'pw-contractors-2020', date: '2020-10-23', title: 'Contractor end-date and session revocation', chains: ['CONTRACTOR-REMOVAL'],
    subjects: ['Sponsored end-date exception', 'Connected, direct and retained-session removal', 'Separate validation and retained closure']},
  {key: 'pw-recovery-delivery-2021', date: '2021-10-22', title: 'Recovery dependency and delivery follow-through', chains: ['RECOVERY-DEPENDENCY'],
    subjects: ['Original missed dependency', 'Correction and fresh retest', 'Delivery, rollback and monitoring disposition']},
  {key: 'pw-readiness-2022', date: '2022-10-21', title: 'Internal readiness and retained document context', chains: [],
    subjects: ['Internal readiness, not a CPA report', 'Distinct supplier review, assurance and contract events', 'Unnumbered 2022 Policy revisions remain unresolved']},
  {key: 'pw-migration-exceptions-2023', date: '2023-11-17', title: 'Migration exceptions retained separately',
    chains: ['MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY'],
    subjects: ['Excess migration-role scope', 'Customer retention tags', 'Omitted rights-search recovery index']},
  {key: 'pw-migration-validation-2024', date: '2024-10-18', title: 'Corrective completion and fresh validation',
    chains: ['MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY'],
    subjects: ['Completed corrective Actions', 'Subsequent independent access, retention and recovery validation', 'Finding closure follows validation']},
  {key: 'pw-service-ai-2025', date: '2025-10-17', title: 'Customer service and assisted-work boundaries', chains: [],
    subjects: ['Customer commitments and media handling', 'Human review of creative and code-assistant contributions', 'Distinct annual operating outcomes']},
  {key: 'pw-current-criteria-2026', date: '2026-11-02', title: 'Current criterion and operating-workpaper index', chains: []},
  {key: 'pw-policy-versions-current', date: '2026-11-02', title: 'Supporting Policy versions and procedure operation', chains: []},
  {key: 'pw-risk-decisions-current', date: '2026-11-02', title: 'Risk decisions and retained chain reconciliation',
    chains: ['SHARED-ACCESS', 'CONTRACTOR-REMOVAL', 'RECOVERY-DEPENDENCY', 'MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY']},
  {key: 'pw-vendor-events-current', date: '2026-11-02', title: 'Supplier events and input quality', chains: []},
  {key: 'pw-ai-screening-current', date: '2026-11-02', title: 'AI screening, provider dependencies and permitted inputs', chains: []},
  {key: 'pw-recovery-workpaper-current', date: '2026-11-02', title: 'Full-service recovery and operating inputs', chains: []},
]);

export const PRESTIGE_OPERATING_BUNDLE_KEYS = freeze(BUNDLES.map(bundle => bundle.key));
const POPULATION_BUNDLE = freeze({
  'C01-publication': 'pw-policy-versions-current', 'C01-concern': 'pw-policy-versions-current',
  'C03-competence': 'pw-policy-versions-current', 'C04-inputs': 'pw-vendor-events-current',
  'C06-workshop': 'pw-risk-decisions-current', 'C07-changes': 'pw-risk-decisions-current',
  'C09-chains': 'pw-risk-decisions-current', 'C19-recovery': 'pw-recovery-workpaper-current',
  'C21-continuity': 'pw-recovery-workpaper-current', 'C22-suppliers': 'pw-vendor-events-current',
  'C23-capacity': 'pw-recovery-workpaper-current', 'C24-backups': 'pw-recovery-workpaper-current',
  'C25-intake': 'pw-risk-decisions-current', 'C25-disposal': 'pw-risk-decisions-current',
});
const CHAINS = freeze(['SHARED-ACCESS', 'CONTRACTOR-REMOVAL', 'RECOVERY-DEPENDENCY', 'MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY']);
const SOURCE_NOTE = 'Newly authored fictional DEMO workpaper. Operating dates, document availability and actual native recording are distinct. Not customer activity, a CPA report or an independent audit opinion.';
const EVALUATION_DAY = '2026-10-30';

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\u0000-\u001f]/.test(value))
    fail(label + ' must be a nonempty bounded string.');
  return value;
}

function day(value, label = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)
    fail(label + ' must be a valid literal calendar date.');
  return value;
}

function instant(value, label = 'instant') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !scheduledDate(value) || !Number.isFinite(Date.parse(value)))
    fail(label + ' must be an explicit recorded instant.');
  return value;
}

async function digest(value, raw = false) {
  if (!globalThis.crypto?.subtle) fail('native Web Crypto is required for immutable content provenance.');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw ? value : stable(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function nativeRow(db, kind, id) {
  requireText(id, kind + ' ID');
  const key = evidenceSources[kind]?.key;
  if (!key || !Array.isArray(db[kind])) fail('native collection unavailable: ' + kind);
  const rows = db[kind].filter(row => row?.[key] === id);
  if (rows.length !== 1 || rows[0].client_id !== CID) fail('native identity is missing, duplicated or outside Prestige: ' + kind);
  return rows[0];
}

function mappedRows(db, manifest, field, kind, keys) {
  const ids = manifest[field];
  if (!object(ids) || keys.some(key => !Object.hasOwn(ids, key))
    || Object.keys(ids).length !== keys.length || new Set(Object.values(ids)).size !== keys.length)
    fail('exact returned ' + field + ' map required.');
  return Object.fromEntries(keys.map(key => [key, nativeRow(db, kind, ids[key])]));
}

async function modelContext(model, expectedHash) {
  if (!object(model) || model.clientId !== CID || model.anchor !== ANCHOR || !object(model.db)
    || !object(model.backup) || !object(model.manifest)) fail('use the returned canonical current-model envelope and backup.');
  const manifest = model.manifest, {receipt_sha256: receiptHash, ...receipt} = manifest;
  if (manifest.version !== MODEL_VERSION || manifest.client_id !== CID || manifest.anchor !== ANCHOR
    || manifest.scope !== 'current_governance_registers_and_guided_assessments_only'
    || !/^[a-f0-9]{64}$/.test(expectedHash || '') || receiptHash !== expectedHash || await digest(receipt) !== receiptHash)
    fail('current-model version, scope or admitted receipt changed.');
  const client = (model.db.clients || []).filter(row => row?.client_id === CID);
  if (client.length !== 1 || client[0].status !== 'active' || client[0].archived_at)
    fail('the unique active canonical client is required.');
  instant(manifest.recorded_at, 'model recording time'); requireText(manifest.actor_id, 'model recorder');
  const assessmentKeys = Object.keys(PRESTIGE_CURRENT_ASSESSMENTS);
  if (assessmentKeys.length !== 38) fail('review changed native criterion content before authoring.');
  const context = {db: model.db, manifest,
    assessments: mappedRows(model.db, manifest, 'assessment_ids', 'framework_assessments', assessmentKeys),
    policies: mappedRows(model.db, manifest, 'policy_ids', 'policies', PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => fact.key)),
    reviews: mappedRows(model.db, manifest, 'review_ids', 'reviews', PRESTIGE_GOVERNANCE_REVIEW_FACTS.map(fact => fact.plan_key)),
    vendors: mappedRows(model.db, manifest, 'vendor_ids', 'vendors', PRESTIGE_VENDOR_FACTS.map(fact => fact.key)),
    risks: mappedRows(model.db, manifest, 'risk_ids', 'risks', PRESTIGE_RISK_FACTS.map(fact => fact.key).concat(PRESTIGE_AI_FACTS.map(fact => fact.riskKey))),
    ai: mappedRows(model.db, manifest, 'ai_ids', 'ai_systems', PRESTIGE_AI_FACTS.map(fact => fact.key))};
  for (const [key, row] of Object.entries(context.assessments))
    if (row.framework_key !== 'soc-2' || row.definition_id !== key) fail('criterion ID does not match its returned native record.');
  return context;
}

function documentFacts(input) {
  if (!object(input) || Object.keys(input).length !== BUNDLES.length) fail('select all fourteen document versions and dates explicitly.');
  return Object.fromEntries(BUNDLES.map(bundle => {
    const fact = input[bundle.key];
    if (!object(fact)) fail('missing explicit document facts: ' + bundle.key);
    const date = day(fact.document_date, 'document date'), available = instant(fact.available_at, 'document available-at');
    if (date < bundle.date || available.slice(0, 10) < date)
      fail('document availability contradicts its source date.');
    return [bundle.key, {document_date: date, available_at: available,
      version: requireText(fact.version, 'document version'), provenance: 'explicit_new_fictional_document_selection'}];
  }));
}

function csv(rows) {
  const quote = value => {
    const text = String(value ?? '');
    return '"' + (/^[=+\-@\t\r\n]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"';
  };
  return ['record_type,key,subject,content_json', ...rows.map(row =>
    [row.type, row.key, row.subject, stable(row.value)].map(quote).join(','))].join('\r\n') + '\r\n';
}

async function materialize(bundle, content, documents) {
  const mime = bundle.key === 'pw-current-criteria-2026' || /-(versions|decisions|events|screening)-current$/.test(bundle.key)
    ? 'text/csv' : 'text/plain';
  const historical = !!bundle.subjects, {source_bindings: sourceBindings, ...body} = content;
  const document = {key: bundle.key, ...documents[bundle.key], source_as_of: historical ? documents[bundle.key].document_date : ANCHOR,
    recording_boundary: 'Document issuance is separate from fictional operating dates and actual native upload time'};
  const rows = [{type: 'document_version', key: bundle.key, subject: bundle.title, value: document}, ...content.rows];
  const text = mime === 'text/csv' ? csv(rows) : bundle.title + '\n\n' + SOURCE_NOTE + '\n\n'
    + JSON.stringify({document, ...body}, null, 2) + '\n';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  const contentBase64 = btoa(binary), payload = 'data:' + mime + ';base64,' + contentBase64;
  return {key: bundle.key, filename: bundle.key + (mime === 'text/csv' ? '.csv' : '.txt'), mime_type: mime,
    purpose: bundle.title, ...documents[bundle.key], source_event_date: bundle.date,
    framework_era: bundle.date < '2023-01-16' ? '2017 TSC; no claim of revised 2022 Points-of-Focus adoption'
      : '2017 TSC with revised 2022 Points of Focus adopted 2023-01-16',
    text, content_base64: contentBase64, sha256: await digest(text, true),
    decoded_file_bytes: bytes.length, payload_utf16_bytes: payload.length * 2,
    inline_eligible: bytes.length <= DEMO_INLINE_LIMIT, ordinary_upload_eligible: bytes.length <= DEMO_FILE_LIMIT,
    native_recording: null, binding_state: 'unbound_source', population_keys: content.population_keys,
    source_bindings: sourceBindings || null};
}

// No clock, native handler, storage commit or file-recovery route is called by either public function.
export async function createPrestigeOperatingArtifacts(currentModel, {
  purpose, expected_model_receipt_sha256: expectedHash, document_facts: documentsInput, historyManifest = null,
} = {}) {
  if (purpose !== 'operating_artifact_source_qa') fail('explicit disconnected source purpose required.');
  const context = await modelContext(currentModel, expectedHash), documents = documentFacts(documentsInput);
  if (historyManifest) {
    await verifyHistoryReceipt(historyManifest, expectedHash);
    context.history_occurrences = resolveRecurringHistory(context.db, historyManifest);
  }
  const actualSourceAt = [context.manifest.recorded_at, historyManifest?.recorded_at].filter(Boolean)
    .map(value => instant(value, 'source recording instant')).sort((left, right) => Date.parse(left) - Date.parse(right)).pop();
  for (const bundle of BUNDLES.filter(item => !item.subjects)) {
    const document = documents[bundle.key];
    if (Date.parse(document.available_at) < Date.parse(actualSourceAt) || document.document_date < actualSourceAt.slice(0, 10))
      fail('current source documents must be issued after their actual native source writes.');
  }
  const work = buildWorkpapers(context, historyManifest);
  validateWorkpaperCoverage(work);
  for (const source of work.sources) source.sha256 = await digest(source.content);
  const artifacts = [];
  for (const bundle of BUNDLES)
    artifacts.push(await materialize(bundle, bundleContent(bundle, context, work, historyManifest, documents[bundle.key]), documents));
  const ledger = volumeLedger(artifacts, work);
  const manifest = {version: VERSION, client_id: CID, anchor: ANCHOR, planning_sha256: PLANNING_SHA256,
    model_receipt_sha256: expectedHash, document_facts: documents,
    history_source_sha256: historyManifest ? await digest(historyManifest) : null,
    artifact_sha256: Object.fromEntries(artifacts.map(file => [file.key, file.sha256])),
    artifact_descriptor_sha256: Object.fromEntries(await Promise.all(artifacts.map(async file =>
      [file.key, await digest(descriptor(file))]))),
    workpaper_sha256: await digest(work), ledger_sha256: await digest(ledger),
    state: 'disconnected_materialized_source', native_writes: 0, capacity_qualified: false};
  manifest.receipt_sha256 = await digest(manifest);
  return {artifacts, workpapers: copy(work.populations), source_registry: copy(work.sources), ledger, manifest};
}

function descriptor(file) {
  return Object.fromEntries(Object.entries(file).filter(([key]) => !['text', 'content_base64'].includes(key)));
}

async function verifyHistoryReceipt(history, modelHash) {
  if (!object(history)) fail('returned historical receipt required.');
  const {receipt_sha256: receiptHash, ...receipt} = history;
  if (history.client_id !== CID || history.model_receipt_sha256 !== modelHash
    || history.provenance !== 'newly_authored_synthetic_history' || receiptHash !== await digest(receipt))
    fail('historical source receipt, model or provenance changed.');
}

function resolveRecurringHistory(db, history) {
  const ids = history.recurring_occurrence_ids;
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) fail('returned historical occurrence IDs must be an exact unique list.');
  return ids.map(id => {
    requireText(id, 'declared archived occurrence ID');
    const matches = [];
    for (const review of db.reviews || []) {
      if (review.client_id !== CID) continue;
      for (const occurrence of review.occurrences || [])
        if (occurrence.occurrence_id === id) matches.push({review, occurrence});
    }
    if (matches.length !== 1) fail('every declared historical occurrence must resolve uniquely before source selection.');
    const {review, occurrence} = matches[0];
    nativeRow(db, 'reviews', review.review_id);
    if (occurrence.status !== 'completed' || !scheduledDate(occurrence.due_date)
      || !occurrence.outcome || typeof occurrence.outcome !== 'string'
      || Date.parse(instant(occurrence.completed_at, 'archived completion')) > Date.parse(ANCHOR)
      || Date.parse(occurrence.completed_at) < Date.parse('2018-11-02T00:00:00.000Z'))
      fail('declared archived occurrence must retain a completed in-interval native outcome and original due date.');
    return {review, occurrence};
  });
}

function exactMap(value, keys, label) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    fail('exact ' + label + ' map required.');
  return value;
}

function reviewOccurrence(db, id, oid) {
  const review = nativeRow(db, 'reviews', id);
  requireText(oid, 'actual Review occurrence ID');
  const snapshots = (review.occurrences || []).filter(row => row.occurrence_id === oid);
  if (snapshots.length > 1) fail('duplicated Review occurrence.');
  const occurrence = snapshots[0] || (occurrenceId(review) === oid ? review : null);
  if (!occurrence) fail('actual Review occurrence is missing.');
  return {review, occurrence};
}

function subjectReference(db, input, document) {
  if (!object(input) || Object.keys(input).some(key => !['kind', 'id', 'occurrence_id'].includes(key))
    || !evidenceSources[input.kind] || input.kind === 'organizational_controls')
    fail('Evidence subject must use supported native identity fields.');
  const row = nativeRow(db, input.kind, input.id);
  if (input.kind !== 'reviews') {
    if (input.occurrence_id != null) fail('only Review subjects have occurrence IDs.');
    return {kind: input.kind, id: input.id};
  }
  const {occurrence} = reviewOccurrence(db, input.id, input.occurrence_id);
  if (occurrence.status === 'cancelled') fail('cancelled Review occurrence cannot acquire this source.');
  if (occurrence.status === 'completed') {
    const completed = instant(occurrence.completed_at, 'completed Review instant');
    if (Date.parse(document.available_at) > Date.parse(completed))
      fail('later-issued source cannot become contemporaneous evidence of a completed period.');
  }
  return {kind: input.kind, id: row.review_id, occurrence_id: input.occurrence_id};
}

function validateHistory(db, history, sourceHash, model) {
  if (!object(history) || history.client_id !== CID || !object(history.chains)
    || Object.keys(history.chains).length !== CHAINS.length || !sourceHash)
    fail('actual returned six-chain historical manifest required before binding.');
  for (const field of ['finding_id', 'task_id', 'risk_id', 'review_id', 'occurrence_id', 'validation_review_id', 'validation_occurrence_id'])
    if (new Set(CHAINS.map(key => history.chains[key]?.[field])).size !== CHAINS.length)
      fail('six historical chains require distinct actual ' + field + ' identities.');
  return Object.fromEntries(CHAINS.map(key => {
    const chain = history.chains[key];
    if (!object(chain) || chain.provenance !== 'newly_authored_synthetic_history') fail('historical chain provenance changed.');
    const times = ['failure', 'action_due', 'action_completed', 'validation', 'finding_closed'].map(field =>
      Date.parse(instant(chain[field], 'historical ' + field)));
    if (!(times[0] <= times[1] && times[0] <= times[2] && times[2] < times[3] && times[3] < times[4])
      || times[4] > Date.parse(ANCHOR)) fail('historical stages must retain their distinct ordered dates.');
    const finding = nativeRow(db, 'findings', chain.finding_id), task = nativeRow(db, 'tasks', chain.task_id);
    const risk = nativeRow(db, 'risks', chain.risk_id);
    const failed = reviewOccurrence(db, chain.review_id, chain.occurrence_id);
    const validation = reviewOccurrence(db, chain.validation_review_id, chain.validation_occurrence_id);
    if (chain.review_id === chain.validation_review_id || chain.occurrence_id === chain.validation_occurrence_id
      || failed.occurrence.status !== 'completed' || failed.occurrence.completed_at !== chain.failure
      || validation.occurrence.status !== 'completed' || validation.occurrence.completed_at !== chain.validation)
      fail('separate failed and fresh validation Review occurrences must match their actual stages.');
    for (const archive of [failed.review, validation.review])
      if (archive.historical_risk_id !== chain.risk_id || archive.risk_id
        || !(archive.related_links || []).some(link => link.kind === 'risks' && link.id === chain.risk_id))
        fail('historical Review must use the retained Risk reference without duplicating its native Risk Review parent.');
    for (const row of [finding, task]) {
      if (row.review_id !== chain.review_id || row.occurrence_id !== chain.occurrence_id)
        fail('historical Finding/Action does not belong to its returned Review occurrence.');
      if (row.recorded_at !== chain.recorded_at || row.recorded_by !== chain.recorded_by)
        fail('historical actual import provenance changed.');
    }
    if (task.finding_id !== finding.finding_id || task.source_type !== 'finding' || task.source_id !== finding.finding_id
      || finding.primary_task_id !== task.task_id || finding.risk_id !== chain.risk_id || task.risk_id !== chain.risk_id)
      fail('historical corrective Action, Finding and Risk relationships changed.');
    if (finding.status !== 'closed' || task.status !== 'done' || finding.created_at !== chain.failure
      || task.created_at !== chain.failure || finding.due_date !== chain.action_due.slice(0, 10)
      || task.due_date !== chain.action_due.slice(0, 10) || task.completed_at !== chain.action_completed
      || task.completion_date !== chain.action_completed || finding.validated_at !== chain.validation
      || finding.closed_at !== chain.finding_closed)
      fail('actual historical lifecycle or retained stage date changed.');
    const validator = PRESTIGE_OPERATING_CONTROL_FACTS.find(fact => fact.key === 'C09').owner_id;
    const engineer = PRESTIGE_OPERATING_CONTROL_FACTS.find(fact => fact.key === 'C19').owner_id;
    if (finding.validated_by !== validator || finding.closed_by !== validator || task.completed_by !== engineer)
      fail('historical corrective performer and independent decision actors changed.');
    for (const [action, at, actor] of [['validated', chain.validation, finding.validated_by], ['closed', chain.finding_closed, finding.closed_by]]) {
      requireText(actor, 'historical decision actor');
      const decisions = (finding.decision_history || []).filter(item => item.action === action && item.at === at);
      if (decisions.length !== 1 || decisions[0].by !== actor || !decisions[0].rationale
        || decisions[0].recorded_at !== chain.recorded_at || decisions[0].recorded_by !== chain.recorded_by)
        fail('actual historical validation/closure decision must retain its actor and rationale.');
    }
    for (const [kind, id] of [['findings', finding.finding_id], ['tasks', task.task_id]])
      if (!(risk.related_links || []).some(link => link.kind === kind && link.id === id))
        fail('Risk must retain its actual Finding and Action relationships.');
    instant(chain.recorded_at, 'historical actual recording instant'); requireText(chain.recorded_by, 'historical recorder');
    if (chain.recorded_by !== model.actor_id || Date.parse(chain.recorded_at) < Date.parse(model.recorded_at))
      fail('history must retain the current-model actual import actor and later recording time.');
    return [key, copy(chain)];
  }));
}

// This receipt verifies already-returned native records. It does not upload, patch, observe or persist them.
export async function bindPrestigeOperatingArtifacts(source, currentModel, {
  purpose, expected_source_receipt_sha256: expectedSource, control_ids: controlIds,
  control_revisions: revisions, evidence_ids: evidenceIds, evidence_versions: evidenceVersions,
  evidence_subjects: subjects, historyManifest, downloaded_content_base64: downloaded = {}, prior_manifest: prior,
} = {}) {
  if (purpose !== 'operating_artifact_binding_qa' || !object(source?.manifest)) fail('explicit native-binding purpose required.');
  const {receipt_sha256: receiptHash, ...receipt} = source.manifest;
  if (receiptHash !== expectedSource || !/^[a-f0-9]{64}$/.test(expectedSource || '')
    || await digest(receipt) !== receiptHash || receipt.version !== VERSION || receipt.client_id !== CID
    || receipt.state !== 'disconnected_materialized_source' || receipt.planning_sha256 !== PLANNING_SHA256)
    fail('pinned immutable source receipt changed.');
  const context = await modelContext(currentModel, receipt.model_receipt_sha256);
  await verifyHistoryReceipt(historyManifest, receipt.model_receipt_sha256);
  resolveRecurringHistory(context.db, historyManifest);
  if (await digest(historyManifest) !== receipt.history_source_sha256) fail('historical source was replaced after authoring.');
  const history = validateHistory(context.db, historyManifest, receipt.history_source_sha256, context.manifest);
  const work = {populations: source.workpapers, sources: source.source_registry};
  if (!Array.isArray(work.populations) || !Array.isArray(work.sources)) fail('complete source workpapers required.');
  validateWorkpaperCoverage(work);
  if (await digest(work) !== receipt.workpaper_sha256 || await digest(source.ledger) !== receipt.ledger_sha256)
    fail('workpaper or byte ledger changed.');
  const keys = PRESTIGE_OPERATING_BUNDLE_KEYS, controls = PRESTIGE_OPERATING_CONTROL_FACTS.map(row => row.key);
  exactMap(controlIds, controls, 'returned Control IDs'); exactMap(revisions, controls, 'current Control revisions');
  exactMap(evidenceIds, keys, 'returned Evidence IDs'); exactMap(evidenceVersions, keys, 'native Evidence versions');
  exactMap(subjects, keys, 'Evidence subject');
  if (!Array.isArray(source.artifacts) || source.artifacts.length !== keys.length
    || new Set(source.artifacts.map(file => file.key)).size !== keys.length
    || new Set(Object.values(evidenceIds)).size !== keys.length || new Set(Object.values(controlIds)).size !== controls.length)
    fail('each source file and Control needs one distinct returned native identity.');
  const files = [];
  for (const key of keys) {
    const file = source.artifacts.find(item => item.key === key), declared = receipt.document_facts[key];
    if (!file || file.sha256 !== receipt.artifact_sha256[key] || await digest(file.text, true) !== file.sha256
      || file.content_base64 !== btoa(Array.from(new TextEncoder().encode(file.text), byte => String.fromCharCode(byte)).join(''))
      || file.decoded_file_bytes !== new TextEncoder().encode(file.text).length
      || file.document_date !== declared.document_date || file.available_at !== declared.available_at || file.version !== declared.version
      || await digest(descriptor(file)) !== receipt.artifact_descriptor_sha256?.[key])
      fail('source bytes or document identity changed: ' + key);
    const row = (context.db.evidence || []).filter(item => item.evidence_id === evidenceIds[key]);
    if (row.length !== 1 || row[0].client_id !== CID) fail('Evidence identity missing, duplicated or foreign.');
    const native = row[0], actualBytes = downloaded[key] ?? native.content_base64;
    if (!Number.isInteger(evidenceVersions[key]) || evidenceVersions[key] < 1 || native.version !== evidenceVersions[key]
      || native.filename !== file.filename || native.mime_type !== file.mime_type || native.size !== file.decoded_file_bytes
      || native.sha256 !== file.sha256 || actualBytes !== file.content_base64)
      fail('native Evidence version, metadata or observed bytes changed: ' + key);
    const subject = subjects[key];
    if (!object(subject) || Object.keys(subject).some(field => !['primary', 'supporting'].includes(field))
      || !Array.isArray(subject.supporting)) fail('explicit primary and supporting Evidence subjects required.');
    const primary = subjectReference(context.db, subject.primary, file);
    const supporting = subject.supporting.map(item => subjectReference(context.db, item, file));
    if (evidenceKind(native.linked_type) !== primary.kind || native.linked_id !== primary.id
      || (native.occurrence_id || null) !== (primary.occurrence_id || null)) fail('native upload subject changed.');
    if (new Set(supporting.map(stable)).size !== supporting.length) fail('supporting subjects must be unique.');
    for (const link of supporting) if (!(native.relationships || []).some(item => item.kind === link.kind
      && item.id === link.id && (item.occurrence_id || null) === (link.occurrence_id || null)))
      fail('supporting Evidence relationship has not been natively installed.');
    if (file.source_bindings) validateHistoricalBindings(context.db, file.source_bindings, historyManifest, file);
    files.push({key, evidence_id: native.evidence_id, native_version: native.version, document_version: file.version,
      sha256: file.sha256, size: native.size, filename: native.filename, mime_type: native.mime_type,
      document_date: file.document_date, available_at: file.available_at, primary, supporting,
      native_recording: {created_at: instant(native.created_at, 'Evidence created-at'),
        uploaded_at: instant(native.uploaded_at, 'Evidence uploaded-at'), uploaded_by: requireText(native.uploaded_by, 'Evidence uploader')},
      observed_content_sha256: file.sha256, historical_source_bindings: file.source_bindings,
      policy_versions: [primary, ...supporting].filter(link => link.kind === 'policies')
        .map(link => ({policy_id: link.id, current_version: nativeRow(context.db, 'policies', link.id).version}))});
  }
  if (stable(volumeLedger(source.artifacts, work)) !== stable(source.ledger)) fail('file byte/volume totals changed.');
  const controlBindings = PRESTIGE_OPERATING_CONTROL_FACTS.map(fact => {
    const row = nativeRow(context.db, 'organizational_controls', controlIds[fact.key]);
    if (row.updated_at !== revisions[fact.key]) fail('Control changed before observation binding.');
    instant(row.updated_at, 'Control revision');
    for (const field of ['name', 'description', 'frequency', 'design', 'owner_id'])
      if (row[field] !== fact[field]) fail('Control design differs from admitted source: ' + fact.key);
    const expected = fact.criteria.map(key => context.manifest.assessment_ids[key]);
    if (stable([...(row.assessment_ids || [])].sort()) !== stable(expected.sort())) fail('Control criterion contributions changed.');
    const related = (row.related_links || []);
    if (related.some(link => Object.keys(link).some(field => !['kind', 'id'].includes(field))))
      fail('Control links only accept native kind/id fields.');
    for (const link of requiredControlLinks(fact, context.manifest, history)) {
      nativeRow(context.db, link.kind, link.id);
      if (!related.some(item => item.kind === link.kind && item.id === link.id))
        fail('required native Control relationship is missing: ' + fact.key + '/' + link.kind);
    }
    const populations = source.workpapers.filter(pop => pop.control_fact_key === fact.key);
    const fileKeys = [...new Set(populations.map(pop => POPULATION_BUNDLE[pop.key] || 'pw-current-criteria-2026'))];
    for (const key of fileKeys) if (!related.some(link => link.kind === 'evidence' && link.id === evidenceIds[key]))
      fail('finalize native Control Evidence relationships before recording operation.');
    return {control_fact_key: fact.key, control_id: row.control_id, control_revision: row.updated_at,
      evidence_ids: fileKeys.map(key => evidenceIds[key]), assessment_ids: expected,
      populations: populations.map(pop => ({key: pop.key, request_id: pop.request_id,
        period_start: pop.period_start, period_end: pop.period_end, count_unit: pop.count_unit,
        expected_instances: pop.expected_instances, collected_instances: pop.collected_instances,
        planned_operating: pop.planned_conclusion, notes: pop.bounded_evaluation_statement,
        observation_provenance: null, native_observation_state: 'unrecorded'}))};
  });
  const manifest = {version: VERSION, binding_version: 1, client_id: CID, source_receipt_sha256: receiptHash,
    model_receipt_sha256: receipt.model_receipt_sha256, history_source_sha256: receipt.history_source_sha256,
    files, controls: controlBindings, historical_chains: history, ledger_sha256: receipt.ledger_sha256,
    state: 'native_files_and_control_revisions_verified_before_observations', native_writes: 0,
    capacity_qualified: false};
  manifest.receipt_sha256 = await digest(manifest);
  if (prior && stable(prior) !== stable(manifest)) fail('retry intent or bound native revision changed.');
  return freeze(manifest);
}

function requiredControlLinks(fact, model, history) {
  const links = [];
  const add = (kind, id) => { requireText(id, 'resolved Control relationship'); links.push({kind, id}); };
  for (const key of fact.bindings.policy_fact_keys || []) add('policies', model.policy_ids[key]);
  for (const key of fact.bindings.review_plan_keys || []) add('reviews', model.review_ids[key]);
  for (const key of [...(fact.bindings.vendor_fact_keys || []), ...(fact.bindings.sample_vendor_fact_keys || [])])
    add('vendors', model.vendor_ids[key]);
  for (const key of fact.bindings.historical_context_risk_fact_keys || []) add('risks', model.risk_ids[key]);
  for (const slot of fact.bindings.historical_chain_slots || []) {
    const chain = history[slot.toUpperCase()];
    if (!chain) fail('actual historical Control chain slot is unresolved.');
    for (const [kind, field] of [['findings', 'finding_id'], ['tasks', 'task_id'], ['risks', 'risk_id'],
      ['reviews', 'review_id'], ['reviews', 'validation_review_id']]) add(kind, chain[field]);
  }
  return [...new Map(links.map(link => [stable(link), link])).values()];
}

function validateHistoricalBindings(db, bindings, history, file) {
  if (!bindings.milestone || !object(history.milestones)) fail('actual historical milestone binding required.');
  const saved = history.milestones[bindings.milestone.key];
  if (!saved || saved.review_id !== bindings.milestone.review_id || saved.occurrence_id !== bindings.milestone.occurrence_id)
    fail('actual historical milestone source changed.');
  const occurrences = [bindings.milestone, ...bindings.annual_occurrences];
  const allowed = new Set(history.recurring_occurrence_ids || []);
  for (const [index, link] of occurrences.entries()) {
    const {occurrence} = reviewOccurrence(db, link.review_id, link.occurrence_id);
    if (occurrence.status !== 'completed' || !occurrence.outcome || !occurrence.completed_at
      || Date.parse(occurrence.completed_at) > Date.parse(file.available_at)
      || (index > 0 && !allowed.has(link.occurrence_id))
      || stable(historicalSnapshot(occurrence)) !== stable(link.snapshot))
      fail('historical outcome source is absent, changed, future or outside the returned manifest.');
  }
  for (const link of bindings.policy_subjects) {
    const declared = history.policy_subjects?.[link.policy_fact_key]?.filter(subject => subject.subject_id === link.subject_id);
    const policy = nativeRow(db, 'policies', link.policy_id);
    if (declared?.length !== 1 || stable(declared[0]) !== stable(link.frozen_subject))
      fail('returned historical Policy subject changed.');
    const approvals = (policy.approval_history || []).filter(event => event.action === 'approved'
      && event.subject?.subject_id === link.subject_id && stable(event.subject) === stable(link.frozen_subject));
    if (approvals.length !== 1 || approvals[0].at !== link.effective_at)
      fail('actual frozen historical Policy approval subject is missing.');
  }
}

function historicalSnapshot(occurrence) {
  return Object.fromEntries(['status', 'due_date', 'completed_at', 'outcome', 'notes'].map(key => [key, occurrence[key] ?? null]));
}

const MONTHS = freeze(['2026-08-28', '2026-09-29', '2026-10-29']);
const INPUT_CLASSES = freeze(['Okta', 'AWS', 'GitHub', 'rights-retention', 'Datadog', 'Snyk', 'Jamf', 'provider-notices']);
const CHANGE_CASES = freeze([
  ['PORTAL-ROUTING', '2026-08-17', '2026-08-19', '2026-08-20', 'O08', 'Project routing and cross-project authorization'],
  ['CUSTOMER-TERMS', '2026-09-14', '2026-09-16', '2026-09-17', 'O19', 'Customer handling terms and proxy/master separation'],
  ['RETENTION', '2026-10-23', '2026-10-26', '2026-10-27', 'O33', 'Retention procedure and hold reconciliation'],
  ['PROVIDER-CONFIG', '2026-10-26', '2026-10-28', '2026-10-29', 'O34', 'Scoped secondary-copy credentials and destination permissions'],
]);
const BOUNDARY_CASES = freeze([
  ['B01', 'Public direct-origin administrative request', 'denied'],
  ['B02', 'Authenticated nonadministrator requests administration', 'denied'],
  ['B03', 'Administrator uses an unapproved route', 'denied'],
  ['B04', 'Authorized P01 licensed delivery', 'allowed within project scope, TLS and logging'],
  ['B05', 'P01 identity requests P02 media', 'denied'],
  ['B06', 'Expired delivery permission', 'denied'],
  ['B07', 'Scoped secondary-copy transfer', 'allowed to the approved protected destination'],
  ['B08', 'Backup identity targets an unapproved destination', 'denied'],
  ['B09', 'Authorized contractor proxy export', 'allowed within approved proxy scope'],
  ['B10', 'Contractor requests unsupported bulk/full-resolution export', 'denied'],
]);
const RECOVERY = freeze({
  key: 'PW26-REC-20261023', operating_date: '2026-10-23',
  start: '2026-10-23T14:00:00Z', recoverable_input: '2026-10-23T13:20:00Z',
  performer: 'Brennan Huff', service_acceptor: 'Dale Doback', service_accepted_at: '2026-10-23T17:10:00Z',
  evaluation_date: EVALUATION_DAY, recovery_minutes: 190, data_gap_minutes: 40,
  recovery_objective_minutes: 240, data_gap_objective_minutes: 1440,
  checkpoints: [
    ['14:00', 'Isolated boundary', 'Authorized recovery set and clean isolated target; no production/customer writes'],
    ['14:45', 'Media', 'Selected media manifest and integrity references match the recovery set'],
    ['15:20', 'PostgreSQL', 'Isolated instance uses the retained input set'],
    ['16:05', 'Rights and index', 'Metadata, index references and media agree; the old omitted-index failure is not reused'],
    ['16:40', 'Project access', 'Authorized context succeeds; cross-project and expired-rights cases deny'],
    ['17:00', 'Sample delivery', 'I07/I11 as-of-October23 contexts meet retained rights and handling rules'],
  ].map(([time, component, result]) => ({at: '2026-10-23T' + time + ':00Z', component, proposed_result: result})),
});
const INTAKES = freeze([
  ['I01', '2026-08-04', 'P01 pre-release editing plates', 'Confidential working media; named creative roles; external delivery waits for separate license authorization'],
  ['I02', '2026-08-11', 'P02 color-review proxies', 'Watermarked proxies, restricted contractor purpose, explicit end date and no full-resolution export'],
  ['I03', '2026-08-18', 'P03 subtitling review', 'Approved proxy scope and customer terms; independent release authority'],
  ['I04', '2026-08-25', 'Changed P01 territory/cut instructions', 'Pause disputed export; Nancy narrows authorized scope without granting broad entitlement'],
  ['I05', '2026-09-02', 'P02 royalty-support extract', 'Named restricted analytical purpose/destination; exclude public creative/AI briefs'],
  ['I06', '2026-09-10', 'P03 public-marketing brief', 'Remove confidential/customer input; an allowed-input boundary is not AI approval or execution'],
  ['I07', '2026-09-17', 'Changed P02 handling and retention', 'Separate proxies from licensed masters; project-close-plus45-day proxy rule applies only to this selected case'],
  ['I08', '2026-09-24', 'New P03 review-delivery version', 'Controlled recipient, watermark and expiry; no onward bulk delivery; distinct from prior expired export'],
  ['I09', '2026-10-02', 'P02 license reconciliation', 'Restricted metadata-only audience and supplier destination; no unrestricted media attachment'],
  ['I10', '2026-10-09', 'Changed P03 closeout instruction', 'Retain disputed material under hold; exclude it from routine destruction'],
  ['I11', '2026-10-16', 'P01 licensed final bundle', 'Selected master and rights basis for recovery and later broadcaster delivery; territory/expiry remain explicit'],
  ['I12', '2026-10-23', 'P02 archive export', 'Scoped expiring delivery, hold check and separate retained-master authority; no administrative rights transfer'],
  ['I13', '2026-10-28', 'Changed P03 contractor export', 'Retain approved proxies; remove unsupported full-resolution/destination scope; rights are distinct from account creation'],
]);

function buildWorkpapers(context, historyManifest) {
  const sources = new Map(), populations = [];
  const source = (key, available, content, eventKey = key) => {
    const value = {key, event_key: eventKey, version: 'fictional-source-v1',
      available_on: available.slice(0, 10), available_at: available.length > 10 ? available : null,
      provenance: 'newly_authored_fictional_workpaper_input', content};
    if (sources.has(key) && stable(sources.get(key)) !== stable(value)) fail('conflicting shared source version: ' + key);
    sources.set(key, value); return key;
  };
  const ref = (key, usedOn) => ({key, used_on: usedOn});
  const member = (key, date, subject, performer, inputs, checks, result, disposition, details = [], eventKey = key) => ({
    key, source_key: eventKey, operating_date: day(date), subject, business_performer: performer,
    input_refs: inputs, required_checks: checks, proposed_result: result, exception_disposition: disposition,
    detail_rows: details, detailed: false, evaluation_date: EVALUATION_DAY,
    business_evaluator: /Dale|Robert/.test(performer) ? 'Retained provider lead: independent internal challenge'
      : 'Dale Doback; retained provider lead challenges Dale/sponsor work',
  });
  const population = (key, rows, selected = rows.map(row => row.key)) => {
    const control = PRESTIGE_OPERATING_CONTROL_FACTS.find(item => item.populations.some(item => item.key === key));
    const fact = control?.populations.find(item => item.key === key);
    if (!fact) fail('unknown approved population: ' + key);
    rows.forEach(row => { row.detailed = selected.includes(row.key); });
    populations.push({key, control_fact_key: control.key, request_id: fact.request_id,
      count_unit: fact.count_unit, period_start: fact.period_start, period_end: fact.period_end,
      expected_instances: fact.expected_instances, collected_instances: rows.length,
      selected_member_keys: selected, selection_basis: selected.length === rows.length
        ? 'Complete specified population, with all cases distinguished'
        : 'Explicit risk-based detailed selection; all other memberships retain complete input/check/result rows',
      evaluation_date: EVALUATION_DAY, planned_conclusion: fact.operating,
      native_observation_state: 'unrecorded', bounded_evaluation_statement: fact.notes, members: rows});
  };
  const rowsForMonth = (populationKey, subject, components, checks, result) => MONTHS.map(date => {
    const key = 'PW26-' + populationKey.split('-')[0] + '-' + date.slice(0, 7).replace('-', '');
    return member(key, date, subject + ' / ' + date, 'Brennan Huff', [ref('PW26-SNAPSHOT-' + date, date)],
      checks, result, 'No unresolved exception in this selected fictional batch',
      components.map(component => ({component, source_version: 'PW26-SNAPSHOT-' + date,
        check: checks.join('; '), proposed_result: result})));
  });

  for (const date of MONTHS) source('PW26-SNAPSHOT-' + date, date,
    {source_classes: INPUT_CLASSES, purpose: 'Shared monthly input identity; different populations retain different checks'});
  for (const [key, pre, release, confirmation, releaseKey, subject] of CHANGE_CASES) {
    const event = 'PW26-CH-' + key;
    source(event + ':impact', pre, {subject, review: 'Customer, dependency, Risk and owner impact before acceptance'}, event);
    source(event + ':release', release, {subject, release_membership: 'PW26-REL-' + releaseKey,
      scope: 'Authorized scoped version with independent checks and rollback basis'}, event);
    source(event + ':confirmation', confirmation, {subject, check: 'Intended operation and denied excess scope confirmed'}, event);
  }
  source(RECOVERY.key, RECOVERY.service_accepted_at, RECOVERY);
  source('PW26-C02-OVERSIGHT-01', '2026-10-29', {roles: ['Robert', 'Dale', 'Brennan', 'Nancy', 'Derek', 'Alice'],
    challenges: ['Copy is not full recovery', 'AI inventory is not approval', 'Action Done is not validation', 'Sponsor conflict requires independent challenge']});
  for (const [key, subject, result] of BOUNDARY_CASES)
    source('PW26-C15-' + key, '2026-10-27', {subject, proposed_result: result});
  for (const [key, date, subject, decision] of INTAKES)
    source('PW26-C25-' + key, date, {subject, decision, change: ['I04', 'I07', 'I10', 'I13'].includes(key)});
  source('PW26-C16-response-01', '2026-10-26', {signal: 'Inert isolated-media exercise',
    sequence: ['Detect', 'Quarantine', 'Scope identity/device', 'Review credentials/sessions', 'Known-clean restoration', 'Verify authorized return']});
  source('PW26-C17-MISSING-20261028', '2026-10-28', {signal: 'Deliberate missing-source injection',
    disposition: 'Route, acknowledge and restore reporting; not a production incident'});
  source('PW26-BKV-20260914:failed-copy', '2026-09-14T13:20:00Z',
    {member: 'rights-index-copy', result: 'failed', alert_at: '2026-09-14T13:22:00Z'}, 'PW26-BKV-20260914');
  source('PW26-BKV-20260914:verified-rerun', '2026-09-14T13:50:00Z',
    {authorization_at: '2026-09-14T13:30:00Z', corrected_at: '2026-09-14T13:36:00Z',
      rerun_at: '2026-09-14T13:45:00Z', verified_at: '2026-09-14T13:50:00Z', accepted_at: '2026-09-14T13:55:00Z'},
    'PW26-BKV-20260914');

  const publication = [
    ['P01', '2026-10-23', 'Security 4.0', 'Responsibilities and escalation'],
    ['P02', '2026-10-23', 'Access 4.1', 'Direct, provider and project routes'],
    ['P03', '2026-10-23', 'Incident Response 4.0', 'Customer disclosure routing; operator brief before the recovery start'],
    ['P04', '2026-10-23', 'Backup 4.1', 'Media/database/index sequence; operator brief before the recovery start'],
    ['P05', '2026-10-26', 'Change 3.1', 'Emergency-change follow-up'],
    ['P06', '2026-10-26', 'Classification 3.2', 'Handling and public-AI boundary'],
    ['P07', '2026-10-27', 'Retention 4.0', 'Holds, versions and scoped disposal'],
  ].map(([key, date, version, scope]) => {
    const id = 'PW26-C01-' + key;
    source(id, date, {version, scope, attendance: 'Intended roles only; no all-staff claim'});
    const checks = ['Effective version', 'Intended-role receipt', 'Performed-task example', 'Escalation route'];
    return member(id, date, version + ' / ' + scope, 'Dale Doback', [ref(id, date)], checks,
      'Correct version and role-specific task/escalation explanation retained', 'No missing selected package',
      checks.map(check => ({check, version, proposed_result: scope + ' addressed for intended roles'})));
  });
  population('C01-publication', publication);
  source('PW26-C01-CONCERN-01', '2026-10-28', {case: 'Unresolved export rights and conflicted supervisor',
    scope: 'Exercise only; no actual misconduct or sent disclosure'});
  population('C01-concern', [member('PW26-C01-CONCERN-01', '2026-10-28', 'Confidential export concern', 'Derek Huff',
    [ref('PW26-C01-CONCERN-01', '2026-10-28')],
    ['Identify rights issue', 'Recognize conflict', 'Use bypass', 'Pause export', 'Obtain Nancy assessment', 'Record accountable disposition'],
    'Export remains paused until narrowed rights are confirmed', 'Exercise; no actual disclosure',
    ['Identify', 'Conflict', 'Bypass', 'Hold', 'Rights assessment', 'Disposition'].map(step => ({step, decision: 'Retain the authorized reporting and export boundary'})))]);
  population('C02-oversight', [member('PW26-C02-OVERSIGHT-01', '2026-10-29', 'Executive responsibilities and challenge', 'Robert Doback',
    [ref('PW26-C02-OVERSIGHT-01', '2026-10-29')], ['Six role/deputy confirmations', 'Four independent challenges'],
    'All four shortcuts rejected; authority and recusal decisions distinct', 'Provider challenge is internal, not a CPA opinion',
    ['Robert sponsor', 'Dale program', 'Brennan engineering', 'Nancy terms', 'Derek creative', 'Alice people',
      'Copy versus recovery', 'Inventory versus approval', 'Done versus validation', 'Sponsor conflict'].map(subject => ({subject,
      decision: 'Responsibility confirmed or shortcut rejected with accountable follow-through'})))]);

  const roleCases = [
    ['BRENNAN', '2026-10-23', 'Brennan Huff', 'Execute the complete restore, explain index dependency and hand over to Dale',
      ref(RECOVERY.key, '2026-10-23')],
    ['DALE', '2026-10-26', 'Dale Doback', 'Reject training case with Done Action but no independent validation', null],
    ['NANCY', '2026-10-27', 'Nancy Huff', 'Reject out-of-scope rights and identify the authorized deputy', null],
    ['DEREK', '2026-10-27', 'Derek Huff', 'Remove confidential material from a public-AI training brief', null],
    ['ALICE', '2026-10-28', 'Alice Huff', 'Reconcile connected, direct and retained-session removal', null],
    ['ROBERT', '2026-10-29', 'Robert Doback', 'Apply sponsor recusal and retain independent challenge',
      ref('PW26-C02-OVERSIGHT-01', '2026-10-29')],
  ];
  population('C03-competence', roleCases.map(([key, date, name, task, shared]) => {
    const id = 'PW26-C03-' + key; source(id, date, {name, task, deputy: 'Existing authorized business deputy, not a new account'});
    return member(id, date, name + ' practical role evaluation', name, [ref(id, date), ...(shared ? [shared] : [])],
      ['Performed task', 'Explain exception', 'Deputy/handover'], task + ' demonstrated', 'No additional restore or oversight event inferred',
      ['Task', 'Exception explanation', 'Deputy/handover'].map(check => ({check, demonstrated: task})));
  }));
  const inputs = rowsForMonth('C04-inputs', 'Decision-input reconciliation', INPUT_CLASSES,
    ['Completeness', 'Timeliness', 'Gaps', 'Accountable decision'], 'Input-class result retained with source identity');
  inputs[0].detail_rows.find(row => row.component === 'rights-retention').exception = 'Missing custodian identified and corrected before decision';
  inputs[1].detail_rows.find(row => row.component === 'provider-notices').deduplication = 'Duplicate representations resolve to one notice identity';
  inputs[2].detail_rows.find(row => row.component === 'rights-retention').trace = 'Handling input traced to the effective rule/change';
  population('C04-inputs', inputs);

  const communication = [
    ['COMMIT-01', '2026-08-12', 'Fictional customer term', 'Nancy routes the selected licensed-delivery term to the accountable recipient'],
    ['COMMIT-02', '2026-09-16', 'Fictional customer term change', 'Proxy/master and retention wording matches the selected customer scope'],
    ['NOTICE-01', '2026-08-19', 'Synthetic maintenance notice', 'Brennan and Nancy reconcile dependency and customer impact'],
    ['NOTICE-02', '2026-10-07', 'Synthetic backup-scope notice', 'Dale records provider versus Prestige duties and scoped follow-up'],
    ['CONCERN-01', '2026-08-25', 'Disputed rights/export request', 'Export paused for Nancy rights assessment'],
    ['CONCERN-02', '2026-10-14', 'Expired delivery link', 'Fresh authorization required; unsupported access denied'],
  ];
  population('C05-comms', communication.map(([key, date, subject, result]) => {
    const id = 'PW26-C05-' + key; source(id, date, {subject, result, authentic_provider_notice: false});
    return member(id, date, subject, 'Nancy Huff', [ref(id, date)], ['Recipient', 'Applicable term', 'Routing', 'Approved wording', 'Disposition'],
      result, 'No universal notification deadline or authentic provider notice asserted', [{recipient: 'Accountable customer/provider route',
        applicable_term: subject, approved_wording: result, disposition: result}]);
  }));

  const objectiveRows = [
    ['Portal availability', '99.9% objective, not measured uptime'], ['Project confidentiality', 'Authorized project/recipient scope'],
    ['Retention', 'Agreed handling and hold rules'], ['Recovery', '4h recovery / 24h data-loss objectives'],
  ].map(([subject, basis]) => ({subject, basis}));
  const riskRows = Object.entries(context.risks).map(([key, row]) => ({risk_fact_key: key, risk_id: row.risk_id,
    likelihood: row.likelihood, impact: row.impact, status: row.status, decision: row.treatment_plan || row.description || row.title}));
  const fraudRows = ['Forged licensee', 'Territory/expiry substitution', 'Payout redirection', 'Insider download', 'Management override']
    .map(subject => ({subject, decision: 'Separate rights/source checks, attributable decisions and escalation; no new Risk rating is forced'}));
  source('PW26-C06-WORKSHOP-01', '2026-10-27', {objectives: objectiveRows, fraud_scenarios: fraudRows});
  population('C06-workshop', [member('PW26-C06-WORKSHOP-01', '2026-10-27', 'Objectives, 30 current Risks and fraud', 'Dale Doback',
    [ref('PW26-C06-WORKSHOP-01', '2026-10-27')], ['Objectives', 'Native Risk decisions', 'Fraud', 'Control rationale'],
    'Robert sponsors objectives/tolerance; native Risk decisions remain unchanged', 'Closed restore-index is historical context, not the current restore proof',
    [...objectiveRows, ...riskRows, ...fraudRows])]);
  population('C07-changes', CHANGE_CASES.map(([key, pre, release, confirmation, releaseKey, subject]) => {
    const event = 'PW26-CH-' + key;
    return member(event, confirmation, subject, 'Dale Doback',
      [ref(event + ':impact', pre), ref(event + ':release', release), ref(event + ':confirmation', confirmation)],
      ['Pre-change customer/dependency/Risk/owner impact', 'Authorization and rollback', 'Post-change confirmation'],
      'Scoped change accepted with explicit confirmation', 'One of the 34 ordinary releases, not an extra release',
      [{stage: 'pre-review', date: pre}, {stage: 'release', date: release, membership: 'PW26-REL-' + releaseKey},
        {stage: 'confirmation', date: confirmation}], event);
  }));
  source('PW26-C08-CYCLE-01', EVALUATION_DAY, {scope: '38 criteria / 25 Controls / 31 populations',
    challenge: 'Retained provider lead independently challenges Dale/sponsor work and the evaluation'});
  population('C08-evaluation', [member('PW26-C08-CYCLE-01', EVALUATION_DAY, 'Separate internal evaluation', 'Dale Doback',
    [ref('PW26-C08-CYCLE-01', EVALUATION_DAY)], ['Design', 'Periods', 'Quantities', 'Selection', 'Exceptions', 'Independent challenge'],
    'Criterion and Control conclusions remain distinct; no external attestation', 'C08 contributes only CC4.1',
    [...Object.keys(context.assessments).map(key => ({kind: 'criterion_index', key})),
      ...PRESTIGE_OPERATING_CONTROL_FACTS.map(control => ({kind: 'control_conclusion', key: control.key,
        statement: 'Proposed design and population outcome require actual native bindings'}))])]);
  const chainDays = ['2026-10-26', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28'];
  population('C09-chains', CHAINS.map((key, index) => {
    const id = 'PW26-C09-' + key, date = chainDays[index], chain = historyManifest?.chains?.[key];
    source(id, date, {chain_key: key, purpose: 'Current reconciliation of separately retained new fictional historical stages'});
    return member(id, date, key + ' retained chain', 'Dale Doback', [ref(id, date)],
      ['Original failure/scope', 'Action original due/completion', 'Fresh independent validation', 'Later Finding closure'],
      chain ? 'Returned historical chain supplied; native binding must still validate it' : 'Unresolved: actual historical stage IDs/dates required',
      'No new historical validation or closure is executed by this workpaper',
      ['failure', 'action', 'validation', 'finding_closed'].map(stage => ({stage,
        native_reference: chain ? historyStageReference(chain, stage) : null, state: chain ? 'supplied_unverified' : 'unresolved'})));
  }));
  const postureDecisions = [
    'Public administration bypass denied; storage destinations remain scoped',
    'Database authentication and rights-index consistency reconciled; no public direct database route',
    'Protected delivery branch and independent release review retained; no direct emergency bypass',
    'Selected advisory/dependency inputs reconciled to accountable correction or disposition',
    'Managed endpoint posture and restricted installation reconciled to the active inventory',
    'Provider facility operation separated from Prestige configuration, copy and recovery duties',
  ];
  population('C10-posture', rowsForMonth('C10-posture', 'Technical posture', [
    'Cloud network/storage', 'PostgreSQL/index', 'GitHub delivery', 'Dependency/advisory', 'Jamf posture', 'Recovery/provider boundary'],
  ['Approved baseline', 'Restricted bypasses', 'Correction/retest'], 'Scoped component posture and accountable result retained')
    .map((row, index) => ({...row, detail_rows: row.detail_rows.map((detail, component) => ({...detail,
      accountable_owner: 'Brennan Huff', proposed_result: postureDecisions[component],
      correction_retest: index === 1 && component === 3
        ? {issue: 'DEMO-DEP-026', initial_result: 'Authored dependency issue requires correction',
          correction: 'Scoped dependency replacement and compatibility checks', retest: 'Fresh selected compatibility and denied-path checks pass',
          real_cve_or_repository_change: false} : null})), exception_disposition: index === 1
      ? 'DEMO-DEP-026 authored issue, correction and retest retained; not a real CVE/repository change'
      : 'No unresolved mandatory issue in the selected components'})));
  const accessDecisions = [
    'Covered workforce access uses MFA; connected and uncovered applications remain separately reconciled',
    'Direct database, local and provider identities retain independent authorization; no all-SSO assertion',
    'Service/API credentials have a bounded destination and purpose; workforce departure does not prove rotation',
    'Cloud, database and repository administration remain separately approved from creative/project duties',
    'Named project rights, expiry and delivery scope govern bearer links; cross-project requests deny',
    'Emergency vault use requires authorized purpose, accountable access and subsequent reconciliation',
  ];
  population('C11-access', rowsForMonth('C11-access', 'Logical access paths', [
    'Workforce MFA', 'Local/direct/provider', 'Service/API', 'Privileged cloud/database/repository', 'Portal project', 'Emergency vault'],
  ['Authorization', 'Route scope', 'Responsible exception handling'], 'Scoped paths reconciled; no all-SSO claim')
    .map((row, index) => ({...row, detail_rows: row.detail_rows.map((detail, component) => ({...detail,
      accountable_owner: 'Brennan Huff', proposed_result: accessDecisions[component],
      scoped_exception: index === 1 && component === 5 ? 'Business-system emergency-access exercise reconciled after use' : null,
      scenario_inputs: index === 2 && component === 4 ? ['PW26-C15-B04', 'PW26-C15-B05'] : []})),
    input_refs: row.input_refs.concat(index === 2
      ? [ref('PW26-C15-B04', '2026-10-29'), ref('PW26-C15-B05', '2026-10-29')] : []),
    exception_disposition: index === 1 ? 'Business-system emergency-access exercise retained' : row.exception_disposition})));

  buildSecurityPopulations({context, source, ref, member, population, rowsForMonth});
  buildServicePopulations({context, source, ref, member, population, rowsForMonth});
  const evaluation = populations.find(row => row.key === 'C08-evaluation').members[0];
  evaluation.detail_rows = [
    ...Object.keys(context.assessments).map(key => ({kind: 'criterion_index', key,
      native_assessment_id: context.assessments[key].framework_assessment_id,
      contributing_control_keys: PRESTIGE_OPERATING_CONTROL_FACTS.filter(control => control.criteria.includes(key)).map(control => control.key)})),
    ...PRESTIGE_OPERATING_CONTROL_FACTS.map(control => ({kind: 'control_conclusion', key: control.key,
      design: control.design, criterion_contributions: control.criteria, evaluator: evaluation.business_evaluator,
      populations: populations.filter(row => row.control_fact_key === control.key).map(row => ({
        request_id: row.request_id, period_start: row.period_start, period_end: row.period_end,
        count_unit: row.count_unit, expected: row.expected_instances, collected: row.collected_instances,
        detailed_selection: row.selected_member_keys, exceptions: row.members.map(member => member.exception_disposition),
        planned_conclusion: row.planned_conclusion, native_state: 'unrecorded'}))})),
  ];
  return {populations, sources: [...sources.values()]};
}

function historyStageReference(chain, stage) {
  if (stage === 'failure') return {finding_id: chain.finding_id, operating_at: chain.failure};
  if (stage === 'action') return {task_id: chain.task_id, original_due_at: chain.action_due, completed_at: chain.action_completed};
  if (stage === 'validation') return {finding_id: chain.finding_id, review_id: chain.validation_review_id,
    occurrence_id: chain.validation_occurrence_id, operating_at: chain.validation, separate_from_action: true};
  return {finding_id: chain.finding_id, operating_at: chain.finding_closed, after_validation: true};
}

function validateWorkpaperCoverage(work) {
  if (controlSource.version !== 'prestige-current-control-facts-v1' || controlSource.client_id !== CID
    || Date.parse(controlSource.anchor) !== Date.parse(ANCHOR) || controlSource.planning_source_sha256 !== PLANNING_SHA256)
    fail('canonical Control registry provenance changed.');
  const expected = PRESTIGE_OPERATING_CONTROL_FACTS.flatMap(control => control.populations);
  if (expected.length !== 31 || new Set(expected.map(row => row.key)).size !== 31
    || work.populations.length !== 31 || new Set(work.populations.map(row => row.key)).size !== 31)
    fail('all 31 distinct approved populations are required.');
  const sources = new Map(work.sources.map(row => [row.key, row]));
  if (sources.size !== work.sources.length) fail('shared input versions must have one identity.');
  for (const pop of work.populations) {
    const fact = expected.find(row => row.key === pop.key);
    if (!fact || pop.count_unit !== fact.count_unit || typeof pop.count_unit !== 'string' || !pop.count_unit.trim()
      || pop.members.length !== fact.expected_instances || pop.collected_instances !== fact.collected_instances
      || new Set(pop.members.map(row => row.key)).size !== pop.members.length
      || new Set(pop.selected_member_keys).size !== pop.selected_member_keys.length
      || pop.selected_member_keys.some(key => !pop.members.some(row => row.key === key)))
      fail('population quantities, units or selection changed: ' + pop.key);
    for (const row of pop.members) {
      if (row.operating_date < pop.period_start || row.operating_date > pop.period_end)
        fail('member is outside its explicit operating period: ' + row.key);
      for (const field of ['key', 'source_key', 'subject', 'business_performer', 'proposed_result', 'exception_disposition'])
        requireText(row[field], 'membership ' + field);
      if (!row.input_refs.length || !row.required_checks.length || !row.detail_rows.length)
        fail('membership input/check/result content is incomplete: ' + row.key);
      for (const input of row.input_refs) {
        const source = sources.get(input.key), usedDay = day(input.used_on.slice(0, 10), 'source-use date');
        if (!source || source.available_on > usedDay || usedDay > EVALUATION_DAY)
          fail('missing or future input cannot substantiate this workpaper: ' + row.key);
        if (source.available_at && input.used_on.length > 10 && Date.parse(source.available_at) > Date.parse(input.used_on))
          fail('timed input was unavailable at its selected use: ' + row.key);
      }
    }
  }
  const memberCount = work.populations.reduce((sum, row) => sum + row.members.length, 0);
  const detailedCount = work.populations.reduce((sum, row) => sum + row.selected_member_keys.length, 0);
  if (memberCount !== 256 || detailedCount !== 136) fail('typed membership/detail coverage changed.');
}

function bundleContent(bundle, context, work, historyManifest, document) {
  const populations = work.populations.filter(pop => (POPULATION_BUNDLE[pop.key] || 'pw-current-criteria-2026') === bundle.key);
  const rows = [{type: 'provenance', key: bundle.key, subject: bundle.title, value: {source: SOURCE_NOTE,
    source_event_date: bundle.date, native_execution: 'None performed by the artifact factory'}}];
  const row = (type, key, subject, value) => rows.push({type, key, subject, value});
  if (bundle.key === 'pw-current-criteria-2026') {
    for (const [key, fact] of Object.entries(PRESTIGE_CURRENT_ASSESSMENTS)) row('criterion', key, fact.rationale, {
      assessment_id: context.manifest.assessment_ids[key], source_as_of: '2026-11-02',
      owner_id: fact.owner_id, process_owner_id: fact.process_owner_id, technology: fact.technology,
      implementation_source: fact.responses, current_native_status: context.assessments[key].status,
      current_native_implementation: context.assessments[key].implementation,
      control_fact_keys: PRESTIGE_OPERATING_CONTROL_FACTS.filter(control => control.criteria.includes(key)).map(control => control.key),
      evidence_subjects: fact.evidence_subjects, temporal_scope: 'Current 2026 content; not historical questionnaire execution'});
    row('shared_input_register', 'shared-input-versions', 'One identity per fictional input/version',
      work.sources.map(({content, ...source}) => source));
  } else if (bundle.key === 'pw-policy-versions-current') {
    for (const fact of PRESTIGE_POLICY_DOCUMENT_FACTS) row('policy', fact.key, fact.summary, {
      policy_id: context.manifest.policy_ids[fact.key], document_id: fact.document_id, version: fact.version,
      reported_approved_at: fact.approved_at, effective_date: fact.effective_date, named_business_approver: fact.named_approver,
      source: fact.source, external_reference: fact.external_reference, external_bytes_verified: false,
      native_current: context.policies[fact.key], historical_boundary: PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY});
  } else if (bundle.key === 'pw-risk-decisions-current') {
    for (const [key, native] of Object.entries(context.risks)) row('current_risk', key, native.title, {
      risk_id: native.risk_id, native_snapshot: native,
      lifecycle_boundary: 'Review, treatment completion, acceptance and closure retain their native distinctions'});
    const chain = historyManifest?.chains?.['RECOVERY-DEPENDENCY'];
    if (chain?.risk_id && !Object.values(context.manifest.risk_ids).includes(chain.risk_id)) {
      const risk = nativeRow(context.db, 'risks', chain.risk_id);
      row('additional_historical_risk', 'RECOVERY-DEPENDENCY', risk.title, {native_snapshot: risk,
        scope: 'Explicit extra closed historical Risk; separate from the 30 current source facts'});
    }
  } else if (bundle.key === 'pw-vendor-events-current') {
    for (const fact of PRESTIGE_VENDOR_FACTS) row('vendor', fact.key, fact.service, {
      vendor_id: context.manifest.vendor_ids[fact.key], adopted_on: fact.adopted, inactive_since: fact.inactiveSince || null,
      native_snapshot: context.vendors[fact.key], review_events: reviewContexts(context.db, 'vendor_id', context.manifest.vendor_ids[fact.key]),
      event_boundary: 'Relationship review, assurance and contract/notice events are separate; pending reports stay pending'});
  } else if (bundle.key === 'pw-ai-screening-current') {
    for (const fact of PRESTIGE_AI_FACTS) row('ai_screening', fact.key, fact.name, {
      ai_system_id: context.manifest.ai_ids[fact.key], provider_vendor_id: context.manifest.vendor_ids[fact.vendorKey],
      risk_id: context.manifest.risk_ids[fact.riskKey], availability: fact.availableSince, adopted_on: fact.adopted,
      purposes: fact.purposes, handled_data: fact.data, access: fact.access, restrictions: fact.restrictions,
      source_screening_answers: fact.answers, native_snapshot: context.ai[fact.key],
      native_risk: context.risks[fact.riskKey], review_events: reviewContexts(context.db, 'ai_system_id', context.manifest.ai_ids[fact.key]),
      historical_vs_current: 'Product availability/adoption is distinct from actual current native screening/import time',
      code_assistant_evidence: fact.key === 'copilot-code-assistance' ? ['PW26-REL-O06', 'PW26-REL-O21', 'PW26-REL-O30'] : []});
  } else if (bundle.key === 'pw-recovery-workpaper-current') {
    row('recovery', RECOVERY.key, 'Complete customer service, not an isolated file restore', RECOVERY);
    row('recovery_context', 'backup-and-risk-context', 'Actual supported subjects', {
      policy_ids: ['policy-backup-restoration-policy', 'policy-business-continuity-disaster-recovery-policy']
        .map(key => context.manifest.policy_ids[key]),
      review_id: context.manifest.review_ids['soc-backup'], source_vendor_ids: ['aws', 'backblaze'].map(key => context.manifest.vendor_ids[key]),
      historical_risk_context: context.manifest.risk_ids['restore-index'], historical_risk_is_current_proof: false});
  } else {
    const historical = historicalWorkpaper(bundle, context, historyManifest, document);
    row('historical_workpaper', bundle.key, bundle.title, historical.content);
    return {population_keys: [], rows, source_bindings: historical.bindings};
  }
  for (const pop of populations) row('operating_population', pop.key, pop.count_unit, pop);
  return {population_keys: populations.map(pop => pop.key), rows};
}

function historicalWorkpaper(bundle, context, history, document) {
  const milestone = scenario.milestones.find(item => item.date === bundle.date);
  if (!milestone) fail('approved historical storyline missing.');
  const documentEnd = document.document_date + 'T23:59:59.999Z';
  const cutoff = Date.parse(document.available_at) < Date.parse(documentEnd) ? document.available_at : documentEnd;
  const cutoffDay = cutoff.slice(0, 10);
  const included = value => typeof value === 'string' && (value.length === 10
    ? value <= cutoffDay : Date.parse(value) <= Date.parse(cutoff));
  const bindings = {milestone: null, annual_occurrences: [], policy_subjects: []};
  const nativeMilestone = history?.milestones?.[milestone.key];
  let milestoneOutcome = null;
  if (nativeMilestone) {
    if (!included(nativeMilestone.effective_at)) fail('document predates its historical milestone.');
    const {occurrence} = reviewOccurrence(context.db, nativeMilestone.review_id, nativeMilestone.occurrence_id);
    bindings.milestone = {key: milestone.key, review_id: nativeMilestone.review_id, occurrence_id: nativeMilestone.occurrence_id,
      snapshot: historicalSnapshot(occurrence)};
    milestoneOutcome = occurrence.outcome;
    if (occurrence.completed_at && !included(occurrence.completed_at)) fail('document predates its milestone completion.');
  }
  for (const [policyKey, subjects] of Object.entries(history?.policy_subjects || {})) {
    if (!Array.isArray(subjects)) fail('historical Policy subjects must be returned arrays.');
    for (const subject of subjects) {
      if (!included(subject.effective_at) || subject.effective_at.slice(0, 10) > bundle.date) continue;
      if (subject.client_id !== CID || subject.policy_id !== context.manifest.policy_ids[policyKey])
        fail('historical Policy subject belongs to a different returned container.');
      bindings.policy_subjects.push({policy_fact_key: policyKey, policy_id: subject.policy_id,
        subject_id: requireText(subject.subject_id, 'historical Policy subject ID'), version: subject.version,
        effective_at: instant(subject.effective_at, 'historical Policy effective instant'), frozen_subject: copy(subject)});
    }
  }
  if (history && bundle.key === 'pw-foundation-2018' && !bindings.policy_subjects.some(link =>
    link.policy_fact_key === 'policy-information-security-policy' && link.version === '1'))
    fail('actual returned Security Policy v1 subject is required for the foundation source.');
  const annual = [], resolved = context.history_occurrences || [];
  const inclusion = {declared_occurrences: resolved.length, uniquely_resolved: resolved.length, selected: 0,
    excluded_other_due_year: 0, excluded_after_document_cutoff: 0};
  for (const {review, occurrence} of resolved) {
      if (occurrence.due_date.slice(0, 4) !== bundle.date.slice(0, 4)) { inclusion.excluded_other_due_year += 1; continue; }
      if (!included(occurrence.completed_at)) { inclusion.excluded_after_document_cutoff += 1; continue; }
      annual.push({subject: review.title, type: review.review_type, original_due_date: occurrence.due_date,
        completed_at: occurrence.completed_at, outcome: occurrence.outcome, notes: occurrence.notes || null,
        late: occurrence.completed_at.slice(0, 10) > occurrence.due_date.slice(0, 10)});
      bindings.annual_occurrences.push({review_id: review.review_id, occurrence_id: occurrence.occurrence_id,
        snapshot: historicalSnapshot(occurrence)});
      inclusion.selected += 1;
  }
  bindings.annual_inclusion = inclusion;
  const chronology = bundle.chains.map(key => {
    const chain = history?.chains?.[key];
    if (!chain) return {key, state: 'unresolved_native_stage_bindings', stages: []};
    if (bundle.key !== 'pw-migration-exceptions-2023' && !included(chain.finding_closed))
      fail('historical document must be issued after the correction/validation/closure it describes.');
    const stages = ['failure', 'action_due', 'action_completed', 'validation', 'finding_closed']
      .filter(stage => included(chain[stage])).map(stage => ({stage, at: chain[stage]}));
    return {key, stages, original_scheduled_action_due: included(chain.failure) ? chain.action_due : null,
      scheduled_date_boundary: 'An original future due date is a scheduled obligation, not an assertion that its completion occurred',
      state: stages.length === 5 ? 'all_business_stages_available' : 'as_of_stages_only',
      boundary: 'Correction, validation and closure are separate; omitted later stages are not asserted here'};
  });
  const suppliers = PRESTIGE_VENDOR_FACTS.filter(fact => fact.adopted <= bundle.date).map(fact => ({
    source_key: 'historical-supplier:' + fact.key, supplier: fact.name || fact.key, adopted_on: fact.adopted,
    service: fact.service, status_at_milestone: fact.inactiveSince && fact.inactiveSince <= bundle.date ? 'inactive' : 'in_use',
    responsibilities: 'Provider-operated service remains distinct from Prestige configuration, data handling and accountable decisions'}));
  const content = {provenance: 'Newly authored fictional reconstruction of the approved historical story; not recovered original bytes',
    operating_milestone: {date: milestone.date, owner: milestone.ownerName, narrative: milestone.narrative,
      approved_storyline_outcome: milestone.outcome, returned_native_outcome: milestoneOutcome},
    business_boundary: scenario.business.systemBoundary, commitments: scenario.business.commitments,
    storyline_era: bundle.date < '2023-01-16' ? '2017 TSC; revised 2022 Points of Focus not yet adopted'
      : 'Revised 2022 Points of Focus adopted January 16, 2023; criteria remain the 2017 TSC',
    included_fact_cutoff: cutoff, chronology, annual_operating_outcomes: annual, annual_outcome_inclusion: inclusion,
    annual_outcome_binding_state: history ? 'Returned snapshots included only through document availability' : 'unresolved',
    native_import_boundary: 'Native IDs and actual later import actors/times are held in the separate descriptor, not represented as original historical account/file identifiers'};
  if (bundle.key === 'pw-foundation-2018') {
    content.initial_account_and_asset_inventory = {
      enumeration_basis: 'Logical service/account groups from the approved foundation; not an asserted employee/account/device total',
      supplier_account_groups: suppliers.map(supplier => ({...supplier, initial_account_state:
        ['google-workspace', 'slack', 'adobe'].some(key => supplier.source_key.endsWith(':' + key))
          ? 'Inherited shared SaaS custody requires named ownership and follow-up' : 'Named accountable service ownership recorded; exact original account IDs unknown'})),
      asset_groups: [
        ['FOUNDATION-PORTAL', 'AWS licensing catalog and APIs', 'Brennan Huff', 'Customer contacts, rights metadata and controlled service operations'],
        ['FOUNDATION-MEDIA', 'S3 project media and customer delivery folders', 'Brennan Huff; Nancy defines rights', 'Unreleased creative media; project and license boundaries'],
        ['FOUNDATION-CODE', 'GitHub source and delivery repositories', 'Brennan Huff', 'Source, proposed changes and approved release history'],
        ['FOUNDATION-RIGHTS', 'Signed license and confidentiality records', 'Nancy Huff', 'Approvals, territory/expiry restrictions and retained customer terms'],
        ['FOUNDATION-ENDPOINTS', 'Creative workstations and custody register', 'Derek Huff', 'Working cuts and restricted local copies; device count unknown'],
      ].map(([source_key, subject, owner, handled_data]) => ({source_key, subject, owner, handled_data,
        native_asset_id: null, original_quantity: null, inventory_result: 'Boundary and custodian recorded; inherited access gaps remain open'})),
    };
    content.security_policy_v1 = {version: '1', business_approval_date: '2018-11-02', named_approver: 'Robert Doback',
      source: 'Authored supporting reconstruction; exact original document reference and bytes are unknown',
      procedures: [
        ['Responsibility', 'Dale maintains the program; Robert sponsors decisions; named owners maintain operating records'],
        ['Access', 'Use accountable project/role grants; inventory inherited shared access as an unresolved exception'],
        ['Media handling', 'Nancy confirms contractual rights; Derek restricts unreleased working media and external sharing'],
        ['Changes', 'Brennan retains requested scope, independent review, release authorization and rollback basis'],
        ['Incident concerns', 'Pause disputed export, retain facts and route scope/contract decisions to Dale and Nancy'],
        ['Backup and recovery', 'Protect media and rights records; test restoration rather than infer recoverability from a copy'],
        ['Suppliers', 'Record provider responsibilities and missing assurance; supplier operation is not a Prestige-owned control'],
        ['Exceptions', 'Record accountable follow-up; work completion does not substitute for separate validation'],
      ].map(([section, procedure]) => ({section, procedure}))};
  } else if (bundle.key === 'pw-named-access-2019') {
    content.project_access_reconciliation = [
      {case: 'H19-NAMED-GRANT', before: 'Shared delivery credential obscures accountable project access',
        correction: 'Named project grant limited to the authorized licensed media and permitted recipient', check: 'Approved recipient/project succeeds',
        result: 'Scoped allowed-path result; actual correction and separate validation dates remain in chronology'},
      {case: 'H19-CROSS-PROJECT', check: 'Same identity requests an unrelated project media object', result: 'Denied by project authorization; a bearer link is not an unrestricted user role'},
      {case: 'H19-EXPIRED-LINK', check: 'Delivery permission is used beyond its authorized validity', result: 'Expired access denied; new authorization is required'},
    ];
    content.alert_triage = {inputs: ['Edge routing/denial context', 'Application delivery and authorization context'],
      decision: 'Brennan correlates denied delivery and expiry before classifying an incident; Dale retains accountable disposition',
      residual_boundary: 'Authorized download and supplier outage exposures remain; closed shared access does not erase them'};
  } else if (bundle.key === 'pw-contractors-2020') {
    content.contractor_end_date_reconciliation = {sponsor_input: 'Alice reconciles starts/ends; Derek confirms project purpose and end authorization',
      original_exception: 'Delayed contractor removal remains the original failed condition',
      route_checks: [
        {route: 'Okta/connected applications', correction_check: 'Named identity disabled and connected grants reconciled'},
        {route: 'Direct application/database access', correction_check: 'Direct routes checked independently; SSO disablement alone is insufficient'},
        {route: 'Service/API access', correction_check: 'Applicable named credentials revoked; not-applicable needs an inventory basis'},
        {route: 'Existing sessions', correction_check: 'Retained sessions revoked and a fresh denied-path check performed'},
      ], evaluation: 'Dale validates fresh results after corrective completion; original due and late completion remain separate'};
    content.endpoint_and_secret_custody = {management: 'Jamf-managed device custody and encryption reporting reconciled',
      emergency_secrets: '1Password vault custody remains accountable; no blanket all-SSO assertion',
      suppliers: suppliers.filter(row => /:(okta|jamf|onepassword|clear-reel)$/.test(row.source_key))};
  } else if (bundle.key === 'pw-recovery-delivery-2021') {
    content.recovery_dependency_workpaper = {initial_result: 'Selected isolated restoration omitted a required complete-service dependency',
      correction: 'Include the full dependency set and perform a fresh service-level retest',
      checks: ['Media manifest and selected copy integrity', 'PostgreSQL restoration', 'Required service dependency consistency',
        'Authorized delivery and denied excess scope', 'Separate independent acceptance'],
      historical_measurements: {recovery_minutes: null, data_gap_minutes: null,
        reason: 'The approved milestone records measured testing but no exact 2021 values; 2026 values are not substituted'},
      failed_attempt_retained: true, later_result: 'Use separately dated actual returned validation; a successful copy is not full recovery'};
    content.delivery_and_monitoring = {authorized_change: 'GitHub proposed change, separate review, relevant tests and release authorization',
      rollback: 'Prior accepted version and accountable rollback decision retained separately from deployment',
      dependency_check: 'Snyk check is a delivery input; its presence does not establish absence of vulnerabilities',
      monitoring_disposition: 'Brennan traces selected alerts to cause/customer scope; Dale challenges the disposition',
      provider_boundary: 'Harbor Signal assists in its authorized role; Prestige remains accountable for service recovery'};
  } else if (bundle.key === 'pw-readiness-2022') {
    content.internal_readiness = {approach: 'Dale traces criterion narratives to named responsibilities, selected operating samples and retained exceptions',
      checks: ['Owner and implemented practice', 'Substantive source sample', 'Original failed result', 'Corrective work', 'Fresh independent validation'],
      boundary: 'Internal implementation/readiness, with resolved findings retained; not a CPA report or certification'};
    content.distinct_supplier_events = suppliers.map(supplier => ({supplier: supplier.supplier, source_key: supplier.source_key,
      relationship_review: {owner: 'Dale Doback', input: 'Dependency, handled data and responsibility scope', decision: 'Retain relationship rationale and separately scoped follow-up'},
      assurance_follow_up: {owner: 'Dale Doback; Brennan technical input', input: 'Requested report/coverage and exclusions', decision: 'Missing assurance remains a gap; review completion does not imply receipt'},
      contract_or_notice: {owner: 'Nancy Huff', input: 'Actual contractual renewal/notice terms', decision: 'Track separately; no default renewal date or universal notice period invented'},
      actual_event_state: 'Specific dates/statuses only from returned year outcomes; these three event meanings are not collapsed'}));
    content.policy_version_history = PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY;
    content.policy_approval_boundary = 'Robert approved 2022 revisions; exact revision numbers, dates and references remain unknown. A completed Policy Review is not document approval.';
  } else if (bundle.key === 'pw-migration-exceptions-2023') {
    content.failed_migration_checks = [
      {chain: 'MIGRATION-ROLE', input: 'New multi-tenant portal role grants', failed_result: 'Migration role has excessive cross-boundary privilege',
        containment: 'Narrow the affected administrative scope before accepting the migrated service'},
      {chain: 'RETENTION', input: 'Migrated customer media and rights tags', failed_result: 'Customer retention tags are incomplete',
        containment: 'Nancy pauses affected export and reconciles required handling/hold context'},
      {chain: 'INDEX-RECOVERY', input: 'Selected metadata recovery test', failed_result: 'Rights-search metadata index omitted from recovery',
        containment: 'Keep the failed test; require complete media/metadata/index retest'},
    ];
    content.management_disposition = 'Dale records three separate Risk/Finding/Action chains; Robert funds correction. Actions may be underway; no future validation is implied by their creation.';
  } else if (bundle.key === 'pw-migration-validation-2024') {
    content.fresh_validation_workpapers = [
      {chain: 'MIGRATION-ROLE', correction: 'Brennan narrows migration roles', fresh_check: 'Compare authorized role scope and test denied excess paths',
        acceptance: 'Dale independently evaluates the corrected access sample after Action completion'},
      {chain: 'RETENTION', correction: 'Retention/hold checks added and population reconciled', fresh_check: 'Nancy reconciles the complete selected migrated customer population to handling requirements',
        acceptance: 'Dale checks fresh reconciliation and remaining exception disposition'},
      {chain: 'INDEX-RECOVERY', correction: 'Complete dependency set includes rights metadata and search index', fresh_check: 'Restore media and database, reconcile index consistency, exercise allowed/denied delivery',
        acceptance: 'Fresh independent validation precedes Finding closure; no 2026 recovery duration backdated'},
    ];
    content.residual_decision = 'Provider outage, authorized download and concentration Risks remain independently accepted or treated. Finding closure does not force blanket Risk retirement.';
  } else if (bundle.key === 'pw-service-ai-2025') {
    content.customer_commitment_workpapers = [
      {commitment: '99.9% monthly portal availability', check: 'Separate contractual objective from measured operating records and customer-impact assessment', result: 'No unprovided uptime measurement or provider guarantee asserted'},
      {commitment: 'Confidential project media', check: 'Nancy reconciles licensed recipient/project scope; Derek checks permitted working media and delivery', result: 'Confidential media and contracts excluded from public creative briefs'},
      {commitment: 'Retained license/delivery records', check: 'Reconcile approved retention and holds with media, rights metadata and supplier copies', result: 'Disputed or held material is retained; review completion is not disposal authorization'},
    ];
    content.assisted_work_cases = PRESTIGE_AI_FACTS.filter(fact => fact.adopted <= bundle.date).map(fact => ({
      source_key: 'H25-AI:' + fact.key, subject: fact.name, available_since: fact.availableSince, adopted_on: fact.adopted,
      input_boundary: fact.data, purposes: fact.purposes, restrictions: fact.restrictions,
      review: fact.key === 'copilot-code-assistance'
        ? 'Treat generated contribution as untrusted; retain human provenance/license/security review, tests and ordinary release approval'
        : fact.key === 'textract-rights-intake' ? 'A rights specialist confirms territory, expiry and recipient before publication or delivery'
          : 'Named creative/editorial reviewer checks rights, factual accuracy and contractual restrictions before use',
      native_screening_boundary: 'Historical adoption is distinct from current native onboarding/screening time; no current questionnaire answers are backdated'}));
    content.annual_review_boundary = 'Returned annual outcomes retain original due dates, late completion and prior Policy subjects. Supplier, AI and concentration follow-ups remain ongoing.';
  }
  return {content, bindings};
}

function reviewContexts(db, field, id) {
  return (db.reviews || []).filter(row => row.client_id === CID && row[field] === id).map(row => ({
    review_id: row.review_id, occurrence_id: occurrenceId(row), review_type: row.review_type,
    due_date: row.due_date, completed_at: row.completed_at || null, status: row.status,
    historical_snapshots: copy(row.occurrences || []),
  }));
}

function volumeLedger(artifacts, work) {
  const get = key => work.populations.find(pop => pop.key === key);
  const backups = get('C24-backups').members, components = backups.flatMap(row => row.detail_rows);
  const attempts = components.flatMap(row => row.attempts);
  const typed = {
    population_headers: work.populations.length, membership_rows: work.populations.reduce((n, pop) => n + pop.members.length, 0),
    detailed_member_packages: work.populations.reduce((n, pop) => n + pop.selected_member_keys.length, 0),
    shared_input_versions: work.sources.length,
    unique_source_event_keys: new Set(work.populations.flatMap(pop => pop.members.map(row => row.source_key))).size,
    backup_batches: backups.length, backup_logical_members: components.length, backup_attempts: attempts.length,
    backup_failed_attempts: attempts.filter(row => row.result === 'failed').length,
    backup_deep_member_checks: backups.filter(row => row.detailed).reduce((n, row) => n + row.detail_rows.length, 0),
    endpoint_comparison_rows: get('C16-coverage').members.reduce((n, row) => n + row.detail_rows.length, 0),
    premises_check_groups: get('C13-premises').members.reduce((n, row) => n + row.detail_rows.length, 0),
    telemetry_health_rows: get('C17-sources').members.reduce((n, row) => n + row.detail_rows.length, 0),
    recovery_checkpoints: RECOVERY.checkpoints.length, recovery_objective_comparisons: 2,
    capacity_trials: get('C23-capacity').members[2].detail_rows.length,
    intake_version_confirmations: get('C25-intake').members.filter(row => row.detail_rows[0].current_version_confirmation).length,
    disposal_completion_records: get('C25-disposal').members.filter(row => row.detail_rows[0].status === 'authorized_scoped_disposal').length,
    disposal_hold_records: get('C25-disposal').members.filter(row => row.detail_rows[0].status === 'deferred_under_hold').length,
  };
  if (typed.backup_batches !== 90 || typed.backup_logical_members !== 270 || typed.backup_attempts !== 271
    || typed.backup_failed_attempts !== 1 || typed.capacity_trials !== 3) fail('retained failure/trial arithmetic changed.');
  const files = artifacts.map(file => ({key: file.key, filename: file.filename, mime_type: file.mime_type,
    sha256: file.sha256, decoded_file_bytes: file.decoded_file_bytes, payload_utf16_bytes: file.payload_utf16_bytes,
    inline_eligible: file.inline_eligible, ordinary_upload_eligible: file.ordinary_upload_eligible}));
  return {measurement_scope: 'Exact materialized source bodies only; not a native complete-cohort persistence result',
    typed_counts: typed, files, decoded_file_bytes: files.reduce((n, file) => n + file.decoded_file_bytes, 0),
    payload_utf16_bytes: files.reduce((n, file) => n + file.payload_utf16_bytes, 0),
    limits: {individual_inline_decoded_bytes: DEMO_INLINE_LIMIT, ordinary_upload_decoded_bytes: DEMO_FILE_LIMIT,
      all_client_inline_utf16_bytes: 65536, temporary_cache_utf16_bytes: 8 * 1024 * 1024,
      decoded_envelope_utf8_bytes: 20 * 1024 * 1024, controlled_saved_utf16_bytes: 5 * 1024 * 1024,
      separate_raw_character_guard: 4000000},
    complete_cohort: {raw_chars: null, decoded_envelope_utf8_bytes: null, packed_utf8_bytes: null,
      stored_utf16_bytes: null, retained_foreign_inline_utf16_bytes: null, all_client_inline_utf16_bytes: null,
      temporary_cache_utf16_bytes: null, reload_cache_loss_result: 'unverified', capacity_qualified: false},
    retention: 'Previously retained payloads reserve the shared budget first; no Prestige recovery dispatcher is installed'};
}

function buildSecurityPopulations({source, ref, member, population, rowsForMonth}) {
  const registrations = [
    ['R01', '2026-08-06', 'Support staff', 'Assigned-project metadata; no unrestricted media export', 'Alice Huff'],
    ['R02', '2026-08-20', 'Contractor colorist', 'P02 proxies and expiry; no production administration', 'Derek Huff'],
    ['R03', '2026-09-03', 'Engineer', 'Approved repository/staging; no automatic production privilege', 'Brennan Huff'],
    ['R04', '2026-09-17', 'Contractor subtitler', 'P03 proxies; no license-release authority', 'Derek Huff'],
    ['R05', '2026-10-01', 'Rights coordinator', 'Propose/check metadata; independent release authorization', 'Nancy Huff'],
    ['R06', '2026-10-22', 'Contractor audio editor', 'P01 working media; end date and export limits', 'Derek Huff'],
    ['R07', '2026-08-12', 'Fictional licensee A', 'Approved P02 delivery only', 'Nancy Huff'],
    ['R08', '2026-09-09', 'Fictional agency B', 'Approved P03 review only', 'Nancy Huff'],
    ['R09', '2026-10-26', 'Fictional broadcaster C', 'Licensed P01 bundle; territory and expiry checks', 'Nancy Huff'],
  ];
  population('C12-registration', registrations.map(([key, date, subject, scope, sponsor]) => {
    const id = 'PW26-C12-' + key;
    source(id, date, {subject, sponsor, scope, authorization: 'Before provisioning', platform_account_created: false});
    return member(id, date, subject + ' / ' + scope, 'Brennan Huff', [ref(id, date)],
      ['Identity/sponsor/project', 'Authorization before provisioning', 'Privilege separation', 'Expiry', 'Scope check'],
      'Approved ' + scope + '; incompatible privilege not granted', 'Fictional business-system event; no GoverNara account created',
      [{sponsor, requested_role: subject, authorized_scope: scope, authorization_order: 'Before provisioning',
        permitted_check: key === 'R02' ? 'Named P02 watermarked proxy can be reviewed during the authorized window'
          : key === 'R03' ? 'Approved repository and staging action succeeds without production administration'
            : key === 'R09' ? 'Named broadcaster receives only licensed P01 territory/version during its valid window' : scope,
        denied_check: key === 'R02' ? 'Full-resolution export, unrelated project and production administration deny'
          : key === 'R03' ? 'Production administrative change and unrelated repository access deny'
            : key === 'R09' ? 'Wrong territory, expired permission and unrelated P02 media deny'
              : 'Action beyond the selected project/duty boundary denies',
        verification: 'Permitted scoped action succeeds; excess administrative/export action denied'}]);
  }), ['R02', 'R03', 'R09'].map(key => 'PW26-C12-' + key));

  const departures = [
    ['D01', '2026-08-14', 'Staff departure'], ['D02', '2026-09-11', 'Staff departure'],
    ['D03', '2026-10-23', 'Staff departure'], ['D04', '2026-08-28', 'Contractor project end'],
    ['D05', '2026-09-18', 'Contractor project end'], ['D06', '2026-10-09', 'Contractor project end'],
    ['D07', '2026-10-28', 'Contractor project end'],
  ];
  population('C12-departure', departures.map(([key, date, subject]) => {
    const id = 'PW26-C12-' + key;
    const routeChecks = ['Okta and connected applications', 'Direct PostgreSQL identities', 'API/service credentials', 'Retained sessions'];
    const detail = key === 'D04' ? {
      authorized_window: ['2026-08-28T16:45:00Z', '2026-08-28T17:00:00Z'],
      okta_disabled: '2026-08-28T16:50:00Z', postgres_disabled: '2026-08-28T16:52:00Z',
      api_revoked: '2026-08-28T16:54:00Z', sessions_revoked: '2026-08-28T16:56:00Z',
      denial_checked: '2026-08-28T17:01:00Z', case_review_date: '2026-08-29',
    } : {authorization: 'Approved end-date window retained in this fictional case',
      checks: routeChecks, unused_route: 'Not applicable only where the selected inventory supports it'};
    source(id, date, {subject, routes: routeChecks, detail, past_late_removal_history: 'Separate, retained'});
    return member(id, date, subject + ' / ' + key, 'Brennan Huff', [ref(id, date)],
      routeChecks, 'Connected, direct and retained-session access reconciled to the authorized end',
      'No current late removal proposed; old late-removal history is not rewritten', [detail]);
  }), ['D01', 'D04', 'D07'].map(key => 'PW26-C12-' + key));

  const movers = [
    ['2026-08-10', 'P01 metadata support', 'P02 metadata support', 'P01 metadata edit', 'Alice Huff'],
    ['2026-08-24', 'P02 proxy color review', 'P02 final color preparation', 'Proxy-only review role', 'Derek Huff'],
    ['2026-09-02', 'Repository read and staging observation', 'Approved repository contribution', 'Staging observer-only role', 'Brennan Huff'],
    ['2026-09-16', 'P03 subtitle draft', 'P03 subtitle quality review', 'Self-release or broad export scope', 'Derek Huff'],
    ['2026-09-23', 'P02 royalty data preparation', 'P02 reconciliation review', 'Unrestricted edit of reviewed extracts', 'Nancy Huff'],
    ['2026-09-30', 'P01 creative editing', 'P01 media handover', 'Working-cut modification', 'Derek Huff'],
    ['2026-10-07', 'P01 and P02 metadata support', 'P02 metadata support retained', 'Ended P01 access', 'Alice Huff'],
    ['2026-10-14', 'P02 and P03 proxy review', 'P03 proxy review retained', 'Expired P02 proxy permission', 'Derek Huff'],
    ['2026-10-21', 'P01 and P03 licensed metadata', 'P01 licensed metadata retained', 'Ended P03 analytical extract', 'Nancy Huff'],
    ['2026-10-27', 'P02 and P03 project coordination', 'P03 coordination retained', 'P02 archive-export permission', 'Nancy Huff'],
    ['2026-10-29', 'P01 and P02 licensed deliveries', 'P01 territory-bound licensed delivery retained', 'Expired P02 delivery and stale links', 'Nancy Huff'],
  ];
  population('C12-mover', movers.map(([date, oldDuties, newDuties, removed, authorizer], index) => {
    const key = 'M' + String(index + 1).padStart(2, '0'), id = 'PW26-C12-' + key;
    const scope = index < 6 ? 'Changed business duties/role scope' : 'One project/license ends while another legitimate scope remains';
    const detail = {old_duties: oldDuties, new_duties: newDuties, authorizer, removed,
      authorization: 'Sponsor approves the stated scope before the role change',
      reconciliation: 'Direct, connected and project routes checked against the changed duties',
      permitted_check: newDuties + ' succeeds within retained project/role scope',
      denied_check: removed + ' no longer authorizes access',
      privilege_boundary: 'No platform account, production administrator or license-release authority inferred'};
    source(id, date, {scope, detail});
    return member(id, date, scope + ' / ' + key, 'Brennan Huff', [ref(id, date)],
      ['Approved duties', 'Remove incompatible access', 'Retain legitimate access', 'Subsequent reconciliation'],
      'Only the authorized new/retained scope remains', 'Mover is neither a registration nor a departure', [detail]);
  }), ['M02', 'M04', 'M08', 'M11'].map(key => 'PW26-C12-' + key));

  const retirements = [
    ['A01', '2026-08-18', 'PW-LAP-01', 'Laptop'], ['A02', '2026-09-15', 'PW-LAP-02', 'Laptop'],
    ['A03', '2026-10-06', 'PW-LAP-03', 'Laptop'], ['A04', '2026-10-27', 'PW-MEDIA-01', 'Media device'],
  ];
  const premisesDates = ['2025-12-12', '2026-03-13', '2026-06-12', '2026-09-25'];
  population('C13-premises', premisesDates.map((date, index) => {
    const id = 'PW26-C13-P' + String(index + 1).padStart(2, '0');
    const priorEvents = departures.filter(([, when]) => when <= date).map(([key]) => 'PW26-C12-' + key)
      .concat(retirements.filter(([, when]) => when <= date).map(([key]) => 'PW26-C14-' + key));
    const checks = ['Badges and ended access', 'Visitors and escort', 'Device/media custody', 'Provider responsibility boundary'];
    source(id, date, {as_of: date, inputs: 'Date-bounded office/edit-suite custody register', checks,
      workforce_or_badge_count: 'Not asserted'});
    return member(id, date, 'Premises/custody package ' + date, 'Derek Huff; Brennan Huff reconciles',
      [ref(id, date), ...priorEvents.map(key => ref(key, date))], checks,
      'Scoped office/custody groups reconciled; hosting facilities remain provider operated',
      'No later October departure/retirement used for the September package',
      checks.map(check => ({check, as_of: date, proposed_result: 'Selected custody/access input reconciled and boundary recorded'})));
  }));
  population('C14-retirement', retirements.map(([key, date, asset, type]) => {
    const id = 'PW26-C14-' + key, detail = {business_asset_key: asset, type,
      hold_authorization: 'Retention and legal hold checked before release',
      sanitization: 'Approved device/media sanitization procedure and clean-state verification',
      verification: 'Result verified; encryption-only status is insufficient',
      credential_management_removal: 'Device credentials and management enrollment removed',
      retained_copy_disposition: 'Required retained copies remain authorized', custody_release: 'Authorized recipient and handover retained',
      release_evaluator: 'Dale Doback'};
    source(id, date, detail);
    return member(id, date, type + ' retirement / ' + asset, 'Brennan Huff', [ref(id, date)],
      ['Retention/hold authorization', 'Sanitization and verification', 'Credential/management removal', 'Custody release'],
      'Authorized sanitized asset released with separate evaluation', 'No extra personnel departure or customer-data disposal inferred', [detail]);
  }));
  population('C15-boundaries', BOUNDARY_CASES.map(([key, subject, result]) => {
    const id = 'PW26-C15-' + key;
    return member(id, '2026-10-27', subject, 'Brennan Huff', [ref(id, '2026-10-27')],
      ['Identity and project scope', 'Route/destination', 'Expected allow/deny', 'Transport and logging'],
      result, 'Selected scenario only; signed URLs remain bearer permissions',
      [{identity_scope: subject, destination: /P02/.test(subject) ? 'P02' : 'Selected approved destination',
        expected_authorization: result, transport_logging: 'Protected route and accountable result retained'}]);
  }));

  const coverage = rowsForMonth('C16-coverage', 'Endpoint coverage', [],
    ['Inventory', 'Management/encryption', 'Install privilege', 'Protection reporting', 'Restricted media intake'],
    'Selected active endpoints report required management/protection state');
  coverage.forEach((row, index) => {
    const removed = index + 1;
    const active = Array.from({length: 18}, (_, i) => i + 1).filter(i => i > removed)
      .concat(Array.from({length: removed}, (_, i) => 19 + i));
    row.detail_rows = active.map(i => ({business_laptop_key: 'PW-LAP-' + String(i).padStart(2, '0'),
      source_version: 'PW26-SNAPSHOT-' + row.operating_date, manager: 'Brennan Huff',
      management_encryption: 'Managed and encryption state reconciled', installation: 'Unapproved installation privileges restricted',
      protection: 'Reporting checked; absence/missing data would escalate', media_intake: 'Restricted approved workflow'}));
    row.inventory_context = {active_laptops: 18, distinct_window_laptops: 21,
      opening_inventory_date: '2026-08-01', opening_keys: Array.from({length: 18}, (_, i) => 'PW-LAP-' + String(i + 1).padStart(2, '0')),
      replacements_follow_retirement: true, native_assets_created: 0};
  });
  population('C16-coverage', coverage);
  const responseSteps = ['Detection', 'Quarantine', 'Affected identity/device scope', 'Credential/session response', 'Known-clean restore/rebuild', 'Verified authorized return'];
  population('C16-response', [member('PW26-C16-response-01', '2026-10-26', 'Inert isolated-media exercise', 'Brennan Huff',
    [ref('PW26-C16-response-01', '2026-10-26')], responseSteps, 'Selected technical response completed before authorized return',
    'Exercise, not an actual malware incident; separate from the C18 tabletop',
    responseSteps.map(step => ({step, proposed_result: 'Scoped exercise decision retained with clean-return boundary'})))]);
  const health = rowsForMonth('C17-sources', 'Telemetry source health', [
    'Portal authorization/delivery', 'Cloud IAM/storage', 'Database authentication', 'GitHub administration',
    'Okta lifecycle', 'Endpoint protection', 'Backup/copy status'],
  ['Source owner', 'Last report', 'Significance/missing-data behavior', 'Recipient', 'Closure check'],
  'Scoped reporting and accountable missing-data routing checked');
  health.forEach(row => { row.detail_rows = row.detail_rows.map(detail => ({...detail,
    source_owner: 'Brennan Huff', last_report_on: row.operating_date,
    significance: detail.component === 'Portal authorization/delivery' ? 'Unauthorized or cross-project success needs investigation'
      : detail.component === 'Backup/copy status' ? 'Missing/failed/stale member needs accountable correction and a fresh check'
        : 'Unexpected administrative, authentication or posture change requires scoped review',
    missing_data_behavior: 'Missing reporting is a gap requiring routing and restoration, never evidence of no adverse activity',
    recipient: 'Brennan triage; Dale accountable disposition; Nancy assesses affected commitments',
    closure_check: 'Verify scoped cause, corrected reporting and reasoned closure or retained next action',
    authentic_provider_export: false})); });
  health[2].input_refs.push(ref('PW26-C17-MISSING-20261028', '2026-10-29'));
  population('C17-sources', health);
  const dispositions = [
    ['T01', '2026-08-07', 'Failed-login repetitions', 'Scope and success records checked; no supported compromise'],
    ['T02', '2026-08-21', 'Delivery retries', 'Expired links explain retries; no cross-project success'],
    ['T03', '2026-09-04', 'Privileged activity', 'Matched to approved bounded maintenance'],
    ['T04', '2026-09-14', 'Secondary-copy failure', 'Alert, scoped correction, rerun and verification retained'],
    ['T05', '2026-09-24', 'Separate synthetic provider service notice', 'Dependency/customer scope and accountable next action recorded'],
    ['T06', '2026-10-09', 'Portal errors', 'Selected release/workflow correlation and reasoned disposition retained'],
    ['T07', '2026-10-26', 'Same endpoint exercise signal', 'Inert signal identified as exercise; no extra incident'],
    ['T08', '2026-10-28', 'Missing-source injection', 'Routing, acknowledgement and reporting restoration retained'],
  ];
  population('C17-events', dispositions.map(([key, date, subject, result]) => {
    const id = 'PW26-C17-' + key;
    let refs, event = id;
    if (key === 'T04') { refs = [ref('PW26-BKV-20260914:failed-copy', date), ref('PW26-BKV-20260914:verified-rerun', date)]; event = 'PW26-BKV-20260914'; }
    else if (key === 'T07') { refs = [ref('PW26-C16-response-01', date)]; event = 'PW26-C16-response-01'; }
    else if (key === 'T08') { refs = [ref('PW26-C17-MISSING-20261028', date)]; event = 'PW26-C17-MISSING-20261028'; }
    else { source(id, date, {subject, result, authentic_provider_notice: false}); refs = [ref(id, date)]; }
    return member(id, date, subject, 'Brennan Huff', refs,
      ['Affected scope', 'Source references', 'Classification rationale', 'Accountable disposition', 'Closure/next action'],
      result, key === 'T04' ? 'Optional secondary-copy improvement Risk remains open' : 'Not the total alert stream',
      [{scope: subject, classification: /exercise|injection/i.test(subject) ? 'Synthetic exercise' : 'Selected triage case',
        rationale: result, accountable_disposition: result}], event);
  }));
  const tabletop = ['Uncertain customer/project scope', 'Responsibilities/deputies', 'Scoped containment', 'Preservation/timeline',
    'Nancy contractual assessment', 'Authorized factual communication', 'Correction/tests', 'Independent challenge/validation', 'Lessons/optional improvement'];
  source('PW26-C18-response-01', '2026-10-26', {hypothetical: 'Media-disclosure tabletop', decisions: tabletop});
  population('C18-response', [member('PW26-C18-response-01', '2026-10-26', 'Hypothetical media-disclosure tabletop',
    'Dale Doback; Brennan response; Nancy commitments; Robert sponsorship', [ref('PW26-C18-response-01', '2026-10-26')],
    tabletop, 'Responsibilities and scoped response decisions retained with independent provider challenge',
    'Draft notices are not sent communications or approval history',
    tabletop.map(decision => ({decision, disposition: 'Authorized scoped response or optional follow-up, not a fabricated real incident'})))]);
}

function buildServicePopulations({context, source, ref, member, population, rowsForMonth}) {
  population('C19-recovery', [member(RECOVERY.key, RECOVERY.operating_date, 'Full media, database, rights and index recovery',
    RECOVERY.performer, [ref(RECOVERY.key, RECOVERY.operating_date), ref('PW26-C25-I07', RECOVERY.operating_date),
      ref('PW26-C25-I11', RECOVERY.operating_date)], ['Six component checkpoints', 'Separate Dale service acceptance', 'Recovery/data-loss objectives'],
    '190-minute accepted-service recovery and 40-minute data gap versus 240/1440-minute objectives',
    'One fictional exercise; no reuse of legacy 2h40m or the 2024 failure as current proof',
    [...RECOVERY.checkpoints, {objective: 'Recovery', observed_minutes: 190, target_minutes: 240},
      {objective: 'Data gap', observed_minutes: 40, target_minutes: 1440}])]);

  const releaseDates = [
    '08-03', '08-05', '08-07', '08-10', '08-12', '08-14', '08-17', '08-19', '08-21', '08-24', '08-26', '08-28', '08-31',
    '09-02', '09-04', '09-07', '09-09', '09-11', '09-16', '09-18', '09-21', '09-23', '09-25', '09-28', '09-30',
    '10-02', '10-05', '10-07', '10-09', '10-12', '10-16', '10-19', '10-26', '10-28',
  ].map(value => '2026-' + value);
  const ordinarySubjects = ['Project grants', 'Link destinations/expiry', 'Rights/retention checks', 'Index reconciliation',
    'Dependency updates', 'Telemetry routing', 'Rollback/isolation maintenance'];
  let ordinaryIndex = 0;
  const releases = releaseDates.map((date, index) => {
    const key = 'O' + String(index + 1).padStart(2, '0'), id = 'PW26-REL-' + key;
    const shared = CHANGE_CASES.find(item => item[4] === key);
    const subject = shared ? shared[5] : ordinarySubjects[ordinaryIndex++ % ordinarySubjects.length];
    const event = shared ? 'PW26-CH-' + shared[0] : id;
    const fields = {
      authorized_scope: subject + ' limited to the approved service/project boundary',
      independent_review: 'A separate reviewer checks rights/authorization and the proposed difference',
      tests: 'Relevant positive/denied-path, integrity and regression cases retained',
      deployed_version: 'PW26-' + key + '-approved-v1 (fictional service version, not a GoverNara commit)',
      rollback: 'Prior accepted version and isolated rollback procedure retained',
      follow_up: shared ? 'Confirmation ' + shared[3] + ' retained separately from live release ' + date
        : 'Scoped result reconciled; no unresolved approval or required corrective action proposed',
    };
    if (['O06', 'O21', 'O30'].includes(key))
      fields.assisted_contribution = 'Code-assistant suggestion retained as untrusted input; human provenance/review/tests/release approval required';
    source(id, shared ? shared[3] : date, {release_date: date, subject, fields}, event);
    const refs = [ref(id, shared ? shared[3] : date)];
    if (shared) refs.push(ref(event + ':impact', shared[1]), ref(event + ':release', date), ref(event + ':confirmation', shared[3]));
    return member(id, date, subject, 'Brennan Huff', refs,
      ['Authorized scope', 'Independent review/checks', 'Tests', 'Deployed version', 'Rollback', 'Follow-up'],
      'Selected authorized version released and checked', 'No automatic deployment or retrospectively applied October Policy version',
      Object.entries(fields).map(([field, value]) => ({field, value})), event);
  });
  const e1 = {failed_copy_at: '2026-09-14T13:20:00Z', emergency_authorized_at: '2026-09-14T13:30:00Z',
    corrected_at: '2026-09-14T13:36:00Z', rerun_at: '2026-09-14T13:45:00Z',
    checked_at: '2026-09-14T13:50:00Z', follow_up_date: '2026-09-15',
    scope: 'Secondary-copy permission/routing only', review: 'Independent emergency authorization before correction',
    tests: 'Failed attempt and successful scoped rerun both retained', version: 'PW26-E01-correction-v1',
    rollback: 'Prior scope and isolation basis retained', disposition: 'Required correction checked; optional secondary-copy Risk remains open'};
  source('PW26-REL-E01', '2026-09-15', e1, 'PW26-BKV-20260914');
  releases.push(member('PW26-REL-E01', '2026-09-14', 'Secondary-copy emergency correction', 'Brennan Huff',
    [ref('PW26-BKV-20260914:failed-copy', '2026-09-14'), ref('PW26-BKV-20260914:verified-rerun', '2026-09-14'),
      ref('PW26-REL-E01', '2026-09-15')],
    ['Emergency authorization before change', 'Correction', 'Rerun/check', 'Rollback', 'Separate follow-up'],
    'Same failed-copy source corrected, checked and reviewed the next day', 'Not another backup batch or failure',
    [e1], 'PW26-BKV-20260914'));
  const e2 = {failed_deployment_date: '2026-10-13', subject: 'Delivery manifest/index deployment',
    authorization: 'Emergency scoped change authorized before execution', version: 'PW26-E02-candidate-v1',
    independent_review: 'Separate reviewer checks authorized manifest/index scope, relevant tests and the rollback basis',
    tests: 'Original failed candidate retained; fresh corrected candidate tested October 14', rollback: 'Precautionary rollback before incorrect delivery',
    correction_test_date: '2026-10-14', follow_up_date: '2026-10-15',
    disposition: 'Corrected result and follow-up retained; no unresolved approval failure proposed'};
  source('PW26-REL-E02', '2026-10-15', e2);
  releases.push(member('PW26-REL-E02', '2026-10-13', 'Delivery-manifest/index emergency rollback', 'Brennan Huff',
    [ref('PW26-REL-E02', '2026-10-15')], ['Authorization', 'Failed deployment', 'Precautionary rollback', 'Fresh tests', 'Later follow-up'],
    'Failed deployment, rollback and subsequent correction remain distinct', 'No incorrect customer delivery is proposed', [e2]));
  population('C20-release', releases, ['O01', 'O06', 'O08', 'O12', 'O15', 'O19', 'O21', 'O24', 'O28', 'O30', 'O33', 'O34', 'E01', 'E02']
    .map(key => 'PW26-REL-' + key));

  const continuitySteps = ['Contact/deputy routing', 'Authorized recovery-material retrieval', 'Decision authority',
    'Customer impact', 'Prioritization', 'Reconciliation/return'];
  source('PW26-BCP-20261028', '2026-10-28', {steps: continuitySteps, business_authority: 'Robert Doback',
    coordinator: 'Dale Doback', customer_context: 'Nancy Huff', provider_role: 'Harbor Signal retained authorized role'});
  population('C21-continuity', [member('PW26-BCP-20261028', '2026-10-28', 'Staff/provider disruption and deputies', 'Robert Doback; Dale coordinates',
    [ref('PW26-BCP-20261028', '2026-10-28')], continuitySteps,
    'Required routing, decisions and authorized return retained', 'Concentration Risks remain; not a second technical restore',
    [...continuitySteps.map(step => ({step, decision: 'Selected disruption role and boundary retained'})),
      {decision: 'Business authority', owner: 'Robert Doback'}, {decision: 'Return disposition', owner: 'Dale Doback'}])]);

  const suppliers = [
    ['aws', '2026-08-28', 'Hosting/database/media', 'Prestige configuration/access/recovery versus provider-operated infrastructure'],
    ['okta', '2026-09-29', 'Workforce identity', 'Covered identity service versus direct, service and project routes'],
    ['backblaze', '2026-10-23', 'Secondary copy/retrieval', 'Scoped copy access, retrieval tests and Prestige recovery responsibility'],
    ['openai', '2026-10-28', 'Public marketing drafts', 'Public/nonconfidential inputs only; confidential media/terms prohibited'],
  ];
  population('C22-suppliers', suppliers.map(([key, date, subject, duties]) => {
    const vendor = context.vendors[key], id = 'PW26-C22-' + key.toUpperCase();
    const next = (context.db.reviews || []).filter(row => row.client_id === CID && row.vendor_id === vendor.vendor_id
      && !['completed', 'cancelled'].includes(row.status) && row.due_date?.slice(0, 10) > ANCHOR.slice(0, 10))
      .map(row => ({review_id: row.review_id, occurrence_id: occurrenceId(row), review_type: row.review_type,
        due_date: row.due_date, status: row.status}));
    source(id, date, {vendor_fact_key: key, subject, duties, disposition: 'Requested assurance/gaps and accountable future obligation remain distinct'});
    return member(id, date, subject + ' / ' + key, 'Dale Doback', [ref(id, date)],
      ['Handled data/dependency/access', 'Shared responsibilities', 'Assurance request/gaps', 'Rationale/owner', 'Actual future next action'],
      'Scoped diligence and disposition retained without claiming received reports or approval',
      'Open obligations stay open; four cases are not four Reviews, renewals or CPA reports',
      [{vendor_id: vendor.vendor_id, scope: subject, responsibilities: duties, assurance: 'Request/gap disposition, not a received opinion',
        accountable_owner_id: vendor.owner_id, next_actions: next}]);
  }));

  const capacityTrials = [
    {key: 'CAP-OCT-1', scope: 'fictional_Prestige_service', rights_sessions: 24, delivery_requests: 6, operator_sessions: 2,
      selected_operations: 400, rights_p95_ms: 1900, rights_target_ms: 1500, delivery_p95_ms: 1800, delivery_target_ms: 2000,
      unexpected_authorization_successes: 0, result: 'initial_rights_target_miss', disposition: 'Retain bottleneck diagnosis and bounded profile correction'},
    {key: 'CAP-OCT-2', scope: 'fictional_Prestige_service', rights_sessions: 24, delivery_requests: 6, operator_sessions: 2,
      selected_operations: 400, rights_p95_ms: 1180, rights_target_ms: 1500, delivery_p95_ms: 1610, delivery_target_ms: 2000,
      unexpected_authorization_successes: 0, selected_valid_operation_failures: 0, result: 'same_envelope_correction',
      disposition: 'No provider/GoverNara quota or allocated-resource increase'},
    {key: 'CAP-OCT-3', scope: 'fictional_Prestige_service', rights_sessions: 8, delivery_requests: 2, operator_sessions: 1,
      selected_operations: null, rights_p95_ms: 1050, rights_target_ms: 1500, delivery_p95_ms: 1420, delivery_target_ms: 2000,
      result: 'reduced_normal_demand_rollback', peak_demand_qualified: false,
      disposition: 'Reapply corrected profile and check configuration integrity/authorization inside this trial; no fourth performance result'},
  ];
  source('PW26-C23-TRIALS-20261027', '2026-10-27', {trials: capacityTrials, actual_GoverNara_benchmark: false});
  const capacity = rowsForMonth('C23-capacity', 'Service capacity review', [
    'Portal/media/rights/index demand', 'Latency/errors/queues', 'Provider constraints', 'Growth assumptions', 'Accountable action'],
  ['Full workflow boundary', 'Demand and latency', 'Constraints', 'Bottleneck/rollback', 'Remaining assumptions'],
  'Selected service-capacity inputs and decisions retained; not actual fixture-storage qualification');
  capacity[2].input_refs.push(ref('PW26-C23-TRIALS-20261027', '2026-10-29'));
  capacity[2].detail_rows = capacityTrials;
  population('C23-capacity', capacity);

  const deepBackupDays = ['2026-08-01', '2026-08-14', '2026-08-28', '2026-09-01', '2026-09-14', '2026-09-30', '2026-10-01', '2026-10-23', '2026-10-29'];
  const backups = [];
  for (let index = 0; index < 90; index += 1) {
    const date = new Date(Date.parse('2026-08-01T00:00:00Z') + index * 86400000).toISOString().slice(0, 10);
    const id = 'PW26-BKV-' + date.replace(/-/g, ''), recoveryInput = date === '2026-10-23';
    const sourceTime = date + (recoveryInput ? 'T13:20:00Z' : 'T13:00:00Z');
    const components = ['media-copy', 'PostgreSQL-copy', 'rights-index-copy'].map((component, componentIndex) => {
      const normalRuns = recoveryInput ? ['13:21', '13:31', '13:41'] : ['13:05', '13:12', '13:20'];
      const normalChecks = recoveryInput ? ['13:30', '13:40', '13:50'] : ['13:10', '13:18', '13:28'];
      const failed = date === '2026-09-14' && componentIndex === 2;
      const attempts = [{attempt: 1, run_at: date + 'T' + normalRuns[componentIndex] + ':00Z',
        checked_at: date + 'T' + normalChecks[componentIndex] + ':00Z', result: failed ? 'failed' : 'success'}];
      if (failed) {
        attempts[0].checked_at = '2026-09-14T13:20:00Z';
        attempts.push({attempt: 2, run_at: '2026-09-14T13:45:00Z', checked_at: '2026-09-14T13:50:00Z', result: 'success'});
      }
      return {component, source_version: id + ':' + component + ':source-v1', copy_version: id + ':' + component + ':copy-v1',
        source_at: sourceTime, scheduled_at: sourceTime, time_provenance: 'newly_authored_fictional_operating_detail',
        attempts, final_available: true, accountable_disposition: failed
          ? 'Original failure, alert, emergency authorization, correction and verified rerun retained'
          : 'Selected copy available and checked; no immutability/full-recovery claim'};
    });
    const accepted = date + (date === '2026-09-14' || recoveryInput ? 'T13:55:00Z' : 'T13:30:00Z');
    source(id, accepted, {components, accepted_at: accepted, latest_consistent_input: sourceTime});
    backups.push(member(id, date, 'Daily media/database/index verification ' + date, 'Brennan Huff',
      [ref(id, date)], ['All three logical copies', 'Availability/age', 'Failed/stale-copy routing', 'Accountable verification'],
      'Three final logical-member results available and checked', date === '2026-09-14'
        ? 'One initial rights-index failure plus successful rerun; optional improvement Risk stays open'
        : 'No unresolved stale copy proposed; copy success is not full recovery',
      components, id));
  }
  population('C24-backups', backups, deepBackupDays.map(date => 'PW26-BKV-' + date.replace(/-/g, '')));

  const confirmations = ['2026-10-26', '2026-10-26', '2026-10-26', '2026-10-26', '2026-10-27', '2026-10-27',
    '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28', '2026-10-28', '2026-10-29', '2026-10-29'];
  population('C25-intake', INTAKES.map(([key, date, subject, decision], index) => member('PW26-C25-' + key, date,
    subject, 'Nancy Huff; Derek applies creative handling', [ref('PW26-C25-' + key, date)],
    ['Rights basis', 'Sensitivity', 'Authorized membership', 'Retention/hold tags', 'Supplier destinations', 'Creative/AI restrictions'],
    decision, ['I04', 'I07', 'I10', 'I13'].includes(key) ? 'Material change to an existing decision; not another new customer'
      : 'New fictional business case; no GoverNara project/client created',
    [{rights_basis: subject, handling_decision: decision, authorized_membership: 'Named purpose-bound project roles',
      supplier_destination: 'Selected approved service only', creative_ai: 'Confidential material excluded from public AI',
      current_version_confirmation: {date: confirmations[index], result: 'October current-version conformance checked later; original input is not rewritten'}}])));
  const disposals = [
    ['D01', '2026-08-20', 'Obsolete P01 working renders; licensed master retained'],
    ['D02', '2026-09-08', 'Ended P02 contractor proxy workspace'],
    ['D03', '2026-09-22', 'Superseded P03 review export; later I08 version distinct'],
    ['D04', '2026-10-15', 'Superseded P02 analytical extract; retained-copy/supplier disposition recorded'],
    ['D05', '2026-10-27', 'I10-held P03 material'],
  ];
  population('C25-disposal', disposals.map(([key, date, subject]) => {
    const id = 'PW26-C25-' + key, held = key === 'D05';
    const detail = {customer_instruction: subject, hold_check: held ? 'Recorded hold applies' : 'No blocking hold for selected removal scope',
      removal_scope: held ? null : subject, required_retained_records: 'License and approval records remain',
      backup_disposition: 'Documented expiry and retained-copy treatment, not immediate irreversible erasure',
      status: held ? 'deferred_under_hold' : 'authorized_scoped_disposal', follow_up_date: held ? '2026-11-16' : null,
      follow_up_state: held ? 'open; not a native Task/Review or hold release' : 'Selected disposition retained'};
    source(id, date, detail);
    return member(id, date, subject, 'Brennan Huff; Nancy authorizes', [ref(id, date)],
      ['Instruction and hold', 'Media/version scope', 'Copies/extracts', 'Supplier follow-up'],
      held ? 'Destruction correctly deferred' : 'Only authorized scoped material removed',
      held ? 'Future follow-up remains open; no destruction claimed' : 'Required records and documented backup expiry preserved', [detail]);
  }));
}
