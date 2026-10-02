import {useEffect} from 'react';
// Focus is "lost" when the activated control unmounted and the browser fell back to <body>.
export const focusLost=()=>!document.activeElement||document.activeElement===document.body||!document.activeElement.isConnected;
// Move focus to a fallback element without changing what a pointer user sees.
export function focusFallback(el){if(!el)return false;if(!el.hasAttribute('tabindex')&&!el.matches('a[href],button,input,select,textarea'))el.setAttribute('tabindex','-1');el.focus({preventScroll:false});return true;}
// After a navigation that replaces the activated control (drill-in, breadcrumb, view switch),
// rescue lost focus to the element that names the new location. Never steals focus otherwise.
export function useRescueFocus(ref,key){useEffect(()=>{if(focusLost())focusFallback(ref.current);},[key]);}// eslint-disable-line react-hooks/exhaustive-deps
