import { SOURCE_RECORDS } from '../lib/actionItems';
const links=['source_type','source_id','review_id','finding_id','risk_id','vendor_id','policy_id','assessment_id'];
export function prepareTask(db,row,previous) {
  if(!['critical','high','medium','low'].includes(row.priority)&&!(previous&&row.priority===previous.priority)) throw new Error('Invalid Action Item priority.');
  if(row.assignee_id&&!db.users.some(u=>u.user_id===row.assignee_id&&(['super_admin','platform_admin'].includes(u.role)||(u.client_ids||[]).includes(row.client_id)))) throw new Error('Assignee must have access to this client.');
  if(previous) {
    if(links.some(k=>(row[k]??null)!==(previous[k]??null))) throw new Error('The originating source and relationships must be retained.');
    if(previous.status==='done'&&row.status!=='done') throw new Error('Completed Action Items remain historical evidence.');
    return;
  }
  if(row.status!=='open') throw new Error('New Action Items start Open.');
  const type=row.source_type||Object.keys(SOURCE_RECORDS).find(t=>row[SOURCE_RECORDS[t][1]])||'manual';
  if(![...Object.keys(SOURCE_RECORDS),'manual','audit'].includes(type)) throw new Error('Invalid source.');
  row.source_type=type;
  if(type==='audit'&&!row.source_id&&!row.assessment_id) {
    if(Object.entries(SOURCE_RECORDS).some(([t,[,key]])=>t!=='audit'&&row[key])) throw new Error('Select the linked record as the source.');
    return;
  }
  if(SOURCE_RECORDS[type]) {
    const [kind,key]=SOURCE_RECORDS[type],id=row.source_id||row[key];
    const source=db[kind].find(r=>r[key]===id&&r.client_id===row.client_id);
    if(!source) throw new Error('Select a source record from this client.');
    if(row[key]&&row[key]!==id) throw new Error('Conflicting source relationship.');
    row[key]=id;row.source_id=id;
    if(row.finding_id) {
      const finding=db.findings.find(f=>f.finding_id===row.finding_id&&f.client_id===row.client_id);
      if(!finding) throw new Error('Finding must belong to this client.');
      for(const field of ['review_id','occurrence_id','vendor_id']) if(finding[field]) {
        if(row[field]&&row[field]!==finding[field]) throw new Error('Conflicting Finding provenance.');
        row[field]=finding[field];
      }
    }
    if(row.review_id) {
      const review=db.reviews.find(r=>r.review_id===row.review_id&&r.client_id===row.client_id);
      if(!review) throw new Error('Review must belong to this client.');
      if(review.vendor_id) {if(row.vendor_id&&row.vendor_id!==review.vendor_id) throw new Error('Conflicting Vendor provenance.');row.vendor_id=review.vendor_id;}
      row.occurrence_id=row.occurrence_id||review.current_occurrence_id||'occ_'+row.review_id;
    }
  } else if(row.source_id||Object.values(SOURCE_RECORDS).some(([,key])=>row[key])) throw new Error('Select the linked record as the source.');
}
