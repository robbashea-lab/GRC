import catalog from '@catalogs/onboardingCatalog.json';
import {CATALOGS, activeDefinitions, activePlans, reviewDriver} from '../lib/frameworks';
import {reviewSchedule, reviewView, scheduledDate} from '../lib/reviewOccurrences';
import {validateGovernanceContext} from '../lib/requirementBasis';
import {validateGuidedCompletion} from '../lib/guidedAssessment';
import {clientAccess, eligible, validateAssignment} from './assignmentEligibility';
import {syncPolicyReview} from './policyReviews';
import {effectivePolicySubject} from './policyReviewCoverage';
import {initechOnboardingSelection} from './cisCanonicalInitechBaseline';
import {INITECH_SCENARIO_PROFILE, initechSafeguardContent} from './cisCanonicalInitechContent';

const CID = 'demo_initech';
const SOURCE_URL = 'https://www.cisecurity.org/controls/CIS-controls-navigator';
const SOURCE = 'Explicit fictional Initech Demo governance import; not a browser save, in-app signature, uploaded-file verification or certification.';
const copy = value => JSON.parse(JSON.stringify(value));
const scoped = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const reject = message => {throw new Error('Initech governance: '+message);};
const statusFor = id => INITECH_SCENARIO_PROFILE.partial.includes(id) ? 'in_progress'
  : INITECH_SCENARIO_PROFILE.gaps.includes(id) ? 'needs_attention'
    : INITECH_SCENARIO_PROFILE.unknown.includes(id) ? 'not_assessed' : 'addressed';
const ROLES = {
  program:'Peter Gibbons — Program coordinator / service owner',
  executive:'Bill Lumbergh — Executive sponsor',
  infrastructure:'Samir Nagheenanajar — Infrastructure, identity and recovery lead',
  engineering:'Michael Bolton — Engineering lead',
  vendor:'Tom Smykowski — Vendor / business relationship owner',
  awareness:'Nina — Workforce communications and awareness coordinator'
};

// Sections describe actual required contents, never a mandated template title.
// Supporting mappings retain their implementation evidence outside the approval.
const DOCUMENTS = {
  'policy-data-classification-handling-policy': {
    plans:['data-governance'], role:'program',
    context:'Invoicing, settlement references, support attachments, contracts and personnel information retain separate sensitivity, ownership and handling decisions.',
    sections:[
      {ids:['3.1'], classification:'required_process', content:'The maintained data-management process assigns sensitivity and accountable owners and defines handling, retention limits and sensitivity-appropriate disposal. The new export diagram is separate from this established process.'},
      {ids:['3.2'], classification:'required_inventory', content:'The sensitive-data register identifies the actual stores, purposes, classifications and owners, including the known settlement export store.'},
      {ids:['3.7'], classification:'required_scheme', content:'Public, internal, confidential business and restricted personnel/service classes have defined handling expectations and annual/change maintenance.'},
      {ids:['3.8'], classification:'required_documentation', state:'pending', content:'Established internal/provider flows remain documented. The new settlement export appendix still lacks recipient, purpose and return-path details; the current proposal does not approve or complete those missing decisions.'},
      {ids:['3.4','3.5'], classification:'supporting_context', content:'Class-specific lifecycle jobs, retention holds, authorized erasure and custody/disposition records implement the maintained data process. The document sets organization-selected minimum/maximum retention, holds, archival and final disposal for service, personnel, support and diagnostic records. No specific retention duration or standalone document title is attributed to CIS. Approval does not itself prove that deletion or disposal occurred.'}
    ]
  },
  'policy-configuration-management-policy': {
    plans:['secure-configuration'], role:'infrastructure',
    context:'Role-specific endpoint, phone, server, application, office-device and network baselines retain configuration owners, controlled changes and documented deviations.',
    sections:[
      {ids:['4.1','4.2'], classification:'required_process', content:'Separate enterprise-asset/software and network configuration processes cover secure provisioning, approved settings, change control, review of deviations and annual/significant-change maintenance.'},
      {ids:['12.4'], classification:'required_documentation', content:'Maintained physical/logical topology identifies service, workforce, management, remote-access and provider boundaries, including the settlement bridge. Its topology does not fill the missing data-flow purpose/recipient appendix.'}
    ]
  },
  'policy-access-control-identity-management-policy': {
    plans:['account-authorization'], role:'infrastructure',
    context:'Account inventories, distinct administration, MFA and centralized identity/access enforcement support actual business authorization; no IG3-only role-based-access safeguard is added.',
    sections:[
      {ids:['6.1'], classification:'required_documented_process', content:'Hire and role-change access requests require service-owner authorization, assigned provisioning responsibility and confirmation of effective grants.'},
      {ids:['6.2'], classification:'required_process', content:'Termination, revocation and role-change events trigger immediate access removal, session handling and connected-system confirmation while preserving attributable disabled identities.'}
    ]
  },
  'policy-vulnerability-patch-management-policy': {
    plans:['vulnerability-remediation'], relatedPlans:['secure-development','penetration-testing'], role:'engineering',
    context:'Infrastructure and software weaknesses share accountable intake and risk-based remediation while patching, scanning, component evaluation, development practice and qualified external testing retain their distinct evidence and frequencies.',
    sections:[
      {ids:['7.1','7.2'], classification:'required_documented_process', content:'The vulnerability lifecycle defines enterprise scope, information sources, identification, triage, ownership and escalation. The remediation process defines risk-based priority, owners, target rationale, exceptions and retesting; document review is annual/change for7.1 and monthly for7.2.'},
      {ids:['16.1'], classification:'required_process', content:'The development process covers secure design/coding, developer training, vulnerability management, third-party code and application testing, with annual/significant-change documentation maintenance.'},
      {ids:['16.2','16.6'], classification:'required_process', content:'External/internal vulnerability reports have a published intake route, responsible handler, assignment/remediation/retest flow, severity and timing metrics. Severity definitions include release acceptability; intake documentation is annual/change and severity-system maintenance annual.'},
      {ids:['18.1'], classification:'required_program', content:'The testing program defines authorized scope, frequency, limitations, contacts, remediation routing and retrospective requirements. Actual annual qualified external testing under18.2 remains a separate operating result.'}
    ]
  },
  'policy-information-security-policy': {
    plans:['audit-logging'], role:'infrastructure',
    context:'Protective browser, email, endpoint and network settings are supporting implementation context. The settlement bridge flow-collection gap remains explicit and no unassessed network detection is declared implemented.',
    sections:[{ids:['8.1'], classification:'required_documented_process', content:'The log-management process defines source-specific collection, analysis, retention, ownership and failure escalation. Its annual/change maintenance is separate from weekly actual log examination and90-day retention.'}]
  },
  'policy-backup-restoration-policy': {
    plans:['data-recovery'], role:'infrastructure',
    context:'The approved recovery process does not establish assessed quarterly restore coverage. Safeguard11.5 remains unassessed; neither a backup job nor an isolated copy is recorded as a passed recovery test.',
    sections:[{ids:['11.1'], classification:'required_documented_process', content:'Recovery scope, priorities, dependencies and backup-data protection are maintained for invoicing, settlement-reference exchange and supporting services, with annual/significant-change process review.'}]
  },
  'policy-security-awareness-training-policy': {
    plans:['awareness'], role:'awareness',
    context:'The container supports workforce instruction and role-specific skills; no exact standalone policy title or independent numeric interval for14.9 is claimed.',
    sections:[{ids:['14.1'], classification:'required_program', content:'The maintained awareness program reconciles workforce participation, training at hire/annually, and annual/change content review. Delivery covers the selected safeguard topics, and developer training retains its annual16.9 duty.'}]
  },
  'policy-vendor-third-party-risk-management-policy': {
    plans:['provider-inventory'], role:'vendor',
    context:'A complete provider inventory and maintained lifecycle policy do not place missing security clauses into executed legacy contracts. Safeguard15.4 remains partial and requires executed amendments, not a draft or this policy approval.',
    sections:[{ids:['15.2'], classification:'required_policy_contents', content:'The provider-management policy assigns inventory, classification, assessment, monitoring and decommissioning responsibilities and is maintained annually and on significant change. It does not impose the IG3-only15.5 safeguard on this IG2 program.'}]
  },
  'policy-incident-response-policy': {
    plans:['incident-governance'], role:'program',
    context:'Internal lead/backup ownership, workforce reporting, responder coordination, actual annual exercises and post-incident improvement remain distinct activities; recovery does not close every corrective Action.',
    sections:[
      {ids:['17.1','17.2'], classification:'required_arrangements', content:'Peter is the internal incident lead, Samir the backup, with provider oversight and a maintained relevant-party contact directory; designations are reviewed annually/change and contacts verified annually.'},
      {ids:['17.3','17.4'], classification:'required_documented_process', content:'Workforce-accessible reporting defines timeframes, recipients, mechanisms and minimum report details. The response process defines roles, applicable compliance considerations and the communication plan, maintained annually/change.'},
      {ids:['17.5','17.6'], classification:'required_arrangements', content:'The response matrix assigns accountable functions and primary/secondary communications, including a channel independent of a failed normal service; roles and mechanisms are reviewed annually/change.'}
    ]
  }
};

const PLAN_WORK = {
  'asset-inventory': {role:'infrastructure', due:null, detail:'Next full inventory review follows the actual1.1 interview review date by six native calendar months; daily discovery and weekly exception/DHCP work have separate operating evidence.'},
  'software-support': {role:'infrastructure', due:12, detail:'Perform monthly support/authorization reconciliation, preserve the six-month software/library reassessments, and retain actual update and removal results.'},
  'data-governance': {role:'program', due:0, progress:true, detail:'The current change-handoff follow-up concerns the incomplete settlement export appendix under3.8. The maintained3.1 base process and known3.2 store remain distinct from that pending work.'},
  'secure-configuration': {role:'infrastructure', due:35, extra:['12.4'], detail:'Review maintained enterprise/network configuration processes and topology documentation annually and after significant change; technical deployment evidence remains separate.'},
  'account-authorization': {role:'infrastructure', due:12, detail:'Reconcile quarterly5.1/5.5 authorization and service-account metadata, annual6.6 system inventory and event-triggered grants/revocations. Complete missing5.5 purpose/review metadata without inventing earlier dates.'},
  'vulnerability-remediation': {role:'engineering', due:18, detail:'Review7.2 remediation governance monthly and7.1 documentation annually/change. Automated patching/scanning and actual remediation retain their own required execution records.'},
  'audit-logging': {role:'infrastructure', due:61, detail:'Annual/change8.1 documentation review checks collection, retention and ownership; the separate weekly8.11 tracking parent records actual log examination.'},
  'data-recovery': {role:'infrastructure', due:43, detail:'Maintain annual/change11.1 recovery governance. Automated backups, isolated-copy controls and quarterly11.5 sampled restore testing are separate;11.5 has no fabricated assessed result.'},
  awareness: {role:'awareness', due:70, detail:'Reconcile hire/annual workforce training, annual/change content and delivered role-specific skills. Preserve the separate annual developer-training duty16.9.'},
  'provider-inventory': {role:'vendor', due:-3, progress:true, detail:'The annual inventory/classification/policy/contract gap check has identified missing15.4 terms. This occurrence remains open for overdue administrative follow-up on executed amendments; it does not claim that15.1–15.3 work was never performed.'},
  'incident-governance': {role:'program', due:88, detail:'Review17.1–17.6 arrangements, retain actual annual17.7 exercise results and incident-triggered17.8 lessons. A scheduled meeting does not count as a performed exercise.'},
  'secure-development': {role:'engineering', due:-4, progress:true, detail:'This native recommended validation container tracks mandatory underlying work: annual/change16.1/16.2 processes, annual16.6 severity maintenance, monthly16.4 component evaluation and annual16.9 training. The missed worker inventory/evaluation remains partial; these activities are not optional.'},
  'penetration-testing': {role:'engineering', due:96, detail:'This native recommended validation container tracks the actual18.1 program, qualified annual18.2 external tests and prioritized18.3 remediation. Required external testing is not optional and a Review alone is not the test.'}
};

function contact(db, role, processOwners) {
  const supplied = processOwners[role] || (role === ROLES.executive ? processOwners['Executive sponsor'] : null);
  const id = typeof supplied === 'string' ? supplied : supplied?.contact_id;
  const rows = (db.contacts || []).filter(row => id ? row.contact_id === id : row.client_id === CID && row.name === role.split(' — ')[0]);
  if (rows.length !== 1 || rows[0].client_id !== CID || rows[0].status !== 'active')
    reject('use an existing active Initech Contact for '+role+'.');
  return rows[0];
}

function assertPrepared(db, dates, owner, processOwners) {
  const clients = scoped(db, 'clients'), client = clients[0];
  if (db.user?.workspace_mode !== 'demo' || db.user.status !== 'active' || !clientAccess(db.user, CID)
    || !['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(db.user.role)
    || clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 2
    || db.baselines?.[CID]?.completed !== true || db.baselines[CID].version !== 3)
    reject('an authorized Demo writer and completed canonical IG2 onboarding are required.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['day','month','instant'].every(key => typeof dates[key] === 'function')
    || dates.instant(0) !== dates.anchor || !scheduledDate(dates.anchor)) reject('provide the frozen canonical UTC date helpers.');
  const origin = dates.month(-24)+'T00:00:00.000Z', at = dates.instant(-2);
  if (!scheduledDate(origin) || origin < '2024-06-25T00:00:00.000Z' || at <= origin || at > dates.anchor)
    reject('the fictional v8.1 program dates must follow release and precede the anchor.');
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const accounts = (db.users || []).filter(row => row.user_id === ownerId), account = accounts[0];
  if (accounts.length !== 1 || !eligible(account, CID)) reject('use an existing eligible accountable application user.');
  const definitions = activeDefinitions('cis-ig1', {implementation_group:2});
  const {policy_keys, plans} = initechOnboardingSelection();
  const assessments = scoped(db, 'framework_assessments'), policies = scoped(db, 'policies'), reviews = scoped(db, 'reviews');
  if (definitions.length !== 130 || assessments.length !== 130 || policy_keys.length !== 9 || policies.length !== 9
    || plans.length !== 13 || reviews.length !== 13 || policy_keys.some(key => !Object.hasOwn(DOCUMENTS, key))
    || plans.some(plan => !Object.hasOwn(PLAN_WORK, plan.key)) || db.baselines[CID].updated_at !== origin
    || client.initial_program_baseline?.completed_at !== origin
    || !scoped(db, 'requirements').some(row => row.baseline_key === 'cis-ig1' && row.baseline_response === 'applies'))
    reject('requires the complete fresh native IG2 baseline.');
  const ids = new Set(assessments.map(row => row.framework_assessment_id));
  for (const definition of definitions) {
    const matches = assessments.filter(row => row.definition_id === definition.id && row.framework_key === 'cis-ig1');
    if (matches.length !== 1) reject('requires one native assessment for every selected safeguard.');
    const row = matches[0], status = statusFor(definition.id), content = initechSafeguardContent(definition.id, status);
    const unknown = status === 'not_assessed', draft = db.guided_assessment_pilot?.[row.framework_assessment_id+':'+account.user_id];
    const process = contact(db, content.process_owner_role, processOwners);
    const reviewIds = reviews.filter(review => review.framework_safeguards?.includes(definition.id)).map(review => review.review_id).sort();
    if (row.framework_assessment_id !== `fw_${CID}_assessment_${definition.id}` || row.framework_version !== '8.1'
      || row.status !== status || row.implementation !== content.current_implementation || row.technology !== content.technology_process
      || row.notes !== 'Scope: '+content.scope+'\n'+(unknown ? 'Assessment plan: '+content.assessment_plan : content.assessment_notes)
      || row.created_at !== origin || row.updated_at !== (unknown ? origin : at) || row.owner_id !== account.user_id
      || row.process_owner_id !== process.contact_id
      || row.last_saved !== (unknown ? null : at) || row.last_assessed !== (unknown ? null : at)
      || row.assessed_by !== (unknown ? null : account.user_id)
      || row.verification !== (unknown ? null : status === 'addressed' ? 'needs_validation' : 'gap_identified')
      || row.verification_checklist != null || row.assessment_history?.length
      || row.related_links?.some(link => link.kind !== 'reviews')
      || JSON.stringify((row.related_links || []).map(link => link.id).sort()) !== JSON.stringify(reviewIds)
      || row.items_to_address?.some(item => item.state !== 'open' || item.finding_id != null))
      reject('requires untouched imported assessments, verification and relationships.');
    if (unknown) {
      if (draft || row.guided_assessment_source || row.items_to_address?.length) reject('unassessed safeguards must have no imported conclusions.');
    } else {
      if (!draft || draft.client_id !== CID || draft.assessment_id !== row.framework_assessment_id || draft.user_id !== account.user_id
        || !draft.completed || draft.revision !== 1 || draft.generated_at !== at || draft.updated_at !== at
        || draft.fixture_provenance !== 'Explicit fictional Initech Demo assessment import; not a browser save, evidence validation or certification.'
        || row.guided_assessment_source?.origin !== 'fictional-demo-fixture'
        || row.guided_assessment_source.version !== draft.version || row.guided_assessment_source.revision !== 1
        || row.guided_assessment_source.generated_at !== at || row.guided_assessment_source.by !== account.user_id
        || JSON.stringify(row.guided_assessment_source.answers) !== JSON.stringify(draft.answers))
        reject('requires the complete source-only imported interviews.');
      validateGuidedCompletion(definition.id, draft.answers, draft.version);
    }
  }
  const interviews = Object.entries(db.guided_assessment_pilot || {}).filter(([key, value]) => value?.client_id === CID
    || [...ids].some(id => key.startsWith(id+':')));
  if (interviews.length !== 128 || interviews.some(([key, value]) => !ids.has(value.assessment_id)
      || key !== value.assessment_id+':'+account.user_id)
    || Object.entries(db.guided_assessment_history || {}).some(([key, value]) => value?.client_id === CID || [...ids].some(id => key.startsWith(id+':')))
    || policies.some(row => row.policy_id !== CID+'_'+row.baseline_key || !policy_keys.includes(row.baseline_key)
      || row.presence !== 'reported_missing' || row.status !== 'needs_creation' || row.baseline_response !== 'no'
      || row.updated_at !== origin || row.owner_id || row.summary || row.document_url || row.approved_at || row.approval_source
      || row.approval_subject || row.approval_history?.length || row.decision_history?.length)
    || new Set(policies.map(row => row.baseline_key)).size !== 9
    || plans.some(plan => reviews.filter(row => row.framework_plan_key === plan.key).length !== 1)
    || reviews.some(row => row.review_id !== CID+'_canonical_review_'+row.framework_plan_key
      || row.status !== 'needs_scheduling' || row.due_date || row.next_review_date || row.updated_at !== origin
      || row.owner_id || row.reviewer_id || row.notes || row.scope || row.occurrences?.length || row.policy_id || row.policy_ids?.length)
    || ['findings','tasks','evidence','risks','vendors','ai_systems','assets','organizational_controls','exceptions','assessments','comments']
      .some(kind => scoped(db, kind).length) || db.drafts?.[CID]) reject('requires untouched documents, Review parents and source records.');
  for (const [kind, field] of [['policies','policy_id'],['reviews','review_id'],['framework_assessments','framework_assessment_id']]) {
    const targetIds = new Set(scoped(db, kind).map(row => row[field]));
    if (targetIds.size !== scoped(db, kind).length || (db[kind] || []).some(row => row.client_id !== CID && targetIds.has(row[field])))
      reject('a native identity is duplicated or belongs to another client.');
  }
  return {client, account, definitions, policy_keys, plans, assessments, policies, reviews, origin, at};
}

function subject(policy, approver, at, version, summary) {
  return {subject_id:policy.policy_id+'_subject_'+version.replaceAll('.', '_'), captured_at:at, client_id:CID,
    policy_id:policy.policy_id, title:policy.title, version, summary, owner_id:policy.owner_id,
    named_approver:{contact_id:approver.contact_id, name:approver.name},
    basis:{type:'external', reference:'Fictional Initech controlled document register / '+policy.title,
      document_version:version, verification:'Reference recorded; external bytes not verified'}};
}

function externalDecision(approval, account, approver) {
  return {action:'external_approval_recorded', recorded_by:account.user_id, recorded_by_name:account.name,
    recorded_at:approval.captured_at, reported_approver_id:approver.contact_id, reported_approved_at:approval.captured_at,
    provenance:SOURCE+' Fictional external approval reference; not an in-app signature.', subject:copy(approval)};
}

function populate(db, {dates, owner, processOwners = {}} = {}) {
  if (!processOwners || typeof processOwners !== 'object' || Array.isArray(processOwners)) reject('process owners must identify existing Contacts.');
  const prepared = assertPrepared(db, dates, owner, processOwners);
  const {client, account, definitions, policy_keys, plans, assessments, policies:originalPolicies, reviews:originalReviews, origin, at} = prepared;
  const definitionsById = new Map(definitions.map(row => [row.id, row]));
  const approver = contact(db, ROLES.executive, processOwners);
  const obligation = id => {
    const definition = definitionsById.get(id);
    if (!definition) reject('an attributed source obligation is outside cumulative IG2: '+id+'.');
    return {definition_id:id, minimum_implementation_group:definition.implementation_group,
      source_cadence:definition.source_cadence, source_url:SOURCE_URL};
  };
  const reviewManifest = [];
  const reviews = plans.map(plan => {
    const original = originalReviews.find(row => row.framework_plan_key === plan.key), work = PLAN_WORK[plan.key];
    const process = contact(db, ROLES[work.role], processOwners);
    const ids = [...new Set([...plan.safeguards, ...(work.extra || [])])];
    const inventorySchedule = plan.key === 'asset-inventory'
      ? reviewSchedule({due_date:dates.month(-1), recurrence:'semiannual'}, true) : null;
    const due = inventorySchedule?.next_review_date?.slice(0,10) || dates.day(work.due);
    const row = {...copy(original), owner_id:account.user_id, reviewer_id:account.user_id,
      framework_drivers:[reviewDriver('cis-ig1', plan)], recurrence:plan.default_cadence, due_date:due,
      status:work.progress ? 'in_progress' : 'upcoming', current_occurrence_id:'occ_'+original.review_id,
      updated_at:at, occurrences:[], scope:'Fictional Initech invoicing, settlement-reference and support services: '+ids.join(', ')+'.',
      notes:SOURCE+' Process owner: '+process.name+'. '+work.detail+' Source duties: '
        +ids.map(id => id+': '+obligation(id).source_cadence).join(' | '),
      governance_context:{category:'organizational', rationale:'Organization-selected tracking through the existing native CIS IG2 plan; source duties are retained individually.',
        cadence_source:'organization_defined', cadence_rationale:work.detail,
        citation:'CIS Controls v8.1, selected cumulative IG2 safeguards '+ids.join(', '), reference_url:SOURCE_URL}};
    if (work.progress) Object.assign(row, {started_at:dates.instant(-14), started_by:account.user_id});
    const resetSchedule = reviewSchedule(row, true);
    // A clipped due date can be month-end when the interview anchor was not.
    const schedule = inventorySchedule && !inventorySchedule.schedule_anchor.month_end && resetSchedule.schedule_anchor.month_end
      ? reviewSchedule({...row,schedule_anchor:inventorySchedule.schedule_anchor}) : resetSchedule;
    Object.assign(row, schedule);
    validateAssignment(db, 'reviews', row); validateGovernanceContext(row.governance_context);
    reviewManifest.push({review_id:row.review_id, plan_key:plan.key, safeguards:ids, process_owner_id:process.contact_id,
      source_obligations:ids.map(obligation), tracking_basis:'Existing native plan; a platform ticket is not mandated by CIS.',
      native_plan_basis:plan.basis, native_cadence_class:plan.cadence_class, due_date:row.due_date, recurrence:row.recurrence});
    return reviewView(row);
  });
  for (const spec of [
    {id:'8.11', role:'infrastructure', title:'Weekly audit-log examination', recurrence:'custom', days:7, due:3,
      detail:'Perform actual weekly log examination, record examined sources, anomalies and disposition. This organization-selected tracking ticket does not replace analysis with an annual document review.'},
    {id:'11.5', role:'infrastructure', title:'Quarterly sampled data-recovery tests', recurrence:'quarterly', due:12,
      detail:'Collect and assess actual quarterly sampled restore execution, coverage, failures and outcomes. The current11.5 assessment remains unassessed; no performed or passed test is claimed by this scheduled parent.'}
  ]) {
    // This is the native requirement-specific setup identity, with no invented plan key.
    const reviewId = `fw_${CID}_review_requirement:${spec.id}`;
    if ((db.reviews || []).some(row => row.review_id === reviewId || row.framework_setup_key === reviewId))
      reject('a requirement-specific tracking identity already exists.');
    const process = contact(db, ROLES[spec.role], processOwners);
    const row = {review_id:reviewId, client_id:CID, title:spec.title, review_type:'requirements', framework_key:'cis-ig1',
      framework_version:'8.1', framework_setup_key:reviewId, framework_safeguards:[spec.id],
      owner_id:account.user_id, reviewer_id:account.user_id, recurrence:spec.recurrence,
      ...(spec.days ? {custom_recurrence_days:spec.days} : {}), due_date:dates.day(spec.due), status:'upcoming',
      created_at:origin, created_by:account.user_id, updated_at:at, occurrences:[], current_occurrence_id:'occ_'+reviewId,
      scope:'Fictional Initech '+spec.id+' actual operating activity.', notes:SOURCE+' Process owner: '+process.name+'. '+spec.detail,
      governance_context:{category:'organizational', rationale:'Explicitly chosen tracking of a required CIS operating activity, not a claim that CIS mandates a manual platform Review ticket.',
        cadence_source:'organization_defined', cadence_rationale:spec.detail,
        citation:'CIS Controls v8.1 Safeguard '+spec.id, reference_url:SOURCE_URL}};
    Object.assign(row, reviewSchedule(row, true));
    validateAssignment(db, 'reviews', row); validateGovernanceContext(row.governance_context);
    reviews.push(reviewView(row));
    reviewManifest.push({review_id:reviewId, plan_key:null, safeguards:[spec.id], process_owner_id:process.contact_id,
      source_obligations:[obligation(spec.id)], tracking_basis:'Explicit organization-selected manual tracking of the required operating activity.',
      due_date:row.due_date, recurrence:row.recurrence, custom_recurrence_days:row.custom_recurrence_days,
      assessment_state:spec.id === '11.5' ? 'not_assessed' : 'addressed'});
  }
  const policyManifest = [];
  const policies = policy_keys.map(key => {
    const original = originalPolicies.find(row => row.baseline_key === key), spec = DOCUMENTS[key];
    const item = catalog.policies.find(row => row.key === key), process = contact(db, ROLES[spec.role], processOwners);
    const nativeMapped = catalogPolicyIds(key);
    // The selected data process also contains the retention/disposal instructions;
    // this fixture content does not change the shared template mappings.
    const supportingContents = key === 'policy-data-classification-handling-policy' ? ['3.4','3.5'] : [];
    const mapped = definitions.filter(definition => nativeMapped.includes(definition.id)
      || supportingContents.includes(definition.id)).map(row => row.id);
    const requiredIds = new Set(spec.sections.filter(section => section.classification !== 'supporting_context').flatMap(section => section.ids));
    if (spec.sections.some(section => section.ids.some(id => !mapped.includes(id)))) reject('document contents are outside their genuine native mapping.');
    const pending = key === 'policy-data-classification-handling-policy';
    const contents = 'Fictional Initech: '+spec.context+' '+spec.sections.filter(section => section.state !== 'pending').map(section => section.content).join(' ');
    const approvedSummary = pending
      ? 'Fictional Initech approved base data-management process: established invoicing, support and personnel records have accountable owners, sensitivity classes, handling, retention and disposal requirements. Existing inventory and flow documentation remain in scope. This approved version does not approve the later settlement-export appendix or establish its missing recipient, purpose and return path.'
      : contents;
    const summary = contents+(pending ? ' Pending amendment: '+spec.sections.find(section => section.state === 'pending').content : '');
    const policy = {...copy(original), title:item.name, category:item.category, owner_id:account.user_id,
      approver_contact_id:approver.contact_id, status:pending ? 'in_review' : 'approved',
      presence:pending ? 'reported_existing' : 'verified_existing', baseline_response:'yes', version:pending ? '2.1-draft' : '2.0', summary,
      updated_at:pending ? dates.instant(-8) : dates.month(-4)+'T00:00:00.000Z', approved_at:null,
      approval_history:[], decision_history:[], approval_subject:null,
      governance_context:{category:'organizational', rationale:'Contains the mapped source processes or supporting instructions; its template title is not a CIS mandate. Approval does not prove technical implementation.',
        cadence_source:'organization_defined', cadence_rationale:'The linked authoritative native process Review owns document maintenance; material-change and operating duties remain distinct.'}};
    const first = subject(policy, approver, dates.month(-23)+'T00:00:00.000Z', '1.0',
      'Initial fictional Initech controlled process and responsibilities for '+item.name+'. Operating outcomes and later amendments are not asserted by this historical reference.');
    const approved = subject(policy, approver, dates.month(-4)+'T00:00:00.000Z', '2.0', approvedSummary);
    policy.decision_history.push(externalDecision(first, account, approver), externalDecision(approved, account, approver));
    const current = pending ? subject(policy, approver, dates.instant(-8), policy.version, summary) : approved;
    if ([first, approved, current].some(value => !scheduledDate(value.captured_at)
      || value.captured_at < origin || value.captured_at > dates.anchor)
      || first.captured_at >= approved.captured_at || approved.captured_at > current.captured_at)
      reject('fictional approval references must retain valid past version dates.');
    policy.approval_source = {version:policy.version, external_reference:current.basis.reference, external_version:policy.version};
    policy.approval_subject = copy(current);
    if (pending) {
      policy.approval_request_id = policy.policy_id+'_submission_2_1'; policy.submitted_at = current.captured_at; policy.submitted_by = account.user_id;
      policy.approval_history.push({action:'submitted', at:current.captured_at, by:account.user_id,
        by_name:account.name, by_email:account.email, approval_request_id:policy.approval_request_id,
        subject:copy(current), provenance:SOURCE});
    } else {
      policy.approved_at = approved.captured_at; policy.effective_date = approved.captured_at.slice(0,10);
    }
    const linked = reviews.filter(review => spec.plans.includes(review.framework_plan_key));
    const related = reviews.filter(review => (spec.relatedPlans || []).includes(review.framework_plan_key));
    if (linked.length !== 1 || related.length !== (spec.relatedPlans || []).length)
      reject('a selected document needs one authoritative native schedule and all related process Reviews.');
    for (const review of linked) {
      if (review.policy_id) reject('a selected process Review cannot own multiple document schedules.');
      review.policy_id = policy.policy_id;
    }
    // Other process work can reference the same document without becoming a
    // second active owner of its native Policy Review schedule.
    for (const review of related) review.related_links = [...(review.related_links || []), {kind:'policies', id:policy.policy_id}];
    if (related.length) policy.related_links = related.map(review => ({kind:'reviews', id:review.review_id}));
    validateAssignment(db, 'policies', policy); validateGovernanceContext(policy.governance_context);
    const covered = effectivePolicySubject(policy, dates.anchor);
    if (covered?.version !== '2.0') reject('the exact earlier/current approved version must remain available.');
    policyManifest.push({policy_id:policy.policy_id, policy_key:key, process_owner_id:process.contact_id,
      review_ids:linked.map(review => review.review_id), safeguards:mapped, status:policy.status,
      related_review_ids:related.map(review => review.review_id),
      native_template_safeguards:nativeMapped, source_supported_contents:supportingContents,
      required_contents:[...requiredIds], supporting_context:mapped.filter(id => !requiredIds.has(id)),
      sections:copy(spec.sections), source_obligations:mapped.map(obligation),
      approved_version:'2.0', current_version:policy.version, approval_basis:'Fictional external reference; bytes not verified.'});
    return policy;
  });
  const withLinks = assessments.map(row => {
    const additions = [...reviewManifest.filter(entry => entry.safeguards.includes(row.definition_id))
      .map(entry => ({kind:'reviews', id:entry.review_id})),
    ...policyManifest.filter(entry => entry.safeguards.includes(row.definition_id)).map(entry => ({kind:'policies', id:entry.policy_id}))];
    const links = [...row.related_links];
    for (const link of additions) if (!links.some(old => old.kind === link.kind && old.id === link.id)) links.push(link);
    return {...copy(row), related_links:links};
  });
  db.policies = db.policies.map(row => row.client_id === CID ? policies.find(policy => policy.policy_id === row.policy_id) : row);
  db.reviews = db.reviews.map(row => row.client_id === CID ? reviews.find(review => review.review_id === row.review_id) : row)
    .concat(reviews.filter(review => !originalReviews.some(original => original.review_id === review.review_id)));
  for (const review of reviews) syncPolicyReview(db, review);
  db.framework_assessments = db.framework_assessments.map(row => row.client_id === CID
    ? withLinks.find(assessment => assessment.framework_assessment_id === row.framework_assessment_id) : row);
  const baseline = {...copy(db.baselines[CID]), updated_at:at,
    policies:Object.fromEntries(policies.map(policy => [policy.baseline_key, policy.baseline_response])),
    framework_reviews:Object.fromEntries(activePlans('cis-ig1', {implementation_group:2}).map(plan => {
      const review = reviews.find(row => row.framework_plan_key === plan.key);
      return [plan.key, {enabled:!!review, recurrence:plan.default_cadence, due_date:review?.due_date || null}];
    }))};
  db.baselines = {...db.baselines, [CID]:baseline}; client.onboarding_baseline = copy(baseline);
  return {policies, reviews, assessments:withLinks, mapping:policyManifest, review_manifest:reviewManifest, origin, anchor:dates.anchor};
}

function catalogPolicyIds(key) {
  const mappings = CATALOGS['cis-ig1'].policy_mappings.filter(row => row.policy_key === key);
  return activeDefinitions('cis-ig1', {implementation_group:2})
    .filter(definition => mappings.some(row => row.safeguards.includes(definition.id))).map(row => row.id);
}

// Source-only constructor. Validate the entire staged result before publishing
// target changes; unrelated records, contacts, identities and history stay intact.
export function populateInitechGovernance(db, options) {
  const staged = copy(db), result = populate(staged, options);
  db.policies = db.policies.map(row => row.client_id === CID ? result.policies.find(policy => policy.policy_id === row.policy_id) : row);
  db.reviews = db.reviews.map(row => row.client_id === CID ? result.reviews.find(review => review.review_id === row.review_id) : row)
    .concat(result.reviews.filter(review => !db.reviews.some(original => original.review_id === review.review_id)));
  db.framework_assessments = db.framework_assessments.map(row => row.client_id === CID
    ? result.assessments.find(assessment => assessment.framework_assessment_id === row.framework_assessment_id) : row);
  db.baselines = {...db.baselines, [CID]:staged.baselines[CID]};
  db.clients.find(row => row.client_id === CID).onboarding_baseline = copy(staged.baselines[CID]);
  return result;
}
