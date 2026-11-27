import {activeDefinitions, activePlans} from '../lib/frameworks';
import {namedDemoClient} from '../lib/demoClients';
import {occurrenceId} from '../lib/reviewOccurrences';
import {eligible} from './assignmentEligibility';
import {cisDemoFixtureDates, CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {registerCisDemoArtifact} from './cisDemoArtifactRecipes';

const STATUS = {addressed: 'A', in_progress: 'P', needs_attention: 'G'};
const FREQUENCIES = {
  d: 'daily', w: 'weekly', m: 'monthly', q: 'quarterly', s: 'six-month',
  a: 'annual', t: '14.1 training', e: 'event', i: 'inactivity45d', o: 'source-defined'
};
const periodic = code => ['d', 'w', 'm', 'q', 's', 'a', 't'].includes(code);

function frequency(definition) {
  if (definition.id === '5.3') return 'i';
  const cadence = definition.source_cadence;
  if (definition.type === 'event' || /^(After |At component selection)|on media use|when network access is attempted/i.test(cadence)) return 'e';
  if (definition.type === 'training' && definition.control === 14) return 't';
  // A prohibition on importing another safeguard's interval is not a frequency.
  if (/no fixed|no numeric interval|no separate numeric/i.test(cadence)) return 'o';
  if (/daily/i.test(cadence)) return 'd';
  if (/weekly/i.test(cadence)) return 'w';
  if (/monthly/i.test(cadence)) return 'm';
  if (/quarter/i.test(cadence)) return 'q';
  if (/six months|six-month|bi-annually/i.test(cadence)) return 's';
  if (/annual/i.test(cadence)) return 'a';
  return 'o';
}

const additionalTrigger = definition => /significant(?: enterprise)?[ -]?changes?|at hire|annual\/change|intake when reports|new and renewed contracts|contract-triggered/i.test(definition.source_cadence);

function sampleDates(code, dates) {
  switch (code) {
    case 'd': return [-3, -2, -1].map(dates.day);
    case 'w': return [-15, -8, -1].map(dates.day);
    case 'm': return [-2, -1].map(dates.month).concat(dates.day(-1));
    // Four recent, different calendar quarters; no eight-year assessment backdating.
    case 'q': return [-10, -7, -4, -1].map(dates.month);
    case 's': return [dates.month(-6), dates.day(-1)];
    case 'a': case 't': return [dates.month(-2)];
    default: return [dates.day(-1)];
  }
}

function bundleText(rows, dates) {
  const codes = [...new Set(rows.map(row => row.frequency))];
  const lines = ['# DEMO - SYNTHETIC DATA', `#Collected: ${dates.day(0)}`,
    '# A=addressed,P=in_progress,G=needs_attention; samples only.'];
  for (const code of codes) lines.push(`# ${code}=${FREQUENCIES[code]}:${sampleDates(code, dates).join('|')}`);
  if (rows.some(row => row.trigger)) lines.push('# *=source change/hire/intake/contract triggers.');
  if (rows.some(row => row.id === '5.3')) lines.push(
    `# 5.3 account1:last-active=${dates.day(-60)};disabled=${dates.day(-15)};45d.`);
  if (rows.some(row => row.id === '11.5')) lines.push('# 11.5 asset1:4 partial-scope restore samples.');
  lines.push('id,state,freq');
  for (const row of rows) lines.push(`${row.id},${row.state},${row.frequency}${row.trigger ? '*' : ''}`);
  return lines.join('\n') + '\n';
}

function specialText(id, state, dates) {
  const disclaimer = `# DEMO - SYNTHETIC DATA;state=${state};date=${dates.day(-1)}.\n# Collected: ${dates.day(0)}\n`;
  if (id === '6.8') return disclaimer +
    '# Business-role sample only, not product permissions.\nrole,rights\nOperator,inventory edit\nSecurity,evidence review\nViewer,read\n';
  return disclaimer + '# Annual/change; sample only; no live detection.\nkind,threshold,response\n' +
    'event,one blocked login,log\nincident,confirmed unauthorized access,escalate\n' +
    'privacy,confirmed sensitive-data disclosure,escalate\n';
}

function utf8(text) {
  return encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Recipe schema 1 pins initial facts, not live assessments or future catalog text.
export function renderCisOperatingArtifact(recipe) {
  const keys = ['kind', 'schema_version', 'fixture_version', 'client_id', 'anchor', 'key', 'rows'];
  const validKeys = ['operating_periodic', 'operating_event', 'operating_configuration', '6_8_sample', '17_9_sample'];
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe) || Object.keys(recipe).length !== keys.length
    || keys.some(key => !Object.hasOwn(recipe, key)) || recipe.kind !== 'operating' || recipe.schema_version !== 1
    || recipe.fixture_version !== CIS_SHOWCASE_VERSION || typeof recipe.client_id !== 'string'
    || !/^demo_(brawndo|initech|krusty_krab)$/.test(recipe.client_id)
    || !validKeys.includes(recipe.key) || typeof recipe.anchor !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(recipe.anchor)
    || !Number.isFinite(Date.parse(recipe.anchor)) || new Date(recipe.anchor).toISOString() !== recipe.anchor
    || new Date(recipe.anchor).getUTCFullYear() < 1
    || !Array.isArray(recipe.rows) || !recipe.rows.length || recipe.rows.length > 153) return null;
  // Fixed v8.1 identifier bounds belong to this byte format, not an assessment rule.
  const counts = [5, 7, 14, 12, 6, 8, 7, 12, 7, 7, 5, 8, 11, 9, 7, 14, 9, 5];
  const ids = new Set();
  for (const row of recipe.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== 4
      || !['id', 'state', 'frequency', 'trigger'].every(key => Object.hasOwn(row, key))
      || typeof row.id !== 'string' || !/^[1-9]\d?\.[1-9]\d?$/.test(row.id)
      || !['A', 'P', 'G'].includes(row.state) || typeof row.frequency !== 'string' || !Object.hasOwn(FREQUENCIES, row.frequency)
      || typeof row.trigger !== 'boolean' || ids.has(row.id)) return null;
    const [control, safeguard] = row.id.split('.').map(Number);
    if (control > counts.length || safeguard > counts[control - 1]) return null;
    if (recipe.key === 'operating_periodic' && !periodic(row.frequency)
      || recipe.key === 'operating_event' && row.frequency !== 'e'
      || recipe.key === 'operating_configuration' && !['i', 'o'].includes(row.frequency)) return null;
    ids.add(row.id);
  }
  const special = recipe.key === '6_8_sample' ? '6.8' : recipe.key === '17_9_sample' ? '17.9' : null;
  if (special && (recipe.rows.length !== 1 || recipe.rows[0].id !== special)) return null;
  const dates = cisDemoFixtureDates(new Date(recipe.anchor));
  const bytes = utf8(special ? specialText(special, recipe.rows[0].state, dates) : bundleText(recipe.rows, dates));
  return {content_base64: btoa(bytes), size: bytes.length};
}

function reviewsFor(db, cid, definitions, plans) {
  const ids = new Set(definitions.map(row => row.id));
  return (db.reviews || []).filter(review => review.client_id === cid && !review.archived_at
    && review.status !== 'cancelled' && (
      review.framework_key === 'cis-ig1' && (review.framework_safeguards?.some(id => ids.has(id))
        || plans.some(plan => plan.key === review.framework_plan_key && plan.safeguards.some(id => ids.has(id))))
      || review.framework_drivers?.some(driver => driver.framework_key === 'cis-ig1'
        && driver.framework_driver_active !== false && driver.framework_safeguards?.some(id => ids.has(id)))
    ));
}

// Deterministic fixture construction only; never executes tools, creates Reviews,
// completes an occurrence, changes assessment answers/status, or grants permissions.
export function seedCisOperatingEvidence(db, scenario, dates) {
  const cid = scenario.client_id, named = namedDemoClient(cid);
  const client = db.clients?.find(row => row.client_id === cid);
  if (db.user?.workspace_mode !== 'demo' || !named?.group || named.group !== scenario.implementation_group
    || client?.environment !== 'Demo' || client.status !== 'active' || client.archived || client.archived_at
    || client.framework_settings?.['cis-ig1']?.implementation_group !== named.group) return [];
  const actor = db.users?.find(user => user.user_id === db.user.user_id && eligible(user, cid));
  if (!actor || !['super_admin', 'platform_admin'].includes(actor.role)) {
    throw new Error('CIS Demo operating samples require an existing eligible internal actor.');
  }
  const definitions = activeDefinitions('cis-ig1', {implementation_group: named.group});
  const plans = activePlans('cis-ig1', {implementation_group: named.group});
  const assessed = definitions.flatMap(definition => {
    const matches = (db.framework_assessments || []).filter(row => row.client_id === cid
      && row.framework_key === 'cis-ig1' && row.definition_id === definition.id);
    if (matches.length > 1) throw new Error('Ambiguous CIS Demo assessment identity.');
    const assessment = matches[0];
    return assessment?.framework_version === '8.1' && STATUS[assessment.status] ? [{definition, assessment}] : [];
  });
  // Focused trackers are optional, but their underlying operating duties are not.
  const focused = new Set(plans.filter(plan => plan.cadence_class === 'B').flatMap(plan => plan.safeguards));
  const operating = assessed.filter(row => row.definition.type !== 'recurring' || focused.has(row.definition.id));
  const specifications = [
    ...['periodic', 'event', 'configuration'].map(key => ({key: `operating_${key}`, title: `Fictional operating samples — ${key}`,
      rows: operating.filter(row => {
        const code = frequency(row.definition);
        return key === 'periodic' ? periodic(code) : key === 'event' ? code === 'e' : ['i', 'o'].includes(code);
      })})),
    ...['6.8', '17.9'].map(id => ({key: `${id.replace('.', '_')}_sample`,
      title: id === '6.8' ? 'Fictional business-role rights matrix' : 'Fictional security incident thresholds',
      rows: assessed.filter(row => row.definition.id === id), special: id}))
  ].filter(specification => specification.rows.length);
  const prepared = specifications.map(specification => {
    const {rows} = specification, recipe = {kind: 'operating', schema_version: 1, fixture_version: CIS_SHOWCASE_VERSION,
      client_id: cid, anchor: dates.anchor, key: specification.key,
      rows: rows.map(({definition, assessment}) => ({id: definition.id, state: STATUS[assessment.status],
        frequency: frequency(definition), trigger: additionalTrigger(definition)}))};
    const bytes = renderCisOperatingArtifact(recipe);
    if (!bytes) throw new Error('Invalid CIS Demo operating artifact recipe.');
    const relatedReviews = reviewsFor(db, cid, rows.map(row => row.definition), plans);
    const evidence = {evidence_id: `${cid}_showcase_evidence_${specification.key}`, client_id: cid,
      filename: `cis-${specification.key}.csv`, display_name: `${scenario.name} — ${specification.title}`,
      mime_type: 'text/csv', evidence_type: 'Report', ...bytes,
      linked_type: 'framework_assessment', linked_id: rows[0].assessment.framework_assessment_id,
      relationships: [...rows.map(row => ({kind: 'framework_assessments', id: row.assessment.framework_assessment_id})),
        ...relatedReviews.map(review => ({kind: 'reviews', id: review.review_id, occurrence_id: occurrenceId(review)}))],
      uploaded_by: actor.user_id, uploaded_by_email: actor.email, uploaded_at: dates.anchor,
      created_at: dates.anchor, evidence_date: dates.day(0), version: 1, fixture_version: CIS_SHOWCASE_VERSION,
      notes: 'Fictional, limited samples only; no real automated activity or complete-period assurance. A/P/G retain the native assessment status; P/G mean incomplete coverage. Frequency and requirement meanings remain in the linked native CIS safeguards. File-local account1/asset1 examples are not additional application records. Existing Demo storage/lifetime limits apply.'};
    return {evidence, rows, recipe};
  });
  // Validate collisions before attaching anything; never replace retained bytes.
  for (const {evidence} of prepared) {
    const existing = (db.evidence || []).filter(row => row.evidence_id === evidence.evidence_id);
    if (existing.length > 1 || existing.some(row => row.client_id !== cid || row.fixture_version !== CIS_SHOWCASE_VERSION
      || row.linked_type !== evidence.linked_type || row.linked_id !== evidence.linked_id)) {
      throw new Error('CIS Demo operating Evidence identity collision.');
    }
  }
  db.evidence ||= [];
  for (const {evidence, rows, recipe} of prepared) {
    if (!db.evidence.some(row => row.evidence_id === evidence.evidence_id)) {
      db.evidence.push(evidence);
      registerCisDemoArtifact(db, evidence, recipe);
    }
    for (const {assessment} of rows) {
      assessment.related_links ||= [];
      if (!assessment.related_links.some(link => link.kind === 'evidence' && link.id === evidence.evidence_id)) {
        assessment.related_links.push({kind: 'evidence', id: evidence.evidence_id});
      }
    }
  }
  return prepared.map(({evidence}) => db.evidence.find(row => row.evidence_id === evidence.evidence_id));
}
