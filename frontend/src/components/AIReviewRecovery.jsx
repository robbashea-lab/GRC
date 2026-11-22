import {useEffect,useRef,useState} from 'react';
import {formatError} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {useAssessmentApi,useAssessmentCreateIntent} from '@/lib/assessmentCommandScope';
import AssigneeSelect from './AssigneeSelect';

export default function AIReviewRecovery({clientId,aiId,enabled,pendingSchedule=false,users,onRecovered}){
  const api=useAssessmentApi();
  const auth=useAuth(),actor=auth?.user?.user_id,admin=['super_admin','platform_admin'].includes(auth?.user?.role);
  const scope=actor?`${actor}:${auth.workspaceMode||auth.user.workspace_mode||'standard'}:${clientId}:ai_systems:${aiId}:review-recovery`:null;
  const recover=useAssessmentCreateIntent((...args)=>api.post(...args),scope,true),retained=recover.pendingRequest(),retainedRecovery=!!retained;
  const [pending,setPending]=useState(null),[owner,setOwner]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const publicationKey=JSON.stringify([scope,enabled,auth?.user?.role,auth?.user?.status,auth?.user?.client_ids,auth?.user?.all_clients]);
  const authority=useRef({key:publicationKey});
  if(authority.current.key!==publicationKey)authority.current={key:publicationKey};
  const ownerScope=authority.current,current=useRef(ownerScope),initialRead=useRef(null);current.current=ownerScope;
  useEffect(()=>{current.current=ownerScope;setBusy(false);return()=>{if(current.current===ownerScope)current.current=null;};},[ownerScope]);
  useEffect(()=>{
    const owner={initialized:false};initialRead.current=owner;setPending(null);setOwner(null);setError('');
    return()=>{if(initialRead.current===owner)initialRead.current=null;};
  },[admin,enabled,pendingSchedule,retainedRecovery,aiId,clientId,ownerScope]);
  useEffect(()=>{
    const owner=initialRead.current;if(!owner||owner.initialized||!admin||!enabled||!pendingSchedule&&!retainedRecovery||!aiId)return;
    const controller=new AbortController();
    api.get(`/ai_systems/${aiId}/reviews/pending`,{signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted||current.current!==ownerScope||initialRead.current!==owner||owner.initialized)return;
      owner.initialized=true;setError('');setPending(data?.pending||null);
    }).catch(cause=>{if(!controller.signal.aborted&&current.current===ownerScope&&initialRead.current===owner&&!owner.initialized)setError(formatError(cause));});
    return()=>controller.abort();
  },[api,admin,enabled,pendingSchedule,retainedRecovery,aiId,clientId,ownerScope]);
  async function submit(event){
    event.preventDefault();if(busy||!admin||!enabled||(!retained&&(!pending||!owner)))return;
    const submitted=ownerScope;setBusy(true);setError('');
    try{
      await (retained?recover.retry():recover(`/ai_systems/${aiId}/reviews/recover`,{
        schedule_id:pending.schedule_id,owner_id:owner,expected_updated_at:pending.expected_updated_at,
        expected_review_updated_at:pending.expected_review_updated_at}));
      if(current.current===submitted){setPending(null);await onRecovered?.();}
    }catch(cause){if(current.current===submitted)setError(formatError(cause));}
    finally{if(current.current===submitted)setBusy(false);}
  }
  if(!admin||!enabled||(!pending&&!retained&&!error))return null;
  return <section className="form-section" aria-label="Pending AI Review recovery">
    <h3>Recover pending Review</h3><p>Keep the original Review, date, cadence and occurrence. Choose a currently eligible owner to finish the interrupted save. Started or completed work cannot be changed here.</p>
    {error&&<p role="alert">{error}</p>}{(pending||retained)&&<form onSubmit={submit}>
      {pending&&<p>Original date: {pending.due_date} | Cadence: {pending.recurrence}</p>}
      {retained&&<p role="status">The recovery is awaiting confirmation. Retry its original values.</p>}
      <fieldset disabled={busy||!!retained}><AssigneeSelect clientId={clientId} label="Recovery Review owner" required value={retained?.[1]?.owner_id||owner} onChange={setOwner} users={users}/></fieldset>
      <button className="button primary" type="submit" disabled={busy||(!retained&&(!pending||!owner))}>{retained?'Retry Review recovery':'Recover original Review'}</button>
    </form>}
  </section>;
}
