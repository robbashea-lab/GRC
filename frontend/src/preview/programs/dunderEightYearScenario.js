import iso from '@catalogs/iso27001.json';
import onboarding from '@catalogs/onboardingCatalog.json';
import criteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
import {saveBaseline, baselineRecordVersions} from '../baseline';
import {syncPolicyReview} from '../policyReviews';
import {captureDemoReporting} from '../portfolioReporting';
import {aiRequest} from '../aiGovernance';
import {prepareDunderNativeOnboarding} from './dunderNativeOnboarding';
import {DUNDER_EIGHT_YEAR_PLAN as plan} from './dunderEightYear';
import {DUNDER_CURRENT_ASSESSMENTS} from './dunderEightYearContent';
import {addDunderRegisters} from './dunderEightYearRegisters';
import {addDunderOperatingHistory, addDunderAuditHistory} from './dunderEightYearHistory';
import {consolidateDunderArtifacts} from './dunderEightYearArtifacts';
import {registerDunderDemoArtifacts} from '../dunderDemoEvidence';
import {registerDunderModeledHistory, registerDunderPreparedHistory} from './dunderPreparedHistory';
import {DUNDER_ID as CID, DUNDER_SCENARIO_VERSION as VERSION, EIGHT_YEAR_ANCHOR, EIGHT_YEAR_START, at, copy, fixtureId, assessmentAt, dunderFixtureTools} from './isoSocEightYearSupport';

const person = index => `${CID}_user_${index}`;
const firstDue = {'iso-internal-audit':'10-22', 'iso-management-review':'10-16',
  'iso-risk-assessment':'10-09', 'iso-objective-review':'10-16', 'iso-soa-review':'10-02',
  'iso-corrective-review':'10-23', 'iso-policy-review':'10-02', 'iso-user-access':'01-15',
  'iso-vendor':'10-22', 'iso-awareness':'09-10'};

const policyRules = {
  'policy-information-security-policy': 'David funds the Scranton ISMS; Dwight records risk and exceptions; Pam publishes controlled versions. Staff report suspected disclosure to the service desk and preserve source records.',
  'policy-risk-management-policy': 'Owners rate current likelihood and impact using the existing five-by-five method. Treatment, review and time-limited acceptance are separate decisions; closure requires its own reason and retained evidence.',
  'policy-access-control-identity-management-policy': 'HR sponsors joiner, mover and leaver tickets. IT grants named ERP and Microsoft 365 roles after owner authorization; privileged accounts use MFA and are reviewed quarterly against employment and service inventories.',
  'policy-acceptable-use-policy': 'Managed office devices and approved remote access support customer work. Staff protect customer pricing, lock screens, avoid personal file stores and report lost devices before further access is granted.',
  'policy-change-management-policy': 'ERP and warehouse changes record impact, approval, testing, rollback and an owner. Emergency changes retain the reason and receive subsequent review; suppliers cannot release directly into production without authorization.',
  'policy-vendor-third-party-risk-management-policy': 'A service owner records information access, dependency and contract notices before onboarding. Security assurance, annual service review and renewal are distinct records; offboarding includes access revocation, return and destruction evidence.',
  'policy-data-classification-handling-policy': 'Customer prices, payroll and contract terms require restricted named groups. Approved transfer channels and recipient checks protect exports; demonstration and AI inputs exclude live payroll and bank details.',
  'policy-data-retention-secure-disposal-policy': 'Finance and HR own the retention schedule. Paper destruction is witnessed through the storage supplier; device disposal requires erasure evidence. Legal holds suspend deletion and retain the authorizing decision.',
  'policy-asset-management-policy': 'Darryl reconciles warehouse scanners with purchasing and network observations; IT reconciles managed laptops and servers. Each asset has a custodian, business purpose and return or disposal record.',
  'policy-vulnerability-patch-management-policy': 'IT reviews vendor notices and device findings, prioritizes exposed services and verifies deployment. Unsupported warehouse equipment uses documented segmentation and a funded replacement plan rather than silent patch exceptions.',
  'policy-configuration-management-policy': 'Approved endpoint, server and network baselines restrict administration and unnecessary services. Deviations need an owner and review date; configuration drift is checked against the authorized change record.',
  'policy-security-awareness-training-policy': 'Pam coordinates induction, annual refreshers and role-specific warehouse, HR and finance training. Missed assignments receive named follow-up; simulated phishing results inform coaching without claiming absence of real attacks.',
  'policy-incident-response-policy': 'Staff report suspected events promptly. Dwight coordinates triage, containment, evidence preservation, customer obligations and recovery; post-incident review assigns improvements without erasing the original timeline.',
  'policy-cryptography-key-management-policy': 'Managed laptop encryption and approved transport protect business information. Privileged recovery keys use restricted escrow; certificate and key changes retain authorization, expiry tracking and revocation responsibility.',
  'policy-business-continuity-disaster-recovery-policy': 'Sales, warehouse and IT maintain order-service dependencies and a four-hour recovery target. Exercises include ERP, WMS, labels and shipping; manual dispatch is tested separately from technical restoration.',
  'policy-backup-restoration-policy': 'IT monitors protected ERP and WMS backups, reconciles failures and tests application-consistent restoration. Immutable retention and separate recovery credentials limit compromise; a green backup job alone is not restore evidence.',
  'policy-physical-environmental-security-policy': 'Darryl controls visitor entry, warehouse keys and equipment areas. Flood, power and fire preparations protect order operations; escorted maintenance, periodic access checks and secure media handling retain accountable records.',
};

const historicalPolicyRules = {
  'policy-information-security-policy':'Michael sponsors the initial Scranton security program. Dwight maintains the security issue register; Pam distributes the approved instructions and staff report suspected disclosure to their manager.',
  'policy-risk-management-policy':'Sales, warehouse, Finance and IT record plausible threats, consequences and current safeguards in the initial risk workbook. Named owners track treatment and management records acceptance separately.',
  'policy-access-control-identity-management-policy':'HR emails authorized joiner and leaver notices to IT. Named Dynamics GP and Office 365 accounts require business-owner approval; privileged access is separately listed and reviewed against employment records.',
  'policy-acceptable-use-policy':'Staff use approved office computers and remote access for customer work, lock unattended screens and keep pricing files in the company file share. Lost equipment is reported to IT and the manager.',
  'policy-change-management-policy':'Server and Dynamics GP changes need an owner, impact review, test and rollback plan. The change log retains approval and emergency-change reasons before subsequent review.',
  'policy-vendor-third-party-risk-management-policy':'Procurement records supplier services, authorized information use and notice dates. Owners review performance and security evidence separately from commercial renewal and retain termination instructions.',
  'policy-data-classification-handling-policy':'Customer pricing, employee records and signed contracts use restricted folders and recipient checks. Staff verify authorized transfer destinations and keep payroll outside general sales folders.',
  'policy-data-retention-secure-disposal-policy':'Finance and HR maintain paper and electronic retention instructions. Legal holds suspend disposal; paper destruction receipts and equipment-erasure records are retained with the authorizing owner.',
  'policy-asset-management-policy':'IT lists office computers and servers in the asset workbook. Warehouse management separately records scanners and label printers, with custodians, return dates and reconciliation exceptions.',
  'policy-vulnerability-patch-management-policy':'IT reviews vendor security notices, records priority and verifies approved patches. Warehouse compatibility exceptions require named authorization, isolation and a dated replacement decision.',
  'policy-configuration-management-policy':'IT documents approved server, laptop and network settings. Changes and deviations need a named owner; unused services and unnecessary administrator access are removed after review.',
  'policy-security-awareness-training-policy':'Pam coordinates starter security briefings and annual staff refreshers. Finance receives payment-change fraud guidance; warehouse staff receive device custody and visitor instructions. Missed briefings remain assigned work.',
  'policy-incident-response-policy':'Staff report suspected security events to IT and Dwight. The event log retains triage, containment, evidence custody, communications and recovery decisions; lessons produce separate assigned actions.',
  'policy-cryptography-key-management-policy':'Approved laptop encryption and protected remote connections safeguard business information. IT restricts recovery-key access, tracks certificate expiry and records authorized key changes.',
  'policy-business-continuity-disaster-recovery-policy':'Sales and warehouse document priority orders and a manual dispatch fallback. IT lists ERP and warehouse dependencies and schedules a timed recovery exercise; incomplete restoration evidence remains a gap.',
  'policy-backup-restoration-policy':'IT monitors backup-job results and documents failure follow-up. Scheduled restoration tests must check business dependencies; successful job logs alone do not demonstrate service recovery.',
  'policy-physical-environmental-security-policy':'Warehouse management records key holders, escorts visitors and restricts equipment areas. Fire, power and local flooding preparations are reviewed with shipping continuity and safe equipment handling.',
};

function addPolicies(db, tools) {
  const {addReview, addEvidence, addLog} = tools;
  const actor = db.user, approver = db.contacts.find(contact => contact.client_id === CID && contact.name === 'David Wallace');
  if (!approver) throw new Error('Dunder executive Contact is required');
  for (const policy of db.policies.filter(row => row.client_id === CID)) {
    const rule = policyRules[policy.baseline_key];
    if (!rule) throw new Error('Every selected Dunder document needs its own operating content');
    Object.assign(policy, {created_at: EIGHT_YEAR_START, created_by: person(2), owner_id: person(2),
      presence: 'verified_existing', status: 'approved', version: '5.0', summary: rule,
      approver_contact_id: approver.contact_id, approval_account_id: actor.user_id,
      verified_at: at('2026-09-25'), verified_by: actor.user_id, updated_at:at('2026-09-25'), approval_history: [], review_history: []});
    for (const [version, day, change] of [
      ['1.0','2018-11-09','Initial controlled operating instructions; spreadsheet and ticket evidence retained.'],
      ['3.0','2022-09-23','Staff replacement and MSP handover responsibilities reconciled; prior versions retained.'],
      ['5.0','2026-09-25','Current service ownership and validated operating evidence reaffirmed; separate optional improvements remain.'],
    ]) {
      const historicalRule = historicalPolicyRules[policy.baseline_key];
      const versionRule = version === '5.0' ? rule : version === '3.0' ? historicalRule.replace('Office 365','Microsoft 365') : historicalRule;
      const subject = {subject_id: fixtureId('subject', `${policy.baseline_key}_${version}`), captured_at: at(day),
        client_id: CID, policy_id: policy.policy_id, title: policy.title, version,
        summary: `${versionRule} ${change}`, owner_id: person(2),
        named_approver: {contact_id: approver.contact_id, name: approver.name},
        basis: {type: 'external', reference: `https://documents.dundermifflin.example.test/isms/${policy.baseline_key}/${version}`,
          document_version: version, verification: 'Reference recorded; external bytes not verified'}};
      const request = fixtureId('approval', `${policy.baseline_key}_${version}`);
      const event = {at: at(day), by: actor.user_id, by_name: actor.name, by_email: actor.email,
        approval_request_id: request, subject: copy(subject)};
      policy.approval_history.push({...event, action: 'submitted'}, {...copy(event), action: 'approved',
        authority: 'internal_administrative', comment: `Synthetic recorded approval with David Wallace as named business approver. ${change}`});
      Object.assign(policy, {approval_subject: copy(subject), approval_request_id: request,
        approval_source: {version, external_reference: subject.basis.reference, external_version: version}, approved_at: at(day)});
      addLog('policies', policy.policy_id, day, actor.user_id, 'approved', {version, subject_id: subject.subject_id});
    }
    const review = addReview({key: 'policy_' + policy.baseline_key, title: policy.title + ' — annual document review',
      review_type: 'policy', policy_id: policy.policy_id, owner_id: person(2), recurrence: 'annual',
      due_date: '2019-10-02', created_at: '2018-11-09',
      governance_context: {category: 'organizational', cadence_source: 'organization_defined', cadence_rationale: 'Annual document review and review after material changes; review does not approve a new version.'},
      notesAt: when => {
        const subject = policy.approval_history.filter(entry => entry.action === 'approved' && entry.at <= when).at(-1)?.subject;
        if (!subject) throw new Error('Policy Review must name an effective historical subject');
        return `Reviewed effective version ${subject.version}, subject ${subject.subject_id}. ${subject.summary} No approval is created by this Review.`;
      }});
    policy.review_history = review.occurrences.map(occurrence => {
      const subject = policy.approval_history.filter(entry => entry.action === 'approved' && entry.at <= occurrence.completed_at).at(-1).subject;
      return {review_id: review.review_id, occurrence_id: occurrence.occurrence_id, completed_at: occurrence.completed_at,
        completed_by: occurrence.completed_by, subject_id: subject.subject_id, version: subject.version};
    });
    syncPolicyReview(db, review);
  }
  const backup = db.policies.find(row => row.client_id === CID && row.baseline_key === 'policy-backup-restoration-policy');
  addEvidence({key: 'current-backup-policy', title: 'Backup and restoration policy — controlled demonstration extract',
    linked_type: 'policy', linked_id: backup.policy_id, at: '2026-09-25', owner: person(2),
    content: `${backup.summary}\nDocument version 5.0. This extract supports inspection; the recorded approval basis remains the separately identified external subject.`});
  for (const [key, title, summary, owner] of [
    ['ai-guide','AI assistance operating guide — optional consolidation','Draft consolidates existing approved data-handling and human-review instructions; no new AI use or permission is authorized by this draft.',person(2)],
    ['shipping-playbook','Alternate shipping playbook — optional resilience improvement','Draft documents an additional delivery route beyond the tested existing manual dispatch procedure. Current service recovery remains effective.',null],
  ]) db.policies.push({policy_id: fixtureId('policy', key), client_id: CID, title, summary, version: '0.3',
    status: 'draft', presence: 'verified_existing', owner_id: owner, created_at: at('2026-10-12'),
    created_by: person(2), updated_at: at('2026-10-26'), approval_history: []});
}

function populateAssessments(db, tools) {
  const rows = db.framework_assessments.filter(row => row.client_id === CID);
  const transitionGaps = {
    'A.8.13': 'The 2023 recovery correction remains retained. A March 2024 label-gateway change introduced a new WMS integration dependency whose backup and full restoration sample is not yet validated. A joint retest and independent check are required.',
    'A.8.16': 'Defender alerts reach the MSP queue, but the Scranton escalation sample lacks a named alternate during staff absence. The monitoring procedure and an independently witnessed escalation test remain open.',
    'A.5.30': 'The March 2024 label-gateway change requires an updated order-service dependency plan and validation sample. The original 2023 correction remains valid for its old scope; the changed integration still needs a joint exercise and independent check.',
  };
  if (rows.length !== 123 || Object.keys(DUNDER_CURRENT_ASSESSMENTS).length !== 123) throw new Error('Exact native ISO catalog coverage is required');
  for (const row of rows) {
    const content = DUNDER_CURRENT_ASSESSMENTS[row.definition_id];
    if (!content?.implementation?.trim()) throw new Error('A native assessment is missing specific content');
    const excluded = content.soa_applicability === 'excluded';
    const owner = ['5.1','5.2','5.3','6.2','7.1','9.3.1','9.3.2','9.3.3'].includes(row.definition_id) ? person(1) : row.definition_id.startsWith('A.6.') || row.definition_id.startsWith('7.') ? person(2) : person(0);
    const checks = criteria.requirements[row.definition_id];
    Object.assign(row, {created_at: at('2024-03-18'), owner_id: owner, process_owner_id: db.contacts.find(contact => contact.client_id === CID && contact.linked_user_id === owner)?.contact_id || null,
      na_rationale: '', assessment_history: []});
    for (const day of ['2024-03-18','2024-09-20','2025-09-26','2026-09-25']) {
      const gap = day === '2024-03-18' && transitionGaps[row.definition_id];
      const fields = {...copy(content), status: excluded ? 'not_applicable' : gap ? 'in_progress' : 'addressed',
        implementation: gap || content.implementation, owner_id: owner, process_owner_id: row.process_owner_id,
        na_rationale: excluded ? content.soa_justification : '',
        iso_assessment_checks: excluded || gap || checks?.coverage !== 'verified' ? [] : checks.criteria.map(item => item.id)};
      Object.assign(row, fields, {last_assessed: at(day), last_saved: at(day), updated_at:at(day), assessed_by: owner});
      row.assessment_history.push({...copy(fields), related_links: copy(row.related_links), at: at(day), by: owner});
      tools.addLog('framework_assessments', row.framework_assessment_id, day, owner, 'Framework assessment updated', {status: fields.status, changed_fields: ['implementation','status','iso_assessment_checks']});
    }
  }
}

function governanceReviewNotes(key,when,title) {
  const year=when.slice(0,4);
  const measurements={2024:['96%','99%','3h 55m'],2025:['97%','99.5%','3h 41m'],2026:['98%','100%','3h 32m']}[year];
  const objectives=`Targets: at least 95% of critical endpoint patches within 14 days; at least 98% timely annual awareness completion; complete order-service recovery within four hours. ${year} retained results: patching ${measurements[0]}, awareness ${measurements[1]}, recovery ${measurements[2]}. Dwight owns patching and recovery, Pam owns awareness. Sources: reconciled device/patch export, HR-to-training assignment list and timed ERP/WMS/label restoration sample. These are organization-selected objectives, not universal ISO numeric requirements.`;
  if(key==='iso-objective-review')return objectives;
  if(key==='iso-management-review')return `Participants: David Wallace, Michael Scott, Dwight Schrute, Pam Beesly, Oscar Martinez and Sam Okafor. Reviewed prior actions, changing context/customer commitments, relevant flood/climate issues, monitoring, supplier performance, risk/treatment, audit findings and objective achievement. ${objectives} `
    + (year==='2024'?'Decisions: retain the validated 2023 dependency correction, accept the independently validated September 2024 label-gateway/monitoring corrections, maintain the MSP retainer and protected backup retention. Prior nonconformities close only after independent validation.':year==='2025'?'Decisions: retain the restricted AI pilots and human source checks, renew the service arrangement after assurance review and require continued access and recovery sampling. Supplier concentration remains a separate residual-risk decision.':'Decisions: retain the tested current recovery arrangement and fund the optional alternate-shipping exercise. Consolidate the existing approved AI instructions without changing permitted use. Follow-up Actions are the separately saved supplier refresh, optional shipping exercise and AI editorial work; none is a missing mandatory implementation control.');
  const milestone=[...plan.milestones].reverse().find(item=>item.date<=when.slice(0,10));
  return `${year} ${title}. ${milestone?.narrative||plan.milestones[0].narrative} Current supported ISO catalog; implementation, audit completion and risk decisions remain separate.`;
}

function addProgramReviews(db, tools) {
  const native = db.reviews.filter(row => row.client_id === CID);
  db.reviews = db.reviews.filter(row => row.client_id !== CID);
  for (const original of native) {
    const key = original.framework_plan_key;
    const soa = key === 'iso-soa-review';
    const due = key === 'iso-user-access' ? '2024-04-15' : `2024-${firstDue[key]}`;
    const {occurrences, ...base} = original;
    const review = tools.addReview({...base, key, created_at: '2024-03-18',
      due_date: due, owner_id: key === 'iso-management-review' ? person(1) : key === 'iso-awareness' || key === 'iso-policy-review' ? person(2) : person(0),
      recurrence: key === 'iso-user-access' ? 'quarterly' : 'annual',
      ...(key === 'iso-internal-audit' ? {status:'cancelled',ends_at:'2024-03-18',cancelled_at:'2024-03-18'} : {}),
      governance_context: {category: 'organizational', cadence_source: 'organization_defined', cadence_rationale: 'Dunder selected this operating cadence; no universal ISO annual or quarterly obligation is asserted.'},
      notesAt: when => governanceReviewNotes(key,when,original.title),
      snapshotAt: soa ? when => ({iso_soa_snapshot: {
        assessments: db.framework_assessments.filter(row => row.client_id === CID && row.definition_id.startsWith('A.')).map(row => assessmentAt(row, when)),
        profile: dunderProfileAt(db,when), captured_at: when}}) : when=>({
          conclusion:governanceReviewNotes(key,when,original.title),tested_scope:plan.business.scope,tested_period:when.slice(0,4)})});
    if (key === 'iso-internal-audit') Object.assign(review, {
      notes: 'Historical ISMS audit-coordination record replaced prospectively by the native four-package program in March 2024; prior completed work retained.'});
    if(['iso-management-review','iso-objective-review'].includes(key))review.notes=review.occurrences.at(-1).notes;
  }
  for (const [key, title, specification] of [['isms-implementation','ISMS requirements — annual implementation review','isms_clause'],['annex-implementation','Included Annex A — annual implementation review','annex_control']]) {
    const rows = db.framework_assessments.filter(row => row.client_id === CID && iso.requirements.find(definition => definition.id === row.definition_id)?.specification === specification);
    const review = tools.addReview({key, title, review_type:'requirements', owner_id:person(0), recurrence:'annual', due_date:'2024-10-04', created_at:'2024-03-18',
      framework_key:'iso-27001', framework_safeguards: rows.map(row => row.definition_id),
      notesAt: when => `${when.slice(0,4)} implementation review of ${rows.length} native records. Each saved assessment retains its own narrative, criteria checks, actor and date. Exclusions are SoA decisions, not implemented controls.`,
      governance_context:{category:'organizational',cadence_source:'organization_defined',cadence_rationale:'Annual organization-selected review and review after material changes.'}});
    for (const row of rows) row.related_links.push({kind:'reviews',id:review.review_id});
  }
}

function dunderProfileAt(db,when) {
  const profile=copy(db.clients.find(row=>row.client_id===CID).profile);
  profile.organization.insurance_renewal=`${Number(when.slice(0,4))+1}-02-10`;
  if(when<at('2024-09-20'))Object.assign(profile.security,{disaster_recovery:'Partial',restoration:'Partial'});
  if(when<at('2026-10-30'))profile.security.ai_governance='Partial';
  return profile;
}

function captureDunderPositions(db) {
  const finalRows = db.framework_assessments.filter(row => row.client_id === CID);
  let prior = null;
  for (const day of ['2024-03-18','2024-09-20','2025-09-26','2026-09-25']) {
    const historical = {...db, clients: db.clients.filter(row => row.client_id === CID),
      framework_assessments: db.framework_assessments.filter(row => row.client_id !== CID).concat(finalRows.map(row => assessmentAt(row, day))),
      portfolio_reporting: prior?.portfolio_reporting || {}};
    captureDemoReporting(historical, prior, at(day));
    prior = historical;
  }
  const history = prior.portfolio_reporting;
  db.portfolio_reporting = {...db.portfolio_reporting,
    snapshots: [...(db.portfolio_reporting?.snapshots || []), ...history.snapshots],
    identities: [...(db.portfolio_reporting?.identities || []), ...history.identities],
    scope_events: [...(db.portfolio_reporting?.scope_events || []), ...history.scope_events]};
}

function addDunderAIIntake(db) {
  if (db.ai_intake != null && (typeof db.ai_intake !== 'object' || Array.isArray(db.ai_intake))) throw new Error('Dunder AI intake requires the native client map');
  if (Object.hasOwn(db.ai_intake || {}, CID)) throw new Error('Replace the prior Dunder AI intake before installing the fresh source');
  const auditId = fixtureId('log', 'ai-intake');
  if (db.logs.some(row => row.audit_id === auditId || row.log_id === auditId)) throw new Error('Dunder AI intake audit identity collides with retained history');
  const scoped = {...db, ai_intake: {...db.ai_intake}, logs: [...db.logs]};
  // Organization disclosure is independent of system screening and approval.
  const intake = aiRequest(scoped, '/ai-intake', 'post', {}, {client_id: CID, usage: 'yes',
    indicators: ['Third-party AI tools internally'], expected_updated_at: null});
  intake.updated_at = EIGHT_YEAR_ANCHOR;
  const receipt = scoped.logs[0];
  Object.assign(receipt, {audit_id: auditId, at: EIGHT_YEAR_ANCHOR,
    meta: {...receipt.meta, source: 'Fictional Dunder organization AI-use declaration through the native intake service'}});
  db.ai_intake = scoped.ai_intake;
  db.logs = scoped.logs;
}

// Called only by an explicit fresh canonical import; never by normal reads or saves.
export function createDunderEightYearCandidate(source, {clock}) {
  if (source.clients.find(row => row.client_id === CID)?.demo_program_version === VERSION) return {db: source, installed: false};
  if (new Date(clock).toISOString().slice(0,10) !== EIGHT_YEAR_ANCHOR.slice(0,10)) throw new Error('Use the backed-up eight-year scenario anchor');
  const {db, backup} = prepareDunderNativeOnboarding(source, {clock, purpose:'native_onboarding_qa'});
  const selected = iso.policy_mappings.map(mapping => mapping.policy_key);
  const state = {version:3,step:3,selected_policy_keys:selected,policies:Object.fromEntries(selected.map(key => [key,'yes'])),reviews:[],
    requirements:Object.fromEntries(onboarding.requirements.map(row => [row.key,row.key === 'iso-27001' ? 'applies' : 'does_not_apply'])),
    framework_reviews:Object.fromEntries(iso.review_plans.map(row => [row.key,{enabled:true,recurrence:row.key === 'iso-user-access'?'quarterly':'annual',due_date:'2027-'+firstDue[row.key]}]))};
  saveBaseline(db,CID,state,true,{expected_updated_at:null,expected_records:baselineRecordVersions(db,CID)});
  // These are imported synthetic source records, not claimed browser executions in 2018.
  const client = db.clients.find(row => row.client_id === CID), tools = dunderFixtureTools(db);
  db.logs = db.logs.filter(row => row.client_id !== CID);
  db.baselines[CID].updated_at = EIGHT_YEAR_ANCHOR;
  client.onboarding_baseline = copy(db.baselines[CID]);
  client.initial_program_baseline = {...client.initial_program_baseline, completed_at:EIGHT_YEAR_ANCHOR, state:copy(db.baselines[CID])};
  Object.assign(client, {demo_program_version:VERSION, notes:'DEMO - SYNTHETIC DATA. Eight-year ISMS operating history, 2018-11-02 through 2026-11-02. Current supported ISO assessments begin March 2024. Implementation is not certification or independent assurance.'});
  Object.assign(client.profile.security,{disaster_recovery:'Implemented',restoration:'Implemented',ai_governance:'Implemented'});
  populateAssessments(db,tools);
  addProgramReviews(db,tools);
  addPolicies(db,tools);
  addDunderRegisters(db,tools);
  addDunderAIIntake(db);
  addDunderOperatingHistory(db,tools);
  addDunderAuditHistory(db,tools);
  db.logs = [...db.logs.filter(row=>row.client_id===CID).sort((a,b)=>b.at.localeCompare(a.at)),...db.logs.filter(row=>row.client_id!==CID)];
  captureDunderPositions(db);
  registerDunderPreparedHistory(db);
  registerDunderModeledHistory(db);
  consolidateDunderArtifacts(db);
  registerDunderDemoArtifacts(db);
  return {db,backup,installed:true,clientId:CID,anchor:EIGHT_YEAR_ANCHOR};
}
