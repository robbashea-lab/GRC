import {useEffect,useMemo,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import serviceCatalog from '@catalogs/r4ServicesTools.json';
import {commonToolDefinitions} from '@/lib/r4ServicesTools';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {useAssessmentClientContext} from './AssessmentClientContext';

const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const identity=value=>typeof value==='string'&&!!value.trim();
const version=value=>value===null||typeof value==='string';
const ids=value=>Array.isArray(value)&&value.every(identity);
const tool=value=>object(value)&&identity(value.tool_id)&&identity(value.name)&&ids(value.area_ids);
const optional=(value,key,test)=>!Object.hasOwn(value,key)||value[key]===null||test(value[key]);
function validContext(data,clientId){
  return identity(clientId)&&object(data)&&data.client_id===clientId
    &&Object.hasOwn(data,'expected_client_updated_at')&&version(data.expected_client_updated_at)
    &&Array.isArray(data.catalog)&&data.catalog.every(tool)
    &&object(data.services)&&optional(data.services,'areas',object)
    &&optional(data.services,'custom_tools',tools=>Array.isArray(tools)&&tools.every(tool))
    &&Object.values(data.services.areas||{}).every(area=>area===null||object(area)&&optional(area,'tool_ids',ids)
      &&optional(area,'responsibility',value=>typeof value==='string'))
    &&Array.isArray(data.candidates)&&data.candidates.every(candidate=>object(candidate)&&identity(candidate.activity_id)
      &&identity(candidate.title)&&optional(candidate,'review_id',identity)&&optional(candidate,'expected_updated_at',version)
      &&optional(candidate,'setup',object)
      &&optional(candidate,'exclusion',value=>object(value)&&optional(value,'reason',reason=>typeof reason==='string'))
      &&['notes','recurring_ticket_number','recurring_ticket_url','recurring_ticket_summary'].every(key=>
        optional(candidate.setup||{},key,value=>typeof value==='string'))
      &&optional(candidate.setup||{},'no_ticket',value=>typeof value==='boolean'))
    &&(data.selected_activity_id===undefined||data.selected_activity_id===null||identity(data.selected_activity_id)
      &&data.candidates.some(candidate=>candidate.activity_id===data.selected_activity_id));
}

function contextSnapshot(data,proposal){
  return {client:Object.hasOwn(proposal||{},'expected_client_updated_at')?proposal.expected_client_updated_at:data.expected_client_updated_at,
    activities:{...Object.fromEntries(data.candidates.map(candidate=>[candidate.activity_id,candidate.expected_updated_at??null])),
      ...(proposal?.activity_id&&Object.hasOwn(proposal,'expected_updated_at')?{[proposal.activity_id]:proposal.expected_updated_at}:{})}};
}

// This editor stages a proposal. Only the owning native assessment Save commits it.
export default function R4AssessmentContext({record,disabled,value,onApply,onDraftChange}){
  const [loadedContext,setContext]=useState(null),[selected,setSelected]=useState(''),[changes,setChanges]=useState({}),[custom,setCustom]=useState(''),[error,setError]=useState('');
  const publishServices=useAssessmentClientContext()?.publishServices;
  const edited=useRef(false),draftBase=useRef(null),draftOwner=useRef(null),appliedValue=useRef(value),reportDraft=useRef(onDraftChange);
  reportDraft.current=onDraftChange;
  const {client_id:clientId,framework_assessment_id:assessmentId,framework_key:frameworkKey,definition_id:definitionId,framework_version:frameworkVersion}=record;
  const recordKey=JSON.stringify([clientId,assessmentId,frameworkKey,definitionId,frameworkVersion]);
  useEffect(()=>()=>reportDraft.current?.(false),[]);
  useEffect(()=>{
    let active=true;
    const identityRecord={client_id:clientId,framework_assessment_id:assessmentId,framework_key:frameworkKey,definition_id:definitionId,framework_version:frameworkVersion};
    const reset=draftOwner.current!==recordKey||appliedValue.current!==value;
    draftOwner.current=recordKey;appliedValue.current=value;
    if(reset){edited.current=false;draftBase.current=null;setCustom('');onDraftChange?.(false);}
    setContext(null);setError('');publishServices?.(null);
    api.get('/framework_assessments/'+assessmentId+'/service-context').then(({data})=>{
      if(!active)return;
      if(!validContext(data,clientId))throw new Error('Services and recurring activity are unavailable because the current client context could not be verified.');
      publishServices?.({record:identityRecord,data});setContext(data);
      if(reset||!edited.current){setSelected(value?.activity_id||data.selected_activity_id||'');setChanges(value||{});draftBase.current=contextSnapshot(data,value);}
      else onDraftChange?.(true);
    }).catch(error=>{if(active){setContext(null);setError(formatError(error));publishServices?.({record:identityRecord,error:formatError(error)});}});
    return()=>{active=false;publishServices?.(null);};
  },[clientId,assessmentId,frameworkKey,definitionId,frameworkVersion,recordKey,value,onDraftChange,publishServices]);
  const context=loadedContext?.client_id===record.client_id?loadedContext:null;
  const entry=context?.candidates.find(candidate=>candidate.activity_id===selected),area=changes.area_id||entry?.area_id;
  const service=context?.services?.areas?.[area],setup=entry?.setup||{},fields={recurring_ticket_number:setup.recurring_ticket_number||'',recurring_ticket_url:setup.recurring_ticket_url||'',recurring_ticket_summary:setup.recurring_ticket_summary||'',cadence:entry?.cadence||'annual',custom_days:entry?.custom_days||1,first_next_due:entry?.first_next_due||'',notes:setup.notes||'',no_ticket:setup.no_ticket||false,...changes};
  const tools=useMemo(()=>[...new Map([...(context?.catalog||[]),...(context?.services?.custom_tools||[]),...commonToolDefinitions(),...(changes.custom_tools||[])].map(tool=>[tool.tool_id,tool])).values()].filter(tool=>!tool.retired&&(!area||tool.area_ids.includes(area))),[context,changes.custom_tools,area]);
  const chosen=changes.tool_ids??service?.tool_ids??[];
  const hasProposal=edited.current||Object.hasOwn(value||{},'expected_client_updated_at');
  const stale=context&&hasProposal&&draftBase.current&&(draftBase.current.client!==context.expected_client_updated_at
    ||selected&&(draftBase.current.activities[selected]!==entry?.expected_updated_at&&!(draftBase.current.activities[selected]===null&&entry?.expected_updated_at==null)));
  const markDraft=()=>{if(!edited.current)draftBase.current||=contextSnapshot(context,value);edited.current=true;onDraftChange?.(true);};
  const change=(key,next)=>{markDraft();setChanges(previous=>({...previous,[key]:next,...(key.startsWith('recurring_ticket_')?{ticket_confirmed:true}:{})}));onDraftChange?.(true);};
  function chooseTool(tool,checked){markDraft();
    const known=[...(context?.catalog||[]),...(context?.services?.custom_tools||[])].some(item=>item.tool_id===tool.tool_id);
    setChanges(previous=>({...previous,tool_ids:checked?[...chosen,tool.tool_id]:chosen.filter(id=>id!==tool.tool_id),
      ...(checked&&!known?{custom_tools:[...(previous.custom_tools||[]).filter(item=>item.tool_id!==tool.tool_id),tool]}:{})}));
    onDraftChange?.(true);
  }
  function apply(){
    if(!context||disabled||stale)return;
    if(custom.trim()){setError('Add the client-specific tool to the draft, or clear its name before applying context.');return;}
    if(selected&&!entry){setError('Choose a current activity.');return;}
    onApply({...changes,activity_id:selected||null,review_id:entry?.review_id??null,expected_updated_at:draftBase.current?.activities[selected]??entry?.expected_updated_at??null,
      expected_client_updated_at:draftBase.current?.client??context.expected_client_updated_at??null,...(area?{area_id:area}:{})});
    edited.current=false;onDraftChange?.(false);setError('');
  }
  function addTool(){
    if(!custom.trim()||!area)return;markDraft();
    const tool={tool_id:'custom_'+recordUuid(),name:custom.trim(),category:'custom',area_ids:[area]};
    setChanges(previous=>({...previous,custom_tools:[...(previous.custom_tools||[]),tool],tool_ids:[...chosen,tool.tool_id]}));setCustom('');onDraftChange?.(true);
  }
  return <section className="r4-assessment-context" aria-label="Services and recurring activity">
    <h3>Services &amp; recurring activity</h3><p>Planned work and selected tools provide context. They do not establish performance, evidence or implementation.</p>
    {error&&<p role="alert">{error}</p>}{stale&&<p role="alert">Saved service or activity context changed. Your draft is retained. Discard these context edits or the staged assessment proposal before applying against the current saved context.</p>}{context&&<fieldset disabled={disabled}>
      <label>Activity<select aria-label="Assessment recurring activity" value={selected} onChange={event=>{markDraft();setSelected(event.target.value);setChanges({});}}><option value="">Select the relevant activity</option>{context.candidates.map(candidate=><option key={candidate.activity_id} value={candidate.activity_id}>{candidate.title}{candidate.state==='removed'?' — removed / excluded':''}</option>)}</select></label>
      {entry?.exclusion&&<p>Retained exclusion: {entry.exclusion.reason}. Restore it deliberately in iVenture Setup before recording a ticket.</p>}
      <label>Service area<select aria-label="Assessment service area" value={area||''} onChange={event=>change('area_id',event.target.value)}><option value="">Not set</option>{serviceCatalog.areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      <p>Responsibility: {serviceCatalog.responsibilities.find(option=>option.id===service?.responsibility)?.label||'Not set'}</p>
      <fieldset><legend>Selected tools</legend><div className="r4-context-tools">{tools.map(tool=><label key={tool.tool_id}><input type="checkbox" checked={chosen.includes(tool.tool_id)} onChange={event=>chooseTool(tool,event.target.checked)}/>{tool.name}</label>)}</div></fieldset>
      <div className="r4-context-add"><Input aria-label="Client-specific interview tool" value={custom} maxLength={255} placeholder="Client-specific tool" onChange={event=>{markDraft();setCustom(event.target.value);}}/><Button variant="outline" disabled={!custom.trim()||!area} onClick={addTool}>Add to draft</Button></div>
      {entry&&<><div className="r4-context-grid">{[['recurring_ticket_number','Recurring ticket number'],['recurring_ticket_url','Recurring ticket URL'],['recurring_ticket_summary','Recurring ticket summary']].map(([key,label])=><label key={key}>{label}<Input aria-label={label} value={fields[key]} onChange={event=>change(key,event.target.value)}/></label>)}
        <label>Cadence<select aria-label="Planned activity cadence" value={fields.cadence} onChange={event=>change('cadence',event.target.value)}>{fields.cadence==='none'&&<option value="none">One time (saved)</option>}{['monthly','quarterly','semiannual','annual','custom'].map(cadence=><option key={cadence} value={cadence}>{cadence}</option>)}</select></label>
        {fields.cadence==='custom'&&<label>Days<Input aria-label="Custom activity interval" type="number" min={1} max={3660} step={1} value={fields.custom_days} onChange={event=>change('custom_days',Number(event.target.value))}/></label>}
        <label>First / next date<Input aria-label="Activity first / next date" type="date" value={fields.first_next_due} onChange={event=>change('first_next_due',event.target.value)}/></label></div>
        <label><input type="checkbox" checked={fields.no_ticket} onChange={event=>change('no_ticket',event.target.checked)}/>No recurring ticket / performed by the Security Program Manager</label><label>Setup notes<Textarea aria-label="Assessment setup notes" value={fields.notes} onChange={event=>change('notes',event.target.value)}/></label></>}
      <div className="r4-guided-actions"><Button variant="outline" onClick={()=>{edited.current=false;draftBase.current=contextSnapshot(context,value);setSelected(value?.activity_id||context.selected_activity_id||'');setChanges(value||{});setCustom('');setError('');onDraftChange?.(false);}}>Discard context edits</Button><Button disabled={!!stale} onClick={apply}>Apply context to draft</Button></div><p>Shared service and activity changes require an internal program administrator. {value?'Context is staged. Save assessment commits the assessment and shared changes together.':'Apply stages this context; Save progress only saves interview answers.'} Existing client tools remain until explicitly removed in Client Profile.</p>
    </fieldset>}
  </section>;
}
