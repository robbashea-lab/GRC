import {assessedRisk} from '../lib/grcWork';
import {activeDefinitions} from '../lib/frameworks';
import {applyTool, blankDraft, catalogKeys, onboardingPayload, proposalFor, snapshot, screeningScope} from '../lib/aiOnboarding';
import {validateAI} from '../lib/aiGovernance';
import {validateCatalogKey} from '../lib/registerCatalogIdentity';
import {reviewSchedule, reviewView, scheduledDate} from '../lib/reviewOccurrences';
import {validateGovernanceContext} from '../lib/requirementBasis';
import {eligible, validateAssignment} from './assignmentEligibility';
import {allocateRiskId} from './riskIds';
import {ensureRiskReview} from './risks';
import {ensureVendorReviews, validateVendor} from './vendors';
import {guardEdit} from './decisions';
import {write} from './store';
import {aiRequest} from './aiGovernance';
import {aiOnboardingRequest} from './aiOnboarding';
import {stable} from './commandRequests';
import {krustyOnboardingSelection} from './cisCanonicalKrustyBaseline';
import {krustySafeguardContent} from './cisCanonicalKrustyContent';

const CID = 'demo_krusty_krab';
const PREFIX = CID+'_canonical_';
const AI_INTAKE_DAY = -7;
const SOURCE = 'Explicit fictional Krusty operational import through native domain services; not browser execution, an in-app AI approval, verified evidence or a CIS-mandated supplemental activity.';
const copy = value => JSON.parse(JSON.stringify(value));
const mine = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);
const reject = message => {throw new Error('Krusty operations: '+message);};


const ROLES = {
  executive:'Eugene Krabs — Executive sponsor',
  operations:'Squidward Tentacles — Franchise operations coordinator',
  engineering:'SpongeBob SquarePants — Engineering and infrastructure lead',
};

const organizationalContext = () => ({category:'organizational', rationale:SOURCE,
  cadence_source:'organization_defined',
  cadence_rationale:'Annual management review is an explicit fictional operating choice. Risk acceptance expiry, AI review, assurance follow-up and contract notice remain separate.'});

// Residual business exposures coexist with the implemented CIS program.
// The three native AI-onboarding Risks complete the 15 open/treatment cohort.
const businessRisks = [
  ['lunch-peak','Promotion demand may exceed reserved lunch capacity',4,4,
    'All twelve restaurants have tested ordering capacity and a staffed fallback; an unusually successful promotion can still exceed the business reserve.',
    'Recent promotions create a credible correlated surge across outlets despite tested technical controls.',
    'A sustained peak could delay orders and require refunds across several restaurants.',
    'Reserve extra fulfillment capacity and rehearse the existing overflow decision.','operations'],
  ['coastal-storm','Regional storm can interrupt several restaurants',3,5,
    'Diversified connectivity and tested recovery operate, but a regional storm may interrupt physical access and local utility supply at several outlets.',
    'Seasonal regional weather remains plausible despite resilient architecture and recovery controls.',
    'Simultaneous site closures could materially reduce franchise trading for several days.',
    'Confirm alternate trading arrangements and management communications within the established continuity plan.','executive'],
  ['ingredient-promotion','Promotional ingredient supply is concentrated',3,3,
    'A planned menu promotion depends on a limited seasonal ingredient allocation; approved alternatives and safe menu-change controls remain in place.',
    'Demand variation and coastal delivery windows can coincide.',
    'Short supply could require a bounded promotion change and guest communication.',
    'Agree substitute menu messaging and commercial reserve stock with outlet coordinators.','operations'],
  ['franchise-handover','New franchise handover has parallel business dependencies',3,3,
    'The controlled technical onboarding process operates; lease, staffing and opening publicity still require coordinated commercial decisions.',
    'Parallel commercial approvals make a handover delay plausible.',
    'A delay could postpone one restaurant opening without weakening existing enterprise controls.',
    'Track the commercial decision sequence and accountable alternates.','operations'],
  ['seasonal-cover','Seasonal demand can consume the staffing reserve',3,2,
    'The 216-person workforce has current security training and role authorization; unusual guest demand can still exceed the planned relief roster.',
    'Peak demand and ordinary planned leave may overlap.',
    'The effect is bounded guest-service delay and overtime, rather than an unimplemented security duty.',
    'Confirm voluntary reserve cover and the established outlet-support handoff.','operations'],
  ['payment-dependency','Payment-reference service has residual concentration',2,4,
    'Card entry stays with the separate payment service; an extended provider outage can delay reference reconciliation despite the documented business fallback.',
    'Stable operation and an exercised fallback reduce likelihood, while external dependency remains.',
    'A prolonged interruption could delay payment-reference reconciliation across outlets.',
    'Exercise the commercial fallback and confirm escalation thresholds without moving card data into ordering.','engineering'],
  ['insurance-limit','Business interruption deductible retains financial exposure',2,4,
    'Management maintains a documented insurance and continuity decision, but the chosen deductible leaves a retained financial exposure.',
    'A material insured event is possible even with implemented security and continuity practices.',
    'The retained deductible could create a substantial short-term cash requirement.',
    'Review the next policy term and liquidity reserve as a business decision.','executive'],
  ['refrigeration-service','Cold-chain service repair can disrupt a local menu',2,3,
    'Managed kitchen controllers are inventoried and secured; mechanical repair availability still affects restaurant trading.',
    'Equipment wear and technician availability can coincide despite routine maintenance.',
    'An outlet may temporarily restrict a menu while safe alternate storage is used.',
    'Confirm commercial maintenance cover and the established safe menu-restriction fallback.','operations'],
  ['delivery-experience','Courier handoff can affect the franchise reputation',3,2,
    'Approved handoff and customer-contact handling operate; third-party delivery timing remains a residual guest-experience dependency.',
    'Unusual local demand or travel disruption may delay a handoff.',
    'A bounded set of guests may need refunds or corrected delivery communication.',
    'Rehearse the guest-care escalation and commercial service-level discussion.','operations'],
  ['license-growth','Restaurant growth can increase software license cost',2,3,
    'All deployed software is supported and authorized; a future expansion could exceed the commercial volume forecast.',
    'Opening dates and workforce growth may diverge from the budget assumption.',
    'A pricing change could require a bounded budget or rollout decision before new seats are activated.',
    'Reconcile the expansion forecast with licensed capacity before procurement.','engineering'],
  ['recipe-rights','Franchise recipe-rights dispute can delay a promotion',2,3,
    'Restricted recipe access and maintained franchise terms operate; a commercial interpretation dispute can still delay an approved menu proposal.',
    'A novel promotion may require interpretation of existing commercial rights.',
    'A disputed proposal could be deferred with bounded revenue and communication impact.',
    'Obtain the accountable commercial interpretation before launching the promotion.','executive'],
  ['site-power','Utility interruption can outlast local trading cover',2,5,
    'Enterprise recovery and safe shutdown procedures are current; a prolonged utility outage remains a physical trading dependency.',
    'Recent service is stable and safe shutdown reduces exposure, but prolonged interruption remains possible.',
    'One or more outlets may suspend trading until utilities recover.',
    'Confirm local business relocation and stock-transfer arrangements under the existing continuity process.','operations'],
];
const acceptedRisks = [
  ['public-notice','Human-checked public notice has a short publication lag',1,2,'A named coordinator verifies public restaurant notices before publication.',
    'Second-person verification and low publishing volume reduce the likelihood of a harmful delay.','A short lag causes limited guest-service rework.',
    'Retain the human check and monitor the publication interval.',30],
  ['archive-retrieval','Older franchise records require a controlled retrieval window',2,2,'Approved archived franchise records are retrieved through the controlled retention process rather than ordinary live storage.',
    'Requests are infrequent and known to the accountable owner.','An urgent request can require bounded manual retrieval effort.',
    'Retain the retrieval runbook and authorized alternate operator.',90],
  ['after-hours','After-hours commercial support has limited reserve capacity',2,3,'A trained alternate supports the low-volume after-hours commercial rota.',
    'A documented fallback reduces the likelihood of an unanswered urgent commercial enquiry.','An exceptional enquiry could wait for the accountable decision maker.',
    'Retain the alternate rota and reassess if business volumes change.',180],
  ['print-supplier','Low-volume printed menu work depends on one specialist',1,3,'One specialist produces public menu print runs under an approved manual alternative.',
    'Low volume and a ready alternative make prolonged disruption unlikely.','A delayed run could cause bounded printing and guest-communication costs.',
    'Retain the approved alternate and review the commercial dependency.',270],
];
const closedRisks = [
  ['retired-pos-route','Retired POS support route retained obsolete access',3,3,'An obsolete historical POS support connection outlived its replacement.','The old route was removed and a negative-access check confirmed it was unavailable.'],
  ['old-menu-account','Retired menu publisher retained an unused identity',3,3,'A former menu-publishing integration retained an unnecessary service identity.','The identity was disabled, credentials revoked and the current route validated.'],
  ['outlet-alert','Historical outlet escalation destination was stale',2,3,'A former branch escalation destination remained in a historical notification rule.','The route was corrected and a harmless test reached the accountable coordinator.'],
  ['retired-kiosk','Historical kiosk image contained an obsolete package',3,2,'A retired kiosk image had an unsupported historical component.','The image was withdrawn and supported deployment was confirmed.'],
  ['public-recipe-link','Historical recipe export had excessive sharing',3,4,'A fictional historical recipe export had an unnecessary sharing permission.','Sharing was revoked and unauthorized access was checked as denied.'],
  ['old-franchise-key','Retired franchise integration shared a secret',3,4,'Two former integrations once reused an old service secret.','The integrations were separated, credentials rotated and old-secret access denied.'],
  ['old-certificate','Historical ordering certificate lacked a reminder owner',2,3,'A retired ordering endpoint certificate had an incomplete reminder assignment.','The live inventory gained ownership and renewal monitoring; the retired certificate was removed.'],
  ['legacy-hr-export','Historical staff export had unnecessary readers',2,3,'A former personnel export had an overly broad internal reader group.','The scope was restricted and effective membership validated before closure.'],
  ['carrier-contact','Historical connectivity escalation sheet was outdated',2,2,'A historical connectivity sheet referenced a former commercial contact.','The sheet was corrected and a controlled routing exercise confirmed the current path.'],
  ['retired-hosting','Old galley hosting retained an unused entitlement',3,3,'The then-active Old Galley Hosting relationship retained an obsolete support entitlement.','Only the obsolete support entitlement was revoked, and denied-access validation confirmed that entitlement was unavailable; the provider relationship remained active.'],
];
// Preset identities describe fictional relationships, not product guarantees.


const vendorSpecs = [
  ['workspace','Microsoft 365','microsoft-365','Fictional franchise workforce collaboration tenant; proposed separately licensed Copilot pilot','high',['Internal','Employee Data'],30,180,'operations'],
  ['hosting','Amazon Web Services','amazon-web-services','Fictional ordering and franchise application hosting relationship','critical',['Operational Data','Network / System Access'],45,200,'engineering'],
  ['identity','Okta','okta','Fictional managed workforce identity relationship','high',['Employee Data','Network / System Access'],60,240,'engineering'],
  ['vault','1Password','1password','Fictional controlled business credential-vault subscription','high',['Credentials'],90,260,'engineering'],
  ['payroll','ADP','adp','Fictional payroll administration for the 216-person workforce','high',['Employee Data','Financial'],120,280,'operations'],
  ['engineering','Atlassian Jira & Confluence','atlassian-jira-confluence','Fictional ordering-development issue and design workspace','high',['Internal','Source Code / IP'],150,300,'engineering'],
  ['signing','DocuSign','docusign','Fictional franchise business-agreement routing service','medium',['Internal','Confidential'],180,330,'executive'],
  ['openai','OpenAI',null,'Proposed ChatGPT public-menu wording pilot; no operational approval recorded','low',['No Sensitive Data'],335,350,'operations'],
  ['anthropic','Anthropic',null,'Proposed Claude public-material summary pilot; no operational approval recorded','low',['No Sensitive Data'],335,350,'operations'],
  ['payment','Pearl Token Payments (fictional)',null,'Separate fictional payment service exchanges references, not card numbers or security codes, with ordering','critical',['Operational Data','API / Integration Access'],12,72,'engineering'],
  ['network','Bikini Bottom Connectivity (fictional)',null,'Fictional restaurant connectivity and business escalation relationship','high',['Network / System Access'],30,90,'engineering'],
  ['pos','Coral POS Support (fictional)',null,'Fictional supported POS maintenance and controlled restaurant-service engagement','high',['Operational Data','Network / System Access'],60,120,'engineering'],
  ['cold-chain','Sandy Cold-Chain Service (fictional)',null,'Fictional kitchen-equipment maintenance coordination; enterprise controller access remains restricted','medium',['Operational Data'],210,340,'operations'],
  ['testing','Tidepool Security Testing (fictional)',null,'Fictional authorized infrastructure and application testing engagement','medium',['Internal','Network / System Access'],240,360,'engineering'],
  ['retired','Old Galley Hosting (fictional)',null,'Retired fictional hosting relationship retained for historical context','low',['No Sensitive Data'],null,null,'operations'],
];

const aiSpecs = [
  {key:'chatgpt',vendor:'openai',risk:'ai-menu-copy',role:'operations',likelihood:2,impact:2,created:-6,next:12,
    description:'Proposed drafting of public menu descriptions from approved public ingredients and wording; a franchise editor checks each statement before use.',
    restrictions:'Public material only. No recipes, employee/customer information, allergens decisions, confidential inputs, automatic publication or autonomous actions. Operational approval is not recorded.',
    risk_title:'AI menu drafts may misstate approved public wording',
    risk_description:'A proposed public-material ChatGPT draft could introduce an unsupported menu claim; it cannot publish or change an order.',
    rationale:'Fictional human override: likelihood 2 because an editor checks each draft against approved public wording; impact 2 because an error would cause bounded copy rework. No safety or allergen decision is delegated.',
    likelihood_rationale:'A named editor checks each sample against approved public wording; proposed deployment settings still require the owner decision.',
    impact_rationale:'An unsupported public phrase causes bounded communication rework; no safety decision or automatic publication is enabled.',
    answers:{managed:true,sensitive:false,connected:false,writes:false,autonomous:false,external:false,consequential:false,harm:false,oversight:true,settings:false}},
  {key:'claude',vendor:'anthropic',risk:'ai-franchise-brief',role:'operations',likelihood:2,impact:2,created:-5,next:30,
    description:'Proposed summaries of approved public franchise announcements for internal briefing preparation; Squidward checks each claim against its source.',
    restrictions:'Approved Public material only. No employee, customer, recipe or confidential information; no supplier decisions or automatic publication. Operational approval is not recorded.',
    risk_title:'AI public-announcement summaries may omit an important qualification',
    risk_description:'A proposed Claude summary can omit a qualification in public franchise material even without sensitive data.',
    rationale:'Fictional human override: likelihood 2 because each summary is compared with its approved public source; impact 2 because the bounded result is briefing correction. No consequential decision or autonomous publication is enabled.',
    likelihood_rationale:'The editor compares every summary with its approved public source, reducing the likelihood of reusing an unsupported statement.',
    impact_rationale:'An omission requires bounded internal briefing correction, not an autonomous business or safety decision.',
    answers:{managed:true,sensitive:false,connected:false,writes:false,autonomous:false,external:false,consequential:false,harm:false,oversight:true,settings:false}},
  {key:'m365',vendor:'workspace',risk:'ai-tenant-context',role:'executive',likelihood:3,impact:3,created:-4,next:60,
    description:'Proposed Microsoft 365 Copilot summaries within existing tenant permissions; employee or franchise context may be reachable before the pilot scope is approved.',
    restrictions:'Proposed restricted pilot only. Public/Internal outputs; exclude personnel, customer, recipe and franchise-confidential summaries, HR decisions, permission changes and autonomous actions. No operational approval recorded.',
    risk_title:'Workspace AI summaries may carry unintended franchise context',
    risk_description:'The proposed connected Copilot scope can encounter employee or franchise content through existing permissions, creating an onward-sharing exposure.',
    rationale:'Fictional human judgment: likelihood 3 because connected tenant context may enter a prompt despite output restrictions; impact 3 because a bounded internal disclosure would require response. Existing permissions are not expanded.',
    likelihood_rationale:'Connected tenant context can enter an otherwise bounded prompt, making unintended inclusion plausible.',
    impact_rationale:'Improper onward sharing could expose a bounded set of employee or franchise context; production writes and autonomous action are disabled.',
    answers:{managed:true,sensitive:true,connected:true,writes:false,autonomous:false,external:true,consequential:false,harm:false,oversight:true,settings:false}},
];

const taskSpecs = [
  {key:'peak-cover',risk:'lunch-peak',title:'Confirm the promotion overflow decision and reserve capacity',priority:'high',status:'in_progress',due:0,description:'Rehearse the existing fallback for an exceptional promotion surge; this is supplemental commercial work, not a missing CIS safeguard.'},
  {key:'storm-trading',risk:'coastal-storm',title:'Confirm alternate trading communications for the storm season',priority:'high',status:'open',due:-5,unassigned:true,description:'Confirm business relocation and guest communications under the current tested continuity process; required recovery tests remain separate.'},
  {key:'reserve-roster',risk:'seasonal-cover',title:'Confirm the next voluntary franchise relief roster',priority:'medium',status:'open',due:12,description:'Reconcile commercial relief availability and accountable alternates without implying missing security training or access authorization.'},
  {key:'cold-chain-cover',risk:'refrigeration-service',title:'Confirm the future mechanical maintenance window',priority:'low',status:'blocked',due:30,description:'Await the fictional service window while the existing safe menu-restriction fallback remains available.',resolution:'Blocked pending the commercial maintenance window; existing safe operating arrangements continue.'},
  {key:'menu-briefing',title:'Publish the approved public promotion briefing',priority:'informational',status:'open',due:3,description:'Coordinate already approved public wording; no AI publication or new CIS requirement is implied.'},
  {key:'deductible-review',risk:'insurance-limit',title:'Review the next business-interruption deductible',priority:'medium',status:'open',due:60,description:'Compare the commercial liquidity reserve and next insurance term without treating a policy brand as assurance.'},
  {key:'payment-notice',vendor:'payment',purpose:'contract',title:'Decide the payment-reference service renewal scope',priority:'high',status:'open',due:12,description:'Use the existing native Contract Renewal Review, including a new assessment before renewal; annual assessment and relationship work remain separately scoped.'},
  {key:'next-assurance',vendor:'hosting',assurance:true,title:'Confirm next-cycle hosting assurance scope',priority:'medium',status:'open',due:30,description:'Follow up the next-cycle requested material. The declared current provider assessment remains current; this is not a claim of received or verified bytes.'},
  {key:'retired-check',title:'Record the completed retired support-path check',priority:'low',status:'done',due:-14,description:'A fictional bounded follow-up confirmed the retired support path remained unavailable; it does not close another Risk or Finding.',resolution:'The retired route was unavailable and the current support path remained usable in the fictional check.'},
  {key:'duplicate-briefing',title:'Cancel the duplicate promotion coordination briefing',priority:'informational',status:'cancelled',due:-10,description:'Withdraw a duplicate commercial coordination item while retaining the authoritative briefing.',resolution:'Cancelled as duplicate coordination; no assessment, Review, Risk or Finding was completed.'},
];

function processContacts(db, processOwners) {
  if (!processOwners || typeof processOwners !== 'object' || Array.isArray(processOwners)) reject('processOwners must map existing Contact roles.');
  return Object.fromEntries(Object.entries(ROLES).map(([key, role]) => {
    const supplied = processOwners[role] || processOwners[key];
    const id = typeof supplied === 'string' ? supplied : supplied?.contact_id;
    const matches = (db.contacts || []).filter(row => id ? row.contact_id === id : row.client_id === CID && row.name === role.split(' — ')[0]);
    if (matches.length !== 1 || matches[0].client_id !== CID || matches[0].status !== 'active' || matches[0].name !== role.split(' — ')[0])
      reject('use the existing active Krusty Contact for '+role+'.');
    return [key, matches[0]];
  }));
}

function authorContext(db, {dates, owner, processOwners = {}}) {
  const clients = mine(db, 'clients'), client = clients[0], actor = db.user;
  if (actor?.workspace_mode !== 'demo' || !eligible(actor, CID) || !['super_admin','platform_admin'].includes(actor.role)
    || !db.users?.some(row => row.user_id === actor.user_id && row.name === actor.name && row.email === actor.email
      && row.role === actor.role && row.workspace_mode === 'demo' && eligible(row, CID))
    || clients.length !== 1 || client.environment !== 'Demo' || client.status !== 'active' || client.archived || client.archived_at
    || client.framework_settings?.['cis-ig1']?.implementation_group !== 3 || db.baselines?.[CID]?.completed !== true
    || db.baselines[CID].version !== 3 || !mine(db,'requirements').some(row => row.baseline_key === 'cis-ig1' && row.baseline_response === 'applies'))
    reject('an existing authorized administrator and completed canonical IG3 Demo baseline are required.');
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor)
    || !['day','instant','month'].every(key => typeof dates[key] === 'function') || dates.instant(0) !== dates.anchor
    || !scheduledDate(dates.anchor)) reject('provide the frozen native UTC date helpers.');
  const origin = dates.month(-60)+'T00:00:00.000Z', baselineOrigin = client.initial_program_baseline?.completed_at;
  if (!scheduledDate(origin) || origin >= dates.anchor || !scheduledDate(baselineOrigin)
    || baselineOrigin < [origin,'2024-07-01T00:00:00.000Z'].sort().at(-1) || baselineOrigin >= dates.anchor)
    reject('retain the five-year organization origin and post-release CIS enrollment boundary.');
  const ownerId = typeof owner === 'string' ? owner : owner?.user_id, accounts = (db.users || []).filter(row => row.user_id === ownerId);
  if (accounts.length !== 1 || !eligible(accounts[0],CID)
    || !['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(accounts[0].role))
    reject('use an existing capable same-client application owner.');
  return {dates,client,actor,account:accounts[0],contacts:processContacts(db,processOwners),origin,baselineOrigin};
}

function assertFreshGovernance(db, {account,baselineOrigin}) {
  const {policy_keys,plans} = krustyOnboardingSelection(), assessments = mine(db,'framework_assessments');
  const policies = mine(db,'policies'), reviews = mine(db,'reviews'), definitions = activeDefinitions('cis-ig1',{implementation_group:3});
  if (definitions.length !== 153 || assessments.length !== 153 || policies.length !== policy_keys.length || policy_keys.length !== 9)
    reject('requires the complete current 153-safeguard and nine-document cohort.');
  for (const definition of definitions) {
    const rows = assessments.filter(row => row.definition_id === definition.id), row = rows[0];
    const content = krustySafeguardContent(definition.id,'addressed');
    if (rows.length !== 1 || row.framework_assessment_id !== 'fw_'+CID+'_assessment_'+definition.id
      || row.framework_key !== 'cis-ig1' || row.framework_version !== '8.1' || row.status !== 'addressed'
      || row.implementation !== content.current_implementation || row.technology !== content.technology_process
      || row.owner_id !== account.user_id || row.verification !== 'needs_validation' || row.created_at !== baselineOrigin
      || row.assessment_history?.length || row.items_to_address?.some(item => item.finding_id || item.state !== 'open'))
      reject('requires unchanged addressed current content, without imported CIS failures or bulk history.');
  }
  if (policy_keys.some(key => policies.filter(row => row.baseline_key === key && row.policy_id === CID+'_'+key).length !== 1)
    || policies.some(row => row.owner_id !== account.user_id || row.status !== 'approved' || row.baseline_response !== 'yes'
      || !row.approval_subject || row.approval_subject.version !== row.version || row.approval_subject.basis?.type !== 'external')
    || plans.some(plan => reviews.filter(row => row.review_id === CID+'_canonical_review_'+plan.key).length !== 1)
    || reviews.some(row => row.owner_id !== account.user_id || !['upcoming','in_progress'].includes(row.status)
      || !scheduledDate(row.due_date) || row.occurrences?.length || row.completed_at || row.completion_date)
    || ['risks','vendors','ai_systems','tasks','findings','evidence','comments','assets','organizational_controls','exceptions','assessments']
      .some(kind => mine(db,kind).length)) reject('complete effective current Governance without retained operational work first.');
  for (const kind of ['ai_intake','ai_counters','riskSequences','command_requests'])
    if (db[kind] != null && (typeof db[kind] !== 'object' || Array.isArray(db[kind]))) reject('invalid native '+kind+' map.');
  if (Object.hasOwn(db.ai_intake || {},CID) || (db.ai_counters?.[CID] || 0) !== 0 || (db.riskSequences?.[CID] || 0) !== 0
    || Object.keys(db.command_requests || {}).some(key => {try{return JSON.parse(key)[1] === CID;}catch{return false;}}))
    reject('reconcile prior target intake, counters and command receipts before operations.');
  for (const [kind,field] of [['framework_assessments','framework_assessment_id'],['policies','policy_id'],['reviews','review_id'],['contacts','contact_id']]) {
    const ids = mine(db,kind).map(row => row[field]);
    if (new Set(ids).size !== ids.length || (db[kind] || []).some(row => row.client_id !== CID && ids.includes(row[field])))
      reject('prepared identity collides with another client.');
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
  const current = businessRisks.map(([key,title,likelihood,impact,description,likelihoodReason,impactReason,plan,role],index) =>
    ({key,title,likelihood,impact,description,likelihoodReason,impactReason,plan,role,
      identified:dates.instant((index === 0 ? -6 : index === 1 ? 0 : 12+index*7)-365),status:'assessed'}));

  const accepted = acceptedRisks.map(([key, title, likelihood, impact, description, likelihoodReason, impactReason, plan, expiry]) =>
    ({key, title, likelihood, impact, description, likelihoodReason, impactReason, plan, expiry,
      role:'executive', identified:dates.month(-18)+'T00:00:00.000Z', status:'accepted'}));
  const closed = closedRisks.map(([key, title, likelihood, impact, description, plan], index) =>
    ({key, title, likelihood, impact, description, plan, role:'operations', identified:origin,
      likelihoodReason:'The fictional exposure was credible before the documented historical correction.',
      impactReason:'The original consequence is retained as a historical assessment, not a claim of current residual exposure.',
      closedAt:dates.month(-24+index)+'T00:00:00.000Z', status:'closed'}));
  for (const [index, spec] of [...current,...accepted,...closed].entries()) {
    const next = spec.status === 'closed' ? null : dates.day(index === 0 ? -6 : index === 1 ? 0 : 12+index*7);
    const row = assessedRisk({risk_id:PREFIX+'risk_'+spec.key, display_id:allocateRiskId(counter, CID), client_id:CID,
      title:spec.title, description:'Fictional Krusty: '+spec.description, category:'operational', source_type:'manual',
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
  }
  db.riskSequences = {...db.riskSequences, [CID]:counter.riskSequences[CID]};
}

function createVendors(db, {dates, actor, account, contacts, origin}) {
  for (const [index, [key, name, catalogKey, service, criticality, data_types, next, renewal, role]] of vendorSpecs.entries()) {
    const active = next !== null, assurance = active && ['hosting','identity','payment','pos'].includes(key);
    const relationshipOrigin = ['openai','anthropic'].includes(key) ? dates.month(-12)+'T00:00:00.000Z' : origin;
    const row = {vendor_id:PREFIX+'vendor_'+key, client_id:CID, name, catalog_key:validateCatalogKey('vendors', catalogKey),
      service, services:service, criticality, status:active ? 'active' : 'inactive', owner_id:account.user_id,
      business_owner_id:account.user_id, data_types:[...data_types], review_frequency:'annual', next_review:active ? dates.day(next) : null,
      last_review:null, created_at:relationshipOrigin, created_by:actor.user_id, updated_at:active ? dates.instant(-8) : dates.month(-8)+'T00:00:00.000Z',
      contract_start:dates.month(-12), contract_expiration:active ? dates.day(renewal) : dates.month(-8),
      contract_renewal:active ? dates.day(renewal) : null, contract_lead_days:60,
      contract_review_enabled:active && ['network','payment','pos'].includes(key), contract_evidence_ids:[],
      assurance_required:assurance, assurance_window_days:90, separate_assurance_review:key === 'hosting',
      assurance_review_date:key === 'hosting' ? dates.day(30) : null, assurance_cadence:'none', assurance_records:[],
      related_risk_ids:[], notes:SOURCE+' Fictional relationship contact: '+contacts[role].name+'. '+(active
        ? 'Current classification-led provider assessment: '+dates.day(next-365)+
          '. Current-contract assessment and annual security-term review remain separate from renewal notice. Policy-defined monitoring is current as of '+dates.day(-1)+
          '; material notices and service changes are assessed on receipt. Requested assurance concerns the next cycle, not an overdue current CIS assessment.'
        : 'Historical exited relationship only. No future assessment, monitoring or annual management obligation is created.'),
      contract_notes:active
        ? 'Fictional current agreement contains the provider-policy security, notification and disposal responsibilities; this is authored scenario metadata, not an observed signature. Assess each new or renewed contract before it takes effect.'
        : 'Fictional ended agreement retained with the exited relationship. No current agreement or future renewal is asserted.'};
    if (key === 'pos') Object.assign(row, {contract_notice_deadline:dates.day(75),
      contract_notes:row.contract_notes+' Fictional POS-support term: written notice is due 45 calendar days before renewal; the internal contract Review is earlier.'});
    if (assurance) row.assurance_records.push({assurance_id:PREFIX+'assurance_'+key, type:'Security Questionnaire',
      required:true, review_status:'requested', expected_availability:dates.day(5+index),
      next_follow_up:dates.day(20+index), evidence_ids:[], history:[]});
    if (!active) Object.assign(row, {offboarded_at:dates.month(-8)+'T00:00:00.000Z',
      offboarding_notes:'Fictional retired hosting relationship; access was revoked. Retain its source history without scheduling a future annual Vendor Review.'});
    // This is an explicitly imported fictional lifecycle position. Passing the
    // same prior state validates it without pretending to execute onboarding.
    validateVendor(db, row, copy(row)); db.vendors.push(row);
    for (const review of ensureVendorReviews(db,row)) {
      normalizeReview(review,dates,actor,relationshipOrigin);
      review.scope = review.vendor_purpose === 'vendor'
        ? 'Annual organization-selected relationship review and classification-led annual provider assessment. New or renewed contracts also trigger timely assessment; policy-defined monitoring continues between reviews.'
        : review.vendor_purpose === 'contract' ? 'Commercial renewal decision; perform the provider-policy assessment before a new or renewed contract takes effect.'
          : 'Next-cycle assurance information follow-up, distinct from the current provider assessment.';
    }
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
    environment:spec.key === 'm365' ? 'Fictional Krusty tenant; separately licensed proposed Microsoft 365 Copilot pilot'
      : 'Fictional Krusty managed '+preset.name+' business pilot; operational approval not recorded',
    data_types:spec.key === 'm365' ? [...preset.data_types] : ['Public'],
    permitted_data_types:spec.key === 'm365' ? ['Public','Internal'] : ['Public'],
    answers:{...spec.answers}, vendor:{mode:'link', id:PREFIX+'vendor_'+spec.vendor, expected_updated_at:vendorUpdatedAt,
      name:'', service:'', owner_id:ownerId},
    risk:{title:spec.risk_title, description:'Fictional Krusty: '+spec.risk_description,
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
    if (at.slice(0,10) < body.screening.catalog_version) reject('do not backdate AI screening before its reviewed native catalog.');
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
    const body = {client_id:CID, title:spec.title, description:'Fictional Krusty: '+spec.description,
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
    source_definition_risks:[],

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
      || ai.vendor_id !== expected.vendor_id || !Array.isArray(ai.related_links)
      || !ai.related_links.some(link => link?.kind === 'risks' && link.id === expected.risk_id)
      || !result.risks.some(row => row.risk_id === expected.risk_id && row.client_id === CID)
      || !result.vendors.some(row => row.vendor_id === expected.vendor_id && row.client_id === CID)
      || !result.reviews.some(row => row.review_id === expected.review_id && row.client_id === CID
        && row.ai_system_id === ai.ai_system_id))
      reject('the original AI command receipt requires explicit reconciliation.');
  }
}

function assertComplete(db, context) {
  const {contacts} = context;
  const result = relatedResult(db, contacts), expectedRisks = [...businessRisks,...acceptedRisks,...closedRisks]
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
  return {...result,organization_origin:context.origin,origin:context.baselineOrigin};
}

function validateNewRelationships(db, result, {dates,origin}) {
  const past = value => !!scheduledDate(value) && value >= origin && value <= dates.anchor;
  for (const risk of result.risks) {
    if (!past(risk.created_at) || !past(risk.updated_at) || risk.updated_at < risk.created_at
      || risk.status === 'closed' && (!past(risk.closed_at) || risk.closed_at < risk.created_at)
      || risk.status === 'accepted' && (!past(risk.acceptance_date) || risk.acceptance_date < risk.created_at
        || !scheduledDate(risk.acceptance_expires_at) || risk.acceptance_expires_at < risk.acceptance_date.slice(0,10)))
      reject('Risk import dates must retain their actual source order within the organization history.');
    validateAssignment(db, 'risks', risk);
    const native = assessedRisk(risk), reviews = result.reviews.filter(row => row.risk_id === risk.risk_id);
    if (risk.risk_score !== native.risk_score || risk.risk_level !== native.risk_level || reviews.length !== 1
      || reviews[0].recurrence !== 'annual' || (risk.status === 'closed'
        ? risk.next_review !== null || reviews[0].status !== 'cancelled'
        : reviews[0].due_date !== risk.next_review)) reject('Risk assessment or annual Review relationships are inconsistent.');
  }
  for (const vendor of result.vendors) {
    if (!past(vendor.created_at) || !past(vendor.updated_at) || vendor.updated_at < vendor.created_at
      || vendor.status === 'inactive' && (!past(vendor.offboarded_at) || vendor.offboarded_at < vendor.created_at))
      reject('Vendor import dates must retain the relationship and exit chronology.');
    validateVendor(db, vendor, copy(vendor));
    const primary = result.reviews.filter(row => row.vendor_id === vendor.vendor_id && row.vendor_purpose === 'vendor');
    if (primary.length !== 1 || primary[0].recurrence !== 'annual' || (vendor.status === 'inactive'
      ? vendor.next_review !== null || primary[0].status !== 'cancelled' : primary[0].due_date !== vendor.next_review))
      reject('Vendor annual Review relationships are inconsistent.');
  }
  for (const ai of result.ai_systems) {
    if (!past(ai.created_at) || ai.onboarding_screening.recorded_at !== ai.created_at)
      reject('AI creation and screening must be recorded within the declared current source period.');
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
  for (const task of result.tasks) if (!past(task.created_at) || !past(task.updated_at) || task.updated_at < task.created_at
    || task.status === 'done' && (!past(task.completed_at) || task.completed_at < task.created_at))
    reject('Action source dates must not invent future work or reverse a recorded completion.');
}

// Source construction only; normal navigation must not call this to reset a
// retained scenario. A complete repeat returns the saved records without writes.
export function seedKrustyOperations(db, options = {}) {
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
  validateNewRelationships(staged, result, context);
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
  return {...relatedResult(db,context.contacts),organization_origin:context.origin,origin:context.baselineOrigin};
}
