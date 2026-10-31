import {activeDefinitions, frameworkCatalog} from './frameworks';
import {hierarchyPath} from './frameworkWorkspace';
import {operatorStatuses} from './frameworkOperator';
import {applicableCounts, validImplementationPosition} from './portfolioProgress';

const STATUS_KEYS = ['addressed', 'in_progress', 'needs_attention', 'not_assessed'];
const emptyCounts = () => Object.fromEntries(STATUS_KEYS.map(key => [key, 0]));
const sameIds = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && new Set(actual).size === actual.length && expected.every(id => actual.includes(id));

function focusSummary(domain, labels) {
  if (!domain.applicable) return {tone:'neutral', title:'No applicable subjects',
    detail:domain.undeterminedIds.length ? 'SoA applicability is not yet determined. No implementation credit is inferred.' : 'This domain has no applicable assessment scope.'};
  const work = [];
  if (domain.counts.needs_attention) work.push(`${domain.counts.needs_attention} ${labels.needs_attention.toLowerCase()}`);
  if (domain.counts.in_progress) work.push(`${domain.counts.in_progress} ${labels.in_progress.toLowerCase()}`);
  if (domain.counts.not_assessed) work.push(`${domain.counts.not_assessed} not assessed; their implementation is unknown, not an assessed failure`);
  return {tone:work.length ? 'warning' : 'success', title:work.length ? 'Recorded work to review' : `All applicable subjects ${labels.addressed.toLowerCase()}`,
    detail:work.length ? work.join('; ')+'.' : 'This describes the recorded implementation or readiness conclusion, not certification or an auditor opinion.'};
}

// Reuse native catalog hierarchy, with exact subject membership; no cross-framework taxonomy.
export function buildFrameworkDomainProfile(source, {clientId, frameworkKey} = {}) {
  const presentation = {frameworkKey, labels:operatorStatuses(frameworkKey),
    unit:frameworkKey === 'soc-2' ? 'criteria' : 'requirements and controls', verb:frameworkKey === 'soc-2' ? 'addressed' : 'implemented'};
  const unavailable = reason => ({available:false, reason, domains:[], totals:null, ...presentation});
  const catalog = frameworkCatalog(frameworkKey);
  if (!['iso-27001', 'soc-2'].includes(frameworkKey) || !catalog || source?.selected !== true
    || source.framework?.key !== frameworkKey || source.framework.version !== catalog.version
    || !Array.isArray(source.definitions) || !Array.isArray(source.assessments)
    || [...source.definitions,...source.assessments].some(row=>!row||typeof row!=='object'||Array.isArray(row))) {
    return unavailable('The native client, framework or subject scope is unavailable. Reopen the program to refresh its records.');
  }
  const position = source.implementation_position;
  if (!validImplementationPosition(position) || position.invalid_applicability_count > 0) return unavailable(position?.reason || 'Native implementation records or statuses are unavailable or invalid.');
  const scope = position.scope;
  if (frameworkKey === 'soc-2') {
    const categories = source.configuration?.categories;
    if (!Array.isArray(categories) || !categories.includes('security') || new Set(categories).size !== categories.length
      || categories.some(category => typeof category!=='string'||!Object.hasOwn(catalog.categories,category))
      || !sameIds(scope?.configuration?.categories, categories)) return unavailable('The saved SOC 2 category scope is unavailable or inconsistent.');
  }
  const definitions = activeDefinitions(frameworkKey, source.configuration), ids = definitions.map(row => row.id);
  if (scope?.framework_key !== frameworkKey || scope.catalog_version !== catalog.version
    || !sameIds(scope.definition_ids, ids) || !sameIds(source.active_definition_ids, ids)
    || position.program_id !== `${clientId}:${frameworkKey}`) return unavailable('The saved implementation position belongs to another native subject scope.');
  const savedDefinitions = new Map(source.definitions.map(row => [row.id, row]));
  if (source.definitions.length !== savedDefinitions.size || definitions.some(row => {
    const saved = savedDefinitions.get(row.id);
    return !saved || ['control', 'control_name', 'category', 'specification'].some(key => saved[key] !== row[key]);
  })) return unavailable('Native domain mappings are missing or inconsistent for some subjects.');
  if (source.assessments.some(row => !row || row.client_id !== clientId || row.framework_key !== frameworkKey
    || row.framework_version !== catalog.version)) return unavailable('Assessment identities do not belong to this client and framework.');
  const records = new Map();
  for (const row of source.assessments.filter(row => ids.includes(row.definition_id) && !row.archived && !row.archived_at)) {
    if (records.has(row.definition_id) || typeof row.framework_assessment_id!=='string' || !row.framework_assessment_id.trim()) return unavailable('Native assessment identities are duplicated or unavailable.');
    records.set(row.definition_id, row);
  }
  if (records.size !== ids.length || new Set([...records.values()].map(row => row.framework_assessment_id)).size !== ids.length)
    return unavailable('Some expected native assessment records are unavailable.');

  const totals = {counts:emptyCounts(), implemented:0, applicable:0, excludedIds:[], undeterminedIds:[], subjectIds:ids};
  const groups = new Map();
  for (const definition of definitions) {
    const path = hierarchyPath(frameworkKey, definition), leaf = path.at(-1), id = path.map(part => part.id).join('/');
    // Dashboard names omit ISO clause prefixes; native hierarchy labels and subject identities stay intact.
    if (!groups.has(id)) groups.set(id, {id, name:frameworkKey === 'soc-2' ? definition.control_name : leaf.label.replace(/^\d+\s+[—-]\s+/, ''), counts:emptyCounts(), applicable:0, implemented:0,
      subjectIds:[], applicableIds:[], excludedIds:[], undeterminedIds:[], assessmentIds:[]});
    const domain = groups.get(id), row = records.get(definition.id), decision = scope.applicability?.[definition.id];
    domain.subjectIds.push(definition.id);domain.assessmentIds.push(row.framework_assessment_id);
    const annex = frameworkKey === 'iso-27001' && definition.specification === 'annex_control';
    const expected = annex ? row.soa_applicability || 'undetermined' : row.status === 'not_applicable' ? 'excluded' : 'included';
    if (decision !== expected) return unavailable('Native applicability records do not match the saved implementation scope.');
    if (decision === 'excluded') {
      if (!(annex ? row.soa_justification : row.na_rationale)?.trim()) return unavailable('An exclusion has no native rationale.');
      totals.excludedIds.push(definition.id);domain.excludedIds.push(definition.id);
    } else if (annex && decision === 'undetermined') {
      totals.undeterminedIds.push(definition.id);domain.undeterminedIds.push(definition.id);
    } else {
      if (decision !== 'included' || !STATUS_KEYS.includes(row.status) || annex && !row.soa_justification?.trim())
        return unavailable('An active subject has an invalid native status or applicability decision.');
      totals.counts[row.status]++;domain.counts[row.status]++;domain.applicableIds.push(definition.id);
      totals.applicable++;domain.applicable++;
      if (row.status === 'addressed') {totals.implemented++;domain.implemented++;}
    }
  }
  const canonical = Object.fromEntries(applicableCounts(position).map(value => [value.key, value.count]));
  if (position.total !== ids.length || position.denominator !== totals.applicable || position.implemented !== totals.implemented
    || position.excluded !== totals.excludedIds.length || (position.scope_undetermined || 0) !== totals.undeterminedIds.length
    || STATUS_KEYS.some(key => canonical[key] !== totals.counts[key])) return unavailable('Subject records do not reconcile with the native implementation position.');
  const soc = frameworkKey === 'soc-2';
  const labels = operatorStatuses(frameworkKey);
  return {available:true, reason:'', frameworkKey, domains:[...groups.values()].map(domain => ({...domain,
    rate:domain.applicable ? domain.implemented / domain.applicable * 100 : null, focusSummary:focusSummary(domain, labels)})), totals,
    labels:operatorStatuses(frameworkKey), unit:soc ? 'criteria' : 'requirements and controls', verb:soc ? 'addressed' : 'implemented',
    mapping:{catalogVersion:catalog.version, source:'native framework catalog and frameworkWorkspace.hierarchyPath', overlapping:false},
    programId:position.program_id, scopeSignature:position.scope_signature, sourceRevision:position.source_revision};
}
