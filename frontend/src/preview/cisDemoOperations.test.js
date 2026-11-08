import {seedCisDemoOperations, renderCisOperationArtifact} from './cisDemoOperations';
import {cisDemoFixtureDates, CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {CIS_DEMO_SCENARIOS} from './cisDemoSelection';
import {aiProjection, validateAI} from '../lib/aiGovernance';
import {screeningStale} from '../lib/aiOnboarding';
import {aiScope} from '../lib/brawndoAI';
import {registerCatalogLogo} from '../lib/registerCatalogLogo';
import {reviewView} from '../lib/reviewOccurrences';
import {assuranceStatus, vendorSignals} from '../lib/vendorGovernance';
import {action} from './workflows';
import {write} from './store';
import {clearFileCache, lightweightStore, restoreFiles} from './evidenceStorage';

const dates = cisDemoFixtureDates(new Date('2026-10-28T22:45:00Z'));
const copy = value => JSON.parse(JSON.stringify(value));
const artifactRecipe = (overrides = {}) => ({kind: 'operation', schema_version: 1, fixture_version: CIS_SHOWCASE_VERSION,
  client_id: 'demo_brawndo', anchor: dates.anchor, key: 'evidence_vendor_current',
  title: 'Synthetic Microsoft workspace assurance checklist', day: dates.day(-20), ...overrides});

function fixture(scenario = CIS_DEMO_SCENARIOS[0]) {
  const cid = scenario.client_id;
  const admin = {user_id: 'demo_admin', name: 'Demo Explorer', email: 'explorer@example.test', role: 'super_admin',
    status: 'active', workspace_mode: 'demo', client_ids: [cid]};
  const owner = {user_id: cid + '_manager', name: scenario.people[0], email: 'owner@example.test',
    role: 'client_grc_manager', status: 'active', client_ids: [cid]};
  return {user: admin, users: [admin, owner], clients: [{client_id: cid, name: scenario.name, environment: 'Demo',
    status: 'active', framework_settings: {'cis-ig1': {implementation_group: scenario.implementation_group}}}],
    requirements: [{requirement_id: cid + '_cis', client_id: cid, baseline_key: 'cis-ig1', baseline_response: 'applies'}],
    reviews: [], risks: [], vendors: [], ai_systems: [], findings: [], tasks: [], evidence: [], logs: [],
    policies: [], assets: [], contacts: [], assessments: [], comments: [], exceptions: [], framework_assessments: []};
}

test.each(CIS_DEMO_SCENARIOS)('$name gets distinct scored native Risks and separately retained closure', scenario => {
  const db = fixture(scenario);
  seedCisDemoOperations(db, scenario, dates);
  expect(db.risks.filter(row => row.status !== 'closed').map(row => row.risk_score)).toEqual([25, 9, 6, 10]);
  expect(db.risks.map(row => row.risk_level)).toEqual(['critical', 'moderate', 'moderate', 'high', 'low']);
  const continuity = db.risks[0];
  expect(continuity.category).toBe('operational');
  expect(continuity.description).toMatch(/Fictional scenario.*confirmed/);
  expect(continuity.description).toContain(dates.day(90));
  expect(continuity.description).toContain(dates.day(97));
  expect(continuity.likelihood_rationale).toMatch(/confirmed.*highly likely/);
  expect(continuity.impact_rationale).toMatch(/severe/);
  expect(continuity.treatment_plan).toContain(dates.day(60));
  expect(continuity.title).not.toMatch(/\bAI\b|ChatGPT|Claude|disclosure/i);
  const accepted = db.risks.find(row => row.status === 'accepted');
  expect(accepted).toMatchObject({accepted_by: 'demo_admin', treatment: 'accept', acceptance_expires_at: dates.day(60)});
  expect(accepted.decision_history[0].rationale).toMatch(/fictional/i);
  const closed = db.risks.find(row => row.status === 'closed');
  expect(closed).toMatchObject({risk_score: 4, next_review: null, closure_reason: 'condition_removed', closed_by: 'demo_admin'});
  expect(db.reviews.some(row => row.risk_id === closed.risk_id && !['completed', 'cancelled'].includes(row.status))).toBe(false);
  expect(db.risks.every(row => row.created_at.slice(0, 10) === row.date_identified)).toBe(true);
});

test('current native AI presets retain versioned screening, real relationships and distinct approval decisions', () => {
  const db = fixture();
  seedCisDemoOperations(db, CIS_DEMO_SCENARIOS[0], dates);
  expect(db.ai_systems.map(row => row.catalog_key)).toEqual(['chatgpt', 'claude', 'm365']);
  expect(db.ai_systems.map(row => row.name)).toEqual(['ChatGPT', 'Claude', 'Microsoft 365 Copilot']);
  expect(db.risks).toHaveLength(5); // AI uses the existing scored records rather than duplicating them.
  for (const row of db.ai_systems) {
    expect(() => validateAI(db, row)).not.toThrow();
    expect(screeningStale(row)).toBe(false);
    expect(row.onboarding_screening).toMatchObject({schema_version: 1, catalog_version: '2026-10-25'});
    expect(Object.values(row.onboarding_screening.answers)).toHaveLength(10);
    expect(registerCatalogLogo('ai_systems', row)).toBeTruthy();
    expect(db.vendors.find(vendor => vendor.vendor_id === row.vendor_id)?.client_id).toBe(row.client_id);
    const risk = db.risks.find(risk => risk.risk_id === row.related_links[0].id);
    expect(risk?.client_id).toBe(row.client_id);
    expect(db.reviews.filter(review => review.ai_system_id === row.ai_system_id)).toHaveLength(1);
    if (row.approval_status !== 'pending_assessment') expect(row.approval_history.at(-1).scope).toEqual(aiScope(row));
  }
  const projected = db.ai_systems.map(row => aiProjection(row, db.reviews, db.risks, dates.day(0)));
  expect(projected[0]).toMatchObject({risk_tier: 'high', approval_status: 'pending_assessment', next_review: dates.day(-4)});
  expect(projected[0].alerts.some(alert => alert.key === 'overdue')).toBe(true);
  expect(projected[1].approval_status).toBe('approved');
  expect(projected[2].approval_status).toBe('approved_with_conditions');
  expect(new Set(db.ai_systems.map(row => row.ai_system_id)).size).toBe(3);
  const chatgpt = db.ai_systems.find(row => row.catalog_key === 'chatgpt');
  const claude = db.ai_systems.find(row => row.catalog_key === 'claude');
  expect(chatgpt.related_links).toEqual([expect.objectContaining({kind: 'risks', id: db.risks[1].risk_id, classification: 'Context'})]);
  expect(claude.related_links).toEqual([expect.objectContaining({kind: 'risks', id: db.risks[1].risk_id, classification: 'Context'})]);
  expect(db.risks[1].risk_score).toBe(9);
  expect(db.risks[1].description).toMatch(/public\/internal.*ChatGPT approval remains pending/);
  expect(db.risks[1].description).toMatch(/confidential ChatGPT use remains restricted/);
  expect(chatgpt.permitted_data_types).not.toContain('Confidential');
  expect(db.ai_systems.every(row => row.related_links.every(link => link.id !== db.risks[0].risk_id))).toBe(true);
  expect(db.ai_systems.find(row => row.catalog_key === 'm365').related_links[0].id).toBe(db.risks[2].risk_id);
});

test('Vendor catalog identity is explicit and unsupported providers use the native fallback', () => {
  const db = fixture();
  seedCisDemoOperations(db, CIS_DEMO_SCENARIOS[0], dates);
  const microsoft = db.vendors.find(row => row.catalog_key === 'microsoft-365');
  expect(registerCatalogLogo('vendors', microsoft)).toBeTruthy();
  for (const vendor of db.vendors.filter(row => row.catalog_key === null)) expect(registerCatalogLogo('vendors', vendor)).toBeUndefined();
  expect(db.vendors.some(row => row.status === 'inactive')).toBe(true);
  expect(db.vendors.some(row => row.assurance_records.some(assurance => assurance.review_status === 'requested' && assurance.next_follow_up))).toBe(true);
  expect(db.vendors.some(row => row.assurance_records.some(assurance => assurance.review_status === 'reviewed' && assurance.evidence_ids.length))).toBe(true);
  expect(db.reviews.some(row => row.vendor_purpose === 'contract' && row.recurrence === 'none')).toBe(true);
});

test('operating Actions cover native priorities, exact due buckets, work states and an unassigned owner', () => {
  const db = fixture();
  seedCisDemoOperations(db, CIS_DEMO_SCENARIOS[0], dates);
  expect(new Set(db.tasks.map(row => row.priority))).toEqual(new Set(['critical', 'high', 'medium', 'low']));
  for (const offset of [-5, 0, 5, 12, 25, 60]) expect(db.tasks.some(row => row.status !== 'done' && row.due_date === dates.day(offset))).toBe(true);
  for (const status of ['open', 'in_progress', 'blocked', 'done']) expect(db.tasks.some(row => row.status === status)).toBe(true);
  expect(db.tasks.some(row => row.assignee_id === null && row.status === 'open')).toBe(true);
  expect(db.tasks.filter(row => row.status === 'done').every(row => row.completed_by && row.completed_at)).toBe(true);
});

test.each([
  [CIS_DEMO_SCENARIOS[0], /bridge closure/],
  [CIS_DEMO_SCENARIOS[1], /premises shutdown/],
  [CIS_DEMO_SCENARIOS[2], /waterfront closure/]
].map(([scenario, title]) => ({scenario, title})))('$scenario.name Critical Action addresses its distinct physical continuity exposure, not a clerical supplier chase', ({scenario, title}) => {
  const db = fixture(scenario);
  seedCisDemoOperations(db, scenario, dates);
  const continuity = db.risks[0], finding = db.findings.find(row => row.finding_id.endsWith('_assurance'));
  expect(continuity.title).toMatch(title);
  expect(continuity.risk_score).toBe(25);
  const critical = db.tasks.filter(row => row.priority === 'critical');
  expect(critical).toHaveLength(1);
  expect(critical[0]).toMatchObject({client_id: scenario.client_id, source_type: 'risk',
    source_id: continuity.risk_id, risk_id: continuity.risk_id, due_date: dates.day(60), status: 'open'});
  expect(continuity.related_task_ids).toContain(critical[0].task_id);
  expect(continuity.status).toBe('in_progress');
  expect(db.risks[3].status).toBe('assessed');
  for(const task of db.tasks.filter(row=>row.risk_id&&row.status!=='done')){
    expect(db.risks.find(row=>row.risk_id===task.risk_id).status).toBe('in_progress');
  }
  expect(finding.severity).toBe('medium');
  expect(db.tasks.find(row => row.task_id === finding.primary_task_id)).toMatchObject({priority: 'medium', finding_id: finding.finding_id});
});

test('Action completion is not Finding validation; the unchanged native commands enforce the distinction', () => {
  const db = fixture();
  seedCisDemoOperations(db, CIS_DEMO_SCENARIOS[0], dates);
  const working = db.findings.find(row => row.status === 'in_remediation');
  expect(() => action(db, 'findings', working.finding_id, 'validate', {rationale: 'Too early'})).toThrow(/Complete remediation/);
  const pending = db.findings.find(row => row.status === 'remediated');
  expect(pending.validated_by).toBeUndefined();
  expect(db.tasks.find(row => row.task_id === pending.primary_task_id).status).toBe('done');
  write(db, 'tasks', {status: 'done'}, working.primary_task_id);
  expect(working.status).toBe('remediated');
  expect(working.validated_at).toBeUndefined();
  action(db, 'findings', working.finding_id, 'validate', {rationale: 'The separately retained synthetic evidence was independently checked.'});
  expect(working).toMatchObject({status: 'closed', validated_by: 'demo_admin', closed_by: 'demo_admin'});
  expect(working.decision_history.at(-1).action).toBe('validated');
});

test('supplemental native Review histories keep consecutive cycles, ownership and honest organization-defined context', () => {
  const db = fixture();
  seedCisDemoOperations(db, CIS_DEMO_SCENARIOS[0], dates);
  for (const review of db.reviews) {
    expect(review.owner_id).toBeTruthy();
    expect(review.governance_context).toMatchObject({category: 'organizational', cadence_source: 'organization_defined'});
    expect(review.framework_key).toBeUndefined();
    expect(review.framework_safeguards).toBeUndefined();
    expect(review.scope).toMatch(/linked operating record/);
    if (review.recurrence === 'none') continue;
    expect(review.occurrences).toHaveLength(review.recurrence === 'annual' ? 1 : 2);
    for (const occurrence of review.occurrences) {
      expect(occurrence.status).toBe('completed');
      expect(occurrence.completed_by).toBe('demo_admin');
      expect(occurrence.no_evidence_reason).toMatch(/synthetic/);
      expect(occurrence.created_at <= occurrence.completed_at).toBe(true);
    }
    for (let index = 1; index < review.occurrences.length; index += 1)
      expect(review.occurrences[index - 1].next_review_date.slice(0, 10)).toBe(review.occurrences[index].due_date);
    expect(review.occurrences.at(-1).next_review_date.slice(0, 10)).toBe(review.due_date);
    expect(reviewView(review).next_review_date).toBeTruthy();
  }
});

test('actual small Unicode evidence bytes survive the existing storage/reload contract', () => {
  const db = fixture();
  seedCisDemoOperations(db, CIS_DEMO_SCENARIOS[0], dates);
  clearFileCache();
  const restored = restoreFiles(copy(lightweightStore(db)));
  expect(restored.evidence).toHaveLength(3);
  for (const row of restored.evidence) {
    const bytes = atob(row.content_base64);
    expect(row.size).toBe(bytes.length);
    expect(bytes.length).toBeLessThan(16 * 1024);
    const text = decodeURIComponent(Array.from(bytes, char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    expect(text).toContain('DEMO - SYNTHETIC DATA');
    expect(text).toContain(row.client_id);
    expect(row.content_base64).toBe(db.evidence.find(original => original.evidence_id === row.evidence_id).content_base64);
    expect(row.demo_file_storage).toBeUndefined();
  }
});

test.each(CIS_DEMO_SCENARIOS)('$name initial operation artifacts and retained recipes render the identical original UTF-8 format', scenario => {
  const db = fixture(scenario);
  seedCisDemoOperations(db, scenario, dates);
  for (const row of db.evidence) {
    const recipe = Object.freeze(artifactRecipe({client_id: scenario.client_id,
      key: row.evidence_id.slice(scenario.client_id.length + 1), title: row.display_name, day: row.evidence_date}));
    const original = {content_base64: row.content_base64, size: row.size};
    expect(renderCisOperationArtifact(recipe)).toEqual(original);
    const binary = atob(original.content_base64);
    const text = decodeURIComponent(Array.from(binary, char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    expect(text).toBe(`DEMO - SYNTHETIC DATA\n${recipe.title}\nClient: ${scenario.client_id}\nCollected: ${recipe.day}\nIllustrative UTF-8 sample — not a real customer document, certification or external assurance report.`);
    expect(original.size).toBe(binary.length);
    // A later user edit is not an instruction to regenerate different evidence.
    row.display_name = 'Visitor-edited display title';
    db.vendors.forEach(vendor => {vendor.name = 'Visitor-edited provider name';});
    expect(renderCisOperationArtifact(recipe)).toEqual(original);
    expect(Object.isFrozen(recipe)).toBe(true);
  }
});

test.each([
  ['future schema', {schema_version: 2}],
  ['wrong fixture revision', {fixture_version: 'future-fixture'}],
  ['wrong artifact kind', {kind: 'operating'}],
  ['another client', {client_id: 'new-client'}],
  ['unknown artifact', {key: 'custom-file'}],
  ['prototype artifact key', {key: '__proto__'}],
  ['unapproved provider artifact for this client', {key: 'evidence_provider_1', title: 'Synthetic completed provider assessment — OpenAI'}],
  ['edited title', {title: 'A later record title'}],
  ['oversized title', {title: 'x'.repeat(100000)}],
  ['wrong collected date', {day: dates.day(-19)}],
  ['non-midnight initialization', {anchor: '2026-10-28T12:00:00.000Z'}],
  ['invalid calendar initialization', {anchor: '2026-02-30T00:00:00.000Z'}],
  ['extra payload field', {content_base64: btoa('not an initial recipe')}],
])('operation renderer refuses %s without accepting a broader file-generation recipe', (_description, changes) => {
  const recipe = artifactRecipe(changes), before = copy(recipe);
  expect(renderCisOperationArtifact(recipe)).toBeNull();
  expect(recipe).toEqual(before);
});

test.each([null, undefined, [], 'recipe'])('operation renderer rejects absent or non-object recipe %p', recipe => {
  expect(renderCisOperationArtifact(recipe)).toBeNull();
});

test('Krusty operating gaps never invent a deficient CIS inventory assessment', () => {
  const scenario = CIS_DEMO_SCENARIOS[2], db = fixture(scenario);
  db.framework_assessments.push({framework_assessment_id: 'retained-ig3', client_id: scenario.client_id, definition_id: '1.1', status: 'addressed'});
  const before = copy(db.framework_assessments);
  seedCisDemoOperations(db, scenario, dates);
  expect(db.framework_assessments).toEqual(before);
  expect(db.findings.every(row => !row.framework_assessment_id && !row.definition_id)).toBe(true);
  expect(db.reviews.filter(row => row.due_date < dates.day(0)).every(row => row.governance_context.category === 'organizational')).toBe(true);
  expect(db.findings.find(row => row.status === 'in_remediation').title).toMatch(/Optional supplemental/);
  for (const vendor of db.vendors.filter(row => row.status === 'active')) {
    expect(vendor.next_review > dates.day(0)).toBe(true);
    const providerReviews = db.reviews.filter(row => row.vendor_id === vendor.vendor_id && row.vendor_purpose === 'vendor');
    expect(providerReviews).toHaveLength(1);
    expect(providerReviews[0].occurrences.at(-1).completed_at >= dates.instant(-365)).toBe(true);
    expect(vendorSignals(vendor, db.reviews, new Date(dates.anchor))).toMatchObject({_reviewOverdue: false, _assuranceIssue: false});
    const required = vendor.assurance_records.filter(assurance => assurance.required !== false);
    expect(required.length).toBeGreaterThan(0);
    expect(required.every(assurance => assuranceStatus(vendor, assurance, new Date(dates.anchor)) === 'current')).toBe(true);
    for (const assurance of required) {
      expect(assurance).toMatchObject({review_status: 'reviewed'});
      expect(assurance.evidence_ids.every(id => db.evidence.some(row => row.evidence_id === id && row.content_base64))).toBe(true);
    }
    expect(vendor.contract_start <= dates.day(0) && vendor.contract_expiration > dates.day(0)).toBe(true);
    expect(vendor.contract_evidence_ids.every(id => db.evidence.some(row => row.evidence_id === id && row.content_base64))).toBe(true);
  }
  const optional = db.vendors.flatMap(row => row.assurance_records).find(row => row.required === false);
  expect(optional).toMatchObject({review_status: 'requested'});
  expect(optional.next_follow_up < dates.day(0)).toBe(true);
});

test.each(CIS_DEMO_SCENARIOS)('$name historical operating records stay inside its selected scenario age', scenario => {
  const db = fixture(scenario);
  seedCisDemoOperations(db, scenario, dates);
  const earliest = dates.month(scenario.client_id === 'demo_brawndo' ? -18 : -24);
  for (const kind of ['risks', 'vendors', 'ai_systems', 'reviews', 'findings', 'tasks', 'evidence'])
    expect(db[kind].every(row => row.created_at.slice(0, 10) >= earliest)).toBe(true);
});

test('only canonical Explore fixtures can change, counters remain monotonic, and a second call cannot duplicate records', () => {
  const scenario = CIS_DEMO_SCENARIOS[0], db = fixture(scenario);
  db.risks.push({risk_id: 'unrelated-legacy', client_id: 'other', title: 'Retained external fixture'});
  db.ai_counters = {[scenario.client_id]: 8};
  db.riskSequences = {[scenario.client_id]: 10};
  const unrelated = copy(db.risks[0]);
  seedCisDemoOperations(db, scenario, dates);
  expect(db.risks.find(row => row.risk_id === 'unrelated-legacy')).toEqual(unrelated);
  expect(db.ai_systems.map(row => row.display_id)).toEqual(['AI-009', 'AI-010', 'AI-011']);
  expect(db.risks.filter(row => row.client_id === scenario.client_id).map(row => row.display_id)).toEqual(['RISK-011', 'RISK-012', 'RISK-013', 'RISK-014', 'RISK-015']);
  const saved = copy(db);
  expect(() => seedCisDemoOperations(db, scenario, dates)).toThrow(/Clear only/);
  expect(db).toEqual(saved);
  const authenticated = fixture();
  authenticated.user.workspace_mode = 'standard';
  expect(() => seedCisDemoOperations(authenticated, scenario, dates)).toThrow(/Explore Demo/);
  expect(authenticated.risks).toEqual([]);
  expect(() => seedCisDemoOperations(fixture(), {client_id: 'new-customer'}, dates)).toThrow(/Unsupported canonical/);
});
