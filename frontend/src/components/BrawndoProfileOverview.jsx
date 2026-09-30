import {Link} from 'react-router-dom';
import {Moon,Sun} from 'lucide-react';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {catalog} from '@/lib/clientProfile';
import {primaryContact,grcLead} from '@/lib/clientRelationships';
import './BrawndoProfile.css';

// Brawndo Client Profile: identity and key figures first, people next, then each section as label/value rows.
const HANDLING=['collects','stores','processes','transmits','hosts','admin_access','develops'];
const SHORT={collects:'Collects',stores:'Stores',processes:'Processes',transmits:'Transmits',hosts:'Hosts customer workloads',admin_access:'Admin access to customer systems',develops:'Develops with customer data'};
const label=(section,id)=>catalog.sections[section]?.find(f=>f.id===id)?.label||id;
export const listOf=v=>v==null||v===''?[]:Array.isArray(v)?v:String(v).split(/\s*;\s*/).filter(Boolean);
const present=v=>listOf(v).length>0;
const initials=name=>String(name||'').replace(/[^A-Za-z ]/g,'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'•';

export function BrawndoProfileHeader({tabs,tab,onTab}){
  const [theme,setTheme]=useBrawndoTheme();
  return <><header className="bprof-head">
    <div><p className="bprof-eyebrow">Organization context</p><h1>Client Profile</h1></div>
    <div className="bprof-actions">
      <button type="button" className="bprof-btn" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>
      <Link className="bprof-btn" to="/dashboard">Open dashboard</Link>
    </div>
  </header>
  <nav aria-label="Client Profile sections" className="bprof-tabs">{tabs.map(([id,text])=><button key={id} type="button" aria-current={tab===id?'page':undefined} onClick={()=>onTab(id)}>{text}</button>)}</nav></>;
}
function Tags({value}){return <span className="bprof-tags">{listOf(value).map(v=><span key={v} className="bprof-tag">{v}</span>)}</span>;}
function Row({name,children}){return <div className="bprof-row"><dt>{name}</dt><dd>{children}</dd></div>;}
function Card({title,link,onLink,children}){return <section className="bprof-card" aria-label={title}><div className="bprof-card-head"><h2>{title}</h2>{link&&<button type="button" className="bprof-link" onClick={onLink}>{link} ›</button>}</div>{children}</section>;}
// Same relationship resolution as the rest of the app (names, retained-but-unavailable notices).
function Person({role,value}){
  const known=!['Unassigned','Not designated'].includes(value.name);
  return <div className="bprof-person"><span className="bprof-avatar" aria-hidden="true">{known?initials(value.name):'—'}</span><div className="min-w-0"><p className="bprof-kicker">{role}</p><p className="bprof-person-name">{value.name}</p>{value.detail&&<p className="bprof-muted">{value.detail}</p>}{value.notice&&<p className="bprof-muted">{value.notice}</p>}</div></div>;
}
export default function BrawndoProfileOverview({client,relationships,profile,programs,onTab,extra}){
  const o=profile.organization||{},t=profile.technical||{},s=profile.security||{};
  const units=listOf(o.business_units),facts=[[o.employees,'Employees'],[o.technology_users,'Technology users'],[units.length||null,'Business units'],[programs.length,programs.length===1?'Active program':'Active programs']].filter(([v])=>v!=null&&v!=='');
  const orgRows=[['legal_name'],['domain'],['organization_type'],['business_units',true],['country'],['locations'],['workforce']].filter(([id])=>present(o[id]));
  const techRows=['security_technology','identity','productivity','cloud','infrastructure','endpoints','network','operating_environment'].filter(id=>present(t[id]));
  const handling=HANDLING.filter(id=>present(s[id]));
  return <>
    <section className="bprof-card bprof-identity" aria-label="Organization summary">
      <div className="bprof-who"><span className="bprof-mark" aria-hidden="true">{client?.name?.[0]||'•'}</span><div className="min-w-0"><p className="bprof-name">{client?.name}</p><p className="bprof-muted">{[client?.industry||'Industry not provided',o.organization_type,o.domain].filter(Boolean).join(' · ')}</p></div></div>
      {facts.length>0&&<dl className="bprof-facts">{facts.map(([v,l])=><div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl>}
    </section>
    <section className="bprof-card bprof-people" aria-label="People and ownership"><Person role="Primary contact" value={primaryContact(relationships)}/><Person role="GRC lead" value={grcLead(relationships)}/></section>
    <div className="bprof-grid">
      <div className="bprof-col">
        <Card title="Organization" link="View details" onLink={()=>onTab('organization')}>{orgRows.length?<dl>{orgRows.map(([id,tags])=><Row key={id} name={label('organization',id)}>{tags?<Tags value={o[id]}/>:String(o[id])}</Row>)}{present(o.employees)&&<Row name="Employees">{o.employees}{present(o.technology_users)?` · ${o.technology_users} use computers or technology`:''}</Row>}</dl>:<p className="bprof-empty">Optional context not yet provided.</p>}</Card>
        <Card title="Programs" link="Program configuration" onLink={()=>onTab('program')}>{programs.length?programs.map(f=><div key={f.key} className="bprof-program"><div><p className="bprof-person-name">{f.name}</p><p className="bprof-muted">Active</p></div><Link className="bprof-link" to={'/compliance/'+f.key}>Open workspace ›</Link></div>):<p className="bprof-empty">No formal framework currently applies.</p>}</Card>
      </div>
      <div className="bprof-col">
        <Card title="Technical environment" link="View details" onLink={()=>onTab('technical')}>{techRows.length?<dl>{techRows.map(id=><Row key={id} name={label('technical',id)}>{listOf(t[id]).length>1?<Tags value={t[id]}/>:listOf(t[id]).join('')}</Row>)}</dl>:<p className="bprof-empty">Optional context not yet provided.</p>}</Card>
        <Card title="Security & data" link="View details" onLink={()=>onTab('security')}>
          {present(s.data_types)&&<dl><Row name={label('security','data_types')}><Tags value={s.data_types}/></Row></dl>}
          {handling.length>0&&<><p className="bprof-sub">Customer data handling</p><dl className="bprof-yn">{handling.map(id=><div key={id}><dt>{SHORT[id]}</dt><dd>{String(s[id])}</dd></div>)}</dl></>}
          {!present(s.data_types)&&!handling.length&&<p className="bprof-empty">Optional context not yet provided.</p>}
        </Card>
      </div>
    </div>
    {extra}
  </>;
}
