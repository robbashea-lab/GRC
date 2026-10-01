import {vendorCalendarItems,calendarType} from './calendarView';
const now=new Date('2026-10-01T12:00:00Z');
const v={vendor_id:'v1',client_id:'demo_brawndo',name:'Sentinel',status:'active',business_owner_id:'u1',contract_renewal:'2027-03-30',contract_notice_deadline:'2026-12-30',
  assurance_records:[{assurance_id:'a1',type:'SOC 2',next_follow_up:'2026-11-15'},{assurance_id:'old',type:'SOC 2',next_follow_up:'2026-10-20',superseded_by:'a1'}]};
const flat=out=>Object.values(out).flat();
test('assurance, renewal and notice dates are distinct, linked to the Vendor and never reschedulable',()=>{
  const items=flat(vendorCalendarItems([v],[],{start:'2026-10-01',end:'2027-09-30'},now));
  expect(items.map(i=>[i.kind,i.due_date_iso])).toEqual(expect.arrayContaining([['vendor_assurance','2026-11-15'],['vendor_contract_notice','2026-12-30'],['vendor_contract_renewal','2027-03-30']]));
  expect(items).toHaveLength(3);
  expect(items.every(i=>i.vendor_id==='v1'&&i.can_reschedule===false&&i.client_id==='demo_brawndo')).toBe(true);
  expect(new Set(items.map(i=>i.key)).size).toBe(3);
  expect(calendarType(items.find(i=>i.kind==='vendor_contract_notice'))).toBe('Contract Notice Deadline');
});
test('a same-day Vendor/Assurance Review or any active contract Review already carries the date',()=>{
  const reviews=[{review_id:'r1',client_id:'demo_brawndo',vendor_id:'v1',vendor_purpose:'vendor',status:'upcoming',due_date:'2026-11-15'},{review_id:'r2',client_id:'demo_brawndo',vendor_id:'v1',vendor_purpose:'contract',status:'upcoming',due_date:'2027-01-01'}];
  expect(flat(vendorCalendarItems([v],reviews,{start:'2026-10-01',end:'2027-09-30'},now)).map(i=>i.kind)).toEqual(['vendor_contract_notice']);
});
test('past contract dates are history; a past assurance follow-up stays an open obligation; inactive vendors are excluded',()=>{
  const past={...v,contract_renewal:'2026-09-01',contract_notice_deadline:'2026-08-01',assurance_records:[{assurance_id:'a1',next_follow_up:'2026-09-15'}]};
  expect(flat(vendorCalendarItems([past],[],{start:'2026-07-01',end:'2026-12-31',scope:'active'},now)).map(i=>i.kind)).toEqual(['vendor_assurance']);
  expect(flat(vendorCalendarItems([past],[],{start:'2026-07-01',end:'2026-12-31',scope:'history'},now)).map(i=>i.kind).sort()).toEqual(['vendor_contract_notice','vendor_contract_renewal']);
  expect(flat(vendorCalendarItems([{...v,status:'terminated'}],[],{start:'2026-10-01',end:'2027-09-30'},now))).toHaveLength(0);
});
