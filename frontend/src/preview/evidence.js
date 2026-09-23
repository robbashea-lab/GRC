import {evidenceKind,evidenceSources,sourceReference} from '../lib/evidenceReferences';
import {dateMatches} from '../lib/tableFilters';
import {occurrenceId,reviewView,assertCurrentOccurrence,belongsToOccurrence} from '../lib/reviewOccurrences';
import {audit,record} from './store';

export const areas={reviews:'Reviews',policies:'Policies',vendors:'Vendors',risks:'Risks',findings:'Findings',framework_assessments:'Frameworks',requirements:'Frameworks'};
export function evidenceReferences(db,e){
  const cid=e.client_id,kind=evidenceKind(e.linked_type),links=[...(kind?[{kind,id:e.linked_id,occurrence_id:e.occurrence_id,origin:'upload'}]:[]),...(e.relationships||[]).map(r=>({...r,origin:'supporting'}))];
  for(const v of db.vendors||[])if(v.client_id===cid&&(v.contract_evidence_ids?.includes(e.evidence_id)||v.assurance_records?.some(a=>a.evidence_ids?.includes(e.evidence_id))))links.push({kind:'vendors',id:v.vendor_id,origin:'module'});
  for(const p of db.policies||[])if(p.client_id===cid&&(p.approval_source?.evidence_id===e.evidence_id||p.approval_subject?.basis?.evidence_id===e.evidence_id||p.approval_history?.some(h=>h.subject?.basis?.evidence_id===e.evidence_id)))links.push({kind:'policies',id:p.policy_id,origin:'module'});
  for(const a of db.framework_assessments||[])if(a.client_id===cid&&a.related_links?.some(l=>l.kind==='evidence'&&l.id===e.evidence_id)&&!a.unlinked_evidence_ids?.includes(e.evidence_id))links.push({kind:'framework_assessments',id:a.framework_assessment_id,origin:'module'});
  const refs=[];
  for(const link of links){
    const spec=evidenceSources[link.kind];if(!spec)continue;
    const parent=(db[link.kind]||[]).find(r=>r.client_id===cid&&r[spec.key]===link.id),ref={...sourceReference(link.kind,parent,link.id,link.occurrence_id),origin:link.origin};
    if(parent&&link.kind==='framework_assessments')ref.framework_key=parent.framework_key;
    if(parent&&link.kind==='policies')ref.document_context=parent.approval_source?.evidence_id===e.evidence_id?'Current approval document':parent.approval_history?.some(h=>h.subject?.basis?.evidence_id===e.evidence_id)?'Previous approval document':'Supporting document';
    ref.module_owned=links.some(r=>r.kind===ref.kind&&r.id===ref.id&&r.origin==='module');refs.push(ref);
    if(parent&&link.kind==='reviews'){
      const occurrence=parent.occurrences?.find(o=>o.occurrence_id===ref.occurrence_id)||parent;ref.year=(occurrence.due_date||'').slice(0,4);
      if(occurrence.framework_key)ref.framework_key=occurrence.framework_key;
      for(const [k,field] of [['vendors','vendor_id'],['policies','policy_id'],['risks','risk_id']]){
        const related=(db[k]||[]).find(r=>r.client_id===cid&&r[field]===occurrence[field]);
        if(related)refs.push({...sourceReference(k,related),origin:'review_context'});
      }
    }
  }
  const priority={upload:0,module:1,supporting:2,review_context:3},unique=new Map();
  refs.sort((a,b)=>priority[a.origin]-priority[b.origin]).forEach(r=>{const key=JSON.stringify([r.kind,r.id,r.occurrence_id]);if(!unique.has(key))unique.set(key,r);});return [...unique.values()];
}

export const evidenceAccess=(user,cid)=>user.role==='super_admin'||user.role==='platform_admin'&&!user.client_ids?.length||user.client_ids?.includes(cid);
export function evidencePage(db,params){
  const cid=params.client_id;
  if(!evidenceAccess(db.user,cid))throw new Error('Forbidden for this client');
  const kinds=Object.fromEntries(Object.entries(evidenceSources).map(([k,s])=>[k,new Map((db[k]||[]).filter(r=>r.client_id===cid).map(r=>[r[s.key],r]))]));
  const rootKind=evidenceKind(params.entity_type),root=rootKind&&kinds[rootKind].get(params.entity_id);
  if(params.entity_type&&!root)throw new Error('Source not found for this client.');
  const oid=rootKind==='reviews'?(params.occurrence_id||occurrenceId(root)):null;
  if(oid&&oid!==occurrenceId(root)&&!root.occurrences?.some(o=>o.occurrence_id===oid))throw new Error('Review occurrence not found');
  const state=JSON.parse(params.state||'{}'),page=Number(params.page)||1,size=Math.min(100,Number(params.page_size)||25),query=(params.q||'').trim().toLowerCase();
  const today=params.today?new Date(params.today+'T12:00:00'):new Date();
  const dates=['created_at','evidence_date','effective_date'];
  const facets=Object.fromEntries(['mime_type','uploaded_by_email','linked_type','program_areas','evidence_type','years','frameworks','refresh_status'].map(k=>[k,new Set()])),counts={};let facets_limited=false;
  let rows=(db.evidence||[]).filter(e=>e.client_id===cid).map(e=>{
    const kind=evidenceKind(e.linked_type),source=kinds[kind]?.get(e.linked_id),finding=kind==='findings'?source:kinds.findings.get(source?.finding_id),review=kind==='reviews'?source:kinds.reviews.get(source?.review_id||finding?.review_id);
    const occurrence=(kind==='reviews'?e.occurrence_id:source?.occurrence_id||finding?.occurrence_id)||(review?'occ_'+review.review_id:null);
    const context={source:kind?sourceReference(kind,source,e.linked_id,occurrence):null,finding:finding?sourceReference('findings',finding):null,review:review?sourceReference('reviews',review,null,occurrence):null};
    const references=evidenceReferences(db,e);
    const person=db.users.find(u=>u.user_id===e.uploaded_by&&evidenceAccess(u,cid)),email=e.uploaded_by_email||person?.email||'';
    let category=!root?'library':null;
    if(root){
      if(kind===rootKind&&e.linked_id===params.entity_id&&(kind!=='reviews'||occurrence===oid))category='direct';
      else if(source&&rootKind==='findings'){
        if(kind==='tasks'&&source.finding_id===root.finding_id)category='actions';
        if(kind==='reviews'&&source.review_id===root.review_id&&occurrence===(root.occurrence_id||'occ_'+root.review_id))category='review';
      }else if(source&&rootKind==='reviews'&&['tasks','findings'].includes(kind)&&review?.review_id===root.review_id&&occurrence===oid)category=kind==='tasks'?'actions':'findings';
      else if(source&&rootKind==='risks'&&kind==='tasks'&&(source.risk_id===root.risk_id||root.related_task_ids?.includes(source.task_id)))category='treatment';
      else if(source&&rootKind==='vendors'&&kind==='reviews'&&source.vendor_id===root.vendor_id)category='review';
    }
    if(root&&references.some(r=>r.available&&r.kind===rootKind&&r.id===params.entity_id&&(rootKind!=='reviews'||r.occurrence_id===oid)))category='direct';
    const retained=(kind==='reviews'&&review?.occurrences?.some(o=>o.occurrence_id===occurrence&&o.evidence?.some(x=>x.evidence_id===e.evidence_id)))||(rootKind==='reviews'&&root.occurrences?.some(o=>o.occurrence_id===oid&&o.evidence?.some(x=>x.evidence_id===e.evidence_id)))||(rootKind==='policies'&&references.some(r=>r.kind==='policies'&&r.id===root.policy_id&&r.module_owned));
    if(e.archived_at&&(!root||!retained))category=null;
    const {content_base64,...metadata}=e;
    const program_areas=[...new Set(references.filter(r=>r.available).map(r=>areas[r.kind]||'Other'))],refresh=[e.expiration_date,e.refresh_date].filter(Boolean).sort()[0],cutoff=new Date(today);cutoff.setDate(cutoff.getDate()+30);
    return {...metadata,context,category,references,program_areas:program_areas.length?program_areas:['Unassigned'],evidence_type:e.evidence_type||'Other',display_name:e.display_name||e.filename,years:references.some(r=>r.kind==='reviews')?[...new Set(references.filter(r=>r.available&&r.year).map(r=>r.year))]:[e.evidence_date||e.effective_date||e.created_at].filter(Boolean).map(d=>d.slice(0,4)),frameworks:[...new Set(references.filter(r=>r.available&&r.framework_key).map(r=>r.framework_key))],refresh_status:!refresh?'Not set':refresh<today.toISOString().slice(0,10)?'Expired / refresh overdue':refresh<=cutoff.toISOString().slice(0,10)?'Due in 30 days':'Current',uploaded_by_email:email,uploader:person?.name||email||'Unknown uploader'};
  }).filter(r=>r.category);
  const unfiltered_total=rows.length,program_counts={};rows.forEach(r=>r.program_areas.forEach(a=>{program_counts[a]=(program_counts[a]||0)+1;}));
  rows.forEach(r=>{counts[r.category]=(counts[r.category]||0)+1;Object.entries(facets).forEach(([k,set])=>{for(const value of Array.isArray(r[k])?r[k]:[r[k]])if(value&&!set.has(value)){if(set.size<200)set.add(value);else facets_limited=true;}});});
  rows=rows.filter(r=>{
    const text=[r.filename,r.display_name,r.evidence_type,r.uploader,r.uploaded_by_email,...r.years,...[...Object.values(r.context),...r.references].filter(v=>v?.available).flatMap(v=>[v.title,v.period,v.label,v.id,v.display_id,v.year,v.framework_key])].filter(Boolean).join(' ').toLowerCase();
    return text.includes(query)&&Object.entries(state.filters||{}).every(([k,values])=>!values.length||!(k in facets||dates.includes(k))||values.some(v=>dates.includes(k)?dateMatches(r[k],v,today):v==='__empty__'?!r[k]:Array.isArray(r[k])?r[k].includes(v):r[k]===v));
  });
  const key=['filename','mime_type','uploaded_by_email','linked_type',...dates].includes(state.sort?.key)?state.sort.key:'created_at',direction=state.sort?.dir==='asc'?1:-1;
  const sortValues=new Map(db.evidence.filter(e=>e.client_id===cid).map(e=>[e.evidence_id,e[key]||'']));
  rows.sort((a,b)=>String(sortValues.get(a.evidence_id)).localeCompare(String(sortValues.get(b.evidence_id)))*direction||a.evidence_id.localeCompare(b.evidence_id));
  return {items:rows.slice((page-1)*size,page*size),total:rows.length,unfiltered_total,page,page_size:size,facets:Object.fromEntries(Object.entries(facets).map(([k,set])=>[k,[...set].sort()])),facets_limited,counts,program_counts};
}

export function evidenceLibraryRequest(db,method,parts,params,body){
  const [,surface,id,action]=parts;
  if(surface==='sources'){
    if(!evidenceAccess(db.user,params.client_id))throw Error('Forbidden');
    const spec=evidenceSources[params.kind];if(!spec)throw Error('Unsupported source');
    const q=(params.q||'').toLowerCase(),page=Number(params.page)||1;
    const rows=(db[params.kind]||[]).filter(r=>r.client_id===params.client_id&&[r.title,r.name,r.display_id,r.definition_id,r.framework_key].filter(Boolean).join(' ').toLowerCase().includes(q)).sort((a,b)=>a[spec.key].localeCompare(b[spec.key]));
    return {items:rows.slice((page-1)*25,page*25).map(r=>sourceReference(params.kind,r,null,params.kind==='reviews'?occurrenceId(r):null)),total:rows.length,page,page_size:25};
  }
  if(surface==='reviews'){
    const review=record(db,'reviews',id);if(!evidenceAccess(db.user,review.client_id))throw Error('Forbidden');
    if(action==='set-records'){
      if(params.occurrence_id!==occurrenceId(review)&&!review.occurrences?.some(o=>o.occurrence_id===params.occurrence_id))throw Error('Occurrence not found');
      const page=Number(params.page)||1;return Object.fromEntries(['findings','tasks'].map(kind=>{const rows=(db[kind]||[]).filter(r=>r.client_id===review.client_id&&r.review_id===id&&belongsToOccurrence(r,review,params.occurrence_id));return [kind,{total:rows.length,items:rows.slice((page-1)*25,page*25).map(r=>sourceReference(kind,r))}];}));
    }
    let rows=[...(review.occurrences||[])];if(!rows.some(o=>o.occurrence_id===occurrenceId(review)))rows.push({...reviewView(review),occurrence_id:occurrenceId(review)});
    const years=[...new Set(rows.map(o=>o.due_date?.slice(0,4)).filter(Boolean))].sort().reverse(),page=Number(params.page)||1;
    if(params.year)rows=rows.filter(o=>o.due_date?.startsWith(params.year));rows.sort((a,b)=>(b.due_date||'').localeCompare(a.due_date||''));
    return {title:review.title,years,items:rows.slice((page-1)*25,page*25).map(o=>Object.fromEntries([...['occurrence_id','period','status','due_date','completed_at','completed_by_name','outcome','finding_count'].map(k=>[k,o[k]]),['evidence_count',o.status==='completed'?o.evidence?.length||0:null]])),total:rows.length,page,page_size:25};
  }
  const e=record(db,'evidence',id);if(!evidenceAccess(db.user,e.client_id))throw Error('Forbidden');
  const detail=()=>{const {content_base64,...data}=e;const references=evidenceReferences(db,e),program_areas=[...new Set(references.filter(r=>r.available).map(r=>areas[r.kind]||'Other'))];return {...data,references,program_areas:program_areas.length?program_areas:['Unassigned']};};
  if(method==='get'){
    if(action==='activity'){const rows=db.logs.filter(r=>r.client_id===e.client_id&&((r.entity_id===id&&r.entity_type==='evidence')||(r.entity_type==='framework_assessments'&&r.meta?.kind==='evidence'&&r.meta?.id===id))),page=Number(params.page)||1;return {items:rows.slice((page-1)*25,page*25),total:rows.length,page,page_size:25};}
    return detail();
  }
  if(!['super_admin','platform_admin','client_contributor'].includes(db.user.role))throw Error('Read-only role');
  if(e.archived_at)throw Error('Archived Evidence cannot be changed');
  if(!Object.prototype.hasOwnProperty.call(body,'expected_updated_at')||(body.expected_updated_at||null)!==(e.updated_at||null))throw Error('Evidence changed; reload before saving');
  if(action==='relationships'){
    const kind=evidenceKind(body.linked_type);if(!kind)throw Error('Unsupported source');const parent=record(db,kind,body.linked_id);
    if(parent.client_id!==e.client_id)throw Error('Evidence relationships must stay in the same client');
    if(kind==='framework_assessments')throw Error('Manage framework relationships through the framework assessment');
    if(body.remove&&kind==='policies'&&(parent.approval_source?.evidence_id===id||parent.approval_subject?.basis?.evidence_id===id||parent.approval_history?.some(h=>h.subject?.basis?.evidence_id===id)))throw Error('Policy approval document relationships are retained in Policies');
    if(body.remove&&['risks','tasks','vendors','ai_systems'].includes(kind)&&['closed','retired','done','inactive','terminated'].includes(parent.status))throw Error('Historical Evidence relationships must be retained');
    if(kind==='reviews')assertCurrentOccurrence(parent,body.occurrence_id);
    else if(body.occurrence_id)throw Error('Only Reviews have occurrence relationships');
    if(evidenceKind(e.linked_type)===kind&&e.linked_id===body.linked_id&&(kind!=='reviews'||(e.occurrence_id||'occ_'+e.linked_id)===body.occurrence_id)){if(body.remove)throw Error('Original upload provenance is retained');return detail();}
    const link={kind,id:body.linked_id,occurrence_id:body.occurrence_id||null},same=r=>r.kind===kind&&r.id===link.id&&(r.occurrence_id||null)===link.occurrence_id;
    e.relationships=e.relationships||[];if(!body.remove&&!e.relationships.some(same)){if(e.relationships.length>=100)throw Error('Too many relationships');e.relationships.push(link);}else if(body.remove)e.relationships=e.relationships.filter(r=>!same(r));
    audit(db,body.remove?'Evidence relationship removed':'Evidence relationship added','evidence',e,link);
  }else if(method==='patch'){
    const allowed=['display_name','evidence_type','evidence_date','effective_date','expiration_date','refresh_date','notes'];
    for(const key of allowed)if(key in body)e[key]=body[key];audit(db,'Evidence metadata changed','evidence',e);
  }else throw Error('Unsupported Evidence action');
  e.updated_at=new Date(Math.max(Date.now(),Date.parse(e.updated_at||0)+1||0)).toISOString();return detail();
}
