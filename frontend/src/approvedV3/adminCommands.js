const roles={super_admin:'owner',platform_admin:'spadmin',client_grc_manager:'cmgr',client_contributor:'ccontrib',client_readonly:'cread'};
const nativeRole=Object.fromEntries(Object.entries(roles).map(([native,source])=>[source,native]));
const toolFields={name:'n',vendor:'v',category:'g',area_ids:'a',description:'what',product_reference:'s',source_references:'cw',
  capabilities:'cov',gaps:'gap',possible_records:'ev',verification_hints:'ver',to_confirm:'confirm',retired:'retired'};
const arrayFields=new Set(['area_ids','source_references','capabilities','gaps','possible_records','verification_hints']);
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const own=(object,key)=>Object.hasOwn(object||{},key);
const label=text=>text?text[0].toUpperCase()+text.slice(1):'';
const fail=message=>{throw Error(message);};
const onlyChanged=(old,row,keys)=>Object.fromEntries(Object.keys(keys).filter(k=>!same(old?.[keys[k]],row?.[keys[k]])).map(k=>[k,row[keys[k]]]));
const sourceAction=(commands,action,identity)=>commands.some(c=>c.name==='adminAction'&&c.args?.[0]===action&&c.args?.[1]===identity);
const admin=user=>user?.role==='super_admin'||user?.role==='platform_admin';

export async function loadGlobalRecords(api,actor) {
  const [{data:account},{data:users},{data:catalog}]=await Promise.all([
    api.get('/auth/me'),admin(actor)?api.get('/users'):Promise.resolve({data:[]}),api.get('/service-catalog')]);
  if(account.user_id!==actor.user_id||!Array.isArray(users)||!Array.isArray(catalog.tools))fail('The saved account directory could not be verified.');
  return {account,users,tools:catalog.tools};
}

export function overlayGlobalRecords(view,globals,identityMaps,scopedRecords={}) {
  const {account,users,tools}=globals;
  const sourceIds=new Map(Object.entries(identityMaps.clientIds).map(([source,native])=>[native,source]));
  const actual=new Map(users.map(user=>[user.user_id,user]));actual.set(account.user_id,account);
  for(const [cid,records] of Object.entries(scopedRecords))for(const person of records.users || []){
    if(person.reference_only||person.assignment_eligible!==true||person.status!=='active')continue;
    const known=actual.get(person.user_id);
    if(!known)actual.set(person.user_id,{...person,client_ids:[cid],directoryReadOnly:true});
    else if(known.directoryReadOnly)known.client_ids=[...new Set([...known.client_ids,cid])];
  }
  const realEmails=new Set([...actual.values()].map(person=>person.email?.toLowerCase()));
  // The approved sample people have no authentication identities. Never use an
  // email match to promote one into a real account or change a membership.
  view.users=(view.users||[]).filter(p=>!p.self&&!p.nativeUserId&&!realEmails.has(p.email?.toLowerCase()))
    .map(p=>({...p,referenceOnly:true,status:'Reference only'}));
  for(const person of actual.values())view.users.push({id:person.user_id,nativeUserId:person.user_id,name:person.name,email:person.email,
    role:roles[person.role],status:label(person.status),self:person.user_id===account.user_id,
    clients:person.role==='super_admin'||person.all_clients?'all':(person.client_ids||[]).map(id=>sourceIds.get(id)).filter(Boolean),
    nativeUpdatedAt:person.updated_at??null,directoryReadOnly:!!person.directoryReadOnly});
  view.account={...view.account,name:account.name,email:account.email,title:account.job_title||'',phone:account.phone||'',
    digestPaused:!!account.weekly_digest_optout,nativeUpdatedAt:account.updated_at??null};
  const original=new Map((view.toolCatalog||[]).map(tool=>[tool.id,tool]));
  view.toolCatalog=tools.filter(t=>t.category!=='custom').map(tool=>{
    const result={...original.get(tool.tool_id),id:tool.tool_id,nativeUpdatedAt:tool.updated_at??null};
    for(const [field,source] of Object.entries(toolFields))result[source]=tool[field]??(arrayFields.has(field)?[]:field==='retired'?false:'');
    return result;
  });
  return view;
}

function memberships(old,row,user,aliases) {
  if(row.clients==='all'){
    if(row.role==='owner')return {};
    if(row.role!=='spadmin')fail('This role cannot have access to every client.');
    return {all_clients:true,client_ids:user?.client_ids||[]};
  }
  if(!Array.isArray(row.clients)||row.clients.some(id=>!own(aliases,id)))fail('Choose a current native client before changing access.');
  const represented=new Set(Object.values(aliases)),other=(user?.client_ids||[]).filter(id=>!represented.has(id));
  const result={client_ids:[...new Set([...other,...row.clients.map(id=>aliases[id])])]};
  if(old?.clients==='all'&&user?.all_clients)result.all_clients=false;
  return result;
}

// Determine every operation before writing. All rights, password policy, tenant
// scope and final-owner checks are enforced again by each native endpoint.
export async function applyGlobalChanges({before,after,globals,actor,api,identityMaps,commands=[]}) {
  const actions=[],aliases=identityMaps.clientIds,known=new Map(globals.users.map(p=>[p.user_id,p]));
  if(globals.account.user_id!==actor.user_id)fail('The signed-in account changed. Sign in again before saving.');
  const prev=before.account||{},next=after.account||{};
  const profile=onlyChanged(prev,next,{name:'name',job_title:'title',phone:'phone'});
  if(prev.email!==next.email||prev.role!==next.role)fail('Use authorized account management to change an account email or role.');
  if(Object.keys(profile).length)actions.push({method:'patch',path:'/me',body:{...profile,expected_updated_at:prev.nativeUpdatedAt??null},person:actor.user_id});
  if(!!prev.digestPaused!==!!next.digestPaused)actions.push({method:'patch',path:'/me/preferences',body:{weekly_digest_optout:!!next.digestPaused}});
  const key=p=>p.nativeUserId||p.id||p.email.toLowerCase();
  const previous=new Map(before.users.map(p=>[key(p),p])),current=new Set(after.users.map(key));
  if(current.size!==after.users.length)fail('Two accounts have the same displayed identity. Reopen Users & Access.');
  for(const id of previous.keys())if(!current.has(id))fail('Use the native disable action to retain this account and its assignment history.');
  for(const row of after.users) {
    const old=previous.get(key(row));
    const delta=onlyChanged(old,row,{name:'name',email:'email',role:'role',status:'status',clients:'clients'});
    if(!Object.keys(delta).length)continue;
    if(!admin(actor)||row.referenceOnly||old?.referenceOnly)fail('This person is a reference record. Only an authorized platform account can be managed.');
    if(row.directoryReadOnly||old?.directoryReadOnly)fail('This eligible assignee is outside your account-management directory. An authorized administrator must manage this account.');
    if(!old){
      if(row.nativeUserId||row.self||row.status!=='Invited'||!sourceAction(commands,'save-user',row.email.toLowerCase()))
        fail('Use the Send invitation button to create a native platform account.');
      if(!nativeRole[row.role]||before.users.some(p=>p.email?.toLowerCase()===row.email.toLowerCase()))fail('Use a unique account email and a supported native role.');
      actions.push({method:'post',path:'/users',invite:true,body:{name:row.name,email:row.email,role:nativeRole[row.role],
        ...memberships(null,row,null,aliases)}});
      continue;
    }
    const user=known.get(old.nativeUserId);
    if(!user||user.user_id!==row.nativeUserId||old.nativeUpdatedAt!==(user.updated_at??null))
      fail('Reopen Users & Access to load the current account revision.');
    const route='/users/'+encodeURIComponent(user.user_id),body={expected_updated_at:old.nativeUpdatedAt};
    if(own(delta,'email')||own(delta,'name')){
      if(!sourceAction(commands,'save-account',user.user_id))fail('Confirm this account change in Users & Access.');
      Object.assign(body,onlyChanged(old,row,{email:'email',name:'name'}));
    }
    if(own(delta,'role')){
      if(!sourceAction(commands,'save-role',user.user_id)||!nativeRole[row.role])fail('Confirm a supported role in Users & Access.');
      body.role=nativeRole[row.role];
    }
    if(own(delta,'status')){
      const action={Disabled:'do-disable',Active:'u-enable'}[row.status];
      if(!action||!sourceAction(commands,action,user.user_id))fail('Confirm this account status change in Users & Access.');
      body.status=row.status.toLowerCase();
    }
    if(own(delta,'clients')){
      if(!own(delta,'role')&&!sourceAction(commands,'save-access',user.user_id))fail('Confirm client access for this account.');
      Object.assign(body,memberships(old,row,user,aliases));
    }
    actions.push({method:'patch',path:route+(Object.keys(delta).length===1&&own(delta,'clients')?'/client-memberships':''),body,person:user.user_id});
  }
  const oldTools=new Map(before.toolCatalog.map(t=>[t.id,t])),newTools=new Map(after.toolCatalog.map(t=>[t.id,t]));
  if([...oldTools.keys()].some(id=>!newTools.has(id)))fail('Retire the tool to preserve its history.');
  for(const [id,tool] of newTools){
    const old=oldTools.get(id),changes=onlyChanged(old,tool,toolFields);
    if(!Object.keys(changes).length)continue;
    if(!admin(actor))fail('Tool catalog changes require a platform administrator.');
    const record=globals.tools.find(t=>t.tool_id===id);
    if(old&&(!record||old.nativeUpdatedAt!==(record.updated_at??null))||!old&&record)fail('Reopen the current tool catalog before saving.');
    const full={tool_id:id};
    for(const [field,source] of Object.entries(toolFields))
      full[field]=own(changes,field)?changes[field]:record?.[field]??tool[source]??(arrayFields.has(field)?[]:field==='retired'?false:'');
    actions.push({method:'post',path:'/tool-catalog/save',body:{expected_updated_at:old?.nativeUpdatedAt??null,tool:full}});
  }
  let message='';
  for(const op of actions){
    const {data}=await api[op.method](op.path,op.body);
    if(op.person&&data.user_id!==op.person)fail('The saved account identity could not be verified.');
    if(op.invite){
      if(!data.user?.user_id||data.user.email?.toLowerCase()!==op.body.email.toLowerCase())fail('The invited account could not be verified.');
      message=data.delivery==='sent'?'Invitation sent.':'Account created. Invitation delivery has not been confirmed.';
    }
  }
  return {didWrite:actions.length>0,message};
}
