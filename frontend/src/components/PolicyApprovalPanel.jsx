import {useCallback, useEffect, useState} from 'react';
import api, {formatError} from '@/lib/api';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import AssigneeSelect from './AssigneeSelect';
import {toast} from 'sonner';
import PolicyApprovalSubject,{ApprovalSubject} from './PolicyApprovalSubject';

export default function PolicyApprovalPanel({record, onChanged}) {
  const [context,setContext]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [contacts,setContacts]=useState([]),[contactId,setContactId]=useState(''),[accountId,setAccountId]=useState(null),[comment,setComment]=useState('');
  const id=record.policy_id, cid=record.client_id;
  const load=useCallback(async(signal)=>{
    try {
      const {data}=await api.get('/policies/'+id+'/approval-context',{signal});
      if(signal?.aborted)return;
      setContext(data);setContactId(data.named_approver?.contact_id||'');setAccountId(data.authorized_account?.user_id||null);setError('');
      if(data.can_configure) {
        const res=await api.get('/contacts',{params:{client_id:cid},signal});
        if(!signal?.aborted)setContacts(res.data);
      }
    } catch(e) {if(!signal?.aborted)setError(formatError(e));}
  },[id,cid]);
  useEffect(()=>{const c=new AbortController();setContext(null);setContacts([]);setComment('');load(c.signal);return()=>c.abort();},[load,record.status,record.updated_at]);
  async function act(action,body={}) {
    setBusy(true);setError('');
    try {
      const {data}=await api.post('/policies/'+id+'/'+action,body);
      if(action!=='approval-authority')onChanged(data);
      await load();setComment('');
      toast.success(action==='approval-authority'?'Approval authority saved':action==='approval-subject'?'Approval basis saved':action==='submit-review'?'Policy submitted':action==='approve'?'Policy approved':'Policy returned to Draft');
    } catch(e) {setError(formatError(e));}
    finally{setBusy(false);}
  }
  const pending=context?.status==='in_review';
  const account=context?.authorized_account;
  return <section aria-label="Policy approval authority" className="space-y-3 border-t border-line pt-3">
    {error&&<p role="alert" className="text-sm text-semantic-critical">{error} <button type="button" className="underline" onClick={()=>load()}>Reload approval details</button></p>}
    {!context?<p role="status" className="text-sm text-ink-secondary">Loading approval details…</p>:<>
      <PolicyApprovalSubject record={record} context={context} busy={busy} onSave={act}/>
      <dl className="text-xs space-y-1 text-ink-secondary">
        <div><dt className="inline font-medium">Business approver: </dt><dd className="inline">{context.named_approver?.name||'Not designated'}{record.approver_id&&!context.named_approver?' · Legacy designation retained in Policy details':''}</dd></div>
        <div><dt className="inline font-medium">Linked platform account: </dt><dd className="inline">{context.linked_account ? context.linked_account.state+(context.linked_account.has_client_access?' · Client access':' · No client access'):'None'}</dd></div>
        <div><dt className="inline font-medium">Authorized account: </dt><dd className="inline">{account ? (account.name||'Recorded account')+' · '+(account.eligible?'Eligible':'Not currently eligible'):'Approval permission not delegated'}</dd></div>
      </dl>
      <p className="text-xs text-ink-secondary">Naming a Contact or linking an account does not grant approval permission.</p>
      {context.internal_approval&&<p className="text-xs text-ink-secondary">Your existing internal administrative approval authority applies. Decisions are recorded as your account, not as the named business approver.</p>}
      {context.can_configure&&!pending&&<details className="text-sm">
        <summary className="cursor-pointer text-ink-primary">Configure approval authority</summary>
        <div className="space-y-2 pt-2">
          <label className="block text-xs">Named business approver (Contact)
            <select aria-label="Named business approver" value={contactId} onChange={e=>setContactId(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm">
              <option value="">Not designated</option>{contacts.map(c=><option key={c.contact_id} value={c.contact_id}>{c.name}</option>)}
            </select>
          </label>
          <AssigneeSelect clientId={cid} label="Authorized approver account" value={accountId} onChange={setAccountId} users={account?[account]:[]} emptyLabel="No delegated account" disabled={busy}/>
          <p className="text-xs text-ink-secondary">This grants decision authority for this Policy only. It does not change client access or editing permissions.</p>
          <Button type="button" size="sm" disabled={busy} onClick={()=>act('approval-authority',{approver_contact_id:contactId||null,approval_account_id:accountId})}>Save approval authority</Button>
        </div>
      </details>}
      {pending&&!context.can_decide&&<p className="text-sm text-ink-secondary">Awaiting an authorized approver. This account cannot decide this Policy.</p>}
      {pending&&context.can_decide&&context.approval_request_id&&<>
        <label className="block text-xs">Decision comment (required for return)
          <Textarea aria-label="Decision comment" value={comment} maxLength={4000} onChange={e=>setComment(e.target.value)} className="mt-1"/>
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy||!context.subject} data-testid="policy-approve" onClick={()=>act('approve',{approval_request_id:context.approval_request_id,comment})}>Approve</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy||!comment.trim()} data-testid="policy-reject" onClick={()=>act('reject',{approval_request_id:context.approval_request_id,comment})}>Return to Draft</Button>
        </div>
      </>}
      {['draft','approved'].includes(context.status)&&context.can_submit&&<Button type="button" size="sm" variant="outline" disabled={busy} data-testid="policy-submit-review" onClick={()=>act('submit-review')}>{context.status==='approved'?'Submit new revision':'Submit for approval'}</Button>}
      {pending&&context.can_submit&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>act('return-draft',{approval_request_id:context.approval_request_id||'legacy'})}>Withdraw submission to Draft</Button>}
      {!!context.history.length&&<details><summary className="text-sm cursor-pointer">Approval history ({context.history.length})</summary>
        <ol className="mt-2 space-y-2">{context.history.map((h,i)=><li key={i} className="text-xs text-ink-secondary">
          <span className="font-medium">{h.action.replaceAll('_',' ')}</span> · {h.by_name||h.by_email||h.by} · {new Date(h.at).toLocaleString()}
          {h.authority&&<div>{h.authority==='internal_administrative'?'Internal administrative approval':'Delegated Policy approval'}</div>}
          {(h.comment||h.reason)&&<p>{h.comment||h.reason}</p>}
          {['submitted','approved','rejected'].includes(h.action)&&<><ApprovalSubject subject={h.subject}/>{h.action==='approved'&&h.subject?.subject_id!==context.subject?.subject_id&&<p>Historical approval — not the current subject</p>}</>}
        </li>)}</ol>
      </details>}
      {!!context.external_history?.length&&<details><summary className="text-sm cursor-pointer">Recorded external approvals</summary><ul className="mt-2 space-y-3">{context.external_history.map((h,i)=><li key={i} className="text-xs text-ink-secondary"><p>{h.provenance} · Recorded by {h.recorded_by_name||h.recorded_by} · {h.recorded_at}</p><ApprovalSubject subject={h.subject}/></li>)}</ul></details>}
    </>}
  </section>;
}
