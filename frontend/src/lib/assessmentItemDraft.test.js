import {projectItemDraft,itemType,removableItem} from './assessmentItemDraft';

const row={items_to_address:[{item_id:'actual-guided',question_id:'coverage',kind:'verification',state:'resolved',resolution:'Reviewed',history:[{event:'resolved'}]},
  {item_id:'retained-unknown',kind:'future_kind',state:'open',text:'Do not reinterpret'}],
  item_controls:{'actual-guided':{origin:'guided'}},guided_assessment_source:{answers:{coverage:'Not sure'}}};
const proposal={question_id:'coverage',kind:'verification',text:'Confirm actual coverage'};

test('pending edits preserve saved identities/history and have no invented native identities',()=>{
  const before=JSON.stringify(row),request='synthetic_manual_request_001';
  const rows=projectItemDraft(row,[proposal],[{operation:'add',request_id:request,item_type:'evidence',text:'Link the actual report'},
    {operation:'resolve',target:{manual_request_id:request},state:'resolved',resolution:'Reviewed'},
    {operation:'remove',target:{question_id:'coverage',kind:'verification'}}],{coverage:'Not sure'});
  expect(JSON.stringify(row)).toBe(before);
  expect(rows[0]).toMatchObject({item_id:'actual-guided',state:'removed',resolution:'Reviewed',history:[{event:'resolved'}]});
  expect(rows[1]).toMatchObject(row.items_to_address[1]);
  expect(rows[2]).toMatchObject({request_id:request,item_type:'evidence',state:'resolved',resolution:'Reviewed'});
  expect(rows[2]).not.toHaveProperty('item_id');expect(rows[2]).not.toHaveProperty('history');
  expect(rows[2].target).toEqual({manual_request_id:request});
});

test('changed guided answers reopen the projection, unchanged tombstones and unknown history remain retained',()=>{
  const removed={...row,items_to_address:[{...row.items_to_address[0],state:'removed'},row.items_to_address[1]]};
  expect(projectItemDraft(removed,[proposal],[],{coverage:'Not sure'})[0].state).toBe('removed');
  expect(projectItemDraft(removed,[proposal],[],{coverage:'No'})[0].state).toBe('open');
  const unknown={...row,guided_assessment_source:null};
  expect(projectItemDraft(unknown,[proposal])[0]).toMatchObject({state:'resolved',pendingReconciliation:true});
  expect(()=>projectItemDraft(row,[proposal],[{operation:'remove',target:{item_id:'retained-unknown'}}])).toThrow('Only manual');
});

test('unsupported and contradictory types never become confirmation work',()=>{
  expect(itemType({kind:'future_kind'})).toBe('unknown');
  expect(itemType({kind:'gap',item_type:'evidence'})).toBe('unknown');
  expect(itemType({kind:'verification',item_type:'evidence'})).toBe('evidence');
  expect(removableItem({kind:'gap',state:'resolved',controls:{origin:'unknown'}})).toBe(false);
});
