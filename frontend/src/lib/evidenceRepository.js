// Navigation only: paths are computed from authorized references, never persisted folders.
export const EVIDENCE_AREAS={reviews:'Reviews',policies:'Policies',vendors:'Vendors',risks:'Risks',findings:'Findings',framework_assessments:'Frameworks',requirements:'Frameworks',organizational_controls:'Other',tasks:'Action Items',ai_systems:'AI Governance'};
export function evidenceFolders(references){
  const folders=new Map();
  for(const ref of references||[]){
    if(!ref.available)continue;
    const area=EVIDENCE_AREAS[ref.kind]||'Other';
    const key=ref.kind==='reviews'?(ref.review_type||'untyped'):area==='Frameworks'?(ref.framework_key||'unmapped'):ref.id;
    const label=ref.kind==='reviews'?(ref.review_type||'Review type not recorded'):area==='Frameworks'?(ref.framework_key||'Framework not recorded'):ref.title;
    const path=JSON.stringify([area,key]);folders.set(path,{area,key,label,path});
  }
  return [...folders.values()];
}
export function folderCounts(rows){
  const counts=new Map();
  for(const row of rows)for(const folder of row.folders||[]){const old=counts.get(folder.path);counts.set(folder.path,{...folder,count:(old?.count||0)+1});}
  return [...counts.values()];
}
