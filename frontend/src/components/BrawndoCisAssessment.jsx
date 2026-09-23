import {useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import FrameworkReviewSetup from './FrameworkReviewSetup';
import FrameworkMappings from './FrameworkMappings';
import {operatorGuidance,operatorStatuses,STATUS_HELP} from '@/lib/frameworkOperator';
import {sourcePresentation} from '@/lib/frameworkWorkspace';
import {actionStatus} from '@/lib/actionItems';
import {recordUuid} from '@/lib/recordUuid';
import {readEvidenceFile} from '@/lib/evidenceFile';
import api from '@/lib/api';
import './BrawndoCisAssessment.css';

// Explicit synthetic-client identity, not a mutable display-name match. This is
// presentation gating only; the normal adapter/server still owns authorization.
export function isBrawndoCisPrototype(clientId,record,user){
  return user?.workspace_mode==='demo' && clientId==='demo_brawndo' &&
    record?.client_id===clientId && record.framework_key==='cis-ig1';
}
const RECORD_IDS={reviews:'review_id',findings:'finding_id',tasks:'task_id',risks:'risk_id',policies:'policy_id',requirements:'requirement_id',vendors:'vendor_id'};

function Step({number,title,children}){
  return <section className="brawndo-step" aria-label={title}>
    <h3><span className="brawndo-step-number" aria-hidden="true">{number}</span>{title}</h3>
    <div className="brawndo-step-body">{children}</div>
  </section>;
}

export default function BrawndoCisAssessment({state,actions}){
  const {open,record,definition,catalog,form,current,ctx,related,error,busy,dirty,feedback,writable,comment,finding,tab,position,link,otherDraft}=state;
  const {put,save,saveAndNext,run,download,setComment,setFinding,setTab,setNested,setReviewDraft,setLink,close,previous,next,reviewSaved,retry}=actions;
  const [evidenceSearch,setEvidenceSearch]=useState('');
  const heading=useRef(null),opener=useRef(document.activeElement),clientId=record.client_id,aid=record.framework_assessment_id;
  const guide=operatorGuidance('cis-ig1',definition),source=sourcePresentation(definition),statuses=operatorStatuses('cis-ig1');
  const disabled=!writable||busy||!ctx;
  const availableEvidence=ctx?.options.evidence?.filter(e=>!related.evidence?.some(r=>r.evidence_id===e.evidence_id));
  const matchingEvidence=availableEvidence?.filter(e=>`${e.display_name||''} ${e.filename} ${e.evidence_type||''}`.toLowerCase().includes(evidenceSearch.trim().toLowerCase()));
  const evidenceLabel=e=>e.display_name||e.filename;
  const who=id=>ctx?.users.find(u=>u.user_id===id)?.name||(id?'Former / unavailable user':'Unassigned');
  const records=(kind,rows=[])=>rows.map(r=><li key={r[RECORD_IDS[kind]]} className="brawndo-linked-row">
    <button type="button" className="text-link text-left" disabled={busy} onClick={()=>setNested({kind,record:r})}>{r.title||r.name}</button>
    <span className="text-xs text-ink-secondary">{kind==='tasks'?actionStatus(r.status):r.status?.replaceAll('_',' ')}</span>
  </li>);
  const startFinding=()=>setFinding({title:`${definition.id} · ${definition.title} — implementation gap`,description:form.implementation||'',remediation_title:`Address ${definition.id} implementation gap`,severity:'medium',request_id:recordUuid()});
  return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}>
    <DialogContent className="brawndo-cis-assessment bg-surface-card" data-testid="brawndo-cis-assessment"
      onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}}
      onCloseAutoFocus={e=>{e.preventDefault();requestAnimationFrame(()=>{
        if(document.querySelector('[data-testid="brawndo-cis-assessment"]'))return;
        const target=opener.current?.isConnected&&opener.current!==document.body?opener.current:
          document.querySelector(`[data-testid="requirement-${definition.id}"] button`)||document.querySelector('[aria-label="Continue where you left off"] button');
        target?.focus();
      });}} onPointerDownOutside={e=>e.preventDefault()}>
      <header className="brawndo-assessment-header">
        <div className="min-w-0"><DialogTitle ref={heading} tabIndex={-1}>CIS IG1 {definition.id} — {definition.title}</DialogTitle>
          <DialogDescription>Brawndo · Control {definition.control} · {definition.control_name}</DialogDescription></div>
        <nav aria-label="Safeguard navigation" className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!previous||busy} onClick={previous}>Previous</Button>
          <span className="text-xs text-ink-secondary tabular-nums">{position?.replace(' in framework order','')}</span>
          <Button size="sm" variant="outline" disabled={!next||busy} onClick={next}>Next</Button>
        </nav>
      </header>
      <div className="brawndo-assessment-scroll">
        {!ctx&&!error&&<p role="status" className="px-6 py-3 text-sm">Loading linked work…</p>}
        <div className="brawndo-assessment-columns">
          <div className="brawndo-assessment-main">
            <Step number="1" title="What does CIS require?">
              <p className="brawndo-requirement-title">{definition.title}</p>
              {source.mode!=='REFERENCE_ONLY'?<p className="whitespace-pre-wrap">{source.text}</p>:<p className="text-sm text-ink-secondary">Full CIS requirement wording is available in the official reference. The guidance below is an Omnisciente summary, not official CIS text.</p>}
              <h4>Implementation Guidance</h4><p>{guide.meaning}</p><p className="text-sm text-ink-secondary">{guide.implementation}</p>
              <h4>What to Verify</h4><p className="text-xs text-ink-secondary">Consider reviewing these safeguard-specific records; this is guidance, not a mandatory artifact checklist.</p>
              <ul className="list-disc pl-5 space-y-2">{guide.evidence.split(';').map((line,i)=><li key={i}>{line.trim()}</li>)}</ul>
              <div className="brawndo-reference"><span>CIS Controls {catalog.version} · Safeguard {definition.id}</span>{source.url?<a href={source.url} target="_blank" rel="noopener noreferrer">Open official CIS reference ↗</a>:<span>{source.citation} · Public link unavailable</span>}</div>
            </Step>
            <Step number="2" title="Do we do it?">
              <fieldset disabled={disabled} aria-describedby="brawndo-status-help"><legend className="sr-only">Assessment status</legend>
                <div className="brawndo-status-options">{['addressed','in_progress','needs_attention','not_applicable','not_assessed'].map(status=><label key={status} className={form.status===status?'is-selected':''}>
                  <input type="radio" name="brawndo-assessment-status" value={status} checked={form.status===status} onChange={()=>put('status',status)}/><span>{statuses[status]}</span>
                </label>)}</div>
              </fieldset>
              <p id="brawndo-status-help" className="text-sm text-ink-secondary">{STATUS_HELP[form.status]?.replaceAll('Assessment notes','the implementation narrative')}</p>
              {form.status==='not_applicable'&&<label className="block">Why is this safeguard not applicable?<Textarea aria-label="N/A Rationale" disabled={disabled} value={form.na_rationale||''} onChange={e=>put('na_rationale',e.target.value)} maxLength={4000}/></label>}
            </Step>
            <Step number="3" title="How do we do it?">
              <fieldset disabled={disabled} className="space-y-4">
                <label className="block">How is this requirement implemented?<Textarea aria-label="How is this requirement implemented?" className="brawndo-narrative" rows={6} maxLength={20000} value={form.implementation||''} onChange={e=>put('implementation',e.target.value)} placeholder="Describe the actual process, scope, operation and any exceptions."/></label>
                <label className="block">Technology / Processes Used<Input aria-label="Technology / Processes Used" value={form.technology||''} onChange={e=>put('technology',e.target.value)}/></label>
                {form.notes&&<details><summary>Previously recorded notes</summary><p className="text-xs text-ink-secondary">Retained separately to preserve existing information. Use the implementation narrative for your current assessment.</p><Textarea aria-label="Previously recorded notes" value={form.notes} onChange={e=>put('notes',e.target.value)}/></details>}
              </fieldset>
            </Step>
            <Step number="4" title="Evidence & Validation">
              <div className="flex flex-wrap justify-between items-center gap-2"><p>{ctx?`${related.evidence?.length||0} linked evidence records`:'Loading evidence…'}</p>{writable&&<Button variant="outline" size="sm" disabled={disabled} aria-expanded={tab==='Evidence'} onClick={()=>setTab(tab==='Evidence'?'':'Evidence')}>Link Evidence</Button>}</div>
              <ul>{related.evidence?.map(e=><li className="brawndo-linked-row" key={e.evidence_id}><div className="min-w-0"><button className="text-link text-left" aria-label={`Download ${evidenceLabel(e)}`} disabled={busy} onClick={()=>download(e)}>{evidenceLabel(e)}</button>{e.display_name&&e.display_name!==e.filename&&<p className="text-xs text-ink-secondary">{e.filename}</p>}</div><span className="text-xs text-ink-secondary">{[e.evidence_type,e.created_at?.slice(0,10)].filter(Boolean).join(' · ')}</span></li>)}</ul>
              {ctx&&!related.evidence?.length&&<p className="text-sm text-ink-secondary">No evidence linked yet. Link an existing artifact or upload one without duplicating the Evidence Library.</p>}
              {tab==='Evidence'&&writable&&<fieldset disabled={disabled} className="brawndo-inset space-y-3">
                <p className="text-xs text-ink-secondary">Evidence links and uploads save immediately. Assessment text is saved separately below.</p>
                <label className="block">Find existing evidence<Input aria-label="Find existing evidence" value={evidenceSearch} onChange={e=>setEvidenceSearch(e.target.value)} placeholder="Search name, filename or type"/></label>
                <label className="block">Link existing Evidence<select aria-label="Link existing Evidence" disabled={!matchingEvidence?.length} value="" onChange={e=>{const id=e.target.value;if(id)run(()=>api.post(`/framework_assessments/${aid}/links`,{kind:'evidence',id}));}}><option value="">Select Evidence Library item</option>{matchingEvidence?.map(e=><option key={e.evidence_id} value={e.evidence_id}>{evidenceLabel(e)}{e.created_at?` · ${e.created_at.slice(0,10)}`:''}</option>)}</select></label>
                <p role="status" className="text-xs text-ink-secondary">{!availableEvidence?'Loading available evidence…':!availableEvidence.length?'No additional evidence available to link.':!matchingEvidence.length?'No evidence matches your search.':`${matchingEvidence.length} available to link`}</p>
                <label className="block">Upload Evidence<input className="block mt-2 max-w-full" aria-label="Upload Evidence" type="file" onChange={e=>{const f=e.target.files?.[0];if(f)run(async()=>api.post('/evidence',{client_id:clientId,linked_type:'framework_assessment',linked_id:aid,filename:f.name,mime_type:f.type||'application/octet-stream',content_base64:await readEvidenceFile(f)}));}}/></label>
                {!!related.evidence?.length&&<details><summary>Manage current assessment links</summary>{related.evidence.map(e=><Button key={e.evidence_id} variant="ghost" size="sm" onClick={()=>run(()=>api.delete(`/framework_assessments/${aid}/links`,{data:{kind:'evidence',id:e.evidence_id}}))}>Unlink {e.filename}</Button>)}<p className="text-xs">Unlinking preserves the Library item and its original provenance.</p></details>}
              </fieldset>}
              <p className="text-xs text-ink-secondary">Evidence supports your conclusion; an upload alone does not establish implementation.</p>
            </Step>
            <Step number="5" title="Gap / Remediation">
              <div className="flex flex-wrap justify-between items-center gap-2"><p className="text-sm text-ink-secondary">A Finding records the gap; its Action Item tracks remediation.</p>{writable&&!finding&&<Button variant="outline" size="sm" disabled={disabled} onClick={startFinding}>Create Finding</Button>}</div>
              <ul>{records('findings',related.findings)}</ul>
              {ctx&&!related.findings?.length&&<p className="text-sm text-ink-secondary">No linked Findings.</p>}
              {finding&&<fieldset disabled={disabled} className="brawndo-inset space-y-3"><legend className="font-medium">New Finding</legend>
                {[['title','Finding title'],['remediation_title','Remediation Action title'],['description','Finding description']].map(([key,label])=>{const Field=key==='description'?Textarea:Input;return <label className="block" key={key}>{label}<Field aria-label={label} value={finding[key]} onChange={e=>setFinding({...finding,[key]:e.target.value})}/></label>;})}
                <label className="block">Severity<select aria-label="Finding severity" value={finding.severity} onChange={e=>setFinding({...finding,severity:e.target.value})}>{['low','medium','high','critical'].map(s=><option key={s}>{s}</option>)}</select></label>
                <div className="flex flex-wrap gap-2"><Button onClick={()=>run(async()=>{await api.post(`/framework_assessments/${aid}/findings`,finding);setFinding(null);})}>Create Finding & Action</Button><Button variant="ghost" onClick={()=>setFinding(null)}>Cancel Finding</Button></div>
              </fieldset>}
            </Step>
          </div>
          <aside className="brawndo-assessment-details" aria-label="Assessment Details">
            <h3>Assessment Details</h3><p className="text-xs text-ink-secondary">Supporting context</p>
            <dl><dt>Saved assessment</dt><dd>{statuses[current.status]}</dd><dt>Last assessed</dt><dd>{current.last_assessed?.slice(0,10)||'Not assessed'}</dd></dl>
            <fieldset disabled={disabled} className="space-y-4">
              <div><label>Assessment Owner</label><AssigneeSelect clientId={clientId} label="Assessment Owner" value={form.owner_id} onChange={v=>put('owner_id',v)} users={ctx?.users||[]} disabled={disabled}/></div>
              <label className="block">Process Owner<select aria-label="Process Owner" value={form.process_owner_id||''} onChange={e=>put('process_owner_id',e.target.value||null)}><option value="">Unassigned</option>{ctx?.contacts.map(c=><option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}</select></label>
            </fieldset>
            <details><summary>Reviews & recurrence · {related.reviews?.length||0}</summary>
              <p className="text-xs mt-3">Source cadence: {definition.source_cadence}</p><p className="text-xs text-ink-secondary my-3">The linked Review owns the operational schedule; a suggested setup interval is not automatically a CIS requirement.</p>
              <FrameworkReviewSetup record={current} definition={definition} catalog={catalog} reviews={ctx?.options.reviews||[]} users={ctx?.users||[]} clientId={clientId} writable={!disabled} onDraftChange={setReviewDraft} onOpen={r=>setNested({kind:'reviews',record:r})} onSaved={reviewSaved}/>
            </details>
            <details><summary>Action Items · {related.tasks?.length||0}</summary><ul>{records('tasks',related.tasks)}</ul>{ctx&&!related.tasks?.length&&<p className="text-xs mt-2">No linked Action Items.</p>}</details>
            {['risks','policies'].map(kind=><details key={kind}><summary>{kind==='risks'?'Risks':'Policies'} · {related[kind]?.length||0}</summary><ul>{records(kind,related[kind])}</ul></details>)}
            <details onToggle={e=>{if(e.currentTarget.open)setTab('Related');}}><summary>Other relationships & mappings</summary>
              {['requirements','vendors'].map(kind=><ul key={kind}>{records(kind,related[kind])}</ul>)}
              <FrameworkMappings framework="cis-ig1" definition={definition.id}/>
              {writable&&<fieldset disabled={disabled} className="space-y-3 mt-3"><label className="block">Record type<select aria-label="Related record type" value={link.kind} onChange={e=>{setTab('Related');setLink({kind:e.target.value,id:''});}}>{Object.keys(RECORD_IDS).map(kind=><option key={kind} value={kind}>{kind==='tasks'?'Action Items':kind}</option>)}</select></label><label className="block">Record<select aria-label="Related record" value={link.id} onChange={e=>setLink({...link,id:e.target.value})}><option value="">Select record</option>{ctx?.options[link.kind]?.map(r=><option key={r[RECORD_IDS[link.kind]]} value={r[RECORD_IDS[link.kind]]}>{r.title||r.name}</option>)}</select></label><Button size="sm" variant="outline" disabled={disabled||!link.id} onClick={()=>run(()=>api.post(`/framework_assessments/${aid}/links`,link))}>Link record</Button></fieldset>}
            </details>
            <details><summary>Discussion · {ctx?.comments.length||0}</summary><ul>{ctx?.comments.map(c=><li className="mt-3 text-sm whitespace-pre-wrap break-words" key={c.comment_id}>{c.body}<p className="text-xs">{c.author_name||c.user_name} · {c.created_at?.slice(0,10)}</p></li>)}</ul>{writable&&<fieldset disabled={disabled} className="mt-3 space-y-2"><Textarea aria-label="Safeguard comment" value={comment} onChange={e=>setComment(e.target.value)}/><Button size="sm" disabled={!comment.trim()||disabled} onClick={()=>run(async()=>{await api.post('/comments',{client_id:clientId,entity_type:'framework_assessments',entity_id:aid,body:comment});setComment('');})}>Add comment</Button></fieldset>}</details>
            <details><summary>View History</summary><ul>{current.assessment_history?.slice().reverse().map((h,i)=><li key={i} className="mt-3 text-sm whitespace-pre-wrap break-words"><p className="font-medium">{statuses[h.status]} · {h.at?.slice(0,10)}</p><p className="text-xs">{who(h.by)}</p><p>{h.implementation}</p>{h.notes&&<p>{h.notes}</p>}{h.na_rationale&&<p>N/A: {h.na_rationale}</p>}</li>)}</ul>{!current.assessment_history?.length&&<p className="text-xs mt-3">No saved assessments yet.</p>}<h4 className="mt-4 text-sm font-medium">Activity</h4>{ctx?.activity.map((a,i)=><p key={a.audit_id||i} className="mt-2 text-xs">{a.action} · {a.at} · {a.user_name||a.user_email}</p>)}</details>
          </aside>
        </div>
      </div>
      <footer className="brawndo-assessment-footer"><div className="min-w-0 flex-1">{error&&<div role="alert" className="text-sm text-semantic-critical mb-1">{error}{!ctx&&<Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div>}<span role="status" className="text-sm text-ink-secondary">{dirty?'Unsaved assessment changes':feedback||(!writable?'Read-only assessment':'Assessment changes are saved when you choose Save assessment.')}</span>{otherDraft&&<p id="brawndo-other-draft" className="text-xs text-ink-secondary">Finish or cancel the open Finding, Review setup or comment before using Save & next.</p>}</div><div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Close assessment</Button>{writable&&<><Button variant={saveAndNext?'outline':'default'} disabled={disabled} onClick={save}>{busy?'Working…':'Save assessment'}</Button>{saveAndNext&&<Button disabled={disabled||otherDraft} aria-describedby={otherDraft?'brawndo-other-draft':undefined} onClick={saveAndNext}>Save & next</Button>}</>}</div></footer>
    </DialogContent>
  </Dialog>;
}
