const {appendApprovedV3Registers} = require('./approvedV3Registers.js');
const {appendApprovedV3Work} = require('./approvedV3Work.js');
const definitions = require('../../../shared/catalogs/frameworkDefinitions.json').frameworks;
const baselineCatalog = require('../../../shared/catalogs/onboardingCatalog.json');
const profileSchema = require('../lib/clientProfileFields.json').sections;
const frameworkKeys = {hipaa:'hipaa',cis:'cis-ig1',iso:'iso-27001',nist:'nist-csf-2',soc:'soc-2',cmmc:'cmmc'};
const sourceVersions={cis:'8.1',iso:'27001-2022',soc:'2017-2022',hipaa:'45cfr164',nist:'csf2.0',cmmc:'800171r2'};
const nativeSocCategories=categories=>(categories||['security']).map(category=>category==='processing'?'processing_integrity':category);
const hipaaSupplementIds=new Set(['164.302','164.105','164.530']);
const approvedHipaaSupplement=require('../../../shared/catalogs/hipaaSecurityRule.json').requirements
  .filter(row=>hipaaSupplementIds.has(row.id)).map(row=>({id:row.id,title:row.title,st:'A',ver:'U',age:'-',lw:'—',ev:0,
    group:row.control,groupName:row.control_name,domain:row.control_name,ra:'G',text:'',
    note:'Catalog guidance: '+row.guidance,owner:null,baseSt:'A',baseVer:'U'}));
const catalogs = {
  hipaa:require('../../../shared/catalogs/hipaaSecurityRule.json'),
  'cis-ig1':require('../../../shared/catalogs/cisIG1.json'),
  'iso-27001':require('../../../shared/catalogs/iso27001.json'),
  'nist-csf-2':require('../../../shared/catalogs/nistCSF2.json'),
  'soc-2':require('../../../shared/catalogs/soc2.json'),
  cmmc:require('../../../shared/catalogs/cmmc.json'),
};
const roleMap = {owner:'super_admin',spadmin:'platform_admin',iviewer:'client_readonly',cmgr:'client_grc_manager',ccontrib:'client_contributor',cread:'client_readonly'};
const statuses = {I:'addressed',P:'in_progress',N:'needs_attention',A:'not_assessed',X:'not_applicable'};
const verification = {V:'verified',N:'needs_validation',G:'gap_identified',U:'not_verified'};
// The approved page's TODAY and its assessment drawer use this fixed calendar day
// and a day offset. Preserve only the day shown, never an invented time or assessor.
const sampleDay=Date.UTC(2026,10,17);
const dayMs=86400000;
const sourceHash = '5bb03e1219276a01459f2a44be6da44dce71271feb8a17c15a2083e6db397db9';
const stateHash = '9c714893795f18317ed265875d08122d64a0b92b541af09af4bef947ccdbfaf1';

const canonicalClient = sourceId=>'v3sample_'+sourceId;
// Native linked-record selectors accept ASCII letters, digits, underscores and hyphens.
// Escaping underscores as well makes the encoding reversible without punctuation collisions.
const part = value=>String(value).replace(/[^A-Za-z0-9-]/gu,ch=>'_'+ch.codePointAt(0).toString(16)+'_');
const accountId = email=>'v3sample_user_'+part(email.toLowerCase());
const readonlyTables=['organizational_controls','framework_assessments','ai_systems','clients','users','reviews','findings','risks','policies','vendors','assets','tasks','exceptions','requirements','contacts','evidence','assessments','comments','logs','notifications'];
const idFields={clients:'client_id',users:'user_id',contacts:'contact_id',assets:'asset_id',requirements:'requirement_id',
  framework_assessments:'framework_assessment_id',reviews:'review_id',findings:'finding_id',tasks:'task_id',
  risks:'risk_id',vendors:'vendor_id',policies:'policy_id',evidence:'evidence_id',ai_systems:'ai_system_id'};
const mappings={
  organization:{legal_name:'legal',domain:'domain',organization_type:'type',parent:'parent',employees:'emp',technology_users:'tech',
    locations:'loc',country:'hqC',region:'hqS',operating_states:'states',operating_regions:'countries',workforce:'work',business_model:'biz',it_management:'itm',
    cyber_insurance:'ins',insurance_renewal:'insDate',insurer:'insurer',notes:'notes'},
  technical:{identity:'idp',productivity:'prod',cloud:'cloud',endpoints:'ep',security_technology:'caps',infrastructure:'infra',network:'net',operating_environment:'opEnv'},
  security:{data_types:'data',collects:'dCollect',stores:'dStore',processes:'dProcess',transmits:'dTransmit',hosts:'dHost',admin_access:'dAdmin',develops:'dDev'},
  scope:{statement:'stmt',systems:'sys',locations:'loc',data:'data',exclusions:'excl'},
};

function projectFields(object,mapping) {
  return Object.fromEntries(Object.entries(mapping).filter(([,key])=>object?.[key]!=null&&object[key]!=='').map(([field,key])=>[field,object[key]]));
}

function profileFor(client,p) {
  // Older source clients materialize the v2 profile on first opening their profile.
  const v=p.v2||{};
  const org=projectFields(v,mappings.organization);
  const tech=projectFields(v,mappings.technical);
  const security=projectFields(v,mappings.security);
  if(!p.v2&&!p.empty) {
    Object.assign(org,projectFields(p,{domain:'domain',organization_type:'type',employees:'emp',technology_users:'tech',locations:'loc',country:'hq',workforce:'work'}));
    org.legal_name=client.name;
    for(const [field,key] of [['identity','idp'],['productivity','prod'],['cloud','cloud'],['endpoints','ep'],['security_technology','caps']]) {
      if(p[key])tech[field]=[].concat(p[key]);
    }
    if(p.ins) {
      const date=/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(p.ins);
      if(date) {org.cyber_insurance='Yes';org.insurance_renewal='20'+date[3]+'-'+date[1].padStart(2,'0')+'-'+date[2].padStart(2,'0');}
    }
  }
  const units=v.bu||p.bu;if(Array.isArray(units))org.business_units=units.join('; ');
  for(const field of profileSchema.security.filter(row=>row.options==='capability')) {
    const answer=v.areas?.[field.label] || (!p.v2&&p.empty?'Unknown':!p.v2&&p.areas?
      (p.partial?.includes(field.label)?'Partial':field.label==='Secure Development'&&p.areas['Not applicable']?'Not Applicable':'Implemented'):null);
    if(answer)security[field.id]=answer;
  }
  return {organization:org,technical:tech,security,scope:projectFields(p.scope,mappings.scope)};
}

function scopedDefinitions(fk,program) {
  return catalogs[fk].requirements.filter(d=>fk==='cis-ig1'?(d.implementation_group||1)<=(program.ig||1):
    fk==='soc-2'?nativeSocCategories(program.cats).includes(d.category):fk==='cmmc'?(program.level??2)===2||!!d.level_one_parent:true);
}
function frameworkState(source,client,db,ctx) {
  const c=db.clients.find(row=>row.client_id===ctx.clientId);
  const selected=new Map((client.progs||[]).filter(p=>!p.retired&&!p.ws&&p.reg).map(p=>[frameworkKeys[p.k],p]));
  const answers={},settings={};
  for(const def of definitions) {
    const program=selected.get(def.key);
    const value=program?'applies':({unsure:'unsure',applies:'applies'})[client.progApp?.[Object.keys(frameworkKeys).find(k=>frameworkKeys[k]===def.key)]]||'does_not_apply';
    answers[def.key]=value;
    const requirement=baselineCatalog.requirements.find(x=>x.key===def.key);
    db.requirements.push({client_id:ctx.clientId,requirement_id:ctx.recordId('requirements',def.key),source_record_id:def.key,title:requirement.name,
      category:requirement.category,baseline_key:def.key,baseline_response:value,applicability:program?'applicable':value==='unsure'?'needs_review':'not_applicable',status:program?'active':'retired'});
    if(!program)continue;
    const fk=def.key,catalog=catalogs[fk];
    if(fk==='cis-ig1')settings[fk]={implementation_group:program.ig};
    if(fk==='cmmc')settings[fk]={level:program.level};
    if(fk==='soc-2')settings[fk]={categories:nativeSocCategories(program.cats)};
    const byDef=new Map(program.reg.items.map(i=>[i.id.toLowerCase(),i]));
    const active=scopedDefinitions(fk,program);
    for(const d of active) {
      const item=byDef.get(d.id.toLowerCase());
      const key=(source.itemKeyIndex.get([client.id,program.k,d.id.toLowerCase()].join('|')) || '');
      const hist=source.itemHist[key]||[];
      const history=hist.map(h=>({at:h.t,by:ctx.userId(h.who),source_actor:h.who,source_event:h.txt}));
      const savedExclusion=fk==='cmmc'&&program.cmmcWorkspace?.exclusions?.[d.id];
      const rationale=item?.st==='X'?(typeof savedExclusion==='string'&&savedExclusion.trim()||hist.find(h=>/^Not applicable:/i.test(h.txt))?.txt):'';
      const id=ctx.assessmentId(d.id,fk);
      const row={framework_assessment_id:id,client_id:ctx.clientId,framework_key:fk,framework_version:catalog.version,
        definition_id:d.id,title:d.title,status:item?statuses[item.st]:'not_assessed',
        implementation:item?.cur??source.itemCur[key]??'',technology:'',notes:'',na_rationale:rationale||'',
        owner_id:ctx.userId(item?.owner),process_owner_id:null,verification:item?.ver==='X'?null:verification[item?.ver]||'not_verified',
        related_links:[],assessment_history:history,source_reference:item?.id??null,source_record_id:item?.id??null,source_program_key:program.k};
      if(item&&!Object.hasOwn(statuses,item.st))throw Error('Unsupported assessment status: '+item.st);
      if(item && /^\d+$/.test(item.age))row.last_assessed=new Date(sampleDay-Number(item.age)*dayMs).toISOString().slice(0,10);
      if(item?.owner&&!row.owner_id)row.source_owner_name=item.owner;
      if(item?.soa)row.soa_applicability={'Necessary':'included','Not necessary':'excluded'}[item.soa]||'undetermined';
      if(item?.soa_justification)row.soa_justification=item.soa_justification;
      const savedItems=source.ita[key]||[];
      if(savedItems.length)row.items_to_address=savedItems.map(i=>({
        item_id:ctx.recordId('assessment_item',i.id),source_record_id:i.id,origin:'approved_source',
        kind:i.kind==='Gap'?'gap':'verification',item_type:({Gap:'gap',Evidence:'evidence',Confirm:'confirmation'})[i.kind],
        state:i.st==='Open'?'open':'resolved',text:i.txt,source:i.src,created_at:i.t,resolution:''
      }));
      db.framework_assessments.push(row);
    }
    if(byDef.size!==program.reg.items.length||byDef.size!==active.filter(d=>byDef.has(d.id.toLowerCase())).length)
      throw Error('Unknown or duplicate source definitions in '+client.id+' / '+fk);
  }
  // The approved profile treats pre-existing clients as configured and new clients as
  // configured after their onboarded flag is saved. It does not identify a sign-off time.
  const completed=!client.isNew||client.onboarded===true;
  const step=completed?3:Math.min(3,Math.max(0,(source.onboarding?.[client.id]?.step||1)-1));
  const state={completed,version:3,step,requirements:answers,framework_settings:settings,framework_reviews:{},policies:{},reviews:[]};
  c.framework_settings=settings;c.onboarding_baseline=state;db.baselines[ctx.clientId]=state;
}

// Derive aliases only from authorized native collections. These aliases are a UI lookup,
// never a grant; all writes still go through their existing scoped native endpoint.
function approvedV3IdentityMaps(records) {
  const clientIds=Object.create(null),userIds=Object.create(null),recordIds=Object.create(null);
  for(const client of records.clients||[])if(client.source_client_id)clientIds[client.source_client_id]=client.client_id;
  for(const user of records.users||[])if(user.email)userIds[user.email.toLowerCase()]=user.user_id;
  for(const [table,idField] of Object.entries(idFields)) {
    for(const row of records[table]||[]) {
      if(!row.client_id||!row[idField])continue;
      const scoped=(recordIds[row.client_id]||=Object.create(null));
      const ids=(scoped[table]||=Object.create(null));
      const key=row.source_record_id??row[idField];
      ids[table==='framework_assessments'?row.framework_key+'|'+row.definition_id:key]=row[idField];
      if(table==='reviews') {
        const occurrences=(scoped.occurrences||=Object.create(null));
        if(row.current_occurrence_id)occurrences[row.source_occurrence_id||row.current_occurrence_id]=row.current_occurrence_id;
        for(const entry of row.occurrences||[])if(entry.occurrence_id)
          occurrences[entry.source_occurrence_id||entry.source_record_id||entry.occurrence_id]=entry.occurrence_id;
      }
    }
  }
  return {clientIds,userIds,recordIds};
}
function approvedV3Scenario(input,{clientIds={},userIds={},recordIds={},clientFieldsOnly=false}={}) {
  // connectedPersist wraps genuine Date instances. Normalize only this page's explicit
  // one-property date envelope. Dates are ISO strings throughout native records.
  const source=JSON.parse(JSON.stringify(input),(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.$date==='string'?v.$date:v);
  const clientKey=key=>Object.hasOwn(clientIds,key)?clientIds[key]:canonicalClient(key);
  const records=Object.fromEntries(readonlyTables.map(t=>[t,[]]));
  Object.assign(records,{baselines:{},drafts:{}});
  // Bind only recorded assessment-local entries. ID matches stay within this client and program.
  source.itemKeyIndex=new Map();
  for(const key of new Set([...Object.keys(source.itemHist),...Object.keys(source.itemCur),...Object.keys(source.ita)])) {
    const [cid,program,id]=key.split('|');
    if(id)source.itemKeyIndex.set([cid,program.split(':')[0],id.toLowerCase()].join('|'),key);
  }
  for(const user of source.users) {
    if(!roleMap[user.role]||!user.email)throw Error('Unsupported source sample user');
    const allowed=user.clients==='all'?source.clients.map(c=>c.id):user.clients;
    const email=user.email.toLowerCase();
    records.users.push({user_id:Object.hasOwn(userIds,email)?userIds[email]:accountId(email),source_record_id:user.email,email:user.email,name:user.name,role:roleMap[user.role],status:user.status.toLowerCase(),
      client_ids:allowed.map(clientKey),workspace_mode:'demo',source_role:user.role});
  }
  const actor=records.users.find(u=>u.name===source.account?.name);
  const clients={};
  for(const client of source.clients) {
    const sourceId=client.id,clientId=clientKey(sourceId);
    const known=Object.hasOwn(recordIds,clientId)?recordIds[clientId]:{};
    const recordId=(kind,raw)=>raw==null||raw===''?null:
      known[kind]&&Object.hasOwn(known[kind],raw)?known[kind][raw]:clientId+'_'+kind+'_'+part(raw);
    const active = new Map((client.progs||[]).filter(p=>p.reg&&!p.retired&&!p.ws).map(p=>[frameworkKeys[p.k],
      new Map(scopedDefinitions(frameworkKeys[p.k],p).map(d=>[d.id.toLowerCase(),d.id]))]));
    const userId=name=>records.users.find(u=>name&&u.name===(source.own[sourceId]?.[name]||name)&&u.client_ids.includes(clientId))?.user_id || null;
    const ctx={sourceId,clientId,userId,recordId,frameworkKey:frameworkKeys[client.activeProg],
      reviewPlans:framework=>catalogs[framework]?.review_plans||[],
      policyBaselineKey(name){return baselineCatalog.policies.find(p=>p.name.toLowerCase()===name.trim().toLowerCase())?.key||null;},
      assessmentId(raw,framework) {
        if(!raw)return null;
        const ref=String(raw).replace(/^Clause\s+/i,'').trim().toLowerCase();
        const choices=[...active.keys()].filter(k=>active.get(k).has(ref));
        const sourceProgram=String(framework||'').split('|').at(-1).split(':')[0];
        const fk=framework?(frameworkKeys[sourceProgram]||framework):choices.length===1?choices[0]:null;
        const definitionId=active.get(fk)?.get(ref);
        const matching=known.framework_assessments?.[fk+'|'+definitionId];
        return definitionId?matching||'fw_'+clientId+'_assessment_'+(fk==='cis-ig1'?'':fk+'_')+definitionId:null;
      }};
    clients[sourceId]=clientId;
    const profile=source.profile[sourceId]||{};
    const row={client_id:clientId,name:client.name,industry:client.industry||'',status:client.status.toLowerCase(),environment:client.env||'Demo',
      assigned_owner_id:userId(client.lead),source_client_id:sourceId,source_record_id:sourceId,
      source_active_program:client.activeProg,profile:profileFor(client,profile)};
    if(profile.scope?.confirmed)row.profile_scope_confirmation={at:profile.scope.confirmed,by:profile.scope.by};
    if(client.logoUrl)row.logo_url=client.logoUrl;
    records.clients.push(row);
    for(const [i,contact] of source.records[sourceId].contacts.entries()) {
      const key=contact.sourceRecordId??contact.wfId??String(i+1),id=recordId('contacts',key);
      records.contacts.push({contact_id:id,source_record_id:key,client_id:clientId,name:contact.name,role:contact.role,email:contact.email||null,
        linked_user_id:contact.access?userId(contact.name):null,status:'active'});
      if(contact.primary)row.primary_contact_id=id;
    }
    for(const [i,asset] of source.records[sourceId].systems.entries()) {
      const key=asset.sourceRecordId??asset.wfId??String(i+1);
      records.assets.push({asset_id:recordId('assets',key),source_record_id:key,client_id:clientId,name:asset.name,
      asset_type:asset.type?.toLowerCase(),criticality:asset.crit?.toLowerCase(),owner_id:userId(asset.owner),source_owner_name:asset.owner,
      location:asset.loc,status:'active'});
    }
    frameworkState(source,client,records,ctx);
    if(!clientFieldsOnly) {
      appendApprovedV3Registers(records,source,ctx);
      appendApprovedV3Work(records,source,ctx);
    }
    for(const policy of records.policies.filter(p=>p.client_id===clientId&&p.baseline_key))
      records.baselines[clientId].policies[policy.baseline_key]=policy.baseline_response;
    records.baselines[clientId].selected_policy_keys=Object.keys(records.baselines[clientId].policies);
  }
  for(const log of source.audit.filter(l=>l.t&&l.action)) {
    const cid=clients[log.client];
    const nativeType=({Clients:'clients',Reviews:'reviews',Tasks:'tasks','Action items':'tasks',Policies:'policies',Risks:'risks',Vendors:'vendors','AI systems':'ai_systems',Evidence:'evidence','Framework requirements':'framework_assessments'})[log.entity];
    records.logs.push({audit_id:'v3sample_audit_'+log.i,source_record_id:String(log.i),at:log.t,action:log.action,entity_type:nativeType||log.entity,
      entity_name:log.title,source_entity_id:log.eid||null,client_id:cid||null,
      user_id:records.users.find(u=>u.name===log.user&&(!cid||u.client_ids.includes(cid)))?.user_id||null,user_name:log.user,
      meta:{source:'approved_sample',title:log.title}});
  }
  const {logs,baselines,drafts,...collections}=records;
  const nativeRecords=Object.fromEntries(Object.entries(collections).filter(([,rows])=>rows.length));
  return {schema_version:1,source_sha256:sourceHash,state_sha256:stateHash,source_client_ids:clients,demo_actor_id:actor?.user_id??null,
    records:nativeRecords,demo_context:{logs,baselines,drafts}};
}

const inverse = mapping=>Object.fromEntries(Object.entries(mapping).map(([key,value])=>[value,key]));
const statusCodes=inverse(statuses),verificationCodes=inverse(verification);

function overlayClientProfile(view,client,row,records,users) {
  const cid=row.client_id,profile=view.profile[client.id]||={},saved=row.profile||{};
  const v={...(profile.v2||{}),areas:profile.v2?.areas||{}};
  for(const section of ['organization','technical','security']) {
    if(!Object.hasOwn(saved,section))continue;
    for(const [native,field] of Object.entries(mappings[section])) {
      if(saved[section]?.[native]!=null)v[field]=saved[section][native];
      else delete v[field];
    }
  }
  if(Object.hasOwn(saved,'organization'))v.bu=(saved.organization?.business_units||'').split(';').map(s=>s.trim()).filter(Boolean);
  if(Object.hasOwn(saved,'security'))v.areas=Object.fromEntries(profileSchema.security.filter(r=>r.options==='capability')
    .map(f=>[f.label,saved.security?.[f.id]||'Unknown']));
  profile.v2=v;
  if(Object.hasOwn(saved,'scope')) {
    const scope={...profile.scope};
    for(const [native,field] of Object.entries(mappings.scope))scope[field]=saved.scope?.[native]||'';
    scope.confirmed=row.profile_scope_confirmation?.at||null;
    const actor=row.profile_scope_confirmation?.by;
    scope.by=users.get(actor)||actor||null;
    profile.scope=scope;
  }
  const register=view.records[client.id]||={contacts:[],systems:[],ai:[]};
  // Source contacts/systems originally have no ID. Carry their native identity through
  // subsequent edits and ordering changes, including rows first created in the native UI.
  function overlayRows(table,sourceTable,idField,project) {
    if(!Object.hasOwn(records,table))return;
    register.nativeSourceIdentities=true;
    const originals=new Map((register[sourceTable]||[]).map((item,index)=>[String(item.sourceRecordId??item.wfId??index+1),item]));
    register[sourceTable]=records[table].filter(item=>item.client_id===cid).map(item=>{
      const key=String(item.source_record_id??item[idField]),original=originals.get(key)||{};
      return {...original,...project(item,original),sourceRecordId:key};
    });
  }
  const accounts=new Map((records.users||[]).map(account=>[account.user_id,account]));
  overlayRows('contacts','contacts','contact_id',item=>{
    const account=accounts.get(item.linked_user_id),role=account?.role==='client_viewer'?'client_readonly':account?.role;
    const real=account&&!account.reference_only&&Object.values(roleMap).includes(role);
    const permitted=real&&(role==='super_admin'||role==='platform_admin'&&account.all_clients===true||account.client_ids?.includes(cid));
    const accountStatus=account?.reference_only?'Reference only':account?.status?
      account.status.charAt(0).toUpperCase()+account.status.slice(1):'';
    return {name:item.name,email:item.email||'',role:item.role||item.title||'',primary:item.contact_id===row.primary_contact_id,
      access:!!(permitted&&account.status==='active'),invited:!!(real&&account.status==='invited'),accountStatus};
  });
  overlayRows('assets','systems','asset_id',(item,original)=>({
    name:item.name,owner:item.owner_id?(users.get(item.owner_id)||item.source_owner_name||null):null,loc:item.location||'',
    type:String(original.type||'').toLowerCase()===item.asset_type?original.type:item.asset_type||'',
    crit:String(original.crit||'').toLowerCase()===item.criticality?original.crit:item.criticality?item.criticality[0].toUpperCase()+item.criticality.slice(1):'',
  }));
  if(Object.hasOwn(records,'contacts'))client.contact=register.contacts.find(c=>c.primary)?.name||null;
}

// Applies the authorized native records to a caller-owned display template. The server
// must filter that template by tenant first. No role or access decisions are made here.
function overlayApprovedClientAssessments(view,records,{clientIds={},asOfDate='2026-11-17'}={}) {
  const displayDay=asOfDate instanceof Date
    ? Date.UTC(asOfDate.getFullYear(),asOfDate.getMonth(),asOfDate.getDate())
    : Date.parse(asOfDate);
  if(!Number.isFinite(displayDay))throw Error('Choose a valid reporting date before opening the assessment.');
  const users=new Map((records.users||[]).map(u=>[u.user_id,u.name]));
  const clients=new Map((records.clients||[]).map(c=>[c.source_client_id,c]));
  const byId=new Map((records.clients||[]).map(c=>[c.client_id,c]));
  const assessments=new Map((records.framework_assessments||[]).map(r=>[[r.client_id,r.framework_key,r.definition_id.toLowerCase()].join('|'),r]));
  const implementationKeys=new Map(Object.keys(view.itemCur||{}).map(key=>{
    const [cid,program,id]=key.split('|');
    return [[cid,program.split(':')[0],String(id).toLowerCase()].join('|'),key];
  }));
  for(const client of view.clients) {
    const row=clients.get(client.id)||byId.get(clientIds[client.id]);
    if(!row)continue;
    client.name=row.name;client.industry=row.industry;
    if(row.status)client.status=row.status.charAt(0).toUpperCase()+row.status.slice(1);
    client.lead=users.get(row.assigned_owner_id)||null;
    client.env=row.environment||client.env;
    if(Object.hasOwn(row,'logo_url')||client.logoUrl)client.logoUrl=row.logo_url||'';
    overlayClientProfile(view,client,row,records,users);
    for(const program of client.progs||[])if(program.k==='hipaa'&&program.reg?.items){
      for(const supplement of approvedHipaaSupplement)if(!program.reg.items.some(item=>item.id===supplement.id)&&
        assessments.has([row.client_id,'hipaa',supplement.id.toLowerCase()].join('|')))
        program.reg.items.push({...supplement});
    }
    for(const program of client.progs||[])for(const item of program.reg?.items||[]) {
      const assessment=assessments.get([row.client_id,frameworkKeys[program.k],item.id.toLowerCase()].join('|'));
      if(!assessment||!Object.hasOwn(statusCodes,assessment.status))continue;
      item.st=statusCodes[assessment.status];
      item.ver=verificationCodes[assessment.verification] || (item.st==='X'?'X':'U');
      const assessedDay=Date.parse(String(assessment.last_assessed||'').slice(0,10));
      item.age=Number.isFinite(assessedDay)?String(Math.max(0,Math.round((displayDay-assessedDay)/dayMs))):'-';
      const name=assessment.owner_id?(users.get(assessment.owner_id)||assessment.source_owner_name||null):null;
      if(name!==(view.own[client.id]?.[item.owner]||item.owner||null))item.owner=name;
      const savedKey=implementationKeys.get([client.id,program.k,item.id.toLowerCase()].join('|'));
      if(savedKey)view.itemCur[savedKey]=assessment.implementation||'';
      if(item.cur!=null||!savedKey&&assessment.implementation)item.cur=assessment.implementation||'';
      if(assessment.soa_applicability==='included')item.soa='Necessary';
      else if(assessment.soa_applicability==='excluded')item.soa='Not necessary';
      else if(item.soa||assessment.soa_applicability==='undetermined')item.soa='Decision needed';
      if(item.soa_justification!=null||assessment.soa_justification)item.soa_justification=assessment.soa_justification||'';
      if(program.k==='cmmc'&&(assessment.na_rationale||program.cmmcWorkspace?.exclusions?.[item.id])) {
        program.cmmcWorkspace||={};program.cmmcWorkspace.exclusions||={};
        if(item.st==='X'&&assessment.na_rationale)program.cmmcWorkspace.exclusions[item.id]=assessment.na_rationale;
        else delete program.cmmcWorkspace.exclusions[item.id];
      }
      const key=client.id+'|'+program.k+':'+sourceVersions[program.k]+'|'+item.id;
      if(Array.isArray(assessment.assessment_history)){
        view.itemHist||={};
        const snapshots=assessment.assessment_history.filter(entry=>entry.at&&Number.isFinite(Date.parse(entry.at)));
        if(snapshots.length||view.itemHist[key]){
          view.itemHist[key]=snapshots.map(entry=>({
            t:new Date(entry.at),who:users.get(entry.by)||entry.source_actor||entry.by||'',
            txt:entry.source_event||(entry.approved_v3_guide?'Saved: reviewed implementation from guided assessment':
              'Saved: '+(entry.status?String(entry.status).replace(/_/g,' '):'assessment')),
          })).sort((a,b)=>b.t-a.t);
        }
      }
      if(assessment.items_to_address||view.ita?.[key]) {
        view.ita||={};
        const previous=new Map((view.ita[key]||[]).map(i=>[String(i.id),i]));
        view.ita[key]=(assessment.items_to_address||[]).filter(i=>i.state!=='removed').map(i=>{
          const raw=String(i.source_record_id??(i.request_id?.startsWith('approved_v3_item_')?i.request_id.slice(17):i.item_id));
          const prior=previous.get(raw)||{};
          return {...prior,id:raw,kind:({gap:'Gap',evidence:'Evidence',confirmation:'Confirm'})[i.item_type]||(i.kind==='gap'?'Gap':'Confirm'),
            txt:i.text,src:prior.src||i.source||(i.origin==='manual'?'Manual':'Guided assessment'),
            st:i.state==='open'?'Open':'Resolved',resolution:i.resolution||'',...(i.created_at?{t:new Date(i.created_at)}:{})};
        });
      }
    }
    const active=client.progs?.find(p=>p.k===client.activeProg);
    if(active?.reg)view.reg[client.id]=active.reg;
    if(Object.hasOwn(records,'approved_v3_guidance')) {
      view.guideSaved||={};
      for(const key of Object.keys(view.guideSaved))if(key.startsWith(client.id+'|'))delete view.guideSaved[key];
      for(const draft of records.approved_v3_guidance.filter(d=>d.client_id===row.client_id&&d.version===sourceHash&&d.checkpoint)) {
        const program=Object.keys(frameworkKeys).find(k=>frameworkKeys[k]===draft.framework_key);
        const key=client.id+'|'+program+':'+sourceVersions[program]+'|'+draft.definition_id;
        view.guideSaved[key]={...draft.checkpoint,ack:false,savedAt:new Date(draft.saved_at),nativeRevision:draft.revision,nativeDigest:draft.digest};
      }
    }
  }
  return view;
}
module.exports={approvedV3Scenario,approvedV3Records:(source,options)=>approvedV3Scenario(source,options).records,approvedV3IdentityMaps,
  overlayApprovedClientAssessments,statuses,verification,frameworkKeys,sourceHash,nativeSocCategories,approvedHipaaSupplement};
