import {activeDefinitions} from '../lib/frameworks';
import {catalogForVersion, versionForSafeguard, visibleQuestions, validateGuidedCompletion, generateResult} from '../lib/guidedAssessment';
import {scheduledDate} from '../lib/reviewOccurrences';
import {clientAccess, eligible, validateAssignment} from './assignmentEligibility';
import {reconcileItems} from './assessmentItems';
import {krustyOnboardingSelection} from './cisCanonicalKrustyBaseline';
import {krustySafeguardContent} from './cisCanonicalKrustyContent';

const CID = 'demo_krusty_krab';
const SOURCE = 'Explicit fictional Krusty Demo assessment import; not a browser save, evidence validation or certification.';
const copy = value => JSON.parse(JSON.stringify(value));
const scoped = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const reject = message => {throw new Error('Krusty assessments: '+message);};

// Authored current-scope element identities, not inferred answers to future catalog
// additions. Each mapped element is reported met; the native reducer judges status.
const ELEMENTS = {
  '2.1':'c1 c6 c7 c8 c9 c3 c10 c11 c12 c13 c14 c15', '2.2':'c4 c5 c6 c7 c8',
  '2.3':'c1 c2', '2.4':'c3 c4', '2.5':'c1 c4 c3', '2.6':'c1 c4 c3', '2.7':'c4 c5 c6',
  '3.1':'c6 c10 c11 c8 c12 c13 c4', '3.2':'c1 c2', '3.3':'c2 c5 c6 c7 c8',
  '3.4':'c2 c4 c5', '3.5':'c2 c3', '3.6':'c1', '3.7':'c4 c3', '3.8':'c4 c5 c3',
  '3.9':'c3', '3.10':'c3', '3.11':'c5 c7 c8', '3.12':'c5 c6 c4',
  '3.13':'c7 c8 c9 c10 c11 c6', '3.14':'c4 c5 c6',
  '4.1':'c3 c7 c8 c9 c10 c11 c6', '4.2':'c3 c4', '4.3':'c2 c3 c4', '4.4':'c2 c3',
  '4.5':'c2 c3', '4.6':'c4 c5 c3', '4.7':'c2 c3', '4.8':'c3 c4', '4.9':'c3 c4',
  '4.10':'c1 c4 c6 c7', '4.11':'c1 c4 c5', '4.12':'c1',
  '5.1':'c8 c9 c10 c11 c12 c13 c14 c15 c7', '5.2':'c1', '5.3':'c1', '5.4':'c1 c2',
  '5.5':'c5 c8 c10 c11 c3', '5.6':'c3 c4',
  '6.1':'c2 c4 c5', '6.2':'c1 c2', '6.3':'c2 c3', '6.4':'c1', '6.5':'c2 c4 c5',
  '6.6':'c5 c6 c7 c8 c3', '6.7':'c1 c3', '6.8':'c4 c5 c6',
  '7.1':'c3 c4', '7.2':'c1 c2', '7.3':'c2 c3', '7.4':'c2 c3',
  '7.5':'c4 c7 c8 c6', '7.6':'c4 c5 c3', '7.7':'c4 c5 c3',
  '8.1':'c3 c4 c7 c8 c6', '8.2':'c1', '8.3':'c1', '8.4':'c3 c4',
  '8.5':'c1 c10 c11 c12 c13 c14 c15 c9', '8.6':'c3', '8.7':'c3', '8.8':'c3',
  '8.9':'c5 c6 c4', '8.10':'c6', '8.11':'c4 c5 c3', '8.12':'c1',
  '9.1':'c4 c5 c6 c7', '9.2':'c2 c3', '9.3':'c3 c4', '9.4':'c1 c3',
  '9.5':'c7 c8 c5 c6', '9.6':'c3', '9.7':'c1 c4',
  '10.1':'c2 c3', '10.2':'c1', '10.3':'c2 c3', '10.4':'c7', '10.5':'c3 c4',
  '10.6':'c3', '10.7':'c3', '11.1':'c3 c4 c5 c6 c7', '11.2':'c2 c3',
  '11.3':'c1', '11.4':'c1', '11.5':'c4 c5 c3',
  '12.1':'c1 c2', '12.2':'c3 c5 c6 c7', '12.3':'c3', '12.4':'c4 c5 c3',
  '12.5':'c5 c6 c7', '12.6':'c3 c4', '12.7':'c6 c7 c5 c3', '12.8':'c4 c5 c6',
  '13.1':'c3 c4 guided-correlation-alerts', '13.2':'c3', '13.3':'c3', '13.4':'c3',
  '13.5':'c4 c7 c8 c10 c11', '13.6':'c3 c4', '13.7':'c4 c6', '13.8':'c4',
  '13.9':'c4 c5 c6', '13.10':'c1', '13.11':'c7',
  '14.1':'c1 c3 c4', '14.2':'c1', '14.3':'c1', '14.4':'c4 c7 c8 c9 c10 c11 c12',
  '14.5':'c1', '14.6':'c2 c3', '14.7':'c2 c3', '14.8':'c2 c3', '14.9':'c4 c5',
  '15.1':'c3 c4 c5 c6', '15.2':'c5 c11 c12 c9 c13 c14 c3', '15.3':'c4 c5 c3',
  '15.4':'c4 c5 c3', '15.5':'c4 c6', '15.6':'c6', '15.7':'c6',
  '16.1':'c5 c13 c14 c9 c10 c11 c12 c3',
  '16.2':'c9 c10 c16 c17 c18 c19 c20 c21 c14 c22 c23 c24 c7 guided-external-policy-consideration',
  '16.3':'c4 c5 c6', '16.4':'c8 c9 c6 c3 c10 c11', '16.5':'c8 c9 c6 c7',
  '16.6':'c5 c6 c3 c7', '16.7':'c3 c4', '16.8':'c1 c3',
  '16.9':'c4 c5 c3 guided-security-culture', '16.10':'c5 c9 c11 c12 c7',
  '16.11':'c5 c6 c9 c10 c8', '16.12':'c4 c5 c6', '16.13':'c4 c5', '16.14':'c4 c7 c8 c6',
  '17.1':'c4 c5 c6 c7 c8', '17.2':'c1 c2', '17.3':'c4 c5 c10 c11 c7 c8 c9',
  '17.4':'c5 c6 c8 c9 c3', '17.5':'c5 c8 c9 c10 c11 c12 c3 c13 c14 c15',
  '17.6':'c5 c6 c3 c7', '17.7':'c5 c6 c8 c9 c3', '17.8':'c7 c5 c3 c6', '17.9':'c4 c5 c3',
  '18.1':'c5 c9 c10 c11 c12 c13 c14', '18.2':'c5 c6 c3 c7',
  '18.3':'c5 c6 c7 c8', '18.4':'c4 c5', '18.5':'c4 c5 c3',
};
const CONDITIONAL_ELEMENTS = {
  '2.1':'c10 c11 c12 c13 c14 c15', '2.2':'c5 c6', '2.4':'c3 c4', '4.4':'c2 c3',
  '4.10':'c1 c4 c6 c7', '4.12':'c1', '5.3':'c1', '6.3':'c2 c3', '6.5':'c2 c4 c5',
  '6.7':'c1 c3', '8.4':'c4', '8.6':'c3', '8.7':'c3', '8.9':'c5 c6 c4', '8.12':'c1',
  '10.5':'c3 c4', '13.2':'c3', '13.3':'c3', '13.4':'c3', '13.7':'c4 c6', '13.8':'c4',
  '14.8':'c3', '16.2':'guided-external-policy-consideration', '16.5':'c6', '17.1':'c7', '18.4':'c5',
};
const CONTROL_ONE_IDS = {
  '1.1':'inventory existing system sources owner coverage attributes scope_reason maintenance maintenance_detail frequency last_review reconciled evidence additional_gap gaps additional_confirmation unknowns',
  '1.2':'process existing inventory_dependency detection system owner frequency actions disposition confirmation exceptions reconciled unresolved evidence additional_gap gaps additional_confirmation unknowns',
  '1.3':'tool existing system owner coverage frequency context evidence additional_gap gaps additional_confirmation unknowns',
  '1.4':'logging existing system owner coverage approach inventory_update frequency context evidence additional_gap gaps additional_confirmation unknowns',
  '1.5':'tool existing system owner coverage inventory_update frequency context evidence additional_gap gaps additional_confirmation unknowns',
};
const INVENTORY_ROWS = {
  coverage:['End-user devices','Portable and mobile devices','Servers','Network devices','Non-computing and IoT devices',
    'Virtual assets','Remote assets','Cloud-hosted assets','Regularly connected assets outside enterprise control'],
  attributes:['Static network address where applicable','Hardware address','Machine name','Asset owner','Department','Approved to connect'],
};

function origins(dates) {
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['day','month','instant'].every(key => typeof dates[key] === 'function')
    || dates.instant(0) !== dates.anchor || !scheduledDate(dates.anchor))
    reject('provide the frozen canonical UTC date helpers.');
  const organizationDay = dates.month(-60), organization = scheduledDate(organizationDay);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(organizationDay) || !organization || organization.toISOString().slice(0,10) !== organizationDay
    || organizationDay > dates.anchor.slice(0,10)) reject('retain a valid five-year organization origin.');
  return {origin:[organizationDay,'2024-06-24','2024-07-01'].sort().at(-1)+'T00:00:00.000Z',
    organization_origin:organization.toISOString()};
}

function assertFreshBaseline(db, dates) {
  const {origin, organization_origin} = origins(dates);
  const clients = scoped(db, 'clients'), client = clients[0];
  if (clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 3
    || client.framework_settings['cis-ig1'].guided_assessment_enabled === false
    || db.baselines?.[CID]?.completed !== true || db.baselines[CID].version !== 3
    || scoped(db, 'requirements').filter(row => row.baseline_key === 'cis-ig1' && row.baseline_response === 'applies').length !== 1)
    reject('complete native CIS IG3 onboarding for the canonical Demo client first.');
  if (db.user?.workspace_mode !== 'demo' || db.user.status !== 'active' || !clientAccess(db.user, CID)
    || !['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(db.user.role))
    reject('an authorized Demo writer is required.');
  const definitions = activeDefinitions('cis-ig1', {implementation_group:3}), rows = scoped(db, 'framework_assessments');
  const {policy_keys, plans} = krustyOnboardingSelection(), policies = scoped(db, 'policies'), reviews = scoped(db, 'reviews');
  if (definitions.length !== 153 || rows.length !== 153 || policies.length !== 9 || reviews.length !== 17
    || definitions.some(definition => rows.filter(row => row.framework_key === 'cis-ig1' && row.definition_id === definition.id).length !== 1)
    || policy_keys.some(key => policies.filter(row => row.baseline_key === key).length !== 1)
    || plans.some(plan => reviews.filter(row => row.framework_plan_key === plan.key && row.recurrence === plan.default_cadence
      && (plan.default_cadence !== 'custom' || row.custom_recurrence_days === plan.default_custom_recurrence_days)).length !== 1))
    reject('requires the complete untouched native IG3 baseline.');
  for (const row of rows) {
    const expectedLinks = reviews.filter(review => review.framework_safeguards.includes(row.definition_id))
      .map(review => review.review_id).sort();
    if (row.framework_assessment_id !== `fw_${CID}_assessment_${row.definition_id}` || row.framework_version !== '8.1'
      || row.status !== 'not_assessed' || row.created_at !== origin || row.updated_at !== origin
      || ['implementation','technology','notes','na_rationale','owner_id','process_owner_id','last_assessed','last_saved',
        'assessed_by','verification','verification_checklist','guided_assessment_source','assessment_recorded_at'].some(key => row[key] != null && row[key] !== '')
      || ['assessment_history','items_to_address','cis_assessment_criteria'].some(key => row[key] != null && (!Array.isArray(row[key]) || row[key].length))
      || row.items_revision || !Array.isArray(row.related_links) || row.related_links.some(link => link.kind !== 'reviews')
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
  return {definitions, rows, origin, organization_origin};
}

function processContact(db, role, processOwners) {
  const supplied = processOwners[role], id = typeof supplied === 'string' ? supplied : supplied?.contact_id;
  const name = role.split(' — ')[0];
  const matches = (db.contacts || []).filter(row => id ? row.contact_id === id : row.client_id === CID && row.name === name);
  if (matches.length !== 1 || matches[0].client_id !== CID || matches[0].status !== 'active' || matches[0].name !== name)
    reject('use the existing active Krusty Contact for '+role+'.');
  return matches[0];
}

function validateQuestionMapping(id, version, questions) {
  const controlOne = Object.hasOwn(CONTROL_ONE_IDS, id);
  if (version !== (controlOne ? 'cis-v8.1-control1-5' : 'cis-v8.1-program-5'))
    reject('the authored native question version changed for '+id+'.');
  const ids = questions.map(question => question.id);
  if (new Set(ids).size !== ids.length) reject('duplicate native question identity for '+id+'.');
  if (controlOne) {
    if (ids.join(' ') !== CONTROL_ONE_IDS[id]) reject('an unmapped native question was added or removed for '+id+'.');
    for (const question of questions.filter(question => question.type === 'matrix')) {
      if (id !== '1.1' || !Object.hasOwn(INVENTORY_ROWS, question.id)
        || JSON.stringify(question.rows) !== JSON.stringify(INVENTORY_ROWS[question.id]))
        reject('unmapped native inventory rows for '+id+'.');
    }
  } else {
    if (!Object.hasOwn(ELEMENTS, id)) reject('the authored native elements are unavailable for '+id+'.');
    const suffixes = ELEMENTS[id].split(' '), conditional = (CONDITIONAL_ELEMENTS[id] || '').split(' ');
    const expected = [];
    for (const isConditional of [false,true]) {
      const group = suffixes.filter(suffix => conditional.includes(suffix) === isConditional);
      for (let offset = 0; offset < group.length; offset += 5) expected.push({
        id:(isConditional ? 'conditional_' : 'requirements_')+offset,
        criteria:group.slice(offset,offset+5).map(suffix => id+'-'+suffix),
      });
    }
    const actual = questions.filter(question => question.type === 'matrix')
      .map(question => ({id:question.id, criteria:question.criterion_ids}));
    const fields = questions.filter(question => question.type !== 'matrix').map(question => question.id);
    if (JSON.stringify(actual) !== JSON.stringify(expected)
      || fields.join(' ') !== 'practice existing scope_reason system owner operation evidence additional_gap gaps additional_confirmation unknowns')
      reject('an unmapped native question or requirement element changed for '+id+'.');
  }
}

function interview(id, content, dates, at) {
  const version = versionForSafeguard(id), questions = catalogForVersion(version)?.safeguards[id];
  if (!questions) reject('the native interview is unavailable for '+id+'.');
  validateQuestionMapping(id, version, questions);
  const answers = {};
  for (const question of questions) {
    if (question.type === 'matrix') {
      if (!question.rows?.length || question.criterion_ids && question.criterion_ids.length !== question.rows.length)
        reject('unmapped native matrix shape for '+id+'.');
      answers[question.id] = Object.fromEntries(question.rows.map(row => [row,'Yes']));
    } else if (question.type === 'multi') {
      if (id !== '1.2' || question.id !== 'actions') reject('an unmapped native multi-choice question was added.');
      answers[question.id] = ['Remove from network','Deny remote connection','Quarantine or isolate'];
    } else if (question.type === 'date') {
      if (id !== '1.1' || question.id !== 'last_review') reject('an unmapped native date question was added.');
      answers[question.id] = dates.month(-1);
    } else if (question.type === 'text') {
      const text = {system:content.technology_process, owner:content.owner_role+' / '+content.process_owner_role,
        operation:content.current_implementation, existing:content.current_implementation, evidence:content.evidence_check,
        maintenance_detail:content.technology_process, context:content.scope, scope_reason:'', gaps:'', unknowns:''};
      if (!Object.hasOwn(text, question.id)) reject('an unmapped native text question was added: '+id+'/'+question.id+'.');
      answers[question.id] = text[question.id];
    } else if (question.type === 'select') {
      const values = {practice:'Yes', inventory:'Yes', process:'Yes', tool:'Yes', logging:'Yes', coverage:'Yes', maintenance:'Yes',
        inventory_dependency:'Yes', detection:'Yes', disposition:'Yes', confirmation:'Yes', exceptions:'Yes',
        reconciled:'Yes', inventory_update:'Yes', unresolved:'No', sources:'Multiple reconciled sources', approach:'Both',
        frequency:id === '1.1' ? 'Every six months' : id === '1.3' ? 'Daily' : 'Weekly',
        additional_gap:'No', additional_confirmation:'No'};
      if (!Object.hasOwn(values, question.id)) reject('an unmapped native choice question was added: '+id+'/'+question.id+'.');
      answers[question.id] = values[question.id];
    } else reject('an unmapped native question type was added: '+id+'/'+question.id+'.');
  }
  const visible = visibleQuestions(id, answers, version), keys = new Set(visible.flatMap(question => [question.id,question.id+'_detail']));
  const current = Object.fromEntries(Object.entries(answers).filter(([key]) => keys.has(key)));
  validateGuidedCompletion(id, current, version);
  if (visible.some(question => question.critical && (current[question.id] === undefined
    || question.type === 'matrix' && question.rows.some(row => current[question.id][row] === undefined))))
    reject('all visible required answers must be supplied for '+id+'.');
  const [year, month, day] = at.slice(0,10).split('-').map(Number);
  const result = generateResult(id, current, new Date(year, month-1, day, 12), version);
  if (result.status !== 'addressed' || result.gaps.length || result.unknowns.length || result.signals?.length)
    reject('native guided answers do not establish the clean implemented scenario for '+id+'.');
  if (visible.some(question => question.type === 'date')) result.evaluation_date = at.slice(0,10);
  return {version, answers:current, result, narrative:content.current_implementation, step:visible.length,
    completed:true, revision:1, updated_at:at, generated_at:at, fixture_provenance:SOURCE};
}

function populate(db, {dates, owner, processOwners = {}} = {}) {
  const {definitions, rows, origin, organization_origin} = assertFreshBaseline(db, dates);
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const owners = (db.users || []).filter(row => row.user_id === ownerId), account = owners[0];
  if (owners.length !== 1 || !eligible(account, CID)) reject('use an existing eligible accountable application user.');
  const at = dates.instant(-2), inventoryReview = dates.month(-1)+'T00:00:00.000Z';
  if (!Number.isFinite(Date.parse(at)) || at <= origin || at > dates.anchor
    || !scheduledDate(inventoryReview) || inventoryReview < origin || inventoryReview > at)
    reject('assessment and inventory-review dates must lie within the fictional enrolled program.');
  const drafts = {}, assessments = definitions.map(definition => {
    const original = rows.find(row => row.definition_id === definition.id);
    const content = krustySafeguardContent(definition.id, 'addressed');
    const contact = processContact(db, content.process_owner_role, processOwners);
    const draft = {...interview(definition.id, content, dates, at),
      client_id:CID, assessment_id:original.framework_assessment_id, user_id:account.user_id};
    const row = {...copy(original), status:draft.result.status, owner_id:account.user_id, process_owner_id:contact.contact_id,
      implementation:content.current_implementation, technology:content.technology_process,
      notes:'Scope: '+content.scope+'\n'+content.assessment_notes, updated_at:at, fixture_history_origin_at:origin,
      last_assessed:at, last_saved:at, assessed_by:account.user_id, verification:'needs_validation',
      verification_checklist:null, items_to_address:[], items_revision:0,
      guided_assessment_source:{origin:'fictional-demo-fixture', version:draft.version, revision:draft.revision,
        generated_at:at, by:account.user_id, answers:copy(draft.answers), provenance:SOURCE}};
    row.items_to_address = reconcileItems(row, draft, account.user_id, at);
    if (row.items_to_address.length) reject('the clean implemented scenario unexpectedly produced follow-up for '+definition.id+'.');
    validateAssignment(db, 'framework_assessments', row);
    drafts[row.framework_assessment_id+':'+account.user_id] = draft;
    return row;
  });
  db.framework_assessments = db.framework_assessments.map(row => row.client_id === CID
    ? assessments.find(assessment => assessment.framework_assessment_id === row.framework_assessment_id) : row);
  db.guided_assessment_pilot = {...db.guided_assessment_pilot, ...drafts};
  return {assessments, drafts, origin, organization_origin, anchor:dates.anchor,
    counts:Object.fromEntries(['addressed','in_progress','needs_attention','not_assessed']
      .map(status => [status,assessments.filter(row => row.status === status).length]))};
}

// Explicit fresh-source import only; this does not execute native UI saves,
// approve evidence, populate history or install a retained-session hook.
export function populateKrustyAssessments(db, options) {
  const staged = copy(db), result = populate(staged, options);
  Object.assign(db, staged);
  return result;
}
