import {Link} from 'react-router-dom';
import {clientDestination} from '@/lib/clientSelection';
import {catalog} from '@/lib/clientProfile';
import ProfileSection from './ProfileSection';

const frameworkContext = {
  'soc-2':'Services, system boundaries and components covered by the examination.',
  'iso-27001':'ISMS boundaries, interfaces and dependencies.',
  hipaa:'The ePHI the organization creates, receives, maintains or transmits.',
  cmmc:'The assessment boundary, assets and service providers relevant to the enrolled level.',
  'nist-csf-2':'The organization, systems or services covered by the Organizational Profile.'
};
export const scopedProgramKeys=new Set(Object.keys(frameworkContext));

export default function ProfileScope({clientId,clientName,programs,profile,confirmation,canEdit,onSave,onTab}) {
  const values=profile.scope||{};
  const heading=<div className="flex-1"><h2 className="panel-title">Scope</h2><p className="panel-desc">What {clientName||'this client'}’s program covers. Recorded context, not an assessment or a scoping determination.</p></div>;
  const display=<>
    <div className="scope-ctxs"><span className="occ-l">Framework context</span>{programs.map(program=><div className="scope-ctx" key={program.key}><span className="ref-chip">{program.name}</span><span>{frameworkContext[program.key]}</span></div>)}</div>
    <dl className="kv pf-kv">{catalog.sections.scope.map(field=><div className="contents" key={field.id}><dt>{field.label}</dt><dd className="whitespace-pre-line">{values[field.id]||<span className="np">Not recorded</span>}</dd></div>)}
      <dt>Last confirmed</dt><dd>{confirmation?.at?<>{confirmation.at.slice(0,10)}{confirmation.by&&' · '+confirmation.by}</>:<span className="np">Not confirmed</span>}</dd>
    </dl>
    <div className="scope-rel"><span className="occ-l">Related records</span><div className="scope-links"><button type="button" className="link-btn" onClick={()=>onTab('organization')}>Locations in profile: {profile.organization?.locations??'not provided'}</button><Link className="link-btn" to={clientDestination(clientId,'/vendors')}>Service providers in Vendors</Link><button className="link-btn" type="button" onClick={()=>onTab('services')}>Service areas iVenture runs</button></div></div>
  </>;
  return <ProfileSection section="scope" canEdit={canEdit} values={values} onSave={onSave} readView={display} heading={heading} editLabel={confirmation?.at||Object.values(values).some(Boolean)?'Edit scope':'Record scope'} saveLabel="Save scope"/>;
}
