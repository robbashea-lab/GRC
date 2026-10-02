import {useEffect} from 'react';
// Focus is lost when the activated control unmounts and the browser falls back to body.
export const focusLost=()=>!document.activeElement||document.activeElement===document.body||!document.activeElement.isConnected;
export function focusFallback(el){if(!el)return false;if(!el.hasAttribute('tabindex')&&!el.matches('a[href],button,input,select,textarea'))el.setAttribute('tabindex','-1');el.focus({preventScroll:false});return true;}
// Navigation may replace its activated control; never move focus when it remains elsewhere.
export function useRescueFocus(ref,key){useEffect(()=>{if(focusLost())focusFallback(ref.current);},[ref,key]);}
// A hidden generic header can precede the framework workspace's visible heading.
export const pageHeading=()=>[...document.querySelectorAll('main h1')].find(h=>h.getClientRects().length>0)||null;
