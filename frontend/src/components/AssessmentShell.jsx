import {useRef} from 'react';
import {X} from 'lucide-react';
import {focusFallback,focusLost,pageHeading} from '@/lib/focusRescue';
import {Dialog,DialogClose,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {OMNI_ESCAPE_EVENT} from './OmniWindow';
import './BrawndoCisAssessment.css';

function exposed(element){
  if(!element?.isConnected||element===document.body||element.closest('[hidden],[inert],[aria-hidden="true"]')||element.matches(':disabled'))return false;
  const {visibility}=getComputedStyle(element);
  return element.getClientRects().length>0&&visibility!=='hidden'&&visibility!=='collapse';
}

/** Presentation only. Callers own persistence, native conclusions and leave guards. */
export default function AssessmentShell({open=true,title,description,status,position,
  previous,next,close,busy,children,context,footer,crumbs,ariaModal,testId='framework-assessment-workspace',returnSelector,onEscapeKeyDown,className='',closeInNavigation=false}) {
  // Next / Save & next can remount while focus is still inside the old drawer.
  // Only a page control, not that drawer's disappearing content, is an opener.
  const heading=useRef(null),surface=useRef(null),opener=useRef(document.activeElement?.closest?.('[data-assessment-shell]')?null:document.activeElement);
  return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}>
    <DialogContent ref={surface} className={`brawndo-cis-assessment bg-surface-card ${className}`} data-testid={testId} aria-modal={ariaModal?'true':undefined}
      {...(closeInNavigation?{showCloseButton:false}:{})}
      onEscapeKeyDown={event=>{
        onEscapeKeyDown?.(event);
        // Radix invokes only its highest layer; route one Escape to this native window's open guide.
        const guide=surface.current?.querySelector('.omni-workspace-window');
        if(guide&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();guide.dispatchEvent(new Event(OMNI_ESCAPE_EVENT));}
      }}
      onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}}
      onCloseAutoFocus={e=>{
        e.preventDefault();const closingSurface=surface.current;
        requestAnimationFrame(()=>{
          const remaining=node=>node!==closingSurface&&node.dataset.state!=='closed';
          const shells=[...document.querySelectorAll('[data-assessment-shell]')].filter(remaining);
          const dialogs=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(node=>remaining(node)&&exposed(node));
          // A replacement assessment owns its new heading; a background shell must not block its ticket.
          if(dialogs.some(node=>node.hasAttribute('data-assessment-shell')))return;
          const active=document.activeElement;
          // Keep foreground modal focus; page closes still return to their opener or current row.
          if(dialogs.length&&!focusLost()&&exposed(active)&&dialogs.some(node=>node.contains(active)))return;
          if(dialogs.length){
            const owner=opener.current?.closest('[role="dialog"],[role="alertdialog"]');
            if(dialogs.includes(owner)&&dialogs.every(dialog=>dialog===owner||dialog.contains(owner))&&exposed(opener.current))opener.current.focus();
            return;
          }
          if(shells.length)return;
          const target=exposed(opener.current)?opener.current:returnSelector?document.querySelector(returnSelector):null;
          if(exposed(target))target.focus();else{const heading=pageHeading();if(exposed(heading))focusFallback(heading);}
        });
      }} onPointerDownOutside={e=>e.preventDefault()} data-assessment-shell>
      <header className="brawndo-assessment-header">
        <div className="min-w-0">{crumbs}<DialogTitle ref={heading} tabIndex={-1}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {status&&<div className="brawndo-header-status">{status}</div>}</div>
        <nav aria-label="Assessment navigation" className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!previous||busy} onClick={previous}>Previous</Button>
          <span className="text-xs text-ink-secondary tabular-nums">{position?.replace(' in framework order','')}</span>
          <Button size="sm" variant="outline" disabled={!next||busy} onClick={next}>Next</Button>
          {closeInNavigation&&<DialogClose type="button" className="brawndo-assessment-navigation-close"><X className="h-4 w-4" aria-hidden="true"/><span className="sr-only">Close</span></DialogClose>}
        </nav>
      </header>
      <div className="brawndo-assessment-scroll">
        <div className="brawndo-assessment-columns" style={context?undefined:{gridTemplateColumns:'minmax(0,1fr)'}}>
          <div className="brawndo-assessment-main">{children}</div>
          {context&&<aside className="brawndo-assessment-details" aria-label="Assessment Details">{context}</aside>}
        </div>
      </div>
      <footer className="brawndo-assessment-footer">{footer}</footer>
    </DialogContent>
  </Dialog>;
}

export function AssessmentStep({number,title,children}) {
  return <section className="brawndo-step" aria-label={`${title} section`}>
    <h3>{number&&<span className="brawndo-step-number" aria-hidden="true">{number}</span>}{title}</h3>
    <div className="brawndo-step-body">{children}</div>
  </section>;
}
