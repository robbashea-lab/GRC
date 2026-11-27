import {activeDefinitions, frameworkCatalog} from '../../lib/frameworks';
import {validImplementationPosition} from '../../lib/portfolioProgress';
import {DUNDER_ISO_HISTORY_VERSION} from '../../lib/demoClients';
import {fixtureFingerprint} from '../cisDemoHistoryContext';
import {stable} from '../commandRequests';
import {clientAccess} from '../assignmentEligibility';
import {DUNDER_ID as CID, DUNDER_SCENARIO_VERSION, EIGHT_YEAR_ANCHOR as ANCHOR} from './isoSocEightYearSupport';

const PROGRAM = CID + ':iso-27001';
const VERSION = 'dunder-iso27001-prepared-history-v1';
const CATALOG = '2022 + Amd 1:2024';
const MEASURE = 'native-implementation-v1';
const SAVED_AT = ['2024-03-18', '2024-09-20', '2025-09-26', '2026-09-25'].map(day => day + 'T00:00:00.000Z');
const POINT_IDS = SAVED_AT.slice(0, 2).map((at, index) => `demo:${PROGRAM}:${at}:${index}`);
const EXCLUDED = ['A.8.4', 'A.8.28'];
const INITIAL_GAPS = ['A.5.30', 'A.8.13', 'A.8.16'];
const STATUS = ['addressed', 'in_progress', 'needs_attention', 'not_assessed'];
const MARKER_KEYS = ['schema_version', 'version', 'fixture_version', 'client_id', 'program_id',
  'framework_key', 'catalog_version', 'measure_version', 'anchor', 'point_ids',
  'source_fingerprints', 'point_fingerprints', 'identity_fingerprint'];
const MODELED_KEYS = ['schema_version', 'version', 'fixture_version', 'client_id', 'program_id',
  'framework_key', 'anchor', 'prepared_fingerprint', 'intervals', 'fingerprint'];
const HISTORY_ROLES = ['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer'];
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const same = (left, right) => stable(left) === stable(right);
const fingerprint = value => fixtureFingerprint(stable(value));
const instant = value => typeof value === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const inactive = row => row.archived || row.archived_at || ['archived', 'inactive', 'retired', 'offboarding', 'terminated', 'revoked'].includes(row.status);
const sourceRevision = index => `demo-source:${PROGRAM}:${index + 1}`;

function qualifiedCohort(db, at) {
  if (!plain(db) || !Array.isArray(db.clients) || !db.clients.every(plain)) return false;
  const clients = Array.isArray(db?.clients) ? db.clients.filter(row => plain(row) && row.client_id === CID) : [];
  const client = clients[0], baseline = db?.baselines?.[CID], actor = db?.user;
  return instant(at) && Date.parse(at) >= Date.parse(ANCHOR)
    && plain(actor) && actor.workspace_mode === 'demo' && actor.status === 'active' && !!actor.user_id
    && ['super_admin', 'platform_admin'].includes(actor.role) && clientAccess(actor, CID)
    && clients.length === 1 && client.environment === 'Demo' && client.status === 'active' && !inactive(client)
    && client.demo_program_version === DUNDER_SCENARIO_VERSION
    && plain(baseline) && baseline.completed === true && baseline.requirements?.['iso-27001'] === 'applies'
    && baseline.updated_at === ANCHOR && client.initial_program_baseline?.completed_at === ANCHOR
    && client.initial_program_baseline.state?.completed === true
    && client.initial_program_baseline.state.updated_at === ANCHOR;
}

function sourceRows(db, definitions, at) {
  const rows = (db.framework_assessments || []).filter(row => row.client_id === CID && row.framework_key === 'iso-27001');
  if (rows.length !== 123 || new Set(rows.map(row => row.framework_assessment_id)).size !== 123
    || new Set(rows.map(row => row.definition_id)).size !== 123) return null;
  for (const row of rows) {
    if (!definitions.some(definition => definition.id === row.definition_id)
      || !row.framework_assessment_id || row.framework_version !== CATALOG || inactive(row)
      || db.framework_assessments.filter(record => record.framework_assessment_id === row.framework_assessment_id).length !== 1
      || row.created_at !== SAVED_AT[0] || !Array.isArray(row.assessment_history) || row.assessment_history.length < 4) return null;
    const history = row.assessment_history;
    for (let index = 0; index < history.length; index += 1) {
      const event = history[index];
      if (!plain(event) || !instant(event.at) || !event.by || Date.parse(event.at) > Date.parse(at)) return null;
      if (index >= 4) {
        if (Date.parse(event.at) <= Date.parse(ANCHOR)) return null;
        continue;
      }
      const excluded = EXCLUDED.includes(row.definition_id);
      const status = excluded ? 'not_applicable' : index === 0 && INITIAL_GAPS.includes(row.definition_id) ? 'in_progress' : 'addressed';
      if (event.at !== SAVED_AT[index] || event.status !== status) return null;
      const definition = definitions.find(item => item.id === row.definition_id);
      if (definition.specification === 'annex_control' && (event.soa_applicability !== (excluded ? 'excluded' : 'included')
        || !event.soa_justification?.trim())) return null;
    }
  }
  return [...rows].sort((left, right) => left.framework_assessment_id.localeCompare(right.framework_assessment_id));
}

function expectedScope(db, definitions, rows) {
  const enrollment = (db.requirements || []).filter(row => row.client_id === CID && row.baseline_key === 'iso-27001'
    && row.baseline_response === 'applies' && !inactive(row));
  if (enrollment.length !== 1 || !enrollment[0].requirement_id) return null;
  return scopeForEnrollment(definitions, rows, [enrollment[0].requirement_id]);
}

function scopeForEnrollment(definitions, rows, enrollmentIds) {
  return {framework_key: 'iso-27001', catalog_version: CATALOG, configuration: {},
    definition_ids: definitions.map(row => row.id).sort(),
    applicability: Object.fromEntries(definitions.map(row => [row.id, EXCLUDED.includes(row.id) ? 'excluded' : 'included'])),
    source_versions: rows.map(row => [row.definition_id, row.framework_version]).sort(), measure_version: MEASURE,
    enrollment_ids: enrollmentIds};
}

function referencesAt(rows, index) {
  return rows.map(row => ({kind: 'framework_assessments', id: row.framework_assessment_id,
    definition_id: row.definition_id, framework_version: row.framework_version,
    status: row.assessment_history[index].status, version: row.assessment_history[index].at}));
}

function validPoint(point, index, scope, references) {
  const value = point.current;
  const expected = STATUS.map(key => ({key, count: references.filter(row => row.status === key).length}));
  const implemented = expected[0].count;
  return point.client_id === CID && point.program_id === PROGRAM && point.framework_key === 'iso-27001'
    && point.program_key === 'iso-27001' && point.framework_version === CATALOG
    && point.snapshot_id === POINT_IDS[index] && point.captured_at === SAVED_AT[index] && point.effective_at === SAVED_AT[index]
    && point.source_revision === sourceRevision(index) && value?.source_revision === sourceRevision(index)
    && Array.isArray(value?.counts) && Array.isArray(value.included_counts)
    && validImplementationPosition(point) && value.program_id === PROGRAM && value.measure_version === MEASURE
    && value.availability === 'available' && value.total === 123 && value.denominator === 121 && value.excluded === 2
    && value.implemented === implemented && value.percentage === implemented / 121 * 100
    && !value.missing_records && !value.duplicate_records && !value.unrecognized_status_count
    && !value.invalid_applicability_count && !value.scope_undetermined
    && value.scope_signature === `demo-scope:${PROGRAM}:0` && same(value.scope, scope)
    && same(value.provenance?.source_references, references)
    && same((value.included_counts || []).map(row => ({key: row.key, count: row.count})), expected)
    && value.counts?.filter(row => row.key === 'excluded').length === 1
    && value.counts.find(row => row.key === 'excluded').count === 2
    && value.status_signature === stable({scope_signature: value.scope_signature, included_counts: value.included_counts,
      implemented, denominator: 121, availability: 'available'})
    && ![point, value, value.provenance || {}].some(row => Object.keys(row).some(key =>
      key === 'modeled_until' || key.startsWith('join_') || key.startsWith('held_')));
}

function preparedPoint(point) {
  const result = {...point, observation_kind: 'demo_fixture', source_event: null,
    current: {...point.current, observation_kind: 'demo_fixture', source_event: null,
      provenance: {...point.current.provenance, kind: 'demo_fixture', source_event: null,
        label: 'Fictional Demo assessment history'}}};
  for (const value of [result, result.current, result.current.provenance]) {
    delete value.continuity_proven; delete value.effective_until; delete value.continuity_source_event;
  }
  return result;
}

function nativeHistory(db, at) {
  if (frameworkCatalog('iso-27001')?.version !== CATALOG) return null;
  if (!Array.isArray(db.framework_assessments) || !db.framework_assessments.every(plain)
    || !Array.isArray(db.requirements) || !db.requirements.every(plain)) return null;
  const definitions = activeDefinitions('iso-27001');
  if (definitions.length !== 123 || definitions.filter(row => row.specification === 'isms_clause').length !== 30
    || definitions.filter(row => row.specification === 'annex_control').length !== 93) return null;
  const rows = sourceRows(db, definitions, at);
  if (!rows) return null;
  const history = db.portfolio_reporting;
  if (!Array.isArray(history?.snapshots) || !history.snapshots.every(plain)
    || !Array.isArray(history.identities) || !history.identities.every(plain)) return null;
  const snapshots = POINT_IDS.map(id => history.snapshots.filter(point => point.snapshot_id === id));
  if (snapshots.some(points => points.length !== 1)) return null;
  const points = snapshots.map(points => points[0]);
  return {definitions, rows, history, points};
}

function sourceProof(data, scope) {
  const {rows, points} = data;
  if (points.some((point, index) => !validPoint(point, index, scope, referencesAt(rows, index)))) return null;
  const source_fingerprints = SAVED_AT.map((at, index) => fingerprint({scope,
    rows: rows.map(row => ({id: row.framework_assessment_id, definition_id: row.definition_id,
      framework_version: row.framework_version, history: row.assessment_history.slice(0, index + 1)}))}));
  return {snapshots: points, source_fingerprints};
}

function preparedSource(db, at) {
  if (!qualifiedCohort(db, at)) return null;
  const data = nativeHistory(db, at);
  if (!data) return null;
  const {definitions, rows, history} = data;
  const scope = expectedScope(db, definitions, rows);
  if (!scope || history.snapshots.filter(point =>
    point.program_id === PROGRAM || point.client_id === CID && point.framework_key === 'iso-27001').length !== 2) return null;
  const proof = sourceProof(data, scope);
  if (!proof) return null;
  const identities = history.identities.filter(row => row.program_id === PROGRAM);
  if (identities.length !== 1) return null;
  const identity = identities[0];
  const implementationScope = {...scope}; delete implementationScope.enrollment_ids;
  if (!exact(identity, ['program_id', 'scopes', 'head']) || !same(identity.scopes, [stable(implementationScope)])
    || !exact(identity.head, ['signature', 'revision']) || identity.head.revision !== 4
    || identity.head.signature !== stable({scope, references: referencesAt(rows, 3)})) return null;
  return {...proof, identities};
}

function markerFor(source, snapshots) {
  return {schema_version: 1, version: VERSION, fixture_version: DUNDER_SCENARIO_VERSION,
    client_id: CID, program_id: PROGRAM, framework_key: 'iso-27001', catalog_version: CATALOG,
    measure_version: MEASURE, anchor: ANCHOR, point_ids: [...POINT_IDS],
    source_fingerprints: source.source_fingerprints, point_fingerprints: snapshots.map(fingerprint),
    identity_fingerprint: fingerprint(source.identities[0])};
}

// First-save admission only. This does not qualify modeled intervals or report/forecast eligibility.
export function qualifiedDunderPreparedHistory(db, at) {
  // Optional imported provenance must fail closed without breaking unrelated native saves.
  try {
    const marker = db?.dunder_demo_prepared_history;
    if (!exact(marker, MARKER_KEYS)) return null;
    const source = preparedSource(db, at);
    if (!source || source.snapshots.some(point => !same(point, preparedPoint(point)))
      || !same(marker, markerFor(source, source.snapshots))) return null;
    return {snapshots: clone(source.snapshots), identities: clone(source.identities), point_ids: [...POINT_IDS],
      client_id: CID, program_id: PROGRAM, anchor: ANCHOR};
  } catch {
    return null;
  }
}

// Explicit fresh source builder only; current assessments, histories and foreign records are untouched.
export function registerDunderPreparedHistory(db) {
  if (!plain(db)) throw new Error('Invalid initial Dunder prepared history source');
  if (Object.hasOwn(db, 'dunder_demo_prepared_history')) {
    if (!qualifiedDunderPreparedHistory(db, ANCHOR)) throw new Error('Dunder prepared history source must be retained');
    return false;
  }
  const source = preparedSource(db, ANCHOR);
  if (!source) throw new Error('Invalid initial Dunder prepared history source');
  const snapshots = source.snapshots.map(preparedPoint), marker = markerFor(source, snapshots);
  const replacements = new Map(snapshots.map(point => [point.snapshot_id, point]));
  const reporting = {...db.portfolio_reporting, snapshots: db.portfolio_reporting.snapshots.map(point => replacements.get(point.snapshot_id) || point)};
  const reportingSlot = Object.getOwnPropertyDescriptor(db, 'portfolio_reporting');
  if (!reportingSlot?.writable || !Object.isExtensible(db)) throw new Error('Dunder prepared history source is not writable');
  db.portfolio_reporting = reporting;
  Object.defineProperty(db, 'dunder_demo_prepared_history', {value: marker, enumerable: true, writable: true, configurable: true});
  return true;
}

function modeledReaderCohort(db, clientId, at) {
  if (clientId !== CID || !plain(db) || !instant(at) || Date.parse(at) < Date.parse(ANCHOR)
    || !Array.isArray(db.clients) || !db.clients.every(plain)) return false;
  const clients = db.clients.filter(row => row.client_id === CID), client = clients[0], actor = db.user;
  const baseline = db.baselines?.[CID], original = client?.initial_program_baseline;
  const access = plain(actor) && HISTORY_ROLES.includes(actor.role) && (clientAccess(actor, CID)
    || actor.role === 'client_viewer' && Array.isArray(actor.client_ids) && actor.client_ids.includes(CID));
  return access && actor.workspace_mode === 'demo' && actor.status === 'active' && !!actor.user_id
    && clients.length === 1 && client.environment === 'Demo' && client.status === 'active' && !inactive(client)
    && client.demo_program_version === DUNDER_SCENARIO_VERSION
    && plain(baseline) && baseline.completed === true && baseline.requirements?.['iso-27001'] === 'applies'
    && plain(original) && original.completed_at === ANCHOR && original.state?.completed === true
    && original.state.updated_at === ANCHOR;
}

function modeledPreparedProof(db, at) {
  const prepared = db.dunder_demo_prepared_history;
  if (!exact(prepared, MARKER_KEYS)) return null;
  const data = nativeHistory(db, at);
  if (!data) return null;
  const {definitions, rows, history, points} = data;
  const originalScope = points[0].current?.scope, enrollmentIds = originalScope?.enrollment_ids;
  if (!plain(originalScope) || !Array.isArray(enrollmentIds) || enrollmentIds.length !== 1 || !enrollmentIds[0]) return null;
  const enrollment = db.requirements.filter(row => row.requirement_id === enrollmentIds[0]);
  if (enrollment.length !== 1 || enrollment[0].client_id !== CID || enrollment[0].baseline_key !== 'iso-27001'
    || enrollment[0].baseline_response !== 'applies' || inactive(enrollment[0])) return null;
  if (db.requirements.filter(row => row.client_id === CID && row.baseline_key === 'iso-27001'
    && row.baseline_response === 'applies' && !inactive(row)).length !== 1) return null;
  const scope = scopeForEnrollment(definitions, rows, enrollmentIds);
  const proof = sourceProof(data, scope);
  if (!proof || proof.snapshots.some(point => !same(point, preparedPoint(point)))) return null;
  const owned = history.snapshots.filter(point => point.program_id === PROGRAM
    || point.client_id === CID && point.framework_key === 'iso-27001');
  if (new Set(owned.map(point => point.snapshot_id)).size !== owned.length
    || owned.some(point => !POINT_IDS.includes(point.snapshot_id) && !laterNativePoint(point, at))) return null;
  const implementationScope = {...scope}; delete implementationScope.enrollment_ids;
  const scopeText = stable(implementationScope);
  const identities = history.identities.filter(row => row.program_id === PROGRAM), current = identities[0];
  if (identities.length !== 1 || !Array.isArray(current.scopes) || current.scopes[0] !== scopeText
    || new Set(current.scopes).size !== current.scopes.length || !current.scopes.every(value => typeof value === 'string')
    || !plain(current.head) || !Number.isInteger(current.head.revision) || current.head.revision < 4
    || typeof current.head.signature !== 'string' || !current.head.signature) return null;
  // Bind the original v4 identity, never today's advanced native source/head or scope.
  const originalIdentity = {program_id: PROGRAM, scopes: [scopeText], head: {
    signature: stable({scope, references: referencesAt(rows, 3)}), revision: 4}};
  return same(prepared, markerFor({...proof, identities: [originalIdentity]}, proof.snapshots)) ? prepared : null;
}

function laterNativePoint(point, at) {
  const kind = point.observation_kind, value = point.current, effective = point.effective_at || point.captured_at;
  return point.client_id === CID && point.program_id === PROGRAM && point.framework_key === 'iso-27001'
    && point.program_key === 'iso-27001' && point.framework_version === CATALOG
    && typeof point.snapshot_id === 'string' && !!point.snapshot_id
    && instant(effective) && instant(point.captured_at) && Date.parse(effective) >= Date.parse(ANCHOR)
    && Date.parse(effective) <= Date.parse(point.captured_at) && Date.parse(point.captured_at) <= Date.parse(at)
    && ['current_baseline', 'sampled', 'committed_event'].includes(kind)
    && plain(value) && value.program_id === PROGRAM && value.measure_version === MEASURE
    && value.observation_kind === kind && value.provenance?.kind === kind
    && typeof point.source_revision === 'string' && !!point.source_revision && value.source_revision === point.source_revision
    && point.source_event === point.snapshot_id && value.source_event === point.snapshot_id
    && value.provenance.source_event === point.snapshot_id;
}

function modeledMarker(prepared) {
  const marker = {schema_version: 1, version: DUNDER_ISO_HISTORY_VERSION, fixture_version: DUNDER_SCENARIO_VERSION,
    client_id: CID, program_id: PROGRAM, framework_key: 'iso-27001', anchor: ANCHOR,
    prepared_fingerprint: fingerprint(prepared), intervals: [
      {point_id: POINT_IDS[0], from: SAVED_AT[0], until: SAVED_AT[1]},
      {point_id: POINT_IDS[1], from: SAVED_AT[1], until: ANCHOR},
    ]};
  return {...marker, fingerprint: fingerprint(marker)};
}

// Explicit fresh-builder opt-in only. Existing prepared rows, files and stored observations stay byte-identical.
export function registerDunderModeledHistory(db) {
  if (!plain(db) || !qualifiedDunderPreparedHistory(db, ANCHOR))
    throw new Error('Modeled Dunder history requires its fresh prepared source');
  const marker = modeledMarker(db.dunder_demo_prepared_history);
  if (Object.hasOwn(db, 'dunder_demo_modeled_history')) {
    if (!exact(db.dunder_demo_modeled_history, MODELED_KEYS) || !same(db.dunder_demo_modeled_history, marker))
      throw new Error('The modeled Dunder source marker must be retained');
    return false;
  }
  if (!Object.isExtensible(db)) throw new Error('The modeled Dunder source is not writable');
  Object.defineProperty(db, 'dunder_demo_modeled_history', {value: marker, enumerable: true, writable: true, configurable: true});
  return true;
}

// The reporting route still authorizes native reads and qualifies the current endpoint separately.
export function getDunderDemoScenarioContext(db, clientId, at) {
  try {
    const marker = db?.dunder_demo_modeled_history;
    if (!exact(marker, MODELED_KEYS) || !modeledReaderCohort(db, clientId, at)) return null;
    const prepared = modeledPreparedProof(db, at);
    if (!prepared || !same(marker, modeledMarker(prepared))) return null;
    return {version: DUNDER_ISO_HISTORY_VERSION, client_id: CID, program_id: PROGRAM, anchor: ANCHOR,
      fingerprint: marker.fingerprint, point_ids: [...POINT_IDS]};
  } catch {
    return null;
  }
}
