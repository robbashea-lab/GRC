import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react';

// Only Layout's client body provides this; platform/account/public portals retain native behavior.
export const ClientWorkspaceAvailability = createContext(true);
export const useClientWorkspaceAvailable = () => useContext(ClientWorkspaceAvailability);

export function useSurfaceAvailabilityEvents(props) {
  const available=useClientWorkspaceAvailable();
  return Object.fromEntries(['onOpenAutoFocus','onEscapeKeyDown','onPointerDownOutside','onFocusOutside','onInteractOutside'].map(name=>[
    name,event=>{if(!available)event.preventDefault();else props[name]?.(event);}
  ]));
}

// Capture entry modality on the actual portalled node, not on its parent.
// Switching from keyboard to mouse inside an open drawer must never replay entry.
export function useSurfaceRef(forwardedRef) {
  const available=useClientWorkspaceAvailable(),availability=useRef(available),surface=useRef(null),restore=useRef(null),focus=useRef(null);
  availability.current=available;
  const sync=useCallback(()=>{
    restore.current?.();restore.current=null;
    const node=surface.current;if(!node)return;
    if(!availability.current){
      const active=node.ownerDocument.activeElement;
      if(!focus.current&&node.contains(active))focus.current=active;
      const previous={hidden:node.hidden,inert:node.getAttribute('inert'),
        display:node.style.getPropertyValue('display'),priority:node.style.getPropertyPriority('display')};
      restore.current=()=>{
        node.hidden=previous.hidden;
        if(previous.inert===null)node.removeAttribute('inert');else node.setAttribute('inert',previous.inert);
        if(previous.display)node.style.setProperty('display',previous.display,previous.priority);else node.style.removeProperty('display');
      };
      node.hidden=true;node.setAttribute('inert','');
      node.style.setProperty('display','none','important');
    }else{
      const target=focus.current;focus.current=null;
      if(target?.isConnected&&node.contains(target)&&node.ownerDocument.activeElement===node.ownerDocument.body)
        target.focus({preventScroll:true});
    }
  },[]);
  useLayoutEffect(()=>{sync();return()=>{restore.current?.();restore.current=null;};},[available,sync]);
  return useCallback(node => {
    if(surface.current!==node){restore.current?.();restore.current=null;focus.current=null;surface.current=node;}
    if (node && !node.dataset.entryMotion) {
      node.dataset.entryMotion = node.ownerDocument.documentElement.dataset.inputModality || 'keyboard';
    }
    sync();
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef,sync]);
}
