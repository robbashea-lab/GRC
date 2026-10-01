import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {MoreHorizontal} from 'lucide-react';
import api,{formatError} from '@/lib/api';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {directoryAccess,directoryRows,isArchivedContact} from '@/lib/contactDirectory';
import {useContactAccess} from '@/components/ContactAccess';
import ContactWorkspace,{ContactAccessPill} from '@/components/ContactWorkspace';
import PageHeader from '@/components/PageHeader';
import {HeaderActions,PrimaryAction,SearchField,SortableHeader} from '@/components/Register';
import {useTableControls} from '@/components/TableControls';
import RegisterLoadError from '@/components/RegisterLoadError';
import TableLoadingRow from '@/components/TableLoadingRow';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {Button} from '@/components/ui/button';
import {BrawndoSurface,BrawndoPageHeader} from '@/components/BrawndoPage';

import './BrawndoContacts.css';

const columns=[{key:'name',label:'Contact'},{key:'title',label:'Job Title'},{key:'email',label:'Email'},{key:'phone',label:'Phone'}];
export default function Contacts(){
  const {currentClientId,currentClient}=useOrg(),{user}=useAuth();
  // Remount the directory on identity/tenant changes, including its open editor.
  return <ContactDirectory key={`${user?.user_id}:${currentClientId}`} clientId={currentClientId} user={user} brawndo={!!currentClientId} clientName={currentClient?.name}/>;
}
function ContactDirectory({clientId,user,brawndo,clientName}){
  const [params,setParams]=useSearchParams(),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [selected,setSelected]=useState(null),[open,setOpen]=useState(false);
  const canWrite=['super_admin','platform_admin'].includes(user?.role);
  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{if(!clientId){setLoading(false);return;}const abort=new AbortController();setLoading(true);setError('');
    api.get('/contacts',{params:{client_id:clientId},signal:abort.signal}).then(({data})=>{if(!abort.signal.aborted)setRows(data.filter(r=>r.client_id===clientId));}).catch(e=>{if(!abort.signal.aborted)setError(formatError(e));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[clientId,revision]);
  const context=useContactAccess(clientId,!!clientId,rows);
  const table=useTableControls({columns,rows,module:'contacts-directory',scope:`${user?.user_id}:${clientId}`});
  const query=params.get('q')||'',access=params.get('access')||'',archived=params.get('archived')==='true';
  const setParam=(key,value)=>{const next=new URLSearchParams(params);value?next.set(key,value):next.delete(key);setParams(next,{replace:true});};
  const filtered=table.apply(directoryRows(rows,{query,access,archived,clientId,context}));
  const initialLoading=loading&&!rows.length;
  const edit=row=>{setSelected(row);setOpen(true);};
  // Keep old contact links usable, including archived records.
  const id=params.get('open');
  useEffect(()=>{if(!loading&&id){const row=rows.find(r=>r.contact_id===id);if(row){setSelected(row);setOpen(true);}}},[id,loading,rows]);
  const close=value=>{setOpen(value);if(!value&&id)setParam('open','');};
  const newContact=canWrite&&<PrimaryAction label="New Contact" disabled={!clientId} onClick={()=>edit(null)}/>;
  const body=<>
    {brawndo?<BrawndoPageHeader eyebrow={`${clientName||'Client'} · People`} title="Contacts">{newContact}</BrawndoPageHeader>
      :<PageHeader title="Contacts" subtitle="Client personnel and platform access." action={canWrite&&<HeaderActions>{newContact}</HeaderActions>}/>}
    <div className="register-toolbar"><SearchField label="Search contacts" placeholder="Search contacts…" testid="contacts-search" value={query} onChange={v=>setParam('q',v)}/>
      <label className="sr-only" htmlFor="contacts-access-filter">Platform Access</label><select id="contacts-access-filter" className="contact-select" value={access} onChange={e=>setParam('access',e.target.value)}><option value="">All contacts</option><option value="none">No access</option><option value="pending">Invitation pending</option><option value="active">Active account</option><option value="disabled">Disabled</option></select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={e=>setParam('archived',e.target.checked?'true':'')}/>Include archived</label>
      {(query||access||archived)&&<Button variant="ghost" onClick={()=>{setParams({},{replace:true});table.clear();}}>Clear filters</Button>}
    </div>
    {context.status==='error'&&<p role="alert" className="px-6 py-2 text-sm text-semantic-critical">Platform access could not be verified. <button className="underline" onClick={refresh}>Retry</button></p>}
    <RegisterLoadError error={error} onRetry={refresh} name="contacts"/>
    <div className="register-table-frame overflow-x-auto" role="region" aria-label="Contacts directory" tabIndex={0}><table className="w-full"><caption className="sr-only">Client contact information and linked platform account access</caption>
      <thead><tr>{columns.map(c=><SortableHeader key={c.key} table={table} column={c}/>)}<th className="tbl-head" scope="col">Platform Access</th><th className="tbl-head" scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{initialLoading&&<TableLoadingRow colSpan={6}/>}{!initialLoading&&!error&&filtered.map(row=>{const state=directoryAccess(row,clientId,context);return <tr key={row.contact_id} className="row-hover">
        <td className="tbl-cell"><button className="register-record-link" onClick={()=>edit(row)}>{row.name||'Unnamed contact'}</button>{isArchivedContact(row)&&<span className="block text-xs text-ink-secondary">Archived</span>}</td><td className="tbl-cell">{row.title||'—'}</td><td className="tbl-cell">{row.email||'—'}</td><td className="tbl-cell">{row.phone||'—'}</td><td className="tbl-cell"><ContactAccessPill state={state}/></td>
        <td className="tbl-cell"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${row.name||'contact'}`}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={()=>edit(row)}>{canWrite?'View / Edit Contact':'View Contact'}</DropdownMenuItem>
          {canWrite&&!isArchivedContact(row)&&<DropdownMenuItem onSelect={()=>edit(row)}>{!row.linked_user_id?'Invite to Omnisciente':'Manage Access'}</DropdownMenuItem>}
          {canWrite&&<DropdownMenuItem onSelect={()=>edit(row)}>{isArchivedContact(row)?'Restore Contact':'Archive Contact'}</DropdownMenuItem>}
        </DropdownMenuContent></DropdownMenu></td></tr>;})}
        {!loading&&!error&&!filtered.length&&<tr><td className="empty-state" colSpan={6}>{rows.length?'No contacts match these filters.':'No contacts yet. Add a person to this client directory; platform access is optional.'}</td></tr>}
      </tbody></table></div>
    <ContactWorkspace open={open} onOpenChange={close} record={selected} clientId={clientId} onSaved={refresh}/>
  </>;
  return brawndo?<BrawndoSurface className="register-surface contacts-directory bcontacts">{body}</BrawndoSurface>:<div className="register-surface contacts-directory">{body}</div>;
}
