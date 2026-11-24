import {useEffect,useRef,useState} from 'react';
import {formatError} from '@/lib/api';
import {Button} from './ui/button';
import {X} from 'lucide-react';
import {safeguardDateFooter} from '@/lib/brawndoSafeguardDates';
import AssessmentItemCommands from './AssessmentItemCommands';
import {itemType,projectItemDraft,removableItem} from '@/lib/assessmentItemDraft';
import {Textarea} from './ui/textarea';
import {safeguard11ItemGroups,safeguard11ItemKind} from '@/lib/brawndoSafeguard11';
import {ticketRecords,ticketStage} from '@/lib/remediationTickets';

export default function AssessmentItems(props){
  return <AssessmentItemCommands {...props} onDraftChange={undefined}>{commands=><ItemView {...props} commands={commands}/>}</AssessmentItemCommands>;
}

function ItemView({record,ctx,disabled,onCreateFinding,onDraftChange,safeguard11=false,standard=false,proposedItems=null,workDisabled=false,controls,commands}) {
  const [notes,setNotes]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const recordIdentity=JSON.stringify([record.client_id,record.framework_assessment_id,record.framework_key]);
  const fallbackOwner=useRef({identity:recordIdentity,upstream:controls?.scope});
  if(fallbackOwner.current.identity!==recordIdentity||fallbackOwner.current.upstream!==controls?.scope)fallbackOwner.current={identity:recordIdentity,upstream:controls?.scope};
  const owner=fallbackOwner.current;
  const latest=useRef(null),active=useRef(true),resolutionRefs=useRef(new Map()),withdrawnFocus=useRef(null);
  latest.current={record,disabled,busy,safeguard11:safeguard11||standard,workDisabled,owner,view:standard?'standard':safeguard11?'pilot':'generic'};
  function resolutionRef(itemId) {
    const scope=JSON.stringify([record.client_id,record.framework_assessment_id,itemId]);
    if(!resolutionRefs.current.has(scope)) {
      let field=null,wasView='generic';
      resolutionRefs.current.set(scope,node=>{
        const current=latest.current,actual=current.record;
        const sameScope=scope===JSON.stringify([actual.client_id,actual.framework_assessment_id,itemId]);
        const item=actual.items_to_address?.find(row=>row.item_id===itemId);
        const editable=sameScope&&!!actual.client_id&&!!actual.framework_assessment_id&&!!item&&!['superseded','removed'].includes(item.state)&&!current.disabled&&!current.busy;
        if(!node) {
          // The grouped presentation is replaced; keep focus only within the same live native Item.
          if(wasView!==current.view&&editable&&field&&field===document.activeElement&&!field.matches(':disabled')) {
            withdrawnFocus.current={scope,value:field.value,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection};
          }
          field=null;return;
        }
        field=node;wasView=current.view;
        const receipt=withdrawnFocus.current;
        if(receipt?.scope===scope) {
          withdrawnFocus.current=null;
          if(editable&&node.isConnected&&!node.matches(':disabled')&&node.value===receipt.value) {
            // Reveal the retained editor when the grouped presentation returns.
            if(current.safeguard11) {
              let details=node.closest('details');
              while(details&&details.closest('.assessment-items')) {details.open=true;details=details.parentElement?.closest('details');}
            }
            node.focus({preventScroll:true});node.setSelectionRange(receipt.start,receipt.end,receipt.direction);
          }
        }
      });
    }
    return resolutionRefs.current.get(scope);
  }
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const localOwner=useRef(owner);
  if(localOwner.current!==owner){localOwner.current=owner;withdrawnFocus.current=null;}
  const [notesOwner,setNotesOwner]=useState(owner);
  const currentNotes=notesOwner===owner?notes:{};
  useEffect(()=>{setNotes({});setNotesOwner(owner);setError('');setBusy(false);},[owner]);
  let items=[],projectionError='';
  try{items=projectItemDraft(record,proposedItems,controls?.operations||[],controls?.answers||{});}
  catch(failure){projectionError=formatError(failure);}
  const dirty=items.some(item=>currentNotes[item.view_key]!==undefined&&currentNotes[item.view_key]!==item.resolution);
  useEffect(()=>{onDraftChange?.(dirty||busy||commands.draft);},[dirty,busy,commands.draft,onDraftChange]);
  useEffect(()=>()=>onDraftChange?.(false),[onDraftChange]);
  async function save(item,state) {
    const current=latest.current;
    if(current.disabled||current.busy||commands.busy||current.owner!==owner
      ||current.record.client_id!==record.client_id||current.record.framework_assessment_id!==record.framework_assessment_id)return;
    const resolution=currentNotes[item.view_key]??item.resolution??'';
    const clearNote=()=>setNotes(previous=>{
      if(previous[item.view_key]!==undefined&&previous[item.view_key]!==resolution)return previous;
      const next={...previous};delete next[item.view_key];return next;
    });
    if(proposedItems!==null){
      if(controls?.pending&&controls.onOperation?.({operation:'resolve',target:item.target,state,resolution})===true)clearNote();
      else setError('The pending assessment draft could not accept this Item edit. No Item was saved.');
      return;
    }
    setBusy(true);setError('');
    const accepts=()=>active.current&&latest.current.owner===owner
      &&latest.current.record.client_id===record.client_id&&latest.current.record.framework_assessment_id===record.framework_assessment_id;
    try {
      const data=await commands.resolve(item,{expected_revision:current.record.items_revision||0,state,resolution});
      if(!data)return;
      if(!accepts())return;
      if(data.client_id!==record.client_id||data.framework_assessment_id!==record.framework_assessment_id||data.framework_key!==record.framework_key)throw new Error('The Item save response does not match this assessment. Reload to confirm its saved state.');
      const accepted=data.items_to_address?.find(saved=>saved.item_id===item.item_id);
      // A retained request may confirm older A while this field already contains newer B.
      if(accepted?.state===state&&accepted.resolution===resolution)clearNote();
    } catch (failure) {if(accepts())setError(formatError(failure));}
    finally {if(accepts())setBusy(false);}
  }
  const linkedTickets=ctx?.current?.framework_assessment_id===record.framework_assessment_id &&
    ctx.current.client_id===record.client_id && ctx.related ? ticketRecords(ctx.related,record.client_id) : [];
  function renderItem(item,historical=false) {
    const blocked=disabled||busy||commands.busy||historical,resolution=currentNotes[item.view_key]??item.resolution;
    const resolutionBlocked=blocked||!commands.canResolve;
    const formalBlocked=blocked||workDisabled||proposedItems!==null||commands.unconfirmed;
    const action=<>{itemType(item)==='gap'?<Button variant="outline" disabled={formalBlocked||!onCreateFinding||!item.controls?.can_create_finding} onClick={()=>{if(!latest.current.disabled&&!latest.current.workDisabled)onCreateFinding({...record.items_to_address.find(saved=>saved.item_id===item.item_id),resolution});}}>{safeguard11||standard?'Raise finding':'Create finding'}</Button>:["confirmation","evidence"].includes(itemType(item))?<Button variant="outline" disabled={formalBlocked||!item.controls?.can_create_action} onClick={()=>commands.openTask(item)}>{standard?'Create action item':'Create Action Item'}</Button>:null}
      {removableItem(item)&&<Button variant={standard?"ghost":"outline"} className={standard?"icon-btn sm":undefined} aria-label="Remove item" disabled={blocked||commands.unconfirmed} onClick={()=>commands.remove(item)}>{standard?<X size={14} aria-hidden="true"/>:"Remove item"}</Button>}</>;
    const ticket=item.finding_id ? linkedTickets.find(t=>t.finding?.finding_id===item.finding_id) :
      item.task_id && linkedTickets.find(t=>t.actions.some(task=>task.task_id===item.task_id));
    const linkedWork=(item.task_id||item.finding_id)&&<><Button variant="link" onClick={()=>commands.openWork(item)} disabled={busy||commands.busy}>{item.task_id?'Open Action Item':ticket?.finding?.title||'Open Finding'}</Button>
      {ticket&&<small>Linked work · {ticketStage(ticket).replaceAll('_',' ')}</small>}</>;
    const kind=itemType(item)==='unknown'?{label:'Recorded item',tone:'neutral'}:itemType(item)==='evidence'?{label:'Evidence to link',tone:'confirm'}:safeguard11ItemKind(item);
    const resolutionFields=<>
      <label>Resolution<Textarea ref={resolutionRef(item.item_id||item.view_key)} aria-label={`Resolution: ${item.text}`} maxLength={4000} disabled={blocked} value={resolution||''} onChange={event=>setNotes(previous=>({...previous,[item.view_key]:event.target.value}))}/></label>
      {!historical&&<Button variant="outline" disabled={resolutionBlocked||resolution===item.resolution} onClick={()=>save(item,item.state)}>Save resolution</Button>}
      {!!item.history?.length&&<details><summary>Resolution history</summary>{item.history.map((entry,index)=><p key={index}>{entry.at} · {entry.state}{entry.resolution&&` · ${entry.resolution}`}</p>)}</details>}
    </>;
    if(standard){
      const type=itemType(item),tone=type==='gap'?'alert':type==='confirmation'?'warn':'neu';
      const label=type==='confirmation'?'Needs confirmation':kind.label;
      const date=safeguardDateFooter({last_saved:item.updated_at||item.created_at});
      const source=item.controls?.origin==='manual'?'Added manually':item.controls?.origin==='guided'?'Guided assessment':'Recorded item';
      return <section className={'assessment-item ita-row'+(item.state==='resolved'?' done':'')} key={item.view_key}>
        <span className={'st '+tone}><i aria-hidden="true"/>{label}</span>
        <div style={{flex:1,minWidth:0}}><div className="ita-txt">{item.text}</div>
          <div className="sub">{source}{date.dateTime&&<> · <time dateTime={date.dateTime}>{date.display}</time></>}{(historical||item.state==='resolved')&&<> · {item.state==='removed'?'Removed':historical?'Superseded':'Resolved'}</>}{linkedWork}</div>
          <details className="sg11-item-resolution"><summary>Resolution and history</summary>{resolutionFields}</details>
        </div>
        {!historical&&<div className="ita-acts">{action}<Button variant="outline" disabled={resolutionBlocked} onClick={()=>save(item,item.state==='resolved'?'open':'resolved')}>{item.state==='resolved'?'Reopen':'Resolve'}</Button></div>}
      </section>;
    }
    if(safeguard11)return <section className="assessment-item sg11-item" key={item.view_key}>
      <span className={`sg11-item-kind ${kind.tone}`}>{kind.label}</span>
      <div className="sg11-item-content">
        <strong>{item.text}</strong>
        {(historical||item.state==='resolved')&&<small className="sg11-item-state">{historical?(item.state==='removed'?'Removed':'Superseded'):'Resolved'}</small>}
        <details className="sg11-item-resolution"><summary>Resolution and history</summary>{resolutionFields}</details>
        {linkedWork}
      </div>
      {!historical&&<div className="assessment-item-actions">
        <Button variant="outline" disabled={resolutionBlocked} onClick={()=>save(item,item.state==='resolved'?'open':'resolved')}>{item.state==='resolved'?'Reopen':'Mark done'}</Button>
        {action}
      </div>}
    </section>;
    return <section className="assessment-item" key={item.view_key}>
      <label><input type="checkbox" checked={item.state==='resolved'} disabled={resolutionBlocked} onChange={event=>save(item,event.target.checked?'resolved':'open')}/> {item.text}</label>
      <p>{item.state==='resolved'?'Resolved':historical?(item.state==='removed'?'Removed':'Superseded'):'Open'}</p>
      <label>Resolution<Textarea ref={resolutionRef(item.item_id||item.view_key)} aria-label={`Resolution: ${item.text}`} maxLength={4000} disabled={blocked} value={resolution||''} onChange={event=>setNotes(previous=>({...previous,[item.view_key]:event.target.value}))}/></label>
      {!historical&&<div className="assessment-item-actions">
        <Button variant="outline" disabled={resolutionBlocked||resolution===item.resolution} onClick={()=>save(item,item.state)}>Save resolution</Button>
        {action}{linkedWork}
      </div>}
      {historical&&linkedWork}
      {!!item.history?.length&&<details><summary>Resolution history</summary>{item.history.map((entry,index)=><p key={index}>{entry.at} · {entry.state}{entry.resolution&&` · ${entry.resolution}`}</p>)}</details>}
    </section>;
  }
  const current=items.filter(item=>!['superseded','removed'].includes(item.state));
  const previous=items.filter(item=>['superseded','removed'].includes(item.state));
  return <div className="assessment-items" style={standard?{display:"flex",flexDirection:"column",gap:10}:undefined} aria-label={proposedItems!==null?'Proposed Items to address':'Items to address'}>
    {(error||projectionError)&&<p role="alert">{error||projectionError}</p>}
    {workDisabled&&<p>Save assessment changes before creating formal work from an Item.</p>}
    {proposedItems!==null&&<p role="status">Unsaved Items. Save assessment commits these edits; no Finding or Action is created automatically.</p>}
    {current.some(item=>item.pendingReconciliation)&&<p>Retained Item state is shown until native Save reconciles the current interview.</p>}
    {standard?current.map(item=>renderItem(item)):safeguard11?<>
      {(safeguard11?safeguard11ItemGroups(current.filter(item=>item.state!=='resolved')):[{name:null,items:current.filter(item=>item.state!=='resolved')}]).map(group=><section className="sg11-item-group" key={group.name||'current'}>{group.name&&<h4>{group.name} · {group.items.length}</h4>}{group.items.map(item=>renderItem(item))}</section>)}
      {current.some(item=>item.state==='resolved')&&<details><summary>Resolved items · {current.filter(item=>item.state==='resolved').length}</summary>{current.filter(item=>item.state==='resolved').map(item=>renderItem(item))}</details>}
    </>:current.map(item=>renderItem(item))}
    {!projectionError&&!current.length&&<p>No current items to address are recorded.</p>}
    {!!previous.length&&<details><summary>Previous items</summary>{previous.map(item=>renderItem(item,true))}</details>}
  </div>;
}
