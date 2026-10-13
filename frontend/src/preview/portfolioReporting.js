// Browser-local Demo projection only. No server request or historical fixture generation.
import {FRAMEWORKS,activeDefinitions,frameworkCatalog,frameworkDefinition} from '../lib/frameworks';
import {cisConfiguration} from '../lib/cisScope';
import {socConfiguration,SOC_CATEGORIES} from '../lib/socReadiness';
import {cisSummary} from '../lib/cisVerification';
import {isoProgramMetrics} from '../lib/isoProgramMetrics';
import {operatorStatuses} from '../lib/frameworkOperator';
import {evidenceAccess} from './evidence';
import {stable} from './commandRequests';

const VERSION='native-implementation-v1',DAY=86400000;
const STATUS=['addressed','in_progress','needs_attention','not_assessed'];
const TYPES=['Assessments','Findings','Risks','Policies','Evidence','Scope'];
const inactive=row=>row.archived||row.archived_at||['archived','inactive','retired','offboarding','terminated','revoked'].includes(row.status);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const iso=value=>new Date(value).toISOString();
const timestamp=value=>{const time=Date.parse(value);if(!Number.isFinite(time)||typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))fail(422,'Use a valid timestamp with a timezone');return time;};
const counts=(rows,key)=>{const labels=operatorStatuses(key),values=STATUS.map(status=>({key:status,label:labels[status],count:rows.filter(r=>r.status===status).length}));const unknown=rows.filter(r=>!STATUS.includes(r.status)).length;if(unknown)values.push({key:'unknown',label:'Unresolved status',count:unknown});return values;};
const component=(key,label,rows,framework)=>({key,label,counts:counts(rows,framework),implemented:rows.filter(r=>r.status==='addressed').length,denominator:rows.length});

export function demoRangeStart(asOf,range){
  const date=new Date(timestamp(asOf));
  if(range==='30d')return iso(+date-30*DAY);
  if(!['6m','12m'].includes(range))return fail(422,'Choose 30d, 6m, or 12m');
  const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-(range==='6m'?6:12));
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));return date.toISOString();
}

export function demoCurrentPositions(db,clients,asOf=new Date().toISOString()){
  return clients.filter(c=>!inactive(c)&&(c.onboarding_baseline?.completed||db.baselines?.[c.client_id]?.completed)).flatMap(client=>{
    const selected=new Set((db.requirements||[]).filter(r=>r.client_id===client.client_id&&!inactive(r)&&r.baseline_response==='applies').map(r=>r.baseline_key));
    return FRAMEWORKS.filter(f=>selected.has(f.key)).map(framework=>{
      const key=framework.key,configuration=key==='cis-ig1'?cisConfiguration(client):key==='soc-2'?socConfiguration(client):{};
      const valid=key==='cis-ig1'?Number.isInteger(configuration.implementation_group)&&frameworkCatalog(key).available_implementation_groups.includes(configuration.implementation_group):key!=='soc-2'||Array.isArray(configuration.categories)&&configuration.categories.includes('security')&&new Set(configuration.categories).size===configuration.categories.length&&configuration.categories.every(c=>Object.hasOwn(SOC_CATEGORIES,c));
      const label=key==='cis-ig1'&&valid?`CIS IG${configuration.implementation_group}`:framework.label;
      const position={client_id:client.client_id,client_name:client.name,framework_key:key,program_key:key==='cis-ig1'&&valid?`cis-ig${configuration.implementation_group}`:key,program_label:label,scope_label:label,to:'/compliance/'+key};
      const unavailable={captured_at:asOf,measure_version:VERSION,availability:'unavailable',percentage:null,implemented:null,denominator:null,total:null,excluded:null,counts:[],components:[],scope_signature:null,provenance:{kind:'demo_local',label:'Current browser-local Demo records'}};
      if(!framework.implemented||!valid)return {...position,current:{...unavailable,reason:valid?'Native implementation tracking is unavailable.':'Saved framework configuration is invalid.'}};
      const definitions=activeDefinitions(key,configuration),expected=new Set(definitions.map(d=>d.id));
      const sources=(db.framework_assessments||[]).filter(r=>r.client_id===client.client_id&&r.framework_key===key&&expected.has(r.definition_id)&&!inactive(r));
      const groups=new Map();for(const row of sources)groups.set(row.definition_id,[...(groups.get(row.definition_id)||[]),row]);
      const rows=[...groups.values()].filter(values=>values.length===1).map(values=>({...frameworkDefinition(key,values[0].definition_id),...values[0]}));
      const missing=definitions.length-groups.size,duplicates=[...groups.values()].filter(v=>v.length>1).length;
      const applicability={},excluded=[],undetermined=[],included=[];let invalid=0;
      for(const row of rows){
        if(key==='iso-27001'&&row.specification==='annex_control'){
          const state=row.soa_applicability||'undetermined';applicability[row.definition_id]=state;
          (state==='included'?included:state==='excluded'?excluded:undetermined).push(row);
          if(['included','excluded'].includes(state)&&!row.soa_justification?.trim())invalid++;
        }else if(row.status==='not_applicable'){
          const validNa=!['isms_clause','addressable'].includes(row.specification)&&!!row.na_rationale?.trim();
          applicability[row.definition_id]=validNa?'excluded':'invalid_not_applicable';(validNa?excluded:included).push(row);if(!validNa)invalid++;
        }else{applicability[row.definition_id]='included';included.push(row);}
      }
      const unknown=included.filter(r=>!STATUS.includes(r.status)).length;
      const summary=cisSummary(included),metrics=key==='iso-27001'?isoProgramMetrics(rows):null;
      const implemented=metrics?metrics.requirements.implemented+metrics.annex.implemented:summary.addressed;
      const values=counts(included,key);if(excluded.length)values.push({key:'excluded',label:'Excluded / Not Applicable',count:excluded.length});
      if(undetermined.length)values.push({key:'scope_undetermined',label:'SoA applicability undetermined',count:undetermined.length});
      if(missing||duplicates)values.push({key:'missing',label:'Source records unavailable',count:missing+duplicates});
      const config=key==='cis-ig1'?{implementation_group:configuration.implementation_group}:key==='soc-2'?{categories:[...configuration.categories].sort()}:{};
      const scope={framework_key:key,catalog_version:frameworkCatalog(key).version,configuration:config,definition_ids:[...expected].sort(),applicability,source_versions:rows.map(r=>[r.definition_id,r.framework_version??null]).sort(),measure_version:VERSION};
      let components=[];
      if(key==='iso-27001'){
        components=[component('isms','ISMS requirements',included.filter(r=>r.specification==='isms_clause'),key),component('annex','Included Annex A controls',included.filter(r=>r.specification==='annex_control'),key),{key:'soa',label:'Statement of Applicability',...metrics.soa,included:metrics.soa.applicable,unavailable:definitions.filter(d=>d.specification==='annex_control'&&!groups.has(d.id)).length}];
        position.scope_label=`ISMS + included Annex A · ${undetermined.length} SoA undetermined`;
      }else if(key==='soc-2'){
        components=config.categories.map(category=>component(category,SOC_CATEGORIES[category],included.filter(r=>r.category===category),key));position.scope_label=config.categories.map(c=>SOC_CATEGORIES[c]).join(', ');
      }else if(key==='cis-ig1')position.scope_label=`Cumulative IG${configuration.implementation_group} safeguards`;
      const complete=!missing&&!duplicates&&!unknown&&!invalid;
      return {...position,current:{...unavailable,availability:complete?'available':'partial',counts:values,implemented,denominator:included.length,total:definitions.length,excluded:excluded.length,percentage:complete&&included.length?implemented/included.length*100:null,components,scope,scope_signature:stable(scope),scope_undetermined:undetermined.length,missing_records:missing,duplicate_records:duplicates,unrecognized_status_count:unknown,
        reason:!complete?'Some native Demo records or decisions are unavailable or invalid.':undetermined.length?'Percentages describe ISMS and included Annex A; unresolved SoA decisions remain separate.':!included.length?'No applicable implementation items.':null}};
    });
  });
}

const positionState=position=>stable({scope:position.current.scope_signature,counts:position.current.counts,availability:position.current.availability});

// Hook this into saveStore before its single setItem. A failed commit persists
// neither source changes nor these derived observations. Report GETs never call it.
export function captureDemoReporting(db,previous,at=new Date().toISOString()){
  const prior=previous?.portfolio_reporting||{},snapshots=[...(prior.snapshots||[])];
  for(const position of demoCurrentPositions(db,db.clients||[],at)){
    const latest=[...snapshots].reverse().find(s=>s.client_id===position.client_id&&s.framework_key===position.framework_key);
    if(!latest||positionState(latest)!==positionState(position))snapshots.push({...position,snapshot_id:`demo:${position.client_id}:${position.program_key}:${at}:${snapshots.length}`,captured_at:at});
  }
  const activity_proofs={...(prior.activity_proofs||{})};
  if(previous){
    const retained=new Set((previous.logs||[]).map(log=>log.audit_id||log.log_id));
    const grouped=new Map();
    for(const log of db.logs||[]){
      const id=log.audit_id||log.log_id,kind=sourceKinds[log.entity_type];
      if(!id||retained.has(id)||!kind)continue;
      activity_proofs[id]={eligible:false};
      if(!successful(log)||!logType(log,kind,true))continue;
      const key=stable([kind,log.client_id,log.entity_id]);
      grouped.set(key,[...(grouped.get(key)||[]),log]);
    }
    for(const group of grouped.values()){
      const reference=group[0],kind=sourceKinds[reference.entity_type];
      const before=sourceRecord(previous,kind,reference),after=sourceRecord(db,kind,reference);
      if(!before&&!after)continue;
      const changed=businessFields[kind].filter(field=>stable(before?.[field]??null)!==stable(after?.[field]??null));
      if(before&&after&&!changed.length)continue;
      // Native helpers may emit both a write receipt and a domain receipt for one commit.
      const chosen=[...group].sort((a,b)=>receiptPriority(b)-receiptPriority(a))[0];
      activity_proofs[chosen.audit_id||chosen.log_id]={eligible:true,type:logType(chosen,kind,true),changed_fields:changed};
    }
  }
  db.portfolio_reporting={...prior,started_at:prior.started_at||at,last_captured_at:snapshots.at(-1)?.captured_at||null,snapshots,activity_proofs};
}

function comparison(snapshots,current,start){
  const ordered=snapshots.filter(s=>timestamp(s.captured_at)<=timestamp(current.captured_at)).sort((a,b)=>timestamp(a.captured_at)-timestamp(b.captured_at));
  const baseline=ordered.filter(s=>timestamp(s.captured_at)<=timestamp(start)).at(-1)?.current||null;
  const result={baseline,change_pp:null,comparable:false,scope_changed:false,requested_start:start,available_from:ordered[0]?.captured_at||current.captured_at,coverage:'sampled_demo_positions',continuous_history:false,reason:'No captured Demo position on or before the requested start.'};
  if(!baseline)return result;
  const signatures=new Set([...ordered.filter(s=>timestamp(s.captured_at)>=timestamp(baseline.captured_at)).map(s=>s.current.scope_signature),current.scope_signature]);
  result.scope_changed=new Set([...signatures].filter(Boolean)).size>1;
  if(result.scope_changed)result.reason='Native program scope changed; captured endpoints are not like-for-like.';
  else if(signatures.has(null)||baseline.percentage==null||current.percentage==null)result.reason='A complete comparable implementation position is unavailable.';
  else Object.assign(result,{comparable:true,change_pp:current.percentage-baseline.percentage,reason:'Actual browser-local capture dates; gaps between observations are not reconstructed.'});
  return result;
}

function cohort(db,params){
  if(!['super_admin','platform_admin'].includes(db.user.role))return fail(403,'Portfolio reporting is restricted to internal admins');
  const selected=params.client_ids===undefined?null:[...new Set(String(params.client_ids).split(',').filter(Boolean))];
  if(selected&&(selected.length>500||selected.some(id=>!/^[A-Za-z0-9_-]{1,128}$/.test(id))))return fail(422,'Invalid portfolio client scope');
  if(selected?.some(id=>!evidenceAccess(db.user,id)))return fail(403,'Forbidden for this client');
  return (db.clients||[]).filter(c=>evidenceAccess(db.user,c.client_id)&&(selected===null||selected.includes(c.client_id))&&(params.include_archived===true||params.include_archived==='true'||c.status!=='archived'));
}

const coverage=(db,snapshots)=>({partial:true,started_at:snapshots[0]?.captured_at||null,last_captured_at:snapshots.at(-1)?.captured_at||null,notice:'Demo uses browser-local saved records. Positions are captured on committed Demo changes; earlier scope is not reconstructed. This is not hosted customer history.'});
const sourceKinds={framework_assessment:'framework_assessments',framework_assessments:'framework_assessments',organizational_control:'organizational_controls',organizational_controls:'organizational_controls',review:'reviews',reviews:'reviews',finding:'findings',findings:'findings',risk:'risks',risks:'risks',policy:'policies',policies:'policies',evidence:'evidence',client:'clients',clients:'clients',requirement:'requirements',requirements:'requirements'};
const sourceIds={framework_assessments:'framework_assessment_id',organizational_controls:'control_id',reviews:'review_id',findings:'finding_id',risks:'risk_id',policies:'policy_id',evidence:'evidence_id',clients:'client_id',requirements:'requirement_id'};
const businessFields={
  framework_assessments:['status','implementation','technology','notes','owner_id','process_owner_id','verification','verification_checklist','cis_assessment_criteria','soc_assessment_checks','iso_assessment_checks','na_rationale','soa_applicability','soa_justification','addressable_decision','addressable_rationale','management_controls','related_links','unlinked_evidence_ids','assessment_history'],
  organizational_controls:['name','title','description','status','owner_id','assessment_ids','related_links','observations','design','implementation','conflicts','frequency','reconciliation_note'],
  reviews:['title','status','notes','outcome','iso_audit','due_date','owner_id','reviewer_id','recurrence','custom_recurrence_days','evidence_ids','occurrences','scope','amendments'],
  findings:['title','description','status','severity','owner_id','due_date','notes','decision_history','governance_context'],
  risks:['title','description','status','likelihood_score','impact_score','risk_score','risk_level','owner_id','treatment','treatment_plan','next_review','review_cadence','custom_recurrence_days','decision_history','acceptance_rationale','acceptance_expires_at','closure_reason','closure_note','governance_context','related_task_ids'],
  policies:['title','description','status','owner_id','version','presence','notes','content','approval_history','decision_history','approval_request','approval_subject','approval_authority','approval_basis','approved_at','verified_at','review_id','next_review_date','governance_context'],
  evidence:['filename','display_name','evidence_type','evidence_date','effective_date','expiration_date','refresh_date','notes','relationships','archived_at','linked_type','linked_id'],
  clients:['framework_settings','onboarding_baseline','iso_audit_program'],
  requirements:['baseline_response','baseline_key','applicability','status','effective_date'],
};
const successful=log=>(log.outcome==null||log.outcome==='success')&&!['denied','failed','error','cancelled','requested'].includes(log.meta?.outcome)&&log.success!==false&&log.committed!==false&&!log.meta?._portfolio_activity_noop;
const receiptPriority=log=>['update','create','Risk updated'].includes(log.action)?0:['Review started','Review completed','CIS scope updated','SOC 2 readiness scope updated'].includes(log.action)?2:1;
function sourceRecord(db,kind,log){
  const row=(db[kind]||[]).find(value=>value[sourceIds[kind]]===log.entity_id&&value.client_id===log.client_id);
  return kind==='clients'&&row?{...row,onboarding_baseline:row.onboarding_baseline||db.baselines?.[row.client_id]}:row;
}

function logType(log,kind,proven=false){
  const action=log.action||'';
  if(!successful(log))return null;
  if(proven&&['create','update','archive','delete'].includes(action))return {framework_assessments:'Assessments',organizational_controls:'Assessments',reviews:'Assessments',findings:'Findings',risks:'Risks',policies:'Policies',evidence:'Evidence',clients:'Scope',requirements:'Scope'}[kind];
  if(kind==='reviews'&&(['Review started','Review completed'].includes(action)||(proven&&['Audit work updated','Review configuration changed','amend'].includes(action))))return 'Assessments';
  if(kind==='organizational_controls'&&(['Control created','Control observation recorded'].includes(action)||action==='Control updated'&&(proven||log.meta?.changed_fields?.some(field=>businessFields[kind].includes(field)))))return 'Assessments';
  if(proven&&kind==='framework_assessments'&&['Framework assessment updated','Framework record linked','Framework Evidence unlinked','Framework Review linked'].includes(action))return 'Assessments';
  if(kind==='framework_assessments'&&action==='Framework assessment updated'&&log.meta?.changed_fields?.some(field=>businessFields[kind].includes(field)))return 'Assessments';
  if(kind==='findings'&&(['create','Finding validated and closed','Finding moved to In Remediation','Finding moved to Pending Validation','validate','accept','reopen','close','archive','delete'].includes(action)))return 'Findings';
  if(kind==='risks'&&['create','Risk created','Risk reassessed','Risk accepted','Risk closed','Risk owner assigned','Treatment updated','Next Risk Review scheduled','archive','delete'].includes(action))return 'Risks';
  if(kind==='policies'&&(['create','approved','rejected','submitted','submission_withdrawn','archive','delete','retire'].includes(action)||/^Policy (approved|rejected|submitted|retired|returned|Review scheduled)$/.test(action)))return 'Policies';
  if(proven&&kind==='policies'&&['Policy metadata changed','Policy Review completed','verify','approve','reject','submit-review','withdraw-submission'].includes(action))return 'Policies';
  if(kind==='evidence'&&['upload','create','archive','delete'].includes(action))return 'Evidence';
  if(kind==='evidence'&&['Evidence metadata changed','Evidence relationship added','Evidence relationship removed'].includes(action)&&(proven||log.meta?.changed_fields?.some(field=>businessFields[kind].includes(field))))return 'Evidence';
  if(proven&&kind==='risks'&&['Risk updated','Action Item linked','Assessment Updated','Treatment Updated','Risk Accepted'].includes(action))return 'Risks';
  if(proven&&kind==='clients'&&['SOC 2 readiness scope updated','ISO audit program activated','onboarding-complete','program-applicability-updated','CIS scope updated'].includes(action))return 'Scope';
  if(proven&&kind==='requirements'&&action==='program-applicability-updated')return 'Scope';
  if(kind==='clients'&&(action==='CIS scope updated'&&Number.isInteger(log.meta?.before)&&Number.isInteger(log.meta?.after)&&log.meta.before!==log.meta.after||action==='program-applicability-updated'&&log.meta?.previous_status!==log.meta?.applicability))return 'Scope';
  return null;
}

function events(db,clients,at,days,type){
  const byClient=new Map(clients.map(c=>[c.client_id,c])),seen=new Set();
  return (db.logs||[]).flatMap(log=>{
    const id=log.audit_id||log.log_id,proof=db.portfolio_reporting?.activity_proofs?.[id];
    const kind=sourceKinds[log.entity_type],category=kind&&successful(log)&&(proof?proof.eligible&&proof.type:logType(log,kind)),time=Date.parse(log.at);
    if(!category||(type&&category!==type)||!byClient.has(log.client_id)||!Number.isFinite(time)||time>timestamp(at)||time<timestamp(at)-days*DAY)return [];
    if(!id||seen.has(id))return [];seen.add(id);
    const source=(db[kind]||[]).find(row=>row[sourceIds[kind]]===log.entity_id&&row.client_id===log.client_id),available=!!source&&!source.archived&&!source.archived_at&&source.status!=='archived';
    const query=new URLSearchParams({client_id:log.client_id,...kind==='framework_assessments'?{assessment:log.entity_id}:{id:log.entity_id}});
    const to=kind==='framework_assessments'?`/compliance/${source?.framework_key}?${query}`:kind==='clients'?`/client-profile?${query}`:kind==='organizational_controls'?`/controls?${query}`:`/${kind}?${query}`;
    const event={event_id:`demo:${id}`,client_id:log.client_id,client_name:byClient.get(log.client_id).name,at:iso(time),type:category,title:log.action,description:'Committed browser-local Demo activity.',actor:{user_id:log.user_id||null,name:log.user_name||'Unknown actor'},provenance:'Existing browser-local Demo audit record',source:{entity_type:kind,entity_id:log.entity_id,available,to:available?to:null}};
    if(available&&source.framework_key)Object.assign(event,{program_key:source.framework_key,program_label:source.framework_key==='cis-ig1'?'CIS Controls':FRAMEWORKS.find(f=>f.key===source.framework_key)?.label||source.framework_key});
    if(available&&log.action==='CIS scope updated')Object.assign(event,{before:{implementation_group:log.meta.before},after:{implementation_group:log.meta.after},program_key:'cis-ig1',program_label:'CIS Controls'});
    if(available&&category==='Assessments'&&STATUS.includes(log.meta?.status))event.after={status:log.meta.status};
    if(!available)event.note='The Demo source record is archived or unavailable.';
    return [event];
  }).sort((a,b)=>b.at.localeCompare(a.at)||b.event_id.localeCompare(a.event_id));
}

export function portfolioReportingRequest(db,path,params={}){
  if(!path.startsWith('/portfolio/reporting/'))return undefined;
  const clients=cohort(db,params),asOf=params.as_of?iso(timestamp(params.as_of)):new Date().toISOString();
  if(timestamp(asOf)>Date.now())return fail(422,'The reporting cutoff cannot be in the future');
  const range=params.range||'30d',start=demoRangeStart(asOf,range),programs=demoCurrentPositions(db,clients,asOf);
  const snapshots=(db.portfolio_reporting?.snapshots||[]).filter(s=>clients.some(c=>c.client_id===s.client_id)&&timestamp(s.captured_at)<=timestamp(asOf)).sort((a,b)=>a.captured_at.localeCompare(b.captured_at));
  if(path.endsWith('/overview')){
    const frameworks=new Map();for(const p of programs){p.comparison=comparison(snapshots.filter(s=>s.client_id===p.client_id&&s.framework_key===p.framework_key),p.current,start);if(p.current.availability==='unavailable')continue;if(!frameworks.has(p.program_key))frameworks.set(p.program_key,{key:p.program_key,label:p.program_label,framework_key:p.framework_key,clients:[]});frameworks.get(p.program_key).clients.push({client_id:p.client_id,name:p.client_name});}
    return {total_clients:clients.length,as_of:asOf,programs,frameworks:[...frameworks.values()].map(f=>({...f,client_count:f.clients.length})),recent_changes_count:events(db,clients,asOf,7).length,coverage:coverage(db,snapshots)};
  }
  if(path.endsWith('/history')){
    const position=programs.find(p=>p.client_id===params.client_id&&p.program_key===params.program_key);if(!position)return fail(404,'Enabled Demo program not found');
    const available=snapshots.filter(s=>s.client_id===position.client_id&&s.framework_key===position.framework_key),baseline=available.filter(s=>timestamp(s.captured_at)<=timestamp(start)).at(-1),selected=[...(baseline?[baseline]:[]),...available.filter(s=>timestamp(s.captured_at)>timestamp(start))];
    const shown=selected.length?selected.map(s=>({...s.current,snapshot_id:s.snapshot_id})):[{...position.current,snapshot_id:'demo-current-read',provenance:{kind:'demo_local',label:'Current Demo read; no earlier saved history'}}];
    const scope_changes=[];for(let i=1;i<selected.length;i++)if(selected[i-1].current.scope_signature!==selected[i].current.scope_signature)scope_changes.push({at:selected[i].captured_at,before:selected[i-1].current,after:selected[i].current});
    return {...position,as_of:asOf,range,period_start:start,snapshots:shown,scope_changes,comparison:comparison(available,position.current,start),coverage:coverage(db,available)};
  }
  if(path.endsWith('/activity')){
    const days=Number(params.days||7),limit=Number(params.limit||50),type=params.type;if(![7,30,90].includes(days)||!Number.isInteger(limit)||limit<1||limit>100||type&&!TYPES.includes(type))return fail(422,'Invalid Demo activity filters');
    if(params.client_id&&!clients.some(c=>c.client_id===params.client_id))return fail(404,'Client unavailable in the current view');
    const narrowed=params.client_id?clients.filter(c=>c.client_id===params.client_id):clients;
    const all=events(db,narrowed,asOf,days,type),scope=stable([narrowed.map(c=>c.client_id).sort(),db.user.user_id,days,type||'']);let offset=0;
    if(params.cursor){let value;try{value=JSON.parse(atob(params.cursor));}catch{return fail(422,'Invalid Demo activity cursor');}if(value.scope!==scope||value.as_of!==asOf)return fail(422,'Activity cursor belongs to a different Demo view');offset=all.findIndex(e=>e.event_id===value.event_id)+1;if(!offset)return fail(422,'Activity cursor is unavailable');}
    const page=all.slice(offset,offset+limit),more=offset+limit<all.length;
    return {events:page,total:all.length,as_of:asOf,period_start:iso(timestamp(asOf)-days*DAY),next_cursor:more?btoa(JSON.stringify({scope,as_of:asOf,event_id:page.at(-1).event_id})):null,coverage:{partial:true,last_captured_at:db.portfolio_reporting?.last_captured_at||null,notice:'Existing browser-local Demo business logs have partial coverage. No hosted customer activity is represented.'}};
  }
  return fail(404,'Demo reporting route not found');
}
