import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronDown} from 'lucide-react';
import AssessmentShell from './AssessmentShell';
import AssessmentLayout from './AssessmentLayout';
import {CisBreadcrumb} from './BrawndoCisControls';
import {safeguardDateFooter} from '@/lib/brawndoSafeguardDates';
import {useOrg} from '@/context/OrgContext';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import './BrawndoCisVisualSafeguard.css';
import './BrawndoSafeguard11.css';
import './BrawndoAssessmentPilot.css';

// Shared pilot presentation only: every action remains the caller's native controller.
export default function AssessmentRolloutFrame({state,actions,status,frameworkLabel,requirement,
  interview,findings,itemsToAddress,children,testId,sectionCounts}) {
  const {open,record,definition,current,form,ctx,busy,error,dirty,writable,feedback,
    position,previous,next,breadcrumb,otherDraft,finding,pilotSurfaceRef}=state;
  const {close,save,saveAndNext,retry,put}=actions;
  const disabled=!writable||busy||!ctx;
  const {currentClient}=useOrg()||{};
  const [detailsView,setDetailsView]=useState(null),[surface,setSurface]=useState(null);
  const [implementationReviewContainer,setImplementationReviewContainer]=useState(null);
  const trigger=useRef(null),destination=useRef(false),notesField=useRef(null),notesHeading=useRef(null);
  const bindSurface=useCallback(node=>{setSurface(node);pilotSurfaceRef?.(node);},[pilotSurfaceRef]);
  useEffect(()=>setDetailsView(null),[record.framework_assessment_id]);
  const portalContainer=surface||state.pilotPortalContainer||undefined;
  const returnToDetails=event=>{event.preventDefault();trigger.current?.focus({preventScroll:true});};
  const crumbs=currentClient?.client_id===record.client_id&&currentClient.name
    ?[{label:currentClient.name},...(breadcrumb||[])]:breadcrumb;
  const footerDate=safeguardDateFooter(current);
  const footerStatus=busy?'Working…':dirty?['Unsaved assessment changes',feedback].filter(Boolean).join(' · ')
    :feedback||(!writable?'Read-only assessment':null);
  const menu=<DropdownMenu onOpenChange={value=>{if(value)destination.current=false;}}>
    <DropdownMenuTrigger asChild><Button ref={trigger} className="gn-button gn-details-trigger" variant="outline" disabled={busy}>Assessment details<ChevronDown className="gn-icon" aria-hidden="true"/></Button></DropdownMenuTrigger>
    <DropdownMenuContent className="gn-details-menu" portalContainer={portalContainer} align="end"
      onCloseAutoFocus={event=>{if(destination.current)event.preventDefault();}}>
      <DropdownMenuItem disabled={!state.manageRecord||busy} onSelect={()=>{destination.current=true;state.manageRecord?.();}}>Ownership &amp; assessment history</DropdownMenuItem>
      <DropdownMenuItem disabled={!form.notes&&!current.notes||busy} onSelect={()=>{destination.current=true;setDetailsView('notes');}}>Recorded notes</DropdownMenuItem>
      <DropdownMenuItem disabled={!interview||!ctx||busy} onSelect={()=>{destination.current=true;setDetailsView('history');}}>Interview history</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
  return <AssessmentShell open={open} title={definition.title}
    description={<span className="sr-only">{frameworkLabel} assessment workspace</span>}
    className="brawndo-cis-visual-safeguard brawndo-safeguard11 brawndo-assessment-pilot gn-window"
    surfaceRef={bindSurface} navigationActions={menu} closeInNavigation status={status}
    position={position} previous={previous||actions.previous} next={next||actions.next} close={close} busy={busy}
    testId={testId} ariaModal
    crumbs={crumbs?.length?<CisBreadcrumb items={crumbs} label={`${frameworkLabel} location`}/>:null}
    returnSelector={`[data-testid="requirement-${definition.id}"]`}
    footer={<><div className="min-w-0 flex-1">
      {error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}
      <span role="status" className="text-sm text-ink-secondary">{footerStatus||<>{footerDate.dateTime?<>{footerDate.label} <time dateTime={footerDate.dateTime} title={footerDate.dateTime}>{footerDate.display}</time></>:footerDate.text}</>}</span>
      {otherDraft&&<p id="rollout-other-draft" className="text-xs text-ink-secondary">Finish or discard the open interview or related-record draft before using Save &amp; next.</p>}
    </div><div className="flex flex-wrap gap-2 gn-footer-actions">{writable&&<>
      <Button className="gn-button" variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>
      {saveAndNext&&<Button className="gn-button gn-primary" disabled={disabled||!!otherDraft||!!finding} aria-describedby={otherDraft?'rollout-other-draft':undefined} onClick={saveAndNext}>Save &amp; next<ArrowRight className="gn-icon" aria-hidden="true"/></Button>}
    </>}</div></>}>
    {!ctx&&!error&&<p role="status">Loading assessment…</p>}
    <AssessmentLayout inlineWorkflow guidedWorkflow safeguard11 sectionCounts={sectionCounts}
      requirement={requirement} itemsToAddress={itemsToAddress} findings={findings} findingDraft={!!finding}
      interview={interview?view=>interview({...view,historyOpen:detailsView==='history',
        onHistoryOpenChange:value=>{if(!value)setDetailsView(null);},onHistoryCloseAutoFocus:returnToDetails,
        implementationReviewContainer,pilotPortalContainer:portalContainer}):null}>
      {children}
      <div className="gn-wording-entry-container" ref={setImplementationReviewContainer}/>
      <Dialog open={detailsView==='notes'} onOpenChange={value=>{if(!value)setDetailsView(null);}}>
        <DialogContent aria-modal="true" className="brawndo-assessment-pilot brawndo-pilot-child-dialog gn-dialog-box gn-wording-box"
          portalContainer={portalContainer} overlayClassName="brawndo-assessment-pilot brawndo-pilot-child-overlay gn-dialog-layer" showCloseButton={false}
          onOpenAutoFocus={event=>{event.preventDefault();(disabled?notesHeading.current:notesField.current)?.focus({preventScroll:true});}}
          onCloseAutoFocus={returnToDetails} onEscapeKeyDown={event=>event.stopPropagation()} onPointerDownOutside={event=>event.preventDefault()}>
          <DialogTitle ref={notesHeading} tabIndex={-1}>Recorded notes</DialogTitle>
          <DialogDescription>Notes remain part of this assessment draft. Use Save assessment to retain changes.</DialogDescription>
          <Textarea ref={notesField} className="gn-field" aria-label="Recorded notes" disabled={disabled} value={form.notes||''} onChange={event=>put('notes',event.target.value)}/>
          <div className="gn-dialog-actions"><Button className="gn-button" variant="outline" onClick={()=>setDetailsView(null)}>Back to assessment</Button></div>
        </DialogContent>
      </Dialog>
    </AssessmentLayout>
  </AssessmentShell>;
}
