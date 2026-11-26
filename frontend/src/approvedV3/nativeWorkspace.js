import api, {formatError, setWorkspaceMode} from '../lib/api';
import {recordUuid} from '../lib/recordUuid';
import {stableJson} from '../lib/stableJson';
import {approvedV3IdentityMaps, overlayApprovedClientAssessments,approvedHipaaSupplement} from '../preview/approvedV3Records';
import {overlayApprovedV3Work} from '../preview/approvedV3Work';
import {overlayApprovedV3Registers} from '../preview/approvedV3Registers';
import {applyClientChanges,approvedOnboardingPlan} from './clientCommands';
import {applyRegisterChanges} from './registerCommands';
import {applyWorkChanges} from './workCommands';
import {prepareReviewGuide, downloadApprovedEvidence,loadApprovedEvidenceCatalog,downloadApprovedEvidenceArchive} from './workGuidance';
import {applyCmmcChanges, overlayCmmcWorkbook, downloadApprovedCmmc} from './cmmcCommands';
import {overlayNativeAudit} from './auditProjection';
import {loadGlobalRecords,overlayGlobalRecords,applyGlobalChanges} from './adminCommands';
import {createApprovedReportDownloader} from './reportDownloads';

const endpoint = '/v3/approved-portfolio';
const draftFields = ['itemHist','itemExtra','onboarding','activity'];

export function reviveState(value) {
  return JSON.parse(JSON.stringify(value,function(key,item){
    return this[key] instanceof Date?{$date:this[key].toISOString()}:item;
  }), (_, item) => item && typeof item === 'object'
    && Object.keys(item).length === 1 && typeof item.$date === 'string' ? new Date(item.$date) : item);
}

function dateEnvelope(value) {
  return JSON.parse(JSON.stringify(value, function(key,item) {
    return this[key] instanceof Date ? {$date:this[key].toISOString()} : item;
  }));
}

// Keep open forms' references valid when a failed save reloads their saved record.
export function reconcileView(current, incoming) {
  if (incoming instanceof Date) return new Date(incoming);
  if (!incoming || typeof incoming !== 'object') return incoming;
  if (!current || typeof current !== 'object' || Object.isFrozen(current)
      || Array.isArray(current) !== Array.isArray(incoming)) return incoming;
  if (Array.isArray(incoming)) {
    const key = row => row?.wfId || row?.id || row?.sourceRecordId || row?.occurrenceId || row?.email || undefined;
    const existing = new Map(current.map((row,index) => [key(row) ?? index,row]));
    current.splice(0,current.length,...incoming.map((row,index) =>
      reconcileView(existing.get(key(row) ?? index),row)));
    return current;
  }
  for (const key of Object.keys(current)) if (!Object.hasOwn(incoming,key)) delete current[key];
  for (const [key,value] of Object.entries(incoming)) current[key] = reconcileView(current[key],value);
  return current;
}

function allRecords(recordsByClient) {
  const combined = {};
  for (const tables of Object.values(recordsByClient)) for (const [table,rows] of Object.entries(tables)) {
    if (Array.isArray(rows)) (combined[table] ||= []).push(...rows);
  }
  if (combined.users) combined.users = [...new Map(combined.users.map(row=>[row.user_id,row])).values()];
  return combined;
}

function mergeHandled(target, incoming={}) {
  for (const [kind,ids] of Object.entries(incoming)) {
    target[kind] = [...new Set([...(target[kind] || []),...ids])];
  }
}

function clientDraft(state, sourceId) {
  return Object.fromEntries(draftFields.map(field => [field,
    Object.fromEntries(Object.entries(state[field] || {}).filter(([key])=>key.split('|')[0]===sourceId))
  ]).filter(([,values])=>Object.keys(values).length));
}

function clientMaterial(state, sourceId) {
  const client=state.clients.find(client=>client.id===sourceId);
  const result = {client:client&&Object.fromEntries(['id','name','industry','lead','env','status','logoUrl','isNew','onboarded','progApp']
    .map(key=>[key,client[key]]))};
  if(client)result.client.progs=(client.progs || []).map(({nativeCmmcReadiness,domains,positions,...program})=>program);
  for (const field of ['work','programs','records','profile','own','services','onboarding']) {
    result[field] = state[field]?.[sourceId];
  }
  // Contact access badges come from the current user directory during rendering.
  // Reading those badges must not turn navigation into a client-record save.
  if(result.records)result.records={...result.records,contacts:result.records.contacts?.map(
    ({accountStatus,invited,...contact})=>contact)};
  result.evidence={rows:state.evidence?.[sourceId]?.rows};
  for (const field of draftFields) result[field] = clientDraft(state,sourceId)[field];
  for (const field of ['guideSaved','itemCur','ita','checklists']) result[field] =
    Object.fromEntries(Object.entries(state[field] || {}).filter(([key])=>key.split('|')[0]===sourceId));
  return stableJson(result);
}

export function workspaceMaterial(state) {
  return stableJson({clients:(state.clients || []).map(client=>client.id).sort()
    .map(id=>[id,clientMaterial(state,id)]),account:state.account,users:state.users,tools:state.toolCatalog});
}

const accessScope=account=>stableJson({role:account.role,status:account.status,all_clients:!!account.all_clients,
  client_ids:[...(account.client_ids || [])].sort()});

export function eligiblePeople(members, actor) {
  const ids = Object.create(null), ambiguous = new Set();
  for (const person of members) {
    if (person.status!=='active' || person.reference_only || person.assignment_eligible===false ||
        !['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(person.role)) continue;
    if (person.name) {
      if (ids[person.name] && ids[person.name]!==person.user_id) ambiguous.add(person.name);
      ids[person.name] = person.user_id;
    }
    if (person.email) ids[person.email] = person.user_id;
  }
  for (const name of ambiguous) delete ids[name];
  // The signed-in account is verified again before any write. Duplicate display
  // names remain ambiguous; an email is always an explicit identity.
  if (actor.email) ids[actor.email] = actor.user_id;
  if (actor.name && !ambiguous.has(actor.name)) ids[actor.name] = actor.user_id;
  return ids;
}

export function reviewForAction(element, records) {
  const action=element.dataset.action,id=element.dataset.id;
  let nativeId;
  if (['open-rev','rev-complete','rev-complete-dlg'].includes(action) ||
      action==='cal-ev'&&element.dataset.kind==='rev') {
    nativeId=(records.reviews || []).find(row=>row.source_record_id===id || row.review_id===id)?.review_id;
  } else if (['risk-review','risk-review-dlg'].includes(action)) {
    nativeId=(records.risks || []).find(row=>row.source_record_id===id || row.risk_id===id || row.display_id===id)?.linked_review_id;
  }
  return (records.reviews || []).find(row=>row.review_id===nativeId)?.source_record_id || nativeId;
}

export function nativeTransport(base, pendingRequests) {
  const wrapped = Object.create(base);
  for (const method of ['post','put','patch']) wrapped[method] = (path, body, config={}) => {
    const fingerprint = 'transport:'+method+':'+path+':'+stableJson(body ?? null);
    if (!pendingRequests.has(fingerprint)) pendingRequests.set(fingerprint,recordUuid());
    return base[method](path,body,{...config,headers:{
      ...config.headers,'Idempotency-Key':config.headers?.['Idempotency-Key'] || pendingRequests.get(fingerprint),
    }});
  };
  return wrapped;
}

export async function startNativeWorkspace(page, transport=api) {
  setWorkspaceMode('standard');
  let saving = false, ready = false, scheduled = null, pending = null, baseline = null;
  let packet, identityMaps, nativeRecords, actor, globals;
  const captured = [], files = new Map();
  let pendingRequests = new Map();
  const downloadReport=createApprovedReportDownloader({api:transport,getScope:()=>{
    const {sourceId}=page.context(),clientId=identityMaps?.clientIds?.[sourceId];
    return {sourceId,clientId,actorId:actor?.user_id,records:nativeRecords?.[clientId],ready:ready&&!saving&&!pending};
  },status});

  function status(message) { page.status(message); }
  function project(view) {
    const result = reviveState(view);
    for (const draft of Object.values(packet.drafts || {})) {
      for (const field of draftFields) Object.assign(result[field] ||= {},reviveState(draft.view?.[field] || {}));
    }
    for (const [cid,records] of Object.entries(nativeRecords)) {
      const sourceId = records.clients[0].source_client_id;
      const names = new Map(records.users.map(row=>[row.user_id,row.name]));
      const context = {clientId:cid,sourceId,userName:id=>names.get(id) || null,liveDates:true,asOfDate:page.clock?.() || new Date()};
      page.prepareClient?.(result,sourceId,records);
      overlayApprovedClientAssessments(result,records,{asOfDate:page.clock?.() || new Date()});
      overlayApprovedV3Work(result,records,context);
      overlayApprovedV3Registers(result,records,context);
      if (records.cmmcWorkbook) overlayCmmcWorkbook(result,records.cmmcWorkbook,{...context,identityMaps,records});
      overlayNativeAudit(result,records,context);
    }
    overlayGlobalRecords(result,globals,identityMaps,nativeRecords);
    return result;
  }

  async function refreshRecords(clientIds) {
    for (const cid of clientIds) {
      const {data} = await transport.get(endpoint+'/records',{params:{client_id:cid}});
      if (data.client_id!==cid || !data.records?.clients?.some(row=>row.client_id===cid)) {
        throw new Error('The saved records could not be verified for this client.');
      }
      nativeRecords[cid] = data.records;
      await refreshCmmc(cid);
      nativeRecords[cid].evidenceCatalog=await loadApprovedEvidenceCatalog({api:transport,clientId:cid});
    }
    identityMaps = approvedV3IdentityMaps(allRecords(nativeRecords));
  }

  async function refreshCmmc(cid) {
    const records = nativeRecords[cid];
    if (!(records.requirements || []).some(row=>row.baseline_key==='cmmc'&&row.baseline_response==='applies')) {
      delete records.cmmcWorkbook;
      return;
    }
    const {data} = await transport.get('/frameworks/cmmc/workbook',{params:{client_id:cid}});
    if (data.client?.client_id!==cid || data.records?.client_id!==cid) {
      throw new Error('The CMMC workbook did not match the selected client.');
    }
    records.cmmcWorkbook = data;
  }

  async function saveDraft(view, before, sourceId, cid, requests) {
    const draft = clientDraft(view,sourceId);
    if (stableJson(draft)===stableJson(clientDraft(before,sourceId))) return;
    const current = packet.drafts[cid] || {client_id:cid,revision:0,view:{}};
    if (stableJson(draft)===stableJson(current.view)) return;
    const payload = {client_id:cid,expected_revision:current.revision,view:dateEnvelope(draft)};
    const {data} = await requests.put(endpoint+'/view-draft',payload);
    if (data.client_id!==cid || data.revision!==current.revision+1) {
      throw new Error('The saved draft response did not match this client.');
    }
    packet.drafts[cid] = data;
  }

  async function reloadScope() {
    const {data:reloaded}=await transport.get(endpoint+'/bootstrap');
    if (!ready || reloaded.actor?.user_id!==actor.user_id || !reloaded.initialized) {
      ready=false;
      throw new Error('Sign in again to load the current account and access.');
    }
    packet=reloaded;nativeRecords=packet.records;
    identityMaps=approvedV3IdentityMaps(allRecords(nativeRecords));
    for(const cid of Object.keys(nativeRecords))await refreshCmmc(cid);
    await Promise.all(Object.entries(nativeRecords).map(async([cid,records])=>{
      records.evidenceCatalog=await loadApprovedEvidenceCatalog({api:transport,clientId:cid});
    }));
    globals=await loadGlobalRecords(transport,packet.actor);
    actor=packet.actor;
    return packet.source_state;
  }

  async function flush() {
    if (!ready || saving || !pending) return;
    const edit = pending;
    pending = null;
    const commands = captured.splice(0);
    const before = baseline;
    saving = true;
    document.body.setAttribute('aria-busy','true');
    status('Saving changes…');
    const requests = nativeTransport(transport,pendingRequests);
    const affected = new Set();
    try {
      const {data:account} = await transport.get('/auth/me');
      if ((account.user_id || account.user?.user_id)!==actor.user_id) {
        ready=false;
        throw new Error('The signed-in account changed. Sign in again before saving.');
      }
      if(accessScope(account)!==accessScope(globals.account)) {
        throw new Error('Your account access changed. The workspace has reloaded; reopen the record before saving.');
      }
      const globalResult=await applyGlobalChanges({before,after:edit.state,globals,actor,api:requests,identityMaps,commands});
      const sourceIds = [...new Set([...before.clients,...edit.state.clients].map(client=>client.id))];
      for (const sourceId of sourceIds) {
        const scopedCommands = commands.filter(command=>command.args?.[0]===sourceId);
        if (!scopedCommands.length && clientMaterial(before,sourceId)===clientMaterial(edit.state,sourceId)) continue;
        let clientId = identityMaps.clientIds[sourceId];
        if (clientId) affected.add(clientId);
        let records = nativeRecords[clientId] || {};
        const members = clientId ? (records.users || []) : globals.users.filter(person=>
          person.role==='super_admin' || person.role==='platform_admin'&&person.all_clients);
        const userIds = eligiblePeople(members,actor);
        const handled = {};
        const context = {before,after:edit.state,records,clientId,sourceId,api:requests,
          identityMaps,userIds,commands:scopedCommands,pendingRequests,
          files:new Map((files.get(sourceId)||[]).map(file=>[file.name,file])),handled};
        const clientResult = await applyClientChanges(context);
        clientId = clientResult.clientId || clientId;
        identityMaps = clientResult.identityMaps || identityMaps;
        context.clientId = clientId;
        context.identityMaps = identityMaps;
        mergeHandled(handled,clientResult.handled);
        if (clientId) {
          affected.add(clientId);
          if (!nativeRecords[clientId]) {
            await refreshRecords([clientId]);
            records = nativeRecords[clientId];
            context.records = records;
          }
        }
        const registerResult = await applyRegisterChanges(context);
        mergeHandled(handled,registerResult.handled);
        const cmmcResult = await applyCmmcChanges(context);
        mergeHandled(handled,cmmcResult.handled);
        const workResult = await applyWorkChanges(context);
        mergeHandled(handled,workResult.handled);
        if (clientId) await saveDraft(edit.state,before,sourceId,clientId,requests);
      }
      let savedState=edit.state;
      if(globalResult.didWrite)savedState=await reloadScope();
      else{
        await refreshRecords([...affected]);
        globals=await loadGlobalRecords(transport,actor);
      }
      const saved = project(savedState);
      page.actor(globals.account,saved.clients.map(client=>client.id));
      page.apply(saved,reconcileView);
      baseline = page.snapshot();
      files.clear();
      pendingRequests = new Map();
      page.finish(true,globalResult.message || undefined);
    } catch (error) {
      if (error.clientId) affected.add(error.clientId);
      try {
        // Re-bootstrap captures membership changes, concurrent private drafts,
        // and a client created successfully before a later operation failed.
        const saved = project(await reloadScope());
        page.actor(globals.account,saved.clients.map(client=>client.id));
        page.apply(saved,reconcileView);
        baseline = page.snapshot();
      } catch {
        ready = false;
      }
      page.finish(false,formatError(error));
      if(!ready)page.fail?.('The saved workspace could not be verified. Sign in again to reload your current access.');
    } finally {
      saving = false;
      if(!pending || !ready)document.body.removeAttribute('aria-busy');
      if (pending && ready) scheduled = window.setTimeout(flush,0);
    }
  }

  page.configure({
    hipaaSupplement:approvedHipaaSupplement,
    onboardingPlan:(rows,draft)=>{
      try{return approvedOnboardingPlan(rows,draft,baseline?.onboarding?.[page.context().sourceId]);}
      catch(error){
        if(error.status!==409)throw error;
        // Keep conflicting drafts editable; the native save still rejects them.
        status(formatError(error));return rows;
      }
    },
    busy:()=>saving || !!pending,
    command:(name,args)=>captured.push({name,args}),
    persist:(state,sourceId)=>{
      if (!ready) return false;
      if (!saving && !captured.length && baseline && workspaceMaterial(state)===workspaceMaterial(baseline)) {
        // Navigation and filters use the source's persistence callback too.
        // An unchanged snapshot must not redraw an open, unsaved form.
        pending=null;window.clearTimeout(scheduled);page.noop?.();
        document.body.removeAttribute('aria-busy');
        return true;
      }
      pending = {state,sourceId};
      document.body.setAttribute('aria-busy','true');
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(flush,120);
      return true;
    },
    downloadEvidence:(sourceId,evidenceId)=>{
      const clientId=identityMaps.clientIds[sourceId];
      return downloadApprovedEvidence({api:transport,records:nativeRecords[clientId],clientId,evidenceId,
        isCurrent:()=>page.context().sourceId===sourceId});
    },
    downloadEvidenceArchive:(sourceId,folder)=>{
      const clientId=identityMaps.clientIds[sourceId];
      return downloadApprovedEvidenceArchive({api:transport,records:nativeRecords[clientId],clientId,sourceId,folder,
        isCurrent:()=>page.context().sourceId===sourceId && ready && !saving && !pending});
    },
    downloadReport,
  });

  document.addEventListener('change',event=>{
    if (event.target instanceof HTMLInputElement && event.target.id==='f-nativeEvidenceFile') {
      const sourceId=page.context().sourceId;
      files.clear();
      if(sourceId)files.set(sourceId,[...(event.target.files || [])]);
    }
  },true);
  const blockWhileSaving = event => {
    if ((!ready || saving || pending) && event.target.closest?.('button,input,select,textarea,[data-action],form,a[href^="#"],[draggable="true"]')
        && !event.target.closest('[data-action="sign-out"],[data-action="menu"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      status(ready?'Wait for the current save to finish.':'Loading saved workspace…');
    }
  };
  window.addEventListener('click',blockWhileSaving,true);
  window.addEventListener('drop',blockWhileSaving,true);
  window.addEventListener('submit',blockWhileSaving,true);
  let replayTarget=null, loadingAction=false;
  window.addEventListener('click',async event=>{
    const element=event.target.closest?.('[data-action]');
    if (!element || element===replayTarget || !ready || saving || pending) return;
    if(['dlg-close','drawer-close'].includes(element.dataset.action))files.clear();
    const initialContext=page.context(),hash=window.location.hash;
    const {sourceId}=initialContext,clientId=identityMaps.clientIds[sourceId];
    const records=nativeRecords[clientId];
    if (!records) return;
    const reviewId=reviewForAction(element,records);
    const kind=({'cmmc-ssp-export':'ssp','cmmc-export-score':'sprs','poam-export':'poam'})[element.dataset.action];
    if (!reviewId && !kind) return;
    event.preventDefault();event.stopImmediatePropagation();
    if (loadingAction) {status('Loading the current saved record…');return;}
    loadingAction=true;
    try {
      if (kind) {
        const program=baseline.clients.find(client=>client.id===sourceId)?.progs?.find(program=>program.k==='cmmc'&&!program.retired);
        await downloadApprovedCmmc({clientId,level:program?.level,kind,api:transport,
          isCurrent:()=>page.context().sourceId===sourceId && ready && !saving && !pending});
        status('Downloaded the current saved CMMC '+(kind==='ssp'?'SSP':kind==='poam'?'POA&M':'SPRS workbook')+'.');
      } else {
        await prepareReviewGuide({api:transport,page,records,clientId,sourceId,reviewId});
        if (!element.isConnected || window.location.hash!==hash || page.context().sourceId!==sourceId ||
            page.context().program!==initialContext.program || saving || pending) {
          throw new Error('Reopen the current review before continuing.');
        }
        // Loading the saved checklist is a read. The source's automatic click
        // persistence must not treat its contract metadata as a new edit.
        const guides=page.snapshot().checklists || {};
        baseline.checklists ||= {};
        for(const [key,value] of Object.entries(guides))if(key.startsWith(sourceId+'|'+reviewId+'|'))
          baseline.checklists[key]=value;
        replayTarget=element;
        element.click();
      }
    } catch (error) {
      status(formatError(error));
    } finally {
      replayTarget=null;loadingAction=false;
    }
  },true);
  window.addEventListener('hashchange',()=>files.clear());
  status('Loading saved workspace…');
  try {
    packet = (await transport.get(endpoint+'/bootstrap')).data;
    if (!packet.initialized) {
      await transport.post(endpoint+'/initialize',{},{
        headers:{'Idempotency-Key':'approved-v3-import-5bb03e1219276a01459f2a44be6da44dc'},
      });
      packet = (await transport.get(endpoint+'/bootstrap')).data;
    }
    if (!packet.initialized || !packet.records || !packet.source_state || !packet.actor?.user_id) {
      throw new Error('The approved native workspace is not ready.');
    }
    actor = packet.actor;
    nativeRecords = packet.records;
    packet.drafts ||= {};
    identityMaps = approvedV3IdentityMaps(allRecords(nativeRecords));
    for (const cid of Object.keys(nativeRecords)) await refreshCmmc(cid);
    await Promise.all(Object.entries(nativeRecords).map(async([cid,records])=>{
      records.evidenceCatalog=await loadApprovedEvidenceCatalog({api:transport,clientId:cid});
    }));
    globals=await loadGlobalRecords(transport,actor);
    const view = project(packet.source_state);
    page.actor(globals.account,view.clients.map(client=>client.id));
    page.apply(view,reconcileView);
    baseline = page.snapshot();
    ready = true;
    page.status('Saved client records loaded.');
  } catch (error) {
    page.fail?.(formatError(error)+' Open Existing records to continue with your saved clients.');
    throw error;
  }
  return {flush,ready:()=>ready,snapshot:()=>baseline,identityMaps:()=>identityMaps};
}

if (window.GoverNaraNativePage) {
  startNativeWorkspace(window.GoverNaraNativePage).catch(()=>{ /* The page displays the failure and keeps editing blocked. */ });
}
