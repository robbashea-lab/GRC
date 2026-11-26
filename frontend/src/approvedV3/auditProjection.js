const categories = {
  review:'Reviews',task:'Action Items',finding:'Action Items',risk:'Risks',vendor:'Vendors',
  policy:'Policies',ai_system:'AI Governance',framework_assessment:'Program',evidence:'Evidence',client:'Clients',
};

// The database audit is authoritative. Reference timeline entries remain part
// of the approved fictional portfolio; newly saved events always come from it.
export function overlayNativeAudit(state,records,{clientId,sourceId,userName}) {
  const events=(records.audit_logs || []).filter(row=>row.client_id===clientId && row.log_id);
  const retained=(state.audit || []).filter(row=>!(row.native && row.client===sourceId));
  state.audit=[...retained,...events.map(row=>({i:0,t:new Date(row.at),client:sourceId,
    user:row.user_name || userName(row.user_id) || 'Unknown user',action:row.action,
    entity:categories[row.entity_type] || row.entity_type,title:row.entity_name || row.entity_id || '',
    eid:row.entity_id,native:true,nativeLogId:row.log_id}))]
    .sort((a,b)=>new Date(b.t)-new Date(a.t)).map((row,i)=>({...row,i}));
  const identities=new Map();
  for(const [table,idField,kind,label] of [
    ['reviews','review_id','rev','source_record_id'],['tasks','task_id','act','source_record_id'],
    ['risks','risk_id','risk','display_id'],['vendors','vendor_id','ven','name'],
    ['policies','policy_id','pol','title'],['ai_systems','ai_system_id','ai','name'],
  ]) for(const row of records[table] || []) {
    if(row.client_id===clientId)identities.set(row[idField],kind+'|'+(row[label] || row[idField]));
  }
  const activity=state.activity ||={};
  for(const key of Object.keys(activity))if(key.startsWith(sourceId+'|'))delete activity[key];
  for(const row of events) {
    const key=identities.get(row.entity_id);
    if(!key)continue;
    (activity[sourceId+'|'+key] ||=[]).push({t:new Date(row.at),who:row.user_name || userName(row.user_id) || 'Unknown user',
      txt:row.action+(row.entity_name?' · '+row.entity_name:''),nativeLogId:row.log_id});
  }
  return state;
}
