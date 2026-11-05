import {brawndoArtifactModel, CIS_CANONICAL_REVISION} from './cisCanonicalBrawndoModel';
import {brawndoSafeguardContent} from './cisCanonicalBrawndoContent';
import {CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {brawndoOperatingSamples} from './cisCanonicalBrawndoSamples';

const CID = 'demo_brawndo';
const LIMIT = 14500; // Leave room below the unchanged 16KiB durable file limit.
const HEADER = ['type','record_id','related_record','scheduled_date','recorded_date','actor','state','scope','observation','result','basis'];
const singular = {framework_assessments:'framework_assessment', reviews:'review', policies:'policy',
  risks:'risk', vendors:'vendor', ai_systems:'ai_system', findings:'finding', tasks:'task'};
const csv = values => values.map(value => '"'+String(value ?? '').replaceAll('"','""')+'"').join(',')+'\n';
const byteLength = text => encodeURIComponent(text).replace(/%[0-9A-F]{2}/g,'x').length;
const keyOf = link => [link.kind,link.id,link.occurrence_id || ''].join(':');
const uniqueLinks = links => [...new Map(links.map(link => [keyOf(link),link])).values()];
const entry = (kind,id,values,links=[]) => ({kind,id,line:csv([kind,id,...values]),
  links:uniqueLinks(links.some(link => link.kind===kind&&link.id===id&&link.occurrence_id)
    ? links : [{kind,id},...links])});

function pack(family, entries, anchor) {
  const preface = '# DEMO — SYNTHETIC DATA. Fictional Brawndo records, not external assurance.\n'
    +'# Frozen collection date: '+anchor+'. Earlier dated observations are retained; no future execution is asserted.\n'
    +'# '+family+'. Procedure excerpts and scoped samples do not claim to be complete externally verified documents.\n';
  const head = preface+csv(HEADER), books=[];
  let group=[], text=head, links=[];
  function flush() {
    if (!group.length) return;
    const key = family+'-'+(books.length+1), first=group[0];
    books.push({key, evidence_id:CID+'_canonical_evidence_'+key, filename:'cis-'+key+'.csv',
      mime_type:'text/csv', linked_type:singular[first.kind], linked_id:first.id, text,
      occurrence_id:first.links.find(link => link.kind===first.kind&&link.id===first.id&&link.occurrence_id)?.occurrence_id || null,
      relationships:uniqueLinks(links)});
    group=[]; text=head; links=[];
  }
  for (const row of entries) {
    if (byteLength(head+row.line)>LIMIT || row.links.length>100) throw new Error('A Brawndo evidence row exceeds the existing file contract.');
    if (byteLength(text+row.line)>LIMIT || uniqueLinks([...links,...row.links]).length>100) flush();
    group.push(row); text+=row.line; links.push(...row.links);
  }
  flush();
  return books;
}

// Build from the same frozen source model as the canonical scenario, never from
// editable current browser records. No cache, storage, clock override or download
// authorization is introduced here; the existing native provider owns those.
export function brawndoArtifactSpecs(anchor) {
  const {dates, program, operations, history} = brawndoArtifactModel(anchor);
  const families=[];
  families.push(['safeguards',program.assessments.map(row => {
    const content=brawndoSafeguardContent(row.definition_id,row.status);
    return entry('framework_assessments',row.framework_assessment_id,['', '', row.last_saved || '', row.owner_id,
      row.status,content.scope,content.current_implementation+' '+content.technology_process,
      content.assessment_notes || content.assessment_plan,
      content.evidence_check+' '+(content.remediation || '')],row.related_links);
  })]);
  families.push(['document-excerpts',program.policies.map(row => entry('policies',row.policy_id,
    ['', '', row.approved_at || row.submitted_at || row.updated_at, row.owner_id, row.status,
      row.title+' / '+(row.version || 'Required process missing'),row.summary,
      JSON.stringify(row.decision_history),row.status==='needs_creation'
        ?'No complete vulnerability-management document exists. This is a gap record, not an uploaded approved process.'
        :'Fictional process excerpt and version-decision ledger. Original approval and subsequent maintenance are distinct.'],
    program.mapping.filter(item => item.policy_id===row.policy_id).map(item => ({kind:'reviews',id:item.review_id}))))]);
  families.push(['risk-register',operations.risks.map(row => entry('risks',row.risk_id,
    ['', '', row.updated_at, row.owner_id, row.status,row.title,row.description,
      row.treatment_plan+' '+(row.closure_note || row.acceptance_rationale || ''),
      'Likelihood '+row.likelihood_score+': '+row.likelihood_rationale+' Impact '+row.impact_score+': '+row.impact_rationale],row.related_links))]);
  families.push(['vendor-register',operations.vendors.map(row => entry('vendors',row.vendor_id,
    ['', '', row.updated_at,row.business_owner_id,row.status,row.name,row.service,
      row.criticality+'; data: '+row.data_types.join(', ')+'; '+(row.offboarding_notes || 'Annual relationship review; contracts and requested assurance remain separate.'),
      'No independent certification is claimed. Requested assurance is not represented as received or reviewed.']))]);
  families.push(['ai-screening',operations.ai_systems.map(row => entry('ai_systems',row.ai_system_id,
    [row.vendor_id, '', row.onboarding_screening.recorded_at,row.owner_id,row.approval_status,row.name,
      row.description+' '+row.restrictions,JSON.stringify(row.onboarding_screening.answers),
      row.data_settings+' Permitted data: '+row.permitted_data_types.join(', ')],row.related_links))]);
  families.push(['review-executions',history.reviews.flatMap(review => review.occurrences.map(row =>
    entry('reviews',review.review_id,[row.occurrence_id,row.due_date,row.completed_at,row.completed_by,
      row.outcome,row.tested_scope,row.conclusion,
      JSON.stringify(row.requirement_snapshot || row.source_snapshot || {}),
      'Native '+review.recurrence+' cycle; original due date and historical outcome retained.'],
    [{kind:'reviews',id:review.review_id,occurrence_id:row.occurrence_id},
      ...(row.finding_ids || []).map(id => ({kind:'findings',id}))])))]);
  families.push(['remediation',[
    ...history.findings.map(row => entry('findings',row.finding_id,[row.primary_task_id,row.due_date,
      row.closed_at || row.updated_at,row.owner_id,row.status,row.title,row.description,row.remediation_plan,
      JSON.stringify(row.decision_history)],row.related_links)),
    ...history.tasks.map(row => entry('tasks',row.task_id,[row.finding_id || row.risk_id || row.vendor_id || '',row.due_date,
      row.completed_at || row.updated_at,row.assignee_id,row.status,row.title,row.description,
      row.resolution || 'Owned work remains open; no closure or validation is asserted.',
      'Completing this Action does not itself close a Finding or Risk.'],row.related_links))
  ]]);
  const books=families.flatMap(([family,rows]) => pack(family,rows,anchor));
  for(const sample of brawndoOperatingSamples(dates)){
    const columns=[...new Set(sample.rows.flatMap(row=>Object.keys(row)))];
    const text='# '+sample.title+'\n# Collection anchor: '+anchor+'; observed dates are retained in each row.\n'
      +csv(columns)+sample.rows.map(row=>csv(columns.map(key=>row[key]))).join('');
    if(byteLength(text)>16384)throw new Error('Brawndo operating sample exceeds the existing 16KiB limit.');
    const key='operating-'+sample.key;
    books.push({key,evidence_id:CID+'_canonical_evidence_'+key,filename:'cis-'+key+'.csv',mime_type:'text/csv',
      linked_type:'framework_assessment',linked_id:sample.assessment_ids[0],occurrence_id:null,text,
      relationships:[...sample.assessment_ids.map(id=>({kind:'framework_assessments',id})),
        ...sample.policy_keys.map(policyKey=>({kind:'policies',id:CID+'_'+policyKey}))]});
  }
  if (books.length>32) throw new Error('Brawndo immutable evidence exceeds the existing 32-file contract.');
  return books;
}

export function brawndoArtifactDefinition(recipe) {
  if (recipe?.client_id!==CID || recipe.fixture_version!==CIS_SHOWCASE_VERSION
    || recipe.scenario_revision!==CIS_CANONICAL_REVISION
    || typeof recipe.key!=='string' || !/^(?:(safeguards|document-excerpts|risk-register|vendor-register|ai-screening|review-executions|remediation)-[1-9]\d?|operating-(inventory|software|identity|endpoint|recovery|workforce|governance))$/.test(recipe.key)) return null;
  const book=brawndoArtifactSpecs(recipe.anchor).find(row => row.key===recipe.key);
  if (!book) return null;
  return Object.fromEntries(['evidence_id','filename','mime_type','linked_type','linked_id','occurrence_id','text'].map(key => [key,book[key]]));
}
