// Offline conversion of the approved fictional clients. The source contains register
// summaries, not signed artifacts, completed screenings or decisions by named people.
const RISK_STATES = {'Open':'open','Identified':'identified','Assessed':'assessed','Escalated':'escalated',
  'In treatment':'in_progress', 'Accepted':'accepted', 'Closed':'closed'};
const POLICY_STATES = {'Approved':'approved', 'Pending approval':'in_review', 'Draft':'draft', 'Needs creation':'needs_creation',
  'Reported existing':'needs_verification','Needs confirmation':'needs_verification','Rejected':'draft'};
const AI_APPROVAL = {'Approved':'approved', 'Approved with conditions':'approved_with_conditions','Not approved':'not_approved',
  'Pending assessment':'pending_assessment', 'Approval not recorded':null};
const CADENCE = {'':'annual', 'Q':'quarterly', 'M':'monthly', 'S':'semiannual', '1':'none'};
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

function mapped(map, value) {
  if (!Object.hasOwn(map, value)) throw new Error('Unsupported approved register value: '+value);
  return map[value];
}

function day(value) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new Error('Invalid approved register date');
  }
  return text.slice(0, 10);
}

function approvalDay(value) {
  if (!value) return null;
  if (value instanceof Date || /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return day(value);
  // The source Policy drawer explicitly renders these month/day labels in 2026.
  const [, monthName, date] = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(value) || [];
  const month = MONTHS.indexOf(monthName) + 1;
  const result = '2026-'+String(month).padStart(2, '0')+'-'+String(date).padStart(2, '0');
  if (!month || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0,10) !== result) {
    throw new Error('Invalid approved policy date: '+value);
  }
  return result;
}

function cadence(review) {
  if (!review) return {value:null};
  const custom = /^D:(\d+)$/.exec(review.cad);
  return custom ? {value:'custom', custom_recurrence_days:Number(custom[1])} : {value:mapped(CADENCE, review.cad)};
}

function riskRecord(row, review, ctx) {
  const ratings=[row.L,row.I];
  const score=ratings.every(n=>n!=null)?row.L*row.I:null;
  if (!ratings.every(n=>n==null||Number.isInteger(n) && n>=1 && n<=5) || (row.score??null)!==score) {
    throw new Error('Approved risk score disagrees with its assessment: '+row.wfId);
  }
  const schedule = cadence(review);
  return {risk_id:ctx.recordId('risks',row.wfId), source_record_id:row.wfId,
    client_id:ctx.clientId, display_id:row.id, title:row.title,
    owner_id:ctx.userId(row.owner), source_owner_name:row.owner, status:mapped(RISK_STATES,row.st), accepted:row.st==='Accepted',
    treatment:row.st==='Accepted'?'accept':row.st==='In treatment'?'mitigate':null,
    likelihood_score:row.L, impact_score:row.I, risk_score:score,
    risk_level:score==null?null:score>=15?'critical':score>=10?'high':score>=5?'moderate':'low',
    last_reviewed:day(row.last), next_review:day(row.next), review_cadence:schedule.value,
    ...(schedule.custom_recurrence_days && {custom_recurrence_days:schedule.custom_recurrence_days}),
    ...(review && {linked_review_id:ctx.recordId('reviews',review.id)})};
}

function policyRecord(row, ctx) {
  const missing = row.st==='Needs creation';
  const unconfirmed = row.st==='Needs confirmation';
  const baselineKey = ctx.policyBaselineKey(row.name);
  return {policy_id:ctx.recordId('policies',row.wfId), source_record_id:row.wfId, client_id:ctx.clientId, title:row.name,
    ...(baselineKey && {baseline_key:baselineKey, baseline_response:missing?'no':unconfirmed?'unsure':'yes'}),
    category:row.cat, status:mapped(POLICY_STATES,row.st), version:row.ver==='—'?null:row.ver || null,
    ...(typeof row.description==='string' && {summary:row.description}),
    owner_id:ctx.userId(row.owner), source_owner_name:row.owner,
    presence:missing?'reported_missing':unconfirmed?'needs_confirmation':'reported_existing', approved_at:approvalDay(row.appr),
    last_reviewed_at:day(row.last), next_review_date:day(row.next),
    // Some source mappings are outside this client's chosen scope; they are references only.
    source_framework_references:[...row.map], source_additional_mapping_count:row.extra || 0,
    ...(row.revId && {linked_review_id:ctx.recordId('reviews',row.revId)})};
}

function assuranceRecord(row, ctx) {
  if (!row.asr) return [];
  const type = {'Security questionnaire':'Security Questionnaire','SOC 2 Type 2 report':'SOC 2'}[row.asr] || 'Other';
  return [{assurance_id:ctx.recordId('vendor_assurance',row.wfId), type, document_name:row.asr,
    next_follow_up:day(row.follow), evidence_ids:[],
    // Native reviewed assurance requires an actual reviewer and review date. The
    // source supplies a status label only. Keep the report without certifying it.
    ...(row.asrSt==='Requested' && {review_status:'requested'}),
    ...(row.asrSt && {source_review_status:row.asrSt, notes:'Source register status: '+row.asrSt})}];
}

function vendorRecord(row, review, ctx) {
  const schedule = cadence(review);
  const record = {vendor_id:ctx.recordId('vendors',row.wfId), source_record_id:row.wfId, client_id:ctx.clientId, name:row.name,
    service:row.desc, criticality:row.crit==='Moderate'?'medium':row.crit.toLowerCase(),
    business_owner_id:ctx.userId(row.owner), owner_id:ctx.userId(row.owner), source_owner_name:row.owner,
    status:row.st?mapped({'Active':'active','Onboarding':'onboarding','Under review':'under_review','Offboarding':'offboarding','Offboarded':'inactive'},row.st):'active',
    data_types:[...(row.access||[])], next_review:day(row.next), review_frequency:schedule.value,
    ...(schedule.custom_recurrence_days && {custom_recurrence_days:schedule.custom_recurrence_days}),
    contract_renewal:day(row.renew), contract_notice_deadline:day(row.notice),
    assurance_records:assuranceRecord(row,ctx), related_risk_ids:[],
    ...(row.asrSt==='Requested' && {assurance_status:'requested'}),
    ...(row.addedOn && {created_at:row.addedOn}), ...(row.critProvisional && {criticality_provisional:true}),
    ...(row.auto==='svc' && {catalog_key:'iventure-solutions'})};
  if (row.rating) {
    const rating = r=>({level:r.lvl, at:r.at, by_name:r.by, rationale:r.why, source:r.src});
    record.source_risk_rating = rating(row.rating);
    record.source_risk_rating_history = (row.ratingHist || []).map(rating);
  }
  return record;
}

function aiRecords(rows, risks, ctx) {
  const explicit = rows.map(row=>row.rev?.title?.match(/\bAI-\d+\b/)?.[0] || null);
  const used = explicit.filter(Boolean);
  if (new Set(used).size!==used.length) throw new Error('Duplicate AI display ID in '+ctx.sourceId);
  let sequence = Math.max(0,...used.map(id=>Number(id.slice(3))));
  return rows.map((row,i)=>{
    const hasRisk=row.risk && row.risk!=='—';
    const linked = hasRisk ? risks.find(r=>r.display_id===row.risk) : null;
    if (hasRisk && !linked) throw new Error('Unresolved AI Risk: '+row.risk+' in '+ctx.sourceId);
    // The native unique key requires a display number even for source AI rows without one.
    const displayId = explicit[i] || 'AI-'+String(++sequence).padStart(3,'0');
    return {ai_system_id:ctx.recordId('ai_systems',row.wfId), source_record_id:row.wfId, client_id:ctx.clientId, display_id:displayId,
      ai_name_key:row.name.trim().toLowerCase(), name:row.name, provider:row.prov, description:row.purpose,
      status:row.st==='Retired'?'retired':'active', approval_status:row.st==='Retired'?null:mapped(AI_APPROVAL,row.st),
      owner_id:ctx.userId(row.owner), source_owner_name:row.owner,
      source_screening_tier:row.tier, governance_notes:'Source register screening tier: '+row.tier,
      purposes:[], data_types:[], permitted_data_types:[], access:[], roles:[], risk_topics:[], screening:{},
      related_links:linked?[{kind:'risks',id:linked.risk_id,classification:'Context',source:'',rationale:''}]:[],
      ...(row.rev?.id && {linked_review_id:ctx.recordId('reviews',row.rev.id)})};
  });
}

export function serviceFormFields(row) {
  const areas = {};
  for (const [id, area] of Object.entries(row.areas)) {
    areas[id] = {responsibility:area.resp, tool_ids:[...area.tools]};
  }
  return {preset:row.preset, areas, custom_tools:row.custom.map(tool=>({
    tool_id:tool.id, name:tool.n, vendor:tool.v || '', category:'custom', area_ids:[...tool.a],
    description:tool.what || '', capabilities:[...(tool.cov || [])], gaps:[...(tool.gap || [])],
    possible_records:[...(tool.ev || [])], verification_hints:[...(tool.ver || [])], retired:false
  }))};
}

function servicesRecord(row, program, ctx) {
  const provider = program.vendors.find(v=>v.auto==='svc' && v.name==='iVenture Solutions');
  const tickets={};
  for (const [id,area] of Object.entries(row.areas)) {
    if (area.ticket || area.cad) tickets[id] = {summary:area.ticket, cadence:area.cad};
  }
  return {...serviceFormFields(row),exclusions:{},source_area_ticket_references:tickets,
    ...(provider && {provider_vendor_id:ctx.recordId('vendors',provider.wfId)})};
}

export function appendApprovedV3Registers(db, source, ctx) {
  const {sourceId,clientId} = ctx;
  const client = db.clients.find(row=>row.client_id===clientId);
  if (!client) throw new Error('Missing native client for '+sourceId);
  const program = source.programs[sourceId], reviews = source.work[sourceId].revs;
  const linkedReview = (kind,row)=>reviews.find(r=>r.link?.kind===kind && r.link.id===row.wfId && (r.link.purpose || 'review')==='review');
  const risks = program.risks.map(r=>riskRecord(r,linkedReview('risk',r),ctx));
  const policies = program.pols.map(r=>policyRecord(r,ctx));
  const vendors = program.vendors.map(r=>vendorRecord(r,linkedReview('vendor',r),ctx));
  const records = {risks,policies,vendors,ai_systems:aiRecords(source.records[sourceId].ai,risks,ctx)};
  const serviceProfile = source.services?.[sourceId];
  const services = serviceProfile ? servicesRecord(serviceProfile,program,ctx) : null;
  // Conversion owns fresh, namespaced fixture collections. Never merge over existing records.
  for (const [kind,rows] of Object.entries(records)) {
    const field = {risks:'risk_id',policies:'policy_id',vendors:'vendor_id',ai_systems:'ai_system_id'}[kind];
    const ids = new Set(rows.map(r=>r[field]));
    if (ids.size!==rows.length || (db[kind] || []).some(r=>r.client_id===clientId || ids.has(r[field]))) {
      throw new Error('Approved register identity already present: '+kind+' / '+clientId);
    }
  }
  for (const [kind,rows] of Object.entries(records)) (db[kind] ||= []).push(...rows);
  if (services) client.profile = {...client.profile, services};
  const assessments = new Map((db.framework_assessments || []).filter(r=>r.client_id===clientId)
    .map(r=>[r.framework_assessment_id,r]));
  // A saved empty relation list overrides inherited native catalog suggestions.
  // The source includes an explicit map for every policy, including empty maps.
  for (const row of assessments.values()) row.policy_link_ids ||= [];
  for (const policy of policies) for (const ref of policy.source_framework_references) {
    const row = assessments.get(ctx.assessmentId(ref));
    if (row) row.policy_link_ids = [...new Set([...(row.policy_link_ids || []),policy.policy_id])];
  }
}

const label = value => typeof value==='string' && value ? value[0].toUpperCase()+value.slice(1).replaceAll('_',' ') : '';
const inverse = map=>Object.fromEntries(Object.entries(map).filter(([,value])=>value!==null).map(([key,value])=>[value,key]));
const riskLabels = inverse(RISK_STATES), policyLabels = {...inverse(POLICY_STATES),draft:'Draft'}, aiLabels = inverse(AI_APPROVAL);

function displayDate(value, calendarDay=false) {
  if (!value) return null;
  // Native date-only fields represent a local calendar day, not midnight UTC.
  const pattern = calendarDay ? /^(\d{4})-(\d\d)-(\d\d)(?:T00:00:00(?:\.0+)?(?:Z|[+]00:00))?$/ : /^(\d{4})-(\d\d)-(\d\d)$/;
  const match = typeof value==='string' && pattern.exec(value);
  const result = match ? new Date(+match[1],+match[2]-1,+match[3]) : new Date(value);
  return Number.isFinite(result.getTime()) ? result : null;
}

function displayOwner(row, ownerId, ctx) {
  if (ownerId) return ctx.userName(ownerId) || 'Owner unavailable';
  return !row.updated_at && row.source_owner_name ? row.source_owner_name : 'Unassigned';
}

function overlayRows(nativeRows, prior, idField, ctx, update) {
  const originals = new Map(prior.map(row=>[row.wfId,row]));
  return nativeRows.filter(row=>row.client_id===ctx.clientId && !row.archived_at && !row.archived).map(row=>{
    const key = row.source_record_id || row[idField];
    const original = originals.get(key) || {revision:0};
    return {...original, wfId:key, ...update(row,original)};
  });
}

function displayApprovalDate(value) {
  const date = displayDate(value);
  if (!date) return '';
  // The reference appends the demo year to month/day. Keep later years explicit.
  return date.getFullYear()===2026 ? MONTHS[date.getMonth()]+' '+date.getDate() : day(value);
}

export function overlayApprovedV3Registers(state, nativeRecords, ctx) {
  const {sourceId,clientId} = ctx;
  const client = nativeRecords.clients?.find(c=>c.client_id===clientId);
  if (!client || (client.source_client_id && client.source_client_id!==sourceId)) {
    throw new Error('Approved register refresh does not belong to this client');
  }
  const program = state.programs[sourceId], inventory = state.records[sourceId];
  const reviews = (nativeRecords.reviews || []).filter(r=>r.client_id===clientId && !['completed','cancelled'].includes(r.status));
  const work = new Map((state.work[sourceId]?.revs || []).map(r=>[r.id,r]));
  const currentReview = (field,id)=>reviews.filter(r=>r[field]===id || (field==='policy_id' && r.policy_ids?.includes(id)))
    .sort((a,b)=>(a.due_date || '9999').localeCompare(b.due_date || '9999'))[0];
  const workId = review=>review?.source_record_id || review?.review_id || null;
  const scoped = (nativeRecords.framework_assessments || []).filter(r=>r.client_id===clientId && Array.isArray(r.policy_link_ids));
  const scopedRefs = new Set(scoped.map(a=>a.definition_id));
  if (nativeRecords.risks) program.risks=overlayRows(nativeRecords.risks,program.risks,'risk_id',ctx,r=>{
    const score = [r.likelihood_score,r.impact_score].every(n=>Number.isInteger(n) && n>=1 && n<=5)
      ? r.likelihood_score*r.impact_score : null;
    const acceptance = r.acceptance_date || r.acceptance_rationale || r.acceptance_expires_at ? {
      by:r.accepted_by ? ctx.userName(r.accepted_by) || 'Owner unavailable' : '', at:displayDate(r.acceptance_date),
      exp:displayDate(r.acceptance_expires_at,true), why:r.acceptance_rationale || ''} : null;
    return {id:r.display_id || r.risk_id,title:r.title,owner:displayOwner(r,r.owner_id,ctx),
      st:r.status==='retired'?'Closed':riskLabels[r.status] || label(r.status),
      L:r.likelihood_score ?? null,I:r.impact_score ?? null,score,description:r.description ?? '',
      strategy:label(r.treatment),acceptance,closedOn:displayDate(r.closed_at),closeWhy:r.closure_note || '',
      next:displayDate(r.next_review,true),last:displayDate(r.last_reviewed)};
  });
  if (nativeRecords.policies) program.pols=overlayRows(nativeRecords.policies,program.pols,'policy_id',ctx,(p,original)=>{
    const refs = p.source_framework_references || original.map || [];
    const linked = scoped.filter(a=>a.policy_link_ids.includes(p.policy_id)).map(a=>a.definition_id);
    const map = [...new Set([...refs.filter(ref=>!scopedRefs.has(ref) || linked.includes(ref)),...linked])];
    return {name:p.title,cat:p.category || '',map,extra:p.source_additional_mapping_count ?? original.extra ?? 0,
      st:p.status==='needs_verification'&&p.presence==='reported_existing'?'Reported existing':policyLabels[p.status] || label(p.status),
      ver:p.version || (original.onbAns?'—':''),owner:displayOwner(p,p.owner_id,ctx),
      ...(Object.hasOwn(p,'summary') && {description:p.summary || ''}),
      appr:displayApprovalDate(p.approved_at),last:displayDate(p.last_reviewed_at),next:displayDate(p.next_review_date,true),
      revId:workId(currentReview('policy_id',p.policy_id))};
  });
  if (nativeRecords.vendors) program.vendors=overlayRows(nativeRecords.vendors,program.vendors,'vendor_id',ctx,(v,original)=>{
    const live = (v.assurance_records || []).filter(a=>!a.superseded_by);
    const entry = live.find(a=>(a.document_name || a.type)===original.asr) || live[0] || {};
    const nativeStatus = {inactive:'Offboarded',terminated:'Offboarded',onboarding:'Onboarding',under_review:'Under review',offboarding:'Offboarding'}[v.status];
    const rating = r=>r && {lvl:r.level,at:displayDate(r.at),by:r.by_name,why:r.rationale,src:r.source};
    return {name:v.name,desc:v.service || v.services || '',crit:v.criticality==='medium'?'Moderate':label(v.criticality),
      owner:displayOwner(v,v.business_owner_id,ctx),access:[...(v.data_types || [])],st:nativeStatus || '',
      critProvisional:!!v.criticality_provisional,asr:entry.document_name || entry.type || '',
      asrSt:label(entry.review_status) || entry.source_review_status || '',follow:displayDate(entry.next_follow_up,true),
      asrPeriod:displayDate(entry.coverage_end,true),renew:displayDate(v.contract_renewal,true),
      notice:displayDate(v.contract_notice_deadline,true),expires:displayDate(v.contract_expiration || v.contract_end,true),
      next:displayDate(v.next_review,true),last:displayDate(v.last_review),
      ...(Object.hasOwn(v,'source_risk_rating') && {rating:rating(v.source_risk_rating),
        ratingHist:(v.source_risk_rating_history || []).map(rating)}),
      ...(Object.hasOwn(v,'assurance_required') && {assuranceRequired:v.assurance_required,
        assuranceTypes:live.filter(a=>a.required!==false).map(a=>a.document_name || a.type)})};
  });
  if (nativeRecords.ai_systems) inventory.ai=overlayRows(nativeRecords.ai_systems,inventory.ai,'ai_system_id',ctx,a=>{
    const riskId = a.related_links?.find(link=>link.kind==='risks')?.id;
    const risk = riskId && nativeRecords.risks?.find(r=>r.client_id===clientId && r.risk_id===riskId);
    const reviewId = workId(currentReview('ai_system_id',a.ai_system_id));
    const hasScreening = !!a.onboarding_screening || Object.values(a.screening || {}).some(value=>typeof value==='boolean');
    const tier = hasScreening ? label(a.risk_tier) : a.source_screening_tier || label(a.risk_tier);
    return {name:a.name,prov:a.provider || '',purpose:a.description || '',tier:tier || 'Not assessed',
      st:a.status==='retired'?'Retired':aiLabels[a.approval_status] || 'Approval not recorded',owner:displayOwner(a,a.owner_id,ctx),
      ...(a.approval_history?.length && {cond:a.approval_history.at(-1).note||''}),
      risk:risk?.display_id || null, rev:work.get(reviewId) || null};
  });
  const services = client.profile?.services;
  if (services) {
    state.services ||= {};
    const prior = state.services[sourceId] || {areas:{},custom:[]};
    const oldTools = new Map(prior.custom.map(t=>[t.id,t]));
    const areas = {};
    for (const [id,area] of Object.entries(services.areas || {})) {
      const ticket = services.source_area_ticket_references?.[id];
      areas[id] = {...prior.areas[id],resp:area.responsibility,tools:[...(area.tool_ids || [])],
        ticket:ticket?.summary || '',cad:ticket?.cadence || ''};
    }
    state.services[sourceId] = {...prior,preset:services.preset,areas,custom:(services.custom_tools || []).map(t=>({
      ...oldTools.get(t.tool_id),id:t.tool_id,n:t.name,v:t.vendor || '',a:[...(t.area_ids || [])],g:'custom',
      what:t.description || '',cov:[...(t.capabilities || [])],gap:[...(t.gaps || [])],
      ev:[...(t.possible_records || [])],ver:[...(t.verification_hints || [])]}))};
  } else if (state.services) delete state.services[sourceId];
  return state;
}
