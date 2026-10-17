import {ChevronRight,Sun} from 'lucide-react';
import {SearchField} from './Register';
import {ColumnControl} from './TableControls';
import {Button} from './ui/button';
import {directoryAccess,isArchivedContact} from '@/lib/contactDirectory';
import {additionalDirectoryRows,additionalContactRelationships} from '@/lib/additionalContactsPresentation';
import {profileInitials} from '@/lib/additionalProfilePresentation';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import RegisterLoadError from './RegisterLoadError';
import './BrawndoAdditionalContacts.css';

export default function BrawndoAdditionalContacts({client,clientId,rows,filtered,query,access,archived,context,table,onParam,onClear,onOpen,newContact,error,onRetry}) {
  const [theme,setTheme]=useBrawndoTheme();
  const options={archived,clientId,context},eligible=additionalDirectoryRows(rows,options);
  const accessReady=context.status==='ready'&&context.clientId===clientId;
  const counts=Object.fromEntries(['','platform','none'].map(value=>[value,value&&!accessReady?'—':additionalDirectoryRows(rows,{...options,access:value}).length]));
  const facets=[['','All contacts'],['platform','Platform access'],['none','Contact only']];
  const countAccess=key=>accessReady?eligible.filter(row=>directoryAccess(row,clientId,context).key===key).length:'—';
  return <div className="brawndo-additional bac-page" data-theme={theme}>
    <header className="ba-page-head"><div><h1>{client?.name||'Client'} Contacts</h1><p>People · {eligible.length} {eligible.length===1?'contact':'contacts'}</p></div><div className="bac-head-actions"><Button type="button" variant="outline" className="bac-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label={`Switch to ${theme==='dark'?'light':'dark'} mode`}><Sun size={15} aria-hidden="true"/>{theme==='dark'?'Light':'Dark'}</Button>{newContact}</div></header>
    <section className="bac-card" aria-labelledby="bac-heading"><h2 id="bac-heading" className="sr-only" tabIndex={-1}>Contacts</h2>
      <div className="bac-filters"><SearchField label="Search contacts" placeholder="Search contacts…" testid="contacts-search" value={query} onChange={value=>onParam('q',value)}/>
        <div className="bac-segments" role="group" aria-label="Contact views">{facets.map(([value,label])=><button type="button" key={value} aria-pressed={access===value} onClick={()=>onParam('access',value)} title={value==='platform'?'Active account or invitation pending':undefined}>{label}<span>{counts[value]}</span></button>)}</div>
        <div className="bac-filter-right"><label className="bac-archive"><input type="checkbox" checked={archived} onChange={event=>onParam('archived',event.target.checked?'true':'')}/>Include archived</label><label className="sr-only" htmlFor="contacts-access-filter">Platform Access</label><select id="contacts-access-filter" value={access} onChange={event=>onParam('access',event.target.value)}><option value="">All access states</option><option value="platform">Platform access</option><option value="none">No access</option><option value="pending">Invitation pending</option><option value="active">Active account</option><option value="disabled">Disabled</option></select></div>
        {(query||access||archived)&&<Button variant="ghost" onClick={onClear}>Clear filters</Button>}
      </div>
      {context.status==='error'&&<p role="alert" className="bac-alert">Platform access could not be verified. <button type="button" className="bac-link" onClick={onRetry}>Retry</button></p>}
      <RegisterLoadError error={error} onRetry={onRetry} name="contacts"/>
      <div className="bac-register" role="table" aria-label="Contacts directory"><div className="bac-row bac-table-head" role="row"><span role="columnheader"><ColumnControl table={table} columnKey="name"/></span><span role="columnheader"><ColumnControl table={table} column={{key:'title',label:'Role'}}/></span><span role="columnheader">Owns</span><span role="columnheader">Platform access</span><span role="columnheader"><span className="sr-only">Open contact</span></span></div>
        {!error&&filtered.map(row=>{const state=directoryAccess(row,clientId,context),relationships=additionalContactRelationships(row,clientId,client),primary=relationships.includes('Primary contact');return <div key={row.contact_id} className={`bac-row${isArchivedContact(row)?' bac-archived':''}`} role="row">
          <div className="bac-who" role="cell"><span className="bac-avatar" aria-hidden="true">{profileInitials(row.name)}</span><div><button type="button" className="bac-name" onClick={()=>onOpen(row)}>{row.name||'Unnamed contact'}</button>{primary&&<span className="bac-tag">Primary</span>}<p className="bac-meta">{row.email||'Email not provided'}</p>{isArchivedContact(row)&&<p className="bac-meta">Archived contact</p>}</div></div>
          <div className="bac-role" role="cell">{row.title||'Title not provided'}</div>
          <div className="bac-owns" role="cell">{relationships.length?relationships.map(label=><span className="bac-own" key={label}>{label}</span>):<span className="bac-none">Not summarized</span>}</div>
          <div className="bac-access-cell" role="cell"><span className={`bac-access bac-access-${state.key}`} title={state.description}><i aria-hidden="true"/>{state.label}</span></div>
          <div className="bac-open" role="cell"><button type="button" onClick={()=>onOpen(row)} aria-label={`Open ${row.name||'contact'}`}><ChevronRight size={14} aria-hidden="true"/></button></div>
        </div>;})}
        {!error&&!filtered.length&&<p className="bac-empty">{rows.length?'No contacts match these filters.':'No contacts yet. Add a person to this client directory; platform access is optional.'}</p>}
      </div>
      <footer className="bac-summary"><span>{filtered.length} of {eligible.length} {eligible.length===1?'contact':'contacts'} · {countAccess('active')} active · {countAccess('pending')} pending · {countAccess('disabled')} disabled</span><span>Ownership totals are unavailable in this directory.</span></footer>
    </section>
  </div>;
}
