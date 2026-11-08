import {pilotPriority} from '@/lib/brawndoActions';
import {operatorProgram} from '@/lib/frameworkOperator';
import {calendarDay} from '@/lib/managementDates';

export function actionDateLabel(value) {
  const day=calendarDay(value);
  return day===null?null:new Date(day*86400000).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});
}

// Labels come from resolved native relationships, never from descriptions or sample titles.
export function actionSourceChip(row) {
  const source=row.source||{},target=source.target;
  if(source.kind==='framework_assessments'&&target?.definition_id&&target.framework_key)
    return `${target.framework_key==='cis-ig1'?'CIS':operatorProgram(target.framework_key)} ${target.definition_id}`;
  if(source.kind==='risks')return target?.display_id||'Risk';
  if(source.kind==='reviews')return target?.title||'Review unavailable';
  return ({manual:'Manual',assessments:'Assessment',vendors:'Vendor',policies:'Policy',framework_assessments:'Framework assessment'})[source.kind||source.type]||source.label||'Origin not recorded';
}

export function ActionPriority({value}) {
  const level=({low:1,medium:2,moderate:2,high:3,critical:3,immediate:3,informational:0})[value]??0;
  return <span className={`bda-priority bda-priority-${level}`}><svg className="bda-bars" viewBox="0 0 13 12" aria-hidden="true">{[0,1,2].map(index=><rect key={index} className={index<level?'on':''} x={index*4.5} y={8-index*4} width="3.5" height={4+index*4} rx="1"/>)}</svg>{pilotPriority(value)}</span>;
}

export function ActionOwner({name,unavailable=false,children}) {
  const initials=name.replace(/^Dr\.\s*/,'').split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase();
  return <div className={`bda-owner${unavailable?' bda-owner-unavailable':''}`}><i className="bda-avatar" aria-hidden="true">{initials}</i><span><span>{name}</span>{children}</span></div>;
}
