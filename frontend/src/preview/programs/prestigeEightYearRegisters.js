import {activeDefinitions} from '../../lib/frameworks';
import {socConfiguration} from '../../lib/socReadiness';
import {assessedRisk} from '../../lib/grcWork';
import {blankDraft, applyTool, catalogKeys, refreshProposal, snapshot, onboardingPayload, onboardingProjection} from '../../lib/aiOnboarding';
import {validateCatalogKey} from '../../lib/registerCatalogIdentity';
import {recordUuid} from '../../lib/recordUuid';
import {record, write, ids, now} from '../store';
import {guardEdit} from '../decisions';
import {action} from '../workflows';
import {aiRequest} from '../aiGovernance';
import {aiOnboardingRequest} from '../aiOnboarding';
import {validateVendor} from '../vendors';
import {eligible, clientAccess} from '../assignmentEligibility';
import {stable} from '../commandRequests';
import {cisDemoFixtureDates} from '../cisDemoFixtureDates';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z';
const VERSION = 'prestige-current-registers-v1', MARKER = 'prestige_current_register_fixture';
const SOURCE = 'DEMO - SYNTHETIC DATA. Current source context 2026-11-02; native recording dates are separate from historical adoption.';
const CATEGORIES = ['security', 'availability', 'confidentiality'];
const ACCOUNTS = {grc: 'demo_prestige_user_0', executive: 'demo_prestige_user_1', engineering: 'demo_prestige_user_2'};
const CONTACTS = {contracts: 'Nancy Huff', creative: 'Derek Huff', people: 'Alice Huff'};
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Private Prestige current registers: ' + message); };

// The original 22-Vendor plan is reference-only; the explicit OpenAI overlay is the 23rd relationship.
export const PRESTIGE_VENDOR_FACTS = [
  {key: 'aws', name: 'Amazon Web Services', catalogKey: 'amazon-web-services', adopted: '2018-11-02', owner: 'engineering', criticality: 'critical', service: 'Application hosting, managed PostgreSQL and segregated S3 media storage'},
  {key: 'google-workspace', name: 'Google Workspace', catalogKey: 'google-workspace', adopted: '2018-11-02', owner: 'grc', contact: 'people', criticality: 'high', service: 'Email and collaboration; adopted under the then-current G Suite name'},
  {key: 'github', name: 'GitHub', adopted: '2018-11-02', owner: 'engineering', criticality: 'high', service: 'Source repositories, pull-request review and delivery workflows'},
  {key: 'slack', name: 'Slack', catalogKey: 'slack', adopted: '2018-11-02', owner: 'grc', criticality: 'medium', service: 'Staff and project coordination; customer media is not an approved attachment location'},
  {key: 'stripe', name: 'Stripe', catalogKey: 'stripe', adopted: '2018-11-02', owner: 'executive', criticality: 'high', service: 'Hosted payment processing; no payment-card storage in the licensing platform'},
  {key: 'docusign', name: 'DocuSign', catalogKey: 'docusign', adopted: '2018-11-02', owner: 'grc', contact: 'contracts', criticality: 'high', service: 'Signed customer license and confidentiality agreements'},
  {key: 'jira', name: 'Atlassian Jira', catalogKey: 'atlassian-jira-confluence', adopted: '2018-11-02', owner: 'engineering', criticality: 'medium', service: 'Engineering changes, operational incidents and release approvals'},
  {key: 'adobe', name: 'Adobe', catalogKey: 'adobe-acrobat-creative-cloud', adopted: '2018-11-02', owner: 'grc', contact: 'creative', criticality: 'medium', service: 'Creative Cloud production tools and approved design workspaces'},
  {key: 'backblaze', name: 'Backblaze', adopted: '2018-11-02', owner: 'engineering', criticality: 'high', service: 'B2 secondary backup copies through a separate copy workflow, with restoration checks and scoped credentials'},
  {key: 'cloudflare', name: 'Cloudflare', adopted: '2019-03-11', owner: 'engineering', criticality: 'high', service: 'DNS, edge protection and customer portal traffic controls'},
  {key: 'datadog', name: 'Datadog', adopted: '2019-04-08', owner: 'engineering', criticality: 'high', service: 'Application telemetry, configured alerts and incident investigation support'},
  {key: 'zendesk', name: 'Zendesk', adopted: '2019-07-15', owner: 'grc', contact: 'contracts', criticality: 'medium', service: 'Customer support requests and confidentiality-aware ticket handling'},
  {key: 'frame-io', name: 'Frame.io', adopted: '2019-08-12', inactiveSince: '2025-06-30', owner: 'grc', contact: 'creative', criticality: 'medium', service: 'Former restricted creative review for customer cuts; replaced by controlled portal review'},
  {key: 'okta', name: 'Okta', catalogKey: 'okta', adopted: '2020-04-06', owner: 'grc', contact: 'people', criticality: 'critical', service: 'Workforce SSO, configured MFA and application access lifecycle'},
  {key: 'jamf', name: 'Jamf', adopted: '2020-05-04', owner: 'engineering', criticality: 'high', service: 'Managed creative macOS endpoints, encryption workflows and device response'},
  {key: 'onepassword', name: '1Password', catalogKey: '1password', adopted: '2020-05-18', owner: 'engineering', criticality: 'high', service: 'Approved team secrets vaults and emergency account custody'},
  {key: 'snyk', name: 'Snyk', adopted: '2020-08-10', owner: 'engineering', criticality: 'medium', service: 'Selected repository dependency vulnerability checks supporting engineering delivery'},
  {key: 'zoom', name: 'Zoom', catalogKey: 'zoom', adopted: '2020-04-20', owner: 'grc', contact: 'contracts', criticality: 'medium', service: 'Customer workshops with controlled recording and retention'},
  {key: 'snowflake', name: 'Snowflake', adopted: '2021-06-14', owner: 'engineering', criticality: 'high', service: 'Restricted royalty analytics extracts, separate from production media stores'},
  {key: 'vanta', name: 'Vanta', adopted: '2022-03-07', owner: 'grc', criticality: 'medium', service: 'Evidence-collection support; management retains native readiness decisions'},
  {key: 'harbor-signal', name: 'Harbor Signal Managed Services (fictional)', adopted: '2021-02-01', owner: 'grc', criticality: 'high', service: 'Alert escalation and independent internal recovery-test assistance'},
  {key: 'clear-reel', name: 'Clear Reel Rights Services (fictional)', adopted: '2020-09-14', owner: 'grc', contact: 'contracts', criticality: 'medium', service: 'Contractor rights-clearance checks and documented customer license exceptions'},
  {key: 'openai', name: 'OpenAI', adopted: '2023-05-15', owner: 'grc', contact: 'creative', criticality: 'medium', service: 'ChatGPT public-copy drafting; confidential customer media and contracts are excluded'},
];

// Current dispositions only. Their earlier events, Findings, Actions and validation belong to the history lane.
export const PRESTIGE_RISK_FACTS = [
  {key: 'shared-delivery', title: 'Former shared customer delivery credentials', owner: 'engineering', state: 'closed', likelihood: 2, impact: 4,
    description: 'The former shared delivery identity obscured who accessed restricted customer media.', plan: 'Named project grants and attributable delivery logs removed the shared-access condition; retain its original history separately.', reason: 'remediated'},
  {key: 'contractor-removal', title: 'Former delayed contractor access removal', owner: 'grc', state: 'closed', likelihood: 3, impact: 4, vendorKey: 'okta',
    description: 'A historical contractor account outlived its sponsored project end date.', plan: 'Personnel end-date reconciliation and direct-account checks corrected the condition; later validation is distinct from completing the removal task.', reason: 'remediated'},
  {key: 'migration-role', title: 'Former broad customer migration role', owner: 'engineering', state: 'closed', likelihood: 3, impact: 5, vendorKey: 'aws',
    description: 'The 2023 portal migration role could reach more customer media than its migration job needed.', plan: 'Scoped roles and denied-access checks removed the migration-specific excess; do not erase the earlier failed assessment.', reason: 'remediated'},
  {key: 'retention-tags', title: 'Former migrated customer retention mismatch', owner: 'grc', state: 'closed', likelihood: 3, impact: 4, vendorKey: 'aws',
    description: 'Migrated media lacked complete retention tags matching the customer license schedules.', plan: 'Nancy reconciled the full migrated population and the corrected tags were separately validated; current closure does not fabricate those earlier events.', reason: 'remediated'},
  {key: 'restore-index', title: 'Former omitted metadata recovery index', owner: 'engineering', state: 'closed', likelihood: 3, impact: 5,
    description: 'An earlier restore recovered media and database data but omitted the rights-search index needed for customer delivery.', plan: 'The complete media, metadata and index recovery procedure corrected this dependency; retain the failed test and later validation in their own historical records.', reason: 'condition_removed'},
  {key: 'retired-creative-review', title: 'Retired external creative review deployment', owner: 'grc', state: 'closed', likelihood: 2, impact: 3, vendorKey: 'frame-io',
    description: 'The former Frame.io project-review deployment introduced a separate customer-media access path.', plan: 'The deployment ended on 2025-06-30 and project delivery moved to the controlled portal; this records current disposition without backdating native closure.', reason: 'system_process_retired'},
  {key: 'cloud-concentration', title: 'Primary cloud provider concentration', owner: 'executive', state: 'accepted', likelihood: 2, impact: 5, vendorKey: 'aws',
    description: 'A severe AWS interruption can affect the portal and supporting media/data services together.', plan: 'Maintain protected recovery materials, separate secondary copies and customer communications; a second live platform is not proportionate to the documented residual exposure.'},
  {key: 'regional-network', title: 'Regional network disruption', owner: 'executive', state: 'accepted', likelihood: 2, impact: 3,
    description: 'A regional telecommunications event can delay remote staff and customer access despite alternate working locations.', plan: 'Maintain alternate communications, remote coverage and agreed customer escalation; the time-limited residual concentration remains visible.'},
  {key: 'authorized-download', title: 'Authorized recipient redistributes licensed media', owner: 'grc', state: 'accepted', likelihood: 2, impact: 4,
    description: 'A permitted recipient can redistribute a downloaded media file beyond its license even when portal authorization is correct.', plan: 'Use license terms, recipient checks, scoped expiring delivery and investigation logs; URL expiry cannot revoke copies already downloaded.'},
  {key: 'support-misdelivery', title: 'Authorized support reply sent to a wrong contact', owner: 'grc', state: 'accepted', likelihood: 2, impact: 3, vendorKey: 'zendesk',
    description: 'A legitimate support reply could expose limited project context to an incorrect customer contact.', plan: 'Retain customer verification, recipient checks and restricted attachments; monitor exceptions and revisit the bounded residual handling risk.'},
  {key: 'archive-retrieval', title: 'Older contract archive retrieval delay', owner: 'grc', state: 'accepted', likelihood: 1, impact: 3,
    description: 'A rare request for a superseded license record can take longer than the internal retrieval target.', plan: 'Retain indexed custody, authorized retrieval and customer escalation; this efficiency exposure does not remove retention or confidentiality safeguards.'},
  {key: 'session-theft', title: 'Advanced workforce session-token theft', owner: 'engineering', state: 'in_progress', likelihood: 3, impact: 5, vendorKey: 'okta',
    description: 'A targeted attacker may steal an authorized managed session and attempt to reach customer projects.', plan: 'Maintain existing MFA, project authorization and monitored access while evaluating additional session restrictions and response exercises.'},
  {key: 'secondary-copy-check', title: 'Secondary-copy verification depth', owner: 'engineering', state: 'in_progress', likelihood: 2, impact: 3, vendorKey: 'backblaze',
    description: 'An optional broader secondary-copy sample can improve confidence for unusual media formats.', plan: 'Expand the next planned verification sample while preserving the already tested required media, metadata and index recovery path.'},
  {key: 'metadata-quality', title: 'New license metadata validation patterns', owner: 'grc', state: 'in_progress', likelihood: 2, impact: 4,
    description: 'New customer license structures may introduce rights exceptions not covered by the current optional automated checks.', plan: 'Retain mandatory human rights confirmation and add validation examples for the new patterns before enabling automated reliance.'},
  {key: 'supplier-exit', title: 'Supplier exit runbook rehearsal', owner: 'grc', state: 'in_progress', likelihood: 2, impact: 3, vendorKey: 'snowflake',
    description: 'A less common analytics-provider exit may require additional coordination of retained royalty extracts.', plan: 'Rehearse the documented export, access removal and retention responsibilities without treating a contract review as completed offboarding.'},
  {key: 'device-response', title: 'Travel-device response rehearsal', owner: 'engineering', state: 'in_progress', likelihood: 2, impact: 3, vendorKey: 'jamf',
    description: 'A travelling creative workstation can be unavailable to the team during an unusual recovery or replacement event.', plan: 'Exercise alternate-device handover and credential response while retaining managed encryption, inventory and custody controls.'},
  {key: 'ai-brief-training', title: 'AI public-brief handling reinforcement', owner: 'grc', state: 'in_progress', likelihood: 2, impact: 4, vendorKey: 'openai',
    description: 'A new contractor may misunderstand the prohibition on putting unreleased customer briefs into public-copy AI drafting.', plan: 'Keep confidential inputs prohibited and add role-specific examples and spot checks; training completion does not approve a tool or close its linked risk.'},
  {key: 'renewal-navigation', title: 'Supplier renewal evidence navigation', owner: 'grc', state: 'in_progress', likelihood: 2, impact: 2,
    description: 'Owners may spend extra time locating the separate contract notice, annual operating review and assurance follow-up records.', plan: 'Improve internal cross-references while preserving the distinct decisions, dates and native Review purposes.'},
  {key: 'malicious-intake', title: 'Malicious customer media intake', owner: 'engineering', state: 'open', likelihood: 3, impact: 3,
    description: 'A customer or compromised contractor can submit a harmful media file into a legitimate delivery workflow.', plan: 'Maintain restricted intake, managed endpoint protection and incident response; review new format and detection exceptions.'},
  {key: 'portable-media', title: 'Loss of an authorized creative device', owner: 'engineering', state: 'open', likelihood: 2, impact: 3,
    description: 'A managed laptop or approved removable device may be lost during customer production work.', plan: 'Maintain assigned custody, encryption, restricted local copies and prompt reporting; assess each event rather than assuming encryption resolves every exposure.'},
  {key: 'new-customer-terms', title: 'New customer confidentiality terms', owner: 'grc', state: 'open', likelihood: 2, impact: 4,
    description: 'An unusual new license may add handling or deletion conditions that differ from the standard service terms.', plan: 'Require Nancy to reconcile the signed terms with project access, retention and provider responsibilities before the affected use.'},
  {key: 'provider-quota', title: 'Peak-release provider service limits', owner: 'engineering', state: 'open', likelihood: 2, impact: 2, vendorKey: 'aws',
    description: 'A concentrated customer release can approach a configured cloud service limit despite normal capacity headroom.', plan: 'Keep capacity forecasts, provider-limit checks and the tested expansion runbook; record a specific exception before raising an operational limit.'},
  {key: 'royalty-extract', title: 'Authorized royalty extract misuse', owner: 'grc', state: 'assessed', likelihood: 2, impact: 4, vendorKey: 'snowflake',
    description: 'An authorized analyst could move a royalty extract outside its approved restricted workspace.', plan: 'Maintain least-privilege extracts, approved destinations, handling rules and incident escalation for unusual exports.'},
  {key: 'source-code', title: 'Approved repository access exposure', owner: 'engineering', state: 'assessed', likelihood: 2, impact: 3, vendorKey: 'github',
    description: 'An approved developer session could expose source code or confidential implementation details.', plan: 'Retain scoped repository permissions, managed identities, secret checks and departure reconciliation.'},
  {key: 'supplier-notice', title: 'Material supplier notification delay', owner: 'grc', state: 'assessed', likelihood: 2, impact: 3,
    description: 'A changed supplier notification contact may delay review of a service or security notice.', plan: 'Check named contacts and escalation routes separately from operating reviews, assurance requests and contract renewals.'},
  {key: 'rights-substitution', title: 'Deliberate rights approval substitution', owner: 'grc', state: 'assessed', likelihood: 2, impact: 4,
    description: 'An insider may substitute territory or expiry information to make an unauthorized delivery appear permitted.', plan: 'Maintain separated rights confirmation, source-document checks, attributable changes and escalation of suspected misconduct.'},
];

export const PRESTIGE_AI_FACTS = [
  {key: 'textract-rights-intake', catalogKey: null, name: 'Amazon Textract — rights-document intake', provider: 'Amazon Web Services', vendorKey: 'aws',
    availableSince: '2019-05-29', adopted: '2021-09-20', owner: 'grc', contact: 'contracts', riskKey: 'ai-rights-extraction-error', riskState: 'in_progress',
    environment: 'Organization-managed AWS workflow; human-initiated extraction into a candidate staging area',
    description: 'Extract candidate text and form metadata from approved license documents; a rights specialist confirms every field before publication or delivery.',
    restrictions: 'No automatic legal-rights, payment or customer-access decisions. No production write credentials. Initial September 2021 use did not include later Queries or PrivateLink features.',
    purposes: ['Decision Support'], data: ['Confidential', 'Customer Data'], access: ['API / Integration Access'],
    answers: {managed: true, sensitive: true, connected: true, writes: false, autonomous: false, external: true, consequential: true, harm: true, oversight: true, settings: true},
    risk: 'Incorrect territory or expiry extraction can lead a reviewer toward an unlicensed delivery; human confirmation reduces exposure without eliminating the legal and financial consequences.',
    response: 'Retain source-document confirmation, restricted staging access and error sampling; record correction work separately from Risk review or closure.'},
  {key: 'chatgpt-copy-drafts', catalogKey: 'chatgpt', name: 'ChatGPT — public marketing drafts', provider: 'OpenAI', vendorKey: 'openai',
    availableSince: '2022-11-30', adopted: '2023-05-15', owner: 'grc', contact: 'creative', riskKey: 'ai-marketing-disclosure', riskState: 'in_progress',
    environment: 'Current organization-managed workspace for approved public briefs; initial May 2023 use was not ChatGPT Enterprise',
    description: 'Draft public marketing copy from approved nonconfidential briefs; a named editor checks facts, tone and publication suitability.',
    restrictions: 'No customer media, personal information, confidential contracts or credentials in prompts. No connected applications, autonomous publication or decisions about individuals.',
    purposes: ['Content Generation', 'Internal Productivity'], data: ['Public', 'Internal'], access: [],
    answers: {managed: true, sensitive: false, connected: false, writes: false, autonomous: false, external: true, consequential: false, harm: false, oversight: true, settings: true},
    risk: 'A contractor could paste an unreleased brief or an editor could publish unsupported copy; the public-input boundary and editorial check remain active controls.',
    response: 'Reinforce approved-input examples, current settings review and editorial source checks; a recorded AI intake declaration is not approval or Risk acceptance.'},
  {key: 'copilot-code-assistance', catalogKey: 'ghcopilot', name: 'GitHub Copilot — engineering assistance', provider: 'GitHub (Microsoft)', vendorKey: 'github',
    availableSince: '2022-06-21', adopted: '2023-08-21', owner: 'engineering', riskKey: 'ai-insecure-code', riskState: 'assessed',
    environment: 'Organization-managed editor suggestions in approved repositories; agent, CLI and MCP actions are not enabled',
    description: 'Suggest tests and implementation scaffolding in approved source repositories; developers apply changes through ordinary review, checks and release approval.',
    restrictions: 'No production credentials, customer media or automatic deployment. Suggestions cannot change production or permissions. Generated code remains an untrusted contribution.',
    purposes: ['Software / Code Generation'], data: ['Internal', 'Source Code / IP'], access: ['API / Integration Access'],
    answers: {managed: true, sensitive: true, connected: true, writes: false, autonomous: false, external: true, consequential: false, harm: true, oversight: true, settings: true},
    risk: 'An insecure or unsuitable suggestion can enter the portal if review fails; connection to source context and operational reliance remain material despite human control.',
    response: 'Maintain peer review, tests, dependency and secret checks and appropriate license review; no tool correctness or security guarantee is assumed.'},
  {key: 'firefly-concept-art', catalogKey: null, name: 'Adobe Firefly — internal concept artwork', provider: 'Adobe', vendorKey: 'adobe',
    availableSince: '2023-09-13', adopted: '2024-04-15', owner: 'grc', contact: 'creative', riskKey: 'ai-creative-rights', riskState: 'assessed',
    environment: 'Organization-managed creative workspace; exploratory internal text-to-image concepts only',
    description: 'Explore internal concept artwork with approved nonconfidential prompts; these drafts are not customer deliverables or production decisions.',
    restrictions: 'No unreleased customer assets or private individuals. No integrations or automatic publication. Any future external use needs a separate rights, contract and deployment review.',
    purposes: ['Content Generation', 'Internal Productivity'], data: ['Public', 'Internal'], access: [],
    answers: {managed: true, sensitive: false, connected: false, writes: false, autonomous: false, external: false, consequential: false, harm: false, oversight: true, settings: true},
    risk: 'A user could carry an exploratory generated image into an unauthorized customer context or overlook a rights concern; commercial product availability is not blanket rights clearance.',
    response: 'Retain the internal-only use restriction and human provenance/contract review before considering any changed use; no vendor indemnification guarantee is inferred.'},
];

async function digest(value) {
  if (!globalThis.crypto?.subtle) fail('native Web Crypto is required for the source-fixture receipt.');
  const bytes = new TextEncoder().encode(stable(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function checkIdentities(db) {
  for (const [kind, field] of Object.entries({...ids, notifications: 'notification_id'})) {
    const seen = new Set();
    for (const row of db[kind] || []) {
      if (!row || typeof row[field] !== 'string' || !row[field] || seen.has(row[field])) fail('duplicate or invalid native ' + kind + ' identity.');
      seen.add(row[field]);
    }
  }
  // Both log aliases are native; reserve each identity without rewriting retained history.
  const seenLogs = new Set();
  for (const row of db.logs || []) {
    const aliases = [row?.audit_id, row?.log_id].filter(value => value != null && value !== '');
    if (!aliases.length || aliases.some(value => typeof value !== 'string' || !value.trim())) fail('duplicate or invalid native logs identity.');
    for (const id of new Set(aliases)) {
      if (seenLogs.has(id)) fail('duplicate or invalid native logs identity.');
      seenLogs.add(id);
    }
  }
}

function fixtureSnapshot(db) {
  return {rows: Object.fromEntries(['vendors', 'risks', 'ai_systems', 'reviews', 'logs'].map(kind => [kind, db[kind].filter(row => row.client_id === CID)])),
    intake: db.ai_intake?.[CID] ?? null, risk_sequence: db.riskSequences?.[CID] ?? null, ai_counter: db.ai_counters?.[CID] ?? null,
    commands: Object.fromEntries(Object.entries(db.command_requests || {}).filter(([key]) => {
      try { return JSON.parse(key)[1] === CID; } catch { return false; }
    }))};
}

function protectedSnapshot(db) {
  const snapshot = copy(db);
  for (const kind of ['vendors', 'risks', 'ai_systems', 'reviews', 'logs']) snapshot[kind] = snapshot[kind].filter(row => row.client_id !== CID);
  for (const key of ['riskSequences', 'ai_counters', 'ai_intake']) {
    snapshot[key] = {...snapshot[key]}; delete snapshot[key][CID];
  }
  snapshot.command_requests = Object.fromEntries(Object.entries(snapshot.command_requests || {}).filter(([key]) => {
    try { return JSON.parse(key)[1] !== CID; } catch { return true; }
  }));
  delete snapshot[MARKER];
  return snapshot;
}

function checkPrepared(prepared, clock, purpose) {
  if (purpose !== 'current_register_source_qa' || prepared?.clientId !== CID || prepared.anchor !== ANCHOR
    || !prepared.backup || !prepared.inventory || !prepared.removedRecordIds || !clock || cisDemoFixtureDates(clock).anchor !== ANCHOR)
    fail('the explicit prepared source envelope and frozen source day are required.');
  const db = prepared.db;
  for (const kind of ['clients', 'users', 'contacts', 'framework_assessments', 'vendors', 'risks', 'ai_systems', 'reviews', 'logs', 'evidence'])
    if (!Array.isArray(db?.[kind])) fail('native ' + kind + ' arrays are required.');
  for (const key of ['riskSequences', 'ai_counters', 'ai_intake', 'command_requests'])
    if (db[key] != null && (typeof db[key] !== 'object' || Array.isArray(db[key]))) fail('native client maps are required.');
  const client = db.clients.find(row => row.client_id === CID), actor = db.user;
  if (db.clients.filter(row => row.client_id === CID).length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.archived || client.archived_at || actor?.workspace_mode !== 'demo' || !['super_admin', 'platform_admin'].includes(actor.role)
    || !eligible(actor, CID) || !db.users.some(user => user.user_id === actor.user_id && user.status === 'active' && user.role === actor.role
      && user.name === actor.name && user.email === actor.email && user.workspace_mode === 'demo' && clientAccess(user, CID)))
    fail('an active canonical Demo client and its existing authorized platform actor are required.');
  const baseline = db.baselines?.[CID], categories = socConfiguration(client).categories;
  if (!baseline?.completed || baseline.requirements?.['soc-2'] !== 'applies'
    || Object.entries(baseline.requirements).some(([key, value]) => key !== 'soc-2' && value === 'applies')
    || !Array.isArray(categories) || categories.length !== 3 || new Set(categories).size !== 3 || !CATEGORIES.every(value => categories.includes(value)))
    fail('complete the native SOC-only source baseline without changing its selected categories.');
  const expected = activeDefinitions('soc-2', {categories}).map(row => row.id);
  const actual = db.framework_assessments.filter(row => row.client_id === CID);
  if (actual.length !== 38 || new Set(actual.map(row => row.definition_id)).size !== 38
    || actual.some(row => row.framework_key !== 'soc-2' || !expected.includes(row.definition_id)))
    fail('the native 38-criterion source baseline is required.');
  for (const id of Object.values(ACCOUNTS)) if (!eligible(db.users.find(user => user.user_id === id), CID)) fail('retain the planned existing account owners.');
  for (const name of Object.values(CONTACTS)) if (db.contacts.filter(contact => contact.client_id === CID && contact.name === name).length !== 1) fail('retain the existing business Contacts.');
  checkIdentities(db);
  return db;
}

function nativeWrite(db, kind, body, id) {
  if (kind === 'vendors' && Object.hasOwn(body, 'catalog_key')) body = {...body, catalog_key: validateCatalogKey('vendors', body.catalog_key)};
  guardEdit(kind, body, id ? record(db, kind, id) : {}, db.user, db);
  const row = write(db, kind, body, id);
  checkIdentities(db);
  return row;
}

// Explicit source construction only; never imported by startup or applied to a retained visitor.
export async function createPrestigeCurrentRegisters(prepared, {clock, purpose} = {}) {
  const source = copy(checkPrepared(prepared, clock, purpose));
  const factsHash = await digest({vendors: PRESTIGE_VENDOR_FACTS, risks: PRESTIGE_RISK_FACTS, ai: PRESTIGE_AI_FACTS});
  const prior = source[MARKER];
  if (prior) {
    const {receipt_sha256: receiptHash, ...receipt} = prior;
    if (prior.version !== VERSION || prior.client_id !== CID || prior.anchor !== ANCHOR || prior.actor_id !== source.user.user_id || prior.facts_sha256 !== factsHash
      || receiptHash !== await digest(receipt) || prior.snapshot_sha256 !== await digest(fixtureSnapshot(source)))
      fail('the prepared fixture changed; refusing a mismatched retry.');
    return {db: copy(source), backup: copy(source), manifest: copy(prior)};
  }
  if (['vendors', 'risks', 'ai_systems'].some(kind => source[kind].some(row => row.client_id === CID))
    || source.ai_intake?.[CID] || source.ai_counters?.[CID] || source.riskSequences?.[CID]) fail('only an empty prepared register cohort can be installed.');
  if (source.reviews.some(row => row.client_id === CID && (row.risk_id || row.vendor_id || row.ai_system_id))) fail('prepared register obligations already exist.');
  // Keep the private entry snapshot as the unchanged recovery copy.
  const backup = source, db = copy(source), dates = cisDemoFixtureDates(clock);
  // Match established fixture allocation: the native Risk allocator must not normalize another tenant.
  const foreignRisks = db.risks.filter(row => row.client_id !== CID);
  db.risks = [];
  const vendorIds = {}, riskIds = {}, aiIds = {}, aiRequestKeys = {};
  for (const [index, fact] of PRESTIGE_VENDOR_FACTS.entries()) {
    const assurance = ['critical', 'high'].includes(fact.criticality);
    const vendor = nativeWrite(db, 'vendors', {client_id: CID, name: fact.name, service: fact.service,
      catalog_key: fact.catalogKey || null, business_owner_id: ACCOUNTS[fact.owner], criticality: fact.criticality, status: 'onboarding',
      review_frequency: 'annual', next_review: dates.day(45 + index * 4), assurance_required: assurance,
      assurance_records: assurance ? [{assurance_id: recordUuid(), type: 'Security Questionnaire', required: true, review_status: 'requested', evidence_ids: [], history: []}] : [],
      separate_assurance_review: assurance, assurance_cadence: 'annual', assurance_review_date: assurance ? dates.day(21 + index) : null,
      contract_review_enabled: true, contract_renewal: dates.day(150 + index * 7), contract_lead_days: 45,
      related_risk_ids: [], notes: `${SOURCE} Relationship adopted ${fact.adopted}.${fact.inactiveSince ? ' Service ended ' + fact.inactiveSince + '; current disposition recorded separately.' : ''} ${fact.contact ? 'Business Contact: ' + CONTACTS[fact.contact] + '. ' : ''}Annual relationship review, requested assurance and legal renewal remain separate; no document receipt or supplier opinion is asserted.`});
    vendorIds[fact.key] = vendor.vendor_id;
    for (const status of ['under_review', 'active', ...(fact.inactiveSince ? ['offboarding', 'inactive'] : [])])
      nativeWrite(db, 'vendors', {status, expected_updated_at: vendor.updated_at}, vendor.vendor_id);
  }
  for (const [index, fact] of PRESTIGE_RISK_FACTS.entries()) {
    const vendorId = fact.vendorKey ? vendorIds[fact.vendorKey] : null;
    const row = nativeWrite(db, 'risks', {client_id: CID, title: fact.title, description: fact.description, category: 'operational',
      source_type: vendorId ? 'vendor' : 'manual', ...(vendorId ? {source_id: vendorId} : {}), owner_id: ACCOUNTS[fact.owner],
      likelihood_score: fact.likelihood, impact_score: fact.impact, likelihood_rationale: `Current scoped likelihood ${fact.likelihood}/5: ${fact.description} ${fact.plan}`,
      impact_rationale: `Current scoped impact ${fact.impact}/5 considers affected customer media, rights, operations or commitments: ${fact.description}`,
      assessment_rationale: `${fact.description} Response basis: ${fact.plan}`, treatment: 'mitigate', treatment_plan: fact.plan,
      review_cadence: 'annual', next_review: dates.day(35 + index * 3), notes: SOURCE});
    riskIds[fact.key] = row.risk_id;
    if (fact.state === 'accepted') action(db, 'risks', row.risk_id, 'accept', {expected_updated_at: row.updated_at,
      rationale: `${fact.plan} Robert Doback sponsors the fictional business tolerance; the native platform actor records this current decision.`,
      compensating_controls: fact.plan, expiry_date: dates.day(180 + index * 3)});
    else if (fact.state === 'closed') action(db, 'risks', row.risk_id, 'close', {expected_updated_at: row.updated_at, reason: fact.reason,
      note: `${fact.plan} This current register disposition does not create a Finding validation, completed Action or historical approval.`});
    else if (fact.state !== 'assessed') nativeWrite(db, 'risks', {status: fact.state, expected_updated_at: row.updated_at}, row.risk_id);
  }
  aiRequest(db, '/ai-intake', 'post', {}, {client_id: CID, usage: 'yes', indicators: ['Third-party AI tools internally', 'Sensitive/personal data', 'Production/system access', 'Consequential decisions'], expected_updated_at: null});
  for (const fact of PRESTIGE_AI_FACTS) {
    if (fact.adopted < fact.availableSince) fail('AI adoption precedes verified availability.');
    let draft = blankDraft();
    if (fact.catalogKey) draft = applyTool(draft, catalogKeys.indexOf(fact.catalogKey));
    const vendor = record(db, 'vendors', vendorIds[fact.vendorKey]);
    Object.assign(draft, {catalog_key: fact.catalogKey, name: fact.name, provider: fact.provider, environment: fact.environment,
      description: fact.description, restrictions: fact.restrictions, owner_id: ACCOUNTS[fact.owner], purposes: [...fact.purposes],
      data_types: [...fact.data], permitted_data_types: [...fact.data], access: [...fact.access], answers: {...fact.answers},
      vendor: {...draft.vendor, mode: 'link', id: vendor.vendor_id, expected_updated_at: vendor.updated_at, name: vendor.name, service: vendor.service}});
    draft = refreshProposal(draft);
    draft.risk = {...draft.risk, title: fact.riskKey.replaceAll('-', ' ') + ' — ' + fact.name, description: fact.risk,
      rationale: `${draft.proposal.rationale} Scoped response: ${fact.response}`};
    draft.confirmations = Object.fromEntries(['details', 'screening', 'risk'].map(step => [step, snapshot(draft, step)]));
    const payload = onboardingPayload(CID, draft), key = 'prestige_current_' + fact.key.replaceAll('-', '_');
    const created = aiOnboardingRequest(db, payload, key);
    aiRequestKeys[fact.key] = key; aiIds[fact.key] = created.ai_system_id; riskIds[fact.riskKey] = created.risk_id;
    const ai = record(db, 'ai_systems', created.ai_system_id);
    aiRequest(db, '/ai_systems/' + ai.ai_system_id, 'patch', {}, {status: 'active', expected_updated_at: ai.updated_at,
      technical_owner_id: ACCOUNTS.engineering, oversight_owner_id: ACCOUNTS.grc, human_review_required: true, human_approval_required: true,
      oversight_notes: fact.response, governance_notes: `${SOURCE} Product available ${fact.availableSince}; adoption ${fact.adopted}. ${fact.contact ? 'Business Contact: ' + CONTACTS[fact.contact] + '. ' : ''}No in-app approval is asserted.`});
    const risk = record(db, 'risks', created.risk_id);
    nativeWrite(db, 'risks', {status: fact.riskState, source_type: 'manual', vendor_id: vendor.vendor_id, treatment: 'mitigate',
      treatment_plan: fact.response, likelihood_rationale: draft.proposal.factors.join(' '), impact_rationale: fact.risk,
      notes: SOURCE, expected_updated_at: risk.updated_at}, risk.risk_id);
    aiRequest(db, '/ai_systems/' + ai.ai_system_id + '/links', 'post', {}, {kind: 'vendors', id: vendor.vendor_id, classification: 'Context', rationale: 'Actual provider relationship for this documented deployment.'});
    checkIdentities(db);
  }
  for (const vendorId of Object.values(vendorIds)) {
    const vendor = record(db, 'vendors', vendorId);
    const related = db.risks.filter(risk => risk.vendor_id === vendorId).map(risk => risk.risk_id);
    // Native inactive Vendors are immutable; their historical Risk already points to the Vendor.
    if (vendor.status !== 'inactive') nativeWrite(db, 'vendors', {related_risk_ids: related, expected_updated_at: vendor.updated_at}, vendorId);
    validateVendor(db, vendor, copy(vendor));
  }
  db.risks = [...foreignRisks, ...db.risks];
  checkIdentities(db);
  if (stable(protectedSnapshot(db)) !== stable(protectedSnapshot(source))) fail('foreign or non-register source data changed.');
  for (const aiId of Object.values(aiIds)) {
    const ai = record(db, 'ai_systems', aiId);
    if (!onboardingProjection(ai)?.screening_complete || ai.approval_status !== 'pending_assessment' || ai.approval_history?.length) fail('screening or approval provenance changed.');
  }
  const manifest = {version: VERSION, client_id: CID, anchor: ANCHOR, actor_id: db.user.user_id, facts_sha256: factsHash,
    vendor_ids: vendorIds, risk_ids: riskIds, ai_ids: aiIds, ai_request_keys: aiRequestKeys, recorded_at: now(),
    snapshot_sha256: await digest(fixtureSnapshot(db))};
  manifest.receipt_sha256 = await digest(manifest);
  db[MARKER] = manifest;
  return {db, backup, manifest: copy(manifest)};
}
