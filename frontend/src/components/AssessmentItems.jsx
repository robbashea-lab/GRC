import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';

export default function AssessmentItems({record,ctx,disabled,onSaved,onCreateFinding,onDraftChange}) {
  const [notes,setNotes]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const latest=useRef(null),active=useRef(true);
  latest.current={record,disabled};
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
    return <section className="assessment-item" key={item.item_id}>
      <label><input type="checkbox" checked={item.state==='resolved'} disabled={blocked} onChange={event=>save(item,event.target.checked?'resolved':'open')}/> {item.text}</label>
      <p>{item.state==='resolved'?'Resolved':historical?'Superseded':'Open'}</p>
      <label>Resolution<Textarea aria-label={`Resolution: ${item.text}`} maxLength={4000} disabled={blocked} value={resolution||''} onChange={event=>setNotes(previous=>({...previous,[item.item_id]:event.target.value}))}/></label>
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
    {items.filter(item=>item.state!=='superseded').map(item=>renderItem(item))}
    {!items.some(item=>item.state!=='superseded')&&<p>No current items to address are recorded.</p>}
    {!!previous.length&&<details><summary>Previous items</summary>{previous.map(item=>renderItem(item,true))}</details>}
  </div>;
}
