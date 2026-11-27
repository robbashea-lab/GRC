import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,Info,ListChecks} from 'lucide-react';
import IsoAuditGuide from './IsoAuditGuide';
import {Button} from './ui/button';

// This authorized prospective clarification qualifies the existing methodology,
// not the ISO requirement or any retained workpaper's recorded conclusion.
export function auditMethodClarification(review,item,historical=false) {
  return !historical&&!review?.completed_at&&!['completed','cancelled'].includes(review?.status)
    &&review?.iso_audit?.package_key==='governance-risk'&&item?.key==='4-3'
    ?'Compare scope against relevant certificate wording only if a current certificate exists. Absence of certification is not an automatic scope failure or a requirement to obtain a certificate.'
    :null;
}

/** Presentation state only. Audit answers, progress and history remain native workpaper fields. */
export default function IsoAuditMethodologyGuide({enabled,review,item,summary,historical=false,busy=false,onOpen}) {
  const [open,setOpen]=useState(false),[visited,setVisited]=useState(false);
  const launcher=useRef(null),heading=useRef(null),returnRequested=useRef(false),panelId=useId();
  useEffect(()=>{
    if(open)heading.current?.focus({preventScroll:true});
    else if(returnRequested.current){returnRequested.current=false;launcher.current?.focus({preventScroll:true});}
  },[open]);
  useEffect(()=>{if(!enabled){returnRequested.current=false;setOpen(false);setVisited(false);}},[enabled]);
  const pause=()=>{returnRequested.current=true;setOpen(false);};
  const clarification=auditMethodClarification(review,item,historical);
  // Keep the pre-existing summary access when the native programme guide is unavailable.
  if(!enabled)return <details className="assessment-summary"><summary>Requirement summary</summary><p>{summary}</p></details>;
  return <section className="gn-guide" aria-label="Audit methodology guidance">
    <header className="gn-guide-head"><h3><ListChecks size={16} aria-hidden="true"/>Audit methodology</h3>{open&&<Button className="gn-button gn-quiet" variant="outline" disabled={busy} onClick={pause}>Pause &amp; return</Button>}</header>
    <div className="gn-start" hidden={open}>
      <p>{summary}</p>
      <Button ref={launcher} className="gn-button gn-primary" disabled={busy} aria-expanded={open} aria-controls={panelId} onClick={()=>{setVisited(true);setOpen(true);}}>{visited?'Open audit guidance':'Begin audit guidance'}<ArrowRight size={16} aria-hidden="true"/></Button>
      <span className="gn-small gn-muted">Preparation guidance · save conclusions in the workpaper</span>
    </div>
    <section id={panelId} className="gn-question-area" hidden={!open} aria-label="Audit methodology content" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();pause();}}}>
      <h3 ref={heading} tabIndex={-1}>Prepare this audit workpaper</h3>
      {clarification&&<p role="note">{clarification}</p>}
      <IsoAuditGuide review={review} item={item} historical={historical} disabled={busy} onOpen={onOpen?()=>{setOpen(false);onOpen();}:undefined}/>
    </section>
    <div className="gn-guide-note"><Info size={16} aria-hidden="true"/><span>Use the existing workpaper to record checks, notes, evidence and conclusions. Opening or pausing guidance does not save or complete audit work.</span></div>
  </section>;
}
