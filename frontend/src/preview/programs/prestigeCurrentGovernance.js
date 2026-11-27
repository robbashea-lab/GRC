import onboardingCatalog from '@catalogs/onboardingCatalog.json';
import {activeDefinitions, activePlans, reviewDrivers} from '../../lib/frameworks';
import {socConfiguration} from '../../lib/socReadiness';
import {retainedPolicy} from '../../lib/policyProvenance';
import {assertCurrentOccurrence, occurrenceId, scheduledDate} from '../../lib/reviewOccurrences';
import {eligible, clientAccess} from '../assignmentEligibility';
import {validateFrameworkConfig} from '../frameworks';
import {cisDemoFixtureDates} from '../cisDemoFixtureDates';
import {guardEdit} from '../decisions';
import {policyApprovalRequest} from '../policyApproval';
import {action} from '../workflows';
import {ids, record, write, now} from '../store';

const CID = 'demo_prestige', ANCHOR = '2026-11-02T00:00:00.000Z', VERSION = 1;
const MARKER = 'prestige_current_governance_fixture';
const ACCOUNTS = {grc: 'demo_prestige_user_0', executive: 'demo_prestige_user_1', engineering: 'demo_prestige_user_2'};
const CONTACTS = {grc: 'Dale Doback', executive: 'Robert Doback', engineering: 'Brennan Huff', contracts: 'Nancy Huff', creative: 'Derek Huff', people: 'Alice Huff'};
const CATEGORIES = ['security', 'availability', 'confidentiality'];
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Prestige current governance fixture: ' + message); };
const stable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);

// Newly authored fictional current documents, not recovered files or observed signatures.
export const PRESTIGE_POLICY_DOCUMENT_FACTS = [
  {key: 'policy-information-security-policy', document_id: 'PW-POL-01', version: '4.0', owner: 'grc', participants: ['executive'],
    summary: 'Robert sets the customer media service boundary and confidentiality expectations. Dale maintains responsibilities, escalation and exceptions; owners review implementation separately from approving a document.'},
  {key: 'policy-risk-management-policy', document_id: 'PW-POL-02', version: '3.2', owner: 'grc', participants: ['executive', 'engineering', 'contracts'],
    summary: 'Dale assesses likelihood and impact for portal, rights, supplier and AI exposures. Robert sponsors material residual tolerance; acceptance needs a rationale and expiry, and treatment completion does not close a Risk.'},
  {key: 'policy-access-control-identity-management-policy', document_id: 'PW-POL-03', version: '4.1', owner: 'engineering', participants: ['people', 'contracts', 'creative'],
    summary: 'Brennan administers named workforce and project access, with MFA on covered workforce routes, least privilege and prompt leaver removal. Alice supplies personnel events; Nancy and Derek confirm project rights and contractor end dates. Quarterly review includes privileged and supplier access.'},
  {key: 'policy-change-management-policy', document_id: 'PW-POL-04', version: '3.1', owner: 'engineering', participants: ['contracts'],
    summary: 'Portal and configuration changes require an accountable requester, peer review, tests, release authorization and rollback planning. Nancy checks customer-rule changes; emergency changes receive a separate retrospective review.'},
  {key: 'policy-vendor-third-party-risk-management-policy', document_id: 'PW-POL-05', version: '3.0', owner: 'grc', participants: ['contracts', 'engineering'],
    summary: 'Dale maintains dependency owners and risk-based diligence. Nancy tracks terms and renewal notice; Brennan checks technical responsibilities. Annual relationship review, requested assurance and legal renewal remain separate events.'},
  {key: 'policy-data-classification-handling-policy', document_id: 'PW-POL-06', version: '3.2', owner: 'grc', participants: ['contracts', 'creative'],
    summary: 'Customer cuts, license restrictions, royalty support and personal contacts receive handling rules by sensitivity. Nancy defines rights boundaries and Derek applies them in creative projects; public AI briefs exclude unreleased media and confidential terms.'},
  {key: 'policy-data-retention-secure-disposal-policy', document_id: 'PW-POL-07', version: '4.0', owner: 'grc', participants: ['contracts', 'engineering'],
    summary: 'Nancy reconciles customer retention and legal holds with the complete media and rights population. Brennan implements authorized deletion and scoped expiry checks. Migration reconciliation and restoration must retain enforceable rights and retention context.'},
  {key: 'policy-asset-management-policy', document_id: 'PW-POL-08', version: '3.1', owner: 'engineering', participants: ['creative'],
    summary: 'Brennan maintains cloud, repository and endpoint ownership, approved configuration and disposal responsibilities. Derek tracks creative-device custody and project media locations; inventories support access, vulnerability and recovery checks.'},
  {key: 'policy-vulnerability-patch-management-policy', document_id: 'PW-POL-09', version: '3.3', owner: 'engineering', participants: ['grc'],
    summary: 'Brennan triages dependency, container and endpoint findings by exploitability and customer impact, applies tested corrections and checks the result. Dale tracks time-bound exceptions and escalation; a closed work ticket is not independent validation.'},
  {key: 'policy-configuration-management-policy', document_id: 'PW-POL-10', version: '3.2', owner: 'engineering', participants: ['grc'],
    summary: 'Approved cloud, identity and endpoint baselines restrict administrative access and unreviewed changes. Brennan reconciles drift and delivery settings; Dale reviews exceptions and shared-responsibility boundaries without claiming supplier settings are directly controlled.'},
  {key: 'policy-security-awareness-training-policy', document_id: 'PW-POL-11', version: '3.0', owner: 'grc', participants: ['people', 'creative'],
    summary: 'Alice coordinates staff and contractor briefings, while Derek reinforces project-specific media rules. Dale checks practical understanding of phishing, rights handling, escalation and approved AI inputs; attendance alone does not demonstrate effectiveness.'},
  {key: 'policy-incident-response-policy', document_id: 'PW-POL-12', version: '4.0', owner: 'grc', participants: ['engineering', 'contracts'],
    approved_at: '2026-10-16T14:30:00.000Z', effective_date: '2026-10-19',
    summary: 'Dale coordinates severity, escalation and retained incident decisions; Brennan contains and restores the affected service. Nancy evaluates customer and contractual communications. Exercises test media disclosure, rights errors and recovery, with lessons tracked separately.'},
  {key: 'policy-cryptography-key-management-policy', document_id: 'PW-POL-13', version: '3.1', owner: 'engineering', participants: ['grc'],
    summary: 'Brennan applies approved transport and storage encryption and restricts key and secret access, rotation and emergency custody. Dale reviews delegated provider responsibilities and exceptions; encryption does not replace authorization or customer rights checks.'},
  {key: 'policy-business-continuity-disaster-recovery-policy', document_id: 'PW-POL-14', version: '4.0', owner: 'executive', participants: ['grc', 'engineering', 'contracts'],
    summary: 'Robert sets service recovery priorities and resources. Dale coordinates continuity and customer impact; Brennan exercises restoration of media, rights metadata and application index consistency. Failed tests and later validation remain distinct records.'},
  {key: 'policy-backup-restoration-policy', document_id: 'PW-POL-15', version: '4.1', owner: 'engineering', participants: ['grc'],
    approved_at: '2026-10-16T14:30:00.000Z', effective_date: '2026-10-19',
    summary: 'Brennan protects scoped backup credentials and secondary copies and tests an end-to-end service restore. Dale evaluates recovery results separately. Copy availability, object versioning and a successful file restore alone do not prove complete customer-service recovery.'},
  {key: 'policy-physical-environmental-security-policy', document_id: 'PW-POL-16', version: '2.3', owner: 'engineering', participants: ['creative'],
    summary: 'Brennan owns office and supplier physical-security boundaries; Derek controls edit-suite visitors and media custody. Hosting facilities remain provider-operated, with diligence and incident escalation rather than invented Prestige data-center access controls.'},
].map(fact => ({...fact, source: 'newly_authored_fictional_current_document',
  external_reference: 'Prestige Worldwide fictional document register / ' + fact.document_id,
  external_version: fact.document_id + ' revision ' + fact.version,
  approved_at: fact.approved_at || '2026-10-22T14:30:00.000Z', effective_date: fact.effective_date || '2026-10-23',
  named_approver: 'Robert Doback'}));

export const PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY = [
  {source: 'preserved_foundation_milestone', date: '2018-11-02', policy: 'Information Security', version: '1', named_approver: 'Robert Doback', document_reference: null},
  {source: 'preserved_2022_milestone', year: 2022, description: 'Robert approved policy revisions; exact dates, revisions and references were not recorded.', version: null, date: null, document_reference: null},
];

export const PRESTIGE_GOVERNANCE_REVIEW_FACTS = [
  {plan_key: 'soc-risk-assessment', recurrence: 'annual', due_date: '2027-10-22', owner: 'grc', participants: ['executive', 'engineering', 'contracts'], notes: 'Assess current service, customer commitment, supplier and AI exposures; retain decisions separately from treatment work.'},
  {plan_key: 'soc-user-access', recurrence: 'quarterly', due_date: '2027-02-02', owner: 'engineering', participants: ['people', 'contracts', 'creative'], notes: 'Reconcile workforce, privileged, contractor and project access against personnel events and customer rights.'},
  {plan_key: 'soc-vulnerability', recurrence: 'annual', due_date: '2027-11-02', owner: 'engineering', participants: ['grc'], notes: 'Evaluate vulnerability management operation, corrections and time-bound exceptions; ongoing scans and patching continue separately.'},
  {plan_key: 'soc-vendor', recurrence: 'annual', due_date: '2027-11-02', owner: 'grc', participants: ['contracts', 'engineering'], notes: 'Review the supplier process and dependencies; individual Vendor relationship, assurance and contract obligations remain separate.'},
  {plan_key: 'soc-backup', recurrence: 'annual', due_date: '2027-04-16', owner: 'engineering', participants: ['grc'], notes: 'Exercise complete media, rights metadata and application recovery; Dale evaluates the result separately from Brennan executing it.'},
  {plan_key: 'soc-incident-response', recurrence: 'annual', due_date: '2027-11-02', owner: 'grc', participants: ['engineering', 'contracts'], notes: 'Exercise response, escalation and customer communications; preserve adverse results and later validation separately.'},
  {plan_key: 'soc-policy-review', recurrence: 'annual', due_date: '2027-11-02', owner: 'grc', participants: ['executive'], notes: 'Review the controlled Policy set with its owners; completion does not approve a draft or replace its effective subject.'},
  {plan_key: 'soc-awareness', recurrence: 'annual', due_date: '2027-11-02', owner: 'grc', participants: ['people', 'creative'], notes: 'Evaluate staff and contractor understanding of handling, escalation and current AI restrictions, beyond attendance.'},
];

// Explicit inputs for later native source assembly; this does not finalize onboarding.
export function prestigeGovernanceOnboardingState() {
  const keys = PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => fact.key);
  return {version: 3, step: 3, selected_policy_keys: keys, policies: Object.fromEntries(keys.map(key => [key, 'yes'])),
    requirements: Object.fromEntries(onboardingCatalog.requirements.map(item => [item.key, item.key === 'soc-2' ? 'applies' : 'does_not_apply'])),
    reviews: [], framework_reviews: Object.fromEntries(PRESTIGE_GOVERNANCE_REVIEW_FACTS.map(fact => [fact.plan_key,
      {enabled: true, recurrence: fact.recurrence, due_date: fact.due_date}]))};
}

async function digest(value) {
  if (!globalThis.crypto?.subtle) fail('native Web Crypto is required for the source-fixture receipt.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
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

function managedRows(db) {
  const policies = PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => {
    const rows = db.policies.filter(row => row.client_id === CID && row.baseline_key === fact.key);
    if (rows.length !== 1) fail('one existing selected Policy is required for ' + fact.key + '.');
    return rows[0];
  });
  if (db.policies.filter(row => row.client_id === CID).length !== policies.length) fail('the exact selected 16-Policy source cohort is required.');
  const reviews = PRESTIGE_GOVERNANCE_REVIEW_FACTS.map(fact => {
    const rows = db.reviews.filter(row => row.client_id === CID && reviewDrivers(row).some(driver =>
      driver.framework_key === 'soc-2' && driver.framework_plan_key === fact.plan_key && driver.framework_driver_active !== false));
    if (rows.length !== 1 || reviewDrivers(rows[0]).some(driver => driver.framework_key !== 'soc-2' || driver.framework_plan_key !== fact.plan_key))
      fail('one unambiguous native Review parent is required for ' + fact.plan_key + '.');
    return rows[0];
  });
  if (new Set(reviews.map(row => row.review_id)).size !== 8) fail('eight distinct native Review parents are required.');
  return {policies, reviews};
}

function fixtureSnapshot(db) {
  const rows = managedRows(db), policies = new Set(rows.policies.map(row => row.policy_id)), reviews = new Set(rows.reviews.map(row => row.review_id));
  return {...rows, logs: db.logs.filter(row => row.client_id === CID
    && (row.entity_type === 'policies' && policies.has(row.entity_id) || row.entity_type === 'reviews' && reviews.has(row.entity_id)))};
}

function protectedSnapshot(db) {
  const result = copy(db), rows = managedRows(db), policies = new Set(rows.policies.map(row => row.policy_id)), reviews = new Set(rows.reviews.map(row => row.review_id));
  result.policies = result.policies.filter(row => !policies.has(row.policy_id));
  result.reviews = result.reviews.filter(row => !reviews.has(row.review_id));
  result.logs = result.logs.filter(row => row.client_id !== CID
    || !(row.entity_type === 'policies' && policies.has(row.entity_id) || row.entity_type === 'reviews' && reviews.has(row.entity_id)));
  delete result[MARKER];
  return result;
}

function checkPrepared(prepared, clock, purpose) {
  if (purpose !== 'current_governance_source_qa' || prepared?.clientId !== CID || prepared.anchor !== ANCHOR
    || !prepared.backup || !prepared.inventory || !prepared.removedRecordIds || !clock || cisDemoFixtureDates(clock).anchor !== ANCHOR)
    fail('the explicit prepared source envelope and frozen source day are required.');
  const db = prepared.db;
  for (const kind of ['clients', 'users', 'contacts', 'policies', 'reviews', 'framework_assessments', 'logs', 'evidence'])
    if (!Array.isArray(db?.[kind])) fail('native ' + kind + ' arrays are required.');
  const client = db.clients.find(row => row.client_id === CID), actor = db.user;
  if (db.clients.filter(row => row.client_id === CID).length !== 1 || client.environment !== 'Demo' || client.status !== 'active'
    || client.archived || client.archived_at || actor?.workspace_mode !== 'demo' || !['super_admin', 'platform_admin'].includes(actor.role)
    || !eligible(actor, CID) || !db.users.some(user => user.user_id === actor.user_id && user.status === 'active' && user.role === actor.role
      && user.name === actor.name && user.email === actor.email && user.workspace_mode === 'demo' && clientAccess(user, CID)))
    fail('an active canonical Demo client and its existing authorized platform actor are required.');
  const baseline = db.baselines?.[CID], configuration = socConfiguration(client);
  if (!baseline?.completed || baseline.requirements?.['soc-2'] !== 'applies'
    || Object.entries(baseline.requirements).some(([key, value]) => key !== 'soc-2' && value === 'applies')
    || configuration.categories.length !== 3 || new Set(configuration.categories).size !== 3 || !CATEGORIES.every(key => configuration.categories.includes(key)))
    fail('complete the native SOC-only baseline and retain its three categories.');
  const selected = baseline.selected_policy_keys, policyKeys = PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => fact.key);
  if (!Array.isArray(selected) || selected.length !== 16 || new Set(selected).size !== 16
    || policyKeys.some(key => !selected.includes(key) || baseline.policies?.[key] !== 'yes'))
    fail('retain the exact 16 selected reported-existing Policy inputs.');
  const definitions = activeDefinitions('soc-2', configuration).map(row => row.id), actual = db.framework_assessments.filter(row => row.client_id === CID);
  if (actual.length !== 38 || new Set(actual.map(row => row.definition_id)).size !== 38 || actual.some(row => row.framework_key !== 'soc-2' || !definitions.includes(row.definition_id)))
    fail('the native 38-criterion source baseline is required.');
  const plans = activePlans('soc-2', configuration).map(row => row.key);
  if (plans.length !== 8 || PRESTIGE_GOVERNANCE_REVIEW_FACTS.some(fact => !plans.includes(fact.plan_key))) fail('retain the eight native SOC Review plans.');
  for (const id of Object.values(ACCOUNTS)) if (!eligible(db.users.find(user => user.user_id === id), CID)
    || !['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor'].includes(db.users.find(user => user.user_id === id)?.role))
    fail('retain the existing capable account owners.');
  for (const name of Object.values(CONTACTS)) if (db.contacts.filter(row => row.client_id === CID && row.name === name).length !== 1)
    fail('retain the existing named business Contacts.');
  validateFrameworkConfig(prestigeGovernanceOnboardingState());
  checkIdentities(db); managedRows(db);
  return db;
}

function nativeWrite(db, kind, body, id) {
  const existing = record(db, kind, id);
  guardEdit(kind, body, existing, db.user, db);
  return write(db, kind, {...body, expected_updated_at: existing.updated_at ?? null}, id);
}

function declaredManifest(db, receipt) {
  const contact = db.contacts.find(row => row.client_id === CID && row.name === 'Robert Doback');
  return {...copy(receipt), authored_document_facts: PRESTIGE_POLICY_DOCUMENT_FACTS.map(fact => ({
    policy_id: receipt.policy_ids[fact.key], source: fact.source, document_id: fact.document_id, version: fact.version,
    external_reference: fact.external_reference, external_version: fact.external_version,
    reported_approved_at: fact.approved_at, effective_date: fact.effective_date,
    named_business_approver: {contact_id: contact.contact_id, name: contact.name}, external_bytes_verified: false})),
  historical_fact_boundary: copy(PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY),
  provenance: 'Current document facts are newly authored fictional scenario data. Native import actor/timestamps are actual. External bytes and signatures are not verified; no in-app approval decision is fabricated.'};
}

// Explicit unused source assembly only; never imported by startup or applied to a retained visitor.
export async function createPrestigeCurrentGovernance(prepared, {clock, purpose} = {}) {
  const source = copy(checkPrepared(prepared, clock, purpose));
  const factsHash = await digest({documents: PRESTIGE_POLICY_DOCUMENT_FACTS, reviews: PRESTIGE_GOVERNANCE_REVIEW_FACTS, history: PRESTIGE_GOVERNANCE_HISTORY_BOUNDARY});
  const prior = source[MARKER];
  if (prior) {
    const {receipt_sha256: receiptHash, ...receipt} = prior;
    if (prior.version !== VERSION || prior.client_id !== CID || prior.anchor !== ANCHOR || prior.actor_id !== source.user.user_id
      || prior.facts_sha256 !== factsHash || receiptHash !== await digest(receipt) || prior.snapshot_sha256 !== await digest(fixtureSnapshot(source)))
      fail('the prepared fixture changed; refusing a mismatched retry.');
    return {db: copy(source), backup: copy(source), manifest: declaredManifest(source, prior)};
  }
  const initial = managedRows(source);
  for (const policy of initial.policies) if (policy.presence !== 'reported_existing' || policy.status !== 'needs_verification'
    || retainedPolicy(policy) || policy.approval_source || policy.approval_subject || policy.version || policy.verified_at)
    fail('retain existing Policy decisions; install only on the reported-existing native source cohort.');
  for (const review of initial.reviews) if (!['upcoming', 'needs_scheduling'].includes(review.status)) fail('do not replace active or closed Review execution.');
  // Keep the private entry snapshot as the unchanged recovery copy.
  const backup = source, db = copy(source), policyIds = {}, reviewIds = {};
  const approver = db.contacts.find(row => row.client_id === CID && row.name === 'Robert Doback');
  for (const [index, fact] of PRESTIGE_POLICY_DOCUMENT_FACTS.entries()) {
    if (fact.source !== 'newly_authored_fictional_current_document' || !fact.version || !fact.external_reference || !fact.external_version
      || !Object.hasOwn(ACCOUNTS, fact.owner) || fact.named_approver !== 'Robert Doback'
      || !scheduledDate(fact.effective_date) || !Number.isFinite(Date.parse(fact.approved_at)) || new Date(fact.approved_at).toISOString() !== fact.approved_at
      || fact.approved_at > ANCHOR || fact.effective_date > ANCHOR.slice(0, 10)
      || fact.approved_at.slice(0, 10) > fact.effective_date) fail('current fictional document facts must fit the source chronology.');
    const id = initial.policies[index].policy_id;
    nativeWrite(db, 'policies', {owner_id: ACCOUNTS[fact.owner], version: fact.version,
      summary: fact.summary + ' Document effective ' + fact.effective_date + '.'}, id);
    policyApprovalRequest(db, '/policies/' + id + '/approval-authority', 'post', {}, {
      approver_contact_id: approver.contact_id, approval_account_id: null, expected_updated_at: record(db, 'policies', id).updated_at});
    policyApprovalRequest(db, '/policies/' + id + '/approval-subject', 'post', {}, {version: fact.version,
      external_reference: fact.external_reference, external_version: fact.external_version, expected_updated_at: record(db, 'policies', id).updated_at});
    action(db, 'policies', id, 'verify', {version: fact.version, owner_id: ACCOUNTS[fact.owner], status: 'approved',
      approved_at: fact.approved_at, next_review_date: '2027-11-02'});
    policyIds[fact.key] = id;
  }
  for (const [index, fact] of PRESTIGE_GOVERNANCE_REVIEW_FACTS.entries()) {
    const review = record(db, 'reviews', initial.reviews[index].review_id);
    assertCurrentOccurrence(review, occurrenceId(review));
    nativeWrite(db, 'reviews', {due_date: fact.due_date, recurrence: fact.recurrence, owner_id: ACCOUNTS[fact.owner],
      notes: fact.notes + ' Participants: ' + fact.participants.map(key => CONTACTS[key]).join(', ') + '. Management-selected operating cadence; no universal SOC 2 frequency is asserted.'}, review.review_id);
    reviewIds[fact.plan_key] = review.review_id;
  }
  checkIdentities(db);
  if (stable(protectedSnapshot(db)) !== stable(protectedSnapshot(source))) fail('foreign or non-governance source data changed.');
  for (const [index, review] of managedRows(db).reviews.entries()) {
    const previous = initial.reviews[index];
    if (review.review_id !== previous.review_id || occurrenceId(review) !== occurrenceId(previous)
      || stable(review.occurrences || []) !== stable(previous.occurrences || []) || review.status !== 'upcoming')
      fail('native Review identity, execution history or scheduled state changed.');
  }
  const receipt = {version: VERSION, client_id: CID, anchor: ANCHOR, actor_id: db.user.user_id,
    facts_sha256: factsHash, policy_ids: policyIds, review_ids: reviewIds, recorded_at: now(), snapshot_sha256: await digest(fixtureSnapshot(db))};
  receipt.receipt_sha256 = await digest(receipt);
  db[MARKER] = receipt;
  return {db, backup, manifest: declaredManifest(db, receipt)};
}
