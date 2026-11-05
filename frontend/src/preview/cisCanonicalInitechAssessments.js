import {activeDefinitions} from '../lib/frameworks';
import {catalogForVersion, versionForSafeguard, visibleQuestions, validateGuidedCompletion, generateResult} from '../lib/guidedAssessment';
import {clientAccess, eligible, validateAssignment} from './assignmentEligibility';
import {reconcileItems} from './assessmentItems';
import {initechOnboardingSelection} from './cisCanonicalInitechBaseline';
import {INITECH_SCENARIO_PROFILE, initechSafeguardContent} from './cisCanonicalInitechContent';

const CID = 'demo_initech';
const SOURCE = 'Explicit fictional Initech Demo assessment import; not a browser save, evidence validation or certification.';
// Explicit source-element answers preserve the established portions of each
// partial practice. The native reducer, not this map, determines its status.
const ELEMENT_ANSWERS = {
  '2.6': {'2.6-c1':'Partially', '2.6-c4':'Partially', '2.6-c3':'Yes'},
  '3.8': {'3.8-c4':'Partially', '3.8-c5':'Yes', '3.8-c3':'Partially'},
  '5.5': {'5.5-c5':'Partially', '5.5-c8':'Yes', '5.5-c10':'Partially', '5.5-c11':'Partially', '5.5-c3':'Yes'},
  '13.6': {'13.6-c3':'Partially', '13.6-c4':'Yes'},
  '16.4': {'16.4-c8':'Partially', '16.4-c9':'Partially', '16.4-c6':'Partially',
    '16.4-c3':'Partially', '16.4-c10':'Partially', '16.4-c11':'Partially'},
  '3.9': {'3.9-c3':'No'},
  '9.5': {'9.5-c7':'No', '9.5-c8':'No', '9.5-c5':'Yes', '9.5-c6':'Yes'},
  '15.4': {'15.4-c4':'No', '15.4-c5':'No', '15.4-c3':'Yes'}
};
const copy = value => JSON.parse(JSON.stringify(value));
const scoped = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const reject = message => {throw new Error('Initech assessments: '+message);};
const statusFor = id => INITECH_SCENARIO_PROFILE.partial.includes(id) ? 'in_progress'
  : INITECH_SCENARIO_PROFILE.gaps.includes(id) ? 'needs_attention'
    : INITECH_SCENARIO_PROFILE.unknown.includes(id) ? 'not_assessed' : 'addressed';

function assertFreshBaseline(db, dates) {
  const clients = scoped(db, 'clients'), client = clients[0];
  if (clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 2
    || db.baselines?.[CID]?.completed !== true || db.baselines[CID].version !== 3
    || !scoped(db, 'requirements').some(row => row.baseline_key === 'cis-ig1' && row.baseline_response === 'applies'))
    reject('complete native CIS IG2 onboarding for the canonical Demo client first.');
  if (db.user?.workspace_mode !== 'demo' || db.user.status !== 'active' || !clientAccess(db.user, CID)
    || !['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(db.user.role))
    reject('an authorized Demo writer is required.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['day','month','instant'].every(key => typeof dates[key] === 'function')
    || dates.instant(0) !== dates.anchor || !Number.isFinite(Date.parse(dates.anchor)))
    reject('provide the frozen canonical UTC date helpers.');
  const origin = dates.month(-24)+'T00:00:00.000Z';
  if (origin < '2024-06-25T00:00:00.000Z' || !Number.isFinite(Date.parse(origin)))
    reject('the 24-month v8.1 program must begin after its release.');
  const definitions = activeDefinitions('cis-ig1', {implementation_group:2}), rows = scoped(db, 'framework_assessments');
  const {policy_keys, plans} = initechOnboardingSelection(), policies = scoped(db, 'policies'), reviews = scoped(db, 'reviews');
  if (definitions.length !== 130 || rows.length !== 130 || policies.length !== 9 || reviews.length !== 13
    || definitions.some(definition => rows.filter(row => row.framework_key === 'cis-ig1' && row.definition_id === definition.id).length !== 1)
    || policy_keys.some(key => policies.filter(row => row.baseline_key === key).length !== 1)
    || plans.some(plan => reviews.filter(row => row.framework_plan_key === plan.key && row.recurrence === plan.default_cadence).length !== 1))
    reject('requires the complete untouched native IG2 baseline.');
  for (const row of rows) {
    const expectedLinks = reviews.filter(review => review.framework_safeguards.includes(row.definition_id))
      .map(review => review.review_id).sort();
    if (row.framework_assessment_id !== `fw_${CID}_assessment_${row.definition_id}` || row.framework_version !== '8.1'
      || row.status !== 'not_assessed' || row.created_at !== origin || row.updated_at !== origin
      || ['implementation','technology','notes','na_rationale','owner_id','process_owner_id','last_assessed','last_saved',
        'assessed_by','verification','verification_checklist','guided_assessment_source','assessment_recorded_at'].some(key => row[key] != null && row[key] !== '')
      || ['assessment_history','items_to_address','cis_assessment_criteria'].some(key => row[key] != null && (!Array.isArray(row[key]) || row[key].length))
      || row.items_revision || !Array.isArray(row.related_links)
      || row.related_links.some(link => link.kind !== 'reviews')
      || JSON.stringify(row.related_links.map(link => link.id).sort()) !== JSON.stringify(expectedLinks))
      reject('requires untouched assessments, without retained conclusions, ownership or linked work.');
  }
  if (policies.some(row => row.presence !== 'reported_missing' || row.status !== 'needs_creation'
      || row.baseline_response !== 'no' || row.updated_at !== origin || row.owner_id
      || row.summary || row.document_url || row.approved_at || row.approval_source || row.approval_subject
      || row.approval_history?.length || row.decision_history?.length)
    || reviews.some(row => row.status !== 'needs_scheduling' || row.due_date || row.next_review_date
      || row.updated_at !== origin || row.owner_id || row.reviewer_id || row.occurrences?.length || row.notes || row.scope)
    || ['findings','tasks','evidence','risks','vendors','ai_systems','assets','organizational_controls','exceptions','assessments','comments']
      .some(kind => scoped(db, kind).length) || db.drafts?.[CID])
    reject('requires untouched documents, Review parents and source records.');
  const ids = new Set(rows.map(row => row.framework_assessment_id));
  if ((db.framework_assessments || []).some(row => row.client_id !== CID && ids.has(row.framework_assessment_id))
    || ['guided_assessment_pilot','guided_assessment_history'].some(key => Object.entries(db[key] || {}).some(([id, value]) =>
      value?.client_id === CID || rows.some(row => id.startsWith(row.framework_assessment_id+':')))))
    reject('retained interviews or conflicting assessment identities must not be overwritten.');
  return {client, definitions, rows, origin};
}

function processContact(db, role, processOwners) {
  const supplied = processOwners[role], id = typeof supplied === 'string' ? supplied : supplied?.contact_id;
  const name = role.split(' — ')[0];
  const matches = (db.contacts || []).filter(row => id ? row.contact_id === id : row.client_id === CID && row.name === name);
  if (matches.length !== 1 || matches[0].client_id !== CID || matches[0].status !== 'active')
    reject('use an existing active Initech Contact for '+role+'.');
  return matches[0];
}

function interview(id, expectedStatus, content, dates, at) {
  const version = versionForSafeguard(id), questions = catalogForVersion(version)?.safeguards[id];
  if (!questions) reject('the native interview is unavailable for '+id+'.');
  const answers = {}, specified = ELEMENT_ANSWERS[id] || {};
  const actualElements = new Set(questions.flatMap(question => question.criterion_ids || []));
  if (Object.keys(specified).some(key => !actualElements.has(key))) reject('the mapped requirement elements changed for '+id+'.');
  for (const question of questions) {
    if (question.type === 'matrix') {
      answers[question.id] = Object.fromEntries(question.rows.map((row, index) =>
        [row, specified[question.criterion_ids?.[index]] || 'Yes']));
      if (Object.values(answers[question.id]).some(value => ['No','Partially'].includes(value)))
        answers[question.id+'_detail'] = content.assessment_notes;
    } else if (question.type === 'multi') {
      if (id !== '1.2' || question.id !== 'actions') reject('an unmapped native multi-choice question was added.');
      answers[question.id] = ['Remove from network','Deny remote connection','Quarantine or isolate'];
    } else if (question.type === 'date') {
      if (id !== '1.1' || question.id !== 'last_review') reject('an unmapped native date question was added.');
      answers[question.id] = dates.month(-1);
    } else if (question.type === 'text') {
      const text = {system:content.technology_process, owner:content.owner_role+' / '+content.process_owner_role,
        operation:content.current_implementation, existing:content.current_implementation, evidence:content.evidence_check,
        maintenance_detail:content.technology_process, context:content.scope, scope_reason:'',
        gaps:content.remediation, unknowns:''};
      if (!Object.hasOwn(text, question.id)) reject('an unmapped native text question was added: '+id+'/'+question.id+'.');
      answers[question.id] = text[question.id];
    } else {
      const values = {practice:expectedStatus === 'needs_attention' ? 'No' : expectedStatus === 'in_progress' ? 'Partially' : 'Yes',
        inventory:'Yes', process:'Yes', tool:'Yes', logging:'Yes', coverage:'Yes', maintenance:'Yes',
        inventory_dependency:'Yes', detection:'Yes', disposition:'Yes', confirmation:'Yes', exceptions:'Yes',
        reconciled:'Yes', inventory_update:'Yes', unresolved:'No', sources:'Multiple reconciled sources', approach:'Both',
        frequency:id === '1.1' ? 'Every six months' : id === '1.3' ? 'Daily' : 'Weekly',
        additional_gap:content.remediation ? 'Yes' : 'No', additional_confirmation:'No'};
      if (!Object.hasOwn(values, question.id)) reject('an unmapped native choice question was added: '+id+'/'+question.id+'.');
      answers[question.id] = values[question.id];
    }
  }
  const visible = visibleQuestions(id, answers, version), keys = new Set(visible.flatMap(question => [question.id,question.id+'_detail']));
  const current = Object.fromEntries(Object.entries(answers).filter(([key]) => keys.has(key)));
  validateGuidedCompletion(id, current, version);
  if (visible.some(question => question.critical && (current[question.id] === undefined
    || question.type === 'matrix' && question.rows.some(row => current[question.id][row] === undefined))))
    reject('all visible required answers must be supplied for '+id+'.');
  const [year, month, day] = at.slice(0,10).split('-').map(Number);
  const result = generateResult(id, current, new Date(year, month-1, day, 12), version);
  if (result.status !== expectedStatus) reject('native guided answers disagree with the scenario for '+id+'.');
  if (visible.some(question => question.type === 'date')) result.evaluation_date = at.slice(0,10);
  return {version, answers:current, result, narrative:content.current_implementation, step:visible.length,
    completed:true, revision:1, updated_at:at, generated_at:at, fixture_provenance:SOURCE};
}

function populate(db, {dates, owner, processOwners = {}} = {}) {
  const {definitions, rows, origin} = assertFreshBaseline(db, dates);
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const owners = (db.users || []).filter(row => row.user_id === ownerId), account = owners[0];
  if (owners.length !== 1 || !eligible(account, CID)) reject('use an existing eligible accountable application user.');
  const at = dates.instant(-2);
  if (at <= origin || at > dates.anchor || !Number.isFinite(Date.parse(at))) reject('assessment dates must lie within the fictional program.');
  const drafts = {}, assessments = definitions.map(definition => {
    const original = rows.find(row => row.definition_id === definition.id), status = statusFor(definition.id);
    const content = initechSafeguardContent(definition.id, status), contact = processContact(db, content.process_owner_role, processOwners);
    const unknown = status === 'not_assessed';
    const row = {...copy(original), status, owner_id:account.user_id, process_owner_id:contact.contact_id,
      implementation:content.current_implementation, technology:content.technology_process,
      notes:'Scope: '+content.scope+'\n'+(unknown ? 'Assessment plan: '+content.assessment_plan : content.assessment_notes),
      updated_at:unknown ? original.updated_at : at, fixture_history_origin_at:origin,
      last_assessed:unknown ? null : at, last_saved:unknown ? null : at, assessed_by:unknown ? null : account.user_id,
      verification:unknown ? null : status === 'addressed' ? 'needs_validation' : 'gap_identified',
      verification_checklist:null, items_to_address:[], items_revision:0};
    if (!unknown) {
      const draft = {...interview(definition.id, status, content, dates, at),
        client_id:CID, assessment_id:row.framework_assessment_id, user_id:account.user_id};
      drafts[row.framework_assessment_id+':'+account.user_id] = draft;
      row.guided_assessment_source = {origin:'fictional-demo-fixture', version:draft.version, revision:draft.revision,
        generated_at:at, by:account.user_id, answers:copy(draft.answers), provenance:SOURCE};
      row.items_to_address = reconcileItems(row, {...draft, result:{...draft.result, evaluation_date:at.slice(0,10)}}, account.user_id, at);
      row.items_revision = row.items_to_address.length ? 1 : 0;
    }
    validateAssignment(db, 'framework_assessments', row);
    return row;
  });
  db.framework_assessments = db.framework_assessments.map(row => row.client_id === CID
    ? assessments.find(assessment => assessment.framework_assessment_id === row.framework_assessment_id) : row);
  db.guided_assessment_pilot = {...db.guided_assessment_pilot, ...drafts};
  return {assessments, drafts, origin, anchor:dates.anchor,
    counts:Object.fromEntries(['addressed','in_progress','needs_attention','not_assessed']
      .map(status => [status,assessments.filter(row => row.status === status).length]))};
}

// Fixture import only: this neither executes native UI saves nor schedules work.
// Validate the complete staged import before committing any synthetic conclusions.
export function populateInitechAssessments(db, options) {
  const staged = copy(db), result = populate(staged, options);
  Object.assign(db, staged);
  return result;
}
