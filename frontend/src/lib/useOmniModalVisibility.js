import {useLayoutEffect} from 'react';

// Retain a mounted interview while a higher native modal owns visibility and focus.
export default function useOmniModalVisibility(surface){
  useLayoutEffect(()=>{
    const node=surface.current;if(!node)return;
    let blocked=false;
    const check=()=>{
      const dialogs=[...document.querySelectorAll('[role="dialog"][aria-modal="true"],.native-palette')].filter(dialog=>!dialog.closest('[hidden],[aria-hidden="true"]')&&window.getComputedStyle(dialog).display!=='none');
      const next=dialogs.some(dialog=>!dialog.contains(node)&&!node.contains(dialog));
      if(next===blocked)return;blocked=next;
      node.inert=blocked;node.style.visibility=blocked?'hidden':'';
    };
    check();const observer=new MutationObserver(check);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','aria-hidden','aria-modal','data-state','style']});
    return()=>{observer.disconnect();node.inert=false;node.style.visibility='';};
  },[surface]);
}
