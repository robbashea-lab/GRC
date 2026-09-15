import {evidenceKind,evidenceSources,sourceReference} from '../lib/evidenceReferences';
import {dateMatches} from '../lib/tableFilters';
import {occurrenceId} from '../lib/reviewOccurrences';

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
  const facets={mime_type:new Set(),uploaded_by_email:new Set(),linked_type:new Set()},counts={};let facets_limited=false;
  let rows=(db.evidence||[]).filter(e=>e.client_id===cid).map(e=>{
    const kind=evidenceKind(e.linked_type),source=kinds[kind]?.get(e.linked_id),finding=kind==='findings'?source:kinds.findings.get(source?.finding_id),review=kind==='reviews'?source:kinds.reviews.get(source?.review_id||finding?.review_id);
    const occurrence=(kind==='reviews'?e.occurrence_id:source?.occurrence_id||finding?.occurrence_id)||(review?'occ_'+review.review_id:null);
    const context={source:kind?sourceReference(kind,source,e.linked_id,occurrence):null,finding:finding?sourceReference('findings',finding):null,review:review?sourceReference('reviews',review,null,occurrence):null};
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
    const retained=kind==='reviews'&&review?.occurrences?.some(o=>o.occurrence_id===occurrence&&o.evidence?.some(x=>x.evidence_id===e.evidence_id));
    if(e.archived_at&&(!root||!retained))category=null;
    const {content_base64,...metadata}=e;
    return {...metadata,context,category,uploaded_by_email:email,uploader:person?.name||email||'Unknown uploader'};
  }).filter(r=>r.category);
  const unfiltered_total=rows.length;
  rows.forEach(r=>{counts[r.category]=(counts[r.category]||0)+1;Object.entries(facets).forEach(([k,set])=>{if(r[k]&&!set.has(r[k])){if(set.size<200)set.add(r[k]);else facets_limited=true;}});});
  rows=rows.filter(r=>{
    const text=[r.filename,r.uploader,r.uploaded_by_email,...Object.values(r.context).filter(Boolean).flatMap(v=>[v.title,v.period,v.label])].filter(Boolean).join(' ').toLowerCase();
    return text.includes(query)&&Object.entries(state.filters||{}).every(([k,values])=>!values.length||!(k in facets||k==='created_at')||values.some(v=>k==='created_at'?dateMatches(r[k],v,today):v==='__empty__'?!r[k]:r[k]===v));
  });
  const key=['filename','mime_type','uploaded_by_email','linked_type','created_at'].includes(state.sort?.key)?state.sort.key:'created_at',direction=state.sort?.dir==='asc'?1:-1;
  const sortValues=new Map(db.evidence.filter(e=>e.client_id===cid).map(e=>[e.evidence_id,e[key]||'']));
  rows.sort((a,b)=>String(sortValues.get(a.evidence_id)).localeCompare(String(sortValues.get(b.evidence_id)))*direction||a.evidence_id.localeCompare(b.evidence_id));
  return {items:rows.slice((page-1)*size,page*size),total:rows.length,unfiltered_total,page,page_size:size,facets:Object.fromEntries(Object.entries(facets).map(([k,set])=>[k,[...set].sort()])),facets_limited,counts};
}
