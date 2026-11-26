import {approvedV3Records,approvedV3IdentityMaps,frameworkKeys,sourceHash,nativeSocCategories} from '../preview/approvedV3Records';
import baselineCatalog from '@catalogs/onboardingCatalog.json';
import {CATALOGS,sharedFrameworkPlans,reviewConfig} from '../lib/frameworks';
import {setupDraft} from '../lib/r4ServicesTools';
import {serviceFormFields} from '../preview/approvedV3Registers';
import {cadencePatch} from './workCommands';
import {loadApprovedSetupCatalog,requireSetupActivity} from './setupActivities';

const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row||{},k)).map(k=>[k,row[k]]));
const changed=(a,b,keys)=>Object.fromEntries(keys.filter(k=>!equal(a?.[k],b?.[k])).map(k=>[k,b?.[k]??null]));
const deltaObject=(a,b)=>changed(a,b,[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])]);
const nonempty=obj=>Object.keys(obj).length>0;
const conflict=msg=>{throw Object.assign(new Error(msg),{status:409});};
const encode=encodeURIComponent;
const dateOnly=v=>v instanceof Date?
  [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-'):
  (v?.$date||String(v||'')).slice(0,10)||null;
const sourceProgram=response=>({applies:'applies',unsure:'unsure',no:'does_not_apply',retired:'retired'})[response];
const fieldSets={contacts:['name','email','role'],assets:['name','asset_type','owner_id','criticality','location','status']};
const sourceTables={contacts:'contacts',assets:'systems'};
const ids={contacts:'contact_id',assets:'asset_id'};
const assessmentFields=['status','verification','implementation','owner_id','soa_applicability','soa_justification','na_rationale'];
const ticketFields=['cwRec','cwUrl','cwTitle','ivsSetup','noTicket'];

function rowsFor(state,cid,key){return (state[key]||[]).filter(row=>row.client_id===cid);}
function requireScoped(row,cid,id,key){if(!row||row.client_id!==cid||id!=null&&row[key]!==id)conflict('The current native record could not be verified. Reopen this client.');return row;}
function versioned(row){return {expected_updated_at:row?.updated_at??null};}
function selectClient(source,sourceId,options) {
  const client=source.clients.find(c=>c.id===sourceId);
  if(!client)return {client:null,records:{}};
  const records=approvedV3Records({...source,clients:[client]}, {...options,clientFieldsOnly:true});
  return {client,records,normalized:records.clients[0]};
}
function actualPerson(name,userIds) {
  if(!name||name==='Unassigned')return null;
  const id=userIds instanceof Map?userIds.get(name):userIds?.[name];
  if(!id)conflict('Choose a current platform user with access to this client.');
  return id;
}
function remember(maps,cid,table,rawId,nativeId) {
  if(rawId==null||!nativeId)conflict('A saved record did not return its identity.');
  const scoped=maps.recordIds[cid]||=Object.create(null);
  (scoped[table]||=Object.create(null))[rawId]=nativeId;
}

// Newly added rows have no source-generated ID. Allocate a stable alias before
// normalization, including when the operator removed a different row in this save.
function assignNewRegisterKeys(before,after,sourceId,cid,maps) {
  const displayed=before.records?.[sourceId],edited=after.records?.[sourceId];
  if(!displayed||!edited)return;
  for(const [table,key] of Object.entries(sourceTables)) {
    if(!Array.isArray(edited[key])||equal(displayed[key],edited[key]))continue;
    const known=new Set([...Object.keys(maps.recordIds[cid]?.[table]||{}),
      ...(displayed[key]||[]).map((r,i)=>String(r.sourceRecordId??r.wfId??i+1)),
      ...edited[key].map(r=>String(r.sourceRecordId??r.wfId??''))]);
    let next=1;
    for(const row of edited[key])if(row.sourceRecordId==null&&row.wfId==null&&displayed.nativeSourceIdentities) {
      while(known.has('new_'+next))next++;
      row.sourceRecordId='new_'+next++;known.add(row.sourceRecordId);
    }
  }
}

function sharedReviewTitles(plan) {
  const equivalents=plan.baseline_key?Object.values(CATALOGS).flatMap(catalog=>catalog.review_plans)
    .filter(other=>other.baseline_key===plan.baseline_key):[];
  return new Set([...plan.drivers,...equivalents].flatMap(driver=>[driver.title,driver.ig3_title,driver.level_one_title])
    .filter(Boolean).map(title=>title.toLowerCase()));
}

function sharedReviewConfigurations(draft,scope,priorDraft) {
  const framework_reviews={};
  for(const plan of sharedFrameworkPlans(scope)) {
    const titles=sharedReviewTitles(plan);
    const entries=Object.entries(draft.rev||{}).filter(([title])=>titles.has(title.toLowerCase()));
    const old=title=>priorDraft?.rev?.[title];
    const one=values=>{
      if(values.some(value=>!equal(value,values[0])))conflict('Choose one cadence and first due date for shared Review: '+plan.title);
      return values[0];
    };
    const cadence=entry=>({recurrence:entry.cad,...(entry.cad==='custom'?{custom_recurrence_days:Number(entry.days)}:{})});
    const changedEnabled=entries.filter(([title,entry])=>old(title)&&!!entry.inc!==!!old(title).inc);
    const enabled=one((changedEnabled.length?changedEnabled:entries).map(([,entry])=>!!entry.inc))||false;
    let config={enabled};
    if(enabled){
      const explicit=entries.filter(([,entry])=>entry._auto===false||entry.cad==='custom');
      const changed=explicit.filter(([title,entry])=>!equal(cadence(entry),old(title)&&cadence(old(title))));
      const chosen=changed.length?changed:explicit;
      const automatic=entries.map(([,entry])=>cadence(entry));
      const defaults=reviewConfig(scope,plan);
      const schedule=chosen.length?one(chosen.map(([,entry])=>cadence(entry))):
        automatic.every(value=>equal(value,automatic[0]))?automatic[0]:{recurrence:defaults.recurrence,
          ...(defaults.recurrence==='custom'?{custom_recurrence_days:defaults.custom_recurrence_days}:{})};
      const changedDates=entries.filter(([title,entry])=>old(title)&&(entry.due||'')!==(old(title).due||''));
      const dates=(changedDates.length?changedDates:entries.filter(([,entry])=>entry.due)).map(([,entry])=>entry.due||'');
      config={enabled,...schedule,due_date:one(dates)||null};
      for(const [,entry] of entries){
        if(entry.cad!==schedule.recurrence||chosen.length)entry._auto=false;
        entry.cad=schedule.recurrence;entry.due=config.due_date||'';
        if(schedule.recurrence==='custom')entry.days=schedule.custom_recurrence_days;
      }
    }
    for(const [,entry] of entries)entry.inc=enabled;
    for(const driver of plan.drivers)framework_reviews[driver.key]={...config};
  }
  return framework_reviews;
}

function intakeState(source,client,previous,priorDraft) {
  const draft=source.onboarding?.[client.id]||{},policies={},reviews=[];
  const programs=Object.fromEntries(Object.entries(frameworkKeys).map(([key,fk])=>[fk,
    sourceProgram(draft.prog?.[key]) || ((client.progs||[]).some(p=>p.k===key&&!p.retired)?'applies':'does_not_apply')]));
  const settings={};
  for(const p of client.progs||[]) {
    if(p.k==='cis')settings['cis-ig1']={implementation_group:p.ig||1};
    if(p.k==='cmmc')settings.cmmc={level:p.level??2};
  }
  if(programs['cis-ig1']==='applies')settings['cis-ig1']||={implementation_group:draft.ig||1};
  if(programs.cmmc==='applies')settings.cmmc||={level:draft.cmmc??2};
  const policyMap=new Map(baselineCatalog.policies.map(p=>[p.name.toLowerCase(),p.key]));
  for(const [title,selection] of Object.entries(draft.pol||{})) {
    if(!selection.inc)continue;
    const key=policyMap.get(title.toLowerCase());
    if(key)policies[key]=({have:'yes',missing:'no',unsure:'unsure'})[selection.ans]||'';
  }
  const framework_reviews=sharedReviewConfigurations(draft,{requirements:programs,framework_settings:settings},priorDraft);
  for(const plan of baselineCatalog.reviews)if(draft.gen?.[plan.name]?.inc)reviews.push(plan.key);
  return {...pick(previous,['version']),version:3,step:Math.min(3,Math.max(0,(draft.step||1)-1)),
    completed:!!client.onboarded,requirements:programs,selected_policy_keys:Object.keys(policies),policies,
    framework_settings:settings,framework_reviews,reviews};
}

export function approvedOnboardingPlan(rows,draft,priorDraft) {
  const current=JSON.parse(JSON.stringify(draft));
  const scope={requirements:Object.fromEntries(Object.entries(frameworkKeys).map(([key,fk])=>[fk,sourceProgram(current.prog?.[key])||'does_not_apply'])),
    framework_settings:{'cis-ig1':{implementation_group:current.ig||1},cmmc:{level:current.cmmc??2}}};
  const groups=sharedFrameworkPlans(scope),configs=sharedReviewConfigurations(current,scope,priorDraft);
  const result=[],shared=new Map();
  for(const row of rows){
    const titles=[row.t,row.templateKey].filter(Boolean).map(title=>title.toLowerCase());
    const generic=row.gen&&baselineCatalog.reviews.find(plan=>[plan.name,...(plan.aliases||[])].some(title=>titles.includes(title.toLowerCase())));
    const matches=groups.filter(plan=>row.gen?generic&&plan.baseline_key===generic.key&&configs[plan.key]?.enabled:
      [...sharedReviewTitles(plan)].some(title=>titles.includes(title)));
    if(matches.length>1)conflict('The source Review matches more than one shared activity: '+row.t);
    const plan=matches[0];
    if(!plan){result.push({...row});continue;}
    const config=configs[plan.key];
    if(!config.enabled)continue;
    const key=plan.baseline_key||plan.key;
    if(!shared.has(key)){
      const merged={...row,cad:config.recurrence,days:config.custom_recurrence_days??row.days,due:config.due_date||'',
        from:[...(row.from||[])],maps:[...(row.maps||[])]};
      shared.set(key,merged);result.push(merged);
    }else{
      const merged=shared.get(key);
      merged.from=[...new Set(merged.from.concat(row.from||[]))];
      const known=new Set(merged.maps.map(map=>JSON.stringify(map)));
      for(const map of row.maps||[])if(!known.has(JSON.stringify(map))){merged.maps.push(map);known.add(JSON.stringify(map));}
    }
  }
  return result;
}

function recordPlans(table,prior,next,records,sourceRows,cid) {
  const field=ids[table],before=rowsFor(prior,cid,table),after=rowsFor(next,cid,table);
  const native=new Map(rowsFor(records,cid,table).map(row=>[row[field],row]));
  const was=new Map(before.map(row=>[String(row.source_record_id),row]));
  const now=new Set(),ops=[];
  for(const [index,row] of after.entries()) {
    const key=String(row.source_record_id),old=was.get(key),sourceRow=sourceRows[index],nativeId=row[field];
    if(now.has(key))conflict('Two '+table+' records have the same source identity. Reload the register.');
    now.add(key);
    if(!old) {
      ops.push({table,sourceRow,key,body:{client_id:cid,...pick(row,fieldSets[table])},create:true});
      continue;
    }
    const body=changed(old,row,fieldSets[table]);
    if(!nonempty(body))continue;
    const saved=requireScoped(native.get(nativeId),cid,nativeId,field);
    ops.push({table,sourceRow,key,id:nativeId,body:{...body,...versioned(saved)}});
  }
  for(const [key,row] of was)if(!now.has(key)) {
    const nativeId=row[field],saved=requireScoped(native.get(nativeId),cid,nativeId,field);
    ops.push({table,key,id:nativeId,body:versioned(saved),remove:true});
  }
  return ops;
}

async function saveGuides(ctx) {
  const {before,after,cid,sourceId,records,api,applied}=ctx;
  for(const [key,checkpoint] of Object.entries(after.guideSaved||{})) {
    const [sourceClient,sourceFramework,ref]=key.split('|');
    if(sourceClient!==sourceId||equal(before.guideSaved?.[key],checkpoint))continue;
    const fk=frameworkKeys[sourceFramework.split(':')[0]];
    const row=rowsFor(records,cid,'framework_assessments').find(a=>a.framework_key===fk&&a.definition_id===ref);
    if(!row)conflict('Reopen this program before saving interview progress.');
    const route='/framework_assessments/'+encode(row.framework_assessment_id)+'/approved-guide';
    const old=before.guideSaved?.[key]||{},reviewed=checkpoint.stage==='applied';
    const {data:result}=await api.put(route,{version:sourceHash,expected_revision:old.nativeRevision??0,
      expected_assessment_token:row.last_saved??row.last_assessed??null,expected_client_updated_at:ctx.version,
      checkpoint:{stage:checkpoint.stage,idx:checkpoint.idx??0,ans:checkpoint.ans||{},draft:checkpoint.draft??null},reviewed});
    if(result.version!==sourceHash||result.revision!==(old.nativeRevision??0)+1||!result.digest)
      conflict('The saved interview revision could not be verified. Reopen the interview.');
    checkpoint.nativeRevision=result.revision;checkpoint.nativeDigest=result.digest;
    if(reviewed)ctx.proposals.set(row.framework_assessment_id,{version:result.version,revision:result.revision,digest:result.digest});
    applied.push('guided:'+row.framework_assessment_id);
  }
}

async function saveSetup(ctx) {
  const {before,after,sourceId,cid,records,api,applied}=ctx;
  const previous=new Map((before.work[sourceId]?.revs||[]).map(r=>[r.id,r]));
  const changes=(after.work[sourceId]?.revs||[]).filter(r=>!ctx.handled.reviews.includes(r.id)&&
    (previous.has(r.id)?ticketFields.some(k=>k==='noTicket'?!!previous.get(r.id)[k]!==!!r[k]:!equal(previous.get(r.id)[k],r[k])):r.ivsSetup));
  const oldExclusions=before.profile[sourceId]?.cov?.ivsRemoved||{},exclusions=after.profile[sourceId]?.cov?.ivsRemoved||{};
  const removals=[...new Set([...Object.keys(oldExclusions),...Object.keys(exclusions)])].filter(k=>!equal(oldExclusions[k],exclusions[k]));
  if(!changes.length&&!removals.length)return;
  const route='/clients/'+encode(cid)+'/iv-setup';
  for(const change of [...changes.map(review=>({review})),...removals.map(key=>({key}))]) {
    const {data}=await api.get(route);
    if(data.client_id!==cid||data.expected_client_updated_at!==(ctx.version??null))conflict('Client setup changed. Reopen iVenture Setup.');
    if(change.review) {
      const r=change.review;
      if(removals.some(key=>key.slice(key.indexOf('|')+1)===r.title)&&ticketFields.filter(k=>k!=='noTicket').every(k=>equal(previous.get(r.id)?.[k],r[k])))continue;
      const native=rowsFor(records,cid,'reviews').find(v=>String(v.source_record_id??v.review_id)===String(r.id));
      const matches=data.activities.filter(a=>native?a.review_id===native.review_id:a.title===r.title);
      if(matches.length!==1||native&&matches[0].expected_updated_at!==(native.updated_at??null))
        conflict('The recurring activity or its review changed. Reopen iVenture Setup.');
      const previousReview=previous.get(r.id),activity=matches[0];
      const noTicketOnly=previousReview&&!!previousReview.noTicket!==!!r.noTicket&&
        ticketFields.filter(key=>key!=='noTicket').every(key=>equal(previousReview[key],r[key]));
      const draft=setupDraft(matches[0],data.expected_client_updated_at);
      const cad=({'':'annual',M:'monthly',Q:'quarterly',S:'semiannual',A:'annual'})[r.cad];
      Object.assign(draft,{recurring_ticket_number:r.cwRec||'',recurring_ticket_url:r.cwUrl||'',recurring_ticket_summary:r.cwTitle||'',
        first_next_due:dateOnly(r.due),notes:r.ivsSetup?.notes||'',cadence:cad||(/^D:\d+$/.test(r.cad)?'custom':draft.cadence),
        custom_days:/^D:\d+$/.test(r.cad)?Number(r.cad.slice(2)):draft.custom_days});
      if(r.noTicket)draft.no_ticket=true;
      const area=after.services?.[sourceId]?.areas?.[draft.area_id];
      if(area?.resp&&area.resp!=='un')draft.responsibility=area.resp;
      if(noTicketOnly){
        // The checkbox delegates this governance Review to the SPM. Technical
        // service responsibility stays unchanged; no fictitious PSA ticket is needed.
        await api.post(route+'/exclusion/'+encode(activity.activity_id),{
          expected_updated_at:activity.expected_updated_at??null,expected_client_updated_at:data.expected_client_updated_at??null,
          excluded:!!r.noTicket,kind:r.noTicket?'spm':null,note:''});
      }else await api.post(route,draft);
      applied.push('setup:'+matches[0].activity_id);
      const {data:updated}=await api.get(route),saved=updated.activities.find(a=>a.activity_id===draft.activity_id);
      if(updated.client_id!==cid||!saved?.review_id||
          (noTicketOnly?!!saved.setup?.no_ticket!==!!r.noTicket:String(saved.setup?.recurring_ticket_number||'')!==String(draft.recurring_ticket_number)))
        conflict('The saved ticket did not match the current review. Reopen iVenture Setup.');
      remember(ctx.maps,cid,'reviews',r.id,saved.review_id);ctx.handled.reviews.push(r.id);
      ctx.version=updated.expected_client_updated_at??null;
    } else {
      const key=change.key,title=key.slice(key.indexOf('|')+1);
      const entries=data.activities.filter(a=>a.activity_id===key||a.title===title);
      if(entries.length!==1)conflict('The saved setup decision has no unique native activity. Reopen its setup record.');
      const entry=entries[0];
      const removal=exclusions[key];
      const note=removal?.why?.split(' — ').slice(1).join(' — ')||'';
      await api.post(route+'/exclusion/'+encode(entry.activity_id),{expected_updated_at:entry.expected_updated_at??null,
        expected_client_updated_at:ctx.version??null,excluded:!!removal,...(removal?{kind:removal.kind,note}:{})});
      applied.push('setup:'+entry.activity_id);
      const {data:updated}=await api.get(route);
      if(updated.client_id!==cid)conflict('Reopen the current client.');
      ctx.version=updated.expected_client_updated_at??null;
    }
  }
}

async function saveEnrollment(ctx,prior,next) {
  const {before,after,sourceId,cid,api,records,applied,maps,handled}=ctx;
  const was=prior.client,is=next.client,client=records.clients?.find(c=>c.client_id===cid);
  const completed=!!is.onboarded&&!was?.onboarded;
  if(completed||is.isNew&&!is.onboarded&&!equal(before.onboarding?.[sourceId],after.onboarding?.[sourceId])) {
    const {data:baseline}=await api.get('/onboarding/baseline',{params:{client_id:cid}});
    if((baseline.state.updated_at??null)!==(client?.onboarding_baseline?.updated_at??null))
      conflict('Onboarding changed since it was opened. Reopen the client.');
    if(completed)for(const [name,version] of Object.entries(baseline.record_versions||{})) {
      if(!version)continue;
      const table=name.split(':')[0],field={policies:'policy_id',requirements:'requirement_id',reviews:'review_id'}[table];
      const current=rowsFor(records,cid,table).find(r=>r[field]===version[field]);
      if(!current||(current.updated_at??null)!==(version.updated_at??null))conflict('An onboarding register changed. Reopen the client.');
    }
    const state=intakeState(after,is,baseline.state,before.onboarding?.[sourceId]);
    await api.post('/onboarding/baseline',{client_id:cid,state,finalize:completed,
      expected_updated_at:baseline.state.updated_at??null,...(completed?{expected_records:baseline.record_versions}:{})});
    applied.push(completed?'onboarding:complete':'onboarding:draft');
    if(completed) {
      // Native intake owns initial records. The SOC scope endpoint owns elective
      // categories and reconciles their definitions only after intake completes.
      const soc=(is.progs||[]).find(p=>p.k==='soc'&&!p.retired);
      if(soc?.cats?.some(category=>category!=='security')) {
        await api.patch('/frameworks/soc-2/configuration',{client_id:cid,categories:nativeSocCategories(soc.cats),
          expected_updated_at:client?.soc_configuration_updated_at??null});
        applied.push('scope:soc-2');
      }
      const {data:handoff}=await api.get('/onboarding/handoff',{params:{client_id:cid}});
      requireScoped(handoff.client,cid);
      const groups=sharedFrameworkPlans(state);
      for(const [table,sourceRows] of [['policies',after.programs[sourceId]?.pols||[]],['reviews',after.work[sourceId]?.revs||[]]]) {
        const field=table==='policies'?'policy_id':'review_id';
        const native=rowsFor(handoff.records||{},cid,table);
        for(const row of sourceRows) {
          const titles=[row.title,row.name,row.supportTemplate].filter(Boolean).map(title=>title.toLowerCase());
          let matches,generic;
          if(table==='reviews'){
            const candidates=groups.filter(plan=>[...sharedReviewTitles(plan)].some(title=>titles.includes(title)));
            if(candidates.length>1)conflict('The source Review matches more than one shared activity. Reopen onboarding.');
            const group=candidates[0],keys=new Set(group?.drivers.map(driver=>driver.key)||[]);
            generic=baselineCatalog.reviews.find(plan=>[plan.name,...(plan.aliases||[])].some(title=>titles.includes(title.toLowerCase())));
            matches=native.filter(saved=>group?keys.has(saved.framework_plan_key)||saved.framework_drivers?.some(driver=>keys.has(driver.framework_plan_key))||
              group.baseline_key&&saved.baseline_key===group.baseline_key:generic?saved.baseline_key===generic.key:titles.includes(saved.title?.toLowerCase()));
          }else{
            const policy=baselineCatalog.policies.find(plan=>[plan.name,...(plan.aliases||[])].some(title=>titles.includes(title.toLowerCase())));
            matches=native.filter(saved=>policy?saved.baseline_key===policy.key:titles.includes(saved.title?.toLowerCase()));
          }
          if(matches.length!==1)conflict('The saved onboarding '+table+' record could not be uniquely verified. Reopen this client.');
          const selection=generic&&after.onboarding?.[sourceId]?.gen?.[generic.name];
          if(table==='reviews'&&row.type==='General GRC'&&selection?.inc&&(selection.due||selection.cad&&selection.cad!=='annual')){
            const path='/reviews/'+encode(matches[0].review_id);
            const {data:current}=await api.get(path);requireScoped(current,cid,matches[0].review_id,'review_id');
            const schedule={...cadencePatch(row.cad),due_date:dateOnly(selection.due)};
            const delta=changed(current,schedule,Object.keys(schedule));
            if(nonempty(delta)){
              const {data:saved}=await api.patch(path,{...delta,...versioned(current),
                expected_occurrence_id:current.current_occurrence_id||'occ_'+current.review_id});
              requireScoped(saved,cid,current.review_id,'review_id');
              if(Object.entries(schedule).some(([key,value])=>!equal(key==='due_date'?dateOnly(saved[key]):saved[key],value)))
                conflict('The saved onboarding Review schedule could not be verified. Reopen this client.');
              Object.assign(matches[0],saved);applied.push('onboarding-review:'+saved.review_id);
            }
          }
          const key=row.wfId||row.id;
          if(key==null)continue;
          remember(maps,cid,table,key,matches[0][field]);handled[table].push(key);
        }
      }
    }
    return;
  }
  if(!was||is.isNew&&!is.onboarded)return;
  for(const [short,fk] of Object.entries(frameworkKeys)) {
    const prev=prior.normalized.onboarding_baseline.requirements[fk];
    const current=next.normalized.onboarding_baseline.requirements[fk];
    if(prev!==current) {
      const req=rowsFor(records,cid,'requirements').find(r=>r.baseline_key===fk);
      const raw=is.progApp?.[short];
      if(raw==='retired')conflict('Complete native program retirement with its effective date and reason.');
      const program=is.progs?.find(p=>p.k===short&&!p.retired);
      await api.patch('/onboarding/programs/'+fk,{client_id:cid,applicability:current,
        ...(program&&short==='cis'?{implementation_group:program.ig||1}:{}),...(program&&short==='cmmc'?{cmmc_level:program.level??2}:{}),...versioned(req)});
      applied.push('program:'+fk);
    }
    const p=was.progs?.find(x=>x.k===short&&!x.retired),n=is.progs?.find(x=>x.k===short&&!x.retired);
    if(!p||!n)continue;
    const field={cis:'implementation_group',cmmc:'level',soc:'categories'}[short],sourceField={cis:'ig',cmmc:'level',soc:'cats'}[short];
    if(!field||equal(p[sourceField],n[sourceField]))continue;
    if(short!=='soc'&&n[sourceField]<p[sourceField])conflict('A scope reduction needs its native effective date, reason and impact confirmation.');
    const version=client?.[{cis:'cis_configuration_updated_at',cmmc:'cmmc_configuration_updated_at',soc:'soc_configuration_updated_at'}[short]]??null;
    const extra=short==='soc'?pick(client?.framework_settings?.[fk],['system_description','period_start','period_end']):{};
    await api.patch('/frameworks/'+fk+'/configuration',{client_id:cid,[field]:short==='soc'?nativeSocCategories(n.cats):n[sourceField],...extra,expected_updated_at:version});
    applied.push('scope:'+fk);
  }
}

function itemOperations(previous,current,native,rawKey) {
  const old=new Map((previous||[]).map(i=>[String(i.id),i])),now=new Map((current||[]).map(i=>[String(i.id),i]));
  const operations=[];
  for(const [id,item] of now) {
    const prior=old.get(id);
    if(!prior) {
      const requestId='approved_v3_item_'+id;
      if(!/^[A-Za-z0-9_-]{16,128}$/.test(requestId))conflict('The interview item has no reusable request identity.');
      operations.push({operation:'add',request_id:requestId,item_type:({Gap:'gap',Confirm:'confirmation',Evidence:'evidence'})[item.kind],text:item.txt});
    } else if(prior.st!==item.st) {
      const saved=native.items_to_address?.find(i=>String(i.source_record_id)===id||i.request_id==='approved_v3_item_'+id||i.item_id===id);
      if(!saved)conflict('The assessment item changed. Reopen '+rawKey+'.');
      operations.push({operation:'resolve',target:{item_id:saved.item_id},state:item.st==='Open'?'open':'resolved',resolution:item.resolution||''});
    } else if(prior.txt!==item.txt)conflict('Use the native assessment item workflow to replace this saved entry.');
  }
  for(const id of old.keys())if(!now.has(id)) {
    const saved=native.items_to_address?.find(i=>String(i.source_record_id)===id||i.request_id==='approved_v3_item_'+id||i.item_id===id);
    if(!saved)conflict('The assessment item changed. Reopen '+rawKey+'.');
    operations.push({operation:'remove',target:{item_id:saved.item_id}});
  }
  return operations;
}

async function sourceCoordination(ctx,row,key) {
  const {after,before,records,cid,sourceId,api}=ctx;
  const answer=after.guideSaved[key]?.ans||{};
  const sourceProfile=after.services?.[sourceId],oldProfile=before.services?.[sourceId];
  const reviewKey=sourceProfile?.assessmentReviews?.[key];
  const tools=Array.isArray(answer.tool)?answer.tool:[];
  if(!reviewKey&&!tools.length)return null;
  const route='/framework_assessments/'+encode(row.framework_assessment_id)+'/service-context';
  const {data:context}=await api.get(route);
  if(context.client_id!==cid||context.expected_client_updated_at!==ctx.version)conflict('The assessment’s shared setup changed. Reopen its interview.');
  const explicit=answer._coord?.nativeActivity;
  if(explicit) {
    if(reviewKey!==explicit.opened?.activity_id)conflict('Choose the exact current recurring activity before applying the interview.');
    const activity=requireSetupActivity({...context,activities:context.candidates},cid,reviewKey,explicit.opened);
    const body=setupActivityBody(activity,ctx.version,explicit.plan);
    delete body.responsibility;
    body.ticket_confirmed=!!answer.ticket&&answer._coord?.defaults?.ticket===undefined;
    addCoordinationTools(body,tools,sourceProfile,oldProfile,context,answer,activity);
    return {body,route,reviewKey:sourceActivityReviewKey(ctx,activity)||reviewKey,activity};
  }
  const sourceReview=after.work[sourceId]?.revs.find(r=>String(r.id)===String(reviewKey));
  const previous=rowsFor(records,cid,'reviews').find(r=>r.review_id===ctx.maps.recordIds[cid]?.reviews?.[reviewKey]||
    String(r.source_record_id??r.review_id)===String(reviewKey));
  const found=reviewKey?context.candidates.filter(a=>previous?a.review_id===previous.review_id:sourceReview&&a.title===sourceReview.title):[];
  if(reviewKey&&(!sourceReview||found.length!==1||previous&&found[0].expected_updated_at!==(previous.updated_at??null)))
    conflict('Choose the exact current recurring activity before applying the interview.');
  const activity=found[0],body=activity?setupDraft(activity,ctx.version):{expected_client_updated_at:ctx.version};
  if(activity) {
    delete body.responsibility;
    const cadence={A:'annual',Y:'annual','':'annual',Q:'quarterly',M:'monthly',S:'semiannual'}[sourceReview.cad];
    Object.assign(body,{recurring_ticket_number:sourceReview.cwRec||'',recurring_ticket_summary:sourceReview.cwTitle||'',
      recurring_ticket_url:sourceReview.cwUrl||'',notes:sourceReview.ivsSetup?.notes||'',
      first_next_due:dateOnly(sourceReview.due),cadence:cadence||'custom',
      custom_days:cadence?null:Number(String(sourceReview.cad).replace(/^D:/,'')),
      ticket_confirmed:!!answer.ticket&&answer._coord?.defaults?.ticket===undefined});
  }
  addCoordinationTools(body,tools,sourceProfile,oldProfile,context,answer,activity);
  return activity||body.area_id?{body,route,reviewKey,activity}:null;
}

function addCoordinationTools(body,tools,sourceProfile,oldProfile,context,answer,activity) {
  if(!tools.length)return;
  const areas=Object.entries(sourceProfile?.areas||{}).filter(([id,area])=>
    tools.every(tool=>area.tools.includes(tool))&&!equal(oldProfile?.areas?.[id]?.tools,area.tools));
  const area=areas.length===1?areas[0][0]:activity?.area_id;
  if(!area&&areas.length)conflict('Choose the exact client service area before linking tools.');
  if(!area)return;
  body.area_id=area;body.tool_ids=tools;
  const known=new Set(context.catalog.concat(context.services?.custom_tools||[]).map(tool=>tool.tool_id));
  const created=new Set((answer._customTools||[]).map(tool=>tool.id));
  body.custom_tools=serviceFormFields(sourceProfile).custom_tools.filter(tool=>tools.includes(tool.tool_id)&&created.has(tool.tool_id)&&!known.has(tool.tool_id));
}

function setupActivityBody(activity,clientVersion,plan) {
  const body=setupDraft(activity,clientVersion);
  if(plan.responsibility)body.responsibility=plan.responsibility;
  if(plan.area_id)body.area_id=plan.area_id;
  if(plan.hasTicket!==false&&Object.hasOwn(plan,'ticket'))body.recurring_ticket_number=plan.ticket;
  if(plan.hasUrl!==false&&Object.hasOwn(plan,'url'))body.recurring_ticket_url=plan.url;
  if(plan.hasTitle!==false&&Object.hasOwn(plan,'title'))body.recurring_ticket_summary=plan.title;
  if(plan.notes!==undefined)body.notes=plan.notes;
  if(plan.next)body.first_next_due=plan.next;
  if(plan.cadence!==null&&plan.cadence!==undefined)Object.assign(body,cadencePatch(plan.cadence));
  // cadencePatch uses the Review resource's field names.
  if(body.recurrence){body.cadence=body.recurrence;delete body.recurrence;}
  if(Object.hasOwn(body,'custom_recurrence_days')){body.custom_days=body.custom_recurrence_days;delete body.custom_recurrence_days;}
  return body;
}

function sourceActivityReviewKey(ctx,activity) {
  if(!activity.review_id)return null;
  const row=rowsFor(ctx.records,ctx.cid,'reviews').find(row=>row.review_id===activity.review_id);
  if(!row||(row.updated_at??null)!==(activity.expected_updated_at??null))conflict('The saved shared Review changed. Reload the client.');
  return String(row.source_record_id??row.review_id);
}

async function saveSetupActivities(ctx) {
  for(const command of ctx.commands.filter(row=>['saveSetupActivity','saveSetupExclusion'].includes(row.name))) {
    const [sourceId,activityId,request]=command.args;
    if(sourceId!==ctx.sourceId)conflict('Reopen the current client.');
    const catalog=await loadApprovedSetupCatalog({api:ctx.api,clientId:ctx.cid});
    const activity=requireSetupActivity(catalog,ctx.cid,activityId,request?.opened);
    const sourceReview=sourceActivityReviewKey(ctx,activity);
    if(catalog.expected_client_updated_at!==ctx.version)conflict('The client changed. Reopen its setup form.');
    if(command.name==='saveSetupExclusion'){
      const route='/clients/'+encode(ctx.cid)+'/iv-setup';
      await ctx.api.post(route+'/exclusion/'+encode(activityId),{
        expected_updated_at:activity.expected_updated_at??null,expected_client_updated_at:ctx.version,
        excluded:request.excluded,...(request.excluded?{kind:request.kind,note:request.note||''}:{})});
      const updated=await loadApprovedSetupCatalog({api:ctx.api,clientId:ctx.cid});
      const saved=updated.activities.find(row=>row.activity_id===activityId);
      if(!saved||!!saved.exclusion!==request.excluded)conflict('The saved setup decision could not be verified. Reopen iVenture Setup.');
      if(sourceReview)ctx.handled.reviews.push(sourceReview);
      ctx.version=updated.expected_client_updated_at??null;ctx.applied.push('setup:'+activityId);continue;
    }
    const body=setupActivityBody(activity,ctx.version,request.plan);
    await ctx.api.post('/clients/'+encode(ctx.cid)+'/iv-setup',body);
    const updated=await loadApprovedSetupCatalog({api:ctx.api,clientId:ctx.cid});
    // A newly created activity changes from plan/shared identity to Review
    // identity. Match its complete declared driver identity, never its title.
    const drivers=driverIdentity(activity.drivers);
    const matches=updated.activities.filter(row=>activity.review_id?row.review_id===activity.review_id:driverIdentity(row.drivers)===drivers);
    if(matches.length!==1||['iv','co'].includes(body.responsibility)&&(!matches[0].review_id||
        String(matches[0].setup?.recurring_ticket_number||'')!==String(body.recurring_ticket_number)))
      conflict('The saved recurring activity could not be verified. Reopen iVenture Setup.');
    if(sourceReview&&matches[0].review_id){remember(ctx.maps,ctx.cid,'reviews',sourceReview,matches[0].review_id);ctx.handled.reviews.push(sourceReview);}
    ctx.version=updated.expected_client_updated_at??null;ctx.applied.push('setup:'+matches[0].activity_id);
  }
}

const driverIdentity=drivers=>JSON.stringify(drivers.map(row=>[row.framework_key,row.framework_plan_key]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));

async function saveStandaloneItems(ctx,saved,ops) {
  let revision=saved.items_revision||0;
  const route='/framework_assessments/'+encode(saved.framework_assessment_id)+'/items';
  for(const op of ops) {
    const {operation,target,...fields}=op,body={...fields,expected_revision:revision};
    const url=target?route+'/'+encode(target.item_id):route;
    const result=operation==='add'?await ctx.api.post(url,body):operation==='resolve'?
      await ctx.api.patch(url,body):await ctx.api.post(url+'/remove',body);
    const current=requireScoped(result.data,ctx.cid,saved.framework_assessment_id,'framework_assessment_id');
    if(!Number.isInteger(current.items_revision)||current.items_revision<revision)conflict('The saved assessment item could not be verified.');
    revision=current.items_revision;Object.assign(saved,current);ctx.applied.push('assessment-item:'+saved.framework_assessment_id);
  }
}

async function saveAssessments(ctx,prior,next) {
  const {cid,sourceId,api,before,after,records,applied}=ctx;
  const old=new Map(rowsFor(prior.records,cid,'framework_assessments').map(a=>[a.framework_assessment_id,a]));
  const known=new Map(rowsFor(records,cid,'framework_assessments').map(a=>[a.framework_assessment_id,a]));
  const allKeys=new Set([...Object.keys(before.ita||{}),...Object.keys(after.ita||{}),...Object.keys(after.guideSaved||{})]);
  for(const row of rowsFor(next.records,cid,'framework_assessments')) {
    const id=row.framework_assessment_id,previous=old.get(id);
    if(!previous)continue; // Native enrollment owns new assessment creation.
    const patch=changed(previous,row,assessmentFields);
    const rawKey=[...allKeys].find(key=>{
      const [c,f,ref]=key.split('|');return c===sourceId&&frameworkKeys[f.split(':')[0]]===row.framework_key&&ref===row.definition_id;
    });
    const localChange=rawKey&&!equal(before.ita?.[rawKey],after.ita?.[rawKey]);
    const reviewed=ctx.proposals.get(id);
    if(!nonempty(patch)&&!localChange&&!reviewed)continue;
    const saved=requireScoped(known.get(id),cid,id,'framework_assessment_id');
    const ops=localChange?itemOperations(before.ita[rawKey],after.ita[rawKey],saved,rawKey):[];
    if(Object.hasOwn(patch,'owner_id')) {
      const name=next.client.progs.find(p=>frameworkKeys[p.k]===row.framework_key)?.reg?.items.find(i=>i.id===row.definition_id)?.owner;
      patch.owner_id=actualPerson(after.own[sourceId]?.[name]||name,ctx.userIds);
    }
    const coordination=reviewed?await sourceCoordination(ctx,row,rawKey):null;
    if(reviewed){
      patch.approved_v3_guide=reviewed;patch.implementation=row.implementation;
      if(ops.length)patch.item_draft={expected_revision:saved.items_revision||0,operations:ops};
      if(coordination)patch.coordination=coordination.body;
    }
    if(nonempty(patch)) {
      if(row.framework_key==='soc-2'&&patch.status&&patch.status!=='not_assessed')patch.record_assessment=true;
      const {data:current}=await api.patch('/framework_assessments/'+encode(id),{...patch,
        expected_last_assessed:saved.last_saved??saved.last_assessed??null});
      requireScoped(current,cid,id,'framework_assessment_id');Object.assign(saved,current);applied.push('assessment:'+id);
      if(coordination) {
        const {data:savedContext}=await api.get(coordination.route);
        if(savedContext.client_id!==cid)conflict('Reopen the current client.');
        ctx.version=savedContext.expected_client_updated_at??null;
        if(coordination.activity) {
          const actual=savedContext.candidates.find(a=>a.activity_id===savedContext.selected_activity_id);
          if(!actual?.review_id)conflict('The saved review identity could not be verified.');
          remember(ctx.maps,cid,'reviews',coordination.reviewKey,actual.review_id);ctx.handled.reviews.push(coordination.reviewKey);
        }
      }
    }
    if(ops.length&&!reviewed)await saveStandaloneItems(ctx,saved,ops);
  }
}

export async function applyClientChanges({before,after,records,clientId,sourceId,api,identityMaps,userIds={},commands=[]}) {
  const maps=identityMaps||approvedV3IdentityMaps(records),applied=[],handled={policies:[],reviews:[]};
  maps.clientIds||=Object.create(null);maps.recordIds||=Object.create(null);
  const ctx={before,after,records,sourceId,api,maps,applied,handled,commands,userIds,cid:clientId,version:null,proposals:new Map()};
  try {
    const afterClient=after.clients.find(c=>c.id===sourceId),beforeClient=before.clients.find(c=>c.id===sourceId);
    if(!afterClient)conflict('Archive this client through the native client management workflow.');
    if(!beforeClient&&!clientId) {
      if(afterClient.isNew!==true)conflict('The new client form could not be verified.');
      const contact=after.records[sourceId]?.contacts?.find(c=>c.primary);
      const response=await api.post('/v3/approved-portfolio/clients',{source_id:sourceId,client:{name:afterClient.name,industry:afterClient.industry||'',environment:afterClient.env||'Production',
        status:afterClient.status.toLowerCase(),logo_url:afterClient.logoUrl||null,assigned_owner_id:actualPerson(afterClient.lead,userIds),
        ...(contact?{primary_contact_details:{name:contact.name,email:contact.email||null,title:contact.role||null}}:{})}});
      const created=response.data;
      if(!created?.client_id)conflict('A saved client identity could not be verified.');
      ctx.cid=created.client_id;maps.clientIds[sourceId]=ctx.cid;applied.push('client:'+ctx.cid);
      if(contact&&created.primary_contact_id) {
        const key=String(contact.sourceRecordId??contact.wfId??after.records[sourceId].contacts.indexOf(contact)+1);
        remember(maps,ctx.cid,'contacts',key,created.primary_contact_id);contact.sourceRecordId=key;
      }
      return {clientId:ctx.cid,sourceId,identityMaps:maps,applied,handled};
    }
    const cid=ctx.cid||maps.clientIds[sourceId],client=requireScoped(records.clients?.find(c=>c.client_id===cid),cid);
    if(client.source_client_id&&client.source_client_id!==sourceId||maps.clientIds[sourceId]&&maps.clientIds[sourceId]!==cid)
      conflict('The source client does not correspond to the selected native client.');
    ctx.cid=cid;maps.clientIds[sourceId]=cid;ctx.version=client.updated_at??null;
    assignNewRegisterKeys(before,after,sourceId,cid,maps);
    const prior=selectClient(before,sourceId,maps),next=selectClient(after,sourceId,maps);
    if(!prior.client)conflict('Reload the saved client before continuing.');
    const changedTables=[];
    for(const table of ['contacts','assets']) {
      const key=sourceTables[table],oldList=before.records?.[sourceId]?.[key],newList=after.records?.[sourceId]?.[key];
      if(equal(oldList,newList))continue;
      if(!Array.isArray(oldList)||!Array.isArray(newList))conflict('The complete client register is required.');
      const ops=recordPlans(table,prior.records,next.records,records,newList,cid);
      for(const op of ops) {
        if(table==='assets'&&('owner_id' in op.body))op.body.owner_id=actualPerson(op.sourceRow?.owner,userIds);
      }
      changedTables.push(...ops);
    }
    for(const op of changedTables.filter(o=>!o.remove)) {
      const route='/'+op.table,field=ids[op.table];
      const response=op.create?await api.post(route,op.body):await api.patch(route+'/'+encode(op.id),op.body);
      const saved=requireScoped(response.data,cid,op.id,field);
      remember(maps,cid,op.table,op.key,saved[field]);op.sourceRow.sourceRecordId=op.key;
      applied.push(op.table+':'+saved[field]);
    }
    const patch=changed(prior.normalized,next.normalized,['name','industry','status','environment','logo_url','primary_contact_id']);
    if(beforeClient.lead!==afterClient.lead)patch.assigned_owner_id=actualPerson(afterClient.lead,userIds)||'';
    if(Object.hasOwn(patch,'primary_contact_id')) {
      const primary=(after.records[sourceId]?.contacts||[]).find(c=>c.primary);
      patch.primary_contact_id=primary?(maps.recordIds[cid]?.contacts?.[primary.sourceRecordId]||next.normalized.primary_contact_id):'';
    }
    if(Object.hasOwn(patch,'logo_url')&&!patch.logo_url)patch.logo_url='';
    if(nonempty(patch)) {
      const {data:saved}=await api.patch('/clients/'+encode(cid),{...patch,expected_updated_at:ctx.version});
      requireScoped(saved,cid);Object.assign(client,saved);ctx.version=saved.updated_at??null;applied.push('client:'+cid);
    }
    for(const op of changedTables.filter(o=>o.remove)) {
      await api.delete('/'+op.table+'/'+encode(op.id),{data:op.body});applied.push(op.table+':'+op.id);
    }
    const profileRoute='/clients/'+encode(cid)+'/profile';
    for(const section of ['organization','technical','security','scope']) {
      const values=deltaObject(prior.normalized.profile[section],next.normalized.profile[section]);
      const confirm=section==='scope'&&!equal(prior.normalized.profile_scope_confirmation,next.normalized.profile_scope_confirmation);
      if(!nonempty(values)&&!confirm)continue;
      await api.patch(profileRoute,{section,values,expected_updated_at:ctx.version});
      applied.push('profile:'+section);
      const {data:saved}=await api.get(profileRoute);requireScoped(saved,cid);
      if(Object.entries(values).some(([k,v])=>!equal(saved.profile?.[section]?.[k],v)))
        conflict('The saved profile changed before the next edit. Reopen the client.');
      client.profile=saved.profile;client.profile_scope_confirmation=saved.scope_confirmation;ctx.version=saved.updated_at??null;
    }
    await saveEnrollment(ctx,prior,next);
    await saveGuides(ctx);
    await saveAssessments(ctx,prior,next);
    await saveSetupActivities(ctx);
    await saveSetup(ctx);
    client.updated_at=ctx.version;
    return {clientId:cid,sourceId,identityMaps:maps,applied,handled};
  } catch(error) {
    error.applied=[...(error.applied||[]),...applied];error.clientId=ctx.cid;throw error;
  }
}
