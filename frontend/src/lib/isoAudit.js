import catalog from '@catalogs/isoAuditProgram.json';
export {catalog as isoAuditCatalog};
export const AUDIT_STATUSES={not_started:'Not Started',in_progress:'In Progress',reviewed:'Reviewed',not_applicable:'N/A'};
export const AUDIT_RESULTS={conforming:'Conforming',observation:'Observation',nonconformity:'Nonconformity'};
export const auditPackage=key=>catalog.packages.find(p=>p.key===key);
export const blankAuditItem=()=>({status:'not_started',result:'',notes:'',na_rationale:'',evidence_ids:[],finding_ids:[],assessment_checks:[]});
export const initialAuditState=(key,cycle=1)=>({package_key:key,catalog_version:catalog.version,cycle,items:{},report_evidence_id:null});
export const auditEvidenceIds=state=>[...new Set([...Object.values(state?.items||{}).flatMap(i=>i.evidence_ids||[]),...(state?.report_evidence_id?[state.report_evidence_id]:[])])];
export const auditItemComplete=item=>item.status==='not_applicable'?!!item.na_rationale?.trim():item.status==='reviewed'&&!!AUDIT_RESULTS[item.result];
export function auditProgress(state){
  const items=(auditPackage(state.package_key)?.items||[]).map(d=>state.items?.[d.key]||{});
  return {total:items.length,complete:items.filter(auditItemComplete).length,excluded:items.filter(i=>i.status==='not_applicable').length,
    nonconformities:items.filter(i=>i.result==='nonconformity').length,observations:items.filter(i=>i.result==='observation').length};
}
export function auditActivationPlan(startDate,firstPackage){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))return [];
  const start=new Date(startDate+'T12:00:00Z'),index=catalog.packages.findIndex(p=>p.key===firstPackage);
  if(!Number.isFinite(+start)||start.toISOString().slice(0,10)!==startDate||index<0||start.getUTCFullYear()>9997)return [];
  return catalog.packages.map((_,offset)=>{
    const p=catalog.packages[(index+offset)%catalog.packages.length];
    const end=new Date(Date.UTC(start.getUTCFullYear(),(Math.floor(start.getUTCMonth()/3)+offset+1)*3,0,12));
    return {package_key:p.key,title:p.title,due_date:end.toISOString().slice(0,10)};
  });
}
export const auditQuarter=date=>date?('Q'+(Math.floor(Number(date.slice(5,7)-1)/3)+1)+' '+date.slice(0,4)):'Not scheduled';
