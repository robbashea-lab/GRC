import {useBrawndoFullRecord} from '@/lib/brawndoFullRecord';
import './BrawndoFullRecord.css';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useOrg} from '@/context/OrgContext';
import BrawndoContactWorkflow from './BrawndoContactWorkflow';
import useContactWorkflowData from './useContactWorkflowData';
import {SCHEMAS} from '@/lib/schemas';
import RecordDrawer from './RecordDrawer';
import api,{formatError} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {useCreateIntent} from '@/lib/createIntent';
import {invitationFeedback} from '@/lib/invitationFeedback';
import {CONTACT_FIELDS,contactForm,directoryAccess,isArchivedContact} from '@/lib/contactDirectory';
import {useContactAccess} from './ContactAccess';
import ContactAccountActions from './ContactAccountActions';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Textarea} from './ui/textarea';
import {toast} from 'sonner';
import './Contacts.css';

export function ContactAccessPill({state}) {return <span className={`contact-access contact-access-${state.key}`} title={state.description}>{state.label}</span>;}

export default function ContactWorkspace({open,onOpenChange,record,clientId,onSaved,additionalPresentation=false}) {
  const {user,workspaceMode}=useAuth(),navigate=useNavigate(),org=useOrg();
  const canWrite=['super_admin','platform_admin'].includes(user?.role);
  const [current,setCurrent]=useState(record),[form,setForm]=useState(()=>contactForm(record));
  const baseline=useRef(contactForm(record)),opener=useRef(null);
  const [invite,setInvite]=useState(false),[role,setRole]=useState('client_readonly');
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[archive,setArchive]=useState(false);
  const create=useCreateIntent((...args)=>api.post(...args),`${clientId}:${user?.user_id}:contacts`);
  const update=useCreateIntent((...args)=>api.patch(...args),`${user?.user_id}:${clientId}:contacts:${record?.contact_id}:update`,true);
  const context=useContactAccess(clientId,open,current);
  const state=directoryAccess(current||{client_id:clientId},clientId,context);
  const fullRecord=useBrawndoFullRecord(record,clientId)&&(!current||current.client_id===clientId);
  const workflow=fullRecord&&window.location.pathname==='/contacts';
  const [primary,setPrimary]=useState(false),[contextRevision,setContextRevision]=useState(0),[related,setRelated]=useState(null);
  const workflowData=useContactWorkflowData({enabled:workflow&&open,user,clientId,contact:current,revision:contextRevision});
  const primaryBaseline=useRef(false),accountRoleBaseline=useRef('client_readonly'),contextLoaded=useRef(null);
  const accountBaseline=useRef(null);
  const saveScope=useRef(null),mounted=useRef(true);
  const inputScope={open,clientId,contactId:record?.contact_id??null,userId:user?.user_id,role:user?.role,workspaceMode:workspaceMode??user?.workspace_mode,actorWorkspaceMode:user?.workspace_mode,status:user?.status,route:window.location.pathname};
  if(!saveScope.current||Object.keys(inputScope).some(key=>saveScope.current[key]!==inputScope[key]))saveScope.current=inputScope;
  const activeSaveScope=saveScope.current;
  const isSaveCurrent=scope=>mounted.current&&saveScope.current===scope;
  // Presentation loading must not discard a confirmed Contact; feature writes still bind to its epoch.
  const presentationScope=useRef(null);
  if(!presentationScope.current||presentationScope.current.owner!==activeSaveScope||presentationScope.current.workflow!==workflow||presentationScope.current.fullRecord!==fullRecord)presentationScope.current={owner:activeSaveScope,workflow,fullRecord};
  const activePresentationScope=presentationScope.current;
  const isPresentationCurrent=(scope,presentation)=>isSaveCurrent(scope)&&presentationScope.current===presentation;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setSaving(false);},[activeSaveScope]);
  const hasCurrentTarget=!!current&&current.client_id===clientId&&(!record?.contact_id||current.contact_id===record.contact_id);
  useEffect(()=>{
    const key=`${clientId}:${current?.contact_id||'new'}:${current?.linked_user_id||''}`;
    if(workflowData.status!=='ready')return;
    if(contextLoaded.current===key){
      // Refresh a pristine account version without replacing a pending role choice.
      if(role===accountRoleBaseline.current){accountBaseline.current=workflowData.account||null;if(workflowData.account){accountRoleBaseline.current=workflowData.account.role;setRole(workflowData.account.role);}}
      return;
    }
    contextLoaded.current=key;
    const value=!!current&&workflowData.client.primary_contact_id===current.contact_id;
    setPrimary(value);primaryBaseline.current=value;
    accountBaseline.current=workflowData.account||null;
    if(workflowData.account){setRole(workflowData.account.role);accountRoleBaseline.current=workflowData.account.role;}
  },[workflowData,current,clientId,role]);
  const archived=isArchivedContact(current||{});
  const dirty=JSON.stringify(form)!==JSON.stringify(baseline.current)||(!current&&invite)||workflow&&(primary!==primaryBaseline.current||!!current&&!!accountBaseline.current&&role!==accountRoleBaseline.current);
  useEffect(()=>{if(open){setCurrent(record);const value=contactForm(record);setForm(value);baseline.current=value;setInvite(false);setError('');setRole('client_readonly');setDiscard(false);setArchive(false);setPrimary(false);primaryBaseline.current=false;accountRoleBaseline.current='client_readonly';accountBaseline.current=null;contextLoaded.current=null;setRelated(null);}},[open,record,clientId,user?.user_id,user?.role,user?.workspace_mode,workspaceMode,user?.status]);
  useEffect(()=>{if(!open||!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[open,dirty]);
  const close=()=>{if(saving)return;if(dirty)setDiscard(true);else onOpenChange(false);};
  async function refreshAccount(){
    // ContactAccountActions passes linked-account data here; arguments are not a scope token.
    const scope=activeSaveScope,id=current?.contact_id;
    if(!hasCurrentTarget||!isSaveCurrent(scope))return;
    try{
      const {data}=await api.get(`/contacts/${id}`);
      if(!isSaveCurrent(scope))return;
      setCurrent(data);setContextRevision(value=>value+1);
      if(isSaveCurrent(scope))onSaved?.();
    }catch(e){if(isSaveCurrent(scope))setError(`Account action completed; refresh contact details before continuing. ${formatError(e)}`);}
  }
  async function resendInvitation(){
    const scope=activeSaveScope,presentation=activePresentationScope,id=current?.linked_user_id;
    if(!canWrite||saving||dirty||!hasCurrentTarget||!id||!isPresentationCurrent(scope,presentation))return;
    setSaving(true);setError('');
    try{
      const {data}=await api.post(`/users/${id}/resend-invite`,{});
      if(!isSaveCurrent(scope))return;
      toast.info(invitationFeedback(data));
      if(isSaveCurrent(scope))await refreshAccount();
    }catch(e){if(isSaveCurrent(scope))setError(formatError(e));}
    finally{if(isSaveCurrent(scope))setSaving(false);}
  }
  async function retrySave(){
    const scope=activeSaveScope;
    if(!canWrite||saving||!hasCurrentTarget||!isSaveCurrent(scope))return;
    setSaving(true);setError('');
    try{
      const {data}=await update.retry();
      if(!isSaveCurrent(scope))return;
      setCurrent(data);baseline.current=contactForm(data);setForm(baseline.current);
      if(isSaveCurrent(scope))onSaved?.();
      if(isSaveCurrent(scope))toast.success('Saved');
    }catch(e){if(isSaveCurrent(scope))setError(formatError(e));}
    finally{if(isSaveCurrent(scope))setSaving(false);}
  }
  async function save(event){
    event.preventDefault();if(!canWrite||saving||!open)return;
    if(record?.contact_id&&current?.contact_id!==record.contact_id||current&&current.client_id!==clientId)return;
    // Capture targets before awaiting; live baseline refs may belong to another Contact on return.
    const scope=activeSaveScope,presentation=activePresentationScope,account=accountBaseline.current?{...accountBaseline.current}:null;
    const originalPrimary=primaryBaseline.current,originalRole=accountRoleBaseline.current;
    const clientReady=workflowData.status==='ready',clientVersion=workflowData.client?.updated_at??null;
    setSaving(true);setError('');
    let saved,refreshOrg=false;
    try{
      const body={...form,name:form.name.trim(),email:form.email.trim()};
      if(!body.name||!body.email)throw new Error('Full name and email are required.');
      const response=current?await update(`/contacts/${current.contact_id}`,{...body,expected_updated_at:current.updated_at??null}):await create('/contacts',{...body,client_id:clientId,status:'active'});
      saved=response.data;
      if(!isSaveCurrent(scope))return;
      if(workflow&&!current)contextLoaded.current=`${clientId}:${saved.contact_id}:${saved.linked_user_id||''}`;
      setCurrent(saved);baseline.current=contactForm(saved);setForm(baseline.current);
      if(workflow&&primary&&!originalPrimary){
        if(!clientReady)throw new Error('Reload client details before changing the primary contact.');
        if(!isPresentationCurrent(scope,presentation))throw new Error('Refresh this contact before completing the remaining action.');
        await api.patch(`/clients/${clientId}`,{primary_contact_id:saved.contact_id,expected_updated_at:clientVersion});
        if(!isSaveCurrent(scope))return;
        primaryBaseline.current=true;refreshOrg=true;setContextRevision(value=>value+1);
      }
      if(workflow&&current&&account&&role!==originalRole){
        if(!isPresentationCurrent(scope,presentation))throw new Error('Refresh this contact before completing the remaining action.');
        await api.patch(`/users/${account.user_id}`,{role,expected_updated_at:account.updated_at??null});
        if(!isSaveCurrent(scope))return;
        accountRoleBaseline.current=role;setContextRevision(value=>value+1);
      }
      if(!current&&invite){
        // Contact creation and invitation are separate authoritative operations. Never recreate
        // a saved contact if invitation delivery or account creation fails.
        if(!isPresentationCurrent(scope,presentation))throw new Error('Refresh this contact before completing the remaining action.');
        setInvite(false);
        const {data}=await api.post(`/contacts/${saved.contact_id}/invite`,{role,client_id:clientId,confirmed:true});
        if(!isSaveCurrent(scope))return;
        toast.info(invitationFeedback(data));
      }
      if(isSaveCurrent(scope))onSaved?.();
      if(isSaveCurrent(scope))onOpenChange(false);
    }catch(e){
      if(!isSaveCurrent(scope))return;
      setError(`${saved?(workflow?'Contact saved. A related action was not confirmed; check its state before retrying. ':'Contact saved. Invitation was not confirmed; use the account actions below to check or retry. '):''}${formatError(e)}`);
      if(saved){
        try{
          const {data}=await api.get(`/contacts/${saved.contact_id}`);
          if(!isSaveCurrent(scope))return;
          setCurrent(data);
        }catch{/* Keep the confirmed Contact; never retry its creation. */}
        if(isSaveCurrent(scope))onSaved?.();
      }
    }
    finally{if(isSaveCurrent(scope)){setSaving(false);if(refreshOrg)org.refresh();}}
  }
  async function disableAccess(){
    const scope=activeSaveScope,presentation=activePresentationScope,account=workflowData.account?{...workflowData.account}:null;
    if(!canWrite||saving||dirty||!hasCurrentTarget||!account||!isPresentationCurrent(scope,presentation))return;
    setSaving(true);setError('');
    try{
      const {data}=await api.get(`/users/${account.user_id}/open_assignments`,{params:{client_id:clientId}});
      if(!isPresentationCurrent(scope,presentation))return;
      if(!window.confirm(`Disable ${account.name||account.email}? This affects the account across its clients. ${data.total} active assignments in this client and all history will be retained.`))return;
      if(!isPresentationCurrent(scope,presentation))return;
      await api.patch(`/users/${account.user_id}`,{status:'disabled',expected_updated_at:account.updated_at??null});
      if(isSaveCurrent(scope))await refreshAccount();
    }catch(e){if(isSaveCurrent(scope))setError(formatError(e));}
    finally{if(isSaveCurrent(scope))setSaving(false);}
  }
  async function openOwned(item){
    const scope=activeSaveScope;
    if(saving||!hasCurrentTarget||item.client_id!==clientId||!isSaveCurrent(scope))return;
    try{const {data}=await api.get(`/${item.kind}/${encodeURIComponent(item.id)}`);if(!isSaveCurrent(scope))return;if(data.client_id!==clientId)throw new Error('Record is outside this client.');setRelated({kind:item.kind,record:data});}
    catch(e){if(isSaveCurrent(scope))setError(formatError(e));}
  }
  async function archiveContact(){
    const scope=activeSaveScope,presentation=activePresentationScope,target=current?{...current}:null;
    if(!canWrite||saving||dirty||!hasCurrentTarget||!isPresentationCurrent(scope,presentation))return;
    setSaving(true);setError('');
    try{
      // Recheck authoritative account projection immediately before the directory lifecycle edit.
      const {data}=await api.get(`/clients/${clientId}/contact-accounts`);
      if(!isPresentationCurrent(scope,presentation))return;
      const latest=directoryAccess(target,clientId,{clientId,status:'ready',members:data});
      if(!archived&&!['none','disabled'].includes(latest.key))throw new Error('Manage active or pending access in Users & Access before archiving this contact.');
      if(!isPresentationCurrent(scope,presentation))return;
      await update(`/contacts/${target.contact_id}`,{status:archived?'active':'inactive',expected_updated_at:target.updated_at??null});
      if(isSaveCurrent(scope))onSaved?.();
      if(isSaveCurrent(scope))onOpenChange(false);
    }catch(e){if(isSaveCurrent(scope))setError(formatError(e));}
    finally{if(isSaveCurrent(scope)){setSaving(false);setArchive(false);}}
  }
  return <Sheet open={open} onOpenChange={value=>value?onOpenChange(true):close()}>
    <SheetContent data-testid="contact-drawer" className={`contact-workspace${additionalPresentation?' brawndo-additional bac-workspace':''}${fullRecord?' brawndo-full-record':''}${workflow?' brawndo-contact-workflow':''}`} onPointerDownOutside={e=>e.preventDefault()} onOpenAutoFocus={()=>{opener.current=document.activeElement;}} onCloseAutoFocus={e=>{e.preventDefault();(opener.current?.isConnected?opener.current:document.querySelector('[data-testid="contacts-search"]'))?.focus();}}>
      {workflow?<BrawndoContactWorkflow current={current} form={form} setForm={setForm} state={state} data={workflowData} primary={primary} setPrimary={setPrimary} role={role} setRole={setRole} invite={invite} setInvite={setInvite} canWrite={canWrite} saving={saving} dirty={dirty} error={error} archived={archived} onArchive={()=>setArchive(true)} onClose={close} onSave={save} onDisable={disableAccess} onResend={resendInvitation} onOpen={openOwned} accountActions={<ContactAccountActions contact={current} onChanged={refreshAccount}/>}
        retryControl={update.unconfirmed()&&<><p role="status">Save is unconfirmed. Retry the original save before another edit.</p><Button type="button" disabled={saving||!canWrite} onClick={retrySave}>Retry unconfirmed save</Button></>}/>:<>
      <SheetHeader className="contact-workspace-header"><SheetTitle>{current?current.name:'New Contact'}</SheetTitle><SheetDescription>{current?'Contact information and linked platform access.':'Add a client contact and optionally invite them to Omnisciente.'}</SheetDescription></SheetHeader>
      <form onSubmit={save} className="contact-workspace-form">
        <div className="contact-workspace-body">
          {error&&<p role="alert" className="text-sm text-semantic-critical">{error}</p>}
          {update.unconfirmed()&&<><p role="status">Save is unconfirmed. Retry the original save before another edit.</p><Button type="button" disabled={saving||!canWrite} onClick={retrySave}>Retry unconfirmed save</Button></>}
          {archived&&<p className="text-sm text-ink-secondary">Archived contact · historical relationships are retained.</p>}
          <section aria-labelledby="contact-info-heading"><h3 id="contact-info-heading">Contact Information</h3><div className="contact-field-grid">
            {CONTACT_FIELDS.map(([key,label,type,required])=><div key={key}><Label htmlFor={`contact-${key}`}>{label}{required?' *':''}</Label><Input id={`contact-${key}`} type={type} required={required} maxLength={key==='email'?254:200} disabled={!canWrite||saving} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
          </div></section>
          <section aria-labelledby="contact-platform-heading"><h3 id="contact-platform-heading">Platform Access{!current?' (optional)':''}</h3>
            {current?<><ContactAccessPill state={state}/><p className="text-sm text-ink-secondary mt-2">{state.description}</p>
              {canWrite&&!archived&&<div className="mt-3">{dirty?<p className="text-sm text-ink-secondary">Save contact changes before managing access.</p>:<>
                {!current.linked_user_id&&<ContactAccountActions contact={current} onChanged={refreshAccount}/>}
                {current.linked_user_id&&<div className="flex flex-wrap gap-2">{state.key==='pending'&&<Button type="button" variant="outline" disabled={saving} onClick={resendInvitation}>Resend Invitation</Button>}<Button type="button" variant="outline" disabled={saving} onClick={()=>navigate('/admin/users')}>Manage Access in Users &amp; Access</Button></div>}
              </>}</div>}
            </>:canWrite&&<><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invite} disabled={saving} onChange={e=>setInvite(e.target.checked)}/>Invite this contact to Omnisciente</label>
              {invite&&<div className="mt-3 space-y-2"><p className="text-sm text-ink-secondary">{user?.workspace_mode==='demo'?'Demo invitation only. No email will be sent.':'Request an invitation to create an account and access this client workspace. Delivery status is reported after saving.'}</p>
                <Label htmlFor="contact-platform-role">Platform Role</Label><select id="contact-platform-role" className="contact-select" value={role} disabled={saving} onChange={e=>setRole(e.target.value)}><option value="client_readonly">Client Read Only</option><option value="client_contributor">Client Contributor</option></select>
              </div>}</>}
          </section>
          {form.notes&&<details><summary className="text-sm cursor-pointer">Existing contact notes</summary><Label htmlFor="contact-notes" className="sr-only">Contact notes</Label><Textarea id="contact-notes" value={form.notes} disabled={!canWrite||saving} onChange={e=>setForm({...form,notes:e.target.value})}/></details>}
          {current&&canWrite&&<section className="text-sm"><Button type="button" variant="outline" disabled={saving||dirty||!archived&&!['none','disabled'].includes(state.key)} onClick={()=>setArchive(true)}>{archived?'Restore Contact':'Archive Contact'}</Button>
            {!archived&&!['none','disabled'].includes(state.key)&&<p className="text-ink-secondary mt-2">Handle active or pending access in Users &amp; Access before archiving. Archiving never revokes an account.</p>}
          </section>}
        </div>
        <footer className="contact-workspace-footer"><Button type="button" variant="outline" disabled={saving} onClick={close}>{canWrite?'Cancel':'Close'}</Button>{canWrite&&<Button type="submit" disabled={saving}>{saving?'Saving…':current?'Save Changes':invite?'Create & Invite':'Create Contact'}</Button>}</footer>
      </form>
      </>}
      {related&&<RecordDrawer open kind={related.kind} record={related.record} schema={SCHEMAS[related.kind]?.fields} clientId={clientId} onOpenChange={value=>{if(!value){setRelated(null);setContextRevision(value=>value+1);}}} onSaved={()=>{setContextRevision(value=>value+1);onSaved?.();}}/>}
      <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogTitle>Discard contact changes?</AlertDialogTitle><AlertDialogDescription>Your unsaved contact information will be lost. Saved account actions remain unchanged.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{setDiscard(false);onOpenChange(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={archive} onOpenChange={setArchive}><AlertDialogContent><AlertDialogTitle>{archived?'Restore this contact?':'Archive this contact?'}</AlertDialogTitle><AlertDialogDescription>{archived?'Return this contact to the directory. Platform access will not change.':'Remove this contact from the default directory. Historical relationships, notes and account records will be retained.'}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={e=>{e.preventDefault();archiveContact();}}>{archived?'Restore Contact':'Archive Contact'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </SheetContent>
  </Sheet>;
}
