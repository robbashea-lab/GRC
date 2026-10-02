import {useRef} from 'react';
import {focusFallback} from '@/lib/focusRescue';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import './BrawndoCisAssessment.css';

/** Presentation only. Callers own persistence, native conclusions and leave guards. */
export default function AssessmentShell({open=true,title,description,status,position,
  previous,next,close,busy,children,context,footer,crumbs,ariaModal,testId='framework-assessment-workspace',returnSelector}) {
  // Next / Save & next can remount while focus is still inside the old drawer.
  // Only a page control, not that drawer's disappearing content, is an opener.
  const heading=useRef(null),opener=useRef(document.activeElement?.closest?.('[data-assessment-shell]')?null:document.activeElement);
  return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}>
    <DialogContent className="brawndo-cis-assessment bg-surface-card" data-testid={testId} aria-modal={ariaModal?'true':undefined}
      onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}}
      onCloseAutoFocus={e=>{e.preventDefault();requestAnimationFrame(()=>{
        if(document.querySelector('[data-assessment-shell]'))return;
        const target=opener.current?.isConnected&&opener.current!==document.body?opener.current:
          returnSelector?document.querySelector(returnSelector):null;
        if(target)target.focus();else focusFallback(document.querySelector('main h1'));
      });}} onPointerDownOutside={e=>e.preventDefault()} data-assessment-shell>
      <header className="brawndo-assessment-header">
        <div className="min-w-0">{crumbs}<DialogTitle ref={heading} tabIndex={-1}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {status&&<div className="brawndo-header-status">{status}</div>}</div>
        <nav aria-label="Assessment navigation" className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!previous||busy} onClick={previous}>Previous</Button>
          <span className="text-xs text-ink-secondary tabular-nums">{position?.replace(' in framework order','')}</span>
          <Button size="sm" variant="outline" disabled={!next||busy} onClick={next}>Next</Button>
        </nav>
      </header>
      <div className="brawndo-assessment-scroll">
        <div className="brawndo-assessment-columns">
          <div className="brawndo-assessment-main">{children}</div>
          <aside className="brawndo-assessment-details" aria-label="Assessment Details">{context}</aside>
        </div>
      </div>
      <footer className="brawndo-assessment-footer">{footer}</footer>
    </DialogContent>
  </Dialog>;
}

export function AssessmentStep({number,title,children}) {
  return <section className="brawndo-step" aria-label={title}>
    <h3><span className="brawndo-step-number" aria-hidden="true">{number}</span>{title}</h3>
    <div className="brawndo-step-body">{children}</div>
  </section>;
}
