import {stable} from '../commandRequests';
import {write} from '../store';
import {prepareDemoEvidenceUpload, evidenceLibraryRequest} from '../evidence';
import {frameworkRequest} from '../frameworks';
import {organizationalControlRequest} from '../organizationalControls';
import {preparePrestigeNativeOnboarding} from './prestigeNativeOnboarding';
import {createPrestigeCurrentModel} from './prestigeCurrentModel';
import {preparePrestigeScenarioSource, createPrestigeScenarioAssets} from './prestigeScenarioSource';
import {createPrestigeEightYearHistory} from './prestigeEightYearHistory';
import {createPrestigeOrganizationReviews} from './prestigeOrganizationReviews';
import {createPrestigeCurrentControlDesigns} from './prestigeCurrentControls';
import {createPrestigeOperatingArtifacts, bindPrestigeOperatingArtifacts} from './prestigeOperatingArtifacts';
import {recordPrestigeOperatingObservations} from './prestigeOperatingObservations';
import facts from './prestigeCurrentControlFacts.json';
import {createPrestigeReportingHistory} from './prestigeReportingHistorySource';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Prestige eight-year source: ' + message); };
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generation only: never called by startup or a retained visitor's session.
export async function createPrestigeEightYearSource(source, {purpose, document_facts: documents} = {}) {
  if (purpose !== 'eight_year_source_qa' || !documents)
    fail('explicit source authoring and document issuance facts are required.');
  const backup = copy(source);
  // Validate the real full input before isolating authoring work; inbound foreign links must not disappear unnoticed.
  preparePrestigeNativeOnboarding(source, {clock: new Date(ANCHOR), purpose: 'native_onboarding_qa'});
  // Native source generation needs one client. Capacity qualification installs its owned slice into the full cohort.
  const authoring = {...source};
  for (const [kind, rows] of Object.entries(source)) if (Array.isArray(rows)
    && !['users', 'contacts'].includes(kind)) authoring[kind] = rows.filter(row => row.client_id === CID);
  authoring.portfolio_reporting = {};
  const context = preparePrestigeScenarioSource(authoring, {purpose});
  const prepared = preparePrestigeNativeOnboarding(context.source,
    {clock: new Date(ANCHOR), purpose: 'native_onboarding_qa'});
  let result = await createPrestigeCurrentModel(prepared, {clock: new Date(ANCHOR),
    purpose: 'current_model_source_qa', expected_source_sha256: await digest(prepared.backup)});
  result = await createPrestigeEightYearHistory(result,
    {clock: new Date(ANCHOR), purpose: 'eight_year_history_source_qa'});
  result = createPrestigeOrganizationReviews(result, {purpose: 'organization_review_source_qa'});
  result = createPrestigeScenarioAssets(result, {purpose: 'eight_year_assets_source_qa'});
  result = await createPrestigeCurrentControlDesigns(result,
    {clock: new Date(ANCHOR), purpose: 'current_control_designs_source_qa'});
  const issuedDocuments = typeof documents === 'function' ? documents({
    model_recorded_at: result.manifest.recorded_at, history_recorded_at: result.historyManifest.recorded_at,
  }) : documents;
  const artifacts = await createPrestigeOperatingArtifacts(result, {
    purpose: 'operating_artifact_source_qa', expected_model_receipt_sha256: result.manifest.receipt_sha256,
    document_facts: issuedDocuments, historyManifest: result.historyManifest,
  });
  const installed = await installMaterialEvidence(result, artifacts);
  result = installed.result;
  const controlRevisions = Object.fromEntries(facts.controls.map(fact => [fact.key,
    result.db.organizational_controls.find(row => row.control_id === result.controlsManifest.control_ids[fact.key]).updated_at]));
  // This receipt deliberately certifies designs and files BEFORE native operating observations.
  const binding = await bindPrestigeOperatingArtifacts(artifacts, result, {
    purpose: 'operating_artifact_binding_qa', expected_source_receipt_sha256: artifacts.manifest.receipt_sha256,
    control_ids: result.controlsManifest.control_ids, control_revisions: controlRevisions,
    evidence_ids: installed.ids, evidence_versions: installed.versions,
    evidence_subjects: installed.subjects, historyManifest: result.historyManifest,
  });
  result = await recordPrestigeOperatingObservations(result, artifacts, installed.ids,
    {purpose: 'operating_observation_source_qa'});
  result = createPrestigeReportingHistory(result);
  const owned = kind => result.db[kind].filter(row => row.client_id === CID);
  if (owned('framework_assessments').length !== 38 || owned('organizational_controls').length !== 25
    || owned('organizational_controls').reduce((n, row) => n + row.observations.length, 0) !== 31
    || owned('evidence').length !== 14 || Object.keys(result.historyManifest.chains).length !== 6)
    fail('the complete history, files, criteria and native operating cohort must reconcile.');
  const scenario = {version: 'prestige-eight-year-source-v1', client_id: CID, anchor: ANCHOR,
    interval_start: '2018-11-02T00:00:00.000Z', status: 'source_complete',
    context_changes: context.context_changes, model_receipt_sha256: result.manifest.receipt_sha256,
    history_receipt_sha256: result.historyManifest.receipt_sha256,
    controls_receipt_sha256: result.controlsManifest.receipt_sha256,
    artifact_receipt_sha256: artifacts.manifest.receipt_sha256,
    binding_receipt_sha256: binding.receipt_sha256,
    operating_receipt_sha256: result.operatingManifest.receipt_sha256,
    reporting: result.reportingManifest,
    counts: Object.fromEntries(['framework_assessments', 'organizational_controls', 'reviews', 'policies',
      'vendors', 'risks', 'ai_systems', 'findings', 'tasks', 'assets', 'evidence'].map(kind => [kind, owned(kind).length])),
    evidence: artifacts.ledger,
    provenance: 'New fictional source construction through native commands; not eight years of application execution.',
    limitations: ['Historical document bytes are newly authored reconstructions, not recovered originals.',
      'Fixture source tests do not establish browser onboarding, persistence, hosted acceptance or capacity.'],
    original_backup_sha256: await digest(backup), state_sha256: await digest(result.db)};
  scenario.receipt_sha256 = await digest(scenario);
  return {...result, backup, scenarioManifest: scenario, artifacts, artifactBinding: binding,
    evidenceManifest: {evidence_ids: installed.ids, evidence_versions: installed.versions, subjects: installed.subjects}};
}

async function installMaterialEvidence(candidate, source) {
  const result = copy(candidate), db = result.db, ids = {}, versions = {}, subjects = {};
  if (db.evidence.some(row => row.client_id === CID)) fail('preserve an existing Evidence cohort.');
  const chain = key => result.historyManifest.chains[key];
  const first = map => Object.values(map)[0];
  const subject = (kind, id) => ({kind, id});
  const primary = {
    'pw-foundation-2018': subject('assets', result.assetManifest.asset_ids.portal),
    'pw-named-access-2019': subject('findings', chain('SHARED-ACCESS').finding_id),
    'pw-contractors-2020': subject('findings', chain('CONTRACTOR-REMOVAL').finding_id),
    'pw-recovery-delivery-2021': subject('findings', chain('RECOVERY-DEPENDENCY').finding_id),
    'pw-readiness-2022': subject('policies', result.manifest.policy_ids['policy-information-security-policy']),
    'pw-migration-exceptions-2023': subject('risks', chain('MIGRATION-ROLE').risk_id),
    'pw-migration-validation-2024': subject('findings', chain('MIGRATION-ROLE').finding_id),
    'pw-service-ai-2025': subject('assets', result.assetManifest.asset_ids.portal),
    'pw-current-criteria-2026': subject('assets', result.assetManifest.asset_ids.portal),
    'pw-policy-versions-current': subject('policies', result.manifest.policy_ids['policy-information-security-policy']),
    'pw-risk-decisions-current': subject('risks', first(result.manifest.risk_ids)),
    'pw-vendor-events-current': subject('vendors', first(result.manifest.vendor_ids)),
    'pw-ai-screening-current': subject('ai_systems', first(result.manifest.ai_ids)),
    'pw-recovery-workpaper-current': subject('assets', result.assetManifest.asset_ids.recovery),
  };
  for (const file of source.artifacts) {
    const parent = primary[file.key];
    if (!parent?.id) fail('resolve the actual primary source record for ' + file.key);
    const body = await prepareDemoEvidenceUpload(db, {client_id: CID, filename: file.filename,
      mime_type: file.mime_type, content_base64: file.content_base64, linked_type: parent.kind,
      linked_id: parent.id, evidence_date: file.document_date, effective_date: file.document_date,
      notes: 'DEMO — newly authored fictional workpaper. Business source availability ' + file.available_at
        + '; actual upload time and actor remain native. Not original historical bytes.'});
    const row = write(db, 'evidence', body);
    ids[file.key] = row.evidence_id; versions[file.key] = row.version;
    const support = [];
    const add = (kind, id) => { if (id && !(parent.kind === kind && parent.id === id)
      && !support.some(link => link.kind === kind && link.id === id)) support.push({kind, id}); };
    if (file.key.includes('policy') || file.key === 'pw-foundation-2018')
      Object.values(result.manifest.policy_ids).forEach(id => add('policies', id));
    if (file.key.includes('vendor')) Object.values(result.manifest.vendor_ids).forEach(id => add('vendors', id));
    if (file.key.includes('ai')) Object.values(result.manifest.ai_ids).forEach(id => add('ai_systems', id));
    if (file.key.includes('risk')) Object.values(result.manifest.risk_ids).forEach(id => add('risks', id));
    const historySubjects = {
      'pw-named-access-2019': ['SHARED-ACCESS'], 'pw-contractors-2020': ['CONTRACTOR-REMOVAL'],
      'pw-recovery-delivery-2021': ['RECOVERY-DEPENDENCY'],
      'pw-migration-exceptions-2023': ['MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY'],
      'pw-migration-validation-2024': ['MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY'],
    };
    for (const [key, value] of Object.entries(result.historyManifest.chains)) {
      if (historySubjects[file.key]?.includes(key) || file.key.includes('risk')) {
        add('findings', value.finding_id); add('tasks', value.task_id); add('risks', value.risk_id);
      }
    }
    for (const link of support) evidenceLibraryRequest(db, 'post',
      ['evidence-library', 'items', row.evidence_id, 'relationships'], {},
      {linked_type: link.kind, linked_id: link.id, expected_updated_at: row.updated_at});
    subjects[file.key] = {primary: parent, supporting: support};
  }
  for (const fact of facts.controls) {
    const id = result.controlsManifest.control_ids[fact.key];
    const row = db.organizational_controls.find(item => item.control_id === id);
    const links = [...row.related_links], add = (kind, value) => {
      if (!value) fail('a required Control relationship is unresolved: ' + fact.key);
      if (!links.some(link => link.kind === kind && link.id === value)) links.push({kind, id: value});
    };
    for (const key of fact.links.sample_vendor_fact_keys || []) add('vendors', result.manifest.vendor_ids[key]);
    for (const key of fact.links.historical_context_risk_fact_keys || []) add('risks', result.manifest.risk_ids[key]);
    for (const key of fact.links.historical_chain_slots || []) {
      const value = chain(key.toUpperCase());
      if (!value) fail('a required historical chain is unresolved.');
      for (const [kind, field] of [['findings', 'finding_id'], ['tasks', 'task_id'], ['risks', 'risk_id'],
        ['reviews', 'review_id'], ['reviews', 'validation_review_id']]) add(kind, value[field]);
    }
    const files = source.artifacts.filter(file => file.population_keys.some(key => fact.populations.some(pop => pop.key === key)));
    for (const file of files) add('evidence', ids[file.key]);
    organizationalControlRequest(db, ['organizational-controls', id], 'patch', {}, {
      name: row.name, description: row.description, frequency: row.frequency, design: row.design,
      owner_id: row.owner_id, assessment_ids: row.assessment_ids, related_links: links, expected_updated_at: row.updated_at});
    for (const aid of row.assessment_ids) for (const file of files)
      frameworkRequest(db, '/framework_assessments/' + aid + '/links', 'post', {}, {kind: 'evidence', id: ids[file.key]});
  }
  return {result, ids, versions, subjects};
}
