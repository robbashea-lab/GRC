import {assessedRisk} from '../lib/grcWork';
import {activeDefinitions} from '../lib/frameworks';
import {applyTool, blankDraft, catalogKeys, onboardingPayload, proposalFor, snapshot, screeningScope} from '../lib/aiOnboarding';
import {validateAI} from '../lib/aiGovernance';
import {validateCatalogKey} from '../lib/registerCatalogIdentity';
import {reviewSchedule, reviewView, scheduledDate} from '../lib/reviewOccurrences';
import {validateGovernanceContext} from '../lib/requirementBasis';
import {eligible, clientAccess, validateAssignment} from './assignmentEligibility';
import {allocateRiskId} from './riskIds';
import {ensureRiskReview} from './risks';
import {ensureVendorReviews, validateVendor} from './vendors';
import {guardEdit} from './decisions';
import {write} from './store';
import {aiRequest} from './aiGovernance';
import {aiOnboardingRequest} from './aiOnboarding';
import {stable} from './commandRequests';
import {initechOnboardingSelection} from './cisCanonicalInitechBaseline';
import {INITECH_SCENARIO_PROFILE, initechSafeguardContent} from './cisCanonicalInitechContent';

const CID = 'demo_initech';
const PREFIX = CID+'_canonical_';
const AI_INTAKE_DAY = -24;
const SOURCE = 'Explicit fictional Initech operational import through native domain services; not browser execution, an in-app AI approval, verified evidence or a CIS-mandated supplemental activity.';
const copy = value => JSON.parse(JSON.stringify(value));
const mine = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const reject = message => {throw new Error('Initech operations: '+message);};
const statusFor = id => INITECH_SCENARIO_PROFILE.partial.includes(id) ? 'in_progress'
  : INITECH_SCENARIO_PROFILE.gaps.includes(id) ? 'needs_attention'
    : INITECH_SCENARIO_PROFILE.unknown.includes(id) ? 'not_assessed' : 'addressed';
const ROLES = {
  program:'Peter Gibbons — Program coordinator / service owner',
  executive:'Bill Lumbergh — Executive sponsor',
  infrastructure:'Samir Nagheenanajar — Infrastructure, identity and recovery lead',
  engineering:'Michael Bolton — Engineering lead',
  vendor:'Tom Smykowski — Vendor / business relationship owner',
  facilities:'Milton Waddams — Asset / facilities liaison',
  awareness:'Nina — Workforce communications and awareness coordinator',
};
const organizationalContext = () => ({category:'organizational', rationale:SOURCE,
  cadence_source:'organization_defined',
  cadence_rationale:'Annual management review is an explicit fictional operating choice. Risk acceptance expiry, AI review, assurance follow-up and contract notice remain separate.'});

// These are current exposures, not extra Findings or duplicate remediation work.
// The history stage receives the exact definition-to-Risk relationships below.
const safeguardRisks = [
  ['library-loading', '2.6', 'Writable reporting extension directory', 3, 3,
    'The supported reporting worker can load a library from a writable extension path.',
    'A locally introduced library could change settlement-report content or expose a bounded service account.', 'engineering'],
  ['export-flow', '3.8', 'Settlement export handoff is incompletely documented', 3, 3,
    'The new transfer exists, but recipient, purpose and return-path documentation is incomplete.',
    'An incorrect handoff could delay investigation or direct a future export to the wrong approved business destination.', 'program'],
  ['batch-purpose', '5.5', 'Batch identities lack complete purpose metadata', 2, 3,
    'Two authorized batch identities lack purpose and register review-date metadata.',
    'An incomplete purpose record could delay a service-owner decision during a future access or incident review.', 'infrastructure'],
  ['media-encryption', '3.9', 'Diagnostic removable media is not encrypted', 3, 4,
    'Permitted diagnostic-transfer drives can retain readable internal business records.',
    'Loss of a drive could expose a bounded set of internal service and diagnostic information.', 'infrastructure'],
  ['mail-authentication', '9.5', 'Sending domains lack DMARC policy and verification', 3, 4,
    'SPF and DKIM operate, but the remaining domain-alignment and DMARC controls are absent.',
    'A believable spoofed support or invoice message could cause a material business interruption or misdirected payment instruction.', 'infrastructure'],
  ['bridge-flow', '13.6', 'Settlement bridge flow collection is incomplete', 3, 3,
    'The supported bridge filters traffic and produces device audit events, but its flow export is not connected.',
    'Missing flow context could slow investigation of unexpected cross-boundary traffic.', 'infrastructure'],
  ['contract-clauses', '15.4', 'Provider security amendments are not executed', 2, 4,
    'The performed annual gap review identified missing required security clauses in current agreements.',
    'An incident or service exit could proceed without sufficiently enforceable notification and information-protection terms.', 'vendor'],
  ['component-register', '16.4', 'Reporting build misses monthly component evaluation', 3, 3,
    'Release-time component checks operate, but the worker inventory and planned-component risks are incomplete in the monthly register.',
    'An untracked component change could outlast its support or risk decision before the next release check.', 'engineering'],
];

const businessRisks = [
  ['settlement-window', 'Single settlement gateway at the cut-off window', 5, 5,
    'The fictional service exchanges settlement references through one business gateway; an announced maintenance window overlaps the busiest settlement cut-off.',
    'The announced overlap and absence of reserved alternate capacity make interruption very likely during the affected window.',
    'Missing the cut-off would interrupt a large share of the fictional business for multiple days and require extensive reconciliation.',
    'Agree an alternate settlement-reference route and rehearse the cut-off decision.', 'program'],
  ['release-handover', 'Release handover depends on one coordinator', 3, 3,
    'The engineering release calendar has an approved process, but the customer communication handover still depends on one business coordinator.',
    'Leave and parallel releases can coincide, making a missed handover plausible.',
    'A missed communication could cause incorrect support guidance and a bounded service release delay.',
    'Rehearse alternate-owner release communications without changing technical release approvals.', 'engineering'],
  ['support-capacity', 'Quarter-end support demand exceeds reserved cover', 3, 2,
    'Support procedures and trained personnel are established, but quarter-end demand may exceed the reserved second-line capacity.',
    'The fictional demand pattern and planned leave make a short capacity shortfall plausible.',
    'A shortfall would lengthen support response for a limited period without stopping settlement-reference processing.',
    'Confirm the quarter-end support roster and rehearse the overflow handoff.', 'program'],
  ['network-carrier', 'Primary office circuit has a common maintenance dependency', 2, 5,
    'The office has a documented remote-work fallback, but its primary circuit and building maintenance share a narrow service window.',
    'Recent service is stable and remote work reduces exposure, though a correlated interruption remains possible.',
    'A prolonged correlated outage could materially disrupt support coordination and require distributed operations.',
    'Confirm the carrier maintenance window and exercise distributed support coordination.', 'facilities'],
];

const acceptedRisks = [
  ['public-status', 'Public status-page update lag', 2, 2, 'The public status page is updated by a named human after service verification.',
    'The support team performs a second-person check and tracks the short publication interval.', 'A short lag could create limited support confusion.',
    'Retain human verification and monitor the update interval until the next communication review.', -2],
  ['archived-reports', 'Archive retrieval takes one business day', 2, 3, 'Older fictional invoice-reference reports are retained in a controlled archive rather than fast production storage.',
    'Recent retrieval requests have been infrequent and planned.', 'An urgent request could require bounded manual retrieval work.',
    'Keep the controlled retrieval runbook and named alternate operator.', 30],
  ['seasonal-staffing', 'Seasonal release support has limited spare capacity', 2, 3, 'The release-support rota has a small reserve outside normal business hours.',
    'Scheduled releases and a trained backup reduce the likelihood of a significant gap.', 'An unexpected late release could delay a bounded support response.',
    'Preserve the backup rota and reassess if release volume increases.', 95],
  ['provider-concentration', 'Low-volume document signing depends on one provider', 1, 4, 'Business document signing uses one provider with an approved manual routing fallback.',
    'Stable usage and the bounded fallback make prolonged disruption unlikely.', 'A sustained outage could delay a time-sensitive business agreement.',
    'Retain the documented fallback and monitor the supplier dependency.', 210],
];

const closedRisks = [
  ['retired-transfer', 'Retired support transfer endpoint', 3, 3, 'An obsolete support transfer endpoint remained after its replacement was commissioned.', 'The endpoint was removed and an independent negative-access check confirmed the retired route was unavailable.'],
  ['old-build-account', 'Unneeded historical build identity', 3, 3, 'An old build identity remained enabled after the worker moved to the current pipeline.', 'The identity was disabled, its credentials revoked and the current build route retested.'],
  ['wrong-alert', 'Historical alert destination was stale', 2, 3, 'A former on-call destination remained in a service alert rule.', 'The routing rule was corrected and a harmless test reached the current rota.'],
  ['legacy-client', 'Unsupported desktop reporting client', 3, 2, 'A retired desktop reporting client retained an obsolete component.', 'The client was removed and supported application deployment was confirmed on the affected devices.'],
  ['public-export', 'Historical export link was publicly reachable', 3, 4, 'A fictional internal report export had an unnecessary public-sharing link.', 'The link was revoked and unauthenticated access was independently checked as denied.'],
  ['shared-secret', 'Historical integration secret was reused', 3, 4, 'Two retired integrations once shared the same service secret.', 'The integrations were separated, credentials rotated and old-secret access checked as denied.'],
  ['expired-certificate', 'Old service certificate had no owner reminder', 2, 3, 'A retired certificate inventory lacked an accountable reminder owner.', 'The live certificate inventory gained ownership and renewal monitoring; the retired certificate was removed.'],
  ['wrong-bucket', 'Historic diagnostic archive had broad access', 2, 3, 'A historical diagnostics archive had unnecessary internal readers.', 'Access was restricted to the accountable support group and the effective membership was checked.'],
  ['contact-chain', 'Outdated carrier escalation contact', 2, 2, 'The old carrier escalation sheet referenced a former relationship contact.', 'The contact sheet was corrected and a controlled routing exercise confirmed the current escalation path.'],
  ['retired-provider', 'Retired connector provider retained access', 3, 3, 'A historical connector relationship retained an unused provider support entitlement.', 'The relationship was offboarded, entitlement revoked and the provider connection checked as unavailable.'],
];

// Brand identities reuse the existing preset registry. Services describe this
// fictional relationship, not a claim of certification or a product guarantee.
const vendorSpecs = [
  ['workspace','Microsoft 365','microsoft-365','Fictional workforce collaboration tenant; separately licensed proposed Copilot use','high',['Internal','Employee Data'],20,180,'program'],
  ['hosting','Amazon Web Services','amazon-web-services','Fictional application hosting and infrastructure account','critical',['Operational Data','Network / System Access'],-5,100,'infrastructure'],
  ['engineering','Atlassian Jira & Confluence','atlassian-jira-confluence','Fictional engineering issue and controlled design-document workspace','high',['Internal','Source Code / IP'],45,250,'engineering'],
  ['identity','Okta','okta','Fictional workforce identity service relationship','high',['Employee Data','Network / System Access'],60,300,'infrastructure'],
  ['vault','1Password','1password','Fictional business credential-vault subscription; platform authentication rules remain separate','high',['Credentials'],12,220,'infrastructure'],
  ['payroll','ADP','adp','Fictional payroll administration for the 148-person workforce','high',['Employee Data','Financial'],75,280,'executive'],
  ['signing','DocuSign','docusign','Fictional business agreement signature service','medium',['Internal','Confidential'],95,330,'vendor'],
  ['meetings','Zoom','zoom','Fictional workforce meeting subscription','medium',['Internal'],30,190,'program'],
  ['openai','OpenAI',null,'Proposed managed ChatGPT drafting pilot using sanitized internal support material','medium',['Internal'],35,270,'engineering'],
  ['anthropic','Anthropic',null,'Proposed Claude summary pilot for approved public product material','low',['No Sensitive Data'],85,290,'program'],
  ['network','TPS Network Services (fictional)',null,'Fictional office connectivity and coordinated maintenance relationship','high',['Network / System Access'],120,80,'facilities'],
  ['settlement','TPS Settlement Gateway (fictional)',null,'Fictional exchange of settlement references; no cardholder information is included','critical',['Operational Data','API / Integration Access'],0,125,'program'],
  ['testing','Red Stapler Security Testing (fictional)',null,'Fictional authorized external penetration-testing engagement','medium',['Internal','Network / System Access'],150,310,'engineering'],
  ['reporting','Milestone Reporting Support (fictional)',null,'Fictional specialist maintenance for the supported legacy reporting worker','medium',['Operational Data'],6,70,'engineering'],
  ['retired','Old Connector Support (fictional)',null,'Retired fictional connector support relationship','low',['No Sensitive Data'],null,null,'vendor'],
];

const aiSpecs = [
  {key:'chatgpt', vendor:'openai', risk:'ai-chatgpt', role:'engineering', likelihood:2, impact:3, created:-20, next:-12,
    description:'Proposed internal support-draft pilot using sanitized troubleshooting descriptions; a support owner checks every response before any use.',
    restrictions:'Public and sanitized Internal material only. No production data, credentials, confidential records, permission changes or autonomous actions. Operational approval is not recorded.',
    risk_title:'AI support drafts may omit a required troubleshooting step',
    risk_description:'A proposed ChatGPT pilot could produce plausible but incomplete support guidance from sanitized source text; it cannot issue a production instruction.',
    rationale:'Fictional human judgment: likelihood 2 because a named support reviewer compares every sample with the controlled runbook; impact 3 because an unchecked omission could delay restoration of a bounded service. This differs from a generic tool baseline and is not a provider rating.',
    likelihood_rationale:'A named support reviewer compares every sample with the controlled runbook, reducing the likelihood of an unchecked omission; unresolved deployment settings still require an owner decision.',
    impact_rationale:'An unchecked troubleshooting omission could delay restoration of a bounded service; the proposed tool cannot issue production instructions or take autonomous action.',
    answers:{managed:true,sensitive:false,connected:false,writes:false,autonomous:false,external:false,consequential:false,harm:false,oversight:true,settings:false}},
  {key:'claude', vendor:'anthropic', risk:'ai-claude', role:'program', likelihood:2, impact:2, created:-6, next:30,
    description:'Proposed summaries of approved public product documentation for internal release-communication preparation; a named editor checks every claim.',
    restrictions:'Approved Public material only. No customer, employee, source-code or confidential inputs; no automatic publication or business decisions. Operational approval is not recorded.',
    risk_title:'AI release summaries may misstate public product behavior',
    risk_description:'A proposed Claude summary could misstate a public product feature even when its source is approved and no sensitive information is supplied.',
    rationale:'Fictional human judgment: likelihood 2 because the editor compares each summary with approved public documentation; impact 2 because a mistake would cause bounded communication rework. No autonomous publication or consequential decision is enabled.',
    likelihood_rationale:'A named editor compares each proposed summary with approved public documentation, reducing the chance that an unsupported feature claim is reused.',
    impact_rationale:'A mistaken public-material summary would create bounded communication rework; confidential inputs, automatic publication and consequential decisions are outside the proposed scope.',
    answers:{managed:true,sensitive:false,connected:false,writes:false,autonomous:false,external:false,consequential:false,harm:false,oversight:true,settings:false}},
  {key:'m365', vendor:'workspace', risk:'ai-copilot', role:'program', likelihood:3, impact:3, created:-6, next:60,
    description:'Proposed Microsoft 365 Copilot email and meeting summaries within existing tenant permissions; confidential context may be reachable even though permitted outputs are restricted.',
    restrictions:'Only the proposed pilot group. Public/Internal outputs only; exclude confidential and personnel summaries, HR decisions, permission changes and autonomous actions. Operational approval is not recorded.',
    risk_title:'Workspace AI summaries may redistribute sensitive context',
    risk_description:'The proposed connected Copilot scope may reach confidential or employee content through existing permissions, and an onward summary could expose a bounded set of information.',
    rationale:'Fictional human judgment: likelihood 3 because connected tenant content can enter an otherwise bounded prompt; impact 3 because improper onward sharing could expose limited internal or personnel context. Existing permissions are not expanded, and no production write or autonomous action is enabled.',
    likelihood_rationale:'Connected tenant content can enter a prompt through existing permissions despite the Public/Internal output restriction, making unintended inclusion plausible.',
    impact_rationale:'Improper onward sharing could expose a bounded set of internal or personnel context; the proposed scope adds no production writes, permission changes or autonomous action.',
    answers:{managed:true,sensitive:true,connected:true,writes:false,autonomous:false,external:true,consequential:false,harm:false,oversight:true,settings:false}},
];

const taskSpecs = [
  {key:'settlement-window', risk:'settlement-window', title:'Rehearse the alternate settlement-reference cut-off decision', priority:'critical', status:'in_progress', due:0,
    description:'Reserve the business fallback route and rehearse the decision before the announced maintenance window. This is supplemental continuity work, not a missing CIS safeguard.'},
  {key:'release-handover', risk:'release-handover', title:'Confirm the alternate release-communication coordinator', priority:'high', status:'open', due:-5, unassigned:true,
    description:'Obtain an accountable alternate for customer-facing release communications. Technical release approval and secure development controls remain unchanged.'},
  {key:'support-capacity', risk:'support-capacity', title:'Confirm quarter-end support cover and overflow handoff', priority:'medium', status:'open', due:12,
    description:'Confirm planned staffing and rehearse the overflow handoff without claiming that a support-capacity task validates unrelated Findings.'},
  {key:'network-carrier', risk:'network-carrier', title:'Confirm the coordinated office-circuit maintenance window', priority:'low', status:'blocked', due:30,
    description:'Await the fictional carrier window confirmation before the distributed-support exercise; no future completion is asserted.',
    resolution:'Blocked pending the fictional carrier maintenance confirmation. Existing remote-work fallback remains available.'},
  {key:'roster-briefing', title:'Publish the next fictional support-roster briefing', priority:'informational', status:'open', due:3,
    description:'Prepare an internal briefing from the existing owner-approved rota. This is organization-selected coordination, not an additional CIS requirement.'},
  {key:'supplier-exit-exercise', title:'Prepare a supplier-exit decision exercise', priority:'medium', status:'open', due:60,
    description:'Prepare a fictional business exercise for service exit and data return. Do not contact suppliers, change contracts or mark any annual Review complete.'},
  {key:'contract-notice', vendor:'reporting', purpose:'contract', title:'Decide the reporting-support renewal before notice is due', priority:'high', status:'open', due:10,
    description:'Use the existing contract Review to decide renewal scope before the recorded notice deadline. The decision is separate from the annual Vendor Review and missing security amendments.'},
  {key:'assurance-followup', vendor:'hosting', assurance:true, title:'Follow up the requested hosting assurance scope', priority:'medium', status:'open', due:-2,
    description:'Obtain the fictional requested assurance response and confirm its covered service scope. No received document, verified evidence or full IG3 provider assessment is claimed.'},
  {key:'retired-route-check', title:'Record the completed retired-connector access check', priority:'low', status:'done', due:-14,
    description:'Historical fictional operational check: the retired connector path was confirmed unavailable. This completed work is not an approval or independent Finding closure.',
    resolution:'The retired connector path was unavailable in the fictional check and the current route remained usable.'},
  {key:'duplicate-briefing', title:'Cancel the duplicate release briefing', priority:'informational', status:'cancelled', due:-10,
    description:'A duplicate internal briefing was withdrawn; the established release handover remains the authoritative activity.',
    resolution:'Cancelled as a duplicate briefing; no assessment, Review, Risk or Finding was completed by cancellation.'},
];

function processContacts(db, processOwners) {
  if (!processOwners || typeof processOwners !== 'object' || Array.isArray(processOwners)) reject('processOwners must map existing Contact roles.');
  return Object.fromEntries(Object.entries(ROLES).map(([key, role]) => {
    const supplied = processOwners[role] || processOwners[key];
    const id = typeof supplied === 'string' ? supplied : supplied?.contact_id;
    const matches = (db.contacts || []).filter(row => id ? row.contact_id === id : row.client_id === CID && row.name === role.split(' — ')[0]);
    if (matches.length !== 1 || matches[0].client_id !== CID || matches[0].status !== 'active')
      reject('use the existing active Initech Contact for '+role+'.');
    return [key, matches[0]];
  }));
}

function authorContext(db, {dates, owner, processOwners = {}}) {
  const clients = mine(db, 'clients'), client = clients[0], actor = db.user;
  if (actor?.workspace_mode !== 'demo' || actor.status !== 'active' || !clientAccess(actor, CID)
    || !['super_admin','platform_admin'].includes(actor.role) || clients.length !== 1
    || client.environment !== 'Demo' || client.status !== 'active' || client.archived || client.archived_at
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 2
    || db.baselines?.[CID]?.completed !== true || db.baselines[CID].version !== 3
    || !mine(db, 'requirements').some(row => row.baseline_key === 'cis-ig1' && row.baseline_response === 'applies'))
    reject('an authorized administrator and completed canonical IG2 Demo baseline are required.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['day','instant','month'].every(key => typeof dates[key] === 'function')
    || dates.instant(0) !== dates.anchor || !scheduledDate(dates.anchor)) reject('provide the frozen native UTC date helpers.');
  const origin = dates.month(-24)+'T00:00:00.000Z';
  if (!scheduledDate(origin) || origin < '2024-06-25T00:00:00.000Z' || origin >= dates.anchor)
    reject('the 24-month v8.1 scenario must begin after release and before its anchor.');
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id;
  const accounts = (db.users || []).filter(row => row.user_id === ownerId);
  if (accounts.length !== 1 || !eligible(accounts[0], CID)) reject('use an existing eligible accountable application user.');
  return {dates, client, actor, account:accounts[0], contacts:processContacts(db, processOwners), origin};
}

function assertFreshGovernance(db, {dates, account, origin}) {
  const {policy_keys, plans} = initechOnboardingSelection();
  const definitions = activeDefinitions('cis-ig1', {implementation_group:2});
  const assessments = mine(db, 'framework_assessments'), policies = mine(db, 'policies'), reviews = mine(db, 'reviews');
  const expectedReviews = [...plans.map(plan => CID+'_canonical_review_'+plan.key),
    'fw_'+CID+'_review_requirement:8.11', 'fw_'+CID+'_review_requirement:11.5'];
  if (policy_keys.length !== 9 || policies.length !== 9 || plans.length !== 13 || reviews.length !== 15
    || definitions.length !== 130 || assessments.length !== 130 || db.baselines[CID].updated_at !== dates.instant(-2)
    || db.clients.find(row => row.client_id === CID).initial_program_baseline?.completed_at !== origin)
    reject('complete the untouched nine-document governance stage first.');
  for (const definition of definitions) {
    const rows = assessments.filter(row => row.definition_id === definition.id && row.framework_key === 'cis-ig1');
    const status = statusFor(definition.id), content = initechSafeguardContent(definition.id, status), row = rows[0];
    const draft = db.guided_assessment_pilot?.[`fw_${CID}_assessment_${definition.id}:`+account.user_id];
    if (rows.length !== 1 || row.framework_assessment_id !== `fw_${CID}_assessment_${definition.id}`
      || row.framework_version !== '8.1' || row.status !== status || row.implementation !== content.current_implementation
      || row.technology !== content.technology_process || row.owner_id !== account.user_id || row.created_at !== origin
      || row.last_saved !== (status === 'not_assessed' ? null : dates.instant(-2))
      || row.verification !== (status === 'not_assessed' ? null : status === 'addressed' ? 'needs_validation' : 'gap_identified')
      || row.assessment_history?.length || (row.related_links || []).some(link => !['policies','reviews'].includes(link.kind))
      || (row.related_links || []).some(link => !(db[link.kind] || []).some(target => target.client_id === CID
        && target[link.kind === 'policies' ? 'policy_id' : 'review_id'] === link.id))
      || row.items_to_address?.some(item => item.finding_id != null || item.state !== 'open'))
      reject('requires the unchanged current native assessment import, without historical or remediation work.');
    if (status === 'not_assessed' ? draft || row.guided_assessment_source
      : !draft?.completed || draft.client_id !== CID || draft.assessment_id !== row.framework_assessment_id
        || draft.user_id !== account.user_id || row.guided_assessment_source?.origin !== 'fictional-demo-fixture'
        || JSON.stringify(row.guided_assessment_source.answers) !== JSON.stringify(draft.answers))
      reject('requires the preserved native interviews and genuinely unassessed exceptions.');
  }
  if (policy_keys.some(key => policies.filter(row => row.baseline_key === key && row.policy_id === CID+'_'+key).length !== 1)
    || policies.some(row => row.owner_id !== account.user_id || row.created_at !== origin
      || row.baseline_response !== 'yes' || !['approved','in_review'].includes(row.status) || !row.approval_subject)
    || expectedReviews.some(id => reviews.filter(row => row.review_id === id).length !== 1)
    || reviews.some(row => !expectedReviews.includes(row.review_id) || row.owner_id !== account.user_id || row.reviewer_id !== account.user_id
      || !['upcoming','in_progress'].includes(row.status) || !scheduledDate(row.due_date)
      || row.current_occurrence_id !== 'occ_'+row.review_id || row.created_at !== origin
      || row.occurrences?.length || row.completed_at || row.completion_date)
    || ['risks','vendors','ai_systems','tasks','findings','evidence','comments','assets','organizational_controls','exceptions','assessments']
      .some(kind => mine(db, kind).length) || db.drafts?.[CID]) reject('requires fresh governance and no retained operational work.');
  for (const kind of ['ai_intake','ai_counters','riskSequences','command_requests']) {
    if (db[kind] != null && (typeof db[kind] !== 'object' || Array.isArray(db[kind]))) reject('invalid native '+kind+' map.');
  }
  if (Object.hasOwn(db.ai_intake || {}, CID) || (db.ai_counters?.[CID] || 0) !== 0 || (db.riskSequences?.[CID] || 0) !== 0
    || Object.keys(db.command_requests || {}).some(key => {
      try {return JSON.parse(key)[1] === CID;} catch {return false;}
    })) reject('replace prior target intake, counters or command receipts explicitly before installing operations.');
  for (const [kind, field] of [['framework_assessments','framework_assessment_id'],['policies','policy_id'],['reviews','review_id'],['contacts','contact_id']]) {
    const ids = mine(db, kind).map(row => row[field]);
    if (new Set(ids).size !== ids.length || (db[kind] || []).some(row => row.client_id !== CID && ids.includes(row[field])))
      reject('a prepared source identity collides with another client.');
  }
}

function normalizeReview(review, dates, actor, origin, terminalAt = null) {
  Object.assign(review, {created_at:origin, created_by:actor.user_id, updated_at:terminalAt || dates.instant(-2),
    current_occurrence_id:'occ_'+review.review_id, governance_context:organizationalContext(), occurrences:[]});
  if (terminalAt) Object.assign(review, {status:'cancelled', cancelled_at:terminalAt, cancelled_by:actor.user_id});
  Object.assign(review, reviewSchedule(review, true));
  Object.assign(review, reviewView(review));
  validateGovernanceContext(review.governance_context);
  return review;
}

function createRisks(db, {dates, actor, account, contacts, origin}) {
  const counter = {risks:[], riskSequences:{[CID]:0}};
  const current = safeguardRisks.map(([key, id, title, likelihood, impact, likelihoodReason, impactReason, role]) => {
    const content = initechSafeguardContent(id, statusFor(id));
    return {key, title, likelihood, impact, description:content.current_implementation, likelihoodReason, impactReason,
      plan:content.remediation, role, definitions:[id], identified:dates.instant(-42), status:'assessed'};
  }).concat(businessRisks.map(([key, title, likelihood, impact, description, likelihoodReason, impactReason, plan, role]) =>
    ({key, title, likelihood, impact, description, likelihoodReason, impactReason, plan, role, definitions:[],
      identified:dates.instant(-35), status:'assessed'})));
  const accepted = acceptedRisks.map(([key, title, likelihood, impact, description, likelihoodReason, impactReason, plan, expiry]) =>
    ({key, title, likelihood, impact, description, likelihoodReason, impactReason, plan, expiry,
      role:'executive', definitions:[], identified:dates.month(-18)+'T00:00:00.000Z', status:'accepted'}));
  const closed = closedRisks.map(([key, title, likelihood, impact, description, plan], index) =>
    ({key, title, likelihood, impact, description, plan, role:'program', definitions:[], identified:origin,
      likelihoodReason:'The fictional exposure was credible before the documented historical correction.',
      impactReason:'The original consequence is retained as a historical assessment, not a claim of current residual exposure.',
      closedAt:dates.month(-18+index)+'T00:00:00.000Z', status:'closed'}));
  const definitionMap = [];
  for (const [index, spec] of [...current,...accepted,...closed].entries()) {
    const next = spec.status === 'closed' ? null : dates.day(index === 0 ? -6 : index === 8 ? 0 : 12+index*7);
    const row = assessedRisk({risk_id:PREFIX+'risk_'+spec.key, display_id:allocateRiskId(counter, CID), client_id:CID,
      title:spec.title, description:'Fictional Initech: '+spec.description, category:'operational', source_type:'manual',
      status:spec.status, owner_id:account.user_id, likelihood_score:spec.likelihood, impact_score:spec.impact,
      likelihood_rationale:spec.likelihoodReason, impact_rationale:spec.impactReason,
      assessment_rationale:'Fictional human judgment. '+spec.likelihoodReason+' '+spec.impactReason,
      treatment:spec.status === 'accepted' ? 'accept' : 'mitigate', treatment_plan:spec.plan,
      created_at:spec.identified, date_identified:spec.identified.slice(0,10), created_by:actor.user_id,
      updated_at:spec.closedAt || dates.instant(-4), last_reviewed:null, next_review:next, review_cadence:'annual',
      related_task_ids:[], related_finding_ids:[], rating_history:[], decision_history:[],
      notes:SOURCE+' Fictional business owner: '+contacts[spec.role].name+'.'});
    if (spec.status === 'accepted') Object.assign(row, {accepted:true, accepted_by:actor.user_id,
      acceptance_date:dates.instant(-45), acceptance_expires_at:dates.day(spec.expiry),
      acceptance_rationale:'Fictional time-limited business-owner acceptance recorded by the scenario importer, not an actual customer decision. '+spec.plan,
      compensating_controls:spec.plan});
    if (spec.closedAt) Object.assign(row, {closed_at:spec.closedAt, closed_by:actor.user_id,
      closure_reason:'condition_removed', closure_note:'Fictional historical closure. '+spec.plan});
    validateAssignment(db, 'risks', row); db.risks.push(row);
    const review = ensureRiskReview(db, row);
    if (review) normalizeReview(review, dates, actor, spec.identified);
    // Preserve a cancelled parent for later history, without inventing occurrences
    // or reviving a closed Risk's future management obligation.
    else if (spec.closedAt) db.reviews.push(normalizeReview({review_id:'risk_review_'+row.risk_id,
      client_id:CID, risk_id:row.risk_id, title:'Risk Review — '+row.display_id+' — '+row.title,
      review_type:'risk_assessment', owner_id:account.user_id, recurrence:'annual', due_date:spec.closedAt.slice(0,10)},
    dates, actor, spec.identified, spec.closedAt));
    for (const id of spec.definitions) definitionMap.push({definition_id:id, framework_assessment_id:`fw_${CID}_assessment_${id}`,
      risk_id:row.risk_id, process_owner_id:contacts[spec.role].contact_id, remediation_owner_id:account.user_id,
      remediation_plan:spec.plan, existing_task_ids:[], provenance:SOURCE});
  }
  db.riskSequences = {...db.riskSequences, [CID]:counter.riskSequences[CID]};
  return definitionMap;
}

function createVendors(db, {dates, actor, account, contacts, origin}) {
  for (const [index, [key, name, catalogKey, service, criticality, data_types, next, renewal, role]] of vendorSpecs.entries()) {
    const active = next !== null, assurance = active && ['hosting','identity','settlement','reporting'].includes(key);
    const row = {vendor_id:PREFIX+'vendor_'+key, client_id:CID, name, catalog_key:validateCatalogKey('vendors', catalogKey),
      service, services:service, criticality, status:active ? 'active' : 'inactive', owner_id:account.user_id,
      business_owner_id:account.user_id, data_types:[...data_types], review_frequency:'annual', next_review:active ? dates.day(next) : null,
      last_review:null, created_at:origin, created_by:actor.user_id, updated_at:active ? dates.instant(-8) : dates.month(-8)+'T00:00:00.000Z',
      contract_start:dates.month(-23), contract_expiration:active ? dates.day(renewal) : dates.month(-8),
      contract_renewal:active ? dates.day(renewal) : null, contract_lead_days:60,
      contract_review_enabled:active && ['network','settlement','reporting'].includes(key), contract_evidence_ids:[],
      assurance_required:assurance, assurance_window_days:90, separate_assurance_review:key === 'hosting',
      assurance_review_date:key === 'hosting' ? dates.day(5) : null, assurance_cadence:'none', assurance_records:[],
      related_risk_ids:[], notes:SOURCE+' Fictional relationship contact: '+contacts[role].name+'.',
      contract_notes:'Fictional current agreement. The performed annual contract gap check identified missing security clauses; this record does not assert executed corrective amendments.'};
    if (key === 'reporting') Object.assign(row, {contract_notice_deadline:dates.day(25),
      contract_notes:row.contract_notes+' Fictional reporting-support term: written notice is due 45 calendar days before renewal; the internal contract Review is earlier.'});
    if (assurance) row.assurance_records.push({assurance_id:PREFIX+'assurance_'+key, type:'Security Questionnaire',
      required:true, review_status:'requested', expected_availability:dates.day(5+index),
      next_follow_up:dates.day(key === 'hosting' ? -2 : 8+index), evidence_ids:[], history:[]});
    if (!active) Object.assign(row, {offboarded_at:dates.month(-8)+'T00:00:00.000Z',
      offboarding_notes:'Fictional retired connector relationship; access was revoked. Retain its source history without scheduling a future annual Vendor Review.'});
    // This is an explicitly imported fictional lifecycle position. Passing the
    // same prior state validates it without pretending to execute onboarding.
    validateVendor(db, row, copy(row)); db.vendors.push(row);
    for (const review of ensureVendorReviews(db, row)) normalizeReview(review, dates, actor, origin);
    if (!active) db.reviews.push(normalizeReview({review_id:'vendor_review_'+row.vendor_id+'_vendor', client_id:CID,
      vendor_id:row.vendor_id, vendor_purpose:'vendor', title:'Vendor Review — '+row.name, review_type:'vendor',
      owner_id:account.user_id, recurrence:'annual', due_date:dates.month(-8)}, dates, actor, origin, row.offboarded_at));
  }
}

// This is the original immutable import request, not a reconstruction from
// visitor-editable AI/Risk/Vendor fields. The native payload builder retains its
// required steps and the command service's stable serializer retains its format.
function initialAIBody(spec, dates, ownerId, vendorUpdatedAt) {
  const at = dates.instant(spec.created);
  const preset = applyTool(blankDraft(at.slice(0,10)), catalogKeys.indexOf(spec.key));
  const draft = {...preset, owner_id:ownerId, description:spec.description, restrictions:spec.restrictions,
    environment:spec.key === 'm365' ? 'Fictional Initech tenant; separately licensed proposed Microsoft 365 Copilot pilot'
      : 'Fictional Initech managed '+preset.name+' business pilot; operational approval not recorded',
    data_types:spec.key === 'm365' ? [...preset.data_types] : spec.key === 'claude' ? ['Public'] : ['Public','Internal'],
    permitted_data_types:spec.key === 'claude' ? ['Public'] : ['Public','Internal'],
    answers:{...spec.answers}, vendor:{mode:'link', id:PREFIX+'vendor_'+spec.vendor, expected_updated_at:vendorUpdatedAt,
      name:'', service:'', owner_id:ownerId},
    risk:{title:spec.risk_title, description:'Fictional Initech: '+spec.risk_description,
      likelihood:spec.likelihood, impact:spec.impact, rationale:spec.rationale},
    riskOverride:true, overrideRationaleEdited:true, confirmations:{details:null, screening:null, risk:null}};
  draft.proposal = proposalFor(draft);
  for (const step of ['details','screening','risk']) draft.confirmations[step] = snapshot(draft, step);
  return onboardingPayload(CID, draft);
}

function createAI(db, {dates, actor, account, contacts}, identities) {
  const intake = aiRequest(db, '/ai-intake', 'post', {}, {client_id:CID, usage:'yes',
    indicators:['Third-party AI tools internally'], expected_updated_at:null});
  intake.updated_at = dates.instant(AI_INTAKE_DAY);
  for (const spec of aiSpecs) {
    const vendor = db.vendors.find(row => row.vendor_id === PREFIX+'vendor_'+spec.vendor);
    const at = dates.instant(spec.created);
    const body = initialAIBody(spec, dates, account.user_id, vendor.updated_at), key = PREFIX+'ai_onboard_'+spec.key;
    const receipt = aiOnboardingRequest(db, body, key);
    const ai = db.ai_systems.find(row => row.ai_system_id === receipt.ai_system_id);
    const risk = db.risks.find(row => row.risk_id === receipt.risk_id);
    const periodic = db.reviews.find(row => row.review_id === receipt.review_id);
    const riskReview = db.reviews.find(row => row.client_id === CID && row.risk_id === receipt.risk_id);
    if (!ai || !risk || !periodic || !riskReview || receipt.vendor_id !== vendor.vendor_id)
      reject('native AI onboarding did not retain its required same-client relationships.');
    const oldIds = {ai:ai.ai_system_id, risk:risk.risk_id, periodic:periodic.review_id, riskReview:riskReview.review_id};
    const newIds = {ai:PREFIX+'ai_'+spec.key, risk:PREFIX+'risk_'+spec.risk,
      periodic:PREFIX+'review_ai_'+spec.key, riskReview:'risk_review_'+PREFIX+'risk_'+spec.risk};
    for (const kind of Object.keys(oldIds)) identities.set(oldIds[kind], newIds[kind]);
    // Only the command's four newly created objects are normalized. Its native
    // body, actor/client/path/key scope and fingerprint remain unchanged.
    ai.ai_system_id = newIds.ai;
    ai.related_links = ai.related_links.map(link => link.kind === 'risks' && link.id === oldIds.risk ? {...link, id:newIds.risk} : link);
    risk.risk_id = newIds.risk; risk.linked_review_id = newIds.riskReview;
    riskReview.review_id = newIds.riskReview; riskReview.risk_id = newIds.risk;
    periodic.review_id = newIds.periodic; periodic.ai_system_id = newIds.ai;
    const scope = JSON.stringify([actor.user_id,CID,'/ai_systems/onboard',key]);
    const stored = db.command_requests?.[scope];
    if (!stored || JSON.stringify(stored.result) !== JSON.stringify({ai_system_id:oldIds.ai,risk_id:oldIds.risk,
      review_id:oldIds.periodic,vendor_id:vendor.vendor_id})) reject('the native AI command receipt changed unexpectedly.');
    Object.assign(stored.result, {ai_system_id:newIds.ai, risk_id:newIds.risk, review_id:newIds.periodic});
    aiRequest(db, '/ai_systems/'+newIds.ai, 'patch', {}, {expected_updated_at:ai.updated_at,
      product_model:ai.name, technical_owner_id:account.user_id, oversight_owner_id:account.user_id,
      human_review_required:true, human_approval_required:true,
      oversight_notes:'Fictional business owner '+contacts[spec.role].name+' reviews every important output before use; no autonomous operation is authorized.',
      data_settings:'Proposed fictional scope. Retention, training, sharing and access settings still require the authorized owner assessment; branding is not assurance.',
      governance_notes:SOURCE});
    // The native save replaces field values on the original row; it never
    // records an approval for this proposed deployment.
    Object.assign(ai, {created_at:at, updated_at:at, created_by:actor.user_id});
    ai.onboarding_screening.recorded_at = at;
    if (JSON.stringify(ai.onboarding_screening.scope) !== JSON.stringify(screeningScope(ai))
      || ai.status !== 'draft' || ai.approval_status !== 'pending_assessment' || ai.approval_history?.length)
      reject('the proposed AI scope must retain its native screening and pending approval.');
    Object.assign(risk, {created_at:at, date_identified:at.slice(0,10), updated_at:at, created_by:actor.user_id,
      likelihood_rationale:spec.likelihood_rationale, impact_rationale:spec.impact_rationale,
      source_type:'manual', treatment:'mitigate', treatment_plan:'Assess the proposed restricted use and output checks before any operational approval. '+spec.restrictions,
      next_review:dates.day(spec.next), review_cadence:'annual', last_reviewed:null,
      related_task_ids:[], related_finding_ids:[], rating_history:[], decision_history:[], notes:SOURCE});
    riskReview.due_date = risk.next_review;
    normalizeReview(riskReview, dates, actor, at);
    periodic.due_date = dates.day(spec.next+7);
    normalizeReview(periodic, dates, actor, at);
    // An AI periodic Review is a separate obligation, never a duplicate Risk Review.
    periodic.scope = spec.description;
    periodic.notes = SOURCE+' Review permitted use, screening and human oversight. The linked Risk has its own owner decision and annual Review.';
    vendor.related_risk_ids.push(risk.risk_id);
    validateAI(db, ai); validateAssignment(db, 'ai_systems', ai); validateAssignment(db, 'risks', risk);
  }
}

function createTasks(db, {dates, actor, account}, identities) {
  for (const spec of taskSpecs) {
    const source = spec.risk ? db.risks.find(row => row.risk_id === PREFIX+'risk_'+spec.risk)
      : spec.vendor ? db.vendors.find(row => row.vendor_id === PREFIX+'vendor_'+spec.vendor) : null;
    const review = spec.purpose ? db.reviews.find(row => row.client_id === CID
      && row.vendor_id === source.vendor_id && row.vendor_purpose === spec.purpose) : null;
    if (spec.purpose && !review) reject('the contract Action requires its existing native Vendor Review.');
    const body = {client_id:CID, title:spec.title, description:'Fictional Initech: '+spec.description,
      source_type:spec.risk ? 'risk' : spec.vendor ? 'vendor' : 'manual',
      ...(spec.risk ? {source_id:source.risk_id, risk_id:source.risk_id} : {}),
      ...(spec.vendor ? {source_id:source.vendor_id, vendor_id:source.vendor_id} : {}),
      ...(review ? {review_id:review.review_id} : {}),
      ...(spec.assurance ? {assurance_id:source.assurance_records[0].assurance_id} : {}),
      priority:spec.priority, status:'open', assignee_id:spec.unassigned ? null : account.user_id,
      due_date:dates.day(spec.due), governance_context:organizationalContext()};
    guardEdit('tasks', body, {}, actor, db);
    const task = write(db, 'tasks', body), oldId = task.task_id;
    task.task_id = PREFIX+'task_'+spec.key; identities.set(oldId, task.task_id);
    Object.assign(task, {created_at:dates.instant(-30), updated_at:dates.instant(-30), created_by:actor.user_id});
    if (spec.status !== 'open') {
      const next = {status:spec.status, ...(spec.resolution ? {resolution:spec.resolution} : {})};
      guardEdit('tasks', next, task, actor, db);
      write(db, 'tasks', next, task.task_id);
      task.updated_at = dates.instant(spec.status === 'done' ? -12 : spec.status === 'cancelled' ? -11 : -5);
      if (spec.status === 'in_progress') Object.assign(task, {started_at:dates.instant(-15), started_by:account.user_id});
      if (spec.status === 'done') Object.assign(task, {completed_at:dates.instant(-12), completed_by:actor.user_id});
    }
    if (spec.risk) source.related_task_ids.push(task.task_id);
  }
}

function normalizeNewAudits(db, originalLogs, identities, {dates}) {
  const addedCount = db.logs.length-originalLogs.length;
  if (addedCount < 0 || JSON.stringify(db.logs.slice(addedCount)) !== JSON.stringify(originalLogs))
    reject('native services changed a retained audit record.');
  const added = db.logs.slice(0, addedCount);
  if (added.some(row => originalLogs.some(original => [original.audit_id,original.log_id].filter(Boolean)
    .some(id => id === row.audit_id || id === row.log_id)))) reject('a native audit identity collides with a retained event.');
  const reserved = new Set(added.map((_, index) => PREFIX+'operations_audit_'+index));
  if (originalLogs.some(row => reserved.has(row.audit_id) || reserved.has(row.log_id)))
    reject('a new audit identity collides with a retained audit_id or log_id.');
  for (const [index, row] of added.entries()) {
    if (row.client_id !== CID) reject('the operational import produced an audit for another client.');
    row.audit_id = PREFIX+'operations_audit_'+index;
    row.entity_id = identities.get(row.entity_id) || row.entity_id;
    for (const key of ['id','risk_id','review_id','task_id','ai_system_id']) {
      if (row.meta?.[key] && identities.has(row.meta[key])) row.meta[key] = identities.get(row.meta[key]);
    }
    const source = row.entity_type === 'clients' ? null : (db[row.entity_type] || [])
      .find(record => ['ai_system_id','risk_id','review_id','task_id','vendor_id'].some(key => record[key] === row.entity_id));
    const taskId = row.entity_type === 'tasks' ? row.entity_id : row.meta?.task_id;
    const task = taskId ? db.tasks.find(record => record.client_id === CID && record.task_id === taskId) : null;
    if (taskId && !task) reject('a native Action audit has no same-client Action.');
    // Native saves also write Action events on their parent Risk/Vendor/Review.
    // Their event clock belongs to the Action, while their entity stays the parent.
    if (task) {
      row.at = row.action === 'Action Item created' ? task.created_at
        : row.action === 'Work started' ? task.started_at
          : row.action === 'Action Item completed' ? task.completed_at : task.updated_at;
      if (!row.at) reject('a native Action audit has no corresponding lifecycle date.');
    } else row.at = row.action === 'AI intake updated' ? dates.instant(AI_INTAKE_DAY)
      : /created|^create$/.test(row.action) ? source?.created_at || dates.instant(-6) : source?.updated_at || dates.instant(-6);
    row.meta = {...row.meta, simulated:true, source:SOURCE};
  }
  return added;
}

function relatedResult(db, contacts = processContacts(db, {})) {
  const risks = mine(db, 'risks').filter(row => row.risk_id.startsWith(PREFIX));
  const vendors = mine(db, 'vendors').filter(row => row.vendor_id.startsWith(PREFIX));
  const ai_systems = mine(db, 'ai_systems').filter(row => row.ai_system_id.startsWith(PREFIX));
  const tasks = mine(db, 'tasks').filter(row => row.task_id.startsWith(PREFIX));
  const reviews = mine(db, 'reviews').filter(row => risks.some(risk => risk.risk_id === row.risk_id)
    || vendors.some(vendor => vendor.vendor_id === row.vendor_id) || ai_systems.some(ai => ai.ai_system_id === row.ai_system_id));
  return {risks, vendors, ai_systems, tasks, reviews,
    source_definition_risks:safeguardRisks.map(([key, id, , , , , , role]) => ({definition_id:id,
      framework_assessment_id:`fw_${CID}_assessment_${id}`, risk_id:PREFIX+'risk_'+key,
      process_owner_id:contacts[role].contact_id, remediation_owner_id:risks.find(row => row.risk_id === PREFIX+'risk_'+key)?.owner_id,
      remediation_plan:initechSafeguardContent(id, statusFor(id)).remediation, existing_task_ids:[], provenance:SOURCE})),
    review_origins:reviews.map(row => ({review_id:row.review_id, source_kind:row.risk_id ? 'risks' : row.vendor_id ? 'vendors' : 'ai_systems',
      source_id:row.risk_id || row.vendor_id || row.ai_system_id, origin:row.created_at, terminal_at:row.cancelled_at || null, provenance:SOURCE})),
    risk_lifecycles:risks.map(row => ({risk_id:row.risk_id, identified_at:row.created_at, assessed_at:row.created_at,
      accepted_at:row.acceptance_date || null, closed_at:row.closed_at || null, owner_id:row.owner_id,
      treatment_started_at:tasks.filter(task => task.risk_id === row.risk_id).map(task => task.created_at).sort()[0] || null,
      closure_note:row.closure_note || null})),
    ai_commands:aiSpecs.map(spec => {
      const key = PREFIX+'ai_onboard_'+spec.key;
      const scope = Object.keys(db.command_requests || {}).find(value => {
        try {const parts = JSON.parse(value); return parts[1] === CID && parts[2] === '/ai_systems/onboard' && parts[3] === key;} catch {return false;}
      });
      const receipt = db.command_requests?.[scope];
      return {key, scope, fingerprint:receipt?.fingerprint,
        result:receipt?.result && typeof receipt.result === 'object' ? copy(receipt.result) : null};
    }),
    evidence_specs:[...risks.map(row => ({key:'risk_'+row.risk_id.slice(PREFIX.length), linked_type:'risk', linked_id:row.risk_id,
      title:row.title+' — fictional assessment and decision record', content_outline:[row.description,row.assessment_rationale,row.treatment_plan,row.acceptance_rationale || row.closure_note || SOURCE]})),
    ...vendors.map(row => ({key:'vendor_'+row.vendor_id.slice(PREFIX.length), linked_type:'vendor', linked_id:row.vendor_id,
      title:row.name+' — fictional relationship record', content_outline:[row.service,row.contract_notes,row.offboarding_notes || 'Retain annual review, assurance follow-up and contract decision separately.']})),
    ...ai_systems.map(row => ({key:'ai_'+row.catalog_key, linked_type:'ai_system', linked_id:row.ai_system_id,
      title:row.name+' — proposed fictional use and screening', relationships:copy(row.related_links), content_outline:[row.description,row.restrictions,row.oversight_notes,SOURCE]})),
    ...tasks.map(row => ({key:'task_'+row.task_id.slice(PREFIX.length), linked_type:'task', linked_id:row.task_id,
      title:row.title+' — fictional operational work', content_outline:[row.description,row.resolution || 'Work is not complete; retain an actual result before recording completion.']}))]};
}

function assertOriginalAIReceipts(db, result, {dates, account}) {
  for (const spec of aiSpecs) {
    const key = PREFIX+'ai_onboard_'+spec.key;
    const ai = result.ai_systems.find(row => row.ai_system_id === PREFIX+'ai_'+spec.key);
    const scope = JSON.stringify([ai.created_by,CID,'/ai_systems/onboard',key]);
    const candidates = Object.entries(db.command_requests || {}).filter(([candidate]) => {
      try {
        const parts = JSON.parse(candidate);
        return Array.isArray(parts) && parts.length === 4 && parts[1] === CID && parts[3] === key;
      } catch {return false;}
    });
    const expected = {ai_system_id:ai.ai_system_id, risk_id:PREFIX+'risk_'+spec.risk,
      review_id:PREFIX+'review_ai_'+spec.key, vendor_id:PREFIX+'vendor_'+spec.vendor};
    const receipt = db.command_requests?.[scope];
    // Compare with the original authored request, never mutable saved fields.
    // This is fixture reconciliation, not command execution or receipt repair.
    const fingerprint = stable(initialAIBody(spec, dates, account.user_id, dates.instant(-8)));
    if (typeof ai.created_by !== 'string' || !ai.created_by || candidates.length !== 1 || candidates[0][0] !== scope
      || !receipt || typeof receipt.result !== 'object' || receipt.result === null || Array.isArray(receipt.result)
      || stable(receipt.result) !== stable(expected) || receipt.fingerprint !== fingerprint
      || !result.risks.some(row => row.risk_id === expected.risk_id && row.client_id === CID)
      || !result.vendors.some(row => row.vendor_id === expected.vendor_id && row.client_id === CID)
      || !result.reviews.some(row => row.review_id === expected.review_id && row.client_id === CID))
      reject('the original AI command receipt requires explicit reconciliation.');
  }
}

function assertComplete(db, context) {
  const {contacts} = context;
  const result = relatedResult(db, contacts), expectedRisks = [...safeguardRisks,...businessRisks,...acceptedRisks,...closedRisks]
    .map(row => PREFIX+'risk_'+row[0]).concat(aiSpecs.map(spec => PREFIX+'risk_'+spec.risk));
  if (mine(db, 'risks').length !== 29 || result.risks.length !== 29 || mine(db, 'vendors').length !== 15
    || result.vendors.length !== 15 || mine(db, 'ai_systems').length !== 3 || result.ai_systems.length !== 3
    || mine(db, 'tasks').length !== 10 || result.tasks.length !== 10 || result.reviews.length !== 51
    || expectedRisks.some(id => !result.risks.some(row => row.risk_id === id))
    || vendorSpecs.some(([key]) => !result.vendors.some(row => row.vendor_id === PREFIX+'vendor_'+key))
    || aiSpecs.some(spec => !result.ai_systems.some(row => row.ai_system_id === PREFIX+'ai_'+spec.key))
    || taskSpecs.some(spec => !result.tasks.some(row => row.task_id === PREFIX+'task_'+spec.key))
    || result.ai_commands.some(command => !command.scope || !command.result))
    reject('an incomplete or retained operational scenario requires explicit reconciliation.');
  for (const [kind, field] of [['risks','risk_id'],['vendors','vendor_id'],['ai_systems','ai_system_id'],['reviews','review_id'],['tasks','task_id']]) {
    if (new Set((db[kind] || []).map(row => row[field])).size !== db[kind].length)
      reject('a generated identity collides with a retained record.');
  }
  assertOriginalAIReceipts(db, result, context);
  return result;
}

function validateNewRelationships(db, result) {
  for (const risk of result.risks) {
    validateAssignment(db, 'risks', risk);
    const native = assessedRisk(risk), reviews = result.reviews.filter(row => row.risk_id === risk.risk_id);
    if (risk.risk_score !== native.risk_score || risk.risk_level !== native.risk_level || reviews.length !== 1
      || reviews[0].recurrence !== 'annual' || (risk.status === 'closed'
        ? risk.next_review !== null || reviews[0].status !== 'cancelled'
        : reviews[0].due_date !== risk.next_review)) reject('Risk assessment or annual Review relationships are inconsistent.');
  }
  for (const vendor of result.vendors) {
    validateVendor(db, vendor, copy(vendor));
    const primary = result.reviews.filter(row => row.vendor_id === vendor.vendor_id && row.vendor_purpose === 'vendor');
    if (primary.length !== 1 || primary[0].recurrence !== 'annual' || (vendor.status === 'inactive'
      ? vendor.next_review !== null || primary[0].status !== 'cancelled' : primary[0].due_date !== vendor.next_review))
      reject('Vendor annual Review relationships are inconsistent.');
  }
  for (const ai of result.ai_systems) {
    validateAI(db, ai); validateAssignment(db, 'ai_systems', ai);
    const spec = aiSpecs.find(row => PREFIX+'ai_'+row.key === ai.ai_system_id);
    const links = ai.related_links.filter(row => row.kind === 'risks');
    if (links.length !== 1 || links[0].id !== PREFIX+'risk_'+spec.risk
      || !result.risks.some(row => row.risk_id === links[0].id && row.client_id === CID)
      || ai.vendor_id !== PREFIX+'vendor_'+spec.vendor || ai.status !== 'draft'
      || ai.approval_status !== 'pending_assessment' || ai.approval_history?.length)
      reject('AI onboarding must reuse its exact same-client Risk and Vendor without an approval.');
  }
  for (const review of result.reviews) {
    validateAssignment(db, 'reviews', review); validateGovernanceContext(review.governance_context);
    if (review.current_occurrence_id !== 'occ_'+review.review_id || review.occurrences.length
      || review.risk_id && !result.risks.some(row => row.risk_id === review.risk_id)
      || review.vendor_id && !result.vendors.some(row => row.vendor_id === review.vendor_id)
      || review.ai_system_id && !result.ai_systems.some(row => row.ai_system_id === review.ai_system_id))
      reject('a supplemental Review has an invalid source or occurrence relationship.');
  }
}

// Source construction only; normal navigation must not call this to reset a
// retained scenario. A complete repeat returns the saved records without writes.
export function seedInitechOperations(db, options = {}) {
  const context = authorContext(db, options);
  if (['risks','vendors','ai_systems','tasks'].some(kind => mine(db, kind).length)) return assertComplete(db, context);
  assertFreshGovernance(db, context);
  const staged = copy(db), identities = new Map();
  staged.ai_intake ||= {}; staged.ai_counters ||= {}; staged.riskSequences ||= {}; staged.command_requests ||= {};
  createRisks(staged, context);
  createVendors(staged, context);
  createAI(staged, context, identities);
  createTasks(staged, context, identities);
  const addedLogs = normalizeNewAudits(staged, db.logs || [], identities, context);
  const result = assertComplete(staged, context);
  validateNewRelationships(staged, result);
  // Preserve every original object and map entry. Native services may initialize
  // cloned foreign counters; only this client's new values are published.
  for (const kind of ['risks','vendors','ai_systems','tasks','reviews']) {
    const originalIds = new Set((db[kind] || []).map(row => row[{risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',tasks:'task_id',reviews:'review_id'}[kind]]));
    const added = staged[kind].filter(row => row.client_id === CID && !originalIds.has(row[{risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',tasks:'task_id',reviews:'review_id'}[kind]]));
    db[kind] = [...(db[kind] || []), ...added];
  }
  db.ai_intake = {...db.ai_intake, [CID]:staged.ai_intake[CID]};
  db.ai_counters = {...db.ai_counters, [CID]:staged.ai_counters[CID]};
  db.riskSequences = {...db.riskSequences, [CID]:staged.riskSequences[CID]};
  db.command_requests = {...db.command_requests, ...Object.fromEntries(Object.entries(staged.command_requests)
    .filter(([key]) => !Object.hasOwn(db.command_requests || {}, key)))};
  db.logs = [...addedLogs, ...(db.logs || [])];
  return relatedResult(db, context.contacts);
}
