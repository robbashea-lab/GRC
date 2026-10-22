import {useState} from 'react';
import {Info,LockKeyhole,Pencil,UserPlus,X} from 'lucide-react';
import {SheetTitle,SheetDescription} from './ui/sheet';
import {PLANNED_ROLES,PLANNED_CAPABILITIES} from '@/lib/plannedRoleModel';
import {calendarDay} from '@/lib/managementDates';
import './BrawndoContactWorkflow.css';

const roles=PLANNED_ROLES.filter(role=>role.legacyKey.startsWith('client_'));
const rolePresentation={
  client_grc_manager:{label:'GRC Manager',description:'Coordinates the program and existing users. Can’t change programs, delete records or manage access.'},
  client_contributor:{label:'Contributor',description:'Works assigned items, uploads evidence and comments. Can’t approve governance decisions.'},
  client_readonly:{label:'Read only',description:'Sees Brawndo’s program. Can’t change records or be assigned work.'},
};
const roleLabel=value=>rolePresentation[value]?.label||PLANNED_ROLES.find(role=>role.legacyKey===value)?.label||'Not recorded';
const displayDay=value=>{const day=calendarDay(value);return day===null?null:new Date(day*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});};
const capabilityLabel=label=>({'View authorized client records':'View client records','Upload evidence/comment':'Upload evidence and comment','Create/edit operational records':'Create/edit operational records (permitted)','Assign work':'Assign work (limited)'}[label]||label);
function ContactChanges({event}){
  const labels={name:'Full name',title:'Role in the program',email:'Email',status:'Status'};
  return Object.entries(labels).filter(([key])=>Object.hasOwn(event.meta?.changes||{},key)).map(([key,label])=><div key={key}>{label}: {event.meta?.previous&&Object.hasOwn(event.meta.previous,key)&&<><s>{String(event.meta.previous[key]??'Not recorded')}</s> → </>}{String(event.meta.changes[key]??'Not recorded')}</div>);
}
const titles=['Executive Sponsor','Security Program Lead','Operations and Technology Lead','Business Stakeholder','Privacy Lead','HR Lead'];
const groups={reviews:'Reviews',tasks:'Action items',findings:'Findings',policies:'Policies',risks:'Risks',vendors:'Vendors',assets:'Systems & assets',framework_assessments:'Assessments',requirements:'Requirements',ai_systems:'AI systems'};
function RoleCards({value,onChange,disabled}) {
  const selected=roles.find(role=>role.legacyKey===value);
  return <><div className="roles" aria-label="Client role">{roles.map(role=><button type="button" key={role.key} aria-pressed={value===role.legacyKey} disabled={disabled} onClick={()=>onChange(role.legacyKey)}><b>{roleLabel(role.legacyKey)}</b><small>{rolePresentation[role.legacyKey]?.description||role.detail}</small></button>)}</div>
    <div className="can">{PLANNED_CAPABILITIES.filter(row=>!['Create client tenants','Manage internal accounts','Platform audit access'].includes(row.label)).map(row=>{
      const permission=selected&&row.roles[selected.key],allowed=permission&&permission!=='No';
      return <span key={row.label} className={allowed?'':'no'}>{capabilityLabel(row.label)}</span>;
    })}</div></>;
}
export default function BrawndoContactWorkflow({current,form,setForm,state,data,primary,setPrimary,role,setRole,invite,setInvite,
  canWrite,saving,dirty,error,retryControl,archived,onArchive,onClose,onSave,onDisable,onResend,onOpen,accountActions}) {
  const [tab,setTab]=useState('overview');
  const tabs=[['overview','Overview'],['owns','Owns'],['access','Platform access'],['activity','Activity']];
  const ready=data.status==='ready',owns=data.owns,account=data.account,client=data.client;
  const isNew=!current,blocked=!canWrite||saving;
  const primarySaved=!!current&&client?.primary_contact_id===current.contact_id;
  const patch=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const field=(key,label,type='text',required=false,full=false)=><div className={`f${full?' full':''}`}>
    <label htmlFor={`contact-workflow-${key}`}>{label}{required&&isNew&&<span className="required"> *</span>}</label>
    <input id={`contact-workflow-${key}`} className="in" type={type} required={required} maxLength={key==='email'?254:200} list={key==='title'?'contact-workflow-titles':undefined} value={form[key]} disabled={blocked} onChange={event=>patch(key,event.target.value)}/>
    {key==='email'&&current&&<span className="help">Contact email. The linked account’s sign-in address is managed separately.</span>}
  </div>;
  const primaryToggle=<label className="toggle"><input type="checkbox" checked={primary} disabled={blocked||!ready||primarySaved||archived} onChange={event=>setPrimary(event.target.checked)}/><span><b>{isNew?'Make primary contact':`Primary contact for ${client?.name||'Brawndo'}`}</b><small>{primarySaved?'The first person iVenture contacts about the program. To change it, make someone else primary.':'Only one contact can be primary. The existing primary contact is replaced after saving.'}</small></span></label>;
  const accessChip=<span className={`chip ${state.key==='active'?'ok':state.key==='pending'?'warn':'plain'}`}>{state.label}</span>;
  return <>
    <header className="mh">
      <div className="mh-top"><span className={isNew?'mh-ic':'big-av'} aria-hidden="true">{isNew?<UserPlus size={20} strokeWidth={1.8}/>:(form.name||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span>
        <div><SheetTitle className="contact-concept-title">{isNew?'New contact':form.name||'Unnamed contact'}</SheetTitle><SheetDescription className="sub">{isNew?`${client?.name||'Brawndo'} · add a person and, if they need it, give them access`:form.title||'No role set'}</SheetDescription>
          {!isNew&&<div className="sub">{primarySaved&&<span className="chip info">Primary</span>}{accessChip}{account&&<span className="chip plain">{roleLabel(account.role)}</span>}</div>}
        </div><button type="button" className="x" aria-label="Close contact" disabled={saving} onClick={onClose}><X size={18}/></button>
      </div>
      {!isNew&&<nav className="tabs" role="tablist" aria-label="Contact sections">{tabs.map(([key,label])=><button type="button" className="tab" role="tab" key={key} id={`contact-tab-${key}`} aria-controls={`contact-panel-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.findIndex(([id])=>id===key),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next][0]);event.currentTarget.parentElement.children[next].focus();}}>{label}{key==='owns'&&<span className="n">{ready&&owns?owns.total:'—'}</span>}</button>)}</nav>}
    </header>
    <form onSubmit={onSave} className="contact-concept-form">
      <div className="mb">
        {error&&<p role="alert" className="help err">{error}</p>}{retryControl}
        {data.status==='loading'&&<p role="status" className="help">Loading contact context…</p>}
        {data.status==='error'&&<p role="alert" className="help err">Contact context could not be loaded. {data.error}</p>}
        {archived&&<p className="help">Archived contact · historical relationships are retained.</p>}
        <datalist id="contact-workflow-titles">{titles.map(title=><option key={title}>{title}</option>)}</datalist>
        {isNew?<>
          <div className="secn"><span className="num">1</span><b>Who they are</b></div>
          <div className="grid">{field('name','Full name','text',true)}{field('title','Role in the program')}{field('email','Email','email',true,true)}<div className="f full">{primaryToggle}</div></div>
          <div className="secn"><span className="num">2</span><b>Platform access</b><span className="h">Optional. Contacts without access can still be listed here.</span></div>
          <label className="toggle"><input type="checkbox" checked={invite} disabled={blocked} onChange={event=>setInvite(event.target.checked)}/><span><b>Invite to GoverNara</b><small>Create a Demo invitation for this client. No email will be sent.</small></span></label>
          {invite&&<div className="sec"><RoleCards value={role} onChange={setRole} disabled={blocked}/></div>}
        </>:<>
          <section role="tabpanel" id="contact-panel-overview" aria-labelledby="contact-tab-overview" hidden={tab!=='overview'}>
            <div className="strip"><div><span className="lbl">Owns</span><div className="val">{ready&&owns?`${owns.total} item${owns.total===1?'':'s'}`:'Not available'}</div><small>{ready&&owns?Object.entries(groups).filter(([key])=>owns[key]).map(([key,label])=>`${owns[key]} ${label.toLowerCase()}`).join(' · ')||'Nothing assigned':'Ownership has not been verified'}</small></div>
              <div><span className="lbl">Platform access</span><div className="val">{state.key==='active'?roleLabel(account?.role):state.label}</div><small>{account?.last_login_at?`Last signed in ${displayDay(account.last_login_at)}`:state.key==='active'?'Last sign-in not recorded':state.description}</small></div>
              <div><span className="lbl">Contact since</span><div className="val">{displayDay(current.created_at)||'Not recorded'}</div><small>{current.email}</small></div></div>
            <div className="sec"><h3>Contact information <span className="hint">Edit and save. Changes are recorded in Activity.</span></h3><div className="grid">{field('name','Full name','text',true)}{field('title','Role in the program')}{field('email','Email','email',true,true)}<div className="f full">{primaryToggle}</div></div></div>
          </section>
          <section role="tabpanel" id="contact-panel-owns" aria-labelledby="contact-tab-owns" hidden={tab!=='owns'}>
            {ready&&owns&&<>{owns.total>0&&<div className="reassign"><span className="tx">Moving someone off the program? Open each record to deliberately reassign its work. Ownership and history are retained.</span></div>}
              {Object.entries(groups).map(([key,label])=>{const items=owns.items.filter(item=>item.kind===key&&item.client_id===current.client_id);return items.length?<div className="own-g" key={key}><h4>{label} · {owns[key]}</h4>{items.map(item=><div className="orow" key={item.id}><b>{item.title}</b><span className="sp"/><span className="chip plain">{item.status?.replaceAll('_',' ')}</span>{item.due_date&&<span className="chip plain">Due {displayDay(item.due_date)}</span>}<button type="button" className="lnkb" onClick={()=>onOpen(item)}>Open →</button></div>)}</div>:null;})}
              {!owns.total&&<div className="empty">Nothing assigned yet.</div>}{owns.truncated&&<p className="help">Showing up to 100 records per module. Totals include all active assignments.</p>}</>}
            {ready&&!owns&&<div className="empty">Ownership information is not available for this account.</div>}
          </section>
          <section role="tabpanel" id="contact-panel-access" aria-labelledby="contact-tab-access" hidden={tab!=='access'}>
            <div className="acc-card"><div className="hd">{accessChip}<b>{account?.email||'Contact only'}</b><span className="sp"/>
              {canWrite&&!archived&&<>{state.key==='pending'&&<button type="button" className="btn" disabled={saving||dirty} onClick={onResend}>Resend invite</button>}{['active','pending'].includes(state.key)&&account&&<button type="button" className="btn" disabled={saving||dirty} onClick={onDisable}>Disable access</button>}{!current.linked_user_id&&!dirty&&accountActions}</>}
            </div><p className="help">{account?`Sign-in address: ${account.email} · Last signed in ${account.last_login_at?displayDay(account.last_login_at):'Not recorded'}`:state.description}</p></div>
            <div className="sec"><h3>Role <span className="hint">What they can do in GoverNara for {client?.name||'Brawndo'}.</span></h3><RoleCards value={role} onChange={setRole} disabled={blocked||!account||archived||!roles.some(item=>item.legacyKey===account.role)}/></div>
            {account&&<p className="help">Changing this role applies across the account’s client memberships.</p>}
            <p className="contact-access-note"><Info size={14} aria-hidden="true"/><span>Client contacts can only hold client roles. iVenture roles (Platform Owner, Service Provider GRC Administrator) are granted in Administration → Users &amp; Access.</span></p>
            <div className="danger"><h4>{archived?'Restore contact':'Archive contact'}</h4><p>{archived?'Return this contact to the directory. Platform access does not change.':'Removes them from the default directory. History remains. Archiving never revokes account access.'}</p><div className="acts"><button type="button" className="btn" disabled={blocked||dirty||!archived&&!['none','disabled'].includes(state.key)} onClick={onArchive}>{archived?'Restore contact':'Archive contact'}</button></div></div>
          </section>
          <section role="tabpanel" id="contact-panel-activity" aria-labelledby="contact-tab-activity" hidden={tab!=='activity'}>
            {ready&&(!data.events.length?<div className="empty">No activity yet.</div>:data.events.filter(event=>event.entity_id===current.contact_id).map(event=><div className="ev" key={event.log_id||event.audit_id}><span className="ei chg" aria-hidden="true"><Pencil size={14}/></span><div className="what"><b>{event.action?.replaceAll('-',' ').replaceAll('_',' ')}</b><ContactChanges event={event}/><div className="help">{event.user_email||'Actor not recorded'}</div></div><span className="meta">{new Date(event.at).toLocaleString()}</span></div>))}
            <div className="lock"><LockKeyhole size={13} aria-hidden="true"/>Recorded automatically. Entries can’t be edited or deleted.</div>
          </section>
        </>}
      </div>
      <footer className="mf"><span className={isNew?'sumline':'dirty'}>{isNew?<>Adds <b>{form.name.trim()||'a contact'}</b>{primary?' as Primary':''} · {invite?`invites them as ${roleLabel(role)}`:'contact only, no access'}</>:dirty?'Unsaved changes':'No unsaved changes'}</span><span className="sp"/><button type="button" className="btn" disabled={saving} onClick={onClose}>{isNew?'Cancel':'Close'}</button>{canWrite&&<button type="submit" className="btn pri" disabled={saving||!isNew&&!dirty}>{saving?'Saving…':isNew?'Create contact':'Save changes'}</button>}</footer>
    </form>
  </>;
}
