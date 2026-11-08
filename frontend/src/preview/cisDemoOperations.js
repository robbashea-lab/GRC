import {AI_DEFAULTS, validateAI} from '../lib/aiGovernance';
import {AI_PILOT_DEFAULTS, aiScope} from '../lib/brawndoAI';
import {applyTool, blankDraft, catalogKeys, screeningScope} from '../lib/aiOnboarding';
import onboardingCatalog from '../lib/aiOnboardingCatalog.json';
import {assessedRisk} from '../lib/grcWork';
import {reviewSchedule, reviewView} from '../lib/reviewOccurrences';
import {eligible, validateAssignment} from './assignmentEligibility';
import {prepareTask} from './actionItems';
import {allocateRiskId} from './riskIds';
import {ensureRiskReview, riskSnapshot} from './risks';
import {ensureVendorReviews, validateVendor} from './vendors';
import {cisDemoFixtureDates, CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {registerCisDemoArtifact} from './cisDemoArtifactRecipes';

const clone = value => JSON.parse(JSON.stringify(value));
const operationalContext = () => ({
  category: 'organizational',
  rationale: 'Explicit fictional organization-selected operating work; not an additional CIS-mandated Review or safeguard deficiency.',
  cadence_source: 'organization_defined',
  cadence_rationale: 'The fictional organization selected this follow-up according to its own exposure and management decisions.'
});

const createdAt = (scenario, dates) => dates.month(scenario.client_id === 'demo_brawndo' ? -18 : -24) + 'T00:00:00.000Z';
const CANONICAL_CLIENT_IDS = ['demo_brawndo', 'demo_initech', 'demo_krusty_krab'];
const OPERATION_ARTIFACTS = {
  evidence_vendor_current: {title: 'Synthetic Microsoft workspace assurance checklist', offset: -20},
  evidence_pending_validation: {title: 'Synthetic corrected procedure sample — validation pending', offset: -10},
  evidence_validated: {title: 'Synthetic supplier access revocation result', offset: -40},
  evidence_provider_1: {title: 'Synthetic completed provider assessment — OpenAI', offset: -20, krustyOnly: true},
  evidence_provider_2: {title: 'Synthetic completed provider assessment — Anthropic', offset: -20, krustyOnly: true},
  evidence_contract_0: {title: 'Synthetic current service agreement — Microsoft 365', offset: -180, krustyOnly: true},
  evidence_contract_1: {title: 'Synthetic current service agreement — OpenAI', offset: -180, krustyOnly: true},
  evidence_contract_2: {title: 'Synthetic current service agreement — Anthropic', offset: -180, krustyOnly: true}
};
const ARTIFACT_RECIPE_KEYS = ['kind', 'schema_version', 'fixture_version', 'client_id', 'anchor', 'key', 'title', 'day'];

// Initial creation and the guarded fixture fallback must produce the same bytes,
// independently of later edits to a record's display name or linked provider.
export function renderCisOperationArtifact(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)
    || Object.keys(recipe).length !== ARTIFACT_RECIPE_KEYS.length
    || Object.keys(recipe).some(key => !ARTIFACT_RECIPE_KEYS.includes(key))
    || recipe.kind !== 'operation' || recipe.schema_version !== 1 || recipe.fixture_version !== CIS_SHOWCASE_VERSION
    || !CANONICAL_CLIENT_IDS.includes(recipe.client_id) || typeof recipe.anchor !== 'string') return null;
  const specification = Object.hasOwn(OPERATION_ARTIFACTS, recipe.key) ? OPERATION_ARTIFACTS[recipe.key] : null;
  if (!specification || specification.krustyOnly && recipe.client_id !== 'demo_krusty_krab'
    || recipe.title !== specification.title || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(recipe.anchor)) return null;
  const clock = new Date(recipe.anchor);
  if (!Number.isFinite(+clock) || clock.toISOString() !== recipe.anchor) return null;
  const dates = cisDemoFixtureDates(clock);
  if (recipe.day !== dates.day(specification.offset)) return null;
  const text = ['DEMO - SYNTHETIC DATA', recipe.title, `Client: ${recipe.client_id}`, `Collected: ${recipe.day}`,
    'Illustrative UTF-8 sample — not a real customer document, certification or external assurance report.'].join('\n');
  const bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return {content_base64: btoa(bytes), size: bytes.length};
}

function people(db, cid) {
  const candidates = db.users.filter(user => eligible(user, cid));
  const actor = candidates.find(user => user.user_id === db.user.user_id && ['super_admin', 'platform_admin'].includes(user.role))
    || candidates.find(user => ['super_admin', 'platform_admin'].includes(user.role));
  const owner = candidates.find(user => user.role === 'client_grc_manager') || actor;
  if (!actor || !owner) throw new Error('CIS Demo operating fixtures require existing eligible decision and work owners.');
  return {actor, owner};
}

function evidence(db, cid, id, title, linkedType, linkedId, owner, dates, offset, relationships = []) {
  const recipe = Object.freeze({kind: 'operation', schema_version: 1, fixture_version: CIS_SHOWCASE_VERSION,
    client_id: cid, anchor: dates.anchor, key: id.slice(cid.length + 1), title, day: dates.day(offset)});
  const artifact = renderCisOperationArtifact(recipe);
  if (!artifact) throw new Error('Unsupported canonical CIS Demo operation artifact.');
  const row = {evidence_id: id, client_id: cid, filename: id.replace(cid + '_', '') + '.txt', display_name: title,
    mime_type: 'text/plain', ...artifact, evidence_type: 'Report',
    linked_type: linkedType, linked_id: linkedId, relationships, uploaded_by: owner.user_id,
    uploaded_by_email: owner.email, uploaded_at: dates.instant(offset), created_at: dates.instant(offset),
    evidence_date: dates.day(offset), version: 1, notes: 'Small synthetic bytes; existing Demo file-size, aggregate-storage and lifetime limits apply.'};
  db.evidence.push(row);
  registerCisDemoArtifact(db, row, recipe);
  return row;
}

function seedRisks(db, scenario, dates, actor, owner) {
  const cid = scenario.client_id;
  const continuity = {
    demo_brawndo: {
      title: 'Confirmed bridge closure leaves no alternate beverage dispatch route',
      description: `Fictional scenario: a confirmed bridge replacement will close the only heavy-vehicle route from the bottling site between ${dates.day(90)} and ${dates.day(97)}. No alternate dispatch depot or approved carrier route is reserved. This is a physical logistics exposure, independent of the recorded CIS implementation.`,
      likelihood: 'The fictional municipality has confirmed the closure dates and the site has only one approved heavy-vehicle exit; interruption is highly likely without a contingency.',
      impact: 'A week without beverage dispatch would exhaust customer replenishment windows, spoil staged stock and threaten the company’s cash runway; the fictional owner judged the business impact severe.',
      plan: `Reserve an alternate dispatch depot and carrier route by ${dates.day(60)}, then test the physical handover before the bridge closes.`
    },
    demo_initech: {
      title: 'Confirmed premises shutdown leaves no alternate payment-fulfilment facility',
      description: `Fictional scenario: confirmed landlord remediation will close the sole physical payment-fulfilment facility between ${dates.day(90)} and ${dates.day(97)}. No alternate facility is contracted for paper-payment dispatch and required customer notices. This business continuity exposure is separate from the recorded CIS controls.`,
      likelihood: 'The fictional landlord has confirmed the shutdown window and the physical dispatch process has no alternate premises; missed fulfilment is highly likely without a contingency.',
      impact: 'A week of missed payment dispatch and contractual notices would affect many customers, incur material contract penalties and threaten the service’s viability; the fictional owner judged the impact severe.',
      plan: `Arrange alternate payment-fulfilment premises by ${dates.day(60)} and rehearse dispatch and customer-notice handling before the shutdown.`
    },
    demo_krusty_krab: {
      title: 'Confirmed waterfront closure leaves no licensed alternate kitchen',
      description: `Fictional scenario: confirmed seawall works will close access to the restaurant’s sole licensed kitchen between ${dates.day(90)} and ${dates.day(97)}. No licensed temporary kitchen or alternative collection site is reserved. The residual physical business exposure does not imply a missing CIS safeguard.`,
      likelihood: 'The fictional local authority has confirmed the access closure and all meal preparation depends on the affected kitchen; service interruption is highly likely without a contingency.',
      impact: 'A week without meal service would remove the restaurant’s principal revenue while payroll and lease costs continue, threatening its cash reserve; the fictional owner judged the impact severe.',
      plan: `Reserve a licensed temporary kitchen and collection site by ${dates.day(60)}, then rehearse food-safe transport before the waterfront closure.`
    }
  }[cid];
  const titles = [
    continuity.title,
    'Unverified AI procedure drafts could disrupt operating decisions',
    'Workspace retrieval may include material beyond the approved Copilot use',
    'Optional recovery exercise has not yet covered an external dependency',
    'Retired supplier credentials could remain usable after offboarding'
  ];
  const descriptions = [
    continuity.description,
    'This risk covers public/internal procedure drafting: ChatGPT approval remains pending, while Claude’s approved workflow requires human checking. Incorrect instructions could reach operators if independent validation is missed. Proposed confidential ChatGPT use remains restricted and outside the permitted scope; no actual disclosure incident is asserted.',
    'Microsoft 365 Copilot can retrieve workspace content. A time-limited decision accepts the documented residual exposure while access reviews and human output checks continue.',
    'A residual external service dependency remains outside the optional management recovery exercise. The organization selected a separate risk follow-up; this is not an assertion that a CIS safeguard is deficient.',
    'A legacy supplier previously held credentials. Revocation and follow-up testing removed the exposure; the closed record preserves its original assessment rather than changing the score to zero.'
  ];
  const likelihood = [5, 3, 2, 2, 2], impact = [5, 3, 3, 5, 2];
  // Allocate only inside this tenant. The native allocator also normalizes old IDs;
  // an unrelated retained fixture must never be normalized as a side effect here.
  db.riskSequences ||= {};
  const riskIds = {risks: [], riskSequences: db.riskSequences};
  const rows = titles.map((title, index) => assessedRisk({
    risk_id: index === 0 ? cid + (cid === 'demo_brawndo' ? '_risk_0' : '_risk_recovery') : cid + '_risk_operating_' + index,
    display_id: allocateRiskId(riskIds, cid), client_id: cid, title: scenario.name + ' — ' + title,
    description: descriptions[index], category: 'operational', source_type: 'manual',
    // The first two Risks already have active treatment Actions; native creation
    // advances a scored Open/Assessed Risk into treatment.
    status: ['in_progress', 'in_progress', 'accepted', 'assessed', 'closed'][index], owner_id: owner.user_id,
    likelihood_score: likelihood[index], impact_score: impact[index], assessment_rationale: 'Explicit fictional human assessment: ' + descriptions[index],
    likelihood_rationale: [continuity.likelihood,
      'Staff checking reduces but does not eliminate a plausible drafting error.', 'Managed access reviews and approval controls reduce likelihood.',
      'A disruption is less likely with available redundancy, but the untested dependency still needs a scoped exercise.',
      'The original exposed credential had a readily usable access path.'][index],
    impact_rationale: [continuity.impact,
      'Incorrect instructions could materially interrupt a limited operating process.', 'Unexpected retrieval could disclose a bounded set of internal records.',
      'Loss of the external dependency could interrupt the selected service for an extended period.',
      'The retired connection was confined to a low-impact legacy service.'][index],
    treatment: index === 2 ? 'accept' : 'mitigate', treatment_plan: [
      continuity.plan,
      'Pilot independent procedure checks and retain the reviewed output sample.',
      'Monitor the approved scope and revisit the explicit acceptance before expiry.',
      'Agree the external dependency exercise scope and retain the optional management test result.',
      'Completed: remove supplier credentials and inspect the revocation test.'
    ][index], created_at: createdAt(scenario, dates), date_identified: createdAt(scenario, dates).slice(0, 10),
    created_by: actor.user_id, updated_at: dates.instant(index === 4 ? -35 : -8),
    last_reviewed: dates.day(index === 4 ? -35 : -8), next_review: index === 4 ? null : dates.day([12, 30, 60, -5][index]),
    review_cadence: 'quarterly', related_task_ids: [], related_finding_ids: [], rating_history: []
  }));
  for (const [index, risk] of rows.entries()) if (index < 2) risk.rating_history.push({
    at: dates.instant(-8), by: actor.user_id, by_name: actor.name,
    prev_likelihood: 2, prev_impact: 3, new_likelihood: risk.likelihood_score,
    new_impact: risk.impact_score, prev_score: 6
  });
  Object.assign(rows[2], {accepted: true, accepted_by: actor.user_id, acceptance_date: dates.instant(-30),
    acceptance_expires_at: dates.day(60), acceptance_rationale: 'Fictional time-limited management acceptance of the documented residual workspace-retrieval exposure; human checks and scope restrictions remain required.',
    decision_history: [{action: 'accepted', by: actor.user_id, at: dates.instant(-30), expires_at: dates.day(60),
      rationale: 'Explicit fictional acceptance; reevaluate at expiry or a material change.'}]});
  Object.assign(rows[4], {closed_at: dates.instant(-35), closed_by: actor.user_id, closure_reason: 'condition_removed',
    closure_note: 'Fictional access revocation and negative-access test confirmed the retired supplier connection no longer works.',
    decision_history: [{action: 'closed', by: actor.user_id, at: dates.instant(-35), reason: 'condition_removed',
      note: 'Synthetic test of revoked supplier credentials; original assessment retained.'}]});
  db.risks.push(...rows);
  for (const risk of rows) {
    const review = ensureRiskReview(db, risk);
    if (review) Object.assign(review, {created_at: risk.created_at, created_by: actor.user_id,
      updated_at: risk.updated_at, governance_context: operationalContext(), occurrences: []});
  }
  return rows;
}

function seedVendors(db, scenario, dates, actor, owner) {
  const cid = scenario.client_id;
  const completeProviderBaseline = scenario.implementation_group === 3;
  const rows = [
    {suffix: cid === 'demo_brawndo' ? '_vendor_0' : '_vendor_hosting', name: 'Microsoft 365', catalog_key: 'microsoft-365',
      service: 'Managed collaboration workspace and Microsoft 365 Copilot', criticality: 'high', status: 'active', next: 30, renewal: 120},
    {suffix: '_vendor_openai', name: 'OpenAI', catalog_key: null, service: 'ChatGPT managed business workspace', criticality: 'critical', status: 'active', next: completeProviderBaseline ? 45 : -3, renewal: 45},
    {suffix: '_vendor_anthropic', name: 'Anthropic', catalog_key: null, service: 'Claude managed drafting workspace', criticality: 'medium', status: 'active', next: 12, renewal: 180},
    {suffix: '_vendor_retired', name: scenario.name + ' legacy supplier (fictional)', catalog_key: null,
      service: 'Retired service integration', criticality: 'low', status: 'inactive', next: null, renewal: null}
  ].map((spec, index) => ({vendor_id: cid + spec.suffix, client_id: cid, name: spec.name, catalog_key: spec.catalog_key,
    service: spec.service, services: spec.service, criticality: spec.criticality, status: spec.status,
    business_owner_id: owner.user_id, owner_id: owner.user_id, data_types: index === 1 ? ['Confidential', 'Customer Data'] : ['Internal'],
    review_frequency: 'annual', next_review: spec.next === null ? null : dates.day(spec.next), last_review: dates.day(-210),
    contract_renewal: spec.renewal === null ? null : dates.day(spec.renewal), contract_lead_days: 60,
    contract_review_enabled: index === 1, assurance_required: index < 3, assurance_window_days: 90,
    separate_assurance_review: index === 2, assurance_review_date: index === 2 ? dates.day(18) : null,
    assurance_cadence: 'annual', assurance_records: [], related_risk_ids: [],
    created_at: createdAt(scenario, dates), created_by: actor.user_id, updated_at: dates.instant(-10),
    notes: 'Explicit fictional Demo relationship. Operational Review and contract follow-up are organization-selected, not extra CIS-mandated generic Reviews.'}));
  db.vendors.push(...rows);
  const current = evidence(db, cid, cid + '_evidence_vendor_current', 'Synthetic Microsoft workspace assurance checklist', 'vendor', rows[0].vendor_id, owner, dates, -20);
  rows[0].assurance_records = [{assurance_id: cid + '_assurance_workspace', type: 'Security Questionnaire', required: true,
    received_at: dates.day(-20), refresh_due: dates.day(180), review_status: 'reviewed', reviewed_on: dates.day(-18),
    reviewed_by: actor.name, evidence_ids: [current.evidence_id], history: []}];
  rows[1].assurance_records = [{assurance_id: cid + '_assurance_openai', type: 'Security Questionnaire', required: true,
    review_status: 'requested', next_follow_up: dates.day(7), evidence_ids: [], history: []}];
  rows[2].assurance_records = [{assurance_id: cid + '_assurance_claude', type: 'Security Questionnaire', required: true,
    review_status: 'requested', expected_availability: dates.day(10), next_follow_up: dates.day(12), evidence_ids: [], history: []}];
  if (completeProviderBaseline) for (const [index, vendor] of rows.slice(0, 3).entries()) {
    if (index > 0) {
      const sample = evidence(db, cid, cid + '_evidence_provider_' + index,
        'Synthetic completed provider assessment — ' + vendor.name, 'vendor', vendor.vendor_id, owner, dates, -20);
      vendor.assurance_records = [{assurance_id: cid + '_assurance_provider_' + index, type: 'Security Questionnaire', required: true,
        received_at: dates.day(-20), refresh_due: dates.day(180), review_status: 'reviewed', reviewed_on: dates.day(-18),
        reviewed_by: actor.name, evidence_ids: [sample.evidence_id], history: []}];
    }
    const contract = evidence(db, cid, cid + '_evidence_contract_' + index,
      'Synthetic current service agreement — ' + vendor.name, 'vendor', vendor.vendor_id, owner, dates, -180);
    Object.assign(vendor, {contract_start: dates.day(-180), contract_expiration: vendor.contract_renewal,
      contract_evidence_ids: [contract.evidence_id], auto_renewal: 'no'});
  }
  if (completeProviderBaseline) rows[1].assurance_records.push({assurance_id: cid + '_assurance_optional_supplement',
    type: 'Other', document_name: 'Voluntary AI use-case supplemental questionnaire', required: false,
    review_status: 'requested', next_follow_up: dates.day(-3), evidence_ids: [], history: []});
  for (const vendor of rows) {
    // Historical fixtures retain their lifecycle; validate against that same saved state.
    validateVendor(db, vendor, clone(vendor));
    for (const review of ensureVendorReviews(db, vendor)) Object.assign(review, {created_at: vendor.created_at,
      created_by: actor.user_id, updated_at: vendor.updated_at, governance_context: operationalContext(), occurrences: []});
  }
  return rows;
}

function seedAI(db, scenario, dates, actor, owner, risks, vendors) {
  const cid = scenario.client_id;
  const configs = [
    {key: 'chatgpt', vendor: vendors[1], risk: risks[1], status: 'active', approval: 'pending_assessment', due: -4},
    {key: 'claude', vendor: vendors[2], risk: risks[1], status: 'active', approval: 'approved', due: 12},
    {key: 'm365', vendor: vendors[0], risk: risks[2], status: 'active', approval: 'approved_with_conditions', due: 30}
  ];
  db.ai_counters ||= {};
  db.ai_counters[cid] = db.ai_counters[cid] || 0;
  for (const config of configs) {
    const preset = applyTool(blankDraft(createdAt(scenario, dates).slice(0, 10)), catalogKeys.indexOf(config.key));
    if (config.key === 'chatgpt') {
      preset.data_types = ['Internal', 'Confidential', 'Customer Data'];
      preset.answers = {...preset.answers, sensitive: true, external: true, harm: true};
    }
    if (config.key !== 'chatgpt') preset.answers.settings = true;
    db.ai_counters[cid] += 1;
    const row = {...clone(AI_DEFAULTS), ...clone(AI_PILOT_DEFAULTS), ai_system_id: cid + '_ai_' + config.key,
      display_id: 'AI-' + String(db.ai_counters[cid]).padStart(3, '0'),
      client_id: cid, catalog_key: config.key, name: preset.name, provider: preset.provider, product_model: preset.name,
      environment: preset.environment, description: `${scenario.name}: ${preset.description}`, owner_id: owner.user_id,
      technical_owner_id: owner.user_id, oversight_owner_id: owner.user_id, vendor_id: config.vendor.vendor_id,
      purposes: [...preset.purposes], data_types: [...preset.data_types], permitted_data_types: [...preset.permitted_data_types],
      access: [...preset.access], restrictions: config.key === 'chatgpt'
        ? 'Confidential use remains proposed and restricted pending assessment; the preset does not authorize it.'
        : 'Public/internal outputs only; independently validate all material outputs. No autonomous actions.',
      data_settings: 'Explicit fictional workspace configuration; provider defaults do not prove this organization’s actual settings.',
      human_review_required: true, human_approval_required: true, oversight_notes: 'The accountable owner validates important outputs before use.',
      status: config.status, approval_status: config.approval, created_at: createdAt(scenario, dates), created_by: actor.user_id,
      updated_at: dates.instant(-1), related_links: [{kind: 'risks', id: config.risk.risk_id, classification: 'Context', source: '',
        rationale: 'Explicit fictional risk assessment for this deployment; screening tier and likelihood × impact remain distinct.'}]};
    row.onboarding_screening = {schema_version: 1, catalog_version: onboardingCatalog.reviewedOn, answers: {...preset.answers},
      scope: screeningScope(row), recorded_at: dates.instant(-1), recorded_by: actor.user_id};
    if (['approved', 'approved_with_conditions'].includes(config.approval)) row.approval_history = [{status: config.approval,
      note: 'Explicit fictional administrator decision: public/internal outputs only, access boundaries reviewed and important outputs independently validated.',
      scope: aiScope(row), at: dates.instant(-1), by: actor.user_id, by_name: actor.name}];
    validateAI(db, row);
    validateAssignment(db, 'ai_systems', row);
    db.ai_systems.push(row);
    config.vendor.related_risk_ids.push(config.risk.risk_id);
    const review = {review_id: cid + '_review_ai_' + config.key, client_id: cid, ai_system_id: row.ai_system_id,
      ai_review_purpose: 'periodic', title: `AI Governance Review — ${row.display_id} — ${row.name}`, review_type: 'ai_governance',
      owner_id: owner.user_id, due_date: dates.day(config.due), recurrence: 'annual', status: 'upcoming', occurrences: [],
      created_at: row.created_at, created_by: actor.user_id, updated_at: row.updated_at, governance_context: operationalContext()};
    db.reviews.push(reviewView({...review, ...reviewSchedule(review)}));
  }
}

function seedRemediation(db, scenario, dates, actor, owner, risks, vendors) {
  const cid = scenario.client_id;
  const voluntaryAssurance = scenario.implementation_group === 3;
  const findingRows = [
    {suffix: 'assurance', title: voluntaryAssurance ? 'Optional supplemental supplier questionnaire is pending' : 'Supplier assurance follow-up is incomplete', status: 'in_remediation', severity: 'medium', age: -40, due: -5},
    {suffix: 'pending_validation', title: 'Procedure sample correction awaits independent validation', status: 'remediated', severity: 'low', age: -80, due: -20},
    {suffix: 'validated', title: 'Retired supplier access revocation was independently validated', status: 'closed', severity: 'low', age: -100, due: -45}
  ].map(spec => ({finding_id: cid + '_finding_operating_' + spec.suffix, client_id: cid, title: spec.title,
    description: 'Explicit fictional organization-selected operational follow-up. This is not a CIS safeguard assessment deficiency.',
    remediation_plan: 'Retain the dated work sample and request an independent authorized validation.',
    source: 'Organization-selected operational work', severity: spec.severity, status: spec.status, owner_id: owner.user_id,
    identified_at: dates.instant(spec.age), created_at: dates.instant(spec.age), created_by: actor.user_id,
    updated_at: dates.instant(spec.status === 'closed' ? -35 : -8), due_date: dates.day(spec.due), governance_context: operationalContext()}));
  db.findings.push(...findingRows);
  const taskSpecs = [
    {suffix: 'assurance', title: voluntaryAssurance ? 'Follow up on the voluntary supplemental supplier questionnaire' : 'Obtain the missing supplier assurance checklist', priority: 'medium', due: -5, status: 'open', finding: findingRows[0], vendor: vendors[1]},
    {suffix: 'ai_validation', title: 'Pilot independent checks for AI procedure drafts', priority: 'high', due: 0, status: 'in_progress', risk: risks[1]},
    {suffix: 'owner_needed', title: 'Assign an owner to the optional operating checklist', priority: 'medium', due: 12, status: 'open', unassigned: true},
    {suffix: 'supplier_scope', title: 'Confirm next-quarter workspace service scope', priority: 'low', due: 5, status: 'open', vendor: vendors[0]},
    {suffix: 'assurance_followup', title: 'Check the optional assurance request response', priority: 'medium', due: 25, status: 'open', vendor: vendors[2]},
    {suffix: 'next_quarter', title: 'Establish contingency for the confirmed physical operating interruption', priority: 'critical', due: 60, status: 'open', risk: risks[0]},
    {suffix: 'future_recovery', title: 'Schedule the optional management recovery exercise', priority: 'medium', due: 75, status: 'blocked'},
    {suffix: 'pending_validation', title: 'Correct the sampled procedure and retain the result', priority: 'low', due: -20, status: 'done', finding: findingRows[1]},
    {suffix: 'validated', title: 'Revoke retired supplier credentials and test denial', priority: 'low', due: -45, status: 'done', finding: findingRows[2]}
  ];
  for (const spec of taskSpecs) {
    const source = spec.finding ? ['finding', spec.finding.finding_id] : spec.risk ? ['risk', spec.risk.risk_id] : spec.vendor ? ['vendor', spec.vendor.vendor_id] : ['manual', null];
    const row = {task_id: cid + '_task_operating_' + spec.suffix, client_id: cid, title: spec.title,
      description: 'Fictional organization-selected operating Action; completion does not itself validate or close a linked Finding.',
      priority: spec.priority, status: spec.status, assignee_id: spec.unassigned ? null : owner.user_id, due_date: dates.day(spec.due),
      source_type: source[0], source_id: source[1], source: 'Organization-selected operational work',
      ...(spec.finding ? {finding_id: spec.finding.finding_id} : {}), ...(spec.risk ? {risk_id: spec.risk.risk_id} : {}),
      ...(spec.vendor ? {vendor_id: spec.vendor.vendor_id} : {}), created_at: spec.finding?.created_at || dates.instant(-90), created_by: actor.user_id,
      updated_at: dates.instant(spec.status === 'done' ? spec.suffix === 'validated' ? -40 : -10 : -7), governance_context: operationalContext()};
    // Validate a new Action's native provenance, then retain the explicitly fictional historical state.
    prepareTask(db, {...row, status: 'open'});
    if (spec.status === 'in_progress') Object.assign(row, {started_at: dates.instant(-7), started_by: owner.user_id});
    if (spec.status === 'done') Object.assign(row, {completed_at: row.updated_at, completed_by: owner.user_id});
    db.tasks.push(row);
    if (spec.finding) spec.finding.primary_task_id = row.task_id;
    if (spec.risk) spec.risk.related_task_ids.push(row.task_id);
  }
  Object.assign(findingRows[2], {validated_at: dates.instant(-35), validated_by: actor.user_id,
    closed_at: dates.instant(-35), closed_by: actor.user_id, decision_history: [{action: 'validated', by: actor.user_id,
      at: dates.instant(-35), rationale: 'Explicit fictional independent review of the revocation test confirmed the obsolete supplier access path is unavailable.'}]});
  for (const [index, finding] of findingRows.entries()) if (index > 0) evidence(db, cid,
    cid + '_evidence_' + (index === 1 ? 'pending_validation' : 'validated'),
    index === 1 ? 'Synthetic corrected procedure sample — validation pending' : 'Synthetic supplier access revocation result',
    'task', finding.primary_task_id, owner, dates, index === 1 ? -10 : -40, [{kind: 'findings', id: finding.finding_id}]);
}

function precedingDue(review, months) {
  const date = new Date(review.due_date.slice(0, 10) + 'T00:00:00.000Z');
  const day = review.schedule_anchor.day;
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(review.schedule_anchor.month_end ? last : Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

function seedOperationalReviewHistory(db, review, actor) {
  review.scope = 'Organization-selected review of the linked operating record, accountable owner, current exposure and recorded follow-up.';
  review.governance_context = operationalContext();
  const months = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12}[review.recurrence];
  if (!months) return; // A one-off contract event is not a fabricated recurring cycle.
  const risk = review.risk_id ? db.risks.find(row => row.risk_id === review.risk_id && row.client_id === review.client_id) : null;
  const cycles = [2, 1].filter(cycle => precedingDue(review, months * cycle) >= review.created_at.slice(0, 10));
  if (cycles.length) {
    const began = new Date(precedingDue(review, months * cycles[0]) + 'T00:00:00.000Z');
    began.setUTCDate(began.getUTCDate() - 7);
    // The seeded Review starts with its first retained cycle, not with an older
    // parent record that would imply silent missing operating occurrences.
    review.created_at = [review.created_at, began.toISOString()].sort().at(-1);
  }
  review.occurrences = cycles.map(cycle => {
    const due = precedingDue(review, months * cycle);
    const finished = new Date(due + 'T00:00:00.000Z');
    finished.setUTCDate(finished.getUTCDate() + 1);
    const completedAt = finished.toISOString();
    const execution = {...review, ...reviewSchedule({...review, due_date: due})};
    delete execution.occurrences;
    const snapshot = {...execution, occurrence_id: review.review_id + '_completed_' + cycle,
      current_occurrence_id: review.review_id + '_completed_' + cycle,
      due_date: due, status: 'completed', completed_at: completedAt, completion_date: completedAt, updated_at: completedAt,
      completed_by: actor.user_id, completed_by_name: actor.name, tested_period: execution.period,
      tested_scope: review.scope, checklist_confirmed: true, outcome: 'no_findings', finding_count: 0, evidence: [],
      conclusion: 'Explicit fictional operating review completed; owner and scope were checked. Separate current operational follow-up is retained without asserting CIS compliance.',
      no_evidence_reason: 'Historical synthetic review snapshot; no file is asserted to have been retained for this occurrence.'};
    if (risk) {
      const atThatTime = {...risk};
      const reassessment = risk.rating_history.find(item => item.at > completedAt);
      if (reassessment) Object.assign(atThatTime, assessedRisk({...atThatTime,
        likelihood_score: reassessment.prev_likelihood, impact_score: reassessment.prev_impact,
        assessment_rationale: 'Earlier explicit fictional assessment assumed the bounded operating controls were sufficient; a later reassessment recorded the changed exposure.',
        likelihood_rationale: 'Fictional baseline assumed a less frequent exposure path.',
        impact_rationale: 'Fictional baseline limited the expected impact to the scoped operating process.'}));
      if (risk.acceptance_date > completedAt) Object.assign(atThatTime, {status: 'assessed', treatment: 'mitigate',
        acceptance_rationale: null, acceptance_expires_at: null, accepted_by: null, acceptance_date: null});
      snapshot.risk_before = riskSnapshot(atThatTime);
      snapshot.risk_after = riskSnapshot(atThatTime);
      snapshot.risk_review_recommendation = 'Reviewed — No Change';
      snapshot.outcome = 'Reviewed — No Change';
    }
    return snapshot;
  });
  if (review.vendor_id && (review.vendor_purpose || 'vendor') === 'vendor') {
    const vendor = db.vendors.find(row => row.vendor_id === review.vendor_id && row.client_id === review.client_id);
    if (review.occurrences.length) vendor.last_review = review.occurrences.at(-1).completed_at;
  }
}

// Called only by the explicit canonical Demo refresh after its old fictional operation rows are cleared.
// This module neither discovers clients nor migrates retained sessions or authenticated records.
export function seedCisDemoOperations(db, scenario, dates) {
  if (!CANONICAL_CLIENT_IDS.includes(scenario.client_id)) throw new Error('Unsupported canonical CIS Demo fixture.');
  const cid = scenario.client_id;
  const client = db.clients.find(row => row.client_id === cid);
  if (!client) throw new Error('Create the canonical client before its operating fixtures.');
  if (db.user?.workspace_mode !== 'demo' || client.environment !== 'Demo') throw new Error('Operating fixtures are limited to the canonical Explore Demo.');
  for (const kind of ['risks', 'vendors', 'ai_systems', 'findings', 'tasks', 'evidence']) db[kind] ||= [];
  const primaryRiskId = cid + (cid === 'demo_brawndo' ? '_risk_0' : '_risk_recovery');
  if (db.risks.some(row => row.risk_id === primaryRiskId)
    || db.ai_systems.some(row => row.ai_system_id === cid + '_ai_chatgpt'))
    throw new Error('Clear only the approved fictional operating rows before seeding the refreshed scenario.');
  const {actor, owner} = people(db, cid);
  const previousReviews = new Set(db.reviews.map(row => row.review_id));
  const risks = seedRisks(db, scenario, dates, actor, owner);
  const vendors = seedVendors(db, scenario, dates, actor, owner);
  seedAI(db, scenario, dates, actor, owner, risks, vendors);
  seedRemediation(db, scenario, dates, actor, owner, risks, vendors);
  for (const review of db.reviews) if (!previousReviews.has(review.review_id)) seedOperationalReviewHistory(db, review, actor);
  return {risk_ids: risks.map(row => row.risk_id), vendor_ids: vendors.map(row => row.vendor_id)};
}
