import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {safeguard11ItemGroups,safeguard11ItemKind} from '@/lib/brawndoSafeguard11';

export default function AssessmentItems({record,ctx,disabled,onSaved,onCreateFinding,onDraftChange,safeguard11=false}) {
  const [notes,setNotes]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const latest=useRef(null),active=useRef(true),resolutionRefs=useRef(new Map()),withdrawnFocus=useRef(null);
  latest.current={record,disabled,busy,safeguard11};
  function resolutionRef(itemId) {
    const scope=JSON.stringify([record.client_id,record.framework_assessment_id,itemId]);
    if(!resolutionRefs.current.has(scope)) {
      let field=null,wasPilot=false;
      resolutionRefs.current.set(scope,node=>{
        const current=latest.current,actual=current.record;
        const sameScope=scope===JSON.stringify([actual.client_id,actual.framework_assessment_id,itemId]);
        const item=actual.items_to_address?.find(row=>row.item_id===itemId);
        const editable=sameScope&&!!actual.client_id&&!!actual.framework_assessment_id&&!!item&&item.state!=='superseded'&&!current.disabled&&!current.busy;
        if(!node) {
          // The grouped presentation is replaced; keep focus only within the same live native Item.
          if(wasPilot!==current.safeguard11&&editable&&field&&field===document.activeElement&&!field.matches(':disabled')) {
            withdrawnFocus.current={scope,value:field.value,start:field.selectionStart,end:field.selectionEnd,direction:field.selectionDirection};
          }
          field=null;return;
        }
        field=node;wasPilot=current.safeguard11;
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
  const items=record.items_to_address||[],dirty=items.some(item=>notes[item.item_id]!==undefined&&notes[item.item_id]!==item.resolution);
  useEffect(()=>{onDraftChange?.(dirty||busy);},[dirty,busy,onDraftChange]);
  useEffect(()=>()=>onDraftChange?.(false),[onDraftChange]);
  async function save(item,state) {
    const current=latest.current;
    if(current.disabled||busy||current.record.framework_assessment_id!==record.framework_assessment_id)return;
    const resolution=notes[item.item_id]??item.resolution;
    setBusy(true);setError('');
    try {
      const {data}=await api.patch(`/framework_assessments/${record.framework_assessment_id}/items/${item.item_id}`,{expected_revision:current.record.items_revision||0,state,resolution});
      if(!active.current||latest.current.record.framework_assessment_id!==record.framework_assessment_id)return;
      onSaved?.(data);
      setNotes(previous=>{
        if(previous[item.item_id]!==undefined&&previous[item.item_id]!==resolution)return previous;
        const next={...previous};delete next[item.item_id];return next;
      });
    } catch (failure) {if(active.current)setError(formatError(failure));}
    finally {if(active.current)setBusy(false);}
  }
  function renderItem(item,historical=false) {
    const blocked=disabled||busy||historical,resolution=notes[item.item_id]??item.resolution;
    const linked=ctx?.related?.findings?.find(finding=>finding.finding_id===item.finding_id);
    const kind=safeguard11ItemKind(item);
    const resolutionFields=<>
      <label>Resolution<Textarea ref={resolutionRef(item.item_id)} aria-label={`Resolution: ${item.text}`} maxLength={4000} disabled={blocked} value={resolution||''} onChange={event=>setNotes(previous=>({...previous,[item.item_id]:event.target.value}))}/></label>
      {!historical&&<Button variant="outline" disabled={blocked||resolution===item.resolution} onClick={()=>save(item,item.state)}>Save resolution</Button>}
      {!!item.history?.length&&<details><summary>Resolution history</summary>{item.history.map((entry,index)=><p key={index}>{entry.at} · {entry.state}{entry.resolution&&` · ${entry.resolution}`}</p>)}</details>}
    </>;
    if(safeguard11)return <section className="assessment-item sg11-item" key={item.item_id}>
      <span className={`sg11-item-kind ${kind.tone}`}>{kind.label}</span>
      <div className="sg11-item-content">
        <strong>{item.text}</strong>
        {(historical||item.state==='resolved')&&<small className="sg11-item-state">{historical?'Superseded':'Resolved'}</small>}
        <details className="sg11-item-resolution"><summary>Resolution and history</summary>{resolutionFields}</details>
        {item.finding_id&&<small className="sg11-item-linked">{linked?.title||'Finding linked'}</small>}
      </div>
      {!historical&&<div className="assessment-item-actions">
        <Button variant="outline" disabled={blocked} onClick={()=>save(item,item.state==='resolved'?'open':'resolved')}>{item.state==='resolved'?'Reopen':'Mark done'}</Button>
        <Button variant="outline" disabled={blocked||!onCreateFinding||!!item.finding_id} onClick={()=>{if(!latest.current.disabled)onCreateFinding({...item,resolution});}}>Raise finding</Button>
      </div>}
    </section>;
    return <section className="assessment-item" key={item.item_id}>
      <label><input type="checkbox" checked={item.state==='resolved'} disabled={blocked} onChange={event=>save(item,event.target.checked?'resolved':'open')}/> {item.text}</label>
      <p>{item.state==='resolved'?'Resolved':historical?'Superseded':'Open'}</p>
      <label>Resolution<Textarea ref={resolutionRef(item.item_id)} aria-label={`Resolution: ${item.text}`} maxLength={4000} disabled={blocked} value={resolution||''} onChange={event=>setNotes(previous=>({...previous,[item.item_id]:event.target.value}))}/></label>
      {!historical&&<div className="assessment-item-actions">
        <Button variant="outline" disabled={blocked||resolution===item.resolution} onClick={()=>save(item,item.state)}>Save resolution</Button>
        <Button variant="outline" disabled={blocked||!onCreateFinding||!!item.finding_id} onClick={()=>{if(!latest.current.disabled)onCreateFinding({...item,resolution});}}>Create finding</Button>
        {item.finding_id&&<span>{linked?.title||'Finding linked'}</span>}
      </div>}
      {!!item.history?.length&&<details><summary>Resolution history</summary>{item.history.map((entry,index)=><p key={index}>{entry.at} · {entry.state}{entry.resolution&&` · ${entry.resolution}`}</p>)}</details>}
    </section>;
  }
  const previous=items.filter(item=>item.state==='superseded');
  return <div className="assessment-items" aria-label="Items to address">
    {error&&<p role="alert">{error}</p>}
    {safeguard11?<>
      <p className="sg11-items-intro">Follow-up work from the saved assessment. Mark an item done or raise a finding for formal tracking.</p>
      {safeguard11ItemGroups(items.filter(item=>item.state!=='superseded'&&item.state!=='resolved')).map(group=><section className="sg11-item-group" key={group.name}><h4>{group.name} · {group.items.length}</h4>{group.items.map(item=>renderItem(item))}</section>)}
      {items.some(item=>item.state==='resolved')&&<details><summary>Resolved items · {items.filter(item=>item.state==='resolved').length}</summary>{items.filter(item=>item.state==='resolved').map(item=>renderItem(item))}</details>}
    </>:items.filter(item=>item.state!=='superseded').map(item=>renderItem(item))}
    {!items.some(item=>item.state!=='superseded')&&<p>No current items to address are recorded.</p>}
    {!!previous.length&&<details><summary>Previous items</summary>{previous.map(item=>renderItem(item,true))}</details>}
  </div>;
}
