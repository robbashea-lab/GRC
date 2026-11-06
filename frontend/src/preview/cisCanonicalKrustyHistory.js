import {activeDefinitions} from '../lib/frameworks';
import {reviewSchedule, scheduledDate} from '../lib/reviewOccurrences';
import {visibleQuestions} from '../lib/guidedAssessment';
import criteriaCatalog from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import {eligible, validateAssignment} from './assignmentEligibility';
import {prepareTask} from './actionItems';
import {effectivePolicySubject} from './policyReviewCoverage';
import {syncPolicyReview} from './policyReviews';
import {syncVendorReview} from './vendors';
import {riskSnapshot} from './risks';
import {seedCisScenarioHistory} from './cisDemoHistory';
import {CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {krustySafeguardContent} from './cisCanonicalKrustyContent';
import {krustyHistoryVolumePlan} from './cisCanonicalKrustyVolume';

const CID = 'demo_krusty_krab', PREFIX = CID+'_canonical_history_', VERSION = 'krusty-native-history-v1';
const PROVENANCE = 'Explicit fictional Krusty history; retrospective synthetic observations, not browser execution, client signatures, uploaded-file verification or external assurance.';
const IDS = {framework_assessments:'framework_assessment_id', reviews:'review_id', policies:'policy_id',
  findings:'finding_id', tasks:'task_id', risks:'risk_id', vendors:'vendor_id', ai_systems:'ai_system_id', logs:'audit_id'};
const FAMILY_WORK = {
  1:'Reconciled restaurant, mobile, network and ordering-cloud asset sources and exception ownership.',
  2:'Reconciled software authorization, support, executable/library controls and authorized scripts.',
  3:'Reviewed employee, franchise, recipe and guest-contact handling, access, retention and disposal.',
  4:'Reviewed restaurant, network, mobile and ordering-workload configuration and administration boundaries.',
  5:'Reconciled workforce, administrator and service identities with accountable lifecycle owners.',
  6:'Reviewed authorization, immediate revocation, authentication and role/right enforcement.',
  7:'Reviewed vulnerability intake, authorized scanning, priorities, correction and result checks.',
  8:'Reconciled attributable security sources, collection, protected retention and log examination.',
  9:'Reviewed permitted browsers, mail, DNS and safe handling of restaurant support requests.',
  10:'Reviewed endpoint malware prevention, updates and controlled execution outcomes.',
  11:'Reviewed protected backups, isolated recovery copies and sampled restoration responsibilities.',
  12:'Reviewed maintained infrastructure, network diagrams and restricted administration.',
  13:'Reviewed outlet/cloud detection, prevention, access boundaries and alert disposition.',
  14:'Reviewed hire/annual learning delivery and restaurant, franchise and engineering role coverage.',
  15:'Reconciled then-existing providers, classification, assessment, monitoring and secure exit.',
  16:'Reviewed ordering/menu application design, component handling, testing and vulnerability correction.',
  17:'Reviewed response roles, reporting routes, communications, exercises and incident thresholds.',
  18:'Reviewed authorized external/internal test scope, correction and defense validation.'
};
// These are first recorded manual v8.1 judgments, not dates when physical
// security practices were first adopted. The security program predates v8.1.
const FIRST_JUDGMENT_DAYS = [7,14,21,28,35,42,49,56,63,70,77,84,91,98,105,112,119,126];
const RETAINED_SOURCE_FINDINGS = {
  'retired-pos-route':{id:'6.2'},
  'old-menu-account':{id:'5.3',implementation_gap:false,
    uncertainty:'The source does not establish attributable last-use dates or the native dormancy criterion.'},
  'retired-kiosk':{id:'2.2',implementation_gap:false,
    uncertainty:'The source does not establish whether the unsupported component had a permitted necessary-use exception or was designated unauthorized.'},
  'public-recipe-link':{id:'3.3'},
  'old-franchise-key':{id:'5.2',implementation_gap:false,
    uncertainty:'The shared integration secret is not established to be a password; no native password-uniqueness failure is inferred.'},
  'legacy-hr-export':{id:'3.3'}, 'retired-hosting':{id:'6.2'}
};
const copy = value => JSON.parse(JSON.stringify(value));
const mine = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const day = value => String(value || '').slice(0,10);
const instant = value => day(value)+'T00:00:00.000Z';
const reject = message => {throw new Error('Krusty history: '+message);};

function valid(value, label) {
  if (!scheduledDate(value)) reject(label+' must retain a valid native date.');
  return value;
}
function shift(value, days) {
  const date = scheduledDate(valid(value, 'source date'));
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
function link(row, kind, id) {
  row.related_links ||= [];
  if (!row.related_links.some(item => item.kind === kind && item.id === id)) row.related_links.push({kind,id});
}
function log(db, kind, row, at, actor, action, meta = {}) {
  db.logs.push({audit_id:PREFIX+'audit_'+kind+'_'+(row[IDS[kind]] || row.client_id)+'_'+at+'_'+action.replaceAll(' ','_'),
    client_id:CID, entity_type:kind, entity_id:row[IDS[kind]] || row.client_id, at, action,
    user_id:actor.user_id, user_name:actor.name, user_email:actor.email,
    meta:{simulated:true, title:row.title || row.name, provenance:PROVENANCE, ...meta}});
}

function inputs(db, {dates, owner, governance, operations} = {}) {
  const client = mine(db,'clients')[0], actor = db.user;
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const accounts = (db.users || []).filter(row => row.user_id === ownerId), account = accounts[0];
  if (mine(db,'clients').length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.archived || client.archived_at || client.framework_settings?.['cis-ig1']?.implementation_group !== 3
    || actor?.workspace_mode !== 'demo' || !['super_admin','platform_admin'].includes(actor.role)
    || !eligible(actor,CID) || (db.users || []).filter(row => row.user_id === actor.user_id).length !== 1
    || accounts.length !== 1 || !eligible(account,CID)) reject('use the canonical active IG3 Demo and existing eligible actors.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['month','day','instant'].every(key => typeof dates[key] === 'function')
    || !scheduledDate(dates.anchor) || dates.instant(0) !== dates.anchor) reject('a frozen UTC source clock is required.');
  const organization = instant(valid(dates.month(-60),'organization origin'));
  const origin = instant([day(organization),'2024-07-01'].sort().at(-1));
  if (!governance || !operations || governance.anchor !== dates.anchor || governance.origin !== origin
    || governance.organization_origin !== organization || operations.origin !== origin
    || operations.organization_origin !== organization) reject('all source manifests must retain the same framework and organization origins.');
  const resolve = (values, kind) => {
    if (!Array.isArray(values)) reject('the frozen '+kind+' manifest is required.');
    const field = IDS[kind], valuesIds = values.map(row => row[field]);
    if (valuesIds.some(id => typeof id !== 'string' || !id) || new Set(valuesIds).size !== valuesIds.length)
      reject('source identities must be distinct.');
    return valuesIds.map(id => {
      const found = (db[kind] || []).filter(row => row[field] === id);
      if (found.length !== 1 || found[0].client_id !== CID) reject('source identities must resolve uniquely to this client.');
      return found[0];
    });
  };
  const definitions = activeDefinitions('cis-ig1',{implementation_group:3}), assessments = mine(db,'framework_assessments');
  if (definitions.length !== assessments.length || definitions.some(definition => assessments.filter(row =>
    row.definition_id === definition.id && row.framework_key === 'cis-ig1' && row.framework_version === '8.1').length !== 1)
    || assessments.some(row => row.status !== 'addressed' || row.created_at !== origin || row.fixture_history_origin_at !== origin
      || !scheduledDate(row.last_saved) || row.last_saved < origin || row.last_saved >= dates.anchor
      || !row.guided_assessment_source?.answers || row.guided_assessment_source.generated_at !== row.last_saved
      || row.verification !== 'needs_validation' || row.verification_checklist !== null || row.items_to_address?.length
      || !(db.contacts || []).some(contact => contact.contact_id === row.process_owner_id && contact.client_id === CID && contact.status === 'active')))
    reject('preserve the complete clean current IG3 assessments and their unverified current interview provenance.');
  for (const row of assessments) {
    const content = krustySafeguardContent(row.definition_id,'addressed');
    if (row.implementation !== content.current_implementation || row.technology !== content.technology_process
      || row.owner_id !== account.user_id || row.last_saved !== dates.instant(-2))
      reject('requires the exact current source assessment profile; retained visitor edits must not be reset.');
  }
  const frameworkReviews = resolve(governance.reviews,'reviews'), supplementalReviews = resolve(operations.reviews,'reviews');
  const reviews = [...frameworkReviews,...supplementalReviews];
  if (new Set(reviews.map(row => row.review_id)).size !== reviews.length || mine(db,'reviews').length !== reviews.length
    || resolve(governance.policies,'policies').length !== mine(db,'policies').length)
    reject('the complete distinct source Review and Policy population is required.');
  for (const kind of ['risks','vendors','ai_systems'])
    if (resolve(operations[kind],kind).length !== mine(db,kind).length) reject('the complete operational '+kind+' population is required.');
  resolve(operations.tasks,'tasks');
  if (!Array.isArray(operations.risk_lifecycles)) reject('the source Risk lifecycles are required.');
  for (const risk of mine(db,'risks')) {
    const life = operations.risk_lifecycles.filter(row => row.risk_id === risk.risk_id);
    if (life.length !== 1 || life[0].identified_at !== risk.created_at || life[0].assessed_at !== risk.created_at
      || (life[0].closed_at || null) !== (risk.closed_at || null) || (life[0].accepted_at || null) !== (risk.acceptance_date || null))
      reject('Risk source dates and exact lifecycle decisions must agree.');
  }
  const volume = krustyHistoryVolumePlan(reviews,{anchor:dates.anchor,organization_origin:organization,framework_origin:origin,
    review_origins:operations.review_origins,framework_review_ids:frameworkReviews.map(row => row.review_id)});
  if (!volume.complete) reject('the complete native period plan must have no unresolved lifecycle or moved-date ambiguity.');
  return {client,actor,account,origin,organization,definitions,assessments,reviews,volume};
}

function manualObservation(row, at, owner, notes) {
  const family = row.definition_id.split('.')[0];
  return {at,by:owner.user_id,status:'addressed',
    implementation:'Fictional manual v8.1 judgment in the then-enrolled Krusty restaurant and ordering scope. '+FAMILY_WORK[family],
    notes,source:PROVENANCE};
}
function assessmentHistory(assessments, dates, origin, owner) {
  for (const row of assessments) {
    const family = Number(row.definition_id.split('.')[0]), first = instant(shift(origin,FIRST_JUDGMENT_DAYS[family-1]));
    if (!FAMILY_WORK[family] || !scheduledDate(first) || first >= row.last_saved)
      reject('the first recorded family judgment must precede its current assessment.');
    const maintained = [12,6,3,1].map(months => instant(dates.month(-months))).concat(dates.instant(-75));
    const points = [...new Set([first,...maintained].filter(at => at >= first && at < row.last_saved))].sort();
    row.assessment_history = [{at:origin,by:owner.user_id,status:'not_assessed',implementation:'',
      notes:'Fictional v8.1 enrollment. Existing security practice is not yet a recorded CIS judgment; no failure or historical guided interview is inferred.',source:PROVENANCE},
    ...points.map(at => manualObservation(row,at,owner,at === first
      ? 'First recorded manual assessment of the existing program; this is not its physical adoption date.'
      : 'Dated fictional manual maintenance observation; current interview answers and later compiled files are not backdated.')),
    {at:row.last_saved,by:row.assessed_by,status:row.status,implementation:row.implementation,notes:row.notes,source:PROVENANCE}];
  }
}

function vendorRoster(db, at) {
  return mine(db,'vendors').filter(row => row.created_at <= at).map(row => ({vendor_id:row.vendor_id,name:row.name,
    created_at:row.created_at,status:row.offboarded_at && row.offboarded_at <= at ? 'inactive' : 'active',
    offboarded_at:row.offboarded_at && row.offboarded_at <= at ? row.offboarded_at : null}));
}
function sourceSnapshot(db, review, at, operations) {
  if (review.risk_id) {
    const risk = mine(db,'risks').find(row => row.risk_id === review.risk_id);
    const life = operations.risk_lifecycles.find(row => row.risk_id === risk.risk_id), snapshot = copy(riskSnapshot(risk));
    if (life.accepted_at && life.accepted_at > at) Object.assign(snapshot,{status:'assessed',treatment:'monitor',
      accepted_by:null,acceptance_date:null,acceptance_rationale:null,acceptance_expires_at:null});
    if (life.closed_at && life.closed_at > at) snapshot.status = 'assessed';
    if (risk.status === 'in_progress' && (!life.treatment_started_at || life.treatment_started_at > at)) snapshot.status = 'assessed';
    return {risk_before:copy(snapshot),risk_after:copy(snapshot),risk_review_recommendation:'Reviewed — No Change',
      source_snapshot:{risk_id:risk.risk_id,title:risk.title,owner_id:risk.owner_id,...snapshot},
      conclusion:'Fictional owner review of then-recorded exposure; treatment, acceptance and closure remain separate decisions.'};
  }
  if (review.vendor_id) {
    const vendor = mine(db,'vendors').find(row => row.vendor_id === review.vendor_id);
    // A current contract term is not the birth of this five-year relationship.
    return {source_snapshot:{vendor_id:vendor.vendor_id,name:vendor.name,service:vendor.service,
      status:vendor.offboarded_at && vendor.offboarded_at <= at ? 'inactive' : 'active',relationship_created_at:vendor.created_at,
      review_purpose:review.vendor_purpose || 'vendor',assurance_scope:'Requested information is not received or validated assurance.'},
      conclusion:review.vendor_purpose === 'contract'
        ? 'Fictional commercial term decision; the then-current provider-policy assessment is separately recorded before a new term takes effect.'
        : 'Fictional classification-led annual provider assessment of service, information and responsibility changes; contract-triggered assessment and policy-defined notice monitoring remain separate outputs.'};
  }
  if (review.ai_system_id) {
    const ai = mine(db,'ai_systems').find(row => row.ai_system_id === review.ai_system_id);
    return {source_snapshot:{ai_system_id:ai.ai_system_id,name:ai.name,approval_status:'pending_assessment',
      screening_recorded:ai.onboarding_screening?.recorded_at <= at,
      linked_risk_ids:(ai.related_links || []).filter(row => row.kind === 'risks').map(row => row.id)},
      conclusion:'Fictional review of proposed use; this occurrence does not approve AI operation.'};
  }
  const source = {};
  if (review.framework_plan_key === 'provider-inventory') source.vendor_roster = vendorRoster(db,at);
  if (review.framework_plan_key === 'account-authorization') {
    const risk = mine(db,'risks').find(row => row.risk_id === CID+'_canonical_risk_retired-hosting');
    const vendor = mine(db,'vendors').find(row => row.vendor_id === CID+'_canonical_vendor_retired');
    if (!risk || !vendor) reject('the exact Old Galley entitlement and relationship sources are required.');
    source.support_entitlements = [{vendor_id:vendor.vendor_id,entitlement:'obsolete Old Galley support entitlement',
      status:risk.closed_at <= at ? 'revoked' : 'active',relationship_status:vendor.offboarded_at <= at ? 'inactive' : 'active'}];
  }
  return Object.keys(source).length ? {source_snapshot:source} : {};
}

function operatingResult(review, due) {
  const key = review.framework_plan_key || review.framework_setup_key?.split(':').at(-1);
  const results = {
    'asset-inventory':'Restaurant custody, enrolled-device, network and cloud extracts were reconciled; changed ownership and connection authorization were recorded.',
    'software-support':'Installed/approved software and support notices were compared; unauthorized/unsupported deltas received an owner and disposition. Script reassessment remains separate.',
    'account-authorization':'The then-current authorization roster, service identities and role/right samples were reconciled. Event-triggered revocation was not deferred to this quarterly meeting.',
    'passive-discovery-reconciliation':'Restaurant/cloud passive-observation feeds were checked and observed additions/removals reconciled with inventory; unknown connections were denied pending disposition.',
    'script-allowlist-reassessment':'The then-authorized script register was reassessed; a permitted support script ran while altered and unlisted scripts were denied.',
    'event-alert-tuning':'Sampled events, false positives and missed-detection reports were examined; threshold decisions and controlled signal outcomes were recorded.',
    'penetration-testing':'An authorized fictional external restaurant/ordering scope was exercised by a qualified tester; observed paths, correction ownership and separate defender validation were recorded.',
    'internal-penetration-test':'An authorized fictional internal test exercised guest-to-POS, workforce-to-personnel and permitted administration paths; unauthorized access was denied and defender observations reconciled.',
    '8.11':'The scheduled restaurant, administration and ordering-cloud log sources were examined; anomalies and disposition were recorded for this week.',
    '11.5':'A quarterly isolated sample restored an ordering dataset and outlet configuration; integrity and usable read checks passed, with source identifiers and recovery observations retained.'
  };
  return {execution_reference:'KK-'+(key || review.review_type || 'review')+'-'+due,
    observation:results[key] || 'The then-current Krusty process, accountable roles, applicable changes and retained source outputs were examined; this maintenance review does not substitute for separate operating duties.',
    basis:'Retrospective fictional period ledger; not a copied current sample or independent verification.'};
}
function reviewHistory(db, input, dates, operations) {
  for (const review of mine(db,'reviews')) {
    const planned = input.volume.reviews.find(row => row.review_id === review.review_id);
    const actor = (db.users || []).find(row => row.user_id === (review.reviewer_id || review.owner_id) && eligible(row,CID)) || input.account;
    review.fixture_history_version = VERSION; review.fixture_history_anchor = dates.anchor; review.fixture_history_origin_at = planned.origin;
    review.occurrences = planned.due_dates.map(due => {
      const at = instant(due), {occurrences,...parent} = review;
      const occurrence = {...copy(parent),...reviewSchedule({...review,due_date:due,recurrence_due_date:null}),
        occurrence_id:review.review_id+'_'+due,current_occurrence_id:review.review_id+'_'+due,status:'completed',
        due_date:due,started_at:at,started_by:actor.user_id,completed_at:at,completion_date:at,updated_at:at,
        completed_by:actor.user_id,completed_by_name:actor.name,outcome:'no_findings',finding_count:0,finding_ids:[],evidence:[],
        tested_scope:'Then-existing Krusty restaurant, franchise and ordering scope',tested_period:due+' scheduled cycle',checklist_confirmed:true,
        notes:'Imported fictional completed period. Dated source snapshots and exceptions control its meaning; current parent notes are not historical evidence.',
        conclusion:'Fictional maintenance completed; this does not assert universal implementation or close separate remediation.',
        no_evidence_reason:'Retrospective fictional ledger; any later compiled synthetic book has its actual compilation date, not this completion date.',
        fixture_history_provenance:PROVENANCE,...sourceSnapshot(db,review,at,operations)};
      delete occurrence.cancelled_at; delete occurrence.cancelled_by;
      delete occurrence.scope; delete occurrence.fixture_history_exception; delete occurrence.risk_baseline;
      const covered = [...new Set([...(review.framework_safeguards || []),...input.assessments.filter(row =>
        row.related_links?.some(item => item.kind === 'reviews' && item.id === review.review_id)).map(row => row.definition_id)])];
      if (covered.length) {
        occurrence.operating_observation = operatingResult(review,due);
        occurrence.requirement_snapshot = covered.map(id => ({definition_id:id,
          title:input.definitions.find(row => row.id === id)?.title,framework_version:'8.1',
          source_cadence:input.definitions.find(row => row.id === id)?.source_cadence,status:'not_assessed'}));
      }
      if (review.policy_id) {
        const coverage = effectivePolicySubject(mine(db,'policies').find(row => row.policy_id === review.policy_id),at);
        if (!coverage) reject('a historical document-maintenance period lacks an effective approved version.');
        occurrence.policy_coverage = [coverage];
      }
      return occurrence;
    });
    if (review.framework_plan_key === 'asset-inventory'
      && review.occurrences.at(-1)?.completed_at !== instant(db.guided_assessment_pilot['fw_'+CID+'_assessment_1.1:'+input.account.user_id].answers.last_review))
      reject('the latest complete inventory must retain the actual interview review date.');
    if (review.risk_id) mine(db,'risks').find(row => row.risk_id === review.risk_id).last_reviewed = review.occurrences.at(-1)?.completed_at || null;
    if (review.vendor_id) syncVendorReview(db,review);
    if (review.policy_id) syncPolicyReview(db,review);
  }
}

function findingWork(db, input, spec) {
  const assessment = mine(db,'framework_assessments').find(row => row.definition_id === spec.id);
  const {account,actor,origin} = input, created = valid(spec.created,'Finding identification');
  const completed = valid(spec.completed,'Action completion'), validated = valid(spec.validated,'Finding validation');
  if (!assessment || created < origin || completed < created || validated <= completed || validated > assessment.last_saved)
    reject('diagnosed CIS defects require a post-enrollment, completed and separately validated chronology.');
  const review = spec.review, occurrence = spec.occurrence;
  if (occurrence && (!review?.occurrences.includes(occurrence) || occurrence.completed_at > created)) reject('a Finding needs its actual eligible originating occurrence.');
  const finding = {finding_id:PREFIX+'finding_'+spec.key,client_id:CID,framework_assessment_id:assessment.framework_assessment_id,
    definition_id:assessment.definition_id,title:spec.title,description:(spec.implementation_gap === false
      ? 'Fictional operating defect; the handling process itself is not judged missing: ' : 'Fictional diagnosed control gap: ')+spec.description,
    source:'CIS Controls v8.1 '+spec.id,remediation_title:spec.work,remediation_plan:spec.work,severity:spec.severity || 'medium',
    status:'closed',owner_id:account.user_id,created_at:created,identified_at:created,created_by:actor.user_id,updated_at:validated,
    due_date:day(completed),validated_at:validated,validated_by:actor.user_id,closed_at:validated,closed_by:actor.user_id,
    decision_history:[{action:'validated',by:actor.user_id,at:validated,
      rationale:'Retrospective fictional validation, separate from Action completion; the importer records the decision, not a client signature. '+spec.resolution}],
    related_links:[{kind:'framework_assessments',id:assessment.framework_assessment_id}]};
  if (review && occurrence) Object.assign(finding,{review_id:review.review_id,occurrence_id:occurrence.occurrence_id});
  validateAssignment(db,'findings',finding); db.findings.push(finding);
  const task = {task_id:PREFIX+'task_'+spec.key,client_id:CID,title:spec.work,description:finding.description,
    source_type:'finding',source_id:finding.finding_id,finding_id:finding.finding_id,framework_assessment_id:assessment.framework_assessment_id,
    assignee_id:account.user_id,priority:spec.priority || 'medium',status:'open',created_at:created,created_by:actor.user_id,
    updated_at:completed,due_date:day(completed),resolution:spec.resolution};
  if (spec.risk) task.risk_id = spec.risk.risk_id;
  prepareTask(db,task);
  Object.assign(task,{status:'done',started_at:created,started_by:account.user_id,completed_at:completed,completed_by:account.user_id});
  finding.primary_task_id = task.task_id; db.tasks.push(task);
  link(assessment,'findings',finding.finding_id); link(assessment,'tasks',task.task_id);
  if (review) {link(finding,'reviews',review.review_id); link(task,'reviews',review.review_id);}
  if (spec.risk) {
    const risk = spec.risk; risk.related_task_ids = [...new Set([...(risk.related_task_ids || []),task.task_id])];
    risk.related_finding_ids = [...new Set([...(risk.related_finding_ids || []),finding.finding_id])];
    link(finding,'risks',risk.risk_id); link(task,'risks',risk.risk_id); link(risk,'findings',finding.finding_id); link(risk,'tasks',task.task_id);
  }
  if (occurrence) {
    occurrence.finding_ids.push(finding.finding_id); occurrence.finding_count = occurrence.finding_ids.length;
    occurrence.outcome = 'findings_raised'; occurrence.conclusion = 'Fictional diagnosed exception: '+spec.title+'. Remediation and validation have their own later decisions.';
  }
  if (spec.implementation_gap !== false) input.gaps.push({assessment_id:assessment.framework_assessment_id,
    created,completed,finding_id:finding.finding_id,description:spec.description});
  if (spec.uncertainty) input.uncertainties.push({assessment_id:assessment.framework_assessment_id,
    created,completed,reason:spec.uncertainty+' The historical CIS judgment remains unassessed until correction.'});
  const identified = manualObservation(assessment,created,account,spec.implementation_gap === false
    ? 'A working detection/remediation process recorded operating Finding '+finding.finding_id+'; this observation does not establish a missing safeguard.'
    : 'The enrolled CIS program carried forward known control Finding '+finding.finding_id+'; this is not a new discovery date.');
  if (spec.implementation_gap === false && assessment.assessment_history.filter(event => event.at <= created).at(-1)?.status === 'not_assessed')
    Object.assign(identified,{status:'not_assessed',implementation:'',notes:'Existing operating Finding '+finding.finding_id+' is retained without inferring a CIS judgment before the first manual assessment.'});
  assessment.assessment_history.push(identified,
  manualObservation(assessment,completed,account,'Fictional remediation completed. '+spec.resolution+' Separate Finding validation remains pending at this point.'),
  manualObservation(assessment,validated,account,'Separate fictional Finding validation completed. This does not set the current assessment verification checklist.'));
  assessment.assessment_history.sort((a,b) => a.at.localeCompare(b.at));
}

function remediation(db, input, dates) {
  for (const [key,mapping] of Object.entries(RETAINED_SOURCE_FINDINGS)) {
    const risk = mine(db,'risks').find(row => row.risk_id === CID+'_canonical_risk_'+key);
    if (!risk || risk.status !== 'closed' || risk.related_task_ids?.length) reject('use each exact closed source Risk without duplicate treatment.');
    const created = [input.origin,risk.created_at].sort().at(-1);
    findingWork(db,input,{...mapping,key:'retained-'+key,risk,title:risk.title,
      description:risk.description+' The existing organizational Risk records this condition from '+risk.created_at+'.'
        +(key === 'old-menu-account' ? ' Its exact dormancy duration is not established; no 45-day CIS failure is inferred.' : ''),
      work:risk.treatment_plan,created,completed:shift(risk.closed_at,-5)+'T10:00:00.000Z',validated:risk.closed_at,
      resolution:risk.closure_note});
  }
  const reviews = mine(db,'reviews'), byPlan = key => reviews.find(row => row.framework_plan_key === key);
  const prior = key => byPlan(key)?.occurrences.at(-1);
  const software = prior('software-support'), external = prior('penetration-testing'), vulnerability = prior('vulnerability-remediation');
  if (!software || !external || !vulnerability) reject('current operating exceptions require their actual native past periods.');
  const specs = [
    {key:'unauthorized-export-utility',id:'2.3',implementation_gap:false,title:'Unauthorized export utility removed',description:'KK-LAP-019 contained an unapproved export utility.',
      work:'Remove the utility and reconcile authorization and installed-software results',review:byPlan('software-support'),occurrence:software,
      created:software.completed_at,completed:software.due_date+'T10:00:00.000Z',validated:shift(software.due_date,1)+'T10:00:00.000Z',
      resolution:'Execution was denied, uninstall completed, rescan found no match and the permitted business service remained usable.'},
    {key:'external-config-08',id:'7.7',implementation_gap:false,title:'External scan diagnostic response corrected',description:'Authorized external vulnerability scanning identified unwanted diagnostic detail on an ordering service.',
      work:'Restrict the diagnostic response and retest the authorized endpoint',review:byPlan('vulnerability-remediation'),occurrence:vulnerability,
      created:vulnerability.completed_at,completed:shift(vulnerability.due_date,1)+'T10:00:00.000Z',validated:shift(vulnerability.due_date,2)+'T10:00:00.000Z',
      resolution:'The unwanted response was removed and the bounded authorized scan check no longer reproduced it; other acceptable residual business work remains separate.'},
    {key:'app-auth27',id:'16.2',implementation_gap:false,title:'Cross-franchise application ownership check corrected',description:'APP-AUTH27 identified a missing per-resource ownership check in the ordering application.',
      work:'Correct ownership authorization and cover the related path with regression checks',priority:'critical',severity:'high',
      created:dates.day(-12)+'T09:00:00.000Z',completed:dates.day(-11)+'T11:00:00.000Z',validated:dates.day(-10)+'T13:00:00.000Z',
      resolution:'The controlled cross-franchise request was denied while the own-franchise request remained permitted; causal review and a related-path regression were retained.'},
    {key:'external-test-ext01',id:'18.3',implementation_gap:false,title:'External test diagnostic disclosure corrected',description:'The authorized EXT01 manual external test exposed bounded diagnostic information.',
      work:'Correct diagnostic exposure under the test remediation priority and retest',review:byPlan('penetration-testing'),occurrence:external,
      created:external.completed_at,completed:shift(external.due_date,1)+'T10:00:00.000Z',validated:shift(external.due_date,2)+'T10:00:00.000Z',
      resolution:'The manual retest no longer disclosed diagnostic detail and permitted public ordering remained usable.'},
    {key:'ext01-alert-attribution',id:'13.11',implementation_gap:false,title:'Test alert lacked restaurant attribution',description:'EXT01 defender review found an administration alert without its restaurant attribution.',
      work:'Correct correlation attribution and replay a controlled event',review:byPlan('penetration-testing'),occurrence:external,
      created:external.completed_at,completed:shift(external.due_date,1)+'T11:00:00.000Z',validated:shift(external.due_date,2)+'T11:00:00.000Z',
      resolution:'The replay reached the accountable response queue with the correct restaurant attribution; detection validation remained distinct from the disclosure correction.'},
    {key:'incident-inc12-support-role',id:'6.8',title:'Temporary support role had excessive rights',description:'INC12 identified an overbroad temporary support role during an incident handoff.',
      work:'Remove the excess grant, verify denied access and reconcile expiry ownership',
      created:dates.month(-5)+'T09:00:00.000Z',completed:dates.month(-5)+'T09:05:00.000Z',validated:shift(dates.month(-5),1)+'T09:00:00.000Z',
      resolution:'The excess grant was removed promptly, unauthorized access was denied and expiry/reconciliation ownership was checked separately.'}
  ];
  for (const spec of specs) findingWork(db,input,spec);
}

function reconcileHistoricalGaps(input) {
  for (const assessment of input.assessments) {
    const gaps = input.gaps.filter(gap => gap.assessment_id === assessment.framework_assessment_id);
    const uncertainties = input.uncertainties.filter(item => item.assessment_id === assessment.framework_assessment_id);
    // Combine overlapping defects before judging status: fixing one retained
    // Finding cannot make a safeguard clean while another known gap remains.
    const byTime = new Map(assessment.assessment_history.map(event => [event.at,event]));
    assessment.assessment_history = [...byTime.values()].sort((a,b) => a.at.localeCompare(b.at)).map(event => {
      const active = gaps.filter(gap => gap.created <= event.at && event.at < gap.completed);
      if (!active.length) {
        const uncertain = uncertainties.filter(item => item.created <= event.at && event.at < item.completed);
        return uncertain.length ? {...event,status:'not_assessed',implementation:'',notes:uncertain.map(item => item.reason).join(' ')} : event;
      }
      return {...event,status:active.some(gap => gap.created === event.at) ? 'needs_attention' : 'in_progress',
        implementation:'Known fictional control gaps remain: '+active.map(gap => gap.description).join(' | '),
        notes:'Owned Findings '+active.map(gap => gap.finding_id).join(', ')+' remain incomplete. Existing organizational conditions are carried forward, not rediscovered.'};
    });
  }
}

function riskHistory(db, input, operations) {
  for (const risk of mine(db,'risks')) {
    const life = operations.risk_lifecycles.find(row => row.risk_id === risk.risk_id);
    risk.rating_history = [{at:life.assessed_at,by:input.actor.user_id,by_name:input.actor.name,
      prev_likelihood:null,prev_impact:null,prev_score:null,new_likelihood:risk.likelihood_score,new_impact:risk.impact_score}];
    const decision = risk.status === 'accepted' ? {action:'accepted',by:risk.accepted_by,at:risk.acceptance_date,
      rationale:risk.acceptance_rationale,expires_at:risk.acceptance_expires_at}
      : risk.status === 'closed' ? {action:'closed',by:risk.closed_by,at:risk.closed_at,reason:risk.closure_reason,note:risk.closure_note} : null;
    if (decision) {
      const actor = (db.users || []).find(row => row.user_id === decision.by && eligible(row,CID));
      if (!actor || risk.decision_history?.length || !scheduledDate(decision.at) || decision.at < risk.created_at
        || decision.action === 'accepted' && (!scheduledDate(decision.expires_at) || decision.expires_at <= decision.at))
        reject('retain the exact native Risk decision and existing eligible decision actor.');
      risk.decision_history = [{...decision,provenance:PROVENANCE}];
      log(db,'risks',risk,decision.at,actor,decision.action === 'accepted' ? 'Risk accepted' : 'Risk closed');
    }
    if (risk.status !== 'closed') continue;
    const existing = mine(db,'tasks').filter(row => row.risk_id === risk.risk_id || risk.related_task_ids?.includes(row.task_id));
    if (existing.length) {
      if (existing.some(row => row.status !== 'done' || !row.completed_at || row.completed_at >= risk.closed_at))
        reject('a closed Risk cannot hide unfinished or later treatment.');
      continue;
    }
    const completed = instant(shift(risk.closed_at,-5)), created = [risk.created_at,instant(shift(risk.closed_at,-30))].sort().at(-1);
    const task = {task_id:PREFIX+'task_close_'+risk.risk_id,client_id:CID,risk_id:risk.risk_id,source_type:'risk',source_id:risk.risk_id,
      title:'Complete historical treatment — '+risk.title,description:risk.treatment_plan,assignee_id:risk.owner_id || input.account.user_id,
      priority:'medium',status:'open',created_at:created,created_by:input.actor.user_id,updated_at:completed,
      due_date:day(risk.closed_at),resolution:risk.closure_note};
    if (completed < risk.created_at) reject('closed Risk treatment cannot precede its source.');
    prepareTask(db,task); Object.assign(task,{status:'done',started_at:created,started_by:task.assignee_id,
      completed_at:completed,completed_by:task.assignee_id});
    db.tasks.push(task); risk.related_task_ids = [task.task_id]; link(risk,'tasks',task.task_id);
  }
}

function currentBasis(assessments) {
  for (const row of assessments) {
    const source = row.guided_assessment_source;
    const validCriteria = new Set((criteriaCatalog.requirements[row.definition_id]?.criteria || []).map(item => item.id));
    const questions = visibleQuestions(row.definition_id,source.answers,source.version);
    row.cis_assessment_criteria = [...new Set(questions.filter(question => question.type === 'matrix').flatMap(question =>
      (question.criterion_ids || []).filter((id,index) => validCriteria.has(id) && source.answers[question.id]?.[question.rows[index]] === 'Yes')))];
    const current = row.assessment_history.find(event => event.at === row.last_saved);
    if (!current) reject('the unchanged current source assessment needs its own dated observation.');
    Object.assign(current,{verification:row.verification,verification_checklist:row.verification_checklist,
      cis_assessment_criteria:copy(row.cis_assessment_criteria),guided_assessment_source:copy(source),
      technology:row.technology,owner_id:row.owner_id,process_owner_id:row.process_owner_id});
  }
}
function programHistory(db, input, dates) {
  for (const [at,description] of [[input.organization,'Restaurant security-program register and accountable business/engineering ownership established.'],
    [instant(dates.month(-48)),'Restaurant asset custody, restricted support and provider responsibilities reconciled.'],
    [instant(dates.month(-36)),'Ordering, franchise and workforce protection maintained; this predates the first recorded v8.1 assessment.']]) {
    log(db,'clients',input.client,at,input.account,'Security program milestone',
      {description,classification:'framework-neutral organization history; no legacy CIS version or v8.1 judgment'});
  }
}

function result(db, input, dates) {
  const reviews = mine(db,'reviews'), assessments = mine(db,'framework_assessments');
  const findings = mine(db,'findings').filter(row => row.finding_id.startsWith(PREFIX));
  const tasks = mine(db,'tasks').filter(row => row.task_id.startsWith(PREFIX));
  const firstFull = firstFullyImplemented(assessments);
  return {reviews,assessments,findings,tasks,origin:day(input.origin),organization_origin:input.organization,anchor:dates.anchor,
    first_fully_implemented_at:firstFull,
    occurrence_count:reviews.reduce((sum,row) => sum+(row.occurrences || []).length,0),exceptions:[],volume_plan:input.volume,
    evidence_specs:[...reviews.filter(row => row.occurrences?.length).map(row => ({key:'history_'+row.review_id,linked_type:'review',linked_id:row.review_id,
      history_occurrence_ids:row.occurrences.map(item => item.occurrence_id),
      relationships:row.occurrences.map(item => ({kind:'reviews',id:row.review_id,occurrence_id:item.occurrence_id})),
      content_outline:[PROVENANCE,'Retrospectively compiled at '+dates.anchor+'; original period dates below are not file creation or verification dates.',
        ...row.occurrences.map(item => item.due_date+' | '+item.completed_at+' | '+item.outcome+' | '+item.conclusion+' | '
          +JSON.stringify({operating_observation:item.operating_observation,source_snapshot:item.source_snapshot,policy_coverage:item.policy_coverage,requirement_snapshot:item.requirement_snapshot}))]})),
    ...findings.map(row => ({key:'history_'+row.finding_id,linked_type:'finding',linked_id:row.finding_id,
      relationships:[{kind:'tasks',id:row.primary_task_id},{kind:'framework_assessments',id:row.framework_assessment_id}],
      content_outline:[PROVENANCE,'Retrospectively compiled at '+dates.anchor,row.description,row.remediation_plan,
        tasks.find(task => task.task_id === row.primary_task_id).resolution,'Action completion and separate fictional validation: '+row.validated_at]})),
    ...tasks.filter(row => row.risk_id).map(row => ({key:'history_'+row.task_id,linked_type:'task',linked_id:row.task_id,
      relationships:[{kind:'risks',id:row.risk_id}],content_outline:[PROVENANCE,row.description,row.resolution,
        'Action completed: '+row.completed_at+'; Risk closure remains its separate original decision.']}))],
    verification_basis:assessments.map(row => ({assessment_id:row.framework_assessment_id,definition_id:row.definition_id,
      at:row.last_saved,by:row.assessed_by,verification:row.verification,criteria_ids:copy(row.cis_assessment_criteria),
      question_version:row.guided_assessment_source.version,evidence_check:krustySafeguardContent(row.definition_id,'addressed').evidence_check,provenance:PROVENANCE})),
    reporting_seeded:!!db.cis_demo_scenario_history?.[CID]};
}

function firstFullyImplemented(assessments) {
  const events = assessments.flatMap(row => row.assessment_history.map(event => ({...event,id:row.framework_assessment_id})))
    .sort((a,b) => a.at.localeCompare(b.at));
  const statuses = new Map();
  for (let index = 0;index < events.length;index++) {
    const event = events[index];statuses.set(event.id,event.status);
    if (events[index+1]?.at === event.at) continue;
    if (statuses.size === assessments.length && [...statuses.values()].every(status => status === 'addressed')) return event.at;
  }
  return null;
}

// Explicit unused source factory. All work is staged; retained histories and
// unrelated clients are never reset by this import or by ordinary navigation.
export function seedKrustyHistory(db, options) {
  const input = inputs(db,options), {dates,operations} = options;
  if (input.reviews.every(row => row.fixture_history_version === VERSION && row.fixture_history_anchor === dates.anchor)) {
    if (!db.cis_demo_scenario_history?.[CID] || input.assessments.some(row => !row.assessment_history?.length)
      || input.reviews.some(row => JSON.stringify((row.occurrences || []).map(occurrence => occurrence.due_date))
        !== JSON.stringify(input.volume.reviews.find(plan => plan.review_id === row.review_id).due_dates)))
      reject('a partial retained history must not be treated as a complete repeat.');
    return result(db,input,dates);
  }
  if (input.reviews.some(row => row.occurrences?.length || row.fixture_history_version)
    || input.assessments.some(row => row.assessment_history?.length) || mine(db,'findings').length
    || mine(db,'tasks').some(row => !operations.tasks.some(task => task.task_id === row.task_id))
    || db.portfolio_reporting?.snapshots?.some(row => row.client_id === CID) || db.cis_demo_scenario_history?.[CID])
    reject('requires fresh complete source records; retained history must not be reset.');
  const staged = {...db};
  for (const kind of Object.keys(IDS)) staged[kind] = (db[kind] || []).map(row => row.client_id === CID ? copy(row) : row);
  staged.cis_demo_scenario_history = copy(db.cis_demo_scenario_history || {});
  const work = {...input,assessments:mine(staged,'framework_assessments'),reviews:mine(staged,'reviews'),gaps:[],uncertainties:[]};
  assessmentHistory(work.assessments,dates,input.origin,input.account);
  reviewHistory(staged,work,dates,operations);
  remediation(staged,work,dates);
  reconcileHistoricalGaps(work);
  riskHistory(staged,work,operations);
  currentBasis(work.assessments);
  programHistory(staged,work,dates);
  for (const review of work.reviews) for (const occurrence of review.occurrences) {
    for (const snapshot of occurrence.requirement_snapshot || []) {
      const assessment = work.assessments.find(row => row.definition_id === snapshot.definition_id);
      snapshot.status = assessment.assessment_history.filter(event => event.at <= occurrence.completed_at).at(-1)?.status || 'not_assessed';
      snapshot.owner_id = assessment.owner_id; snapshot.process_owner_id = assessment.process_owner_id;
    }
    log(staged,'reviews',review,occurrence.completed_at,input.account,'Review completed',
      {occurrence_id:occurrence.occurrence_id,outcome:occurrence.outcome,finding_count:occurrence.finding_count});
  }
  for (const row of work.assessments) {
    let previous;
    for (const event of row.assessment_history) {
      if (event.status !== previous && event.status !== 'not_assessed') log(staged,'framework_assessments',row,event.at,input.account,'Framework assessment updated',{status:event.status});
      previous = event.status;
    }
  }
  for (const finding of mine(staged,'findings')) {
    log(staged,'findings',finding,finding.created_at,input.actor,'Finding raised');
    log(staged,'findings',finding,finding.validated_at,input.actor,'Finding validated and closed');
  }
  for (const task of mine(staged,'tasks').filter(row => row.task_id.startsWith(PREFIX))) {
    log(staged,'tasks',task,task.created_at,input.actor,'Action Item created');
    log(staged,'tasks',task,task.started_at,input.account,'Work started');
    log(staged,'tasks',task,task.completed_at,input.account,'Action Item completed');
    validateAssignment(staged,'tasks',task);
  }
  for (const kind of Object.keys(IDS)) {
    const fields = kind === 'logs' ? ['audit_id','log_id'] : [IDS[kind]];
    const targetIds = mine(staged,kind).flatMap(row => fields.map(field => row[field]).filter(Boolean));
    if (new Set(targetIds).size !== targetIds.length || (db[kind] || []).some(row => row.client_id !== CID && fields.some(field => targetIds.includes(row[field]))))
      reject('a generated native or audit identity collides with retained data.');
  }
  const occurrenceIds = work.reviews.flatMap(row => row.occurrences.map(occurrence => occurrence.occurrence_id));
  if (new Set(occurrenceIds).size !== occurrenceIds.length || (db.reviews || []).some(row => row.client_id !== CID
    && (row.occurrences || []).some(occurrence => occurrenceIds.includes(occurrence.occurrence_id))))
    reject('a generated occurrence identity collides with retained history.');
  if (mine(staged,'logs').some(row => !scheduledDate(row.at) || row.at > dates.anchor)) reject('source audits must retain real nonfuture dates.');
  if (work.reviews.reduce((sum,row) => sum+row.occurrences.length,0) !== input.volume.counts.planned_past_periods)
    reject('materialized periods must equal the complete qualified native volume plan.');
  if (!seedCisScenarioHistory(staged,input.client,new Date(dates.anchor),{version:CIS_SHOWCASE_VERSION}))
    reject('reporting must derive once from the actual dated assessment history.');
  for (const [kind,field] of Object.entries(IDS)) {
    const existing = new Map((db[kind] || []).map(row => [row[field] || (kind === 'logs' ? row.log_id : null),row]));
    for (const row of mine(staged,kind)) {
      const id = row[field] || (kind === 'logs' ? row.log_id : null);
      if (existing.has(id)) Object.assign(existing.get(id),row); else {db[kind] ||= []; db[kind].push(row);}
    }
  }
  db.portfolio_reporting = staged.portfolio_reporting; db.cis_demo_scenario_history = staged.cis_demo_scenario_history;
  return result(db,input,dates);
}
