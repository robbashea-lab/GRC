import {sharedAppearanceEligible} from './sharedExperience';
export function brawndoDemoCalendar(context) {
  return sharedAppearanceEligible(context) && context.pathname === '/calendar';
}
export const calendarKind=item=>item.kind.startsWith('vendor_')?'vendor':item.kind;
export const calendarOwner=(item,members)=>members.find(person=>person.user_id===item.owner_id)?.name||(item.owner_id?'Owner unavailable':'Unassigned');
export const calendarCompleted=item=>['done','completed','closed'].includes(item.status);
export function filterCalendarItems(entries,{types,scope,owner,highlight,today}) {
  const soon=new Date(today+'T12:00:00');soon.setDate(soon.getDate()+7);
  const end=`${soon.getFullYear()}-${String(soon.getMonth()+1).padStart(2,'0')}-${String(soon.getDate()).padStart(2,'0')}`;
  return entries.filter(item=>types.includes(calendarKind(item))&&(scope==='all'||(scope==='done')===item.historical)
    &&(owner==='all'||(item.owner_id||'')===owner)
    &&(highlight==='all'||highlight==='done'&&calendarCompleted(item)||highlight==='overdue'&&!item.represented&&calendarKind(item)!=='vendor'&&!item.historical&&item.date<today||highlight==='week'&&!item.represented&&calendarKind(item)!=='vendor'&&!item.historical&&item.date>=today&&item.date<=end));
}
