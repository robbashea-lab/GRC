import {visibleQuestions,generateResult} from '../lib/guidedAssessment';
import {socQuestions,socGuidedResult} from '../lib/socGuidedAssessment';
import {isoQuestions,isoGuidedResult} from '../lib/isoGuidedAssessment';

const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const canonical=value=>JSON.stringify(value===undefined?null:Array.isArray(value)?value:value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);

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

export function generatedItems(row,draft){
  const {answers,version}=draft;
  const questions=Object.fromEntries((row.framework_key==='soc-2'?socQuestions(row.definition_id,answers,version):row.framework_key==='iso-27001'?isoQuestions(row.definition_id,answers,version):visibleQuestions(row.definition_id,answers,version)).map(question=>[question.id,question]));
  const result=row.framework_key==='soc-2'?socGuidedResult(row.definition_id,answers,version):row.framework_key==='iso-27001'?isoGuidedResult(row.definition_id,answers,version):cisItemResult(row,draft,questions);
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
  for(const [question_id,kind] of [['gaps','gap'],['unknowns','verification']])if(typeof answers[question_id]==='string'&&answers[question_id].trim())origins.set(question_id+':'+kind,{question_id,kind,text:answers[question_id].trim()});
  const summary=result.unknowns?.filter(text=>text.startsWith('No substantive practice is established')||text.startsWith('The overall practice answer conflicts with the reported absence'))||[];
  if(summary.length)origins.set('summary_confirmation:verification',{question_id:'summary_confirmation',kind:'verification',text:summary.join('\n')});
  return [...origins.values()].map(source=>({...source,item_id:'item_'+encodeURIComponent(row.framework_assessment_id)+':'+encodeURIComponent(source.question_id)+':'+source.kind,
    source_version:version,source_fingerprint:canonical({answer:['summary_confirmation','scope_reason'].includes(source.question_id)?answers:answers[source.question_id],detail:answers[source.question_id+'_detail']})}));
}

export function reconcileItems(row,draft,actor,at){
  const items=copy(row.items_to_address||[]),byId=new Map(items.map(item=>[item.item_id,item])),active=new Set();
  for(const source of generatedItems(row,draft)){
    active.add(source.item_id);let item=byId.get(source.item_id),event;
    if(!item){item={...source,state:'open',resolution:'',finding_id:null,created_at:at,updated_at:at,history:[]};items.push(item);event='generated';}
    else{
      const different=item.source_fingerprint!==source.source_fingerprint;
      if(!different&&item.state!=='superseded'&&Object.entries(source).every(([key,value])=>item[key]===value))continue;
      const state=different||item.state==='superseded'?'open':item.state;
      event=different?'reassessed':item.state==='superseded'?'restored':'reconciled';
      Object.assign(item,source,{state,updated_at:at});delete item.previous_state;
    }
    item.history.push({at,by:actor,event,state:item.state,resolution:item.resolution,text:item.text,source_version:item.source_version,source_fingerprint:item.source_fingerprint});
  }
  for(const item of items)if(!active.has(item.item_id)&&item.state!=='superseded'){
    Object.assign(item,{previous_state:item.state,state:'superseded',updated_at:at});
    item.history.push({at,by:actor,event:'superseded',state:'superseded',resolution:item.resolution,source_fingerprint:item.source_fingerprint});
  }
  return items;
}

export function currentItem(row,itemId){
  const item=row.items_to_address?.find(item=>item.item_id===itemId);
  if(!item)fail('Item not found for this assessment',404);
  if(item.state==='superseded')fail('This item is superseded; refresh the current assessment',409);
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
