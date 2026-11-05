import {initechArtifactModel} from './cisCanonicalInitechModel';
import {initechOperatingSamples} from './cisCanonicalInitechSamples';

const CID = 'demo_initech', LIMIT = 14500;
const HEADER = ['type','record_id','context_record','scheduled_date','recorded_date','actor','state','scope','observation','result','basis'];
const SINGULAR = {framework_assessments:'framework_assessment', reviews:'review', policies:'policy',
  risks:'risk', vendors:'vendor', ai_systems:'ai_system', findings:'finding', tasks:'task'};
const csv = cells => cells.map(cell => '"'+String(cell ?? '').replaceAll('"','""')+'"').join(',')+'\n';
const bytes = text => encodeURIComponent(text).replace(/%[0-9A-F]{2}/g,'x').length;
const linkKey = link => [link.kind,link.id,link.occurrence_id || ''].join(':');
const unique = links => [...new Map(links.map(link => [linkKey(link),link])).values()];

// These are supporting source books, not a second export of every native field.
// Complete records and snapshots remain in the scenario; each saved occurrence
// and every safeguard receives an appropriate available excerpt or plan.
export function initechArtifactSpecs(anchor) {
  const {db, dates, program, operations, history} = initechArtifactModel(anchor), entries = [];
  const add = (kind, id, values, links = [], type = kind) => entries.push({kind,id,
    line:csv([type,id,...values]), links:unique(links.some(link => link.kind === kind && link.id === id && link.occurrence_id)
      ? links : [{kind,id},...links])});

  for (const sample of initechOperatingSamples(dates)) for (const row of sample.rows) {
    const ids = row.safeguards.split('|').map(id => 'fw_'+CID+'_assessment_'+id);
    if (!ids.length || ids.some(id => !program.assessments.some(record => record.framework_assessment_id === id)))
      throw new Error('An Initech operating sample has an unresolved safeguard.');
    add('framework_assessments',ids[0],[row.safeguards,'',row.observed_at,row.owner_role,row.source_classification,
      row.scope,row.entity+' / '+row.source_file+' / '+row.observed_value,
      row.result+(row.exceptions ? ' Exceptions: '+row.exceptions : ''),
      row.activity+'; '+row.cadence_or_trigger+'; '+row.basis],
    ids.map(id => ({kind:'framework_assessments',id})), 'operating_sample');
  }
  for (const mapping of program.mapping) {
    const policy = program.policies.find(row => row.policy_id === mapping.policy_id);
    const approved = policy.decision_history.filter(row => row.subject?.version === mapping.approved_version).at(-1);
    if (!approved) throw new Error('Initech document contents require their exact approved version.');
    for (const section of mapping.sections) add('policies',policy.policy_id,
      [section.ids.join('|'),'',section.state === 'pending' ? policy.submitted_at : approved.reported_approved_at,policy.owner_id,
        section.state === 'pending' ? 'pending amendment' : 'approved base contents',
        policy.title+' / '+(section.state === 'pending' ? policy.version : approved.subject.version),
        section.content,section.classification,
        'Template title is not a CIS mandate. Operating implementation remains separate from approval.'],
      section.ids.map(id => ({kind:'framework_assessments',id:'fw_'+CID+'_assessment_'+id})), 'document_contents');
    for (const decision of policy.decision_history) add('policies',policy.policy_id,
      [decision.subject.subject_id,'',decision.reported_approved_at,decision.reported_approver_id,
        decision.action,policy.title+' / '+decision.subject.version,decision.subject.summary,
        JSON.stringify(decision.subject.basis),decision.provenance], [], 'document_version');
  }
  for (const risk of operations.risks) add('risks',risk.risk_id,
    ['',risk.next_review,risk.updated_at,risk.owner_id,risk.status,risk.title,risk.description,
      risk.treatment_plan+' '+(risk.acceptance_rationale || risk.closure_note || '')+' Decisions: '+JSON.stringify(risk.decision_history),
      'Likelihood '+risk.likelihood_score+': '+risk.likelihood_rationale+' Impact '+risk.impact_score+': '+risk.impact_rationale]);
  for (const vendor of operations.vendors) add('vendors',vendor.vendor_id,
    ['',vendor.next_review,vendor.updated_at,vendor.owner_id,vendor.status,vendor.name,vendor.service,
      vendor.contract_notes+' '+(vendor.offboarding_notes || ''),
      'Risk class '+vendor.criticality+'; assurance requests are not received or verified supplier evidence.']);
  for (const ai of operations.ai_systems) add('ai_systems',ai.ai_system_id,
    [ai.vendor_id,'',ai.onboarding_screening.recorded_at,ai.owner_id,ai.approval_status,ai.name,
      ai.description+' '+ai.restrictions,JSON.stringify(ai.onboarding_screening.answers),
      'Permitted data: '+ai.permitted_data_types.join(', ')+'. '+ai.data_settings], ai.related_links);
  for (const review of history.reviews) for (const occurrence of review.occurrences) {
    const snapshot = (occurrence.requirement_snapshot || []).map(row => ({id:row.definition_id,
      version:row.framework_version,status:row.status,cadence:row.source_cadence}));
    const coverage = (occurrence.policy_coverage || []).map(row => ({policy_id:row.policy_id,
      subject_id:row.subject_id,version:row.version,approved_at:row.approved_at}));
    add('reviews',review.review_id,[occurrence.occurrence_id,occurrence.due_date,occurrence.completed_at,
      occurrence.completed_by,occurrence.outcome,occurrence.tested_scope,occurrence.conclusion,
      'Findings: '+(occurrence.finding_ids || []).join(', '),JSON.stringify({requirements:snapshot,policy_coverage:coverage})],
    [{kind:'reviews',id:review.review_id,occurrence_id:occurrence.occurrence_id},
      ...(occurrence.finding_ids || []).map(id => ({kind:'findings',id}))], 'review_occurrence');
  }
  for (const finding of history.findings) add('findings',finding.finding_id,
    [finding.primary_task_id,finding.due_date,finding.closed_at || finding.updated_at,finding.owner_id,
      finding.status,finding.title,finding.description,finding.remediation_plan,JSON.stringify(finding.decision_history)]);
  for (const task of db.tasks.filter(row => row.client_id === CID)) add('tasks',task.task_id,
    [task.finding_id || task.risk_id || task.vendor_id || '',task.due_date,task.completed_at || task.updated_at,
      task.assignee_id,task.status,task.title,task.description,task.resolution || 'Work remains open.',
      'Action completion, Finding validation and Risk closure are separate.']);

  const head = '# DEMO — SYNTHETIC DATA. Initech source excerpts and complete dated occurrence ledger.\n'
    +'# Frozen collection date: '+anchor+'. Logical source names identify excerpts contained here, not separate uploads or externally verified originals.\n'
    +'# Native records retain full questions, narratives, snapshots and approvals. A plan or requested assurance is not successful execution.\n'+csv(HEADER);
  const books = [];
  let group = [], text = head, links = [];
  const flush = () => {
    if (!group.length) return;
    const key = 'record-books-'+(books.length+1), first = group[0];
    books.push({key,evidence_id:CID+'_canonical_evidence_'+key,filename:'cis-'+key+'.csv',mime_type:'text/csv',
      linked_type:SINGULAR[first.kind],linked_id:first.id,
      occurrence_id:first.links.find(link => link.kind === first.kind && link.id === first.id && link.occurrence_id)?.occurrence_id || null,
      text,relationships:unique(links)});
    group = []; text = head; links = [];
  };
  for (const row of entries) {
    if (bytes(head+row.line) > LIMIT || row.links.length > 100)
      throw new Error('An Initech evidence row exceeds the native file/link bounds: '+row.id);
    if (bytes(text+row.line) > LIMIT || unique([...links,...row.links]).length > 100) flush();
    group.push(row); text += row.line; links.push(...row.links);
  }
  flush();
  if (books.length > 32) throw new Error('Initech evidence requires '+books.length+' files / '
    +books.reduce((sum,book) => sum+bytes(book.text),0)+' bytes; the existing limit is 32 files.');
  return books;
}
