// Synthetic mirror of organizational_controls.py. Never used by standard API sessions.
import {clone, now, audit} from './store';
import {clientAccess, eligible} from './assignmentEligibility';
import {validateManagementControls} from '../lib/socReadiness';
import {frameworkDefinition} from '../lib/frameworks';

const DESIGN = ['name','description','frequency','design'];
const SUPPORTED_FRAMEWORKS = ['cis-ig1','iso-27001','soc-2'];
const SNAPSHOT = [...DESIGN,'owner_id','assessment_ids','related_links'];
const KEYS = {reviews:'review_id',evidence:'evidence_id',policies:'policy_id',findings:'finding_id',tasks:'task_id',risks:'risk_id',vendors:'vendor_id'};
const identity = (cid,key) => 'ctrl_'+[cid,key].map(encodeURIComponent).join(':');
const snapshot = row => clone(Object.fromEntries(SNAPSHOT.map(k=>[k,row[k]])));
const fail = message => {throw new Error(message);};
const exact = (body,fields) => {if(Object.keys(body).some(k=>!fields.includes(k)))fail('Unknown or immutable Control fields');};

export function controlMigrationPlan(rows,cid,at,actor) {
  const groups=new Map();
  for(const row of rows.filter(r=>r.client_id===cid&&r.framework_key==='soc-2')) {
    for(const [entry,current] of [[row,true],...(row.assessment_history||[]).map(h=>[h,false])]) {
      (entry.management_controls||[]).forEach((value,index)=>{
        const key=value.control_id||`missing:${row.framework_assessment_id}:${index}`;
        if(!groups.has(key))groups.set(key,{sources:[],current:[],assessment_ids:[]});
        const group=groups.get(key),source={assessment_id:row.framework_assessment_id,criterion:row.definition_id,
          at:entry.at??row.last_assessed??null,by:entry.by??row.assessed_by??null,current_at_migration:current,value:clone(value)};
        if(!group.sources.some(s=>JSON.stringify(s)===JSON.stringify(source)))group.sources.push(source);
        if(current){group.current.push(value);if(!group.assessment_ids.includes(row.framework_assessment_id))group.assessment_ids.push(row.framework_assessment_id);}
      });
    }
  }
  return [...groups].map(([key,group])=>{
    const design={},conflicts=[];
    for(const field of DESIGN){const values=[...new Set(group.current.map(c=>c[field]||(field==='design'?'not_assessed':'')))];
      design[field]=values.length===1?values[0]:field==='design'?'not_assessed':'';if(values.length>1)conflicts.push(field);}
    if(!group.current.length)conflicts.push('historical_only');
    return {control_id:identity(cid,'legacy:'+key),client_id:cid,legacy_id:key,...design,owner_id:null,
      assessment_ids:group.assessment_ids,related_links:[],legacy_sources:group.sources,conflicts,
      reconciliation_note:'',history:[],observations:[],created_at:at,created_by:actor,updated_at:at};
  });
}

function validateDesign(db,cid,body,old) {
  const values={name:body.name,description:body.description??'',frequency:body.frequency??'',design:body.design??'not_assessed',
    owner_id:body.owner_id??null,assessment_ids:body.assessment_ids??[],related_links:body.related_links??[]};
  validateManagementControls([{control_id:'validation',...Object.fromEntries(DESIGN.map(k=>[k,values[k]]))}]);
  if(values.owner_id&&values.owner_id!==old?.owner_id&&!eligible(db.users.find(u=>u.user_id===values.owner_id),cid))fail('Choose an active platform user with access to this client');
  if(!Array.isArray(values.assessment_ids)||values.assessment_ids.length>500||new Set(values.assessment_ids).size!==values.assessment_ids.length||values.assessment_ids.some(a=>!db.framework_assessments.some(r=>r.client_id===cid&&SUPPORTED_FRAMEWORKS.includes(r.framework_key)&&r.framework_assessment_id===a)))fail('Map only CIS, ISO or SOC 2 assessments belonging to this client');
  if(!Array.isArray(values.related_links)||values.related_links.length>500||new Set(values.related_links.map(l=>JSON.stringify(l))).size!==values.related_links.length)fail('Use unique record relationships');
  for(const l of values.related_links)if(!l||Object.keys(l).some(k=>!['kind','id'].includes(k))||!KEYS[l.kind]||!(db[l.kind]||[]).some(r=>r.client_id===cid&&r[KEYS[l.kind]]===l.id))fail('Linked record is unavailable in this client');
  return values;
}

export function organizationalControlRequest(db,parts,method,params,body) {
  const [,id,operation]=parts;db.organizational_controls||=[];
  const special=['migrate','candidates','assessments'];
  const row=id&&!special.includes(id)?db.organizational_controls.find(c=>c.control_id===id):null;
  const cid=row?.client_id||params.client_id||body.client_id;
  if(!clientAccess(db.user,cid))fail('Forbidden for this client');
  const client=db.clients.find(c=>c.client_id===cid);if(!client)fail('Client not found');
  if(id&&!special.includes(id)&&!row)fail('Control unavailable');
  if(method!=='get'){
    if(!['super_admin','platform_admin'].includes(db.user.role))fail('Program configuration requires a service-provider administrator');
    if(client.status==='archived')fail('Restore the client before changing its Controls');
  }
  if(method==='get'&&!id){
    const offset=Number(params.offset||0),limit=Number(params.limit||25);
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('Invalid Control pagination');
    const rows=db.organizational_controls.filter(c=>c.client_id===cid&&(!params.assessment_id||c.assessment_ids.includes(params.assessment_id))).sort((a,b)=>a.control_id.localeCompare(b.control_id));
    return {items:rows.slice(offset,offset+limit).map(({history,legacy_sources,observations,...r})=>r),has_more:rows.length>offset+limit,
      migration_pending:controlMigrationPlan(db.framework_assessments,cid,'','').filter(c=>!db.organizational_controls.some(r=>r.control_id===c.control_id)).length};
  }
  if(method==='get'&&id==='assessments'){
    const rows=db.framework_assessments.filter(r=>r.client_id===cid&&SUPPORTED_FRAMEWORKS.includes(r.framework_key));
    if(rows.length>2000)fail('Too many assessment mappings; narrow the client scope');
    return rows.map(r=>({framework_assessment_id:r.framework_assessment_id,framework_key:r.framework_key,definition_id:r.definition_id,status:r.status,title:frameworkDefinition(r.framework_key,r.definition_id)?.title||r.definition_id}));
  }
  if(method==='get'&&id==='candidates'){
    if(!KEYS[params.kind]||params.kind==='evidence')fail('Unsupported relationship');
    const offset=Number(params.offset||0),q=String(params.q||'').trim().toLowerCase();
    if(!Number.isInteger(offset)||offset<0||q.length>100)fail('Invalid candidate query');
    const key=KEYS[params.kind],rows=(db[params.kind]||[]).filter(r=>r.client_id===cid&&[r.title,r.name].some(v=>(v||'').toLowerCase().includes(q))).sort((a,b)=>a[key].localeCompare(b[key]));
    return {items:rows.slice(offset,offset+25).map(r=>({[key]:r[key],title:r.title,name:r.name,status:r.status})),has_more:rows.length>offset+25};
  }
  if(method==='post'&&id==='migrate'){
    exact(body,['client_id']);
    db.framework_assessments.filter(a=>a.client_id===cid&&a.framework_key==='soc-2').forEach(a=>{a.controls_migrated=true;});
    const fresh=controlMigrationPlan(db.framework_assessments,cid,now(),db.user.user_id).filter(c=>!db.organizational_controls.some(r=>r.control_id===c.control_id));
    db.organizational_controls.push(...fresh);if(fresh.length)audit(db,'Legacy Controls migrated','clients',client,{created:fresh.length});return {created:fresh.length};
  }
  if(method==='post'&&!id){
    exact(body,['client_id','request_id',...SNAPSHOT]);
    if(typeof body.request_id!=='string'||!body.request_id||body.request_id.length>128)fail('A stable create request identity is required');
    const data={...validateDesign(db,cid,body),client_id:cid},control_id=identity(cid,'request:'+body.request_id),existing=db.organizational_controls.find(c=>c.control_id===control_id);
    if(existing){if(Object.keys(data).some(k=>JSON.stringify(existing[k])!==JSON.stringify(data[k])))fail('This create request already produced a different Control');return existing;}
    const at=now(),created={...data,control_id,created_at:at,created_by:db.user.user_id,updated_at:at,history:[],observations:[],legacy_sources:[],conflicts:[],reconciliation_note:''};
    db.organizational_controls.push(created);audit(db,'Control created','organizational_controls',created);return created;
  }
  if(method==='get'&&row&&!operation){
    const links=[row,...row.history,...row.observations.map(o=>o.design_snapshot)].flatMap(v=>v.related_links||[]);
    return {...row,linked_records:Object.fromEntries(Object.entries(KEYS).map(([kind,key])=>[kind,(db[kind]||[]).filter(r=>r.client_id===cid&&links.some(l=>l.kind===kind&&l.id===r[key])).map(({content_base64,...r})=>r)]))};
  }
  const save=(data,observation)=>{
    const at=new Date(Math.max(Date.now(),Date.parse(row.updated_at)+1)).toISOString();
    row.history.push({...snapshot(row),at:row.updated_at,superseded_at:at,changed_by:db.user.user_id,conflicts:clone(row.conflicts),reconciliation_note:row.reconciliation_note});
    Object.assign(row,data,{updated_at:at});if(observation)row.observations.push(observation);
    audit(db,observation?'Control observation recorded':'Control updated','organizational_controls',row);return row;
  };
  if(method==='patch'&&row&&!operation){
    exact(body,[...SNAPSHOT,'expected_updated_at','resolve_conflicts','reconciliation_note']);
    if(body.expected_updated_at!==row.updated_at)fail('Control changed since it was opened; reload before saving');
    const data=validateDesign(db,cid,body,row);
    if(body.resolve_conflicts){if(typeof body.reconciliation_note!=='string'||!body.reconciliation_note.trim()||body.reconciliation_note.length>4000)fail('Document the reconciliation decision before resolving conflicts');Object.assign(data,{conflicts:[],reconciliation_note:body.reconciliation_note.trim()});}
    return save(data);
  }
  if(method==='post'&&row&&operation==='observations'){
    exact(body,['request_id','expected_updated_at','period_start','period_end','operating','expected_instances','collected_instances','notes']);
    if(!body.request_id||body.request_id.length>128||typeof body.notes!=='string'||!body.notes.trim()||body.notes.length>4000||!body.period_start||!body.period_end)fail('Observation identity, period and testing notes are required');
    const c=validateManagementControls([{control_id:'validation',name:'validation',...Object.fromEntries(['period_start','period_end','operating','expected_instances','collected_instances'].map(k=>[k,body[k]]))}])[0];
    const data={request_id:body.request_id,notes:body.notes.trim(),...Object.fromEntries(['period_start','period_end','operating','expected_instances','collected_instances'].map(k=>[k,c[k]]))};
    const prior=row.observations.find(o=>o.request_id===data.request_id);
    if(prior){if(Object.keys(data).some(k=>prior[k]!==data[k]))fail('Observation request already used with different content');return row;}
    if(body.expected_updated_at!==row.updated_at)fail('Control changed since it was opened; reload before recording operation');
    if(row.conflicts.length)fail('Reconcile the Control design before recording shared operation');
    return save({},{...data,at:now(),by:db.user.user_id,control_revision:row.updated_at,design_snapshot:snapshot(row)});
  }
  fail('Unsupported Control operation; history is retained');
}
