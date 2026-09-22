import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {Button} from './ui/button';
import {Input} from './ui/input';

export function ApprovalSubject({subject}) {
  if(!subject)return <p className="text-xs text-ink-secondary">Legacy entry — exact document/version was not recorded.</p>;
  const b=subject.basis;
  return <div className="text-xs text-ink-secondary space-y-1 break-words">
    <p className="font-medium">{subject.title} · Version {subject.version}</p>
    {b?.type==='evidence'?<><p>Document: {b.filename} · Evidence {b.evidence_id} · File version {b.version}</p><p className="break-all">SHA-256: {b.sha256}</p></>:<><p>External reference: {b?.reference}</p><p>Document/version ID: {b?.document_version}</p><p>{b?.verification}</p></>}
    <p>Captured {new Date(subject.captured_at).toLocaleString()}{subject.named_approver?' · Named approver: '+subject.named_approver.name:''}</p>
  </div>;
}

export default function PolicyApprovalSubject({record,context,busy,onSave}) {
  const [version,setVersion]=useState(''),[mode,setMode]=useState('external'),[reference,setReference]=useState(''),[externalVersion,setExternalVersion]=useState(''),[evidenceId,setEvidenceId]=useState('');
  const [open,setOpen]=useState(false),[evidence,setEvidence]=useState([]),[error,setError]=useState('');
  const source=context.source;
  useEffect(()=>{setVersion(source?.version||record.version||'');setMode(source?.evidence_id?'evidence':'external');setReference(source?.external_reference||'');setExternalVersion(source?.external_version||'');setEvidenceId(source?.evidence_id||'');},[source,record.version]);
  useEffect(()=>{
    if(!open)return;
    const c=new AbortController();setError('');
    api.get('/evidence',{params:{client_id:record.client_id,linked_type:'policy',linked_id:record.policy_id},signal:c.signal})
      .then(({data})=>{if(!c.signal.aborted)setEvidence(data.filter(e=>e.client_id===record.client_id&&e.linked_id===record.policy_id&&['policy','policies'].includes(e.linked_type)&&!e.archived_at));})
      .catch(e=>{if(!c.signal.aborted)setError(formatError(e));});
    return()=>c.abort();
  },[open,record.client_id,record.policy_id]);
  return <div className="space-y-2">
    {context.subject?<div><p className="text-xs font-medium mb-1">{context.status==='approved'?'Current approved subject':context.status==='in_review'?'Submitted subject':'Prior submitted subject (not current approval)'}</p><ApprovalSubject subject={context.subject}/></div>:<p className="text-xs text-ink-secondary">{context.status==='approved'?'Legacy approval — exact document/version was not recorded.':'Record the document and version before submitting for approval.'}</p>}
    {context.can_submit&&context.status!=='in_review'&&<details onToggle={e=>setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm">Approval document & version</summary>
      <div className="space-y-2 pt-2">
        <label className="block text-xs">Policy version<Input aria-label="Approval Policy version" value={version} maxLength={100} onChange={e=>setVersion(e.target.value)}/></label>
        <label className="block text-xs">Approval basis<select aria-label="Approval basis" className="mt-1 w-full border border-line rounded-md bg-surface px-3 py-2 text-sm" value={mode} onChange={e=>setMode(e.target.value)}><option value="external">External authoritative document</option><option value="evidence">Uploaded Evidence document</option></select></label>
        {mode==='external'?<>
          <label className="block text-xs">External document reference<Input aria-label="External document reference" value={reference} maxLength={2000} onChange={e=>setReference(e.target.value)}/></label>
          <label className="block text-xs">Document/version identifier<Input aria-label="Document/version identifier" value={externalVersion} maxLength={200} onChange={e=>setExternalVersion(e.target.value)}/></label>
          <p className="text-xs text-ink-secondary">Use the authoritative location and its specific version ID. No duplicate upload is required. External document bytes are not fetched or verified.</p>
        </>:<>
          <label className="block text-xs">Policy document<select aria-label="Policy document" value={evidenceId} onChange={e=>setEvidenceId(e.target.value)} className="mt-1 w-full border border-line rounded-md bg-surface px-3 py-2 text-sm"><option value="">Select a linked document</option>{evidence.filter(e=>e.sha256).map(e=><option key={e.evidence_id} value={e.evidence_id}>{e.filename} · File version {e.version}</option>)}</select></label>
          <p className="text-xs text-ink-secondary">Upload a document in this Policy’s Evidence tab first. Only linked, available documents with a recorded checksum are eligible.</p>
          {error&&<p role="alert" className="text-xs text-semantic-critical">{error}</p>}
        </>}
        <p className="text-xs text-ink-secondary">Changing the approved basis returns this Policy to Draft. Earlier decisions stay attached to their original versions.</p>
        <Button type="button" size="sm" disabled={busy||!version.trim()||(mode==='external'?(!reference.trim()||!externalVersion.trim()):!evidenceId)} onClick={()=>onSave('approval-subject',{version:version.trim(),evidence_id:mode==='evidence'?evidenceId:null,external_reference:mode==='external'?reference.trim():null,external_version:mode==='external'?externalVersion.trim():null})}>Save approval basis</Button>
      </div>
    </details>}
  </div>;
}
