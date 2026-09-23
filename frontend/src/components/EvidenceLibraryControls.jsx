import {readEvidenceFile} from '@/lib/evidenceFile';
import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {evidenceSources} from '@/lib/evidenceReferences';
import {useCreateIntent} from '@/lib/createIntent';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import {toast} from 'sonner';

export const EVIDENCE_TYPES=['Report','Export','Screenshot','Policy / Procedure','Attestation','Assessment','Test Result','Certification','Questionnaire','Meeting / Exercise Record','Approval','Log / System Record','Other'];
export const PROGRAM_AREAS=['Reviews','Policies','Vendors','Risks','Findings','Frameworks','Other','Unassigned'];
export const AREA_KIND={Reviews:'reviews',Policies:'policies',Vendors:'vendors',Risks:'risks',Findings:'findings',Frameworks:'framework_assessments',Other:'tasks'};
export const selectClass='w-full rounded-md border border-line-strong bg-surface-card px-3 py-2 text-sm text-ink-primary';

export function useLibraryRequest(path,params={},refresh=0){
  const key=JSON.stringify([path,params]),[state,setState]=useState({});
  useEffect(()=>{let active=true;const [url,query]=JSON.parse(key);if(!url)return;setState({key,loading:true});api.get(url,{params:query}).then(({data})=>{if(active)setState({key,data});}).catch(e=>{if(active)setState({key,error:formatError(e)});});return()=>{active=false;};},[key,refresh]);
  return state.key===key?state:{loading:!!path};
}

export function EvidenceUpload({clientId,onClose,onSaved}){
  const [area,setArea]=useState('Unassigned'),[source,setSource]=useState(null),[metadata,setMetadata]=useState({evidence_type:'Other'}),[file,setFile]=useState(null),[busy,setBusy]=useState(false);
  const create=useCreateIntent(api.post,clientId);
  async function upload(e){e.preventDefault();if(!file)return;setBusy(true);try{
    const content=await readEvidenceFile(file);
    await create('/evidence',{client_id:clientId,filename:file.name,mime_type:file.type||'application/octet-stream',content_base64:content,...metadata,...(source?{linked_type:source.kind,linked_id:source.id,occurrence_id:source.occurrence_id||null}:{})});toast.success('Evidence added');onSaved();onClose();
  }catch(error){toast.error(formatError(error));}finally{setBusy(false);}}
  return <Sheet open onOpenChange={v=>{if(!v&&!busy)onClose();}}><SheetContent className="w-full sm:max-w-xl overflow-y-auto"><SheetHeader><SheetTitle>Add Evidence</SheetTitle><SheetDescription>Prefer uploading where work happens. Choose a source, or leave this file unassigned for later classification.</SheetDescription></SheetHeader><form onSubmit={upload} className="pt-4"><fieldset disabled={busy} className="space-y-4"><label className="block text-sm">Program Area<select aria-label="Program Area" className={selectClass} value={area} onChange={e=>{setArea(e.target.value);setSource(null);}}>{PROGRAM_AREAS.map(a=><option key={a}>{a}</option>)}</select></label>
    {area!=='Unassigned'&&(source?<div className="border border-line rounded p-3 text-sm">{source.title}{source.period&&` · ${source.period}`}<button type="button" className="block underline text-xs mt-1" onClick={()=>setSource(null)}>Change source</button></div>:<SourcePicker key={area} clientId={clientId} kind={AREA_KIND[area]} onSelect={setSource}/>)}
    <label className="block text-sm">File<Input type="file" required data-testid="evidence-file-input" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><MetadataFields value={metadata} onChange={setMetadata}/><Button disabled={!file||busy||(area!=='Unassigned'&&!source)}>Upload Evidence</Button></fieldset></form></SheetContent></Sheet>;
}

export function ReviewEvidenceSets({review,onSelect,onOpen}){
  const [year,setYear]=useState(''),[page,setPage]=useState(1),{data,error,loading}=useLibraryRequest(`/evidence-library/reviews/${review.id}/sets`,{year,page});
  return <section aria-label="Review Evidence Sets" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{review.title}</h2><p className="text-xs text-ink-secondary">Evidence Sets follow scheduled occurrences, not upload dates.</p></div><label className="text-sm">Year <select aria-label="Year" className={selectClass} value={year} onChange={e=>{setYear(e.target.value);setPage(1);}}><option value="">All years</option>{data?.years.map(y=><option key={y}>{y}</option>)}</select></label></div>
    {loading&&<p role="status">Loading Evidence Sets…</p>}{error&&<p role="alert">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.items.map(o=><article key={o.occurrence_id} className="border border-line bg-surface-card rounded-md p-3 space-y-2"><button className="font-semibold text-left underline underline-offset-4" onClick={()=>onSelect({...review,occurrence_id:o.occurrence_id,period:o.period,set:o})}>{o.period||'Period not recorded'}</button><p className="text-xs text-ink-secondary">{o.status} · {o.evidence_count==null?'Active occurrence':`${o.evidence_count} preserved files`}</p>{o.completed_at&&<p className="text-xs">Completed {o.completed_at.slice(0,10)} · {o.completed_by_name||'Reviewer not recorded'}</p>}{o.outcome&&<p className="text-xs text-ink-secondary">{o.outcome.replaceAll('_',' ')}</p>}<button className="text-xs underline" onClick={()=>onOpen({...review,occurrence_id:o.occurrence_id,period:o.period})}>Open Review</button></article>)}</div>
    {data&&<div className="flex gap-2"><Button variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Previous sets</Button><Button variant="outline" disabled={page*25>=data.total} onClick={()=>setPage(page+1)}>Next sets</Button></div>}
  </section>;
}

export function EvidenceSetRecords({source,onOpen}){
  const [page,setPage]=useState(1),{data,error,loading}=useLibraryRequest(`/evidence-library/reviews/${source.id}/set-records`,{occurrence_id:source.occurrence_id,page});
  return <section aria-label="Evidence Set related records" className="space-y-2 text-sm"><h3 className="font-medium">Related records</h3><p className="text-xs text-ink-secondary">Current state of work originating in this occurrence. Completion context above remains historical.</p>{loading&&<p>Loading…</p>}{error&&<p role="alert">{error}</p>}{data&&Object.entries(data).map(([kind,group])=><div key={kind}><h4 className="text-xs text-ink-secondary">{kind==='tasks'?'Action Items':'Findings'} · {group.total}</h4>{group.items.map(r=><button key={r.id} className="block text-left underline py-1" onClick={()=>onOpen(r)}>{r.title} · {r.status}</button>)}</div>)}<div className="flex gap-2"><Button variant="outline" size="sm" disabled={page===1} onClick={()=>setPage(page-1)}>Previous related records</Button><Button variant="outline" size="sm" disabled={!data||Object.values(data).every(g=>g.total<=page*25)} onClick={()=>setPage(page+1)}>Next related records</Button></div></section>;
}

export function SourcePicker({clientId,kind,onSelect}){
  const [query,setQuery]=useState(''),[page,setPage]=useState(1);
  const {data,error,loading}=useLibraryRequest('/evidence-library/sources',{client_id:clientId,kind,q:query,page});
  return <section aria-label="Choose related record" className="space-y-2"><Input aria-label="Find source record" placeholder={`Find ${evidenceSources[kind]?.label||'record'}…`} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/>
    {loading&&<p role="status">Loading records…</p>}{error&&<p role="alert">{error}</p>}
    {!loading&&data?.items.length===0&&<p className="text-sm text-ink-secondary">No matching records. Create work in its module, or leave this Evidence unassigned.</p>}
    <div className="max-h-64 overflow-auto divide-y divide-line rounded-md border border-line">{!loading&&data?.items.map(r=><button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2" key={r.id} onClick={()=>onSelect(r)}><span className="font-medium">{r.title}</span>{r.period&&<span className="block text-xs text-ink-secondary">Current occurrence · {r.period}</span>}</button>)}</div>
    {data&&<div className="flex items-center justify-between text-xs text-ink-secondary"><span>{data.total} records</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Previous records</Button><Button size="sm" variant="outline" disabled={page*25>=data.total} onClick={()=>setPage(page+1)}>Next records</Button></div></div>}
  </section>;
}

export function MetadataFields({value,onChange}){
  const change=(k,v)=>onChange({...value,[k]:v||null});
  return <div className="space-y-3"><label className="block text-sm">Display name<Input maxLength={300} value={value.display_name||''} onChange={e=>change('display_name',e.target.value)}/></label>
    <label className="block text-sm">Evidence Type<select aria-label="Evidence Type" className={selectClass} value={value.evidence_type||'Other'} onChange={e=>change('evidence_type',e.target.value)}>{EVIDENCE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
    <details><summary className="cursor-pointer text-sm text-ink-secondary">Optional dates and notes</summary><div className="grid grid-cols-2 gap-3 pt-3">{[['evidence_date','Evidence Date'],['effective_date','Effective Date'],['expiration_date','Expiration Date'],['refresh_date','Refresh Date']].map(([k,label])=><label key={k} className="text-sm">{label}<Input type="date" value={value[k]||''} onChange={e=>change(k,e.target.value)}/></label>)}</div><label className="block mt-3 text-sm">Notes<textarea className={selectClass} maxLength={10000} value={value.notes||''} onChange={e=>change('notes',e.target.value)}/></label></details>
  </div>;
}
