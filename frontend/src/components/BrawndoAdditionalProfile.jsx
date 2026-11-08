import {Link} from 'react-router-dom';
import {catalog,completeness} from '@/lib/clientProfile';
import {primaryContact,grcLead} from '@/lib/clientRelationships';
import {handlingFields,profileInitials,profileList,profileMaturity,profileRenewalRelative,profileValue} from '@/lib/additionalProfilePresentation';
import {formatHistory} from './RegisterCells';
import './BrawndoAdditionalProfile.css';

function Card({title,tab,onTab,children}) {
  return <section className="baprof-card"><div className="baprof-card-head"><h2>{title}</h2>{tab&&<button type="button" className="baprof-link" onClick={()=>onTab(tab)}>View details ›</button>}</div>{children}</section>;
}
function Values({section,values={},fields=catalog.sections[section]}) {
  return <dl className="baprof-values">{fields.map(field=>{
    const value=values[field.id],missing=profileValue(value)==='Not provided',chips=field.type==='multi'||field.id==='business_units';
    const renewal=field.id==='insurance_renewal'?formatHistory(value):null;
    return <div key={field.id}><dt>{field.label}</dt><dd className={missing?'baprof-missing':undefined}>{renewal?<>{renewal}<small className="baprof-date-relative"> · {profileRenewalRelative(value)}</small></>:!missing&&chips?<span className="baprof-chips">{profileList(value).map(item=><span className="baprof-chip" key={item}>{item}</span>)}</span>:profileValue(value)}</dd></div>;
  })}</dl>;
}
function Person({role,person}) {
  return <div className="baprof-person"><span className="baprof-avatar" aria-hidden="true">{profileInitials(person.name)}</span><small>{role}</small><b>{person.name}</b><span title={[person.detail,person.notice].filter(Boolean).join(' · ')}>{[person.detail,person.notice].filter(Boolean).join(' · ')||'Not recorded'}</span></div>;
}
export function AdditionalProfileIdentity({client,relationships,profile,programs,onTab}) {
  const progress=completeness(profile),o=profile.organization||{};
  const facts=[['Employees',o.employees],['Technology users',o.technology_users],['Business units',o.business_units==null||o.business_units===''?null:profileList(o.business_units).length],['Locations',o.locations],['Active programs',programs.length]];
  return <section className="baprof-card baprof-identity" aria-label="Organization summary">
    <div className="baprof-ident"><span className="baprof-logo" aria-hidden="true">{profileInitials(client?.name)}</span><div><h2>{client?.name}</h2><p>{[client?.industry||'Industry not provided',o.organization_type,o.domain].filter(Boolean).join(' · ')}</p></div>
      <div className="baprof-complete"><span><b>{progress.percent}%</b> optional context complete</span><span className="baprof-completeness-bar" role="img" aria-label={`${progress.percent}% of eight recommended context fields provided`}><i style={{width:`${progress.percent}%`}}/></span><span title={progress.missing.join(', ')}>{progress.missing.length?`${progress.missing.length} recommended fields not provided`:'Eight recommended fields provided'}</span>{!!progress.missing.length&&<button type="button" className="baprof-link" onClick={()=>onTab('organization')}>Fill in</button>}</div>
    </div>
    <dl className="baprof-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value==null||value===''?'—':String(value)}</dd></div>)}</dl>
    <div className="baprof-people"><Person role="Primary contact" person={primaryContact(relationships)}/><Person role="GRC lead" person={grcLead(relationships)}/></div>
  </section>;
}
export function AdditionalProfileTabs({tabs,tab,onTab}) {
  return <nav className="baprof-tabs" aria-label="Client Profile sections">{tabs.map(([id,label])=><button type="button" key={id} aria-current={tab===id?'page':undefined} onClick={()=>onTab(id)}>{label}</button>)}</nav>;
}
export function AdditionalProfileMaturity({security,full=false}) {
  const {rows,counts}=profileMaturity(security),classes={'Implemented':'implemented','Partial':'partial','Not Implemented':'not-implemented','Not Applicable':'not-applicable','Unknown':'unknown'};
  const ordered=[...rows].sort((a,b)=>Object.keys(classes).indexOf(a.value)-Object.keys(classes).indexOf(b.value));
  return <><div className="baprof-maturity-bar" role="img" aria-label={Object.entries(counts).map(([label,count])=>`${count} ${label.toLowerCase()}`).join(', ')}>{ordered.map(row=><i key={row.id} className={classes[row.value]||'unknown'} title={`${row.label} · ${row.value}`}/>)}</div>
    <div className="baprof-legend">{Object.entries(counts).filter(([,count])=>count>0).map(([label,count])=><span key={label}><i className={classes[label]}/>{label} {count}</span>)}</div>
    <div className="baprof-maturity">{(full?rows:rows.filter(row=>row.value==='Partial')).map(row=><span key={row.id}>{row.label}<em className={classes[row.value]||'unknown'}>{row.value}</em></span>)}</div>
    <p className="baprof-note">{!full&&'Partial areas shown. '}Self-reported program areas, not a control assessment.</p></>;
}
export function AdditionalProfileReadSection({section,values={}}) {
  if(section==='security')return <div className="baprof-grid"><Card title="Data handled"><Values section="security" values={values} fields={catalog.sections.security.filter(field=>field.id==='data_types')}/><dl className="baprof-handling">{handlingFields.map(field=><div key={field.id}><dt>{field.label}</dt><dd data-answer={values[field.id]}>{profileValue(values[field.id])}</dd></div>)}</dl></Card><Card title="Program areas · self-reported"><AdditionalProfileMaturity security={values} full/></Card></div>;
  return <Card title={section==='organization'?'Organization':'Technical environment'}><Values section={section} values={values}/>{section==='technical'&&<p className="baprof-note">Systems &amp; Scope owns scoped systems; Vendors owns third-party records. These selections do not create either.</p>}</Card>;
}
export function AdditionalProfileOverview({profile,programs,requirements,onTab,extra}) {
  const selected=(section,ids)=>catalog.sections[section].filter(field=>ids.includes(field.id));
  const notApplicable=requirements.filter(row=>row.applicability==='not_applicable').length;
  return <><div className="baprof-grid">
    <Card title="Organization" tab="organization" onTab={onTab}><Values section="organization" values={profile.organization} fields={selected('organization',['legal_name','organization_type','business_units','locations','country','workforce','insurance_renewal'])}/></Card>
    <Card title="Technical environment" tab="technical" onTab={onTab}><Values section="technical" values={profile.technical} fields={selected('technical',['identity','productivity','cloud','endpoints','security_technology'])}/></Card>
    <Card title="Program areas · self-reported" tab="security" onTab={onTab}><AdditionalProfileMaturity security={profile.security}/></Card>
    <Card title="Programs" tab="program" onTab={onTab}><dl className="baprof-values">{programs.map(program=><div key={program.key}><dt><Link to={'/compliance/'+program.key}>{program.name}</Link></dt><dd>Applies · active</dd></div>)}</dl>{!programs.length&&<p className="baprof-note">No formal framework currently applies.</p>}{notApplicable>0&&<p className="baprof-note">{notApplicable} {notApplicable===1?'framework marked':'frameworks marked'} Does not apply.</p>}</Card>
  </div>{extra}</>;
}
export function AdditionalProfilePeople({client}) {
  const people=[['Primary contact',primaryContact(client),client?.primary_contact_id?'/contacts?open='+encodeURIComponent(client.primary_contact_id):'/contacts'],['GRC lead',grcLead(client),null]];
  return <section className="baprof-card baprof-people-register"><div className="baprof-card-head"><h2>People &amp; Ownership</h2><Link className="baprof-link" to="/contacts">View contacts ›</Link></div><div role="table" aria-label="Current client relationships"><div role="row" className="baprof-person-row baprof-person-head"><span role="columnheader">Person</span><span role="columnheader">Relationship</span><span role="columnheader">Contact / account context</span><span role="columnheader">Record</span></div>{people.map(([role,person,to])=><div role="row" className="baprof-person-row" key={role}><div role="cell" className="baprof-person-name"><span className="baprof-avatar" aria-hidden="true">{profileInitials(person.name)}</span><b>{person.name}</b></div><span role="cell">{role}</span><span role="cell">{[person.detail,person.notice].filter(Boolean).join(' · ')||'Not recorded'}</span><span role="cell">{to?<Link className="baprof-link" to={to}>Open Contact ›</Link>:'Managed in client relationships'}</span></div>)}</div></section>;
}
