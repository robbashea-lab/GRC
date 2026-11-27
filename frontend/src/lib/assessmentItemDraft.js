// Read-only draft projection. Local view keys are never native Item IDs or save authority.
const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

export function itemType(item){
  if(item.kind==='gap'&&[undefined,'gap'].includes(item.item_type))return 'gap';
  if(item.kind==='verification'&&[undefined,'confirmation','evidence'].includes(item.item_type))return item.item_type||'confirmation';
  return 'unknown';
}
export const removableItem=item=>!['removed','superseded'].includes(item.state)
  &&(item.pendingManual===true||item.controls?.origin==='manual'||item.state==='resolved'&&(item.pendingGuided===true||item.controls?.origin==='guided'));
const matches=(item,target)=>target.item_id?item.item_id===target.item_id
  :target.manual_request_id?item.request_id===target.manual_request_id
    :item.question_id===target.question_id&&item.kind===target.kind;
const signature=(answers,question)=>stable([['summary_confirmation','scope_reason'].includes(question)?answers:answers?.[question]??null,answers?.[question+'_detail']??null]);

export function projectItemDraft(record,proposals,operations=[],answers={}){
  const saved=clone(record.items_to_address||[]);
  let rows=saved.map(item=>({...item,controls:record.item_controls?.[item.item_id]||{origin:'unknown'},view_key:'saved:'+item.item_id,target:{item_id:item.item_id}}));
  if(proposals!==null){
    const current=new Set(proposals.map(item=>item.question_id+':'+item.kind));
    rows=rows.map(item=>item.controls.origin==='guided'&&!current.has(item.question_id+':'+item.kind)&&!['removed','superseded'].includes(item.state)
      ?{...item,state:'superseded'}:item);
    for(const proposal of proposals){
      const previous=rows.find(item=>item.controls.origin==='guided'&&item.question_id===proposal.question_id&&item.kind===proposal.kind);
      const sourceKnown=!!record.guided_assessment_source?.answers;
      const unchanged=!!previous&&sourceKnown&&signature(record.guided_assessment_source.answers,proposal.question_id)===signature(answers,proposal.question_id);
      const state=previous&&previous.state!=='superseded'&&(unchanged||!sourceKnown)?previous.state:'open';
      const item={...(previous||{}),...proposal,state,resolution:previous?.resolution||'',pendingGuided:true,
        controls:{origin:'guided'},pendingReconciliation:!!previous&&!sourceKnown,
        view_key:previous?.view_key||'pending-guided:'+proposal.question_id+':'+proposal.kind,
        target:{question_id:proposal.question_id,kind:proposal.kind}};
      if(previous)rows=rows.map(row=>row===previous?item:row);else rows.push(item);
    }
  }
  for(const operation of operations){
    if(operation.operation==='add'){
      if(!rows.some(item=>item.request_id===operation.request_id))rows.push({view_key:'pending-manual:'+operation.request_id,
        request_id:operation.request_id,item_type:operation.item_type,kind:operation.item_type==='gap'?'gap':'verification',
        text:operation.text,state:'open',resolution:'',pendingManual:true,target:{manual_request_id:operation.request_id}});
      continue;
    }
    const item=rows.find(row=>matches(row,operation.target));
    if(!item)throw new Error('The pending Item no longer belongs to this assessment draft.');
    if(operation.operation==='resolve')Object.assign(item,{state:operation.state,resolution:operation.resolution});
    else if(operation.operation==='remove'){
      if(!removableItem(item))throw new Error('Only manual Items or resolved interview Items can be removed.');
      item.state='removed';
    }else throw new Error('Unsupported pending Item operation.');
  }
  return rows;
}
