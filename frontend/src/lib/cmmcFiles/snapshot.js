import rules from '@catalogs/cmmcWorkbook.json';
import catalog from '@catalogs/cmmc.json';
import {cmmcAssetCategories,effectiveCmmcPlan} from '../cmmcWorkspace';
import {displayDate,poamId} from './office';
import {actionStatus} from '../actionItems';
import {REVIEW_STATUS} from '../brawndoReviews';
import {policyStatus,policyStatusLabel} from '../brawndoPolicies';

const statuses = {
  addressed:'Implemented', in_progress:'Partially implemented', needs_attention:'Not implemented',
  not_assessed:'Not assessed', not_applicable:'Not applicable',
};
const verified = {verified:'Verified',needs_validation:'Needs validation',gap_identified:'Gap identified',not_verified:'Not verified'};
const planStages = {open:'Open',in_progress:'In progress',ready_for_review:'Ready for review',closed:'Closed'};
const eligibility = {candidate:'Potential candidate',blocked:'Restricted',review:'Needs review',internal:'Internal tracking'};
const definitions = new Map(catalog.requirements.map(row => [row.id,row]));
const title = file => file.display_name || file.filename || file.name || file.evidence_id;
const join = values => values.filter(Boolean).join(' · ');
const readable = value => value ? value[0].toUpperCase()+value.slice(1).replaceAll('_',' ') : '';

export function recordReferences(row) {
  const refs = [...(row.references || [])];
  for (const policy of row.policies || []) refs.push({kind:'Policy',id:policy.policy_id,title:policy.title,
    status:policyStatusLabel(policyStatus(policy)),metadata:policy.version && 'Version '+policy.version});
  for (const review of row.reviews || []) refs.push({kind:'Review',id:review.review_id,title:review.title,
    status:REVIEW_STATUS[review.status] || readable(review.status),due_date:review.due_date,metadata:review.due_date && 'Due '+displayDate(review.due_date)});
  for (const tool of row.tools || []) refs.push({kind:'Tool',id:tool.tool_id,title:tool.name});
  for (const file of row.evidence) refs.push({kind:'Evidence',id:file.evidence_id,title:title(file),
    metadata:join([file.evidence_id,file.version && 'Version '+file.version])});
  for (const action of row.actions) refs.push({kind:'Action item',id:action.task_id,title:action.title || action.task_id,
    status:readable(actionStatus(action.status)),metadata:join([action.task_id,action.due_date])});
  return [...new Map(refs.filter(ref=>ref.id && ref.title).map(ref=>[ref.kind+'\u0000'+ref.id,ref])).values()];
}

function planRow(row,model) {
  const plan = effectiveCmmcPlan(row,model.client);
  const person=id=>model.client.names?.[id] || id;
  const actions = row.actions.map(action => ({id:action.task_id,title:action.title,st:readable(actionStatus(action.status)),
    owner:action.assignee_name || person(action.assignee_id || action.owner_id),pri:action.priority,due:action.due_date}));
  const changes = model.history.filter(event=>event.section==='plans' && event.target===row.id)
    .slice().sort((a,b)=>a.revision-b.revision);
  const history = changes.filter(event=>event.before?.status!==event.after?.status &&
    (event.before?.status==='Closed' || event.after?.status==='Closed')).map(event=>({
      at:event.at,by:event.actor_name || person(event.actor),action:event.after.status==='Closed'?'Closed':'Reopened',
      status:event.after.status,note:event.after.closeout || event.after.notes,evidence:event.after.evidence,
      points:event.after.assessment?.points ?? event.after.assessment?.pointLabel,
    }));
  const lastClose=history.filter(event=>event.action==='Closed').at(-1);
  const status = planStages[plan.status] || plan.status || 'Open';
  const pending = row.weight === null || row.deductionMin !== row.deductionMax;
  const impact = row.weight === null ? 'SSP prerequisite' : pending ? row.deductionMin+'–'+row.deductionMax : row.deductionMax;
  return {id:row.id,practice:row.practice,title:row.title,points:impact,pointLabel:String(impact),
    bucket:[1,3,5].includes(impact)?String(impact):'review',status,
    owner:person(plan.owner),due:plan.due_date,
    milestone:plan.milestone,notes:plan.notes,evidence:plan.evidence,gapNotes:row.narrative,
    openedAt:plan.opened_at || changes[0]?.at,closedAt:status==='Closed'?lastClose?.at:null,
    closedBy:status==='Closed'?lastClose?.by:null,closeout:plan.closeout,
    currentGap:row.state === 'gap',eligibility:eligibility[row.eligibility],eligibilityReason:row.reason || eligibility[row.eligibility],
    assessmentStatus:statuses[row.status],source:{actions},history};
}

export function prepareOfficeSnapshot(model) {
  const plans = model.plans.map(row=>planRow(row,model));
  const ssp = model.rows.find(row=>row.id==='3.12.4');
  const items = model.rows.map(row=>({
    id:row.id,practice:row.practice,title:row.title,group:definitions.get(row.id)?.control_name || row.family,
    status:statuses[row.status],code:({addressed:'I',in_progress:'P',needs_attention:'N',not_assessed:'A',not_applicable:'X'})[row.status],
    verification:verified[row.verification],owner:model.client.names?.[row.owner] || row.owner,current:row.narrative,evidence:[],
    references:recordReferences(row),
  }));
  const assets = model.assets.map(asset=>({key:asset.asset_id,code:asset.category,
    category:cmmcAssetCategories[asset.category] || 'Needs classification',
    asset:{name:asset.name,type:asset.asset_type || asset.type,loc:asset.location,owner:asset.owner || asset.owner_id}}));
  const decisions = model.rows.filter(row=>row.status==='not_applicable' || model.decisions[row.id]).map(row=>{
    const decision = model.decisions[row.id] || {};
    return {id:row.id,title:row.title,rationale:row.rationale,decision,current:row.status==='not_applicable'
      && !!row.rationale && decision.rationale === row.rationale};
  });
  const draft = {...model.ssp,assetTreatment:Object.fromEntries(model.assets.map(asset=>[asset.asset_id,asset.treatment]))};
  const fields = model.sspFields, sections = rules.sections;
  const gaps = fields.filter(field=>!draft[field.id]?.trim()).map(field=>({section:field.section,label:field.label}));
  if (!assets.length) gaps.push({section:'inventory',label:'Reconcile the authoritative asset inventory.'});
  for (const asset of assets) {
    if (!asset.code) gaps.push({section:'inventory',label:asset.asset.name+' · scope classification'});
    if (!draft.assetTreatment[asset.key]) gaps.push({section:'inventory',label:asset.asset.name+' · treatment'});
  }
  for (const row of items.filter(item=>!item.current)) gaps.push({section:'requirements',label:row.practice+' · implementation narrative'});
  for (const row of decisions) if (!row.current || !['approved','adjudicated'].includes(row.decision.outcome)
    || !row.decision.date || !row.decision.authority || !row.decision.reference)
    gaps.push({section:'decisions',label:row.id+' · review applicability decision and supporting record'});
  const sspRefs = ssp ? recordReferences(ssp) : [];
  const policy = sspRefs.find(ref=>ref.kind==='Policy' && /system security plan|\bssp\b/i.test(ref.title));
  const review = sspRefs.find(ref=>ref.kind==='Review' && /system security plan|\bssp\b/i.test(ref.title));
  const profile=model.client.profile || {};
  return {draft,items,assets,decisions,fields,sections,gaps,organization:profile.organization?.legal_name || model.clientName,
    primary:model.client.primary_contact,lead:model.client.names?.[model.client.assigned_owner_id] || model.client.assigned_owner_id,
    profileEnv:model.profileEnv,
    narrativeCount:items.filter(row=>row.current).length,
    plan:policy && {name:policy.title,st:policy.status,ver:policy.metadata},review:review && {title:review.title,st:review.status,due:review.due_date},
    evidence:(ssp?.evidence || []).map(file=>({name:title(file)})),workbook:{rows:plans}};
}

export function workbookTables(model, plans) {
  const header = ['POA&M ID','Requirement','Description','Deduction','Status','Owner','Target','Milestone','Progress','Evidence',
    'Assessment status','Assessment notes','Eligibility','Explanation','Opened','Closed','Closed by','Closeout'];
  const values = row=>[poamId(row),row.practice,row.title,row.points,row.status,row.owner,row.due,row.milestone,row.notes,
    row.evidence,row.assessmentStatus,row.gapNotes,row.eligibility,row.eligibilityReason,displayDate(row.openedAt),displayDate(row.closedAt),row.closedBy,row.closeout];
  const followup = model.rows.filter(row=>!plans.some(plan=>plan.id===row.id) && (['unassessed','applicability'].includes(row.state)
    || row.id==='3.12.4' && !model.score.sspReady)).map(row=>['',row.practice,row.title,'Scoring pending','Assessment follow-up',
    '','','','','',statuses[row.status],row.narrative,'Needs assessment review',row.reason]);
  const changes = plans.flatMap(plan=>plan.history.map(event=>[event.at,event.by,poamId(plan),plan.practice,
    event.action || event.event,event.status,event.points,event.note,event.evidence]));
  return {rows:plans,sheets:[{name:'Summary',rows:[]},...['5','3','1','review'].map(bucket=>({
    name:bucket==='review'?'Scoring Review and SSP':bucket+'-point',
    rows:[header,...plans.filter(row=>row.bucket===bucket).map(values),...(bucket==='review'?followup:[])]})),
    {name:'Closeout History',rows:[['When','Recorded by','ID','Requirement','Activity','Status','Deduction','Note','Evidence'],...changes]}]};
}
export function scoringRows(model) {
  return model.rows.map(row=>({id:row.practice,description:definitions.get(row.id)?.source_text || row.title,
    status:row.state==='applicability'?'Not applicable (unconfirmed)':statuses[row.status],verification:verified[row.verification],
    deducted:row.deductionMax ?? 0,withheld:(row.deductionMax ?? 0)-(row.deductionMin ?? 0),
    context:row.reason || (row.weight===null?'SSP prerequisite':''),notes:row.narrative,
    evidence:row.evidence.map(file=>join([title(file),file.evidence_id])).join('\n')}));
}
