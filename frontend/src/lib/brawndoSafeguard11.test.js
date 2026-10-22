import {safeguard11Eligible,safeguard11ItemGroups,safeguard11ItemKind,safeguard11DueDate} from './brawndoSafeguard11';

const row={framework_assessment_id:'assessment-11',client_id:'demo_brawndo',framework_key:'cis-ig1',framework_version:'8.1',definition_id:'1.1'};
const eligible=()=>({visualReference:true,brawndoRecord:true,record:{...row},current:{...row},definition:{id:'1.1'},ctx:{configuration:{implementation_group:1},current:{...row}}});

test('the pilot additionally requires the accepted exact native assessment identity',()=>{
  expect(safeguard11Eligible(eligible())).toBe(true);
  for(const patch of [{visualReference:false},{visualReference:'true'},{brawndoRecord:false},{ctx:null},{definition:{id:'1.2'}}]) {
    expect(safeguard11Eligible({...eligible(),...patch})).toBe(false);
  }
  for(const key of ['record','current'])for(const patch of [
    {client_id:'other'},{framework_key:'soc-2'},{framework_version:'8.0'},
    {definition_id:'1.2'},{framework_assessment_id:'different'},
  ]) {
    const input=eligible();input[key]={...input[key],...patch};
    expect(safeguard11Eligible(input)).toBe(false);
  }
  const missing=eligible();missing.record.framework_assessment_id='';
  expect(safeguard11Eligible(missing)).toBe(false);
  const ig2=eligible();ig2.ctx.configuration.implementation_group=2;
  expect(safeguard11Eligible(ig2)).toBe(true);
  ig2.ctx.configuration.implementation_group=4;
  expect(safeguard11Eligible(ig2)).toBe(false);
  const stale=eligible();stale.ctx.current.framework_assessment_id='old';
  expect(safeguard11Eligible(stale)).toBe(false);
});

test('grouping uses source question IDs, preserves identities and retains unmapped records honestly',()=>{
  const coverage={item_id:'coverage-gap',question_id:'coverage',kind:'gap',text:'Inventory'};
  const inventory={item_id:'inventory-confirm',question_id:'inventory',kind:'verification',text:'Asset coverage'};
  const unknown={item_id:'unknown',question_id:'future_question',kind:'new_kind',text:'Inventory'};
  const legacy={item_id:'legacy',text:'Review and reconciliation'};
  const items=[coverage,unknown,inventory,legacy];
  const groups=safeguard11ItemGroups(items);
  expect(groups.map(group=>group.name)).toEqual(['Inventory','Asset coverage','Other recorded items']);
  expect(groups[0].items[0]).toBe(inventory);
  expect(groups[1].items[0]).toBe(coverage);
  expect(groups[2].items).toEqual([unknown,legacy]);
  expect(items).toEqual([coverage,unknown,inventory,legacy]);
  expect(safeguard11ItemGroups([])).toEqual([]);
  expect(safeguard11ItemKind(coverage)).toEqual({label:'Gap',tone:'gap'});
  expect(safeguard11ItemKind(inventory)).toEqual({label:'Confirm',tone:'confirm'});
  expect(safeguard11ItemKind(unknown)).toEqual({label:'Recorded item',tone:'neutral'});
  expect(safeguard11ItemGroups([{...unknown,question_id:'inventory'}])[0].name).toBe('Other recorded items');
});

test.each([
  [2026,0,31,1,'2026-02-01'],[2026,11,31,1,'2027-01-01'],
  [2028,1,28,1,'2028-02-29'],[2026,2,7,2,'2026-03-09'],
  [2026,9,31,2,'2026-11-02'],[2026,0,1,0,'2026-01-01'],
])('optional due shortcut moves local calendar days across boundaries', (year,month,day,days,expected)=>{
  expect(safeguard11DueDate(days,new Date(year,month,day,23,30))).toBe(expected);
});
