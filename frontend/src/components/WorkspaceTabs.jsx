import {useEffect,useRef} from 'react';
import {focusLost} from '@/lib/focusRescue';
import {Button} from './ui/button';

// WAI-ARIA tabs with automatic activation: one tab stop (roving tabindex), Arrow keys move
// between tabs, Home/End jump to the ends. Selection is owned by the caller (the ISO view is in the URL).
export default function WorkspaceTabs({label,tabs,selected,onSelect,idPrefix,panelId}){
  const refs=useRef({});
  const keys=tabs.map(([key])=>key);
  // A control inside the panel that switched the view (e.g. an overview card) unmounts; keep focus on the tabs.
  useEffect(()=>{if(focusLost())refs.current[selected]?.focus();},[selected]);
  const move=(e,key)=>{
    const i=keys.indexOf(key),last=keys.length-1;
    const next={ArrowRight:i===last?0:i+1,ArrowLeft:i===0?last:i-1,Home:0,End:last}[e.key];
    if(next===undefined)return;
    e.preventDefault();refs.current[keys[next]]?.focus();onSelect(keys[next]);
  };
  return <div role="tablist" aria-label={label} className="framework-tabs">{tabs.map(([key,text])=>{const on=key===selected;
    return <Button key={key} ref={el=>{refs.current[key]=el;}} id={`${idPrefix}-${key}`} role="tab" type="button" aria-selected={on} aria-controls={panelId} tabIndex={on?0:-1}
      variant={on?'default':'outline'} onClick={()=>onSelect(key)} onKeyDown={e=>move(e,key)}>{text}</Button>;})}</div>;
}
