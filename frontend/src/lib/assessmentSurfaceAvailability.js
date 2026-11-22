import {createContext,useCallback,useContext,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {useClientWorkspaceAvailable} from './useSurfaceRef';

export const AssessmentSurfaceAvailability=createContext(true);
export const useAssessmentSurfaceAvailable=()=>useContext(AssessmentSurfaceAvailability);
const observedChanges={subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:['hidden','inert','style']};

// Only ephemeral popup visibility is owned here; selected values and drafts stay native.
export function useAssessmentPopupState({open,defaultOpen=false,onOpenChange}){
  const available=useAssessmentSurfaceAvailable(),controlled=open!==undefined;
  const [internalOpen,setInternalOpen]=useState(defaultOpen),previous=useRef(internalOpen),handler=useRef(onOpenChange),availability=useRef(available);
  handler.current=onOpenChange;availability.current=available;
  const requestedOpen=controlled?open:internalOpen;
  useEffect(()=>{
    if(previous.current!==internalOpen){previous.current=internalOpen;handler.current?.(internalOpen);}
  },[internalOpen]);
  const change=useCallback(next=>{
    const value=availability.current&&next;
    if(controlled){if(value!==open)handler.current?.(value);}else setInternalOpen(value);
  },[controlled,open]);
  useLayoutEffect(()=>{if(!available&&requestedOpen)change(false);},[available,requestedOpen,change]);
  return {open:available&&requestedOpen,onOpenChange:change};
}

export function useAssessmentPopupContentProps(props,supportsForceMount=true){
  const available=useAssessmentSurfaceAvailable();
  return available?{}:{...(supportsForceMount?{forceMount:false}:{}),
    style:{...props.style,animation:'none',transition:'none'},onCloseAutoFocus:event=>event.preventDefault()};
}

function visible(node){
  if(!node?.isConnected||node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
  for(let parent=node;parent;parent=parent.parentElement){
    const style=node.ownerDocument.defaultView.getComputedStyle(parent);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
  }
  return true;
}

function newerModal(node){
  return [...node.ownerDocument.querySelectorAll('[role="dialog"],[role="alertdialog"],.native-palette')].some(other=>
    other!==node&&!other.contains(node)&&visible(other)
    &&(node.contains(other)||!!(node.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING)));
}

// Keep native modal ownership and mounted drafts; conceal only their draft-bearing children.
export function useAssessmentSurfaceSuspension(forwardedRef){
  const available=useAssessmentSurfaceAvailable(),clientAvailable=useClientWorkspaceAvailable(),statusId=useId();
  const surface=useRef(null),state=useRef({available,clientAvailable}),saved=useRef(new Map()),focus=useRef(null),observer=useRef(null);
  state.current={available,clientAvailable};
  const captureChanges=useCallback(records=>{
    for(const record of records){
      const child=record.target;if(!saved.current.has(child))continue;
      const previous=saved.current.get(child);
      if(record.type==='characterData'){saved.current.set(child,child.nodeValue);continue;}
      if(record.type!=='attributes')continue;
      if(record.attributeName==='hidden'||record.attributeName==='inert')previous[record.attributeName]=child.getAttribute(record.attributeName);
      if(record.attributeName==='style'){
        const oldStyle=child.ownerDocument.createElement('div').style;oldStyle.cssText=record.oldValue||'';
        const display=child.style.getPropertyValue('display'),priority=child.style.getPropertyPriority('display');
        if(oldStyle.getPropertyValue('display')!==display||oldStyle.getPropertyPriority('display')!==priority)
          Object.assign(previous,{display,priority});
      }
    }
  },[]);
  const pauseObserver=useCallback(()=>{
    // Observe React-owned changes, never the temporary concealment writes below.
    if(observer.current){captureChanges(observer.current.takeRecords());observer.current.disconnect();}
  },[captureChanges]);
  const restore=useCallback(()=>{
    pauseObserver();
    for(const [child,previous] of saved.current){
      if(child.nodeType===3){child.nodeValue=previous;continue;}
      for(const name of ['hidden','inert']){
        if(previous[name]===null)child.removeAttribute(name);else child.setAttribute(name,previous[name]);
      }
      if(previous.display)child.style.setProperty('display',previous.display,previous.priority);else child.style.removeProperty('display');
    }
    saved.current.clear();
  },[pauseObserver]);
  const focusStatus=useCallback(()=>{
    const node=surface.current;
    if(state.current.clientAvailable&&visible(node)&&!newerModal(node))
      [...node.children].find(child=>child.hasAttribute('data-assessment-suspension-status'))?.focus({preventScroll:true});
  },[]);
  const sync=useCallback((records=[])=>{
    captureChanges(records);pauseObserver();
    const node=surface.current;if(!node)return;
    const active=node.ownerDocument.activeElement;
    if(state.current.available){
      restore();
      const target=focus.current;focus.current=null;
      if(state.current.clientAvailable&&target&&node.contains(target)&&!target.disabled&&visible(target)&&!newerModal(node)
        &&(active===node||active===node.ownerDocument.body
          ||active?.closest('[role="dialog"],[role="alertdialog"]')===node&&active.matches('[data-assessment-suspension-status],[data-assessment-suspension-close]')))
        target.focus({preventScroll:true});
      return;
    }
    const wasInside=node.contains(active)&&active?.closest('[role="dialog"],[role="alertdialog"]')===node
      &&!active.closest('[data-assessment-suspension-status],[data-assessment-suspension-close]');
    if(wasInside&&!focus.current)focus.current=active;
    const conceal=child=>{
      if(child.nodeType===3){
        if(!saved.current.has(child))saved.current.set(child,child.nodeValue);
        if(child.nodeValue)child.nodeValue='';
        return;
      }
      if(child.nodeType!==1||child.hasAttribute('data-assessment-suspension-status')||child.hasAttribute('data-assessment-suspension-close'))return;
      // A portalled native shell retains its own scoped draft and modal ownership.
      if(child.matches('.ui-overlay,[role="dialog"],[role="alertdialog"]'))return;
      if(child.hasAttribute('data-assessment-suspension-controls')){[...child.childNodes].forEach(conceal);return;}
      if(!saved.current.has(child))saved.current.set(child,{hidden:child.getAttribute('hidden'),inert:child.getAttribute('inert'),
        display:child.style.getPropertyValue('display'),priority:child.style.getPropertyPriority('display')});
      if(!child.hidden)child.hidden=true;
      if(!child.hasAttribute('inert'))child.setAttribute('inert','');
      if(child.style.getPropertyValue('display')!=='none'||child.style.getPropertyPriority('display')!=='important')child.style.setProperty('display','none','important');
    };
    [...node.childNodes].forEach(conceal);
    observer.current?.observe(node,observedChanges);
    if(wasInside||active===node.ownerDocument.body&&(focus.current||node.getAttribute('aria-modal')!=='false'))focusStatus();
  },[captureChanges,pauseObserver,focusStatus,restore]);
  const ref=useCallback(node=>{
    // Radix re-composes refs on renders; a transient null does not replace the actual surface.
    if(node&&surface.current!==node){restore();focus.current=null;surface.current=node;}
    if(!node)restore();
    if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;
    if(node)sync();
  },[forwardedRef,restore,sync]);
  useLayoutEffect(()=>{
    if(!available&&!observer.current)observer.current=new MutationObserver(sync);
    sync();
  },[available,clientAvailable,sync]);
  useLayoutEffect(()=>()=>{restore();observer.current=null;},[restore]);
  return {ref,available,
    statusProps:{id:statusId,role:'status',tabIndex:-1,hidden:available,style:available?{display:'none'}:undefined,'data-assessment-suspension-status':''},
    contentProps:available?{}:{'aria-labelledby':statusId,'aria-describedby':undefined},
    onOpenAutoFocus:(event,handler)=>{if(!available){event.preventDefault();sync();focusStatus();}else handler?.(event);}};
}
