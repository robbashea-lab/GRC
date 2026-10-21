import {catalog} from './clientProfile';
import {calendarDay,managementDay} from './managementDates';

export const profileList=value=>value==null||value===''?[]:Array.isArray(value)?value:String(value).split(';').map(item=>item.trim()).filter(Boolean);
export const profileValue=value=>value==null||value===''||Array.isArray(value)&&!value.length?'Not provided':Array.isArray(value)?value.join(' · '):String(value);
export const profileInitials=name=>String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'—';
// Use the existing management calendar day without interpreting missing or legacy values as dates.
export function profileRenewalRelative(value,today) {
  const renewalDay=calendarDay(value),currentDay=managementDay(today);
  if(renewalDay===null||currentDay===null)return null;
  const days=renewalDay-currentDay,unit=Math.abs(days)===1?'day':'days';
  if(days<0)return `${Math.abs(days)} ${unit} overdue`;
  return days===0?'today':`in ${days} ${unit}`;
}
export const maturityFields=catalog.sections.security.filter(field=>field.options==='capability');
export const handlingFields=catalog.sections.security.filter(field=>field.options==='answer');
export function profileMaturity(security={}) {
  const rows=maturityFields.map(field=>({...field,value:security[field.id]??'Unknown'}));
  const counts=Object.fromEntries(['Implemented','Partial','Not Implemented','Not Applicable','Unknown'].map(value=>[value,rows.filter(row=>row.value===value).length]));
  return {rows,counts};
}
