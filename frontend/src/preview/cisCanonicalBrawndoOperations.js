import {assessedRisk} from '../lib/grcWork';
import {AI_DEFAULTS, validateAI} from '../lib/aiGovernance';
import {AI_PILOT_DEFAULTS, aiScope} from '../lib/brawndoAI';
import {applyTool, blankDraft, catalogKeys, screeningScope, detailsError} from '../lib/aiOnboarding';
import aiCatalog from '../lib/aiOnboardingCatalog.json';
import {validateCatalogKey} from '../lib/registerCatalogIdentity';
import {reviewSchedule, reviewView} from '../lib/reviewOccurrences';
import {eligible, validateAssignment} from './assignmentEligibility';
import {ensureRiskReview} from './risks';
import {allocateRiskId} from './riskIds';
import {ensureVendorReviews, validateVendor} from './vendors';
import {prepareTask} from './actionItems';
import {isCisClient} from './cisCapability';
import {aiRequest} from './aiGovernance';

const CID = 'demo_brawndo';
const PREFIX = CID + '_canonical_';
const provenance = 'Fictional Brawndo security-program history; organization-selected governance, not an additional CIS requirement or browser execution.';
const context = () => ({category:'organizational', rationale:provenance, cadence_source:'organization_defined',
  cadence_rationale:'Annual management review selected for this fictional business. Acceptance expiry, assurance follow-up and contract renewal remain separate.'});
const copy = value => JSON.parse(JSON.stringify(value));

// Each entry describes a separate exposure; ratings are judgments about this
// fictional 65-person business, not product ratings or a manufactured matrix.
const liveRisks = [
  ['dispatch', 'Single dispatch route during bridge works', 4, 4,
    'The warehouse has one approved heavy-vehicle exit. Planned bridge works could interrupt shipments from both production lines.',
    'The announced works overlap the normal dispatch week; no alternate depot is reserved.', 'A multi-day interruption would breach retailer delivery windows and consume the cash buffer.',
    'Reserve a temporary dispatch depot and rehearse the carrier handover.', 'in_progress'],
  ['asset-owners', 'Six packaging kiosk inventory rows remain incomplete', 3, 3,
    'All 79 identified assets have spreadsheet rows. Six of the ten packaging kiosks still lack a recorded hardware address or accountable business owner.',
    'Custody handovers and provider exports have not corrected the six incomplete rows.', 'Incomplete identifiers or ownership could delay incident scoping and the correct kiosk access decision.',
    'Record the six kiosk custodians and hardware addresses, then validate the updated inventory sample.', 'in_progress'],
  ['software', 'Urgent label-tool requests may bypass authorization', 3, 2,
    'Two packaging workstations need new label tools. Installation remains pending the normal software authorization decision; no unauthorized installation is asserted.',
    'Production urgency could cause a technician to bypass the documented authorization process.', 'A faulty or unsupported tool could interrupt label production on one line.',
    'Confirm business need and support status before authorizing the new label tools.', 'in_progress'],
  ['configuration', 'Inconsistent line-workstation baselines', 3, 4,
    'Configuration instructions for six line workstations are informal; exception approval and a repeatable baseline are missing.',
    'Shift technicians can apply different settings during urgent repairs.', 'A wrong setting or exposed service could stop a production line and require manual recovery.',
    'Approve the workstation baseline, capture exceptions and pilot enforcement on one line.', 'in_progress'],
  ['vulnerability-process', 'Vulnerability work has no complete decision process', 3, 4,
    'The managed provider sends patch reports, but Brawndo has not documented vulnerability intake, prioritization, ownership and exception expiry.',
    'Unowned findings can remain between the provider queue and the plant maintenance sheet.', 'A known weakness on a production-support machine could disrupt bottling or expose internal records.',
    'Document the vulnerability-management process and reconcile its first owned remediation register.', 'in_progress'],
  ['backup-dependency', 'Warehouse restore depends on one technician', 2, 4,
    'Recovery instructions for the dispatch share have been tested by one technician; an alternate operator has not performed the handover.',
    'The named technician covers both lines and is periodically unavailable.', 'Dispatch could remain stopped while a replacement operator reconstructs the restore sequence.',
    'Run an observed alternate-operator restoration and correct the dispatch runbook.', 'in_progress'],
  ['supplier-access', 'Upcoming maintenance windows need access approval', 3, 3,
    'Two upcoming supplier visits await final access-window approval. Remote support remains disabled until the plant sponsor authorizes the named technician and end date.',
    'The plant tracks visits in email and access approvals in a separate workbook; an incorrect handover could bypass the restriction.', 'An unnecessary support session could reach a production-support workstation.',
    'Approve named maintenance windows and retain the scheduled post-visit access check.', 'in_progress'],
  ['shared-mailbox', 'Role transfers could outpace mailbox review', 2, 3,
    'The orders mailbox has six authorized delegates, including an employee who retains order-handling duties after a transfer. This month’s scheduled review must confirm the new role.',
    'A late transfer notice could delay a future delegate-removal decision.', 'An unnecessary delegate could view customer orders and change dispatch instructions.',
    'Record the scheduled sales-owner recertification and reconcile the mailbox delegation list.', 'in_progress'],
  ['power', 'Common power circuit affects the dispatch desk', 2, 4,
    'The warehouse switch and dispatch printer share an unprotected power circuit; no second dispatch station is ready.',
    'Short warehouse power interruptions have occurred during maintenance.', 'Loss of shipping labels and connectivity could delay a day of outgoing orders.',
    'Confirm electrical separation and trial the documented manual dispatch fallback.', 'assessed'],
  ['water-supplier', 'Single process-water dependency', 2, 5,
    'Both production lines depend on one process-water supplier; the alternate arrangement has not been commercially agreed.',
    'The supplier normally meets demand, but the business has no reserved alternate capacity.', 'A sustained supply interruption would stop both lines and threaten large delivery commitments.',
    'Obtain an alternate supply quotation and define the production curtailment trigger.', 'assessed'],
  ['payroll', 'Payroll approval depends on one approver', 2, 3,
    'The 65-person payroll run has one authorized final approver; the holiday cover arrangement is only verbal.',
    'The monthly deadline can overlap planned leave.', 'A missed authorization could delay wages and create manual correction work.',
    'Agree an alternate approver and test the next low-value approval rehearsal.', 'assessed'],
  ['refrigeration', 'Cold-store callout escalation is untested', 2, 3,
    'Warehouse alarm contacts were updated after a staff move, but the out-of-hours contractor callout has not been exercised.',
    'A stale second-line contact could delay the response overnight.', 'Delayed response could spoil one warehouse batch and disrupt the next dispatch.',
    'Perform a planned callout test and correct escalation contacts.', 'assessed'],
  ['ai-chatgpt', 'AI maintenance drafts may contain unsafe omissions', 2, 3,
    'A proposed ChatGPT Business pilot drafts internal maintenance checklists from sanitized text. No draft is authorized as an operating instruction.',
    'Generated text can omit a plant-specific step even when source material is sanitized.', 'An unchecked checklist could cause rework or a limited line interruption.',
    'Have the plant lead assess sample drafts and approve a bounded pilot before operational use.', 'assessed'],
  ['ai-claude', 'AI marketing summaries may misstate product claims', 2, 2,
    'Claude Team summarizes approved public marketing copy; a human checks ingredient and product claims before publication.',
    'A plausible unsupported phrase can survive a quick editorial pass.', 'A corrected marketing claim would create limited rework and customer confusion.',
    'Retain source-to-summary checks and route product claims to the marketing owner.', 'assessed'],
  ['ai-copilot', 'Workspace summaries may redistribute sensitive context', 3, 3,
    'Copilot makes existing authorized tenant content easier to find. The pilot preserves approved memberships and restricted Finance groups; an inappropriate prompt or onward summary could still redistribute sensitive context.',
    'A user may include reachable confidential content unless the permitted-use restriction and human check are followed.', 'An inappropriate internal summary could disclose a bounded set of confidential or staff records.',
    'Reconfirm pilot membership and test the confidential-data restriction without expanding source permissions.', 'in_progress']
];
const acceptedRisks = [
  ['seasonal-carrier', 'Seasonal carrier capacity variation', 2, 3, 'The contracted carrier has limited peak-season spare capacity.', 'Recent delivery performance is stable with weekly capacity checks.', 'A delayed collection would affect a bounded set of orders.', 'Use the reserved second collection slot and monitor weekly capacity.'],
  ['manual-inventory', 'Spreadsheet inventory transcription errors', 2, 2, 'The small asset register remains spreadsheet-backed with a weekly reconciliation.', 'A second-person check reduces the chance of an undetected edit.', 'An isolated wrong entry would require bounded reconciliation work.', 'Retain version history and weekly signed reconciliation until the next tooling decision.'],
  ['internet', 'Brief primary internet interruption', 2, 3, 'The warehouse has one primary circuit and a tested mobile dispatch fallback.', 'The fallback covers short disruptions, although its capacity is lower.', 'Orders can continue at reduced throughput for a short interruption.', 'Retain the tested mobile fallback and escalate after the agreed outage window.'],
  ['legacy-labeler', 'Supported labeler has limited repair capacity', 1, 4, 'One supported line labeler has a longer specialist repair lead time.', 'Preventive maintenance and stocked wear parts reduce failure likelihood.', 'A rare major failure could stop one line for several days.', 'Keep spare wear parts and monitor the documented manufacturer support date.']
];
const closedRisks = [
  ['old-vpn', 'Retired supplier VPN access', 3, 3, 'A retired maintenance connection previously retained privileged access.', 'The old route and accounts were removed; a negative-access check confirmed the result.'],
  ['lost-scanner', 'Unreconciled packaging kiosk relocation', 2, 2, 'One existing packaging kiosk was moved during a line refit before its location was updated.', 'The kiosk location and custodian were confirmed and the existing asset row reconciled; no additional current asset is asserted.'],
  ['former-mailbox', 'Former employee mailbox delegation', 2, 3, 'An employee departure left an unnecessary orders-mailbox delegate.', 'Delegation was removed and the mailbox owner confirmed the post-change access list.'],
  ['backup-key', 'Backup recovery key held by one person', 2, 4, 'The dispatch recovery key had no approved alternate custodian.', 'Two authorized custodians independently demonstrated recovery using the controlled key procedure.'],
  ['stale-dns', 'Unused ordering DNS entry', 2, 2, 'A retired ordering hostname still pointed to an old service.', 'The unused entry was removed and a second person checked authoritative DNS results.'],
  ['printer-share', 'Unrestricted warehouse printer share', 3, 2, 'An old print share accepted unnecessary internal connections.', 'The share was retired and permitted dispatch printing was retested.'],
  ['old-account', 'Dormant temporary-worker account', 3, 3, 'A temporary-worker account remained enabled after its approved assignment.', 'The account was disabled and the worker roster reconciled with the identity register.'],
  ['shipping-link', 'Public dispatch spreadsheet link', 2, 3, 'A historical dispatch workbook had an unnecessary public-sharing link.', 'The link was removed and an unauthenticated access check confirmed denial.'],
  ['unsupported-tool', 'Unsupported legacy label application', 3, 2, 'An obsolete label application remained on a decommissioned workstation.', 'The device and application were retired; the replacement label workflow passed acceptance checks.'],
  ['alarm-contact', 'Obsolete first-line alarm contact', 2, 2, 'The cold-store alarm roster referenced a departed shift lead.', 'The roster was corrected and a controlled first-line notification test reached the current lead.']
];
const vendorSpecs = [
  ['m365','Microsoft 365','microsoft-365','Business Premium workspace and identity; separately licensed Copilot pilot','high',['Internal','Employee Data'],30,150],
  ['cloudflare','Cloudflare',null,'Gateway DNS policies and managed client DNS filtering for site and roaming Windows devices','high',['Operational Data'],12,100],
  ['managed-it','Electrolyte Managed IT (fictional)',null,'Endpoint/server/network and ERP support, patching, log collection, backups and controlled remote access','critical',['Privileged Access','Internal'], -7,75],
  ['openai','OpenAI',null,'Proposed managed ChatGPT Business drafting pilot; sanitized inputs only','medium',['Internal'],45,190],
  ['anthropic','Anthropic',null,'Managed Claude Team marketing-summary workspace','low',['Internal'],22,210],
  ['adp','ADP','adp','Payroll administration for 65 staff','high',['Employee Data','Financial'],60,240],
  ['quickbooks','QuickBooks Online','quickbooks-online','Bookkeeping and supplier invoice records','high',['Financial'],80,280],
  ['stripe','Stripe','stripe','Payment processing for the public ordering channel','high',['Customer Data','Financial'], -3,110],
  ['knowbe4','KnowBe4','knowbe4','Licensed awareness lesson content; HR delivers sessions and records attendance in its workbook','medium',['Employee Data'],90,300],
  ['passwords','1Password','1password','Business shared vaults with restricted support/service-credential membership; account password rules remain platform controls','high',['Credentials'],35,160],
  ['meraki','Cisco Meraki','cisco-meraki','Managed office and warehouse network equipment administration','high',['Network / System Access'],100,320],
  ['connectivity','Regional Circuit Services (fictional)',null,'Primary warehouse and office internet circuit','high',['Operational Data'],120,220],
  ['carrier','Cold Chain Express (fictional)',null,'Warehouse pallet collection and retailer delivery','medium',['Customer Data'],55,95],
  ['maintenance','LineCare Engineering (fictional)',null,'Scheduled support for the two bottling and labeling lines','medium',['Operational Data','Network / System Access'],15,65],
  ['retired','Old Electrolyte Support (fictional)',null,'Retired remote maintenance relationship','low',['No Sensitive Data'],null,null]
];

function normalizedReview(review, dates, actor, origin, terminalAt = null) {
  Object.assign(review,{created_at:origin,created_by:actor.user_id,updated_at:terminalAt||dates.instant(-2),
    current_occurrence_id:'occ_'+review.review_id,governance_context:context(),occurrences:review.occurrences||[]});
  if(terminalAt)Object.assign(review,{status:'cancelled',cancelled_at:terminalAt,cancelled_by:actor.user_id});
  Object.assign(review,reviewSchedule(review,true));
  return Object.assign(review,reviewView(review));
}

function evidenceSpecs(risks, vendors, ai) {
  return [
    ...risks.map(row=>({key:'risk_'+row.risk_id.slice(PREFIX.length),title:row.title+' — decision and treatment record',
      linked_type:'risk',linked_id:row.risk_id,relationships:[],content_outline:[row.description,row.assessment_rationale,row.treatment_plan,row.closure_note||row.acceptance_rationale||'Retain the dated owner review and treatment result.']})),
    ...vendors.map(row=>({key:'vendor_'+row.vendor_id.slice(PREFIX.length),title:row.name+' — supplier governance record',
      linked_type:'vendor',linked_id:row.vendor_id,relationships:[],content_outline:[row.service,'Record the actual reviewed scope, assurance dates and exceptions; no independent certification is asserted.',row.status==='inactive'?'Retain the offboarding and access-revocation result.':'Record contract decision and annual review separately.']})),
    ...ai.map(row=>({key:'ai_'+row.catalog_key,title:row.name+' — permitted use and screening',linked_type:'ai_system',linked_id:row.ai_system_id,
      relationships:row.related_links.map(link=>({kind:link.kind,id:link.id})),content_outline:[row.description,row.restrictions,row.oversight_notes]}))
  ];
}

function result(db) {
  const mine=kind=>db[kind].filter(row=>row.client_id===CID&&String(row[{risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',tasks:'task_id'}[kind]]).startsWith(PREFIX));
  const risks=mine('risks'),vendors=mine('vendors'),ai_systems=mine('ai_systems'),tasks=mine('tasks');
  const reviews=db.reviews.filter(row=>row.client_id===CID&&(risks.some(r=>r.risk_id===row.risk_id)||vendors.some(v=>v.vendor_id===row.vendor_id)||ai_systems.some(ai=>ai.ai_system_id===row.ai_system_id)));
  return {risks,vendors,ai_systems,reviews,tasks,
    review_origins:reviews.map(review=>({review_id:review.review_id,source_kind:review.risk_id?'risks':review.vendor_id?'vendors':'ai_systems',
      source_id:review.risk_id||review.vendor_id||review.ai_system_id,origin:review.created_at,provenance,terminal_at:review.cancelled_at||null})),
    risk_lifecycles:risks.map(risk=>({risk_id:risk.risk_id,identified_at:risk.created_at,assessed_at:risk.created_at,
      treatment_started_at:risk.status==='in_progress'?tasks.filter(task=>task.risk_id===risk.risk_id).map(task=>task.created_at).sort()[0]||risk.updated_at:null,
      accepted_at:risk.acceptance_date||null,closed_at:risk.closed_at||null,
      owner_id:risk.owner_id,closure_note:risk.closure_note||null})),evidence_specs:evidenceSpecs(risks,vendors,ai_systems)};
}

// Historical fixture authoring reuses native validation and relationship services.
// It is separate from the native browser onboarding proof owned by the installer.
export function seedBrawndoOperations(db,{dates,owner,processOwners=[],frameworkReviews=[]}={}) {
  const clients=db.clients?.filter(row=>row.client_id===CID)||[],actor=db.user;
  if(actor?.workspace_mode!=='demo'||!eligible(actor,CID)||!['super_admin','platform_admin'].includes(actor.role)
    ||clients.length!==1||clients[0].environment!=='Demo'||clients[0].status!=='active'||clients[0].archived||clients[0].archived_at
    ||clients[0].framework_settings?.['cis-ig1']?.implementation_group!==1||!isCisClient(db,CID))throw new Error('Brawndo operations require the active canonical IG1 Demo client and a permitted Demo actor.');
  const workOwner=db.users?.find(user=>user.user_id===(typeof owner==='string'?owner:owner?.user_id));
  if(!eligible(workOwner,CID)||!dates?.anchor||!['day','instant','month'].every(key=>typeof dates[key]==='function'))throw new Error('Brawndo operations require native dates and an existing eligible owner.');
  if(frameworkReviews.some(review=>review.client_id!==CID))throw new Error('Framework Review belongs to another client.');
  const existing=['risks','vendors','ai_systems'].map(kind=>(db[kind]||[]).filter(row=>row.client_id===CID));
  if(existing.some(rows=>rows.length)) {
    const saved=result(db);
    const expected=[...liveRisks,...acceptedRisks,...closedRisks].map(row=>PREFIX+'risk_'+row[0]);
    if(existing.map(rows=>rows.length).join(',')!=='29,15,3'||saved.risks.length!==29||saved.vendors.length!==15||saved.ai_systems.length!==3
      ||expected.some(id=>!saved.risks.some(row=>row.risk_id===id))
      ||vendorSpecs.some(row=>!saved.vendors.some(vendor=>vendor.vendor_id===PREFIX+'vendor_'+row[0]))
      ||['chatgpt','claude','m365'].some(key=>!saved.ai_systems.some(ai=>ai.ai_system_id===PREFIX+'ai_'+key)))
      throw new Error('Replace the prior Brawndo fixture explicitly before installing operations.');
    return saved;
  }
  if(db.ai_intake!=null&&(typeof db.ai_intake!=='object'||Array.isArray(db.ai_intake)))throw new Error('Brawndo AI intake requires the native client map.');
  if(Object.hasOwn(db.ai_intake||{},CID))throw new Error('Replace the prior Brawndo AI intake explicitly before installing operations.');
  const intakeAuditId=PREFIX+'ai_intake';
  if((db.logs||[]).some(row=>row.audit_id===intakeAuditId||row.log_id===intakeAuditId))throw new Error('Brawndo AI intake audit identity collides with a retained event.');
  const scoped={...db,ai_intake:{...db.ai_intake},logs:[...(db.logs||[])],
    ...Object.fromEntries(['risks','vendors','ai_systems','reviews','tasks'].map(kind=>[kind,[...(db[kind]||[])]]))};
  const owners=[workOwner,...(Array.isArray(processOwners)?processOwners: Object.values(processOwners)).map(value=>db.users.find(user=>user.user_id===(typeof value==='string'?value:value?.user_id))).filter(user=>eligible(user,CID))];
  const origin=dates.month(-18)+'T00:00:00.000Z',counter={risks:[],riskSequences:{[CID]:0}};
  const riskRows=[...liveRisks,...acceptedRisks.map(row=>[...row,'accepted']),...closedRisks.map(([key,title,l,i,description,closure])=>[key,title,l,i,description,'The original exposure was credible before the documented correction.','The original consequence remains in the historical score.',closure,'closed'])];
  for(const [index,spec] of riskRows.entries()) {
    const [key,title,likelihood,impact,description,likelihoodReason,impactReason,plan,status]=spec;
    const assigned=owners[index%owners.length],closedAt=status==='closed'?dates.instant(-300+(index-19)*22):null;
    const risk=assessedRisk({risk_id:PREFIX+'risk_'+key,display_id:allocateRiskId(counter,CID),client_id:CID,title,
      description:'Fictional Brawndo: '+description,category:'operational',source_type:'manual',status,owner_id:assigned.user_id,
      likelihood_score:likelihood,impact_score:impact,likelihood_rationale:likelihoodReason,impact_rationale:impactReason,
      assessment_rationale:'Fictional owner assessment. '+likelihoodReason+' '+impactReason,treatment:status==='accepted'?'accept':'mitigate',treatment_plan:plan,
      created_at:origin,created_by:actor.user_id,date_identified:origin.slice(0,10),updated_at:closedAt||dates.instant(-8),
      last_reviewed:closedAt?.slice(0,10)||dates.day(-8),next_review:status==='closed'?null:dates.day(index===2?-7:15+index*9),
      review_cadence:'annual',related_task_ids:[],related_finding_ids:[],rating_history:[],decision_history:[]});
    if(status==='accepted') {
      const rationale='Fictional time-limited management acceptance. '+plan;
      Object.assign(risk,{accepted:true,accepted_by:actor.user_id,acceptance_date:dates.instant(-45),acceptance_expires_at:dates.day(220+(index-15)*20),acceptance_rationale:rationale,
        compensating_controls:plan,decision_history:[{action:'accepted',by:actor.user_id,at:dates.instant(-45),rationale,expires_at:dates.day(220+(index-15)*20)}]});
    }
    if(closedAt)Object.assign(risk,{closed_at:closedAt,closed_by:actor.user_id,closure_reason:'condition_removed',closure_note:plan,
      decision_history:[{action:'closed',by:actor.user_id,at:closedAt,reason:'condition_removed',note:plan}]});
    validateAssignment(scoped,'risks',risk);scoped.risks.push(risk);
    let review=ensureRiskReview(scoped,risk);
    if(!review&&closedAt){review={review_id:'risk_review_'+risk.risk_id,client_id:CID,risk_id:risk.risk_id,title:'Risk Review — '+risk.display_id+' — '+title,review_type:'risk_assessment',owner_id:assigned.user_id,recurrence:'annual',due_date:dates.day(-365)};scoped.reviews.push(review);}
    normalizedReview(review,dates,actor,origin,closedAt);
    if(status==='in_progress') {
      const task={task_id:PREFIX+'task_'+key,client_id:CID,title:plan,description:'Fictional treatment of '+title+'. Retain the result for a separate Risk owner decision; Action completion does not close the Risk.',
        risk_id:risk.risk_id,source_type:'risk',source_id:risk.risk_id,
        priority:key==='dispatch'?'critical':key==='backup-dependency'?'low':risk.risk_score>=10?'high':'medium',
        status:'open',assignee_id:key==='software'?null:assigned.user_id,
        created_at:dates.instant(-30),created_by:actor.user_id,updated_at:dates.instant(-8),
        due_date:dates.day(key==='dispatch'?0:key==='backup-dependency'?12:10+index*3)};
      prepareTask(scoped,task);
      if(key==='dispatch')Object.assign(task,{status:'in_progress',started_at:dates.instant(-12),started_by:assigned.user_id});
      scoped.tasks.push(task);risk.related_task_ids.push(task.task_id);
    }
  }
  for(const [index,spec] of vendorSpecs.entries()) {
    const [key,name,catalogKey,service,criticality,dataTypes,next,renewal]=spec,active=next!==null;
    const vendor={vendor_id:PREFIX+'vendor_'+key,client_id:CID,name,catalog_key:validateCatalogKey('vendors',catalogKey),service,services:service,
      criticality,status:active?'active':'inactive',business_owner_id:owners[index%owners.length].user_id,owner_id:owners[index%owners.length].user_id,
      data_types:dataTypes,review_frequency:'annual',next_review:active?dates.day(next):null,last_review:dates.day(active?-340:-190),
      contract_start:dates.day(-500),contract_renewal:active?dates.day(renewal):null,contract_expiration:active?dates.day(renewal):dates.day(-200),
      contract_lead_days:60,contract_review_enabled:active&&['managed-it','carrier','maintenance'].includes(key),
      assurance_required:active&&index<11,assurance_window_days:90,separate_assurance_review:key==='managed-it',
      assurance_review_date:key==='managed-it'?dates.day(7):null,assurance_cadence:'none',assurance_records:[],contract_evidence_ids:[],related_risk_ids:[],
      created_at:origin,created_by:actor.user_id,updated_at:dates.instant(active?-10:-180),notes:provenance};
    if(key==='maintenance')Object.assign(vendor,{contract_notice_deadline:dates.day(20),
      contract_notes:'Fictional LineCare term: written non-renewal notice is due 45 calendar days before the recorded renewal. The earlier internal contract decision and the annual supplier review remain separate activities.'});
    if(vendor.assurance_required)vendor.assurance_records=[{assurance_id:PREFIX+'assurance_'+key,type:'Security Questionnaire',required:true,
      review_status:'requested',expected_availability:dates.day(7+index),next_follow_up:dates.day(index===7?-5:8+index),evidence_ids:[],history:[]}];
    if(!active)Object.assign(vendor,{offboarded_at:dates.instant(-180),offboarding_notes:'Fictional supplier retired; access revocation checked. Its history is retained without a future annual Review.'});
    scoped.vendors.push(vendor);
    // Validate a historical imported state, not a new active-Vendor transition.
    validateVendor(scoped,vendor,copy(vendor));
    for(const review of ensureVendorReviews(scoped,vendor))normalizedReview(review,dates,actor,origin);
    if(!active){const review={review_id:'vendor_review_'+vendor.vendor_id+'_vendor',client_id:CID,vendor_id:vendor.vendor_id,vendor_purpose:'vendor',title:'Vendor Review — '+name,review_type:'vendor',owner_id:vendor.business_owner_id,recurrence:'annual',due_date:dates.day(-190)};scoped.reviews.push(normalizedReview(review,dates,actor,origin,dates.instant(-180)));}
    if(['managed-it','maintenance'].includes(key)) {
      const contractReview=key==='maintenance'?scoped.reviews.find(review=>review.client_id===CID&&review.vendor_id===vendor.vendor_id&&review.vendor_purpose==='contract'):null;
      if(key==='maintenance'&&!contractReview)throw new Error('Brawndo renewal Action requires its existing contract Review.');
      const task={task_id:PREFIX+'task_vendor_'+key,client_id:CID,title:key==='managed-it'?'Obtain the scoped provider assurance response':'Decide the line-maintenance contract renewal',
        description:key==='managed-it'?'Fictional follow-up: reconcile the requested provider questionnaire with its actual support access; this does not renew the contract.':'Fictional renewal decision: confirm support scope and notice deadline; this does not complete the annual supplier review.',
        vendor_id:vendor.vendor_id,source_type:'vendor',source_id:vendor.vendor_id,...(key==='managed-it'?{assurance_id:vendor.assurance_records[0].assurance_id}:{review_id:contractReview.review_id}),
        priority:'medium',status:'open',assignee_id:vendor.business_owner_id,created_at:dates.instant(-12),created_by:actor.user_id,updated_at:dates.instant(-5),due_date:dates.day(key==='managed-it'?7:5)};
      prepareTask(scoped,task);scoped.tasks.push(task);
    }
  }
  for(const [index,key] of ['chatgpt','claude','m365'].entries()) {
    const preset=applyTool(blankDraft(origin.slice(0,10)),catalogKeys.indexOf(key)),risk=scoped.risks.find(row=>row.risk_id===PREFIX+'risk_ai-'+(key==='m365'?'copilot':key));
    const vendor=scoped.vendors.find(row=>row.vendor_id===PREFIX+'vendor_'+(key==='chatgpt'?'openai':key==='claude'?'anthropic':'m365'));
    const description=key==='chatgpt'?'Proposed maintenance-checklist drafts from sanitized internal text for the two production lines; no operating instruction may be issued from the pilot.':key==='claude'?'Summaries of approved public beverage marketing copy; product and ingredient claims remain subject to human approval.':'Office email and meeting summaries in the Brawndo tenant; use existing permitted user access and exclude confidential staff and customer records.';
    const restrictions=key==='chatgpt'?'Pilot assessment pending. Public and sanitized Internal text only. No production instructions, confidential inputs, customer records or autonomous actions.':key==='claude'?'Public and approved Internal marketing text only; a named editor checks every product claim before publication.':'Only the pilot office group. Public/Internal outputs only; no confidential-record summaries, HR decisions, permission changes or autonomous actions.';
    const answers={managed:true,sensitive:key==='m365',connected:key==='m365',writes:false,autonomous:false,external:key!=='chatgpt',consequential:false,harm:key!=='claude',oversight:true,settings:key!=='chatgpt'};
    const row={...copy(AI_DEFAULTS),...copy(AI_PILOT_DEFAULTS),ai_system_id:PREFIX+'ai_'+key,display_id:'AI-'+String(index+1).padStart(3,'0'),client_id:CID,
      catalog_key:validateCatalogKey('ai_systems',key),name:preset.name,provider:preset.provider,product_model:preset.name,
      environment:key==='chatgpt'?'Brawndo managed ChatGPT Business pilot':key==='claude'?'Brawndo Claude Team workspace':'Brawndo Business Premium tenant with separately licensed Microsoft 365 Copilot pilot users',
      description,owner_id:workOwner.user_id,technical_owner_id:workOwner.user_id,oversight_owner_id:workOwner.user_id,vendor_id:vendor.vendor_id,
      purposes:preset.purposes,data_types:key==='m365'?[...preset.data_types]:['Public','Internal'],permitted_data_types:['Public','Internal'],access:preset.access,
      restrictions,data_settings:key==='chatgpt'?'Fictional pilot: retention, training and sharing settings await the owner assessment; no operational use is approved.':'Fictional administrator reviewed tenant retention, training, sharing and group access for the documented restricted pilot; provider branding is not assurance.',
      human_review_required:true,human_approval_required:true,
      oversight_notes:key==='chatgpt'?'Plant lead checks sample drafts before any pilot approval; drafts are not operating instructions.':key==='claude'?'Marketing lead verifies every product claim against approved copy before publication.':'Office owner checks summaries before use; confidential-source and onward-sharing restrictions remain in force.',
      governance_notes:provenance,status:key==='chatgpt'?'draft':'active',approval_status:key==='chatgpt'?'pending_assessment':'approved_with_conditions',
      created_at:origin,created_by:actor.user_id,updated_at:dates.instant(-6),related_links:[{kind:'risks',id:risk.risk_id,classification:'Context',source:'',rationale:risk.assessment_rationale}]};
    const problem=detailsError({...row,vendor:{mode:'link',id:vendor.vendor_id}});if(problem)throw new Error(problem);
    row.onboarding_screening={schema_version:1,catalog_version:aiCatalog.reviewedOn,answers,scope:screeningScope(row),recorded_at:dates.instant(-6),recorded_by:actor.user_id};
    if(key!=='chatgpt')row.approval_history=[{status:row.approval_status,note:'Fictional administrator decision for the documented restricted scope; reassess material changes.',scope:aiScope(row),at:dates.instant(-6),by:actor.user_id,by_name:actor.name}];
    validateAI(scoped,row);validateAssignment(scoped,'ai_systems',row);scoped.ai_systems.push(row);vendor.related_risk_ids.push(risk.risk_id);
    const review={review_id:PREFIX+'review_ai_'+key,client_id:CID,ai_system_id:row.ai_system_id,ai_review_purpose:'periodic',title:'AI Governance Review — '+row.display_id+' — '+row.name,
      review_type:'ai_governance',owner_id:workOwner.user_id,reviewer_id:workOwner.user_id,recurrence:'annual',due_date:dates.day(index===0?-4:30+index*20),status:'upcoming',
      scope:description,notes:'Assess permitted use, screening and oversight. The linked Risk has its own annual review and closure decision.'};
    scoped.reviews.push(normalizedReview(review,dates,actor,origin));
  }
  for(const [kind,id] of Object.entries({risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',reviews:'review_id',tasks:'task_id'}))
    if(new Set(scoped[kind].map(row=>row[id])).size!==scoped[kind].length)throw new Error('Brawndo fixture identity collides with a retained record.');
  // This explicit fictional declaration is independent of each system's screening.
  const intake=aiRequest(scoped,'/ai-intake','post',{}, {client_id:CID,usage:'yes',
    indicators:['Third-party AI tools internally'],expected_updated_at:null});
  intake.updated_at=dates.instant(-6);
  const intakeAudit=scoped.logs[0];
  Object.assign(intakeAudit,{audit_id:intakeAuditId,at:intake.updated_at,
    meta:{...intakeAudit.meta,source:'Fictional Brawndo organization AI-use declaration through the native intake service'}});
  for(const kind of ['risks','vendors','ai_systems','reviews','tasks','ai_intake','logs'])db[kind]=scoped[kind];
  db.riskSequences={...db.riskSequences,[CID]:counter.riskSequences[CID]};
  db.ai_counters={...db.ai_counters,[CID]:3};
  return result(db);
}
