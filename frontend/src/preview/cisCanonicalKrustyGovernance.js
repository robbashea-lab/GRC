import catalog from '@catalogs/onboardingCatalog.json';
import {CATALOGS, activeDefinitions, activePlans, reviewDriver} from '../lib/frameworks';
import {reviewSchedule, reviewView, scheduledDate} from '../lib/reviewOccurrences';
import {validateGovernanceContext} from '../lib/requirementBasis';
import {validateGuidedCompletion, generateResult, visibleQuestions} from '../lib/guidedAssessment';
import {clientAccess, eligible, validateAssignment} from './assignmentEligibility';
import {syncPolicyReview} from './policyReviews';
import {effectivePolicySubject} from './policyReviewCoverage';
import {krustyOnboardingSelection} from './cisCanonicalKrustyBaseline';
import {KRUSTY_SAFEGUARD_IDS, krustySafeguardContent} from './cisCanonicalKrustyContent';

const CID = 'demo_krusty_krab';
const SOURCE_URL = 'https://www.cisecurity.org/controls/CIS-controls-navigator';
const SOURCE = 'Explicit fictional Krusty Demo governance import; not a browser save, in-app signature, uploaded-file verification or certification.';
const copy = value => JSON.parse(JSON.stringify(value));
const scoped = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const reject = message => {throw new Error('Krusty governance: '+message);};
const CONFIGURATION = {implementation_group:3};
const ROLES = {
  program:'Squidward Tentacles — Franchise operations coordinator',
  executive:'Eugene Krabs — Executive sponsor',
  technical:'SpongeBob SquarePants — Engineering and infrastructure lead'
};

// Sections describe actual required contents, never a mandated template title.
// Supporting mappings retain their implementation evidence outside the approval.
const DOCUMENTS = {
  'policy-data-classification-handling-policy': {
    plans:['data-governance'], role:'program', sourceContents:['3.4','3.5'],
    context:'Guest ordering references, employee records, franchise agreements and proprietary recipes retain distinct owners, sensitivity, storage and permitted flows. Payment entry remains with the separate processor.',
    sections:[
      {ids:['3.1'], classification:'required_process', content:'The data-management process assigns accountability and defines sensitivity, handling, approved storage, retention and sensitivity-appropriate disposal across restaurant and cloud information.'},
      {ids:['3.2','3.7','3.8'], classification:'required_documentation', content:'The maintained sensitive-data inventory, classification scheme and flow diagrams identify actual stores, owners, purposes and destinations. The ordering application retains payment references rather than card numbers or security codes.'},
      {ids:['3.4','3.5'], classification:'supporting_context', content:'The data process specifies organization-selected minimum/maximum retention, legal holds, archival and authorized final disposal for employee, franchise, guest-order and diagnostic records. No particular duration or standalone document title is attributed to CIS. Disposal output remains separate operating evidence.'}
    ]
  },
  'policy-configuration-management-policy': {
    plans:['secure-configuration'], role:'technical',
    context:'Restaurant POS, kiosks, kitchen controllers, office devices, mobile workspaces, network devices and cloud workloads use maintained role-specific baselines.',
    sections:[
      {ids:['4.1','4.2'], classification:'required_process', content:'Separate enterprise-asset/software and network configuration processes define secure provisioning, approved settings, deviations and controlled changes, with annual and significant-change maintenance.'},
      {ids:['12.4'], classification:'required_documentation', content:'Physical and logical diagrams identify restaurant, franchise, guest, administrative and ordering-cloud boundaries and relevant managed-provider connectivity.'}
    ]
  },
  'policy-access-control-identity-management-policy': {
    plans:['account-authorization'], role:'program', sourceContents:['6.8'],
    context:'Named workforce and service accounts, distinct administration and managed access preserve restaurant and central-service responsibilities without treating a business Contact as an application account.',
    sections:[
      {ids:['6.1'], classification:'required_documented_process', content:'The documented joiner and role-change granting process requires accountable authorization, controlled provisioning and confirmation of the resulting grants.'},
      {ids:['6.2'], classification:'required_process', content:'Termination, rights revocation and role change trigger immediate access removal by disabling the relevant accounts and checking connected systems; attributable disabled identities are retained to preserve audit trails.'},
      {ids:['6.8'], classification:'required_documentation', content:'The existing Access document contains the role-to-rights matrix for store crew, managers, payroll, franchise operations and application/infrastructure administrators. Role rights and assigned privileges are validated at least annually; grants, changes and revocations remain separately controlled.'}
    ]
  },
  'policy-vulnerability-patch-management-policy': {
    plans:['vulnerability-remediation'], relatedPlans:['secure-development','penetration-testing','internal-penetration-test'], role:'technical',
    context:'Infrastructure and internal ordering development use accountable weakness intake, risk-based remediation, secure lifecycle work and qualified testing; a controlled document is not a passed scan or penetration test.',
    sections:[
      {ids:['7.1','7.2'], classification:'required_documented_process', content:'The vulnerability process defines coverage, sources, identification and triage; remediation defines priority, responsibility, timing, exceptions and retesting. Documentation is annual/change for7.1 and remediation-process review monthly for7.2.'},
      {ids:['16.1','16.2'], classification:'required_process', content:'The maintained development process covers secure design/coding, threat analysis, developer training, component evaluation, static/dynamic checks and application testing. Published vulnerability intake assigns responsible handlers, remediation and retesting, and timing metrics. Both processes\' documentation is reviewed annually and after significant enterprise change.'},
      {ids:['16.6'], classification:'required_process', content:'The application-vulnerability severity system sets remediation priority and minimum security acceptability for releases; the system and process are reviewed and updated at least annually.'},
      {ids:['18.1'], classification:'required_program', content:'The penetration-testing program defines authorized external, internal and application scopes, frequency, limits, contacts, remediation routing and retrospective duties. Qualified external and internal tests each retain annual minimums; defense validation occurs after every test and is separate from individual remediation closure.'}
    ]
  },
  'policy-information-security-policy': {
    plans:['audit-logging'], role:'technical',
    context:'Restaurant, workforce, administrative and ordering-cloud log sources support security analysis, including sensitive-data events and available provider logs.',
    sections:[{ids:['8.1'], classification:'required_documented_process', content:'The maintained logging process assigns collection, analysis, retention, source coverage and failure handling. Annual/significant-change documentation review does not replace weekly actual log examination, monthly alert tuning or required log retention.'}]
  },
  'policy-backup-restoration-policy': {
    plans:['data-recovery'], role:'technical',
    context:'Recovery covers ordering and menu services, franchise configuration and protected workforce/business information without duplicating payment-processor card records.',
    sections:[{ids:['11.1'], classification:'required_documented_process', content:'The recovery process defines priorities, dependencies, backup-data protection and restoration responsibilities, with annual and significant-change maintenance. Automated backup results, protected isolated copies and quarterly sampled recovery tests retain separate execution evidence.'}]
  },
  'policy-security-awareness-training-policy': {
    plans:['awareness'], role:'program',
    context:'The 216-member workforce receives role-appropriate security instruction across restaurants, franchise operations and the internal application team.',
    sections:[{ids:['14.1'], classification:'required_program', content:'The maintained awareness program reconciles training at hire and at least annually, annual/change content review, attendance and follow-up. Selected topic coverage and role-specific skills are retained; developer training keeps its separate annual16.9 duty.'}]
  },
  'policy-vendor-third-party-risk-management-policy': {
    plans:['provider-inventory'], role:'program',
    context:'Payment, ordering, workforce and infrastructure providers have classified relationships, accountable owners and maintained lifecycle guidance.',
    sections:[{ids:['15.2'], classification:'required_policy_contents', content:'The provider policy defines inventory, classification, assessment, monitoring and secure exit, with annual/significant-change maintenance. Per-provider assessment occurs at least annually and for new/renewed contracts; policy-defined monitoring and decommissioning outputs remain distinct. Annual inventory review alone does not establish those results or executed contract terms.'}]
  },
  'policy-incident-response-policy': {
    plans:['incident-governance'], role:'program', sourceContents:['17.9'],
    context:'Squidward coordinates incidents, SpongeBob leads technical response and Eugene provides executive escalation for the twelve-restaurant franchise and ordering platform.',
    sections:[
      {ids:['17.1','17.2'], classification:'required_arrangements', content:'The response lead, backup, executive escalation and relevant-party contacts have assigned responsibilities, annual/change designation review and annual contact verification.'},
      {ids:['17.3','17.4','17.5','17.6'], classification:'required_documented_process', content:'Workforce-accessible reporting identifies timeframes, mechanisms and minimum details; the response process assigns roles, legal/business considerations and communications, including a channel independent of the affected service. Processes and role arrangements are reviewed annually and after significant change.'},
      {ids:['17.9'], classification:'required_documentation', content:'The existing Incident Response document distinguishes events from incidents and defines impact, priority, escalation and update thresholds. Blocked scans, unauthorized administration and multi-restaurant disruption receive proportionate classification. Thresholds are reviewed annually and after significant change.'}
    ]
  }
};

const PLAN_WORK = {
  'asset-inventory': {role:'technical', detail:'The complete inventory follows its actual1.1 interview review date by six native calendar months; daily active discovery and weekly DHCP/exception reconciliation retain actual operating output.'},
  'software-support': {role:'technical', due:12, detail:'Perform monthly support/authorization and network-device support checks. Preserve six-month full software/library review and the separate2.7 script reassessment; source duties are not optional.'},
  'data-governance': {role:'program', due:35, detail:'Review maintained data process, classification, inventory, flows, retention and disposal instructions annually and on significant change; actual lifecycle output is separate.'},
  'secure-configuration': {role:'technical', due:47, extra:['12.4'], detail:'Maintain enterprise/network configuration processes and topology annually and after significant change. Technical baseline enforcement and mobile-workspace separation retain actual operating output.'},
  'account-authorization': {role:'program', due:30, detail:'Reconcile quarterly authorization and service-account metadata, annual authentication-system inventory and annual6.8 role-right/privilege validation. Event-triggered grants/revocations remain timely rather than waiting for this Review.'},
  'vulnerability-remediation': {role:'technical', due:18, detail:'Review remediation governance monthly and vulnerability-process documentation annually/change. Actual patching, quarterly internal and monthly external vulnerability scanning and risk-prioritized correction retain their own results.'},
  'audit-logging': {role:'technical', due:61, detail:'Annual/change log-process maintenance preserves required collection, sensitive-data/provider sources and retention. Separate weekly8.11 examination and monthly13.11 tuning record actual execution.'},
  'data-recovery': {role:'technical', due:43, detail:'Maintain annual/change recovery governance separately from weekly-or-more-frequent backups, isolated-copy protection and actual quarterly11.5 sampled restore tests.'},
  awareness: {role:'program', due:70, detail:'Reconcile hire/annual training, annual/change program contents and delivered role-specific skills. Annual developer training remains required, not optional.'},
  'provider-inventory': {role:'program', due:85, detail:'Review the provider inventory and lifecycle guidance annually/change. Per-provider15.5 annual and new/renewed-contract assessments,15.6 policy-defined monitoring and15.7 secure exit retain their actual separate outputs; this inventory Review does not replace them.'},
  'incident-governance': {role:'program', due:88, detail:'Maintain response roles, contacts, reporting, communications and17.9 thresholds annually/change. Annual exercises and incident-triggered lessons are actual operating duties, not merely this scheduled meeting.'},
  'secure-development': {role:'technical', due:20, detail:'The recommended native validation container tracks required lifecycle work: annual/change processes, annual severity maintenance, monthly component evaluation, annual training, design threat analysis and static/dynamic checks. Mandatory underlying duties are not optional.'},
  'penetration-testing': {role:'technical', due:96, detail:'The recommended program Review preserves authorized scopes, annual qualified external testing and prioritized correction. Separate internal testing, application-program frequency and post-test defense validation remain required; a Review alone is not a performed test.'},
  'passive-discovery-reconciliation': {role:'technical', due:3, detail:'Reconcile passive-discovery output into the asset inventory at least weekly; a six-month inventory meeting cannot substitute for this activity.'},
  'script-allowlist-reassessment': {role:'technical', due:80, detail:'Reassess authorized scripts at least every six months while execution enforcement operates continuously. Monthly software-support metadata alone does not establish this reassessment.'},
  'event-alert-tuning': {role:'technical', due:15, detail:'Tune alert thresholds at least monthly using actual events, false positives, missed detections and retained decisions. A network-governance meeting alone is insufficient.'},
  'internal-penetration-test': {role:'technical', due:110, detail:'Perform qualified internal penetration testing at least annually under the program with permitted internal scope, findings and separate post-test defense validation. External testing alone does not satisfy this duty.'}
};

function contact(db, role, processOwners) {
  const supplied = processOwners[role] || (role === ROLES.executive ? processOwners['Executive sponsor'] : null);
  const id = typeof supplied === 'string' ? supplied : supplied?.contact_id;
  const rows = (db.contacts || []).filter(row => id ? row.contact_id === id : row.client_id === CID && row.name === role.split(' — ')[0]);
  if (rows.length !== 1 || rows[0].client_id !== CID || rows[0].status !== 'active')
    reject('use an existing active Krusty Contact for '+role+'.');
  return rows[0];
}

function assertPrepared(db, dates, owner, processOwners) {
  const clients = scoped(db, 'clients'), client = clients[0];
  if (db.user?.workspace_mode !== 'demo' || db.user.status !== 'active' || !clientAccess(db.user, CID)
    || !['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(db.user.role)
    || clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 3
    || client.framework_settings['cis-ig1'].guided_assessment_enabled === false
    || db.baselines?.[CID]?.completed !== true || db.baselines[CID].version !== 3)
    reject('an authorized Demo writer and completed canonical IG3 onboarding are required.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['day','month','instant'].every(key => typeof dates[key] === 'function')
    || dates.instant(0) !== dates.anchor || !scheduledDate(dates.anchor)) reject('provide the frozen canonical UTC date helpers.');
  const organization_origin = dates.month(-60)+'T00:00:00.000Z';
  // Match the baseline's declared fictional first enrollment; this is not a release-date claim.
  const origin = [dates.month(-60),'2024-06-24','2024-07-01'].sort().at(-1)+'T00:00:00.000Z', at = dates.instant(-2);
  if (!scheduledDate(organization_origin) || !scheduledDate(origin) || organization_origin > origin
    || !scheduledDate(at) || at <= origin || at > dates.anchor)
    reject('the fictional program dates must preserve organization history and post-release CIS enrollment.');
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const accounts = (db.users || []).filter(row => row.user_id === ownerId), account = accounts[0];
  if (accounts.length !== 1 || !eligible(account, CID)) reject('use an existing eligible accountable application user.');
  const definitions = activeDefinitions('cis-ig1', CONFIGURATION);
  const {policy_keys, plans} = krustyOnboardingSelection();
  const assessments = scoped(db, 'framework_assessments'), policies = scoped(db, 'policies'), reviews = scoped(db, 'reviews');
  if (JSON.stringify(definitions.map(row => row.id).sort()) !== JSON.stringify([...KRUSTY_SAFEGUARD_IDS].sort())
    || assessments.length !== definitions.length || policies.length !== policy_keys.length || reviews.length !== plans.length
    || policy_keys.length !== Object.keys(DOCUMENTS).length || policy_keys.some(key => !Object.hasOwn(DOCUMENTS, key))
    || plans.some(plan => !Object.hasOwn(PLAN_WORK, plan.key)) || db.baselines[CID].updated_at !== origin
    || client.initial_program_baseline?.completed_at !== origin
    || !scoped(db, 'requirements').some(row => row.baseline_key === 'cis-ig1' && row.baseline_response === 'applies'))
    reject('requires the complete fresh native IG3 baseline.');
  const ids = new Set(assessments.map(row => row.framework_assessment_id));
  for (const definition of definitions) {
    const matches = assessments.filter(row => row.definition_id === definition.id && row.framework_key === 'cis-ig1');
    if (matches.length !== 1) reject('requires one native assessment for every selected safeguard.');
    const row = matches[0], content = krustySafeguardContent(definition.id, 'addressed');
    const draft = db.guided_assessment_pilot?.[row.framework_assessment_id+':'+account.user_id];
    const process = contact(db, content.process_owner_role, processOwners);
    const reviewIds = reviews.filter(review => review.framework_safeguards?.includes(definition.id)).map(review => review.review_id).sort();
    if (row.framework_assessment_id !== 'fw_'+CID+'_assessment_'+definition.id || row.framework_version !== '8.1'
      || row.status !== 'addressed' || row.implementation !== content.current_implementation || row.technology !== content.technology_process
      || row.notes !== 'Scope: '+content.scope+'\n'+content.assessment_notes
      || row.created_at !== origin || row.updated_at !== at || row.owner_id !== account.user_id || row.process_owner_id !== process.contact_id
      || row.last_saved !== at || row.last_assessed !== at || row.assessed_by !== account.user_id || row.fixture_history_origin_at !== origin
      || row.verification !== 'needs_validation' || row.verification_checklist != null || row.assessment_history?.length
      || row.related_links?.some(link => link.kind !== 'reviews')
      || JSON.stringify((row.related_links || []).map(link => link.id).sort()) !== JSON.stringify(reviewIds)
      || row.items_to_address?.length || row.items_revision !== 0)
      reject('requires untouched imported assessments, pending validation and relationships.');
    if (!draft || draft.client_id !== CID || draft.assessment_id !== row.framework_assessment_id || draft.user_id !== account.user_id
      || !draft.completed || draft.revision !== 1 || draft.generated_at !== at || draft.updated_at !== at
      || draft.narrative !== content.current_implementation || draft.result?.status !== 'addressed'
      || draft.step !== visibleQuestions(definition.id, draft.answers, draft.version).length
      || typeof draft.fixture_provenance !== 'string' || !draft.fixture_provenance.includes('fictional')
      || !draft.fixture_provenance.includes('not a browser save')
      || row.guided_assessment_source?.origin !== 'fictional-demo-fixture'
      || row.guided_assessment_source.version !== draft.version || row.guided_assessment_source.revision !== 1
      || row.guided_assessment_source.generated_at !== at || row.guided_assessment_source.by !== account.user_id
      || row.guided_assessment_source.provenance !== draft.fixture_provenance
      || JSON.stringify(row.guided_assessment_source.answers) !== JSON.stringify(draft.answers))
      reject('requires the complete source-only imported interviews.');
    validateGuidedCompletion(definition.id, draft.answers, draft.version);
    if (generateResult(definition.id, draft.answers, new Date(dates.anchor), draft.version).status !== 'addressed')
      reject('every current safeguard must retain its actual native addressed result.');
  }
  const interviews = Object.entries(db.guided_assessment_pilot || {}).filter(([key, value]) => value?.client_id === CID
    || [...ids].some(id => key.startsWith(id+':')));
  if (interviews.length !== definitions.length || interviews.some(([key, value]) => !ids.has(value.assessment_id)
      || key !== value.assessment_id+':'+account.user_id)
    || Object.entries(db.guided_assessment_history || {}).some(([key, value]) => value?.client_id === CID || [...ids].some(id => key.startsWith(id+':')))
    || policies.some(row => row.policy_id !== CID+'_'+row.baseline_key || !policy_keys.includes(row.baseline_key)
      || row.presence !== 'reported_missing' || row.status !== 'needs_creation' || row.baseline_response !== 'no'
      || row.created_at !== origin || row.updated_at !== origin || row.owner_id || row.summary || row.document_url || row.approved_at
      || row.approval_source || row.approval_subject || row.approval_history?.length || row.decision_history?.length)
    || new Set(policies.map(row => row.baseline_key)).size !== policy_keys.length
    || plans.some(plan => reviews.filter(row => row.framework_plan_key === plan.key
      && row.recurrence === plan.default_cadence
      && (plan.default_cadence !== 'custom' || row.custom_recurrence_days === plan.default_custom_recurrence_days)).length !== 1)
    || reviews.some(row => row.review_id !== CID+'_canonical_review_'+row.framework_plan_key
      || row.status !== 'needs_scheduling' || row.due_date || row.next_review_date || row.created_at !== origin || row.updated_at !== origin
      || row.owner_id || row.reviewer_id || row.notes || row.scope || row.occurrences?.length || row.policy_id || row.policy_ids?.length)
    || ['findings','tasks','evidence','risks','vendors','ai_systems','assets','organizational_controls','exceptions','assessments','comments']
      .some(kind => scoped(db, kind).length) || db.drafts?.[CID]) reject('requires untouched documents, Review parents and source records.');
  for (const [kind, field] of [['policies','policy_id'],['reviews','review_id'],['framework_assessments','framework_assessment_id']]) {
    const targetIds = new Set(scoped(db, kind).map(row => row[field]));
    if (targetIds.size !== scoped(db, kind).length || (db[kind] || []).some(row => row.client_id !== CID && targetIds.has(row[field])))
      reject('a native identity is duplicated or belongs to another client.');
  }
  return {client, account, definitions, policy_keys, plans, assessments, policies, reviews, origin, organization_origin, at};
}

function subject(policy, approver, at, version, summary) {
  return {subject_id:policy.policy_id+'_subject_'+version.replaceAll('.', '_'), captured_at:at, client_id:CID,
    policy_id:policy.policy_id, title:policy.title, version, summary, owner_id:policy.owner_id,
    named_approver:{contact_id:approver.contact_id, name:approver.name},
    basis:{type:'external', reference:'Fictional Krusty controlled document register / '+policy.title,
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
  const {client, account, definitions, policy_keys, plans, assessments, policies:originalPolicies, reviews:originalReviews, origin, organization_origin, at} = prepared;
  const definitionsById = new Map(definitions.map(row => [row.id, row]));
  const approver = contact(db, ROLES.executive, processOwners);
  const obligation = id => {
    const definition = definitionsById.get(id);
    if (!definition) reject('an attributed source obligation is outside cumulative IG3: '+id+'.');
    return {definition_id:id, minimum_implementation_group:definition.implementation_group,
      source_cadence:definition.source_cadence, source_url:SOURCE_URL};
  };
  const reviewManifest = [];
  const inventoryDate = db.guided_assessment_pilot['fw_'+CID+'_assessment_1.1:'+account.user_id].answers.last_review;
  const reviews = plans.map(plan => {
    const original = originalReviews.find(row => row.framework_plan_key === plan.key), work = PLAN_WORK[plan.key];
    const process = contact(db, ROLES[work.role], processOwners);
    const ids = [...new Set([...plan.safeguards, ...(work.extra || [])])];
    const inventoryDue = plan.key === 'asset-inventory'
      ? reviewSchedule({due_date:inventoryDate, recurrence:'semiannual'}, true).next_review_date?.slice(0,10) : null;
    if (plan.key === 'asset-inventory' && !inventoryDue) reject('the actual inventory review date must retain its native six-month schedule.');
    const due = inventoryDue || dates.day(work.due);
    if (!scheduledDate(due) || due <= dates.day(0)) reject('current source-duty Reviews must retain a valid upcoming date.');
    const row = {...copy(original), owner_id:account.user_id, reviewer_id:account.user_id,
      framework_drivers:[reviewDriver('cis-ig1', plan)], recurrence:plan.default_cadence,
      ...(plan.default_cadence === 'custom' ? {custom_recurrence_days:plan.default_custom_recurrence_days} : {}), due_date:due,
      status:'upcoming', current_occurrence_id:'occ_'+original.review_id,
      updated_at:at, occurrences:[], scope:'Fictional Krusty Krab restaurant, franchise, ordering and management services: '+ids.join(', ')+'.',
      notes:SOURCE+' Process owner: '+process.name+'. '+work.detail+' Source duties: '
        +ids.map(id => id+': '+obligation(id).source_cadence).join(' | '),
      governance_context:{category:'organizational', rationale:'Organization-selected tracking through the existing native CIS IG3 plan; source duties are retained individually.',
        cadence_source:'organization_defined', cadence_rationale:work.detail,
        citation:'CIS Controls v8.1, selected cumulative IG3 safeguards '+ids.join(', '), reference_url:SOURCE_URL}};
    Object.assign(row, reviewSchedule(row, true));
    validateAssignment(db, 'reviews', row); validateGovernanceContext(row.governance_context);
    reviewManifest.push({review_id:row.review_id, plan_key:plan.key, safeguards:ids, process_owner_id:process.contact_id,
      source_obligations:ids.map(obligation), tracking_basis:'Existing native plan; a platform ticket is not mandated by CIS.',
      native_plan_basis:plan.basis, native_cadence_class:plan.cadence_class, due_date:row.due_date, recurrence:row.recurrence});
    return reviewView(row);
  });
  for (const spec of [
    {id:'8.11', role:'technical', title:'Weekly audit-log examination', recurrence:'custom', days:7, due:3,
      detail:'Perform actual weekly log examination, record examined sources, anomalies and disposition. This organization-selected tracking ticket does not replace analysis with an annual document review.'},
    {id:'11.5', role:'technical', title:'Quarterly sampled data-recovery tests', recurrence:'quarterly', due:12,
      detail:'Collect and assess actual quarterly sampled restore execution, coverage, failures and outcomes. This scheduled parent does not itself establish a performed or passed test; current assessment and later execution evidence remain separate.'}
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
      scope:'Fictional Krusty '+spec.id+' actual operating activity.', notes:SOURCE+' Process owner: '+process.name+'. '+spec.detail,
      governance_context:{category:'organizational', rationale:'Explicitly chosen tracking of a required CIS operating activity, not a claim that CIS mandates a manual platform Review ticket.',
        cadence_source:'organization_defined', cadence_rationale:spec.detail,
        citation:'CIS Controls v8.1 Safeguard '+spec.id, reference_url:SOURCE_URL}};
    Object.assign(row, reviewSchedule(row, true));
    validateAssignment(db, 'reviews', row); validateGovernanceContext(row.governance_context);
    reviews.push(reviewView(row));
    reviewManifest.push({review_id:reviewId, plan_key:null, safeguards:[spec.id], process_owner_id:process.contact_id,
      source_obligations:[obligation(spec.id)], tracking_basis:'Explicit organization-selected manual tracking of the required operating activity.',
      due_date:row.due_date, recurrence:row.recurrence, custom_recurrence_days:row.custom_recurrence_days,
      assessment_state:'addressed'});
  }
  const policyManifest = [];
  const policies = policy_keys.map(key => {
    const original = originalPolicies.find(row => row.baseline_key === key), spec = DOCUMENTS[key];
    const item = catalog.policies.find(row => row.key === key), process = contact(db, ROLES[spec.role], processOwners);
    const nativeMapped = catalogPolicyIds(key);
    // Source-supported contents extend existing containers through fixture links;
    // the shared template mappings remain unchanged.
    const supportingContents = spec.sourceContents || [];
    const mapped = definitions.filter(definition => nativeMapped.includes(definition.id)
      || supportingContents.includes(definition.id)).map(row => row.id);
    const requiredIds = new Set(spec.sections.filter(section => section.classification !== 'supporting_context').flatMap(section => section.ids));
    if (spec.sections.some(section => section.ids.some(id => !mapped.includes(id)))) reject('document contents are outside their genuine native mapping.');
    const summary = 'Fictional Krusty Krab: '+spec.context+' '+spec.sections.map(section => section.content).join(' ');
    const policy = {...copy(original), title:item.name, category:item.category, owner_id:account.user_id,
      approver_contact_id:approver.contact_id, status:'approved',
      presence:'verified_existing', baseline_response:'yes', version:'2.0', summary,
      updated_at:dates.month(-4)+'T00:00:00.000Z', approved_at:null,
      approval_history:[], decision_history:[], approval_subject:null,
      governance_context:{category:'organizational', rationale:'Contains the mapped source processes or supporting instructions; its template title is not a CIS mandate. Approval does not prove technical implementation.',
        cadence_source:'organization_defined', cadence_rationale:'The linked authoritative native process Review owns document maintenance; material-change and operating duties remain distinct.'}};
    const first = subject(policy, approver, origin, '1.0',
      'Initial fictional Krusty controlled process and responsibilities for '+item.name+'. Operating outcomes and later amendments are not asserted by this historical reference.');
    const approved = subject(policy, approver, dates.month(-4)+'T00:00:00.000Z', '2.0', summary);
    policy.decision_history.push(externalDecision(first, account, approver), externalDecision(approved, account, approver));
    if ([first, approved].some(value => !scheduledDate(value.captured_at)
      || value.captured_at < origin || value.captured_at > dates.anchor)
      || first.captured_at >= approved.captured_at || approved.captured_at > at)
      reject('fictional approval references must retain valid past version dates.');
    policy.approval_source = {version:policy.version, external_reference:approved.basis.reference, external_version:policy.version};
    policy.approval_subject = copy(approved);
    policy.approved_at = approved.captured_at; policy.effective_date = approved.captured_at.slice(0,10);
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
    framework_reviews:Object.fromEntries(activePlans('cis-ig1', CONFIGURATION).map(plan => {
      const review = reviews.find(row => row.framework_plan_key === plan.key);
      return [plan.key, {enabled:!!review, recurrence:plan.default_cadence,
        ...(plan.default_cadence === 'custom' ? {custom_recurrence_days:plan.default_custom_recurrence_days} : {}), due_date:review?.due_date || null}];
    }))};
  db.baselines = {...db.baselines, [CID]:baseline}; client.onboarding_baseline = copy(baseline);
  return {policies, reviews, assessments:withLinks, mapping:policyManifest, review_manifest:reviewManifest, origin, organization_origin, anchor:dates.anchor};
}

function catalogPolicyIds(key) {
  const mappings = CATALOGS['cis-ig1'].policy_mappings.filter(row => row.policy_key === key);
  return activeDefinitions('cis-ig1', CONFIGURATION)
    .filter(definition => mappings.some(row => row.safeguards.includes(definition.id))).map(row => row.id);
}

// Source-only constructor. Validate the entire staged result before publishing
// target changes; unrelated records, contacts, identities and history stay intact.
export function populateKrustyGovernance(db, options) {
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
