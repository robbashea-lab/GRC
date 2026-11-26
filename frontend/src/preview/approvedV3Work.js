import {reviewSchedule} from '../lib/reviewOccurrences.js';
import {calendarDay,managementDay} from '../lib/managementDates';

const programKeys = {cis:'cis-ig1', soc:'soc-2', iso:'iso-27001', nist:'nist-csf-2', hipaa:'hipaa', cmmc:'cmmc'};
const sourceProgramKeys = {'cis-ig1':'cis:8.1','soc-2':'soc:2017-2022','iso-27001':'iso:27001-2022',
  'nist-csf-2':'nist:csf2.0',hipaa:'hipaa:45cfr164',cmmc:'cmmc:800171r2'};
const registerKinds = {risk:['risks','risk_id'], vendor:['vendors','vendor_id'], policy:['policies','policy_id'], ai:['ai_systems','ai_system_id']};
const reviewTypes = {
  'AI Governance':'ai_governance', Risk:'risk_assessment', 'Risk assessment':'risk_assessment',
  'Security Awareness':'awareness', 'Backup / Restore':'bcp_dr', Contingency:'bcp_dr',
  'Vulnerability / Patch':'vulnerability', 'Incident Response':'incident', 'Incident response':'incident',
};
export const nativeReviewType = label => reviewTypes[label] || label?.toLowerCase() || 'other';
const taskStatuses = {Open:'open', 'In progress':'in_progress', Blocked:'blocked', 'Pending validation':'done', Completed:'done', Cancelled:'cancelled'};
const findingStatuses = {Open:'open', 'In progress':'in_remediation', 'Pending validation':'remediated', Closed:'closed', Accepted:'accepted'};
const libraryKinds = {'Action item':['tasks','task_id'], Review:['reviews','review_id'], Risk:['risks','risk_id'],
  Policy:['policies','policy_id'], Vendor:['vendors','vendor_id'], Asset:['assets','asset_id'], Finding:['findings','finding_id'],
  'AI system':['ai_systems','ai_system_id']};
const evidenceAliases={task:'tasks',review:'reviews',risk:'risks',policy:'policies',vendor:'vendors',asset:'assets',
  finding:'findings',ai_system:'ai_systems',framework_assessment:'framework_assessments'};
const evidenceTypes = {Report:'Report', 'Audit report':'Report', 'Assurance report':'Report', 'Configuration export':'Export',
  Certificate:'Certification', Policy:'Policy / Procedure', Procedure:'Policy / Procedure', 'Log export':'Log / System Record'};
const labelPrograms = {'CIS IG1':'cis-ig1','CIS IG2':'cis-ig1','CIS IG3':'cis-ig1','SOC 2':'soc-2',
  'NIST CSF 2.0':'nist-csf-2','ISO 27001':'iso-27001','CMMC L1':'cmmc','CMMC L2':'cmmc',HIPAA:'hipaa'};

function overlayEvidenceSummary(view,records,ctx) {
  const library=view.evidence?.[ctx.sourceId],catalog=records.evidenceCatalog;
  if(!library||!Array.isArray(catalog))return;
  const today=managementDay(ctx.asOfDate||new Date());
  if(today===null)throw Error('Choose a valid reporting date for the Evidence Library.');
  const rows=catalog.filter(row=>row.client_id===ctx.clientId&&!row.archived_at);
  library.nativeFoldersByEvidenceId=Object.create(null);
  const folderCounts=library.folders&&Object.fromEntries(Object.keys(library.folders).map(name=>[name,0]));
  for(const row of rows) {
    const areas=[...new Set(row.program_areas?.length?row.program_areas:['Unassigned'])];
    library.nativeFoldersByEvidenceId[row.evidence_id]=areas;
    const sourceId=row.source_record_id||(records.evidence||[]).find(file=>file.evidence_id===row.evidence_id)?.source_record_id;
    if(sourceId)library.nativeFoldersByEvidenceId[sourceId]=areas;
    if(folderCounts)for(const area of areas) {
      const folder=area==='Unassigned'?'Needs classification':area;
      folderCounts[folder]=(folderCounts[folder]||0)+1;
    }
  }
  if(folderCounts)library.folders=folderCounts;
  const files=rows.filter(row=>row.file_available!==false&&/^[a-f\d]{64}$/i.test(row.sha256||'')&&
    Number.isSafeInteger(row.size_bytes??row.file_size??row.size)&&(row.size_bytes??row.file_size??row.size)>=0);
  const refs=file=>(file.references||[]).filter(ref=>ref.available);
  const periods=new Set();
  for(const review of (records.reviews||[]).filter(row=>row.client_id===ctx.clientId)) {
    for(const occurrence of [...(review.occurrences||[]),review])if(occurrence.status==='completed') {
      const id=occurrence.occurrence_id||occurrence.current_occurrence_id||'occ_'+review.review_id;
      periods.add(JSON.stringify([review.review_id,id]));
    }
  }
  const supported=new Set(files.flatMap(file=>refs(file).filter(ref=>ref.kind==='reviews')
    .map(ref=>JSON.stringify([ref.id,ref.occurrence_id||'occ_'+ref.id]))));
  const summary={files:files.length,referenceCount:rows.filter(row=>row.file_available===false).length,
    recent:files.filter(file=>{const day=calendarDay(file.created_at||file.uploaded_at);return day!==null&&day>=today-90&&day<=today;}).length,
    recentSince:new Date((today-90)*86400000).toISOString().slice(0,10),
    rp:String([...periods].filter(key=>supported.has(key)).length),rpOf:String(periods.size)};
  const client=view.clients?.find(row=>row.id===ctx.sourceId);
  library.nativeSummaryByProgram={};
  for(const program of client?.progs||[]) {
    if(program.retired||program.ws)continue;
    const definitions=new Set((program.reg?.items||[]).map(item=>item.id));
    const assessments=new Set((records.framework_assessments||[]).filter(row=>row.client_id===ctx.clientId&&
      row.framework_key===programKeys[program.k]&&definitions.has(row.definition_id)).map(row=>row.framework_assessment_id));
    const linked=new Set();let fileCount=0;
    for(const file of files) {
      const matches=refs(file).filter(ref=>ref.kind==='framework_assessments'&&assessments.has(ref.id));
      if(matches.length)fileCount++;
      matches.forEach(ref=>linked.add(ref.id));
    }
    library.nativeSummaryByProgram[program.k]={...summary,fwLabel:program.k==='cis'?(program.label||'CIS')+' safeguards with evidence':'Framework files',
      fwVal:String(program.k==='cis'?linked.size:fileCount),fwOf:program.k==='cis'?String(definitions.size):null};
  }
  library.nativeSummary=summary;
  Object.assign(library,summary,library.nativeSummaryByProgram[client?.activeProg]||{fwLabel:'Framework files',fwVal:'0',fwOf:null});
}

function linkedAssessment(ctx,itemId,program) {
  if (!itemId) return null;
  if (program) {
    const ref=String(program).split('|').at(-1);
    return ctx.assessmentId(itemId,programKeys[ref.split(':')[0]] || ref);
  }
  const candidates=new Set(Object.values(programKeys).map(key=>ctx.assessmentId(itemId,key)).filter(Boolean));
  return candidates.size===1 ? [...candidates][0] : null;
}

function cadence(value) {
  const named = {'':'annual', A:'annual', Y:'annual', M:'monthly', Q:'quarterly', S:'semiannual', '1':'none'};
  if (Object.hasOwn(named, value)) return {recurrence:named[value]};
  const days = value?.unit === 'days' ? Number(value.interval) : Number(/^D:(\d+)$/.exec(value)?.[1]);
  if (Number.isInteger(days) && days >= 1 && days <= 3660) return {recurrence:'custom', custom_recurrence_days:days};
  return {recurrence:null};
}

function scheduledCycle(anchor, index, recurrence, days, monthEnd) {
  const date = new Date(anchor);
  if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(index) || index < 0) return null;
  if (!index) return anchor;
  if (recurrence === 'custom') date.setUTCDate(date.getUTCDate() + days*index);
  else {
    const months = {monthly:1,quarterly:3,semiannual:6,annual:12}[recurrence];
    if (!months) return null;
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth()+months*index);
    const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(monthEnd ? last : Math.min(day,last));
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function reviewFields(ctx, row) {
  const subject = registerKinds[row.link?.kind];
  const result = {
    client_id:ctx.clientId, title:row.title, review_type:nativeReviewType(row.type),
    due_date:row.due || null, owner_id:row.owner ? ctx.userId(row.owner) : null,
    source_owner:row.owner, source_review_type:row.type, source_cadence:row.cad, source_basis:row.basis,
    source_basis_code:row.basisCode, source_framework_links:row.frameworkLinks, source_support_mappings:row.supportMappings,
    source_status:row.st, source_revision:row.revision, notes:row.notes, scope:row.description,
    ...cadence(row.cad),
  };
  if (row.nativeTemplateId) result.review_template_id=row.nativeTemplateId;
  if (row.anchor && row.due) {
    const day = new Date(row.anchor).getUTCDate();
    if (Number.isFinite(day)) result.schedule_anchor = {day, month_end:!!row.monthEnd};
    // A drag changes the current due date, while the series continues from its previous anchor.
    result.recurrence_due_date=scheduledCycle(row.anchor,row.cycleIndex ?? 0,result.recurrence,result.custom_recurrence_days,row.monthEnd);
  }
  Object.assign(result, reviewSchedule(result));
  if (subject && row.link.id) result[subject[1]] = ctx.recordId(subject[0], row.link.id);
  if (row.link?.kind === 'vendor') result.vendor_purpose = {review:'vendor', renewal:'contract', assurance:'assurance', offboarding:'offboarding'}[row.link.purpose];
  if (row.link?.kind === 'ai') result.ai_review_purpose = 'periodic';
  if (row.cwTitle || row.cwRec || row.cwUrl) {
    result.source_ticket = {title:row.cwTitle, number:row.cwRec, url:row.cwUrl};
  }
  if(row.cwTitle || row.cwRec || row.cwUrl || row.noTicket || row.ivsSetup?.notes) result.activity_setup={
    recurring_ticket_summary:row.cwTitle || '',recurring_ticket_number:row.cwRec || '',recurring_ticket_url:row.cwUrl || '',
    notes:row.ivsSetup?.notes || '',no_ticket:!!row.noTicket};
  const drivers = [];
  for (const mapping of row.supportMappings || []) {
    const key = programKeys[mapping.kind];
    if (!key) continue;
    const ids = mapping.explicit ? (mapping.ids || []).filter(id => ctx.assessmentId(id, key)) : [];
    const plans=(ctx.reviewPlans?.(key) || []).filter(p=>!subject &&
      [p.title,p.ig3_title,p.level_one_title].filter(Boolean).includes(row.title) &&
      (p.safeguards || []).some(id=>ids.length ? ids.includes(id) : ctx.assessmentId(id,key)));
    const plan=plans.length===1 ? plans[0] : null;
    // A named native activity can be coordinated without promoting an unverified crosswalk.
    if (ids.length || plan) drivers.push({framework_key:key, framework_safeguards:ids, framework_driver_active:true,
      ...(plan ? {framework_plan_key:plan.key} : {}),
      framework_basis:mapping.source, source_relationship:mapping.relationship});
  }
  if (drivers.length) Object.assign(result, drivers[0], {framework_drivers:drivers});
  return result;
}

function libraryDate(raw) {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}))?$/.exec(raw);
  if (!match) return null;
  // The approved document's pDate uses 2026 for its abbreviated sample dates.
  const iso = '20' + (match[3] || '26') + '-' + match[1].padStart(2, '0') + '-' + match[2].padStart(2, '0');
  const parsed = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(iso) ? iso : null;
}

function libraryLink(db, ctx, type, target) {
  if (type === 'Framework requirement') {
    const head = target.split(' · ')[0];
    const label = Object.keys(labelPrograms).find(prefix=>head.startsWith(prefix+' '));
    const id = linkedAssessment(ctx,head.split(' ').at(-1),labelPrograms[label]);
    return id ? {linked_type:'framework_assessments', linked_id:id} : {};
  }
  const spec = libraryKinds[type];
  if (!spec) return {};
  const [kind, key] = spec;
  let label = target;
  let date = '';
  if (type === 'Review') {
    const match = /^(.*) (\d{4}(?:-\d\d-\d\d)?)$/.exec(label);
    if (match) [, label, date] = match;
  }
  const matches = (db[kind] || []).filter(row => row.client_id === ctx.clientId && (row.title === label || row.name === label));
  if (matches.length !== 1) return {};
  const row = matches[0];
  const link = {linked_type:kind, linked_id:row[key]};
  if (date) {
    const events = row.occurrences.filter(occ => occ.completed_at?.startsWith(date) || occ.due_date?.startsWith(date));
    if (events.length === 1) link.occurrence_id = events[0].occurrence_id;
  }
  return link;
}

/** Append one approved client's records to a fresh fixture. IDs are deterministic across snapshots. */
export function appendApprovedV3Work(db, source, ctx) {
  const work = source.work?.[ctx.sourceId] || {};
  const mappings = Object.fromEntries(['reviews','occurrences','findings','tasks','evidence'].map(kind=>[kind,Object.create(null)]));
  const idFor = (kind, raw) => {
    const id = ctx.recordId(kind, raw);
    mappings[kind][raw] = id;
    return id;
  };
  const reviews = new Map();
  for (const item of [...(work.revs || []), ...(work.cancelledReviews || [])]) {
    const row = {...reviewFields(ctx, item), review_id:idFor('reviews', item.id), source_record_id:item.id,
      status:({'In progress':'in_progress', Cancelled:'cancelled', 'Needs scheduling':'needs_scheduling'})[item.st] || 'upcoming',
      occurrences:[], source_cancellation_reason:item.cancellationReason, cancelled_at:item.cancelledOn};
    if (item.occurrenceId) {
      row.source_occurrence_id = item.occurrenceId;
      row.current_occurrence_id = idFor('occurrences', item.occurrenceId);
      row.source_initial_native_occurrence_id = row.current_occurrence_id;
    }
    reviews.set(item.id, row);
  }
  for (const item of work.hist || []) {
    const occurrenceId = idFor('occurrences', item.occurrenceId || item.id);
    const fields = reviewFields(ctx, item);
    const snapshot = {...fields, review_id:idFor('reviews', item.reviewId), occurrence_id:occurrenceId,
      source_record_id:item.id, source_occurrence_id:item.occurrenceId, status:'completed', completed_at:item.done, completion_date:item.done,
      completed_by_name:item.completedBy, completed_by:item.completedBy ? ctx.userId(item.completedBy) : null,
      outcome:item.outcome === 'No exceptions noted' ? 'no_findings' : item.outcome,
      source_outcome:item.outcome, source_checklist:item.checklist, source_evidence:item.evidence,
      source_risk_assessment:item.assessment, evidence:[]};
    let row = reviews.get(item.reviewId);
    if (!row) {
      row = {...fields, source_record_id:item.reviewId, review_id:snapshot.review_id, status:'completed', occurrences:[]};
      reviews.set(item.reviewId, row);
    }
    row.occurrences.push(snapshot);
  }
  for (const row of reviews.values()) {
    row.occurrences.sort((a,b) => String(a.completed_at).localeCompare(String(b.completed_at)));
    if (row.status === 'completed') {
      row.completion_snapshot = row.occurrences.at(-1);
      row.completion_date = row.completion_snapshot.completion_date;
      row.current_occurrence_id = row.completion_snapshot.occurrence_id;
    }
    db.reviews.push(row);
  }

  const tasks = [...(work.acts || []), ...(work.done || [])];
  const matchingAssessment = task => {
    if (!task) return null;
    const cis = /^Assessment · CIS (\d+\.\d+)$/.exec(task.source);
    const explicitProgram=task.fromProgram || (cis ? 'cis' : null) || task.frameworkLinks?.[0]?.program;
    return linkedAssessment(ctx,task.fromItem || cis?.[1],explicitProgram);
  };
  for (const item of work.findings || []) {
    const linked = tasks.filter(task => item.actionIds?.includes(task.id));
    const assessmentIds = new Set(linked.map(matchingAssessment).filter(Boolean));
    const assessmentId = item.fromItem ? linkedAssessment(ctx,item.fromItem,item.fromProgram) : assessmentIds.size === 1 ? [...assessmentIds][0] : null;
    db.findings.push({client_id:ctx.clientId, finding_id:idFor('findings', item.id), source_record_id:item.id,
      title:item.title, status:findingStatuses[item.st] || 'open', source_status:item.st, source_history:item.history,
      framework_assessment_id:assessmentId, review_id:reviews.get(item.fromRev)?.review_id,
      source_revision:item.revision, source_action_ids:item.actionIds, source_item:item.fromItem,
      source_program:item.fromProgram});
  }
  const risks = source.programs?.[ctx.sourceId]?.risks || [];
  for (const item of tasks) {
    const finding = mappings.findings[item.findingId];
    const risk = risks.find(row => row.id === item.source);
    const assessment = matchingAssessment(item);
    const row = {client_id:ctx.clientId, task_id:idFor('tasks', item.id), source_record_id:item.id,
      title:item.title, description:item.origin, priority:item.pri?.toLowerCase(), status:taskStatuses[item.st] || 'open',
      source_status:item.st, source_revision:item.revision, source:item.source, source_owner:item.owner,
      assignee_id:item.owner ? ctx.userId(item.owner) : null, due_date:item.due || null, framework_assessment_id:assessment,
      source_item:item.fromItem, source_program:item.fromProgram, source_framework_links:item.frameworkLinks, source_history:item.history,
      resolution:item.workNote, completed_at:item.workSubmittedAt || item.doneAt,
      completed_by:item.workSubmittedBy?.name ? ctx.userId(item.workSubmittedBy.name) : item.completedBy ? ctx.userId(item.completedBy) : null};
    if (finding) Object.assign(row, {finding_id:finding, source_type:'finding', source_id:finding});
    else if (risk) {
      const riskId = ctx.recordId('risks', risk.wfId);
      Object.assign(row, {risk_id:riskId, source_type:'risk', source_id:riskId});
    } else if (item.source === 'Manual') row.source_type = 'manual';
    else if (item.source === 'Vendor') row.source_type = 'vendor';
    if (reviews.has(item.fromRev)) row.review_id = reviews.get(item.fromRev).review_id;
    db.tasks.push(row);
  }

  const evidenceRows = source.evidence?.[ctx.sourceId]?.rows || '';
  for (const line of evidenceRows.split('\n').filter(Boolean)) {
    const [label, metadata, type, subject, title, count, by, date, origin, suppliedId] = line.split('^');
    if (!label || !metadata) continue;
    const version = /^v(\d+)\b/.exec(metadata);
    const rawId = suppliedId || label;
    if (Object.hasOwn(mappings.evidence, rawId)) throw new Error('Duplicate approved evidence label in client ' + ctx.sourceId);
    db.evidence.push({evidence_id:idFor('evidence', rawId), source_record_id:rawId, client_id:ctx.clientId,
      display_name:label, filename:label, file_available:false, evidence_type:evidenceTypes[type] || 'Other',
      version:version ? Number(version[1]) : undefined, evidence_date:libraryDate(date), uploaded_by_name:by,
      uploaded_by:by ? ctx.userId(by) : null, source_file_metadata:metadata, source_evidence_type:type,
      source_subject_type:subject, source_subject_title:title, source_link_count:count, source_file_origin:origin,
      ...libraryLink(db, ctx, subject, title)});
  }
  return mappings;
}

const sourceCadences = {monthly:'M', quarterly:'Q', semiannual:'S', annual:'', none:'1'};
const reverseTaskStatus = {open:'Open', in_progress:'In progress', blocked:'Blocked', done:'Completed', cancelled:'Cancelled'};
const reverseFindingStatus = {open:'Open', in_remediation:'Open', remediated:'Pending validation', closed:'Closed', accepted:'Accepted'};
const sourceKinds = {vendor:'Vendor', policy:'Policy', ai_governance:'AI Governance', risk_assessment:'Risk assessment',
  asset:'Asset', access:'Access', incident:'Incident response', bcp_dr:'Backup / Restore', awareness:'Security Awareness'};
const titleCase = text => text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
const nativeKey = (row, key) => row.source_record_id || row[key];

function sourceDate(value, example, liveDates) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (liveDates || example instanceof Date) return date;
  if (typeof example === 'string') return value;
  return {$date:date.toISOString()};
}

function overlayClientWork(view, records, ctx) {
  const {clientId,sourceId} = ctx;
  const work = view.work[sourceId];
  if (!work) return;
  const scoped = kind => (records[kind] || []).filter(row => row.client_id === clientId);
  const native = Object.fromEntries(['reviews','tasks','findings','evidence','risks','policies','vendors','ai_systems','assets','framework_assessments']
    .map(kind => [kind, scoped(kind)]));
  const people = new Map((records.users || []).map(user => [user.user_id,user.name]));
  const identity = id => {
    if(!id) return null;
    const user=(records.users || []).find(person=>person.user_id===id);
    return {id,email:user?.email || null,name:user?.name || ctx.userName?.(id) || ''};
  };
  const nameOf = (id, fallback) => id ? (ctx.userName?.(id) || people.get(id) || fallback || 'Unassigned') : 'Unassigned';
  const lookup = (kind,id,key) => id ? (native[kind] || []).find(row => row[key] === id) : null;
  const original = rows => new Map((rows || []).map(row => [row.id,row]));
  const oldReviews = original([...(work.revs || []),...(work.cancelledReviews || [])]);
  const oldHistory = original(work.hist);
  const oldTasks = original([...(work.acts || []),...(work.done || [])]);
  const oldFindings = original(work.findings);
  const dateExample = work.revs?.find(r=>r.due)?.due || work.hist?.find(r=>r.done)?.done;
  const date = value => sourceDate(value,dateExample,ctx.liveDates);
  // Native due dates identify a calendar day. The approved calendar normalizes
  // Dates to local midnight, which would move a UTC midnight back one day.
  const calendarDate = value => {
    if (!(ctx.liveDates || dateExample instanceof Date) || !value) return date(value);
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return day ? new Date(Number(day[1]),Number(day[2])-1,Number(day[3])) : date(value);
  };
  const sourceIdFor = (kind,id,key) => {
    const row = lookup(kind,id,key);
    return row ? nativeKey(row,key) : null;
  };
  function sourceLink(row) {
    for (const [kind,[collection,key]] of Object.entries(registerKinds)) {
      const id = sourceIdFor(collection,row[key],key);
      if (id) return {kind,id,purpose:kind === 'vendor'
        ? ({vendor:'review',contract:'renewal',assurance:'assurance',offboarding:'offboarding'}[row.vendor_purpose] || 'review') : 'review'};
    }
    return null;
  }
  if (Array.isArray(records.reviews)) {
    const active=[], cancelled=[], history=[];
    for (const row of native.reviews) {
      const id=nativeKey(row,'review_id'), prev=oldReviews.get(id) || {};
      const prevNativeOcc = prev.nativeOccurrenceId || (prev.occurrenceId && ctx.recordId?.('occurrences',prev.occurrenceId));
      const nativeHist = row.occurrences || [];
      const advanced = nativeHist.filter(occ=>!oldHistory.has(nativeKey(occ,'occurrence_id'))).length;
      const nativeOccurrence = row.current_occurrence_id || 'occ_'+row.review_id;
      const sameOccurrence = prevNativeOcc === nativeOccurrence || (!prevNativeOcc && prev.occurrenceId && !advanced);
      const occurrenceId = sameOccurrence ? prev.occurrenceId
        : row.source_initial_native_occurrence_id === nativeOccurrence ? row.source_occurrence_id : nativeOccurrence;
      const type = row.source_review_type || sourceKinds[row.review_type] || titleCase(row.review_type) || 'Review';
      const cadenceCode = r=>r.recurrence === 'custom' ? 'D:'+r.custom_recurrence_days : sourceCadences[r.recurrence];
      const previousMappings=row.source_support_mappings || prev.supportMappings || [];
      const supportMappings=previousMappings.filter(mapping=>!mapping.explicit);
      for (const driver of row.framework_drivers || [row]) {
        const program=sourceProgramKeys[driver.framework_key];
        if (!program || driver.framework_driver_active===false || !driver.framework_safeguards?.length) continue;
        const originalMapping=previousMappings.find(mapping=>mapping.program===program && mapping.explicit);
        supportMappings.push({...originalMapping,kind:program.split(':')[0],program,ids:[...driver.framework_safeguards],explicit:true,
          relationship:originalMapping?.relationship || 'partial_support',source:originalMapping?.source || driver.framework_basis});
      }
      const projection = {...prev,id,kind:'rev',title:row.title,type,description:row.scope || '',notes:row.notes || '',
        owner:nameOf(row.owner_id,row.owner_name || row.source_owner),due:calendarDate(row.due_date),
        cad:cadenceCode(row),st:({in_progress:'In progress',needs_scheduling:'Needs scheduling',cancelled:'Cancelled'})[row.status] || 'Not started',
        // Native dates already describe the current recurrence. Historical or
        // optimistic source completions must not advance that cycle a second time.
        anchor:calendarDate(row.recurrence_due_date || row.due_date), monthEnd:!!row.schedule_anchor?.month_end,
        occurrenceSequence:(prev.occurrenceSequence || 0)+advanced,cycleIndex:0,
        occurrenceId,nativeOccurrenceId:nativeOccurrence,nativeId:row.review_id,link:sourceLink(row),supportMappings,
        basis:row.source_basis || row.governance_context?.rationale || prev.basis || '',basisCode:row.source_basis_code || prev.basisCode || 'O'};
      if(row.activity_setup) Object.assign(projection,{cwTitle:row.activity_setup.recurring_ticket_summary || '',
        cwRec:row.activity_setup.recurring_ticket_number || '',cwUrl:row.activity_setup.recurring_ticket_url || '',
        noTicket:!!row.activity_setup.no_ticket,ivsSetup:{...prev.ivsSetup,notes:row.activity_setup.notes || ''}});
      if (row.status === 'cancelled') cancelled.push(projection);
      else if (row.status !== 'completed') active.push(projection);
      const allOccurrences = [...nativeHist];
      if (row.completion_snapshot && !allOccurrences.some(o=>o.occurrence_id===row.completion_snapshot.occurrence_id)) {
        allOccurrences.push(row.completion_snapshot);
      }
      for (const snap of allOccurrences) {
        const histId = nativeKey(snap,'occurrence_id');
        const saved = oldHistory.get(histId) || {};
        const displayedOutcome = {no_findings:'No exceptions noted',findings_raised:'Exceptions noted'}[snap.outcome] || snap.outcome;
        history.push({...saved,id:histId,reviewId:id,kind:'rev',doneFlag:true,title:snap.title || row.title,
          type:snap.source_review_type || type, due:calendarDate(snap.due_date),done:date(snap.completed_at || snap.completion_date),
          outcome:snap.checklist_outcome || displayedOutcome,owner:nameOf(snap.owner_id,snap.source_owner),cad:cadenceCode(snap),
          completedBy:snap.completed_by_name || (snap.completed_by ? nameOf(snap.completed_by) : saved.completedBy),
          occurrenceId:snap.source_occurrence_id || saved.occurrenceId || snap.occurrence_id,nativeOccurrenceId:snap.occurrence_id,
          notes:snap.notes || snap.completion_notes || saved.notes,
          checklist:Array.isArray(snap.checklist_results)
            ? {...snap.checklist,steps:snap.checklist_results.map(step=>({...step,t:step.text,note:step.reason || ''}))}
            : snap.source_checklist || saved.checklist,
          supportingReference:snap.supporting_reference ?? saved.supportingReference,
          evidence:snap.source_evidence || saved.evidence || (snap.evidence || []).map(e=>({name:e.filename,nativeId:e.evidence_id})),
          basis:snap.source_basis || saved.basis || projection.basis,basisCode:snap.source_basis_code || saved.basisCode || projection.basisCode});
      }
    }
    Object.assign(work,{revs:active,cancelledReviews:cancelled,hist:history});
    for (const ai of view.records?.[sourceId]?.ai || []) {
      ai.rev=active.find(r=>r.link?.kind==='ai' && r.link.id===ai.wfId) || null;
    }
    for (const policy of view.programs?.[sourceId]?.pols || []) {
      policy.revId=active.find(r=>r.link?.kind==='policy' && r.link.id===policy.wfId)?.id || null;
    }
  }

  if (Array.isArray(records.findings)) {
    work.findings=native.findings.map(row=>{
      const id=nativeKey(row,'finding_id'), prev=oldFindings.get(id) || {};
      const assessment=lookup('framework_assessments',row.framework_assessment_id,'framework_assessment_id');
      const decisions=(row.decision_history || []).map(decision=>({nativeDecision:true,type:decision.action,
        at:date(decision.at),by:people.get(decision.by) || decision.by,detail:{rationale:decision.rationale}}));
      return {...prev,id,nativeId:row.finding_id,title:row.title,st:reverseFindingStatus[row.status] || row.status,
        fromRev:sourceIdFor('reviews',row.review_id,'review_id'),
        fromItem:assessment?.definition_id || null,fromProgram:sourceProgramKeys[assessment?.framework_key] || null,
        closedOn:date(row.closed_at),history:[...(row.source_history || prev.history || []).filter(entry=>!entry.nativeDecision),...decisions],
        actionIds:native.tasks.filter(t=>t.finding_id===row.finding_id).map(t=>nativeKey(t,'task_id'))};
    });
  }
  if (Array.isArray(records.tasks)) {
    work.acts=[];work.done=[];
    for (const row of native.tasks) {
      const id=nativeKey(row,'task_id'), prev=oldTasks.get(id) || {};
      const finding=lookup('findings',row.finding_id,'finding_id');
      // The submitted Action stays visible until the linked Finding has been validated.
      const returned=(finding?.decision_history || []).some(d=>d.action==='rejected' && row.completed_at &&
        new Date(d.at)>=new Date(row.completed_at));
      const pending=row.status==='done' && finding && !returned && !['closed','accepted'].includes(finding.status);
      const st=pending ? 'Pending validation' : reverseTaskStatus[row.status] || row.status;
      // Native Finding remediation stores the origin on its Finding rather than
      // duplicating it on the primary task. Resolve that exact scoped relation.
      const assessment=lookup('framework_assessments',row.framework_assessment_id || finding?.framework_assessment_id,'framework_assessment_id');
      const fromProgram=sourceProgramKeys[assessment?.framework_key] || null;
      // Pair creation can store its shared description on the Finding only;
      // an explicitly empty native Action description still takes precedence.
      const item={...prev,id,nativeId:row.task_id,kind:'act',title:row.title,st,
        pri:titleCase(row.priority || ''),due:calendarDate(row.due_date),owner:nameOf(row.assignee_id,row.assignee_name || row.source_owner),
        source:row.source || titleCase(row.source_type || 'Manual'),origin:prev.origin || '',detail:row.description ?? finding?.description ?? '',
        findingId:finding ? nativeKey(finding,'finding_id') : null,
        vendorId:sourceIdFor('vendors',row.vendor_id,'vendor_id'),
        fromRev:sourceIdFor('reviews',row.review_id,'review_id'),
        fromItem:assessment?.definition_id || null,fromProgram,
        frameworkLinks:fromProgram ? [{program:fromProgram,ref:assessment.definition_id}] : [],
        workNote:row.resolution || '',workSubmittedAt:date(row.completed_at),workSubmittedBy:identity(row.completed_by) || prev.workSubmittedBy,
        doneAt:st==='Completed' ? date(row.completed_at) : null};
      if(Array.isArray(row.submission_history)) item.history=[...(row.source_history || prev.history || []).filter(h=>h.type!=='work-completed'),
        ...row.submission_history.map(event=>({type:'work-completed',at:date(event.at),by:people.get(event.by) || event.by,
          detail:{submittedBy:identity(event.by)}}))];
      if (row.status==='cancelled' || (row.status==='done' && !pending)) work.done.push(item);
      else work.acts.push(item);
    }
  }

  if (Array.isArray(records.evidence) && view.evidence?.[sourceId]) {
    const library=view.evidence[sourceId], files=native.evidence.filter(e=>!e.archived_at);
    // Preserve identifiable fixture figures before replacing them with native
    // counts. A metadata reference does not establish stored file contents.
    if(Array.isArray(records.evidenceCatalog))library.sourceSummary||=Object.fromEntries(
      ['files','recent','fwLabel','fwVal','fwOf','rp','rpOf'].map(key=>[key,library[key]]));
    else delete library.nativeFoldersByEvidenceId;
    const oldRows=new Map((library.rows || '').split('\n').filter(Boolean).map(line=>{
      const cells=line.split('^');
      return [cells[9] || cells[0],cells];
    }));
    const titles=Object.fromEntries(Object.entries(libraryKinds).map(([label,[kind,key]])=>[kind,{label,key}]));
    const clean=value=>String(value ?? '').replace(/\^/g,'＾').replace(/[\r\n]+/g,' ');
    library.nativeFiles=files.map(f=>({id:f.evidence_id,name:f.display_name || f.filename,filename:f.filename,
      version:f.version || 1,kind:titles[evidenceAliases[f.linked_type] || f.linked_type]?.label || f.source_subject_type || '',
      title:f.source_subject_title || (lookup(evidenceAliases[f.linked_type] || f.linked_type,f.linked_id,
        titles[evidenceAliases[f.linked_type] || f.linked_type]?.key)?.title) || '',
      available:f.file_available!==false && typeof f.sha256==='string' && /^[a-f\d]{64}$/i.test(f.sha256) && Number.isInteger(f.size)}));
    const projected=[];
    for(const file of files) {
      const primary={kind:evidenceAliases[file.linked_type] || file.linked_type,id:file.linked_id,occurrence_id:file.occurrence_id};
      for(const link of [primary,...(file.relationships || [])]) {
        const spec=titles[link.kind];
        let recordId,subject=spec?.label,occurrenceId=null;
        if(link.kind==='framework_assessments') {
          const ref=lookup(link.kind,link.id,'framework_assessment_id'),program=sourceProgramKeys[ref?.framework_key];
          if(!ref || !program)continue;
          recordId=[sourceId,program,ref.definition_id].join('|');subject='Framework requirement';
        } else if(spec)recordId=sourceIdFor(link.kind,link.id,spec.key);
        if(!recordId)continue;
        if(link.kind==='reviews' && link.occurrence_id) {
          const occurrence=[...work.revs,...work.hist].find(r=>r.nativeOccurrenceId===link.occurrence_id && (r.id===recordId || r.reviewId===recordId));
          if(!occurrence)continue;
          occurrenceId=occurrence.occurrenceId;
        }
        const id=nativeKey(file,'evidence_id');
        if(projected.some(f=>f.id===id && f.recordId===recordId && f.kind===subject && f.occurrenceId===occurrenceId))continue;
        const referenceOnly=!library.nativeFiles.find(f=>f.id===file.evidence_id).available;
        projected.push({id,nativeId:file.evidence_id,clientId:sourceId,kind:subject,recordId,occurrenceId,
          name:file.display_name || file.filename,filename:file.filename,date:date(file.evidence_date || file.created_at),
          by:file.uploaded_by_name || people.get(file.uploaded_by) || '',type:file.source_evidence_type || file.evidence_type,
          meta:referenceOnly?'Reference only · '+(file.source_file_metadata || 'No file attached'):'v'+(file.version || 1)+' · '+(file.evidence_type || 'File'),
          fileAvailable:referenceOnly?false:true});
      }
    }
    view.files=[...(view.files || []).filter(file=>file.clientId!==sourceId),...projected.filter(f=>f.fileAvailable)];
    for(const row of [...work.revs,...work.acts,...work.done]) {
      const kind=row.kind==='rev'?'Review':'Action item';
      const links=projected.filter(f=>f.kind===kind && f.recordId===row.id && (kind!=='Review' || f.occurrenceId===row.occurrenceId));
      if(links.length || row.evidence?.some(e=>e.nativeId)) row.evidence=links;
    }
    if(view.itemExtra) {
      for(const key of Object.keys(view.itemExtra).filter(k=>k.startsWith(sourceId+'|')))
        view.itemExtra[key]=view.itemExtra[key].filter(e=>!e.nativeId);
      for(const f of projected.filter(e=>e.kind==='Framework requirement')) {
        const retained=view.itemExtra[f.recordId] ||= [];
        const duplicate=retained.findIndex(e=>e.id===f.id || e.name===f.name && e.by===f.by);
        if(duplicate<0)retained.push(f);else retained[duplicate]=f;
      }
    }
    const lines=files.map(file=>{
      const old=oldRows.get(file.source_record_id) || [];
      const kind=evidenceAliases[file.linked_type] || file.linked_type;
      const spec=titles[kind], linked=spec && lookup(kind,file.linked_id,spec.key);
      const assessment=kind==='framework_assessments' && lookup('framework_assessments',file.linked_id,'framework_assessment_id');
      const subject=spec?.label || (assessment ? 'Framework requirement' : file.source_subject_type || '');
      const recordedTitle=linked?.title || linked?.name;
      // A dated Review reference distinguishes a specific occurrence or recorded series.
      const title=assessment ? (file.source_subject_title || assessment.definition_id+' · '+(assessment.title || ''))
        : recordedTitle && spec?.label==='Review' && file.source_subject_title?.startsWith(recordedTitle+' ')
          ? file.source_subject_title : recordedTitle || file.source_subject_title || '';
      const stamp=/^(\d{4})-(\d\d)-(\d\d)/.exec(file.evidence_date || file.created_at || '');
      const dateLabel=stamp ? Number(stamp[2])+'/'+Number(stamp[3])+(stamp[1]==='2026'?'':'/'+stamp[1].slice(2)) : '';
      const meta=file.source_file_metadata || 'v'+(file.version || 1)+(Number.isFinite(file.size)?' · '+file.size+' B':'');
      const originalType=evidenceTypes[file.source_evidence_type] || 'Other';
      const type=originalType===file.evidence_type ? file.source_evidence_type || originalType : file.evidence_type;
      const cells=[file.display_name || file.filename,meta,type || 'Other',subject,title,
        file.source_link_count ?? (file.relationships || []).length,file.uploaded_by_name || people.get(file.uploaded_by) || file.uploaded_by_email || old[6] || '',dateLabel];
      // A native catalog supplies exact folder membership by evidence identity.
      // Keep renamed or same-name files distinct when the drawer reads this row.
      if(Array.isArray(records.evidenceCatalog))cells.push(file.source_file_origin||old[8]||'native-record',file.evidence_id);
      else if (file.source_file_origin || old[8]) cells.push(file.source_file_origin || old[8],file.source_record_id || file.evidence_id);
      else if (!file.source_record_id) cells.push('native-record',file.evidence_id);
      return cells.map(clean).join('^');
    });
    library.rows=lines.join('\n');
    library.files=files.length;
    if (library.folders) {
      const folderOf={'Framework requirement':'Frameworks','Action item':'Action Items',Review:'Reviews',Risk:'Risks',
        Policy:'Policies',Vendor:'Vendors','AI system':'AI Governance',Finding:'Findings'};
      const counts=Object.fromEntries(Object.keys(library.folders).map(name=>[name,0]));
      for (const line of lines) {
        const folder=folderOf[line.split('^')[3]] || 'Other';
        counts[folder]=(counts[folder] || 0)+1;
      }
      library.folders=counts;
    }
    overlayEvidenceSummary(view,records,ctx);
  }
}

/** Project a complete authorized native record set onto the caller's approved view. */
export function overlayApprovedV3Work(view,records,ctx={}) {
  if (!['reviews','findings','tasks','evidence'].every(key=>Array.isArray(records[key]))) {
    throw new Error('Reload the full native work register before projecting it into the portfolio.');
  }
  if (ctx.sourceId && ctx.clientId) overlayClientWork(view,records,ctx);
  else for (const client of records.clients || []) {
    if (client.source_client_id) overlayClientWork(view,records,{...ctx,sourceId:client.source_client_id,clientId:client.client_id});
  }
  return view;
}
