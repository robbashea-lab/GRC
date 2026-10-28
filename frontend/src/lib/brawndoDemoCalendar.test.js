import {cisClient, cisContext} from '../testUtils/cisExperience';
import {brawndoDemoCalendar,filterCalendarItems} from './brawndoDemoCalendar';
const context={...cisContext(),workspaceMode:'demo',user:{user_id:'u',role:'client_viewer',workspace_mode:'demo'},currentClientId:'demo_brawndo',selectedClientId:'demo_brawndo',currentClient:cisClient(),pathname:'/calendar'};
test('Calendar appearance requires canonical trusted resolved, selected, current and route agreement',()=>{
  expect(brawndoDemoCalendar(context)).toBe(true);
  for(const patch of [{workspaceMode:'standard'},{user:{...context.user,workspace_mode:'standard'}},{user:null},{currentClientId:'duplicate'},{selectedClientId:'other'},{currentClient:{client_id:'duplicate',name:'Brawndo'}},{currentClient:{client_id:'demo_brawndo',archived:true}},{routeClientId:'other'},{pathname:'/reviews'},{authLoading:true},{authError:'denied'},{orgLoading:true},{orgError:'denied'}])expect(brawndoDemoCalendar({...context,...patch})).toBe(false);
});
test('Calendar view filters retain history and vendor identity without changing native records',()=>{
  const rows=[{key:'late',kind:'review',date:'2026-10-01',historical:false,owner_id:'u'},{key:'done',kind:'task',date:'2026-10-02',historical:true},{key:'vendor',kind:'vendor_assurance',date:'2026-10-20',historical:false}];
  const copy=JSON.stringify(rows),options={types:['review','task','vendor'],scope:'all',owner:'all',highlight:'all',today:'2026-10-16'};
  expect(filterCalendarItems(rows,options)).toHaveLength(3);
  expect(filterCalendarItems(rows,{...options,highlight:'overdue'}).map(x=>x.key)).toEqual(['late']);
  expect(filterCalendarItems(rows,{...options,highlight:'week'}).map(x=>x.key)).toEqual([]);
  expect(filterCalendarItems(rows,{...options,scope:'done'}).map(x=>x.key)).toEqual(['done']);
  expect(filterCalendarItems(rows,{...options,owner:'u'}).map(x=>x.key)).toEqual(['late']);
  expect(JSON.stringify(rows)).toBe(copy);
});

test('native scheduled summary includes saved Vendor and represented Finding dates without changing enrolled exclusions',()=>{
  const rows=[
    {key:'vendor-overdue',kind:'vendor_contract_notice',date:'2026-10-15',historical:false},
    {key:'finding-overdue',kind:'finding',date:'2026-10-15',historical:false,represented:true},
    {key:'vendor-soon',kind:'vendor_assurance',date:'2026-10-20',historical:false},
    {key:'closed',kind:'task',date:'2026-10-15',historical:true,status:'cancelled'},
  ];
  const before=JSON.stringify(rows),options={types:['review','task','finding','vendor'],scope:'all',owner:'all',today:'2026-10-16'};
  expect(filterCalendarItems(rows,{...options,highlight:'overdue'})).toEqual([]);
  expect(filterCalendarItems(rows,{...options,highlight:'week'})).toEqual([]);
  expect(filterCalendarItems(rows,{...options,nativeScheduledItems:true,highlight:'overdue'}).map(row=>row.key)).toEqual(['vendor-overdue','finding-overdue']);
  expect(filterCalendarItems(rows,{...options,nativeScheduledItems:true,highlight:'week'}).map(row=>row.key)).toEqual(['vendor-soon']);
  expect(JSON.stringify(rows)).toBe(before);
});
