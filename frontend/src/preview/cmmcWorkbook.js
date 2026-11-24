import catalog from '@catalogs/cmmc.json';
import rules from '@catalogs/cmmcWorkbook.json';
import {audit,now} from './store';
import {clientAccess} from './assignmentEligibility';
import {commandRequest,stable} from './commandRequests';
import {strToU8} from 'fflate';
import {assessCmmcRow,cmmcAssetCategories} from '../lib/cmmcWorkspace';
import {canExportReports} from '../lib/permissions';

const fail = (msg,status=422) => {throw Object.assign(new Error(msg),{status});};
const grouped = ['plans','assets','exceptions','decisions'];
const itemSections = ['plans','exceptions','decisions'];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
export function cmmcWorkbookRequest(db, method, params, body) {
  const cid = method === 'get' ? params.client_id : body.client_id;
  if (!clientAccess(db.user,cid)) fail('Forbidden for this client',403);
  const client = db.clients.find(row => row.client_id === cid);
  if (!client || !db.requirements.some(row => row.client_id === cid && row.baseline_key === 'cmmc' && row.baseline_response === 'applies')) fail('CMMC is not active for this client',404);
  if (client._r4_context_pending) fail('Client has an unfinished save',409);
  const level = client.framework_settings?.cmmc?.level || 2;
  const key = JSON.stringify([cid,level]);
  const doc = db.cmmc_workbooks?.[key] || {client_id:cid,level,revision:0};
  const tenant = kind => (db[kind] || []).filter(row => row.client_id === cid);
  const assessments = tenant('framework_assessments').filter(row => row.framework_key === 'cmmc');
  if (assessments.some(row => row._r4_context_pending)) fail('Assessment has an unfinished save',409);
  if (method === 'post') {
    if (!canExportReports(db.user) || db.user.status !== 'active') fail('Account unavailable for report export',403);
    if (!(client.onboarding_baseline?.completed || db.baselines?.[cid]?.completed) || body.level!==level || !['ssp','poam','sprs'].includes(body.kind) || level===1 && body.kind!=='ssp') fail('Current program scope does not support this export',409);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(body.request_id || '')) fail('Invalid export request');
    const result = cmmcWorkbookRequest(db,'get',{client_id:cid},{});
    if(!globalThis.crypto?.subtle)fail('Report hashing is unavailable in this Demo session',503);
    return globalThis.crypto.subtle.digest('SHA-256',strToU8(stable(result))).then(bytes=>{
      const hash=Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
      const prior=db.logs.find(log=>log.action==='prepare-export' && log.user_id===db.user.user_id && log.entity_id===key && log.meta?.kind===body.kind && log.meta?.request_id===body.request_id);
      if(prior && prior.meta.source_hash!==hash)fail('Export sources changed; start a fresh download',409);
      if(!prior)audit(db,'prepare-export','cmmc-workbook',{client_id:cid,title:body.kind.toUpperCase()},{level,kind:body.kind,revision:doc.revision,source_hash:hash,request_id:body.request_id},key);
      return result;
    });
  }
  if (method === 'get') {
    const collections = {files:'evidence',inventory:'assets',tasks:'tasks',reviews:'reviews',findings:'findings',policies:'policies'};
    const records = {...doc};
    records.findingScopes=tenant('framework_assessments').filter(row=>row.framework_key!=='cmmc' && row.related_links?.some(link=>link.kind==='findings'))
      .map(row=>({client_id:cid,framework_assessment_id:row.framework_assessment_id,related_links:row.related_links.filter(link=>link.kind==='findings')}));
    for (const [field,kind] of Object.entries(collections)) {
      const rows = tenant(kind).filter(row=>kind !== 'evidence' || !row.archived_at);
      if (rows.length > 10000) fail('The workbook exceeds the supported record count',413);
      if (rows.some(row=>row._r4_context_pending)) fail('A related record has an unfinished save',409);
      records[field] = rows.map(({content_base64, ...metadata}) => metadata);
    }
    const contact = tenant('contacts').find(row => row.contact_id === client.primary_contact_id);
    const names = Object.fromEntries((db.users || []).filter(user => user.status === 'active' && clientAccess(user,cid)).map(user => [user.user_id,user.name]));
    return {data:{configuration:{level},assessments},records:{...records,toolCatalog:db.r4_tool_catalog || []},
      client:{client_id:cid,name:client.name,status:client.status,primary_contact:contact?.name,assigned_owner_id:client.assigned_owner_id,names,profile:client.profile || {}}};
  }
  if (method !== 'put') fail('Unsupported workbook operation',405);
  if (!['super_admin','platform_admin','client_grc_manager','client_contributor'].includes(db.user.role) || client.status === 'archived') fail('This workbook is read-only',403);
  if (body.level !== level) fail('CMMC level changed; reopen the workbook',409);
  const {section,target='',values} = body;
  const assessment = assessments.find(row => row.definition_id === target);
  if (itemSections.includes(section)) {
    if (!assessment || !catalog.requirements.some(d=>d.id===target && (level===2 || d.level_one_parent))) fail('Requirement is outside the active CMMC scope');
    if (db.user.role==='client_contributor' && assessment.owner_id!==db.user.user_id) fail('This activity must be assigned to you',403);
  } else if (db.user.role==='client_contributor') fail('An assigned manager must record program-wide changes',403);
  if (section==='assets' && !tenant('assets').some(row=>row.asset_id === target)) fail('Choose a current client asset');
  if ((!grouped.includes(section) && target) || !/^[A-Za-z0-9_-]{16,128}$/.test(body.request_id || '')) fail('Invalid workbook request');
  return commandRequest(db,'/frameworks/cmmc/workbook',cid,body.request_id,body,()=>{
    if (doc.revision!==body.revision || assessment && (assessment.last_saved || assessment.last_assessed || assessment.updated_at || '')!==(body.assessed_version || '')) fail('Workbook or assessment changed; reopen the form',409);
    const fields = section==='ssp' ? rules.sspFields.map(field=>field.id) : rules.fields[section];
    if (!fields || !values || Array.isArray(values) || !Object.keys(values).length ||
        Object.keys(values).some(field=>!fields.includes(field) || typeof values[field]!=='string' || values[field].length>4000)) fail('Unsupported workbook fields');
    const group = doc[section] || {};
    const before = target ? group[target] || {} : group;
    const after = {...before,...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.trim()]))};
    for (const field of ['lastReview','nextReview','date','due_date']) if (after[field] && (!validDate(after[field]) || ['lastReview','date'].includes(field) && after[field]>now().slice(0,10))) fail('Enter a valid date for the activity');
    if (['plans','exceptions','posting','conditional'].includes(section) && level!==2) fail('This section is available for Level 2');
    if (section==='plans') {
      const history=(assessment.assessment_history || []).filter(entry=>['needs_attention','in_progress'].includes(entry.status));
      const reopening=before.status==='Closed' && after.status!=='Closed';
      if(reopening && !values.closeout?.trim())fail('Enter a reason for reopening this plan');
      const source=['needs_attention','in_progress'].includes(assessment.status) && (before.status!=='Closed' || reopening) ? assessment:null;
      if (!source && !after.assessment && !history.length) fail('The saved assessment has no gap to plan');
      if (source || !after.assessment && history.length) {
        const entry=source || {...history.at(-1),definition_id:target};
        const token=entry.last_saved || entry.last_assessed || entry.updated_at || entry.at || '';
        const stored=doc.exceptions?.[target];
        const info=assessCmmcRow(entry,level,stored?.assessed_version===token?stored.value:'');
        const points=info.weight!==null && info.deductionMin===info.deductionMax?info.deductionMax:null;
        after.assessment={points,pointLabel:info.weight===null?'SSP prerequisite':points!==null?String(points):info.deductionMin+'–'+info.deductionMax,
          deductionMin:info.weight===null?null:info.deductionMin,deductionMax:info.weight===null?null:info.deductionMax,
          eligibility:info.eligibility,narrative:entry.implementation || '',status:entry.status,assessed_version:token};
      }
      if(!after.opened_at && history[0]?.at)after.opened_at=history[0].at;
      if (!['Open','In progress','Ready for review','Closed'].includes(after.status || 'Open')) fail('Choose a valid plan status');
      if (after.status==='Closed' && !(after.closeout && after.evidence)) fail('Closing a plan requires validation notes and evidence');
    }
    if (section==='exceptions') {
      if (!rules.partial[target] || !['',rules.partial[target],'not-implemented'].includes(after.value) || !['in_progress','needs_attention'].includes(assessment.status)) fail('This scoring condition is unavailable for the saved assessment');
      after.assessed_version=assessment.last_saved || assessment.last_assessed || assessment.updated_at || '';
    }
    if (section==='assets' && !Object.hasOwn(cmmcAssetCategories,after.category || '')) fail('Choose a valid asset scope classification');
    if (section==='posting' && (!/^(?:0|-?[1-9]\d*)$/.test(after.score) || Number(after.score)<-203 || Number(after.score)>110 || !after.date || !after.scope)) fail('Record the submitted score, date and assessment scope');
    if (section==='decisions') {
      if (assessment.status!=='not_applicable' || !assessment.na_rationale?.trim() || !['pending','approved','adjudicated'].includes(after.outcome)) fail('Record applicability and its rationale first');
      if (after.outcome!=='pending' && !(after.authority && after.date && after.reference)) fail('A recorded approval requires its authority, date and reference');
      after.rationale=assessment.na_rationale;
    }
    if (JSON.stringify(before)===JSON.stringify(after)) return {revision:doc.revision};
    const revision=doc.revision+1, at=now();
    const event={section,target,revision,at,actor:db.user.user_id,actor_name:db.user.name,before,after};
    db.cmmc_workbooks ||= {};
    db.cmmc_workbooks[key]={...doc,revision,[section]:target?{...group,[target]:after}:after,history:[event,...doc.history || []]};
    audit(db,'update','cmmc-workbook',{id:key,client_id:cid,title:'CMMC Level '+level+' workbook'},{section,target,revision},key);
    return {revision};
  });
}
