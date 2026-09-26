import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {recordUuid} from '@/lib/recordUuid';
import {useAuth} from '@/context/AuthContext';
import {isInternal} from '@/lib/permissions';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import AssigneeSelect from './AssigneeSelect';
import {EvidenceCatalogPicker,EvidenceDownload} from './EvidencePanel';
import EvidenceItemDrawer from './EvidenceItemDrawer';
import {resolveEvidenceSource} from '@/lib/evidenceContext';
import RecordDrawer from './RecordDrawer';
import {SCHEMAS} from '@/lib/schemas';

const BASE='/organizational-controls';
const FIELDS=['name','description','frequency','design','owner_id','assessment_ids','related_links'];
const KEYS={reviews:'review_id',evidence:'evidence_id',policies:'policy_id',findings:'finding_id',tasks:'task_id',risks:'risk_id',vendors:'vendor_id'};
const LABELS={reviews:'Reviews',evidence:'Evidence',policies:'Policies',findings:'Findings',tasks:'Action Items',risks:'Risks',vendors:'Vendors'};
const SELECT='w-full border border-line rounded p-2 bg-surface-card text-sm';
const designOf=row=>Object.fromEntries(FIELDS.map(k=>[k,row[k]]));
const blank=aid=>({name:'',description:'',frequency:'',design:'not_assessed',owner_id:null,assessment_ids:aid?[aid]:[],related_links:[]});
const initialObservation=()=>({request_id:recordUuid(),period_start:'',period_end:'',operating:'not_assessed',expected_instances:null,collected_instances:null,notes:''});
const path=id=>`${BASE}/${encodeURIComponent(id)}`;

function RecordPicker({clientId,onLink,disabled}) {
  const [kind,setKind]=useState('reviews'),[q,setQ]=useState(''),[offset,setOffset]=useState(0),[result,setResult]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    if(kind==='evidence')return;
    const c=new AbortController();setResult(null);setError('');
    api.get(BASE+'/candidates',{params:{client_id:clientId,kind,q,offset},signal:c.signal}).then(r=>setResult(r.data)).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});
    return()=>c.abort();
  },[clientId,kind,q,offset]);
  return <div className="space-y-2"><label className="block">Record type<select aria-label="Control relationship type" className={SELECT} value={kind} disabled={disabled} onChange={e=>{setKind(e.target.value);setQ('');setOffset(0);}}>{Object.entries(LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    {kind==='evidence'?<EvidenceCatalogPicker clientId={clientId} disabled={disabled} onLink={id=>onLink({kind,id})}/>:<>
      <Input aria-label="Search Control relationship records" value={q} maxLength={100} onChange={e=>{setQ(e.target.value);setOffset(0);}} placeholder="Search existing records…"/>
      {error&&<p role="alert">{error}</p>}
      <select className={SELECT} aria-label="Link record to Control" value="" disabled={disabled||!result?.items.length} onChange={e=>onLink({kind,id:e.target.value})}><option value="">{!result?'Loading…':result.items.length?'Select record':'No matching records'}</option>{result?.items.map(r=><option key={r[KEYS[kind]]} value={r[KEYS[kind]]}>{r.title||r.name}</option>)}</select>
      <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous records</Button><Button size="sm" variant="ghost" disabled={!result?.has_more} onClick={()=>setOffset(n=>n+25)}>More records</Button></div>
    </>}
    <p className="text-xs text-ink-secondary">Relationships save with the Control. Files remain in their original Evidence Library and Review occurrence.</p>
  </div>;
}

function ControlEditor({clientId,controlId,assessmentId,writable,onClose,onSaved,onDraftChange}) {
  const [row,setRow]=useState(null),[form,setForm]=useState(()=>blank(assessmentId)),[saved,setSaved]=useState(()=>blank(assessmentId));
  const [criteria,setCriteria]=useState([]),[people,setPeople]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const [resolve,setResolve]=useState(false),[note,setNote]=useState(''),[observation,setObservation]=useState(null),[confirm,setConfirm]=useState(false),[nested,setNested]=useState(null);
  const [revision,setRevision]=useState(0),[feedback,setFeedback]=useState('');
  const [requestId]=useState(recordUuid),opener=useRef(document.activeElement),heading=useRef(null);
  const dirty=JSON.stringify(form)!==JSON.stringify(saved)||resolve||!!note.trim()||!!observation;
  useEffect(()=>{onDraftChange?.(dirty);return()=>onDraftChange?.(false);},[dirty,onDraftChange]);
  useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  useEffect(()=>{
    const c=new AbortController();setLoaded(false);setError('');
    Promise.all([controlId?api.get(path(controlId),{signal:c.signal}):Promise.resolve({data:null}),api.get('/frameworks/soc-2',{params:{client_id:clientId},signal:c.signal}),api.get('/clients/'+clientId+'/members',{signal:c.signal})]).then(([r,w,p])=>{
      if(c.signal.aborted)return;setRow(r.data);if(r.data){setForm(designOf(r.data));setSaved(designOf(r.data));}
      setCriteria(w.data.assessments.map(a=>({...a,title:w.data.definitions.find(d=>d.id===a.definition_id)?.title||a.definition_id})));setPeople(p.data);setLoaded(true);
    }).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();
  },[controlId,clientId,revision]);
  const put=(key,value)=>{setFeedback('');setForm(p=>({...p,[key]:value}));};
  const close=()=>{if(busy)return;if(dirty)setConfirm(true);else onClose();};
  async function save(){
    setBusy(true);setError('');
    try{
      const {data}=row?await api.patch(path(row.control_id),{...form,expected_updated_at:row.updated_at,resolve_conflicts:resolve,reconciliation_note:note}):await api.post(BASE,{...form,client_id:clientId,request_id:requestId});
      setRow({...data,linked_records:row?.linked_records||{}});setForm(designOf(data));setSaved(designOf(data));setResolve(false);setNote('');setFeedback('Control saved. Criterion assessments are unchanged.');onSaved?.();
      // Refresh linked titles without replacing an unsaved observation draft.
      const detail=await api.get(path(data.control_id));setRow(detail.data);
    }catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  async function recordObservation(){
    setBusy(true);setError('');
    try{const {data}=await api.post(path(row.control_id)+'/observations',{...observation,expected_updated_at:row.updated_at});setRow({...data,linked_records:row.linked_records});setObservation(null);setFeedback('Period observation recorded with the saved Control design. Criterion assessments are unchanged.');onSaved?.();}
    catch(e){setError(formatError(e));}finally{setBusy(false);}
  }
  const disabled=!writable||busy||!loaded,designDirty=JSON.stringify(form)!==JSON.stringify(saved)||resolve||!!note.trim();
  const link=value=>put('related_links',form.related_links.some(l=>l.kind===value.kind&&l.id===value.id)?form.related_links:[...form.related_links,value]);
  const who=id=>people.find(p=>p.user_id===id)?.name||'Historical / unassigned';
  const openEvidenceSource=async ref=>{try{setNested(await resolveEvidenceSource(ref,clientId));}catch(e){setError(formatError(e));}};
  const recordLink=(kind,r)=><><button className="text-link underline text-left break-words" onClick={()=>setNested({kind,record:r})}>{r.display_name||r.title||r.name||r.filename}</button>{kind==='evidence'&&<><span className="text-xs text-ink-secondary"> · {r.evidence_type||r.mime_type||'Evidence'} · {(r.evidence_date||r.created_at||'').slice(0,10)||'Date not recorded'}</span><EvidenceDownload row={r}/></>}</>;
  const historyDesign=value=><div className="text-sm whitespace-pre-wrap break-words"><p>{value.name||'Name unresolved'} · {value.frequency||'Frequency not recorded'} · {value.design}</p><p>{value.description||'Design not recorded'}</p>{value.owner_id&&<p>Owner: {who(value.owner_id)}</p>}{value.related_links?.map(l=>{
    const r=row?.linked_records?.[l.kind]?.find(r=>r[KEYS[l.kind]]===l.id);
    return <p key={l.kind+':'+l.id}>{LABELS[l.kind]} · {!r?'Historical record unavailable':recordLink(l.kind,r)}</p>;
  })}</div>;
  return <><Dialog open onOpenChange={v=>{if(!v)close();}}><DialogContent className="w-[92vw] max-w-4xl max-h-[90vh] overflow-y-auto bg-surface-card" onPointerDownOutside={e=>e.preventDefault()} onOpenAutoFocus={e=>{e.preventDefault();heading.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();opener.current?.isConnected&&opener.current.focus();}}>
    <DialogTitle ref={heading} tabIndex={-1}>{row?'Organizational Control':'New organizational Control'}</DialogTitle><DialogDescription>One client-owned operating Control may support several criteria. Each criterion retains its own assessment.</DialogDescription>
    {error&&<p role="alert" className="text-semantic-critical">{error}</p>}{feedback&&<p role="status">{feedback}</p>}
    {!loaded&&<p role="status">Loading Control context… {error&&<Button onClick={()=>setRevision(n=>n+1)}>Retry</Button>}</p>}
    {!!row?.conflicts.length&&<section aria-label="Control reconciliation required" className="border border-semantic-warning rounded p-3 space-y-2"><h3 className="font-semibold">Reconciliation required</h3><p className="text-sm">Conflicting fields: {row.conflicts.join(', ')}. No conflicting description was selected automatically. Inspect preserved source descriptions below and record the agreed design.</p></section>}
    <fieldset disabled={disabled} className="space-y-4">
      <label className="block text-sm">Control name<Input aria-label="Organizational Control name" value={form.name} maxLength={200} onChange={e=>put('name',e.target.value)}/></label>
      <label className="block text-sm">Control design and implementation<Textarea aria-label="Organizational Control design" rows={5} value={form.description} maxLength={4000} onChange={e=>put('description',e.target.value)}/></label>
      <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm">Organization-defined frequency<Input aria-label="Organizational Control frequency" value={form.frequency} maxLength={200} onChange={e=>put('frequency',e.target.value)}/></label><div className="text-sm">Control owner<AssigneeSelect label="Control owner" clientId={clientId} users={people} value={form.owner_id} disabled={disabled} onChange={v=>put('owner_id',v)}/></div></div>
      <label className="block text-sm">Internal design assessment<select aria-label="Control design assessment" className={SELECT} value={form.design} onChange={e=>put('design',e.target.value)}><option value="not_assessed">Not assessed</option><option value="adequate">Internally assessed as adequate</option><option value="gap">Design gap</option></select></label>
      <details><summary className="cursor-pointer font-medium">Supported criteria · {form.assessment_ids.length}</summary><p className="text-xs my-2">Mapping does not change any criterion conclusion.</p><div className="max-h-56 overflow-y-auto space-y-2">{criteria.map(a=><label key={a.framework_assessment_id} className="flex gap-2 text-sm"><input type="checkbox" aria-label={`Supports ${a.definition_id}`} checked={form.assessment_ids.includes(a.framework_assessment_id)} onChange={e=>put('assessment_ids',e.target.checked?[...form.assessment_ids,a.framework_assessment_id]:form.assessment_ids.filter(id=>id!==a.framework_assessment_id))}/>{a.definition_id} · {a.title}</label>)}</div></details>
      {!!row?.conflicts.length&&<div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resolve} onChange={e=>setResolve(e.target.checked)}/>Resolve documented conflicts with this design</label>{resolve&&<label className="block text-sm">Reconciliation decision<Textarea aria-label="Control reconciliation decision" value={note} maxLength={4000} onChange={e=>setNote(e.target.value)}/></label>}</div>}
    </fieldset>
    <section className="border-t border-line pt-3 space-y-3"><h3 className="font-semibold">Operating records</h3><p className="text-xs text-ink-secondary">Open the normal Review for occurrence dates and history, or a Finding for remediation and its authoritative Action Item.</p>
      {form.related_links.map(l=>{const r=row?.linked_records?.[l.kind]?.find(r=>r[KEYS[l.kind]]===l.id);return <div key={l.kind+':'+l.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{LABELS[l.kind]} · {r?recordLink(l.kind,r):saved.related_links.some(x=>x.kind===l.kind&&x.id===l.id)?'Linked record unavailable':'Relationship staged — save to open record'}</span>{writable&&<Button variant="ghost" size="sm" disabled={disabled} onClick={()=>put('related_links',form.related_links.filter(x=>x!==l))}>Unlink from draft</Button>}</div>;})}
      {!form.related_links.length&&<p className="text-sm text-ink-secondary">No operating records linked yet.</p>}
      {writable&&<details><summary className="cursor-pointer text-sm">Link an existing operating record</summary><RecordPicker clientId={clientId} disabled={disabled} onLink={link}/></details>}
    </section>
    <div className="sticky bottom-0 bg-surface-card border-t border-line py-3 flex flex-wrap gap-2"><Button disabled={disabled||!form.name.trim()||!!observation} onClick={save}>Save Control</Button><Button variant="outline" onClick={close} disabled={busy}>Close Control</Button>{observation&&<p className="text-xs">Save or cancel the period observation before editing Control design.</p>}</div>
    {row&&<section className="border-t border-line pt-3 space-y-3"><h3 className="font-semibold">Period observations · {row.observations.length}</h3><p className="text-xs text-ink-secondary">Recorded testing, not an audit opinion. Evidence counts alone do not establish effective operation. Each observation retains the saved design, owner and relationships.</p>
      {row.observations.map(o=><details key={o.request_id}><summary className="cursor-pointer text-sm">{o.period_start} — {o.period_end} · {o.operating} · {o.collected_instances??'—'}/{o.expected_instances??'—'} reported instances</summary><p className="whitespace-pre-wrap text-sm">{o.notes}</p>{historyDesign(o.design_snapshot)}<p className="text-xs">Recorded {o.at} · {who(o.by)} · {o.design_snapshot.related_links?.length||0} relationships in revision</p></details>)}
      {writable&&!observation&&<Button variant="outline" disabled={disabled||designDirty||!!row.conflicts.length} onClick={()=>setObservation(initialObservation())}>Record period observation</Button>}
      {observation&&<fieldset disabled={disabled} className="space-y-3"><div className="grid sm:grid-cols-2 gap-3">{[['period_start','Observation start'],['period_end','Observation end']].map(([k,label])=><label className="text-sm" key={k}>{label}<Input type="date" aria-label={label} value={observation[k]} onChange={e=>setObservation(p=>({...p,[k]:e.target.value}))}/></label>)}{[['expected_instances','Expected instances'],['collected_instances','Collected instances']].map(([k,label])=><label className="text-sm" key={k}>{label}<Input type="number" min="0" max="1000000" aria-label={label} value={observation[k]??''} onChange={e=>setObservation(p=>({...p,[k]:e.target.value===''?null:Number(e.target.value)}))}/></label>)}</div><label className="block text-sm">Internal operating conclusion<select className={SELECT} aria-label="Control operating conclusion" value={observation.operating} onChange={e=>setObservation(p=>({...p,operating:e.target.value}))}><option value="not_assessed">Not assessed</option><option value="effective">Internally assessed as effective</option><option value="gap">Operating gap</option></select></label><label className="block text-sm">Testing notes and exception context<Textarea aria-label="Control testing notes" maxLength={4000} value={observation.notes} onChange={e=>setObservation(p=>({...p,notes:e.target.value}))}/></label><Button onClick={recordObservation}>Save period observation</Button><Button variant="ghost" onClick={()=>setObservation(null)}>Cancel observation</Button></fieldset>}
    </section>}
    {!!row?.legacy_sources.length&&<details><summary className="cursor-pointer font-medium">Preserved criterion descriptions / observations · {row.legacy_sources.length}</summary><p className="text-xs my-2">Unchanged legacy sources. Historical observations are not automatically shared conclusions.</p>{row.legacy_sources.map((s,i)=><section className="border-t border-line py-3" key={i}><h4 className="text-sm font-medium">{s.criterion} · {s.at||'Date not recorded'} · {s.current_at_migration?'Current at migration':'Historical'} · {who(s.by)}</h4>{historyDesign(s.value)}<p className="text-sm whitespace-pre-wrap">{s.value.period_start} — {s.value.period_end} · {s.value.operating} · {s.value.collected_instances??'—'}/{s.value.expected_instances??'—'} instances{`\n${s.value.testing_notes||''}\n${s.value.population_notes||''}`}</p></section>)}</details>}
    {!!row?.history.length&&<details><summary className="cursor-pointer font-medium">Control design / relationship history · {row.history.length}</summary>{row.history.slice().reverse().map((h,i)=><section key={i} className="border-t border-line py-3"><p className="text-xs">{h.at} to {h.superseded_at} · changed by {who(h.changed_by)}</p>{historyDesign(h)}<p className="text-xs">{h.assessment_ids.length} criterion mappings · {h.related_links.length} operating links · {h.reconciliation_note}</p></section>)}</details>}
  </DialogContent></Dialog>
  <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogTitle>Leave unsaved Control work?</AlertDialogTitle><AlertDialogDescription>Saved Controls and criterion assessments are unchanged. Continue editing or discard this draft.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={onClose}>Discard draft</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  {nested&&(nested.kind==='evidence'?<EvidenceItemDrawer id={nested.record.evidence_id} onClose={()=>setNested(null)} onChanged={()=>api.get(path(row.control_id)).then(r=>setRow(r.data)).catch(e=>setError(formatError(e)))} onOpen={openEvidenceSource}/>:<RecordDrawer {...nested} open clientId={clientId} users={people} schema={SCHEMAS[nested.kind]?.fields} onOpenChange={v=>{if(!v)setNested(null);}}/>)}
  </>;
}

export function OrganizationalControlDrawer({open,record,clientId,onOpenChange,onSaved}) {
  const {user}=useAuth();
  return open?<ControlEditor clientId={record.client_id||clientId} controlId={record.control_id} writable={isInternal(user)} onClose={()=>onOpenChange(false)} onSaved={onSaved}/>:null;
}

export default function OrganizationalControls({clientId,assessmentId,onDraftChange,onSaved}) {
  const {user}=useAuth(),writable=isInternal(user);
  const [data,setData]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[offset,setOffset]=useState(0),[all,setAll]=useState(false),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false);
  const refresh=()=>{setRevision(n=>n+1);onSaved?.();};
  // Retain the same trigger during same-scope refresh so dialog focus can return
  // to it. Scope/page changes still clear the previous result before rendering.
  useEffect(()=>setData(null),[clientId,assessmentId,offset,all]);
  useEffect(()=>{const c=new AbortController();setError('');api.get(BASE,{params:{client_id:clientId,assessment_id:all?undefined:assessmentId,offset},signal:c.signal}).then(r=>setData(r.data)).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();},[clientId,assessmentId,revision,offset,all]);
  async function migrate(){setBusy(true);setError('');try{await api.post(BASE+'/migrate',{client_id:clientId});refresh();}catch(e){setError(formatError(e));}finally{setBusy(false);}}
  return <section aria-label="Organizational Controls" className="space-y-3 border-t border-line pt-4"><h3 className="font-semibold">Organizational Controls</h3><p className="text-sm text-ink-secondary">Reuse the client's operating Controls across criteria. Shared work never implies a shared assessment conclusion.</p>
    {error&&<p role="alert">{error} <Button variant="ghost" onClick={refresh}>Retry</Button></p>}
    {!!data?.migration_pending&&<div className="border border-line p-3 rounded text-sm"><p>{data.migration_pending} legacy Controls await migration. Source descriptions and all assessment history will be preserved; conflicting designs require review.</p>{writable&&<Button variant="outline" disabled={busy} onClick={migrate}>Migrate legacy Controls</Button>}</div>}
    {assessmentId&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setOffset(0);}}/>Show all client Controls to reuse an existing one</label>}
    {!data&&!error&&<p role="status">Loading Controls…</p>}
    {data&&!data.items.length&&<p className="text-sm text-ink-secondary">No shared Controls in this view.</p>}
    <ul className="divide-y divide-line">{data?.items.map(c=><li className="py-2 text-sm" key={c.control_id}><button className="text-link underline text-left" onClick={()=>setEditing(c.control_id)}>{c.name||`Control ${c.legacy_id} — name unresolved`}</button><p className="text-xs text-ink-secondary">{c.assessment_ids.length} criterion mappings · {c.frequency||'Frequency not recorded'}{c.conflicts.length?' · Reconciliation required':''}</p></li>)}</ul>
    <div className="flex flex-wrap gap-2">{writable&&<Button variant="outline" onClick={()=>setEditing('new')}>Create organizational Control</Button>}{offset>0&&<Button variant="ghost" onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous Controls</Button>}{data?.has_more&&<Button variant="ghost" onClick={()=>setOffset(n=>n+25)}>More Controls</Button>}</div>
    {editing&&<ControlEditor key={clientId+editing} clientId={clientId} controlId={editing==='new'?null:editing} assessmentId={assessmentId} writable={writable} onClose={()=>{setEditing(null);refresh();}} onSaved={refresh} onDraftChange={onDraftChange}/>}
  </section>;
}
