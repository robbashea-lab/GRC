import {policyTiles,policyViewMatches} from './brawndoPolicies';
const now=new Date(2026,8,30);
const approved=(title,next)=>({title,status:'approved',approved_at:'2026-01-13',next_review_date:next,version:'2.0'});
test('tiles count approved, awaiting approval and reviews due within 30 days',()=>{
  const rows=[approved('Risk Management Policy','2026-10-20'),approved('Information Security Policy','2027-01-13'),{title:'Acceptable Use Policy',status:'draft',version:'2.1-draft',next_review_date:'2027-01-22'}];
  const t=Object.fromEntries(policyTiles(rows,[],[],now).map(x=>[x.id,x]));
  expect(t.approved).toMatchObject({count:2,context:'2 of 3 policies approved'});
  expect(t.awaiting).toMatchObject({count:1,context:'Acceptable Use Policy · v2.1-draft'});
  expect(t.due30.count).toBe(1);expect(t.due30.context).toMatch(/^Risk Management Policy, /);
  expect(policyViewMatches(rows[0],'due30',now)).toBe(true);expect(policyViewMatches(rows[1],'due30',now)).toBe(false);
});
test('when nothing is due soon the tile names the next review; approved without a recorded approval is not counted',()=>{
  const t=Object.fromEntries(policyTiles([approved('A','2027-02-01'),{title:'B',status:'approved'}],[],[],now).map(x=>[x.id,x]));
  expect(t.due30.count).toBe(0);expect(t.due30.context).toMatch(/^Next: A, /);
  expect(t.approved.count).toBe(1);
});
