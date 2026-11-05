import {activeDefinitions} from '../lib/frameworks';
import {reviewSchedule, scheduledDate} from '../lib/reviewOccurrences';
import {visibleQuestions} from '../lib/guidedAssessment';
import criteriaCatalog from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import {eligible, validateAssignment} from './assignmentEligibility';
import {prepareTask} from './actionItems';
import {linkItemFinding} from './assessmentItems';
import {effectivePolicySubject} from './policyReviewCoverage';
import {syncPolicyReview} from './policyReviews';
import {syncVendorReview} from './vendors';
import {riskSnapshot} from './risks';
import {seedCisScenarioHistory} from './cisDemoHistory';
import {CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {INITECH_SCENARIO_PROFILE, initechSafeguardContent} from './cisCanonicalInitechContent';

const CID = 'demo_initech', PREFIX = CID+'_canonical_history_', VERSION = 'initech-native-history-v1';
const PROVENANCE = 'Explicit fictional Initech history; imported synthetic observations, not browser execution, client signatures or external assurance.';
const IDS = {framework_assessments:'framework_assessment_id', reviews:'review_id', policies:'policy_id',
  findings:'finding_id', tasks:'task_id', risks:'risk_id', vendors:'vendor_id', ai_systems:'ai_system_id', logs:'audit_id'};
const MONTHS = {monthly:1, quarterly:3, semiannual:6, annual:12};
const DEFICIENCIES = [
  {id:'2.6', key:'library-loading', title:'Reporting worker permits an unauthorized library path', status:'in_progress', priority:'medium', due:14},
  {id:'3.8', key:'settlement-flow', title:'Settlement-export flow documentation is incomplete', status:'in_progress', priority:'high', due:0},
  {id:'5.5', key:'service-account-metadata', title:'Two service-account entries lack purpose and review dates', status:'open', priority:'medium', due:12},
  {id:'9.5', key:'dmarc', title:'DMARC policy and verification are missing despite configured SPF and DKIM', status:'in_progress', priority:'high', due:-5},
  {id:'13.6', key:'bridge-flow-collection', title:'Settlement bridge flow records do not reach the collector', status:'blocked', priority:'medium', due:30},
  {id:'15.4', key:'provider-security-terms', title:'Provider agreements lack executed security requirements', status:'blocked', priority:'high', due:-3},
  {id:'16.4', key:'component-evaluation', title:'Reporting-worker components lack complete monthly evaluation', status:'in_progress', priority:'high', due:-4},
  {id:'3.9', key:'removable-data-encryption', title:'Diagnostic removable-media data is not encrypted', status:'open', priority:'high', due:18}
];
// Explicit fictional workstream milestones, including the additional IG2 families.
// These are dated assessment inputs; no chart percentage is authored here.
const MILESTONES = {
  1:{month:-22, work:'Enterprise asset inventory and discovery rollout'},
  2:{month:-21, work:'Authorized software and deployment controls'},
  3:{month:-18, work:'Data ownership, handling and protected storage'},
  4:{month:-20, work:'Enterprise and network configuration rollout'},
  5:{month:-19, work:'Account inventory and privileged identity separation'},
  6:{month:-18, work:'Access lifecycle and authentication coverage'},
  7:{month:-15, work:'Vulnerability intake, scanning and remediation operation'},
  8:{month:-14, work:'Logging collection and examination coverage'},
  9:{month:-12, work:'Browser, DNS and mail protection rollout'},
  10:{month:-13, work:'Endpoint malware and exploitation protection'},
  11:{month:-10, work:'Recovery governance and backup protection'},
  12:{month:-9, work:'Maintained infrastructure and secure administration'},
  13:{month:-8, work:'Network monitoring and access enforcement'},
  14:{month:-6, work:'Workforce and role-specific learning delivery'},
  15:{month:-5, work:'Provider inventory, policy and classification operation'},
  16:{month:-4, work:'Secure development and component-management rollout'},
  17:{month:-3, work:'Incident arrangements and performed exercise review'},
  18:{month:-2, work:'Authorized external testing and prioritized remediation'}
};
const RETAINED = [
  {id:'2.3', key:'support-utility', plan:'software-support', before:-45, completed:-14, validated:null,
    title:'Unauthorized support utility was removed; validation remains pending',
    work:'Remove the unauthorized support utility and reconcile installed software',
    resolution:'The fictional installed-software sample no longer contains the utility; independent Finding validation has not completed.'},
  {id:'6.2', key:'provider-revocation', plan:'account-authorization', beforeMonth:-17, completedMonth:-16, validationDays:10,
    title:'Former-provider access revocation was corrected and validated',
    work:'Revoke the old support entitlement and confirm effective access denial',
    resolution:'The fictional directory, application and remote-session records show revocation and denied access.'},
  {id:'8.11', key:'log-examination-feed', requirement:'8.11', before:-150, completed:-120, validated:-110,
    title:'An omitted log-examination feed was restored and validated',
    work:'Include the omitted log source in the weekly examination and retain disposition',
    resolution:'The fictional weekly examination includes the restored source, its examined events and anomaly disposition.'}
];
const copy = value => JSON.parse(JSON.stringify(value));
const mine = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const day = value => String(value || '').slice(0,10);
const instant = value => day(value)+'T00:00:00.000Z';
const latest = (...values) => values.filter(Boolean).sort().at(-1);
const earliest = (...values) => values.filter(Boolean).sort()[0];
const reject = message => {throw new Error('Initech history: '+message);};
const statusFor = id => INITECH_SCENARIO_PROFILE.partial.includes(id) ? 'in_progress'
  : INITECH_SCENARIO_PROFILE.gaps.includes(id) ? 'needs_attention'
    : INITECH_SCENARIO_PROFILE.unknown.includes(id) ? 'not_assessed' : 'addressed';

function shift(value, days) {
  const date = scheduledDate(day(value));
  if (!date) reject('valid calendar dates are required.');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function precedingDue(review, step) {
  const date = scheduledDate(day(review.due_date));
  if (!date) reject('Review parents must have native scheduled dates.');
  if (MONTHS[review.recurrence]) {
    const anchor = review.schedule_anchor || reviewSchedule(review).schedule_anchor;
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()-MONTHS[review.recurrence]*step);
    const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(anchor.month_end ? last : Math.min(anchor.day,last));
    return day(date.toISOString());
  }
  if (review.recurrence === 'custom' && Number.isInteger(review.custom_recurrence_days) && review.custom_recurrence_days > 0)
    return shift(review.due_date,-review.custom_recurrence_days*step);
  return null;
}

function link(row, kind, id) {
  row.related_links ||= [];
  if (!row.related_links.some(item => item.kind === kind && item.id === id)) row.related_links.push({kind,id});
}

function log(db, kind, row, at, actor, action, meta = {}) {
  db.logs.push({audit_id:PREFIX+'audit_'+kind+'_'+row[IDS[kind]]+'_'+at+'_'+action.replaceAll(' ','_'),
    client_id:CID, entity_type:kind, entity_id:row[IDS[kind]], at, action,
    user_id:actor.user_id, user_name:actor.name, user_email:actor.email,
    meta:{simulated:true, title:row.title, provenance:PROVENANCE, ...meta}});
}

function sourceInputs(db, {dates, owner, governance, operations} = {}) {
  const clients = mine(db,'clients'), actor = db.user;
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const owners = (db.users || []).filter(row => row.user_id === ownerId), account = owners[0];
  if (clients.length !== 1 || clients[0].environment !== 'Demo' || clients[0].status !== 'active'
    || clients[0].archived || clients[0].archived_at || clients[0].framework_settings?.['cis-ig1']?.implementation_group !== 2
    || actor?.workspace_mode !== 'demo' || !['super_admin','platform_admin'].includes(actor.role)
    || !eligible(actor,CID) || typeof actor.user_id !== 'string'
    || (db.users || []).filter(row => row.user_id === actor.user_id).length !== 1
    || owners.length !== 1 || !eligible(account,CID))
    reject('use the active canonical IG2 Demo and existing eligible actors.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['month','day','instant'].every(key => typeof dates[key] === 'function')
    || !scheduledDate(dates.anchor) || dates.instant(0) !== dates.anchor)
    reject('a frozen UTC source clock is required.');
  const origin = dates.month(-24);
  if (origin < '2024-06-25' || !scheduledDate(origin)) reject('the 24-month CIS history must begin after v8.1 release.');
  const definitions = activeDefinitions('cis-ig1',{implementation_group:2}), assessments = mine(db,'framework_assessments');
  if (definitions.length !== 130 || assessments.length !== 130
    || definitions.some(definition => assessments.filter(row => row.framework_key === 'cis-ig1' && row.definition_id === definition.id).length !== 1)
    || assessments.some(row => row.status !== statusFor(row.definition_id) || row.created_at !== instant(origin)))
    reject('the native 130-record current assessment profile must remain intact.');
  const resolve = (values, kind) => {
    if (!Array.isArray(values)) reject('the frozen '+kind+' source manifest is required.');
    const field = IDS[kind], ids = values.map(row => row[field]);
    if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
      reject('source identities must be distinct.');
    return ids.map(id => {
      const found = (db[kind] || []).filter(row => row[field] === id);
      if (found.length !== 1 || found[0].client_id !== CID) reject('source identities must resolve to this client.');
      return found[0];
    });
  };
  if (!governance || !operations || governance.anchor !== dates.anchor || governance.origin !== instant(origin))
    reject('governance and history must use the same frozen source anchor.');
  const reviews = [...resolve(governance.reviews,'reviews'),...resolve(operations.reviews,'reviews')];
  if (reviews.length !== 66 || new Set(reviews.map(row => row.review_id)).size !== 66
    || mine(db,'reviews').length !== 66 || resolve(governance.policies,'policies').length !== 9
    || resolve(operations.risks,'risks').length !== 29 || resolve(operations.vendors,'vendors').length !== 15
    || resolve(operations.ai_systems,'ai_systems').length !== 3 || resolve(operations.tasks,'tasks').length !== 10)
    reject('the complete governance and operational source population is required.');
  for (const key of ['review_origins','risk_lifecycles','source_definition_risks'])
    if (!Array.isArray(operations[key])) reject('the frozen '+key+' manifest is required.');
  const riskLinks = operations.source_definition_risks;
  if (riskLinks.length !== 8 || DEFICIENCIES.some(spec => riskLinks.filter(row => row.definition_id === spec.id).length !== 1)
    || riskLinks.some(row => !db.risks.some(risk => risk.client_id === CID && risk.risk_id === row.risk_id)
      || row.framework_assessment_id !== assessments.find(item => item.definition_id === row.definition_id)?.framework_assessment_id))
    reject('each confirmed deficiency must resolve to its existing operational Risk.');
  for (const review of reviews) {
    const origins = operations.review_origins.filter(row => row.review_id === review.review_id);
    if (!scheduledDate(review.due_date) || !scheduledDate(review.created_at)
      || !['upcoming','in_progress','cancelled'].includes(review.status)
      || !['monthly','quarterly','semiannual','annual','custom','none'].includes(review.recurrence)
      || review.recurrence !== 'none' && !reviewSchedule(review).next_review_date
      || review.created_at > dates.anchor || review.created_at < instant(origin)
      || operations.reviews.some(row => row.review_id === review.review_id)
        && (origins.length !== 1 || origins[0].origin !== review.created_at
          || origins[0].source_id !== (review.risk_id || review.vendor_id || review.ai_system_id)
          || (origins[0].terminal_at || null) !== (review.cancelled_at || null)))
      reject('source Review dates and lifecycle ownership must agree.');
  }
  return {actor,account,origin,assessments,reviews};
}

function assessmentHistory(assessments, dates, origin, owner, operations) {
  for (const row of assessments) {
    if (row.status === 'not_assessed') {
      if (row.last_saved || row.last_assessed || row.assessed_by || row.verification || row.guided_assessment_source)
        reject('unknown safeguards must retain no completed judgment.');
      row.assessment_history = []; continue;
    }
    const content = initechSafeguardContent(row.definition_id,row.status), at = row.last_saved;
    if (!scheduledDate(at) || at > dates.anchor || at < instant(origin)) reject('current assessment dates lie outside the source history.');
    const deficiency = operations.source_definition_risks.find(item => item.definition_id === row.definition_id);
    const first = deficiency ? day(operations.risk_lifecycles.find(item => item.risk_id === deficiency.risk_id)?.identified_at) : shift(origin,7);
    const milestone = MILESTONES[row.definition_id.split('.')[0]];
    if (!milestone || !scheduledDate(first)) reject('the explicit IG2 milestone or deficiency origin is unavailable.');
    const implemented = deficiency ? null : dates.month(milestone.month);
    const points = new Set([origin,first,implemented,...[12,6,3,1].map(month => dates.month(-month)),dates.day(-75),day(at)].filter(Boolean));
    row.assessment_history = [...points].filter(value => value >= origin && value <= day(at)).sort().map(value => {
      const status = value < first ? 'not_assessed' : deficiency ? row.status : value < implemented ? 'in_progress' : 'addressed';
      return {at:value === day(at) ? at : instant(value), by:owner.user_id, status,
        implementation:status === 'not_assessed' ? '' : status === 'addressed' || deficiency ? content.current_implementation
          : 'Fictional staged work: '+milestone.work+'. '+content.scope+' Coverage and operating results are not complete.',
        notes:status === 'not_assessed' ? 'Fictional program intake; no implementation judgment is established.'
          : 'Imported dated scenario observation. '+(status === 'in_progress' && !deficiency ? milestone.work+' remains incomplete.' : content.assessment_notes),
        source:PROVENANCE};
    });
  }
}

function sourceSnapshot(db, review, at, operations) {
  if (review.risk_id) {
    const risk = db.risks.find(row => row.client_id === CID && row.risk_id === review.risk_id);
    const lifecycle = operations.risk_lifecycles.find(row => row.risk_id === risk.risk_id), snapshot = copy(riskSnapshot(risk));
    if (lifecycle.accepted_at && lifecycle.accepted_at > at)
      Object.assign(snapshot,{status:'assessed',treatment:'monitor',accepted_by:null,acceptance_date:null,acceptance_rationale:null,acceptance_expires_at:null});
    if (lifecycle.closed_at && lifecycle.closed_at > at) snapshot.status = 'assessed';
    if (risk.status === 'in_progress' && (!lifecycle.treatment_started_at || lifecycle.treatment_started_at > at)) snapshot.status = 'assessed';
    return {risk_before:copy(snapshot),risk_after:copy(snapshot),risk_review_recommendation:'Reviewed — No Change',
      source_snapshot:{risk_id:risk.risk_id,title:risk.title,owner_id:risk.owner_id,...snapshot},
      conclusion:'Fictional owner review of the then-recorded exposure. Treatment, acceptance and closure remain separate decisions.'};
  }
  if (review.vendor_id) {
    const vendor = db.vendors.find(row => row.client_id === CID && row.vendor_id === review.vendor_id);
    return {source_snapshot:{vendor_id:vendor.vendor_id,name:vendor.name,service:vendor.service,
      status:vendor.offboarded_at && vendor.offboarded_at <= at ? 'inactive' : at < instant(vendor.contract_start) ? 'onboarding' : 'active',
      review_purpose:review.vendor_purpose || 'vendor',assurance_scope:'A requested questionnaire is not received or validated assurance.'},
      conclusion:'Fictional relationship review; contract decisions, assurance follow-up and security amendments are separate work.'};
  }
  if (review.ai_system_id) {
    const ai = db.ai_systems.find(row => row.client_id === CID && row.ai_system_id === review.ai_system_id);
    const approval = (ai.approval_history || []).filter(row => row.at <= at).sort((a,b) => a.at.localeCompare(b.at)).at(-1);
    return {source_snapshot:{ai_system_id:ai.ai_system_id,name:ai.name,owner_id:ai.owner_id,
      approval_status:approval?.status || 'pending_assessment',screening_recorded:ai.onboarding_screening?.recorded_at <= at,
      linked_risk_ids:(ai.related_links || []).filter(row => row.kind === 'risks').map(row => row.id)},
      conclusion:'Fictional review of proposed AI use and its linked Risk; this occurrence does not approve operational use.'};
  }
  return {};
}

function reviewHistory(db, reviews, assessments, dates, origin, owner, operations) {
  const definitions = activeDefinitions('cis-ig1',{implementation_group:2});
  for (const review of reviews) {
    const source = operations.review_origins.find(row => row.review_id === review.review_id);
    const start = latest(origin,day(review.created_at),day(source?.origin));
    const end = earliest(dates.day(-1),day(source?.terminal_at || review.cancelled_at));
    review.occurrences = [];
    review.fixture_history_version = VERSION; review.fixture_history_anchor = dates.anchor; review.fixture_history_origin_at = instant(start);
    if (review.framework_setup_key === `fw_${CID}_review_requirement:11.5`) {
      review.fixture_history_exception = 'Prior quarterly restore execution and results are not established; no completion is asserted.';
      continue;
    }
    const dueDates = [];
    // The cancelled/current occurrence is not converted into a past completion.
    for (let step = 1; step <= 1300; step++) {
      const due = precedingDue(review,step);
      if (!due || due < start) break;
      if (due <= end) dueDates.push(due);
      if (step === 1300) reject('the bounded 24-month recurrence range was exceeded.');
    }
    const actor = (db.users || []).find(row => row.user_id === (review.reviewer_id || review.owner_id) && eligible(row,CID)) || owner;
    review.occurrences = dueDates.sort().map(due => {
      const at = instant(due), {occurrences,...parent} = review;
      const occurrence = {...copy(parent),...reviewSchedule({...review,due_date:due,recurrence_due_date:null}),
        occurrence_id:review.review_id+'_'+due,current_occurrence_id:review.review_id+'_'+due,status:'completed',
        due_date:due,started_at:at,started_by:actor.user_id,completed_at:at,completion_date:at,updated_at:at,
        completed_by:actor.user_id,completed_by_name:actor.name,outcome:'no_findings',finding_count:0,finding_ids:[],evidence:[],
        tested_scope:review.scope || review.title,tested_period:due+' scheduled cycle',checklist_confirmed:true,
        notes:'Imported fictional completed cycle. The dated source and requirement snapshots retain the then-known state; current parent notes are not backdated.',
        conclusion:review.framework_safeguards?.includes('8.11') && review.framework_setup_key
          ? 'Fictional weekly log examination covered the scheduled sources; anomalies and known follow-up remain attributable to this cycle.'
          : 'Fictional review of the then-current program work. Review completion does not establish full implementation, a performed technical test or closure of known deficiencies.',
        no_evidence_reason:'Imported historical source ledger; actual synthetic artifact bytes must be attached before an uploaded-file claim.',
        fixture_history_provenance:PROVENANCE,...sourceSnapshot(db,review,at,operations)};
      delete occurrence.cancelled_at; delete occurrence.cancelled_by;
      const covered = [...new Set([...(review.framework_safeguards || []),...assessments.filter(row =>
        row.related_links?.some(item => item.kind === 'reviews' && item.id === review.review_id)).map(row => row.definition_id)])];
      if (covered.length) occurrence.requirement_snapshot = covered.map(id => ({
        definition_id:id,title:definitions.find(row => row.id === id)?.title,framework_version:'8.1',
        source_cadence:definitions.find(row => row.id === id)?.source_cadence,status:'not_assessed'}));
      if (review.policy_id) {
        const policy = db.policies.find(row => row.client_id === CID && row.policy_id === review.policy_id);
        const coverage = effectivePolicySubject(policy,at); occurrence.policy_coverage = coverage ? [coverage] : [];
      }
      return occurrence;
    });
    if (review.framework_plan_key === 'asset-inventory'
      && review.occurrences.at(-1)?.completed_at !== instant(dates.month(-1)))
      reject('the latest inventory occurrence must match the actual 1.1 interview date.');
    if (review.risk_id) {
      const risk = db.risks.find(row => row.client_id === CID && row.risk_id === review.risk_id);
      risk.last_reviewed = review.occurrences.at(-1)?.completed_at || null;
    }
    if (review.vendor_id) syncVendorReview(db,review);
    if (review.policy_id) syncPolicyReview(db,review);
  }
}

function findingWork(db, {assessment,key,title,description,remediation,created,due,status,completed,validated,resolution,review,occurrence}, owner, actor) {
  const finding = {finding_id:PREFIX+'finding_'+key,client_id:CID,framework_assessment_id:assessment.framework_assessment_id,
    definition_id:assessment.definition_id,title,description,source:'CIS Controls v8.1 '+assessment.definition_id,
    remediation_title:remediation,remediation_plan:remediation,severity:'medium',status:validated ? 'closed' : completed ? 'remediated' : 'in_remediation',
    owner_id:owner.user_id,created_at:created,identified_at:created,created_by:actor.user_id,updated_at:validated || completed || created,
    due_date:due,decision_history:[],related_links:[{kind:'framework_assessments',id:assessment.framework_assessment_id}]};
  if (review && occurrence) Object.assign(finding,{review_id:review.review_id,occurrence_id:occurrence.occurrence_id});
  validateAssignment(db,'findings',finding); db.findings.push(finding);
  const task = {task_id:PREFIX+'task_'+key,client_id:CID,title:remediation,description,
    source_type:'finding',source_id:finding.finding_id,finding_id:finding.finding_id,framework_assessment_id:assessment.framework_assessment_id,
    assignee_id:owner.user_id,priority:'medium',status:'open',created_at:created,created_by:actor.user_id,
    updated_at:completed || created,due_date:due,resolution:resolution || ''};
  prepareTask(db,task); task.status = status;
  if (status !== 'open') Object.assign(task,{started_at:created,started_by:owner.user_id});
  if (completed) Object.assign(task,{status:'done',completed_at:completed,completed_by:owner.user_id});
  if (validated) {
    const contact = db.contacts.find(row => row.client_id === CID && row.contact_id === assessment.process_owner_id);
    Object.assign(finding,{validated_at:validated,validated_by:actor.user_id,closed_at:validated,closed_by:actor.user_id});
    finding.decision_history.push({action:'validated',by:actor.user_id,at:validated,
      rationale:'Imported fictional validation of the retained result by '+contact.name+'; recorded by the scenario importer, not an in-app client signature. '+resolution});
  }
  finding.primary_task_id = task.task_id; db.tasks.push(task);
  link(assessment,'findings',finding.finding_id); link(assessment,'tasks',task.task_id);
  if (review) {link(finding,'reviews',review.review_id); link(task,'reviews',review.review_id);}
  if (occurrence) {
    occurrence.finding_ids.push(finding.finding_id); occurrence.finding_count = occurrence.finding_ids.length;
    occurrence.outcome = 'findings_raised'; occurrence.conclusion = 'Fictional source review identified: '+title+'. Remediation and independent validation remain separate.';
  }
  return {finding,task};
}

function remediationHistory(db, assessments, reviews, operations, dates, origin, owner, actor) {
  for (const spec of DEFICIENCIES) {
    const assessment = assessments.find(row => row.definition_id === spec.id), content = initechSafeguardContent(spec.id,assessment.status);
    const source = operations.source_definition_risks.find(row => row.definition_id === spec.id);
    const risk = db.risks.find(row => row.client_id === CID && row.risk_id === source.risk_id);
    if ((source.existing_task_ids || []).length || (risk.related_task_ids || []).length
      || db.tasks.some(row => row.client_id === CID && row.risk_id === risk.risk_id))
      reject('reconcile an existing deficiency treatment Action rather than duplicate it.');
    const created = latest(instant(origin),risk.created_at);
    const {finding,task} = findingWork(db,{assessment,key:spec.key,title:spec.title,
      description:content.current_implementation,remediation:content.remediation,created,due:dates.day(spec.due),status:spec.status},owner,actor);
    task.priority = spec.priority; finding.severity = spec.priority;
    if (spec.status === 'blocked') task.resolution = 'Waiting for the named fictional process owner; no completion or validation is asserted.';
    for (const item of assessment.items_to_address || [])
      if (item.state === 'open' && item.kind === 'gap' && !item.finding_id) linkItemFinding(assessment,item.item_id,finding.finding_id,actor.user_id,assessment.last_saved);
    risk.related_task_ids = [task.task_id]; risk.related_finding_ids = [...new Set([...(risk.related_finding_ids || []),finding.finding_id])];
    link(risk,'tasks',task.task_id); link(risk,'findings',finding.finding_id); link(task,'risks',risk.risk_id); link(finding,'risks',risk.risk_id);
  }
  for (const spec of RETAINED) {
    const assessment = assessments.find(row => row.definition_id === spec.id);
    const review = reviews.find(row => spec.plan ? row.framework_plan_key === spec.plan : row.framework_setup_key === `fw_${CID}_review_requirement:${spec.requirement}`);
    const before = spec.beforeMonth ? dates.month(spec.beforeMonth) : dates.day(spec.before);
    const occurrence = review?.occurrences.filter(row => day(row.completed_at) <= before).at(-1);
    if (!occurrence) reject('retained remediation needs an actual eligible source occurrence.');
    const completed = spec.completedMonth ? instant(dates.month(spec.completedMonth)) : dates.instant(spec.completed);
    const validated = spec.validationDays ? instant(shift(completed,spec.validationDays)) : spec.validated === null ? null : dates.instant(spec.validated);
    if (completed < occurrence.completed_at || validated && (validated < completed || validated > dates.anchor)) reject('retained remediation dates are inconsistent.');
    findingWork(db,{assessment,key:spec.key,title:spec.title,description:'Fictional retained exception: '+spec.title,
      remediation:spec.work,created:occurrence.completed_at,due:shift(completed,-3),status:'done',completed,validated,
      resolution:spec.resolution,review,occurrence},owner,actor);
    for (const event of assessment.assessment_history) if (event.at >= occurrence.completed_at && event.at < completed)
      Object.assign(event,{status:'in_progress',implementation:'Fictional remediation remained incomplete: '+spec.work,
        notes:'The retained Finding had not yet reached its separate completion/validation decisions.'});
    assessment.assessment_history.push({at:occurrence.completed_at,by:owner.user_id,status:'needs_attention',
      implementation:'Fictional observed exception: '+spec.title,notes:'The source occurrence raised owned remediation.',source:PROVENANCE},
    {at:completed,by:owner.user_id,status:'addressed',implementation:initechSafeguardContent(spec.id,'addressed').current_implementation,
      notes:'Fictional work completed. '+spec.resolution,source:PROVENANCE});
    assessment.assessment_history.sort((a,b) => a.at.localeCompare(b.at));
  }
}

function closedRiskWork(db, operations, origin, owner, actor) {
  for (const risk of db.risks.filter(row => row.client_id === CID)) {
    const lifecycle = operations.risk_lifecycles.find(row => row.risk_id === risk.risk_id);
    if (!lifecycle || !scheduledDate(lifecycle.assessed_at)) reject('each Risk needs its actual source assessment date.');
    risk.rating_history = [{at:lifecycle.assessed_at,by:actor.user_id,by_name:actor.name,prev_likelihood:null,prev_impact:null,prev_score:null,
      new_likelihood:risk.likelihood_score,new_impact:risk.impact_score}];
    const decision = risk.status === 'accepted'
      ? {action:'accepted',by:risk.accepted_by,at:risk.acceptance_date,rationale:risk.acceptance_rationale,expires_at:risk.acceptance_expires_at}
      : risk.status === 'closed' ? {action:'closed',by:risk.closed_by,at:risk.closed_at,reason:risk.closure_reason,note:risk.closure_note} : null;
    if (decision) {
      const decisionActor = db.users.find(row => row.user_id === decision.by && eligible(row,CID));
      if (!decisionActor || risk.decision_history?.length || !scheduledDate(decision.at)
        || decision.at < risk.created_at)
        reject('Risk decision import requires an unchanged source decision and existing actor.');
      if (decision.action === 'accepted' && (!scheduledDate(decision.expires_at) || decision.expires_at <= decision.at))
        reject('an imported acceptance must expire after its original decision.');
      risk.decision_history = [{...decision,provenance:PROVENANCE}];
      log(db,'risks',risk,decision.at,decisionActor,decision.action === 'accepted' ? 'Risk accepted' : 'Risk closed');
    }
    if (risk.status !== 'closed') continue;
    const existing = db.tasks.filter(row => row.client_id === CID && (row.risk_id === risk.risk_id || risk.related_task_ids?.includes(row.task_id)));
    if (existing.length) {
      if (existing.some(row => row.status !== 'done' || !row.completed_at || row.completed_at > risk.closed_at))
        reject('a closed Risk cannot hide unfinished or later treatment.');
      continue;
    }
    const created = latest(instant(origin),risk.created_at), completed = instant(shift(risk.closed_at,-5));
    if (completed < created) reject('closed Risk work cannot precede identification.');
    const task = {task_id:PREFIX+'task_close_'+risk.risk_id,client_id:CID,risk_id:risk.risk_id,
      source_type:'risk',source_id:risk.risk_id,title:'Complete treatment — '+risk.title,description:risk.treatment_plan,
      assignee_id:risk.owner_id || owner.user_id,priority:'medium',status:'open',due_date:day(risk.closed_at),
      created_at:created,created_by:actor.user_id,updated_at:completed,resolution:risk.closure_note};
    prepareTask(db,task); Object.assign(task,{status:'done',started_at:created,started_by:task.assignee_id,completed_at:completed,completed_by:task.assignee_id});
    db.tasks.push(task); risk.related_task_ids = [task.task_id]; link(risk,'tasks',task.task_id);
  }
}

function currentBasis(assessments) {
  for (const row of assessments.filter(item => item.status !== 'not_assessed')) {
    const source = row.guided_assessment_source;
    if (!source?.version || !source.answers) reject('completed native interview provenance is required.');
    const valid = new Set((criteriaCatalog.requirements[row.definition_id]?.criteria || []).map(item => item.id));
    const questions = visibleQuestions(row.definition_id,source.answers,source.version);
    row.cis_assessment_criteria = [...new Set(questions.filter(question => question.type === 'matrix')
      .flatMap(question => (question.criterion_ids || []).filter((id,index) => valid.has(id) && source.answers[question.id]?.[question.rows[index]] === 'Yes')))];
    const current = row.assessment_history.filter(event => event.at === row.last_saved).at(-1);
    if (!current) reject('a dated current source observation is required.');
    Object.assign(current,{verification:row.verification,verification_checklist:row.verification_checklist,
      cis_assessment_criteria:copy(row.cis_assessment_criteria),guided_assessment_source:copy(source),
      technology:row.technology,owner_id:row.owner_id,process_owner_id:row.process_owner_id});
    current.notes += '\n'+initechSafeguardContent(row.definition_id,row.status).evidence_check
      +' Fictional implementation reporting remains separate from saved verification; this import does not claim external or browser validation.';
  }
}

function result(db, origin, anchor) {
  const reviews = mine(db,'reviews'), assessments = mine(db,'framework_assessments');
  const findings = mine(db,'findings').filter(row => row.finding_id.startsWith(PREFIX));
  const tasks = mine(db,'tasks').filter(row => row.task_id.startsWith(PREFIX));
  return {reviews,assessments,findings,tasks,origin,anchor,occurrence_count:reviews.reduce((sum,row) => sum+(row.occurrences || []).length,0),
    exceptions:reviews.filter(row => row.fixture_history_exception).map(row => ({review_id:row.review_id,reason:row.fixture_history_exception})),
    evidence_specs:[...reviews.filter(row => row.occurrences?.length).map(row => ({key:'history_'+row.review_id,linked_type:'review',linked_id:row.review_id,
      history_occurrence_ids:row.occurrences.map(item => item.occurrence_id),
      relationships:row.occurrences.map(item => ({kind:'reviews',id:row.review_id,occurrence_id:item.occurrence_id})),
      content_outline:[PROVENANCE,...row.occurrences.map(item => item.due_date+' | '+item.completed_at+' | '+item.outcome+' | '+item.conclusion)]})),
    ...findings.map(row => ({key:'history_'+row.finding_id,linked_type:'finding',linked_id:row.finding_id,
      relationships:[{kind:'tasks',id:row.primary_task_id},{kind:'framework_assessments',id:row.framework_assessment_id}],
      content_outline:[PROVENANCE,row.description,row.remediation_plan,
        tasks.find(task => task.task_id === row.primary_task_id)?.resolution || 'Work remains unfinished.',
        row.validated_at ? 'Separate fictional validation: '+row.validated_at : 'Finding validation remains incomplete.']})),
    ...tasks.filter(row => row.risk_id && row.status === 'done').map(row => ({key:'history_'+row.task_id,linked_type:'task',linked_id:row.task_id,
      relationships:[{kind:'risks',id:row.risk_id}],content_outline:[PROVENANCE,row.description,row.resolution,
        'Action completed: '+row.completed_at+'. The Risk has a separate recorded closure decision.']}))],
    verification_basis:assessments.filter(row => row.status !== 'not_assessed').map(row => ({assessment_id:row.framework_assessment_id,
      definition_id:row.definition_id,at:row.last_saved,by:row.assessed_by,verification:row.verification,
      criteria_ids:copy(row.cis_assessment_criteria || []),question_version:row.guided_assessment_source.version,
      evidence_check:initechSafeguardContent(row.definition_id,row.status).evidence_check,provenance:PROVENANCE})),
    reporting_seeded:!!db.cis_demo_scenario_history?.[CID]};
}

export function seedInitechHistory(db, options) {
  const input = sourceInputs(db,options), {dates,operations} = options;
  const {actor,account,origin} = input;
  if (input.reviews.every(row => row.fixture_history_version === VERSION && row.fixture_history_anchor === dates.anchor))
    return result(db,origin,dates.anchor);
  if (input.reviews.some(row => row.occurrences?.length || row.fixture_history_version)
    || input.assessments.some(row => row.assessment_history?.length)
    || mine(db,'findings').length || mine(db,'tasks').some(row => !operations.tasks.some(task => task.task_id === row.task_id))
    || db.portfolio_reporting?.snapshots?.some(row => row.client_id === CID) || db.cis_demo_scenario_history?.[CID])
    reject('requires fresh source records; retained history must not be reset.');
  const staged = {...db};
  for (const kind of Object.keys(IDS)) staged[kind] = (db[kind] || []).map(row => row.client_id === CID ? copy(row) : row);
  staged.cis_demo_scenario_history = copy(db.cis_demo_scenario_history || {});
  const assessments = mine(staged,'framework_assessments'), reviews = mine(staged,'reviews');
  assessmentHistory(assessments,dates,origin,account,operations);
  reviewHistory(staged,reviews,assessments,dates,origin,account,operations);
  remediationHistory(staged,assessments,reviews,operations,dates,origin,account,actor);
  closedRiskWork(staged,operations,origin,account,actor);
  currentBasis(assessments);
  for (const review of reviews) for (const occurrence of review.occurrences) {
    for (const snapshot of occurrence.requirement_snapshot || []) {
      const assessment = assessments.find(row => row.definition_id === snapshot.definition_id);
      snapshot.status = assessment.assessment_history.filter(event => event.at <= occurrence.completed_at).at(-1)?.status || 'not_assessed';
      snapshot.owner_id = assessment.owner_id; snapshot.process_owner_id = assessment.process_owner_id;
    }
    log(staged,'reviews',review,occurrence.completed_at,account,'Review completed',
      {occurrence_id:occurrence.occurrence_id,outcome:occurrence.outcome,finding_count:occurrence.finding_count});
  }
  for (const row of assessments) {
    let previous;
    for (const event of row.assessment_history) {
      if (event.status !== previous && event.status !== 'not_assessed') log(staged,'framework_assessments',row,event.at,account,'Framework assessment updated',{status:event.status});
      previous = event.status;
    }
  }
  for (const finding of mine(staged,'findings')) {
    log(staged,'findings',finding,finding.created_at,actor,'Finding raised');
    if (finding.validated_at) log(staged,'findings',finding,finding.validated_at,actor,'Finding validated and closed');
  }
  for (const task of mine(staged,'tasks').filter(row => row.task_id.startsWith(PREFIX))) {
    log(staged,'tasks',task,task.created_at,actor,'Action Item created');
    if (task.started_at) log(staged,'tasks',task,task.started_at,account,'Work started');
    if (task.completed_at) log(staged,'tasks',task,task.completed_at,account,'Action Item completed');
    validateAssignment(staged,'tasks',task);
  }
  for (const kind of Object.keys(IDS)) {
    const fields = kind === 'logs' ? ['audit_id','log_id'] : [IDS[kind]];
    const targetIds = mine(staged,kind).flatMap(row => fields.map(field => row[field]).filter(Boolean));
    if (new Set(targetIds).size !== targetIds.length || (db[kind] || []).some(row => row.client_id !== CID && fields.some(field => targetIds.includes(row[field]))))
      reject('a generated native or audit identity collides with retained data.');
  }
  if (mine(staged,'logs').some(row => !scheduledDate(row.at) || row.at > dates.anchor))
    reject('source audit events must have real, nonfuture scenario dates.');
  if (!seedCisScenarioHistory(staged,staged.clients.find(row => row.client_id === CID),new Date(dates.anchor),{version:CIS_SHOWCASE_VERSION}))
    reject('reporting history must be derived once from the actual dated assessments.');
  // Publish only after all source checks succeed; preserve original object identity
  // and every unrelated row/map. This is not a startup/read migration.
  for (const [kind,field] of Object.entries(IDS)) {
    const existing = new Map((db[kind] || []).map(row => [row[field] || (kind === 'logs' ? row.log_id : null),row]));
    for (const row of mine(staged,kind)) {
      const id = row[field] || (kind === 'logs' ? row.log_id : null);
      if (existing.has(id)) Object.assign(existing.get(id),row); else {db[kind] ||= []; db[kind].push(row);}
    }
  }
  db.portfolio_reporting = staged.portfolio_reporting; db.cis_demo_scenario_history = staged.cis_demo_scenario_history;
  return result(db,origin,dates.anchor);
}
