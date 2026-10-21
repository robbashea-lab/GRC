import {OMNI_GROUPS} from './refinedOmni';
import {localCalendarDate,stepCalendarDate} from './calendarView';

// This narrows the accepted native visual origin; it never grants record access.
export function safeguard11Eligible({visualReference,brawndoRecord,record,current,definition,ctx}) {
  return visualReference===true && brawndoRecord===true && !!ctx
    && ctx.configuration?.implementation_group===1 && definition?.id==='1.1'
    && typeof record?.framework_assessment_id==='string' && !!record.framework_assessment_id.trim()
    && [record,current,ctx.current].every(row=>row?.client_id==='demo_brawndo'
      && row.framework_key==='cis-ig1' && row.framework_version==='8.1' && row.definition_id==='1.1'
      && row.framework_assessment_id===record.framework_assessment_id);
}

export function safeguard11ItemKind(item) {
  if(item?.kind==='gap')return {label:'Gap',tone:'gap'};
  if(item?.kind==='verification')return {label:'Confirm',tone:'confirm'};
  return {label:'Recorded item',tone:'neutral'};
}

export function safeguard11ItemGroups(items) {
  const groups=OMNI_GROUPS['1.1'].map(group=>({name:group.name,items:[]}));
  const other={name:'Other recorded items',items:[]};
  for(const item of items) {
    const index=['gap','verification'].includes(item.kind)
      ?OMNI_GROUPS['1.1'].findIndex(group=>group.ids.includes(item.question_id)):-1;
    (index<0?other:groups[index]).items.push(item);
  }
  return [...groups,other].filter(group=>group.items.length);
}

// Fill the optional native date input only; no elapsed-hour or Eastern conversion.
export function safeguard11DueDate(days,now=new Date()) {
  return localCalendarDate(stepCalendarDate(now,'day',days));
}
