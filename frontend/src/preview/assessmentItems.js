import {visibleQuestions,generateResult,catalogForVersion} from '../lib/guidedAssessment';
import {socQuestions,socQuestionSet,socGuidedResult,socUsesIntentGates} from '../lib/socGuidedAssessment';
import {isoQuestions,isoQuestionSet,isoGuidedResult,isoUsesIntentGates} from '../lib/isoGuidedAssessment';
import {genericGuidedFramework,genericQuestions,genericGuidedResult,genericGuidedCatalog,genericGuidedVersion} from '../lib/genericGuidedAssessment';

const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const canonical=value=>JSON.stringify(value===undefined?null:Array.isArray(value)?value:value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);
const requestPattern=/^[A-Za-z0-9_-]{16,128}$/;
const exactKeys=(body,keys)=>body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(key=>keys.includes(key));
const generatedId=(row,question,kind)=>'item_'+encodeURIComponent(row.framework_assessment_id)+':'+encodeURIComponent(question)+':'+kind;
const manualId=(row,request)=>'item_'+encodeURIComponent(row.framework_assessment_id)+':manual:'+request;

export function knownGuidedItem(row,item){
  if(![undefined,null,'guided'].includes(item.origin)||!['gap','verification'].includes(item.kind)
    ||typeof item.source_fingerprint!=='string'||typeof item.question_id!=='string'||!item.question_id
    ||typeof item.source_version!=='string'||!item.source_version||item.item_id!==generatedId(row,item.question_id,item.kind))return false;
  try{
    const fingerprint=JSON.parse(item.source_fingerprint);
    if(!exactKeys(fingerprint,['answer','detail'])||!Object.hasOwn(fingerprint,'answer')||!Object.hasOwn(fingerprint,'detail')||canonical(fingerprint)!==item.source_fingerprint)return false;
  }catch{return false;}
  const expectedType=item.kind==='gap'?'gap':item.question_id==='evidence'?'evidence':'confirmation';
  if(item.item_type!==undefined&&item.item_type!==expectedType)return false;
  let questions;
  try{
    if(genericGuidedFramework(row.framework_key)){
      if(item.source_version!==genericGuidedVersion(row.framework_key))return false;
      questions=genericGuidedCatalog.questions;
    }else if(row.framework_key==='soc-2')questions=socQuestionSet(row.definition_id,{},item.source_version);
    else if(row.framework_key==='iso-27001')questions=isoQuestionSet(row.definition_id,{},item.source_version);
    else questions=catalogForVersion(item.source_version)?.safeguards?.[row.definition_id];
  }catch{return false;}
  return Array.isArray(questions)&&new Set([...questions.map(question=>question.id),'summary_confirmation','scope_reason','evidence','gaps','unknowns']).has(item.question_id);
}

export function knownManualItem(row,item){
  const first=item.history?.[0];
  return item.origin==='manual'&&typeof item.request_id==='string'&&requestPattern.test(item.request_id)
    &&item.item_id===manualId(row,item.request_id)&&['gap','confirmation','evidence'].includes(item.item_type)
    &&item.kind===(item.item_type==='gap'?'gap':'verification')&&typeof item.text==='string'&&item.text.trim().length>0&&item.text.length<=4000
    &&['open','resolved','removed'].includes(item.state)&&typeof item.resolution==='string'&&item.resolution.length<=4000
    &&Array.isArray(item.history)&&first?.event==='added'&&first.state==='open'&&first.text===item.text
    &&typeof first.by==='string'&&!!first.by&&typeof item.created_at==='string'&&!!item.created_at&&first.at===item.created_at;
}

export function itemTaskEligible(row,item){
  return item.kind==='verification'&&item.state==='open'&&!item.finding_id&&!item.task_id
    &&(knownManualItem(row,item)||knownGuidedItem(row,item));
}

export function withItemControls(row){
  const item_controls={};
  for(const item of row.items_to_address||[]){
    if(!item||typeof item.item_id!=='string'||!item.item_id)continue;
    const manual=knownManualItem(row,item),guided=knownGuidedItem(row,item),current=!['superseded','removed'].includes(item.state);
    item_controls[item.item_id]={origin:manual?'manual':guided?'guided':'unknown',
      can_remove:current&&(manual||guided&&item.state==='resolved'),can_create_action:itemTaskEligible(row,item),
      can_create_finding:(manual||guided)&&item.kind==='gap'&&item.state==='open'&&!item.finding_id&&!item.task_id};
  }
  return {...row,item_controls};
}

function validateManual(body,keys){
  if(!exactKeys(body,keys)||typeof body.request_id!=='string'||!requestPattern.test(body.request_id)
    ||!['gap','confirmation','evidence'].includes(body.item_type)||typeof body.text!=='string'
    ||body.text.length>4000||!body.text.trim())fail('Describe a valid assessment Item');
}

export function addManualItem(row,items,body,actor,at){
  const identity=manualId(row,body.request_id),previous=items.find(item=>item.item_id===identity),text=body.text.trim();
  if(previous){
    if(!knownManualItem(row,previous)||previous.request_id!==body.request_id||previous.item_type!==body.item_type||previous.text!==text)fail('This Item request already has different content',409);
    return false;
  }
  items.push({item_id:identity,origin:'manual',request_id:body.request_id,item_type:body.item_type,
    kind:body.item_type==='gap'?'gap':'verification',text,state:'open',resolution:'',finding_id:null,
    created_at:at,updated_at:at,history:[{at,by:actor,event:'added',state:'open',text}]});
  return true;
}

export function removeAssessmentItem(row,item,actor,at){
  const manual=knownManualItem(row,item);
  if(!manual&&!(knownGuidedItem(row,item)&&['resolved','removed'].includes(item.state)))fail('Only a manual Item or a resolved known interview Item can be removed',409);
  if(item.state==='removed')return false;
  Object.assign(item,{previous_state:item.state,state:'removed',updated_at:at});
  (item.history||=[]).push({at,by:actor,event:'removed',state:'removed',resolution:item.resolution||''});
  return true;
}

export function changeManualItem(row,body,actor,at,itemId=null){
  if(itemId===null)validateManual(body,['expected_revision','request_id','item_type','text']);
  else if(!exactKeys(body,['expected_revision']))fail('Invalid Item removal');
  if(!Number.isInteger(body.expected_revision)||body.expected_revision<0)fail('Invalid Items revision');
  const items=copy(row.items_to_address||[]),item=itemId===null?null:items.find(item=>item.item_id===itemId);
  if(itemId!==null&&!item)fail('Item not found for this assessment',404);
  const changed=itemId===null?addManualItem(row,items,body,actor,at):removeAssessmentItem(row,item,actor,at);
  if(!changed)return false;
  if(body.expected_revision!==(row.items_revision||0))fail('Items changed in another window; refresh before saving',409);
  Object.assign(row,{items_to_address:items,items_revision:(row.items_revision||0)+1});return true;
}

export function applyItemDraft(row,source,draft,actor,at,{allowReplay=false}={}){
  if(!exactKeys(draft,['expected_revision','operations'])||!Number.isInteger(draft.expected_revision)||draft.expected_revision<0
    ||!Array.isArray(draft.operations)||!draft.operations.length||draft.operations.length>100)fail('Invalid pending Item edits');
  const stale=draft.expected_revision!==(row.items_revision||0);
  if(stale&&!allowReplay)fail('Items changed in another window; refresh before saving',409);
  const items=copy(source);
  for(const operation of draft.operations){
    if(operation?.operation==='add'){
      validateManual(operation,['operation','request_id','item_type','text']);addManualItem(row,items,operation,actor,at);continue;
    }
    if(!['resolve','remove'].includes(operation?.operation)||!exactKeys(operation,operation.operation==='resolve'?['operation','target','state','resolution']:['operation','target']))fail('Invalid pending Item operation');
    const target=operation.target;
    if(!exactKeys(target,['item_id','question_id','kind','manual_request_id']))fail('Invalid Item identity');
    const saved=target.item_id!==undefined,guided=target.question_id!==undefined||target.kind!==undefined,manual=target.manual_request_id!==undefined;
    if(Number(saved)+Number(guided)+Number(manual)!==1||(saved&&(typeof target.item_id!=='string'||!target.item_id||target.item_id.length>500))
      ||guided&&(typeof target.question_id!=='string'||!target.question_id||target.question_id.length>200||!['gap','verification'].includes(target.kind))
      ||manual&&(typeof target.manual_request_id!=='string'||!requestPattern.test(target.manual_request_id)))fail('Use exactly one saved, guided or pending manual Item identity');
    const identity=saved?target.item_id:manual?manualId(row,target.manual_request_id):generatedId(row,target.question_id,target.kind);
    const item=items.find(item=>item.item_id===identity);
    if(!item||guided&&!knownGuidedItem(row,item))fail('The pending Item no longer belongs to this reviewed assessment',409);
    if(operation.operation==='remove')removeAssessmentItem(row,item,actor,at);
    else{
      const resolution=operation.resolution??'';
      if(!['open','resolved'].includes(operation.state)||typeof resolution!=='string'||resolution.length>4000)fail('Invalid pending Item resolution');
      if(['superseded','removed'].includes(item.state))fail('This Item is no longer current',409);
      if(item.state!==operation.state||(item.resolution||'')!==resolution){
        Object.assign(item,{state:operation.state,resolution,updated_at:at});
        (item.history||=[]).push({at,by:actor,event:operation.state==='resolved'?'resolved':'reopened',state:operation.state,resolution});
      }
    }
  }
  if(stale&&JSON.stringify(items)!==JSON.stringify(source))fail('Items changed in another window; refresh before saving',409);
  return items;
}

function cisItemResult(row,draft,questions){
  const localDay=value=>{const [year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day);};
  const day=draft.result?.evaluation_date;
  if(day)return generateResult(row.definition_id,draft.answers,localDay(day),draft.version);
  const dated=Object.values(questions).filter(question=>question.type==='date'&&question.critical!==false);
  if(!dated.length)return generateResult(row.definition_id,draft.answers,new Date(),draft.version);
  const stamp=new Date(draft.generated_at);
  const parts=typeof draft.generated_at==='string'&&/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(draft.generated_at);
  const calendarDay=parts&&new Date(parts[1]+'T00:00:00Z');
  const knownStamp=parts&&Number.isFinite(stamp.getTime())&&Number.isFinite(calendarDay.getTime())&&calendarDay.toISOString().slice(0,10)===parts[1]
    &&Number(parts[2])<24&&Number(parts[3])<60&&Number(parts[4])<60&&Number(parts[5]||0)<24&&Number(parts[6]||0)<60;
  const dates=knownStamp?[-1,0,1].map(offset=>{
    const utc=new Date(Date.UTC(stamp.getUTCFullYear(),stamp.getUTCMonth(),stamp.getUTCDate()+offset));
    return new Date(utc.getUTCFullYear(),utc.getUTCMonth(),utc.getUTCDate());
  }):[];
  const results=dates.map(today=>generateResult(row.definition_id,draft.answers,today,draft.version));
  const result=results[1]||generateResult(row.definition_id,draft.answers,new Date(),draft.version);
  // Pre-metadata snapshots cannot establish the browser's local day. Preserve
  // conclusions shared by all plausible days and confirm only ambiguous dates.
  const signals=(result.signals||[]).filter(signal=>!dated.some(question=>question.id===signal.questionId));
  for(const question of dated){
    const kinds=new Set(results.map(candidate=>(candidate.signals||[]).find(signal=>signal.questionId===question.id)?.kind||null));
    const fallback=(result.signals||[]).find(signal=>signal.questionId===question.id)?.kind;
    const value=draft.answers[question.id],parsed=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T00:00:00Z'):null;
    const invalid=value&&(!parsed||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value);
    const kind=results.length?(kinds.size===1?[...kinds][0]:'verification'):invalid?'gap':fallback==='verification'?fallback:'verification';
    if(kind)signals.push({questionId:question.id,kind});
  }
  return {...result,signals};
}

function itemQuestions(row,{answers,version}){return Object.fromEntries((genericGuidedFramework(row.framework_key)?genericQuestions(answers):row.framework_key==='soc-2'?socQuestions(row.definition_id,answers,version):row.framework_key==='iso-27001'?isoQuestions(row.definition_id,answers,version):visibleQuestions(row.definition_id,answers,version)).map(question=>[question.id,question]));}

export function reportedEvidence(row,draft){
  const value=draft.answers.evidence;
  return itemQuestions(row,draft).evidence?.type==='text'&&typeof value==='string'?value.trim():'';
}

export function generatedItems(row,draft,{evidenceLinked=null}={}){
  const {answers,version}=draft;
  const questions=itemQuestions(row,draft);
  const result=genericGuidedFramework(row.framework_key)?genericGuidedResult(row.definition_id,answers,version):row.framework_key==='soc-2'?socGuidedResult(row.definition_id,answers,version):row.framework_key==='iso-27001'?isoGuidedResult(row.definition_id,answers,version):cisItemResult(row,draft,questions);
  const origins=new Map();
  for(const signal of result.signals||[]){
    const question=questions[signal.questionId];if(!question)fail('Follow-up origin must belong to this interview');
    let text=signal.text||'';
    if(!text){
      const value=answers[question.id];
      if(question.type==='matrix'){
        const values=value&&typeof value==='object'?value:{};
        const affected=question.rows.filter(key=>signal.kind==='gap'?(question.deficient_values||['No','Partially','None']).includes(values[key]):!values[key]||values[key]==='Not sure'||values[key]==='Not applicable'&&!answers.scope_reason?.trim());
        text=(signal.kind==='gap'?'Address: ':'Confirm: ')+affected.map(key=>key+' — '+(values[key]||'Not recorded')).join('; ');
      }else text=question[signal.kind==='gap'?'gap_template':'unknown_template']||(signal.kind==='gap'?'Address: ':'Confirm: ')+(question.prompt||question.topic||row.definition_id);
      if(answers[question.id+'_detail'])text+=' — '+answers[question.id+'_detail'];
    }
    origins.set(signal.questionId+':'+signal.kind,{question_id:signal.questionId,kind:signal.kind,text});
  }
  for(const [question_id,reportedKind] of [['gaps','gap'],['unknowns','verification']]){
    const kind=version==='brawndo-cis-pilot-1'&&question_id==='gaps'?'verification':reportedKind;
    if((!(['cis-v8.1-program-5','cis-v8.1-control1-5'].includes(version)||socUsesIntentGates(version)||isoUsesIntentGates(version))||answers[kind==='gap'?'additional_gap':'additional_confirmation']==='Yes')&&typeof answers[question_id]==='string'&&answers[question_id].trim())origins.set(question_id+':'+kind,{question_id,kind,text:answers[question_id].trim()});
  }
  if(evidenceLinked===false&&reportedEvidence(row,draft))origins.set('evidence:verification',{question_id:'evidence',kind:'verification',text:'Link the reported evidence: '+reportedEvidence(row,draft)});
  const summary=result.unknowns?.filter(text=>text.startsWith('No substantive practice is established')||text.startsWith('The overall practice answer conflicts with the reported absence'))||[];
  if(summary.length)origins.set('summary_confirmation:verification',{question_id:'summary_confirmation',kind:'verification',text:summary.join('\n')});
  return [...origins.values()].map(source=>({...source,item_id:'item_'+encodeURIComponent(row.framework_assessment_id)+':'+encodeURIComponent(source.question_id)+':'+source.kind,
    origin:'guided',item_type:source.kind==='gap'?'gap':source.question_id==='evidence'?'evidence':'confirmation',
    source_version:version,source_fingerprint:canonical({answer:['summary_confirmation','scope_reason'].includes(source.question_id)?answers:answers[source.question_id],detail:answers[source.question_id+'_detail']})}));
}

export function reconcileItems(row,draft,actor,at,options={}){
  const items=copy(row.items_to_address||[]),byId=new Map(items.map(item=>[item.item_id,item])),active=new Set();
  for(const source of generatedItems(row,draft,options)){
    active.add(source.item_id);let item=byId.get(source.item_id),event;
    if(!item){item={...source,state:'open',resolution:'',finding_id:null,created_at:at,updated_at:at,history:[]};items.push(item);event='generated';}
    else{
      if(!knownGuidedItem(row,item))fail('The retained Item origin needs confirmation before reconciliation',409);
      const different=item.source_fingerprint!==source.source_fingerprint;
      if(item.state==='removed'&&!different)continue;
      if(!different&&item.state!=='superseded'&&Object.entries(source).every(([key,value])=>item[key]===value))continue;
      const state=different||item.state==='superseded'?'open':item.state;
      event=different?'reassessed':item.state==='superseded'?'restored':'reconciled';
      Object.assign(item,source,{state,updated_at:at});delete item.previous_state;
    }
    item.history.push({at,by:actor,event,state:item.state,resolution:item.resolution,text:item.text,source_version:item.source_version,source_fingerprint:item.source_fingerprint});
  }
  for(const item of items)if(!active.has(item.item_id)&&!['superseded','removed'].includes(item.state)&&knownGuidedItem(row,item)){
    Object.assign(item,{previous_state:item.state,state:'superseded',updated_at:at});
    item.history.push({at,by:actor,event:'superseded',state:'superseded',resolution:item.resolution,source_fingerprint:item.source_fingerprint});
  }
  return items;
}

export function currentItem(row,itemId){
  const item=row.items_to_address?.find(item=>item.item_id===itemId);
  if(!item)fail('Item not found for this assessment',404);
  if(['superseded','removed'].includes(item.state))fail('This item is no longer current; refresh the current assessment',409);
  return item;
}

export function updateItem(row,itemId,body,actor,at){
  if(Object.keys(body).some(key=>!['expected_revision','state','resolution'].includes(key))||!Number.isInteger(body.expected_revision)||body.expected_revision<0||!['open','resolved'].includes(body.state)||typeof(body.resolution??'')!=='string'||(body.resolution||'').length>4000)fail('Invalid assessment item');
  if(body.expected_revision!==(row.items_revision||0))fail('Items changed in another window; refresh before saving',409);
  const item=currentItem(row,itemId),resolution=body.resolution??'';
  if(item.state===body.state&&item.resolution===resolution)return false;
  Object.assign(item,{state:body.state,resolution,updated_at:at});
  item.history.push({at,by:actor,event:body.state==='resolved'?'resolved':'reopened',state:body.state,resolution});
  row.items_revision=(row.items_revision||0)+1;return true;
}

export function linkItemFinding(row,itemId,findingId,actor,at){
  const item=currentItem(row,itemId);if(item.finding_id===findingId)return;
  if(item.finding_id)fail('This item already has a linked Finding',409);
  Object.assign(item,{finding_id:findingId,updated_at:at});
  item.history.push({at,by:actor,event:'finding_linked',state:item.state,resolution:item.resolution,finding_id:findingId});
  row.items_revision=(row.items_revision||0)+1;
}
