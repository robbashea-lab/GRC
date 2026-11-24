import catalog from '@catalogs/cmmc.json';
import rules from '@catalogs/cmmcWorkbook.json';
import {cmmcRequirementPresentation} from './cmmcScope';
import {policySupportsAssessment} from './frameworkPolicyLinks';
import {serviceCatalog,toolList} from './r4ServicesTools';
import {templateId} from './r4ReviewCompletion';
import {CATALOGS} from './frameworks';
import {reviewMapsTo} from './frameworkReviewLinks';
import {findingScopes,findingAppliesTo,actionAppliesTo} from './frameworkWorkLinks';
import {belongsToOccurrence,occurrenceId} from './reviewOccurrences';
import reviewTemplates from '@catalogs/r4ReviewTemplates.json';

export const cmmcSections = rules.sections;
export const cmmcAssetCategories = {
  '': 'Needs classification', cui: 'CUI asset', sp: 'Security protection asset',
  crma: 'Contractor risk managed asset', specialized: 'Specialized asset', out: 'Out-of-scope asset',
};
export const cmmcPartialChoices = rules.partial;
const five = new Set(rules.five), three = new Set(rules.three);
const notesRequired = 'Confirm the implementation condition';
const sspId = '3.12.4';

export function assessCmmcRow(row, level, exception) {
  const status = row.status;
  const state = {addressed:'implemented', in_progress:'gap', needs_attention:'gap',
    not_applicable:row.na_rationale?.trim() ? 'excluded' : 'applicability'}[status] || 'unassessed';
  const weight = level === 1 || row.definition_id === sspId ? null
    : five.has(row.definition_id) ? 5 : three.has(row.definition_id) ? 3 : 1;
  const special = rules.partial[row.definition_id];
  const partial = special && special === exception;
  const unresolved = special && !partial && exception !== 'not-implemented';
  let minimum = 0, maximum = 0, eligibility = 'not-needed', reason = '';
  if (state === 'unassessed' || state === 'applicability') {
    maximum = weight || 0;
    eligibility = level === 1 ? 'internal' : 'review';
    reason = state === 'applicability' ? 'Confirm the scope rationale' : 'Complete assessment';
  } else if (state === 'gap') {
    maximum = partial ? 3 : weight || 0;
    minimum = unresolved ? 3 : maximum;
    if (unresolved) reason = notesRequired;
    if (level === 1) eligibility = 'internal';
    else if (rules.prohibited.includes(row.definition_id)) eligibility = 'blocked';
    else if (row.definition_id === '3.13.11' && (partial || unresolved)) eligibility = partial ? 'candidate' : 'review';
    else eligibility = weight > 1 ? 'blocked' : 'candidate';
  }
  return {state,weight,eligibility,reason,deduction:weight === null ? null : maximum,
    deductionMin:level === 1 ? null : minimum,deductionMax:level === 1 ? null : maximum};
}

export function effectiveCmmcPlan(row,client) {
  const saved=row.plan || {};
  const action=row.actions?.length===1 ? row.actions[0] : null;
  const owner=action ? action.assignee_name || action.assignee_id || action.owner_id : row.owner;
  return {owner:client.names?.[owner] || owner || '',due_date:action?.due_date?.slice(0,10) || '',
    milestone:action?.title || '',...saved};
}

function forClient(rows, clientId) {
  return (rows || []).filter(row => row.client_id === clientId);
}

export function buildCmmcWorkspace(data, records, client) {
  const clientId = client?.client_id, level = data?.configuration?.level;
  if (!clientId || records?.client_id !== clientId || ![1,2].includes(level) || records.level !== level)
    throw new Error('Reload this client’s current CMMC scope.');
  const assessments = forClient(data.assessments, clientId).filter(row => row.framework_key === 'cmmc');
  const byId = new Map(assessments.map(row => [row.definition_id, row]));
  if (byId.size !== assessments.length) throw new Error('Resolve duplicate CMMC assessments before generating the workbook.');
  const definitions = catalog.requirements.filter(def => level === 2 || def.level_one_parent);
  const actions = forClient(records.tasks,clientId), findings = forClient(records.findings,clientId);
  const scopes = findingScopes([...assessments,...forClient(records.findingScopes,clientId)]);
  const reviews = forClient(records.reviews,clientId), evidenceRows = forClient(records.files,clientId);
  const services = client.profile?.services || {};
  const tools = new Map(serviceCatalog.tools.map(tool => [tool.tool_id,tool]));
  for (const tool of records.toolCatalog || []) tools.set(tool.tool_id,tool);
  const allTools = toolList([...tools.values()],services);
  const rows = definitions.map(def => {
    const item = byId.get(def.id);
    if (!item?.framework_assessment_id || item.framework_version !== catalog.version)
      throw new Error('Finish CMMC initialization before generating the workbook.');
    const aid = item.framework_assessment_id;
    const ids = kind => new Set((item.related_links || []).filter(link => link.kind === kind).map(link => link.id));
    const reviewIds = ids('reviews');
    reviews.filter(rev => rev.framework_assessment_id === aid || reviewMapsTo(rev,'cmmc',def.id))
      .forEach(rev => reviewIds.add(rev.review_id));
    const findingIds = ids('findings');
    (item.items_to_address || []).forEach(entry => {if (entry.finding_id) findingIds.add(entry.finding_id);});
    findings.filter(f => findingAppliesTo(aid,f,reviewIds,scopes)).forEach(f => findingIds.add(f.finding_id));
    const taskIds = ids('tasks');
    const linkedActions = actions.filter(task => taskIds.has(task.task_id) || actionAppliesTo(aid,task,reviewIds,findingIds));
    const linkedReviews = reviews.filter(review => reviewIds.has(review.review_id));
    const linkedPolicies = forClient(records.policies,clientId).filter(policy => policySupportsAssessment(item,policy));
    const areas = new Set(linkedReviews.flatMap(review => {
      // Only declared mappings supply tools. An unmapped legacy Review remains a valid reference.
      const template=templateId(review,CATALOGS,{required:false});
      return reviewTemplates.topics.find(topic=>topic.id===template)?.areas || [];
    }));
    const toolIds = new Set([...areas].flatMap(area => services.areas?.[area]?.tool_ids || []));
    const linkedTools = allTools.filter(tool => toolIds.has(tool.tool_id));
    const relatedTasks = new Set(linkedActions.map(task => task.task_id));
    const currentReviewFile=(reference,review)=>review && belongsToOccurrence(reference,review,occurrenceId(review));
    const linkedTo = (kind,id,reference) => ['framework_assessment','framework_assessments'].includes(kind) && id === aid
      || ['review','reviews'].includes(kind) && currentReviewFile(reference,linkedReviews.find(review=>review.review_id===id))
      || ['finding','findings'].includes(kind) && findingIds.has(id)
      || ['task','tasks'].includes(kind) && relatedTasks.has(id);
    const fileIds = ids('evidence'), unlinked = new Set(item.unlinked_evidence_ids || []);
    const evidence = evidenceRows.filter(file => !file.archived_at && !unlinked.has(file.evidence_id) && (fileIds.has(file.evidence_id)
      || linkedTo(file.linked_type,file.linked_id,file)
      || file.relationships?.some(link => linkedTo(link.kind,link.id,link))));
    const condition = records.exceptions?.[def.id];
    const exception = condition?.assessed_version === (item.last_saved || item.last_assessed || item.updated_at || '') ? condition.value : '';
    const presentation = cmmcRequirementPresentation(def,{level});
    const savedPlan = records.plans?.[def.id];
    const gapHistory = (item.assessment_history || []).filter(event=>['in_progress','needs_attention'].includes(event.status));
    const current = assessCmmcRow(item,level,exception);
    const previous = gapHistory.at(-1);
    const historical = previous && {...assessCmmcRow({...previous,definition_id:def.id},level,''),narrative:previous.implementation || '',status:previous.status};
    const impact = (current.state !== 'gap' || savedPlan?.status === 'Closed') ? savedPlan?.assessment || historical : null;
    return {id:def.id,assessmentId:aid,practice:presentation.practice,title:presentation.title,family:def.family,
      status:item.status,verification:item.verification || 'not_verified',narrative:item.implementation || '',owner:item.owner_id || '',
      rationale:item.na_rationale || '',assessedVersion:item.last_saved || item.last_assessed || item.updated_at || '',evidence,actions:linkedActions,exception,
      reviews:linkedReviews,policies:linkedPolicies,tools:linkedTools,decision:records.decisions?.[def.id] || null,
      ...current,impact,hasGapHistory:!!gapHistory.length,plan:savedPlan || null};
  });
  const plans = rows.filter(row => row.state === 'gap' || row.plan || row.hasGapHistory)
    .map(row=>row.impact ? {...row,eligibility:row.impact.eligibility,deductionMin:row.impact.deductionMin,deductionMax:row.impact.deductionMax,
      deduction:row.impact.deductionMax,narrative:row.impact.narrative || row.narrative} : row)
    .sort((left,right) => Number(right.weight === null) - Number(left.weight === null) || (right.deduction || 0) - (left.deduction || 0));
  const known = rows.reduce((sum,row) => sum + (row.deductionMin || 0),0);
  const total = rows.reduce((sum,row) => sum + (row.deductionMax || 0),0);
  const assessed = rows.filter(row => ['implemented','excluded','gap'].includes(row.state)).length;
  const ssp = rows.find(row => row.id === sspId);
  const sspReady = level === 2 && ssp?.state === 'implemented' && ssp.verification === 'verified';
  const unverified = rows.filter(row => row.state === 'implemented' && row.verification !== 'verified').length;
  const available = level === 2 && assessed > 0;
  const score = {available,value:available ? 110-total : null,minimum:available ? 110-total : null,
    maximum:available ? 110-known : null,assessed,total:rows.length,withheld:level === 2 ? total-known : null,
    knownDeduction:level === 2 ? known : null,sspReady,unverified};
  const blockers = rows.filter(row => row.eligibility === 'blocked').map(row => row.id);
  if (level === 2 && !sspReady && !blockers.includes(sspId)) blockers.unshift(sspId);
  const date = records.conditional?.date;
  let closeoutDate = null;
  if (date) {
    const cutoff = new Date(date+'T00:00:00Z');
    cutoff.setUTCDate(cutoff.getUTCDate()+180);
    closeoutDate = cutoff.toISOString().slice(0,10);
  }
  const conditional = {threshold:level === 2 ? 88 : null,blockers,closeoutDate,statusDate:date || '',
    state:level === 1 ? 'not-applicable' : blockers.length || (available && score.maximum < 88) ? 'blocked'
      : !available || rows.some(row => row.reason) || unverified ? 'assessment-required' : plans.some(row=>row.state === 'gap') ? 'potential-candidates' : 'no-gaps'};
  const assets = forClient(records.inventory,clientId).map(asset => ({...asset,...records.assets?.[asset.asset_id]}));
  const profileEnv=[client.profile?.technical?.infrastructure,client.profile?.technical?.operating_environment,
    client.profile?.organization?.workforce].flat().filter(value=>typeof value==='string' && value.trim());
  return {clientId,clientName:client.name,client,profileEnv,level,ssp:records.ssp || {},sspFields:rules.sspFields,
    assets,decisions:records.decisions || {},posting:records.posting || {},rows,plans,score,conditional,
    history:records.history || [], revision:records.revision || 0};
}
