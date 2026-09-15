import catalog from './aiGovernanceCatalog.json';
export {catalog};
export const AI_DEFAULTS={name:'',description:'',owner_id:null,technical_owner_id:null,provider:'',vendor_id:null,product_model:'',status:'draft',purposes:[],data_types:[],access:[],roles:[],risk_topics:[],screening:{},human_review_required:null,human_approval_required:null,oversight_owner_id:null,oversight_notes:'',governance_notes:''};
export const AI_KEYS=Object.keys(AI_DEFAULTS);
export function aiScreening(row){
  const answers=row.screening||{},complete=catalog.questions.every(q=>typeof answers[q.key]==='boolean');
  const high=catalog.questions.some(q=>q.high&&answers[q.key]===true)||(row.purposes||[]).some(p=>['HR / Employment','Automated Decision-Making'].includes(p))||(row.access||[]).includes('Autonomous Action Capability');
  const moderate=catalog.questions.some(q=>!q.protective&&answers[q.key]===true)||answers.oversight===false||!!(row.vendor_id||row.provider||row.access?.length||(row.data_types||[]).some(t=>!['Public','Internal','No Sensitive Data'].includes(t)));
  return {risk_tier:high?'high':moderate?'moderate':complete?'low':null,screening_complete:complete,screening_version:catalog.version};
}
export function aiProjection(row,reviews=[],risks=[],today=new Date().toISOString().slice(0,10)){
  const linked=reviews.filter(r=>r.ai_system_id===row.ai_system_id&&r.client_id===row.client_id);
  const completed=linked.flatMap(r=>[...(r.occurrences||[]).filter(o=>o.status==='completed').map(o=>o.completed_at||o.completion_date),...(r.status==='completed'?[r.completion_date]:[])]).filter(Boolean).sort();
  const active=linked.filter(r=>!['completed','cancelled'].includes(r.status)),dates=active.map(r=>r.due_date).filter(Boolean).sort();
  const result={...row,...aiScreening(row),last_review:completed.at(-1)||null,next_review:dates[0]||null,review_cadence:active.find(r=>r.ai_review_purpose==='periodic')?.recurrence||null,alerts:[]};
  if(row.status!=='active')return result;
  const alert=(key,label,condition)=>{if(condition)result.alerts.push({key,label,classification:'Recommended governance practice'});};
  const answers=row.screening||{};
  alert('owner','AI Owner Missing',!row.owner_id);
  alert('schedule','AI Review Not Scheduled',!result.next_review);
  alert('overdue','AI Review Overdue',result.next_review&&result.next_review.slice(0,10)<today);
  const ids=(row.related_links||[]).filter(x=>x.kind==='risks').map(x=>x.id);
  alert('risk','High-Risk AI Without Risk Assessment',result.risk_tier==='high'&&!risks.some(r=>r.client_id===row.client_id&&ids.includes(r.risk_id)&&!['closed','retired'].includes(r.status)&&Number.isInteger(r.likelihood_score)&&Number.isInteger(r.impact_score)));
  alert('screening','AI Governance Assessment Missing',!result.screening_complete);
  alert('oversight','Consequential AI Without Documented Oversight',(answers.consequential||answers.employment||row.purposes?.includes('HR / Employment'))&&!row.oversight_notes?.trim());
  alert('vendor','Third-Party AI Without Vendor Relationship',(answers.third_party||row.provider)&&!row.vendor_id);
  alert('sensitive','Sensitive Data Without Completed Governance Review',(answers.sensitive||(row.data_types||[]).some(t=>!['Public','Internal','No Sensitive Data'].includes(t)))&&!result.last_review);
  alert('change','Material Change Review Needed',row.material_change_at&&(!result.last_review||row.material_change_at>result.last_review));
  return result;
}
export function validateAI(db,row,existing){
  if(!row.name?.trim())throw new Error('Name is required');
  if(!db.clients.some(c=>c.client_id===row.client_id))throw new Error('Client not found');
  if(existing?.client_id&&existing.client_id!==row.client_id)throw new Error('Cannot move records between clients');
  if(existing?.status==='retired')throw new Error('Retired AI records remain historical');
  if(!catalog.statuses.includes(row.status))throw new Error('Invalid status');
  for(const key of ['purposes','data_types','access','roles','risk_topics'])if(!Array.isArray(row[key])||row[key].some(v=>!catalog[key].includes(v)))throw new Error('Invalid '+key);
  for(const [key,value] of Object.entries(row.screening||{}))if(!catalog.questions.some(q=>q.key===key)||(value!==null&&typeof value!=='boolean'))throw new Error('Invalid screening answer');
  if(row.vendor_id&&!db.vendors.some(v=>v.vendor_id===row.vendor_id&&v.client_id===row.client_id))throw new Error('Vendor must belong to this client');
  for(const key of ['owner_id','technical_owner_id','oversight_owner_id'])if(row[key]&&!db.users.some(u=>u.user_id===row[key]&&u.status==='active'&&(u.role==='super_admin'||u.role==='platform_admin'&&!u.client_ids?.length||u.client_ids?.includes(row.client_id))))throw new Error('Owner must be an active client-authorized user');
}
