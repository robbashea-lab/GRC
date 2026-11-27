import {webcrypto} from 'crypto';
import {TextEncoder} from 'util';
import {stable} from '../commandRequests';
import {PRESTIGE_CURRENT_ASSESSMENTS} from './prestigeEightYearContent';
import {PRESTIGE_EIGHT_YEAR_PLAN as scenario} from './prestigeEightYear';
import {PRESTIGE_POLICY_DOCUMENT_FACTS, PRESTIGE_GOVERNANCE_REVIEW_FACTS} from './prestigeCurrentGovernance';
import {PRESTIGE_VENDOR_FACTS, PRESTIGE_RISK_FACTS, PRESTIGE_AI_FACTS} from './prestigeEightYearRegisters';
import {PRESTIGE_OPERATING_BUNDLE_KEYS as KEYS, PRESTIGE_OPERATING_CONTROL_FACTS as CONTROLS,
  createPrestigeOperatingArtifacts, bindPrestigeOperatingArtifacts} from './prestigeOperatingArtifacts';

// Controlled identity fixtures exercise this pure source/binder contract, not native command execution.
const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z', RECORDED = '2026-11-07T23:30:00.000Z';
const copy = value => JSON.parse(JSON.stringify(value));
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const encoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder');
const sha = async value => Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',
  new TextEncoder().encode(stable(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const ids = (keys, prefix) => Object.fromEntries(keys.map(key => [key, prefix + key]));
let model, history, source, options;

function modelFixture() {
  const manifest = {version: 'prestige-current-model-v1', client_id: CID, anchor: ANCHOR,
    scope: 'current_governance_registers_and_guided_assessments_only',
    actor_id: 'fixture-recorder', assessment_actor_id: 'fixture-recorder', recorded_at: RECORDED,
    state_sha256: 'a'.repeat(64),
    assessment_ids: ids(Object.keys(PRESTIGE_CURRENT_ASSESSMENTS), 'fixture-assessment:'),
    policy_ids: ids(PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => fact.key), 'fixture-policy:'),
    review_ids: ids(PRESTIGE_GOVERNANCE_REVIEW_FACTS.map(fact => fact.plan_key), 'fixture-review:'),
    vendor_ids: ids(PRESTIGE_VENDOR_FACTS.map(fact => fact.key), 'fixture-vendor:'),
    risk_ids: ids(PRESTIGE_RISK_FACTS.map(fact => fact.key).concat(PRESTIGE_AI_FACTS.map(fact => fact.riskKey)), 'fixture-risk:'),
    ai_ids: ids(PRESTIGE_AI_FACTS.map(fact => fact.key), 'fixture-ai:')};
  const rows = (map, field, detail = () => ({})) => Object.entries(map).map(([key, id]) =>
    ({[field]: id, client_id: CID, ...detail(key)}));
  const db = {clients: [{client_id: CID, status: 'active'}, {client_id: 'foreign', status: 'active'}],
    framework_assessments: rows(manifest.assessment_ids, 'framework_assessment_id', key =>
      ({framework_key: 'soc-2', definition_id: key, status: 'implemented', implementation: 'Controlled fixture response'})),
    policies: rows(manifest.policy_ids, 'policy_id', key => ({title: key, version: 'fixture-current', status: 'approved'})),
    reviews: rows(manifest.review_ids, 'review_id', key => ({title: key, current_occurrence_id: 'fixture-current:' + key,
      status: 'scheduled', due_date: '2027-11-02', occurrences: []})),
    vendors: rows(manifest.vendor_ids, 'vendor_id', key => ({name: key, owner_id: 'fixture-owner'})),
    risks: rows(manifest.risk_ids, 'risk_id', key => ({title: key, likelihood: 2, impact: 3,
      status: 'in_treatment', treatment_plan: 'Controlled fixture native decision'})),
    ai_systems: rows(manifest.ai_ids, 'ai_system_id', key => ({name: key, status: 'active'})),
    findings: [], tasks: [], evidence: [], organizational_controls: [],
    foreign_history: [{client_id: 'foreign', original: 'retain byte-for-byte'}]};
  return {clientId: CID, anchor: ANCHOR, db, manifest, backup: {opaque_original_backup: true}};
}

function addHistory(db) {
  const chainKeys = ['SHARED-ACCESS', 'CONTRACTOR-REMOVAL', 'RECOVERY-DEPENDENCY', 'MIGRATION-ROLE', 'RETENTION', 'INDEX-RECOVERY'];
  const failureDates = ['2019-10-18', '2020-10-23', '2021-10-22', '2023-11-17', '2023-11-17', '2023-11-17'];
  const validator = CONTROLS.find(fact => fact.key === 'C09').owner_id, engineer = CONTROLS.find(fact => fact.key === 'C19').owner_id;
  const provenance = {recorded_at: RECORDED, recorded_by: 'fixture-recorder'};
  const chains = Object.fromEntries(chainKeys.map((key, index) => {
    const chain = {finding_id: 'fixture-finding:' + key, task_id: 'fixture-task:' + key,
      risk_id: db.risks[index].risk_id, review_id: 'fixture-history-review:' + key, occurrence_id: 'fixture-history-occurrence:' + key,
      validation_review_id: 'fixture-validation-review:' + key, validation_occurrence_id: 'fixture-validation-occurrence:' + key,
      failure: failureDates[index] + 'T12:00:00.000Z', action_due: '2024-01-15T12:00:00.000Z',
      action_completed: '2024-01-16T12:00:00.000Z', validation: '2024-01-18T12:00:00.000Z',
      finding_closed: '2024-01-19T12:00:00.000Z', recorded_at: RECORDED, recorded_by: 'fixture-recorder',
      provenance: 'newly_authored_synthetic_history'};
    db.reviews.push({client_id: CID, review_id: chain.review_id, current_occurrence_id: chain.occurrence_id,
      historical_risk_id: chain.risk_id, related_links: [{kind: 'risks', id: chain.risk_id}],
      status: 'completed', completed_at: chain.failure, outcome: 'Failed original selected test', occurrences: []},
    {client_id: CID, review_id: chain.validation_review_id, current_occurrence_id: chain.validation_occurrence_id,
      historical_risk_id: chain.risk_id, related_links: [{kind: 'risks', id: chain.risk_id}],
      status: 'completed', completed_at: chain.validation, outcome: 'Fresh independent validation', occurrences: []});
    db.findings.push({client_id: CID, finding_id: chain.finding_id, review_id: chain.review_id,
      occurrence_id: chain.occurrence_id, status: 'closed', risk_id: chain.risk_id, primary_task_id: chain.task_id,
      created_at: chain.failure, due_date: chain.action_due.slice(0, 10), validated_at: chain.validation, validated_by: validator,
      closed_at: chain.finding_closed, closed_by: validator, ...provenance, decision_history: [
        {action: 'validated', at: chain.validation, by: validator, rationale: 'Fresh controlled case result', ...provenance},
        {action: 'closed', at: chain.finding_closed, by: validator, rationale: 'Closure after independent validation', ...provenance}]});
    db.tasks.push({client_id: CID, task_id: chain.task_id, finding_id: chain.finding_id,
      review_id: chain.review_id, occurrence_id: chain.occurrence_id, risk_id: chain.risk_id,
      source_type: 'finding', source_id: chain.finding_id, status: 'done', created_at: chain.failure,
      due_date: chain.action_due.slice(0, 10), completed_at: chain.action_completed, completion_date: chain.action_completed,
      completed_by: engineer, ...provenance});
    db.risks[index].related_links = [{kind: 'findings', id: chain.finding_id}, {kind: 'tasks', id: chain.task_id}];
    return [key, chain];
  }));
  const milestones = Object.fromEntries(scenario.milestones.filter(item => item.key !== 'anchor').map(item => {
    const review_id = 'fixture-milestone:' + item.key, occurrence_id = 'fixture-milestone-occurrence:' + item.key;
    db.reviews.push({client_id: CID, review_id, current_occurrence_id: occurrence_id,
      status: 'completed', completed_at: item.date + 'T12:00:00.000Z', outcome: item.outcome, occurrences: []});
    return [item.key, {review_id, occurrence_id, effective_at: item.date + 'T12:00:00.000Z', narrative: item.narrative, outcome: item.outcome}];
  }));
  const recurring_occurrence_ids = [];
  for (let year = 2018; year <= 2025; year += 1) {
    const review_id = 'fixture-annual:' + year, occurrence_id = 'fixture-annual-occurrence:' + year;
    const due_date = year === 2018 ? '2018-11-02' : year + '-10-01';
    recurring_occurrence_ids.push(occurrence_id);
    db.reviews.push({client_id: CID, review_id, title: 'Controlled annual operating outcome ' + year, review_type: 'management',
      current_occurrence_id: 'fixture-future-annual:' + year, status: 'scheduled', due_date: '2027-11-02',
      occurrences: [{occurrence_id, due_date, completed_at: due_date + 'T12:00:00.000Z', status: 'completed',
        outcome: 'Retained year-specific controlled result ' + year, notes: 'Original due and result retained'}]});
  }
  const policy = db.policies.find(row => row.policy_id.endsWith('policy-information-security-policy'));
  const subject = {subject_id: 'fixture-security-subject-v1', client_id: CID, policy_id: policy.policy_id,
    title: 'Information Security', version: '1', summary: 'Controlled historical subject, not recovered original bytes',
    effective_at: '2018-11-02T12:00:00.000Z', named_approver: {name: 'Robert Doback'}, ...provenance};
  policy.approval_history = [{action: 'approved', at: subject.effective_at, by: validator, subject: copy(subject), ...provenance}];
  return {client_id: CID, chains, milestones, recurring_occurrence_ids,
    policy_subjects: {'policy-information-security-policy': [subject]}, ...provenance, fixture_only: true};
}

function bindingFixture(inputModel = model) {
  const target = copy(inputModel), evidenceIds = ids(KEYS, 'fixture-evidence:'), subjects = {};
  for (const artifact of source.artifacts) {
    const primary = {kind: 'policies', id: Object.values(target.manifest.policy_ids)[0]};
    subjects[artifact.key] = {primary, supporting: []};
    target.db.evidence.push({evidence_id: evidenceIds[artifact.key], client_id: CID, version: 1,
      filename: artifact.filename, mime_type: artifact.mime_type, size: artifact.decoded_file_bytes,
      sha256: artifact.sha256, content_base64: artifact.content_base64,
      linked_type: primary.kind, linked_id: primary.id, relationships: [],
      created_at: RECORDED, uploaded_at: RECORDED, uploaded_by: 'fixture-recorder'});
  }
  const controlIds = ids(CONTROLS.map(fact => fact.key), 'fixture-control:');
  for (const fact of CONTROLS) {
    const related = [];
    for (const key of fact.bindings.policy_fact_keys || []) related.push({kind: 'policies', id: target.manifest.policy_ids[key]});
    for (const key of fact.bindings.review_plan_keys || []) related.push({kind: 'reviews', id: target.manifest.review_ids[key]});
    for (const key of [...(fact.bindings.vendor_fact_keys || []), ...(fact.bindings.sample_vendor_fact_keys || [])])
      related.push({kind: 'vendors', id: target.manifest.vendor_ids[key]});
    for (const key of fact.bindings.historical_context_risk_fact_keys || []) related.push({kind: 'risks', id: target.manifest.risk_ids[key]});
    for (const slot of fact.bindings.historical_chain_slots || []) {
      const chain = history.chains[slot.toUpperCase()];
      for (const [kind, field] of [['findings', 'finding_id'], ['tasks', 'task_id'], ['risks', 'risk_id'],
        ['reviews', 'review_id'], ['reviews', 'validation_review_id']]) related.push({kind, id: chain[field]});
    }
    target.db.organizational_controls.push({client_id: CID, control_id: controlIds[fact.key],
    name: fact.name, description: fact.description, frequency: fact.frequency, design: fact.design, owner_id: fact.owner_id,
    assessment_ids: fact.criteria.map(key => target.manifest.assessment_ids[key]), updated_at: RECORDED,
    related_links: related.concat(source.artifacts.filter(file => file.population_keys.some(key =>
      fact.populations.some(pop => pop.key === key))).map(file => ({kind: 'evidence', id: evidenceIds[file.key]}))),
    observations: [], history: []});
  }
  return {model: target, options: {purpose: 'operating_artifact_binding_qa',
    expected_source_receipt_sha256: source.manifest.receipt_sha256,
    control_ids: controlIds, control_revisions: Object.fromEntries(CONTROLS.map(fact => [fact.key, RECORDED])),
    evidence_ids: evidenceIds, evidence_versions: Object.fromEntries(KEYS.map(key => [key, 1])),
    evidence_subjects: subjects, historyManifest: copy(history)}};
}

beforeAll(async () => {
  Object.defineProperty(globalThis, 'crypto', {value: webcrypto, configurable: true});
  Object.defineProperty(globalThis, 'TextEncoder', {value: TextEncoder, configurable: true});
  model = modelFixture();
  model.manifest.receipt_sha256 = await sha(model.manifest);
  history = addHistory(model.db);
  history.model_receipt_sha256 = model.manifest.receipt_sha256;
  history.provenance = 'newly_authored_synthetic_history';
  history.receipt_sha256 = await sha(history);
  options = {purpose: 'operating_artifact_source_qa', expected_model_receipt_sha256: model.manifest.receipt_sha256,
    historyManifest: history, document_facts: Object.fromEntries(KEYS.map(key => [key, {
      document_date: '2026-11-07', available_at: RECORDED, version: 'fixture-compiled-v1'}]))};
  source = await createPrestigeOperatingArtifacts(model, options);
});

afterAll(() => {
  if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); else delete globalThis.crypto;
  if (encoderDescriptor) Object.defineProperty(globalThis, 'TextEncoder', encoderDescriptor); else delete globalThis.TextEncoder;
});

test('all populations have complete distinct memberships, exact detailed selections and typed child quantities', () => {
  expect(source.workpapers).toHaveLength(31);
  expect(source.workpapers.flatMap(pop => pop.members)).toHaveLength(256);
  expect(source.workpapers.flatMap(pop => pop.selected_member_keys)).toHaveLength(136);
  expect(source.ledger.typed_counts).toMatchObject({population_headers: 31, membership_rows: 256, detailed_member_packages: 136,
    backup_batches: 90, backup_logical_members: 270, backup_attempts: 271, backup_failed_attempts: 1,
    backup_deep_member_checks: 27, endpoint_comparison_rows: 54, premises_check_groups: 16, telemetry_health_rows: 21,
    recovery_checkpoints: 6, capacity_trials: 3, intake_version_confirmations: 13, disposal_completion_records: 4, disposal_hold_records: 1});
  expect(source.workpapers.every(pop => pop.members.every(row => row.input_refs.length && row.required_checks.length
    && row.detail_rows.length && row.subject && row.business_performer && row.exception_disposition))).toBe(true);
});

test('fourteen actual bodies retain explicit document issuance and exact byte representations without claiming capacity', () => {
  expect(source.artifacts.map(file => file.key)).toEqual(KEYS);
  for (const file of source.artifacts) {
    const bytes = Buffer.from(file.text, 'utf8');
    expect(bytes.length).toBe(file.decoded_file_bytes);
    expect(bytes.toString('base64')).toBe(file.content_base64);
    expect(('data:' + file.mime_type + ';base64,' + file.content_base64).length * 2).toBe(file.payload_utf16_bytes);
    expect(file.text).toContain('2026-11-07');
    expect(file.text).toContain('fixture-compiled-v1');
    expect(file.native_recording).toBeNull();
  }
  expect(source.ledger.complete_cohort.capacity_qualified).toBe(false);
  expect(source.ledger.complete_cohort.stored_utf16_bytes).toBeNull();
  expect(source.manifest.native_writes).toBe(0);
});

test('shared operating events preserve one failed-copy identity across backup, triage and emergency release', () => {
  const pop = key => source.workpapers.find(item => item.key === key);
  const failed = pop('C24-backups').members.find(row => row.key === 'PW26-BKV-20260914');
  const triage = pop('C17-events').members.find(row => row.key === 'PW26-C17-T04');
  const emergency = pop('C20-release').members.find(row => row.key === 'PW26-REL-E01');
  expect([failed.source_key, triage.source_key, emergency.source_key]).toEqual(Array(3).fill(failed.key));
  expect(failed.detail_rows.flatMap(row => row.attempts).map(row => row.result)).toEqual(['success', 'success', 'failed', 'success']);
  const recovery = pop('C19-recovery').members[0];
  expect(recovery.input_refs.map(row => row.key)).toEqual(['PW26-REC-20261023', 'PW26-C25-I07', 'PW26-C25-I11']);
  expect(pop('C25-disposal').members[4].detail_rows[0]).toMatchObject({status: 'deferred_under_hold', follow_up_date: '2026-11-16'});
});

test('each historical body contains substantive year-specific workpapers and actual retained outcome bindings', () => {
  const required = ['initial_account_and_asset_inventory', 'project_access_reconciliation', 'contractor_end_date_reconciliation',
    'recovery_dependency_workpaper', 'distinct_supplier_events', 'failed_migration_checks', 'fresh_validation_workpapers',
    'customer_commitment_workpapers'];
  source.artifacts.slice(0, 8).forEach((file, index) => {
    const document = JSON.parse(file.text.slice(file.text.indexOf('{\n')));
    const content = document.rows.find(row => row.type === 'historical_workpaper').value;
    expect(content).toHaveProperty(required[index]);
    expect(content.annual_operating_outcomes).toHaveLength(1);
    expect(content.annual_operating_outcomes[0].outcome).toContain(file.source_event_date.slice(0, 4));
    expect(file.source_bindings.milestone).toMatchObject({review_id: expect.any(String), occurrence_id: expect.any(String)});
    expect(file.text).not.toContain('fixture-milestone:');
    expect(file.text).not.toContain('fixture-history-review:');
    expect(file.text).not.toContain('"recorded_at"');
  });
  const foundation = JSON.parse(source.artifacts[0].text.slice(source.artifacts[0].text.indexOf('{\n')))
    .rows.find(row => row.type === 'historical_workpaper').value;
  expect(foundation.initial_account_and_asset_inventory.asset_groups).toHaveLength(5);
  expect(foundation.security_policy_v1.procedures).toHaveLength(8);
  expect(foundation.initial_account_and_asset_inventory.asset_groups.every(row => row.native_asset_id === null)).toBe(true);
});

test('content cut rejects future closure in an earlier-issued file and keeps the 2023 failed stages separate', async () => {
  const beforeClosure = copy(options);
  beforeClosure.document_facts['pw-named-access-2019'] = {
    document_date: '2019-10-18', available_at: '2019-10-18T23:00:00.000Z', version: 'fictional-as-of-v1'};
  await expect(createPrestigeOperatingArtifacts(model, beforeClosure)).rejects.toThrow('issued after');
  beforeClosure.document_facts['pw-named-access-2019'].available_at = RECORDED;
  await expect(createPrestigeOperatingArtifacts(model, beforeClosure)).rejects.toThrow('issued after');
  const asOf = copy(options);
  asOf.document_facts['pw-migration-exceptions-2023'] = {
    document_date: '2023-11-18', available_at: '2023-11-18T12:00:00.000Z', version: 'fictional-original-failures-v1'};
  const result = await createPrestigeOperatingArtifacts(model, asOf);
  const file = result.artifacts.find(row => row.key === 'pw-migration-exceptions-2023');
  const content = JSON.parse(file.text.slice(file.text.indexOf('{\n'))).rows.find(row => row.type === 'historical_workpaper').value;
  expect(content.chronology.every(row => row.stages.length === 1 && row.stages[0].stage === 'failure')).toBe(true);
  expect(content.chronology.every(row => row.original_scheduled_action_due === '2024-01-15T12:00:00.000Z')).toBe(true);
  expect(file.text).not.toContain('2024-01-18');
});

test.each([
  ['missing declared archived occurrence', parent => {parent.occurrences = [];}],
  ['duplicated declared archived occurrence', parent => {parent.occurrences.push(copy(parent.occurrences[0]));}],
  ['current-only occurrence substituted for archive', parent => {parent.current_occurrence_id = parent.occurrences[0].occurrence_id; parent.occurrences = [];}],
  ['unfinished declared archived occurrence', parent => {parent.occurrences[0].status = 'scheduled';}],
])('source rejects %s before filtering its historical yearbooks', async (_name, mutate) => {
  const changed = copy(model), parent = changed.db.reviews.find(row => row.review_id === 'fixture-annual:2018');
  mutate(parent); const before = stable(changed);
  await expect(createPrestigeOperatingArtifacts(changed, options)).rejects.toThrow('Prestige operating artifacts:');
  expect(stable(changed)).toBe(before);
});

test('historical completion interval uses actual instants when explicit offsets cross the opening UTC date', async () => {
  const outside = copy(model);
  outside.db.reviews.find(row => row.review_id === 'fixture-annual:2018').occurrences[0].completed_at = '2018-11-02T00:00:00+14:00';
  await expect(createPrestigeOperatingArtifacts(outside, options)).rejects.toThrow('in-interval');
  const inside = copy(model);
  inside.db.reviews.find(row => row.review_id === 'fixture-annual:2018').occurrences[0].completed_at = '2018-11-01T23:00:00-02:00';
  await expect(createPrestigeOperatingArtifacts(inside, options)).resolves.toMatchObject({manifest: {native_writes: 0}});
});

test('population-to-bundle coverage and recovery/capacity distinctions remain exact', () => {
  expect(source.artifacts.flatMap(file => file.population_keys).sort()).toEqual(source.workpapers.map(pop => pop.key).sort());
  const recovery = source.source_registry.find(row => row.key === 'PW26-REC-20261023').content;
  expect(recovery.checkpoints).toHaveLength(6);
  expect(recovery.checkpoints.every((row, index, all) => index === 0 || row.at > all[index - 1].at)).toBe(true);
  expect(recovery.service_accepted_at > recovery.checkpoints[5].at).toBe(true);
  const trials = source.workpapers.find(pop => pop.key === 'C23-capacity').members[2].detail_rows;
  expect(trials.map(row => row.rights_p95_ms)).toEqual([1900, 1180, 1050]);
  expect(trials[0].result).toBe('initial_rights_target_miss');
  expect(trials[2].peak_demand_qualified).toBe(false);
});

test('later history/model stages retain the original child receipt and opaque backup; exact source replay is stable', async () => {
  const before = stable(model), repeated = await createPrestigeOperatingArtifacts(model, options);
  expect(repeated).toEqual(source);
  expect(stable(model)).toBe(before);
  expect(model.manifest.state_sha256).toBe('a'.repeat(64));
  expect(model.backup).toEqual({opaque_original_backup: true});
});

test.each([
  ['changed receipt', input => {input.manifest.receipt_sha256 = 'b'.repeat(64);}],
  ['foreign mapped record', input => {input.db.policies[0].client_id = 'foreign';}],
  ['duplicate mapped identity', input => {input.db.vendors.push(copy(input.db.vendors[0]));}],
  ['inactive canonical client', input => {input.db.clients[0].status = 'archived';}],
])('source rejects %s without mutating its input', async (_name, mutate) => {
  const input = copy(model); mutate(input); const before = stable(input);
  await expect(createPrestigeOperatingArtifacts(input, options)).rejects.toThrow('Prestige operating artifacts:');
  expect(stable(input)).toBe(before);
});

test('missing/invalid document facts fail; post-anchor actual issuance remains explicit', async () => {
  const bad = copy(options); bad.document_facts[KEYS[0]].document_date = '2026-02-30';
  await expect(createPrestigeOperatingArtifacts(model, bad)).rejects.toThrow('calendar date');
  delete bad.document_facts[KEYS[0]];
  await expect(createPrestigeOperatingArtifacts(model, bad)).rejects.toThrow('fourteen');
  expect(source.artifacts.every(file => file.document_date > ANCHOR.slice(0, 10))).toBe(true);
});

test('pure binding verifies actual IDs, versions, bytes, revisions and exact replay without native observations', async () => {
  const fixture = bindingFixture(), before = stable(fixture.model);
  const bound = await bindPrestigeOperatingArtifacts(source, fixture.model, fixture.options);
  expect(bound.files).toHaveLength(14); expect(bound.controls).toHaveLength(25);
  expect(bound.controls.flatMap(row => row.populations)).toHaveLength(31);
  expect(bound.controls.flatMap(row => row.populations).every(row => row.observation_provenance === null)).toBe(true);
  expect(bound.native_writes).toBe(0); expect(bound.capacity_qualified).toBe(false);
  expect(stable(fixture.model)).toBe(before);
  expect(Object.isFrozen(bound)).toBe(true);
  await expect(bindPrestigeOperatingArtifacts(source, fixture.model, {...fixture.options, prior_manifest: bound})).resolves.toEqual(bound);
});

test.each([
  ['changed Evidence bytes', f => {f.model.db.evidence[0].content_base64 = 'eA==';}],
  ['stale Evidence version', f => {f.model.db.evidence[0].version = 2;}],
  ['foreign Evidence', f => {f.model.db.evidence[0].client_id = 'foreign';}],
  ['stale Control revision', f => {f.model.db.organizational_controls[0].updated_at = '2026-11-08T00:00:00.000Z';}],
  ['missing native Evidence link', f => {f.model.db.organizational_controls[0].related_links = [];}],
  ['foreign historical Finding', f => {f.model.db.findings[0].client_id = 'foreign';}],
  ['open historical Finding', f => {f.model.db.findings[0].status = 'open';}],
  ['unfinished corrective Action', f => {f.model.db.tasks[0].status = 'todo';}],
  ['changed original due date', f => {f.model.db.tasks[0].due_date = '2024-01-20';}],
  ['changed validation date', f => {f.model.db.findings[0].validated_at = '2024-01-17T12:00:00.000Z';}],
  ['changed validation actor', f => {f.model.db.findings[0].decision_history[0].by = 'other';}],
  ['changed actual import time', f => {f.model.db.findings[0].recorded_at = ANCHOR;}],
  ['missing Risk-to-Action relation', f => {f.model.db.risks[0].related_links.pop();}],
  ['duplicate native Risk Review parent', f => {f.model.db.reviews.find(row => row.review_id === history.chains['SHARED-ACCESS'].review_id)
    .risk_id = history.chains['SHARED-ACCESS'].risk_id;}],
  ['wrong singular historical Risk relationship kind', f => {f.model.db.reviews.find(row =>
    row.review_id === history.chains['SHARED-ACCESS'].review_id).related_links[0].kind = 'risk';}],
  ['missing historical Policy subject', f => {f.model.db.policies[0].approval_history = [];}],
  ['foreign separate validation Review', f => {f.model.db.reviews.find(row => row.review_id === history.chains['SHARED-ACCESS'].validation_review_id).client_id = 'foreign';}],
  ['changed annual outcome', f => {f.model.db.reviews.find(row => row.review_id === 'fixture-annual:2018').occurrences[0].outcome = 'Changed result';}],
  ['unrecorded historical occurrence', f => {f.model.db.reviews.find(row => row.review_id === history.chains['SHARED-ACCESS'].review_id)
    .current_occurrence_id = 'other';}],
  ['extra Control occurrence field', f => {f.model.db.organizational_controls[0].related_links[0].occurrence_id = 'not-supported';}],
])('binding rejects %s and preserves all input state', async (_name, mutate) => {
  const fixture = bindingFixture(); mutate(fixture); const before = stable(fixture.model);
  await expect(bindPrestigeOperatingArtifacts(source, fixture.model, fixture.options)).rejects.toThrow('Prestige operating artifacts:');
  expect(stable(fixture.model)).toBe(before);
});

test.each(['policies', 'reviews', 'vendors', 'risks', 'findings', 'tasks'])('missing declared Control %s relationship fails closed', async kind => {
  const fixture = bindingFixture();
  const control = fixture.model.db.organizational_controls.find(row => row.related_links.some(link => link.kind === kind));
  expect(control).toBeDefined();
  control.related_links = control.related_links.filter(link => link.kind !== kind);
  await expect(bindPrestigeOperatingArtifacts(source, fixture.model, fixture.options)).rejects.toThrow('required native Control relationship');
});

test('reused historical chain identities cannot be admitted even by a newly materialized source', async () => {
  const changedHistory = copy(history);
  changedHistory.chains['CONTRACTOR-REMOVAL'] = copy(changedHistory.chains['SHARED-ACCESS']);
  delete changedHistory.receipt_sha256; changedHistory.receipt_sha256 = await sha(changedHistory);
  const alternate = await createPrestigeOperatingArtifacts(model, {...options, historyManifest: changedHistory});
  const fixture = bindingFixture();
  await expect(bindPrestigeOperatingArtifacts(alternate, fixture.model, {...fixture.options,
    expected_source_receipt_sha256: alternate.manifest.receipt_sha256, historyManifest: changedHistory})).rejects.toThrow('distinct actual');
});

test('later-issued source is rejected for a completed historical Review period', async () => {
  const fixture = bindingFixture(), chain = history.chains['SHARED-ACCESS'], key = KEYS[0];
  const primary = {kind: 'reviews', id: chain.review_id, occurrence_id: chain.occurrence_id};
  fixture.options.evidence_subjects[key].primary = primary;
  Object.assign(fixture.model.db.evidence[0], {linked_type: 'reviews', linked_id: primary.id, occurrence_id: primary.occurrence_id});
  await expect(bindPrestigeOperatingArtifacts(source, fixture.model, fixture.options)).rejects.toThrow('completed period');
});

test('pinned source detects workpaper/metadata tampering before a native binding can be reported', async () => {
  const fixture = bindingFixture(), changed = copy(source);
  changed.workpapers[0].members[0].proposed_result = 'Different authored decision';
  await expect(bindPrestigeOperatingArtifacts(changed, fixture.model, fixture.options)).rejects.toThrow('workpaper or byte ledger');
  const metadata = copy(source); metadata.artifacts[0].available_at = '2018-01-01T00:00:00.000Z';
  await expect(bindPrestigeOperatingArtifacts(metadata, fixture.model, fixture.options)).rejects.toThrow('document identity');
});
