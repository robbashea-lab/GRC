import {krustyArtifactModel} from './cisCanonicalKrustyModel';
import {krustyOperatingSamples} from './cisCanonicalKrustySamples';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';

const CID = 'demo_krusty_krab';
const LEGACY_FORMAT_MAX_BOOKS = 32, FINAL_MAX_BOOKS = 40;
const HEADER = ['type','record_id','context_record','scheduled_date','recorded_date','actor','state','scope','observation','result','basis'];
const IDS = {framework_assessments:'framework_assessment_id', reviews:'review_id', policies:'policy_id',
  risks:'risk_id', vendors:'vendor_id', ai_systems:'ai_system_id', findings:'finding_id', tasks:'task_id'};
const SINGULAR = {framework_assessments:'framework_assessment', reviews:'review', policies:'policy',
  risks:'risk', vendors:'vendor', ai_systems:'ai_system', findings:'finding', tasks:'task'};
const csv = cells => cells.map(cell => '"'+String(cell ?? '').replaceAll('"','""')+'"').join(',')+'\n';
const compactCsv = cells => cells.map(cell => {
  const value = String(cell ?? '');
  return /[,"\r\n]/.test(value) ? '"'+value.replaceAll('"','""')+'"' : value;
}).join(',')+'\n';
const PERIOD_COLUMNS = {
  requirements:['definition_id','framework_version','status','owner_id','process_owner_id'],
  policy_coverage:['policy_id','subject_id','version','approval_recorded_at','reported_approved_at']
};
const bytes = text => encodeURIComponent(text).replace(/%[0-9A-F]{2}/g,'x').length;
const linkKey = link => [link.kind,link.id,link.occurrence_id || ''].join(':');
const unique = links => [...new Map(links.map(link => [linkKey(link),link])).values()];

// Available supporting excerpts and the complete dated occurrence ledger. Full
// native questions, snapshots and narratives remain in the source records.
export function krustyArtifactSpecs(anchor) {
  return krustyArtifactSpecsFromModel(anchor,krustyArtifactModel(anchor));
}

// Fresh construction source: {db,dates,program,operations,history}. Read-only here.
// Immutable downloads and registration keep using the anchor-only wrapper above.
export function krustyArtifactSpecsFromModel(anchor,source) {
  if (typeof anchor !== 'string' || !anchor || source?.dates?.anchor !== anchor)
    throw new Error('Krusty artifacts require the same frozen source anchor.');
  const {db, dates, program, operations, history} = source, entries = [];
  const records = Object.fromEntries(Object.entries(IDS).map(([kind,field]) => [kind,
    new Map((db[kind] || []).filter(row => row.client_id === CID).map(row => [row[field],row]))]));
  const resolve = link => {
    const record = records[link.kind]?.get(link.id);
    if (!record || link.occurrence_id && (link.kind !== 'reviews'
      || !record.occurrences?.some(row => row.occurrence_id === link.occurrence_id)))
      throw new Error('A Krusty evidence relationship does not resolve to its actual same-client record or occurrence.');
    return record;
  };
  const add = (kind, id, values, links = [], type = kind, csvId = id) => {
    if (values.length !== HEADER.length-2) throw new Error('Krusty evidence rows require the eleven native book columns.');
    const all = unique(links.some(link => link.kind === kind && link.id === id && link.occurrence_id)
      ? links : [{kind,id},...links]);
    all.forEach(resolve);
    if (kind === 'reviews' && !all.some(link => link.kind === kind && link.id === id && link.occurrence_id))
      throw new Error('Krusty primary Review evidence requires an actual stored occurrence.');
    const cells = [type,csvId,...values];
    entries.push({kind,id,cells,line:csv(cells),links:all});
  };

  for (const sample of krustyOperatingSamples(dates)) for (const row of sample.rows) {
    const links = row.safeguards.split('|').map(id => ({kind:'framework_assessments',id:'fw_'+CID+'_assessment_'+id}));
    if (!links.length) throw new Error('A Krusty operating sample needs its actual safeguard scope.');
    add('framework_assessments',links[0].id,[row.safeguards,'',row.observed_at,row.owner_role,row.source_classification,
      row.scope,row.entity+' / '+row.source_file+' / '+row.observed_value,
      row.result+(row.exceptions ? ' Exceptions: '+row.exceptions : ''),
      row.activity+'; '+row.cadence_or_trigger+'; '+row.basis],links,'operating_sample');
  }
  for (const mapping of program.mapping) {
    const policy = records.policies.get(mapping.policy_id);
    const approved = policy?.decision_history.filter(row => row.subject?.version === mapping.approved_version).at(-1);
    if (!approved || approved.subject.subject_id !== policy.approval_subject?.subject_id)
      throw new Error('Krusty document contents require their exact approved version identity.');
    for (const section of mapping.sections) add('policies',policy.policy_id,
      [section.ids.join('|'),'',approved.reported_approved_at,policy.owner_id,'approved base contents',
        policy.title+' / '+approved.subject.version,section.content,section.classification,
        'Template title is not a CIS mandate. Operating implementation remains separate from approval.'],
      section.ids.map(id => ({kind:'framework_assessments',id:'fw_'+CID+'_assessment_'+id})),'document_contents');
    for (const decision of policy.decision_history) add('policies',policy.policy_id,
      [decision.subject.subject_id,'',decision.reported_approved_at,decision.reported_approver_id,
        decision.action,policy.title+' / '+decision.subject.version,decision.subject.summary,
        JSON.stringify(decision.subject.basis),decision.provenance],[],'document_version');
  }
  for (const risk of operations.risks) add('risks',risk.risk_id,
    ['',risk.next_review,risk.updated_at,risk.owner_id,risk.status,risk.title,risk.description,
      risk.treatment_plan+' '+(risk.acceptance_rationale || risk.closure_note || '')+' Decisions: '+JSON.stringify(risk.decision_history),
      'Likelihood '+risk.likelihood_score+': '+risk.likelihood_rationale+' Impact '+risk.impact_score+': '+risk.impact_rationale],
    [...(risk.related_finding_ids || []).map(id => ({kind:'findings',id})),
      ...(risk.related_task_ids || []).map(id => ({kind:'tasks',id}))]);
  for (const vendor of operations.vendors) add('vendors',vendor.vendor_id,
    ['',vendor.next_review,vendor.updated_at,vendor.owner_id,vendor.status,vendor.name,vendor.service,
      vendor.contract_notes+' '+(vendor.offboarding_notes || ''),
      'Risk class '+vendor.criticality+'; requested assurance is not received or verified supplier evidence.']);
  for (const ai of operations.ai_systems) add('ai_systems',ai.ai_system_id,
    [ai.vendor_id,'',ai.onboarding_screening.recorded_at,ai.owner_id,ai.approval_status,ai.name,
      ai.description+' '+ai.restrictions,JSON.stringify(ai.onboarding_screening.answers),
      'Permitted data: '+ai.permitted_data_types.join(', ')+'. '+ai.data_settings],
    [...(ai.vendor_id ? [{kind:'vendors',id:ai.vendor_id}] : []),...ai.related_links]);

  // Current parent evidence uses its genuine associated record as primary. A
  // secondary unqualified Review link denotes current context, never a made-up
  // completed occurrence or a future completion.
  const reviewSources = new Map();
  for (const review of history.reviews) {
    const links = [];
    for (const [field,kind] of [['risk_id','risks'],['vendor_id','vendors'],['ai_system_id','ai_systems']])
      if (review[field]) links.push({kind,id:review[field]});
    for (const id of review.framework_safeguards || []) links.push({kind:'framework_assessments',id:'fw_'+CID+'_assessment_'+id});
    if (!links.length) throw new Error('Krusty current Review context needs an actual associated source record.');
    const primary = links[0];
    reviewSources.set(review.review_id,primary);
    if (review.policy_id) links.push({kind:'policies',id:review.policy_id});
    add(primary.kind,primary.id,[review.review_id,review.due_date,review.updated_at || review.created_at,
      review.owner_id,review.status,review.title,
      'Native '+review.review_type+' / '+(review.framework_plan_key || 'linked operational relationship')+' / recurrence '+review.recurrence,
      'Current parent context; its saved status and schedule are not a completed execution.',
      review.governance_context?.rationale || 'Native associated record and current Review relationship.'],
    [...links,{kind:'reviews',id:review.review_id}],'current_review');
  }
  // Downloads retain the complete concise ledger. Full period snapshots stay
  // native; only the declared representative boundaries below are excerpted.
  const detailSelection = new Map(), frameworkReviews = new Set(program.reviews.map(row => row.review_id));
  const select = (occurrence, reason) => {
    if (!occurrence) return;
    const reasons = detailSelection.get(occurrence.occurrence_id) || [];
    if (!reasons.includes(reason)) reasons.push(reason);
    detailSelection.set(occurrence.occurrence_id,reasons);
  };
  const policySubjects = new Set();
  const sourceState = occurrence => JSON.stringify({source:occurrence.source_snapshot || null,
    requirements:(occurrence.requirement_snapshot || []).map(row => [row.definition_id,row.framework_version,row.status,row.owner_id,row.process_owner_id])});
  for (const review of history.reviews) {
    const periods = review.occurrences;
    if (frameworkReviews.has(review.review_id)) {
      select(periods[0],'earliest_framework_cycle'); select(periods.at(-1),'latest_framework_cycle');
    }
    for (const [index,occurrence] of periods.entries()) {
      for (const covered of occurrence.policy_coverage || []) if (!policySubjects.has(covered.subject_id)) {
        policySubjects.add(covered.subject_id);select(occurrence,'effective_policy_subject:'+covered.subject_id);
      }
      if (index && sourceState(periods[index-1]) !== sourceState(occurrence)) {
        select(periods[index-1],'before_source_or_requirement_change');select(occurrence,'after_source_or_requirement_change');
      }
      if (occurrence.finding_ids?.length || occurrence.outcome !== 'no_findings') select(occurrence,'recorded_findings_or_exception');
    }
  }
  const providerInventory = history.reviews.find(row => row.framework_plan_key === 'provider-inventory');
  const providerSource = reviewSources.get(providerInventory.review_id);
  const roster = operations.vendors.map(row => ({vendor_id:row.vendor_id,name:row.name,status:row.status,
    created_at:row.created_at,offboarded_at:row.offboarded_at || null}));
  add(providerSource.kind,providerSource.id,[providerInventory.review_id,'',anchor,'','representative current source',
    'Current provider roster','Current native relationship state, not a completed provider-inventory Review.',
    roster.filter(row => row.status === 'active').length+' active / '+roster.filter(row => row.status === 'inactive').length+' inactive',
    JSON.stringify({vendor_roster:roster})],
  [{kind:'reviews',id:providerInventory.review_id},...roster.map(row => ({kind:'vendors',id:row.vendor_id}))],'current_source_detail');
  // One readable source row holds common period facts. Dated occurrence rows
  // name it directly; no second dictionary or native record is created.
  const periodSources = new Map();
  for (const review of history.reviews) for (const occurrence of review.occurrences) {
    const requirements = (occurrence.requirement_snapshot || []).map(row => ({definition_id:row.definition_id,
      framework_version:row.framework_version,status:row.status,owner_id:row.owner_id,process_owner_id:row.process_owner_id}));
    const coverage = (occurrence.policy_coverage || []).map(row => ({policy_id:row.policy_id,
      subject_id:row.subject_id,version:row.version,approval_recorded_at:row.approval_recorded_at,
      reported_approved_at:row.approval?.reported_approved_at || null}));
    const {execution_reference,...operating} = occurrence.operating_observation || {};
    const selection = detailSelection.get(occurrence.occurrence_id);
    const basis = selection ? {coverage:'representative_detail',requirements,policy_coverage:coverage,
      operating_observation:occurrence.operating_observation ? operating : null,source_snapshot:occurrence.source_snapshot || null}
      : {coverage:'complete_concise_ledger',policy_coverage:coverage};
    const key = JSON.stringify([review.review_id,review.title,occurrence.conclusion,basis]);
    if (!periodSources.has(key)) {
      const id = 'KK-period-source-'+(periodSources.size+1), primary = reviewSources.get(review.review_id);
      periodSources.set(key,id);
      add(primary.kind,primary.id,[review.review_id,'',anchor,'',selection ? 'representative historical excerpt' : 'complete concise ledger source',review.title,
        occurrence.conclusion,'',JSON.stringify(basis)],
      [{kind:'reviews',id:review.review_id}],'review_period_source',id);
    }
    add('reviews',review.review_id,[periodSources.get(key),occurrence.due_date,occurrence.completed_at,
      occurrence.completed_by,occurrence.status,'',execution_reference || '',
      occurrence.outcome+'; Findings: '+(occurrence.finding_ids || []).join(', '),
      selection ? JSON.stringify({selection_reasons:selection}) : ''],
    [{kind:'reviews',id:review.review_id,occurrence_id:occurrence.occurrence_id},
      ...(occurrence.finding_ids || []).map(id => ({kind:'findings',id}))],'review_occurrence',occurrence.occurrence_id);
  }
  for (const finding of history.findings) add('findings',finding.finding_id,
    [finding.primary_task_id,finding.due_date,finding.closed_at || finding.updated_at,finding.owner_id,
      finding.status,finding.title,finding.description,finding.remediation_plan,JSON.stringify(finding.decision_history)],
    [{kind:'tasks',id:finding.primary_task_id},
      {kind:'framework_assessments',id:finding.framework_assessment_id}]);
  for (const task of db.tasks.filter(row => row.client_id === CID)) {
    const links = [];
    for (const [field,kind] of [['finding_id','findings'],['risk_id','risks'],['vendor_id','vendors'],['ai_system_id','ai_systems']])
      if (task[field]) links.push({kind,id:task[field]});
    add('tasks',task.task_id,[task.finding_id || task.risk_id || task.vendor_id || '',task.due_date,
      task.completed_at || task.updated_at,task.assignee_id,task.status,task.title,task.description,
      task.resolution || 'Work remains open.','Action completion, Finding validation and Risk closure are separate.'],links);
  }

  const commonHead = '# DEMO — SYNTHETIC DATA. Frozen collection: '+anchor+'.\n'
    +'# Retrospective source books; not original uploaded or externally verified files.\n'
    +'# COMPLETE concise ledger and FULL native history; REPRESENTATIVE, NONEXHAUSTIVE historical details. Not certification or assurance.\n';
  const legend = '# COLUMN AND REFERENCE LEGEND — cis-record-books-1.csv\n'
    +'# Native records retain full questions, narratives, snapshots and approvals. Earlier organization history is not a legacy CIS assessment.\n'
    +'# review_occurrence: record_id is the actual occurrence ID; context_record names one review_period_source row across this book set; observation is its execution reference.\n'
    +'# Source rows provide native Review ID(context_record),title(scope),conclusion(observation),exact covered versions and coverage(basis). Each selected occurrence records its selection_reasons in its own basis; no further references.\n';
  const tableLegend = '# Compact period-source tables retain the following native field order; null remains null.\n'
    +Object.entries(PERIOD_COLUMNS).map(([key,fields]) => '# '+key+' columns: '+fields.join(', ')+'.\n').join('');
  const head = (index,compact) => commonHead+(index ? '# Column/reference legend: cis-record-books-1.csv.\n' : legend)
    +(compact && !index ? tableLegend : '')+(compact ? compactCsv(HEADER) : csv(HEADER));
  const pack = (sourceEntries,compact = false) => {
    const bins = [];
    for (const entry of sourceEntries) {
      if (entry.links.length > 100)
        throw new Error('A Krusty evidence row exceeds the native file/link bounds: '+entry.id);
      const lineBytes = bytes(entry.line);
      let bin = bins.find(candidate => candidate.byte_count+lineBytes <= DEMO_INLINE_LIMIT
        && unique([...candidate.links,...entry.links]).length <= 100);
      if (!bin) {
        const text = head(bins.length,compact), headerBytes = bytes(text);
        if (headerBytes+lineBytes > DEMO_INLINE_LIMIT)
          throw new Error('A Krusty evidence row exceeds the native file/link bounds: '+entry.id);
        bin = {rows:[],text,byte_count:headerBytes,links:[]};bins.push(bin);
      }
      bin.rows.push(entry);bin.text += entry.line;bin.byte_count += lineBytes;
      bin.links = unique([...bin.links,...entry.links]);
    }
    return bins.map((bin,index) => {
      const key = 'record-books-'+(index+1), first = bin.rows[0];
      return {key,evidence_id:CID+'_canonical_evidence_'+key,filename:'cis-'+key+'.csv',mime_type:'text/csv',
        linked_type:SINGULAR[first.kind],linked_id:first.id,
        occurrence_id:first.links.find(link => link.kind === first.kind && link.id === first.id && link.occurrence_id)?.occurrence_id || null,
        text:bin.text,relationships:bin.links};
    });
  };
  let books = pack(entries);
  // Preserve every previously valid recipe's original bytes. Only an anchor
  // with no valid original book set uses this lossless document presentation.
  if (books.length > LEGACY_FORMAT_MAX_BOOKS) books = pack(entries.map(entry => {
    const cells = [...entry.cells];
    if (cells[0] === 'review_period_source') {
      const basis = JSON.parse(cells[10]);
      for (const [key,fields] of Object.entries(PERIOD_COLUMNS)) if (basis[key])
        basis[key] = basis[key].map(row => fields.map(field => {
          if (!Object.hasOwn(row,field)) throw new Error('Krusty period-source tables require every declared native field.');
          return row[field];
        }));
      cells[10] = JSON.stringify(basis);
    }
    return {...entry,line:compactCsv(cells)};
  }),true);
  if (books.length > FINAL_MAX_BOOKS) throw new Error('Krusty evidence requires '+books.length+' files / '
    +books.reduce((sum,book) => sum+bytes(book.text),0)+' bytes; the approved limit is'+FINAL_MAX_BOOKS+' files. Representative detailed periods: '
    +detailSelection.size+' of '+history.occurrence_count+'.');
  return books;
}
