import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
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

export default function ContactWorkspace({open,onOpenChange,record,clientId,onSaved}) {
  const {user}=useAuth(),navigate=useNavigate();
  const canWrite=['super_admin','platform_admin'].includes(user?.role);
  const [current,setCurrent]=useState(record),[form,setForm]=useState(()=>contactForm(record));
  const baseline=useRef(contactForm(record)),opener=useRef(null);
  const [invite,setInvite]=useState(false),[role,setRole]=useState('client_readonly');
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[archive,setArchive]=useState(false);
  const create=useCreateIntent((...args)=>api.post(...args),`${clientId}:${user?.user_id}:contacts`);
  const context=useContactAccess(clientId,open,current);
  const state=directoryAccess(current||{client_id:clientId},clientId,context);
  const archived=isArchivedContact(current||{});
  const dirty=JSON.stringify(form)!==JSON.stringify(baseline.current)||(!current&&invite);
  useEffect(()=>{if(open){setCurrent(record);const value=contactForm(record);setForm(value);baseline.current=value;setInvite(false);setError('');setRole('client_readonly');setDiscard(false);setArchive(false);}},[open,record,clientId]);
  useEffect(()=>{if(!open||!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[open,dirty]);
  const close=()=>{if(saving)return;if(dirty)setDiscard(true);else onOpenChange(false);};
  async function refreshAccount(){
    try{const {data}=await api.get(`/contacts/${current.contact_id}`);setCurrent(data);onSaved?.();}
    catch(e){setError(`Account action completed; refresh contact details before continuing. ${formatError(e)}`);}
  }
  async function resendInvitation(){
    setSaving(true);setError('');
    try{const {data}=await api.post(`/users/${current.linked_user_id}/resend-invite`,{});toast.info(invitationFeedback(data));await refreshAccount();}
    catch(e){setError(formatError(e));}finally{setSaving(false);}
  }
  async function save(event){
    event.preventDefault();if(!canWrite||saving)return;
    setSaving(true);setError('');
    let saved;
    try{
      const body={...form,name:form.name.trim(),email:form.email.trim()};
      if(!body.name||!body.email)throw new Error('Full name and email are required.');
      const response=current?await api.patch(`/contacts/${current.contact_id}`,{...body,expected_updated_at:current.updated_at??null}):await create('/contacts',{...body,client_id:clientId,status:'active'});
      saved=response.data;setCurrent(saved);baseline.current=contactForm(saved);setForm(baseline.current);
      if(!current&&invite){
        // Contact creation and invitation are separate authoritative operations. Never recreate
        // a saved contact if invitation delivery or account creation fails.
        setInvite(false);
        const {data}=await api.post(`/contacts/${saved.contact_id}/invite`,{role,client_id:clientId,confirmed:true});
        toast.info(invitationFeedback(data));
      }
      onSaved?.();onOpenChange(false);
    }catch(e){setError(`${saved?'Contact saved. Invitation was not confirmed; use the account actions below to check or retry. ':''}${formatError(e)}`);if(saved){try{const {data}=await api.get(`/contacts/${saved.contact_id}`);setCurrent(data);}catch{/* Keep the confirmed contact; never retry its creation. */}onSaved?.();}}
    finally{setSaving(false);}
  }
  async function archiveContact(){
    setSaving(true);setError('');
    try{
      // Recheck authoritative account projection immediately before the directory lifecycle edit.
      const {data}=await api.get(`/clients/${clientId}/contact-accounts`);
      const latest=directoryAccess(current,clientId,{clientId,status:'ready',members:data});
      if(!archived&&!['none','disabled'].includes(latest.key))throw new Error('Manage active or pending access in Users & Access before archiving this contact.');
      await api.patch(`/contacts/${current.contact_id}`,{status:archived?'active':'inactive',expected_updated_at:current.updated_at??null});
      onSaved?.();onOpenChange(false);
    }catch(e){setError(formatError(e));}finally{setSaving(false);setArchive(false);}
  }
  return <Sheet open={open} onOpenChange={value=>value?onOpenChange(true):close()}>
    <SheetContent className="contact-workspace" onPointerDownOutside={e=>e.preventDefault()} onOpenAutoFocus={()=>{opener.current=document.activeElement;}} onCloseAutoFocus={e=>{e.preventDefault();(opener.current?.isConnected?opener.current:document.querySelector('[data-testid="contacts-search"]'))?.focus();}}>
      <SheetHeader className="contact-workspace-header"><SheetTitle>{current?current.name:'New Contact'}</SheetTitle><SheetDescription>{current?'Contact information and linked platform access.':'Add a client contact and optionally invite them to Omnisciente.'}</SheetDescription></SheetHeader>
      <form onSubmit={save} className="contact-workspace-form">
        <div className="contact-workspace-body">
          {error&&<p role="alert" className="text-sm text-semantic-critical">{error}</p>}
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
      <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogTitle>Discard contact changes?</AlertDialogTitle><AlertDialogDescription>Your unsaved contact information will be lost. Saved account actions remain unchanged.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{setDiscard(false);onOpenChange(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={archive} onOpenChange={setArchive}><AlertDialogContent><AlertDialogTitle>{archived?'Restore this contact?':'Archive this contact?'}</AlertDialogTitle><AlertDialogDescription>{archived?'Return this contact to the directory. Platform access will not change.':'Remove this contact from the default directory. Historical relationships, notes and account records will be retained.'}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={e=>{e.preventDefault();archiveContact();}}>{archived?'Restore Contact':'Archive Contact'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </SheetContent>
  </Sheet>;
}
