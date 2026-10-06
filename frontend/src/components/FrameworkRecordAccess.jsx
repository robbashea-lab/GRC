import AssigneeSelect from './AssigneeSelect';
import AssessmentHistory from './AssessmentHistory';
import FrameworkReviewSetup from './FrameworkReviewSetup';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import api from '@/lib/api';
import {operatorProgram} from '@/lib/frameworkOperator';
import {activePlans,activeDefinitions} from '@/lib/frameworks';
import {useAuth} from '@/context/AuthContext';
import {useRef} from 'react';

const IDS={risks:'risk_id',policies:'policy_id',vendors:'vendor_id',requirements:'requirement_id'};
export function FrameworkRecordButton({record,onManage}){
  return onManage?<button type="button" className="relative z-10 text-link text-sm" aria-label={`Manage ${record.definition_id} ${record.title}`} onClick={e=>{e.stopPropagation();onManage(record);}} onKeyDown={e=>e.stopPropagation()}>Manage</button>:null;
}

// Existing FrameworkDrawer owns loading, authorization, version guards and draft protection.
export default function FrameworkRecordAccess({state,actions,reviewsOnly=false}){
  const {user}=useAuth();
  const opener=useRef(document.activeElement);
  const {open,current,definition,catalog,ctx,form,dirty,busy,error,feedback,writable,comment,link}=state;
  const {close,put,saveOwner,run,setComment,setLink,setNested,setReviewDraft,reviewSaved,openReviews}=actions;
  const aid=current.framework_assessment_id,cid=current.client_id,disabled=!ctx||busy||!writable;
  const cis=current.framework_key==='cis-ig1',reviewCatalog=cis?{...catalog,review_plans:activePlans('cis-ig1',ctx?.configuration)}:catalog;
  const reviewWritable=!disabled&&['cis-ig1','iso-27001'].includes(current.framework_key)&&(!cis||['super_admin','platform_admin'].includes(user?.role)&&activeDefinitions('cis-ig1',ctx?.configuration).some(d=>d.id===definition.id));
  const reviewUrl='/reviews?'+new URLSearchParams({client_id:cid,framework_key:current.framework_key,framework_assessment:aid});
  return <Sheet open={open} onOpenChange={v=>{if(!v)close();}}><SheetContent onCloseAutoFocus={e=>{e.preventDefault();if(opener.current?.isConnected)opener.current.focus();}} className="w-full sm:max-w-3xl overflow-y-auto bg-surface-card" data-testid={reviewsOnly?'framework-review-management':'framework-record-management'}><SheetHeader><SheetTitle>{definition.id} · {definition.title}</SheetTitle><SheetDescription>{operatorProgram(current.framework_key)} · {definition.id}</SheetDescription></SheetHeader>
    {error&&<p role="alert">{error}</p>}{!ctx&&!error&&<p role="status">Loading…</p>}
    {ctx&&(reviewsOnly?<FrameworkReviewSetup record={current} definition={definition} catalog={reviewCatalog} reviews={ctx.options.reviews||[]} users={ctx.users||[]} clientId={cid} writable={reviewWritable} onDraftChange={setReviewDraft} onOpen={r=>setNested({kind:'reviews',record:r})} onSaved={reviewSaved}/>:<div className="space-y-5 pt-4">
      <fieldset disabled={disabled} className="space-y-2"><div className="text-sm">Assessment Owner<AssigneeSelect clientId={cid} label="Assessment Owner" users={ctx.users} value={form.owner_id} onChange={v=>put('owner_id',v)} disabled={disabled}/></div>{current.framework_key==='iso-27001'&&<label className="block text-sm">Process Owner<select aria-label="Process Owner" className="block w-full border border-line rounded p-2 bg-surface-card" value={form.process_owner_id||''} onChange={e=>put('process_owner_id',e.target.value||null)}><option value="">Unassigned</option>{ctx.contacts.map(c=><option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}</select></label>}<Button disabled={disabled||!dirty} onClick={saveOwner}>Save owner</Button></fieldset>
      <AssessmentHistory record={current} users={ctx.users} activity={ctx.activity}/>
      {current.framework_key==='iso-27001'&&<section className="space-y-2" aria-label="Assessment comments">{ctx.comments.map(c=><p className="text-sm whitespace-pre-wrap" key={c.comment_id}>{c.body}<span className="block text-xs">{c.author_name||c.user_name} · {c.created_at?.slice(0,10)}</span></p>)}{writable&&<><Textarea aria-label="Requirement comment" value={comment} onChange={e=>setComment(e.target.value)} disabled={busy}/><Button disabled={busy||!comment.trim()} onClick={()=>run(async()=>{await api.post('/comments',{client_id:cid,entity_type:'framework_assessments',entity_id:aid,body:comment});setComment('');})}>Add comment</Button></>}</section>}
      <a className="text-link underline" href={reviewUrl} onClick={e=>{e.preventDefault();openReviews(reviewUrl);}}>Reviews</a>
      {ctx.retainedControls?.map(r=><button className="block text-link text-sm" key={r.control_id} onClick={()=>setNested({kind:'organizational_controls',record:r})}>{r.name||r.control_id}</button>)}
      {current.framework_key==='iso-27001'&&<fieldset disabled={disabled} className="space-y-2"><label className="block text-sm">Record type<select aria-label="Related record type" className="block w-full border border-line rounded p-2 bg-surface-card" value={link.kind} onChange={e=>setLink({kind:e.target.value,id:''})}>{Object.keys(IDS).map(k=><option key={k} value={k}>{k}</option>)}</select></label><label className="block text-sm">Record<select aria-label="Related record" className="block w-full border border-line rounded p-2 bg-surface-card" value={link.id} onChange={e=>setLink({...link,id:e.target.value})}><option value="">Select record</option>{ctx.options[link.kind]?.map(r=><option key={r[IDS[link.kind]]} value={r[IDS[link.kind]]}>{r.title||r.name}</option>)}</select></label><Button disabled={disabled||!link.id} onClick={async()=>{if(await run(()=>api.post(`/framework_assessments/${aid}/links`,link)))setLink({...link,id:''});}}>Link record</Button></fieldset>}
    </div>)}
    <div role="status" className="text-sm mt-4">{feedback}</div><Button variant="outline" onClick={close} disabled={busy}>Close</Button>
  </SheetContent></Sheet>;
}
