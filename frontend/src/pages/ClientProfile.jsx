import {useEffect,useState} from 'react';
import {Link,useSearchParams,Navigate} from 'react-router-dom';
import {useOrg} from '@/context/OrgContext';
import {useAuth} from '@/context/AuthContext';
import api,{formatError} from '@/lib/api';
import {catalog,completeness,applicabilityPrompts} from '@/lib/clientProfile';
import onboardingCatalog from '@/lib/onboardingCatalog.json';
import {FRAMEWORKS} from '@/lib/frameworks';
import Onboarding from './Onboarding';
import {UsersTable} from './PlatformAdmin';
import ComplianceProfile from '@/components/ComplianceProfile';
import PageHeader from '@/components/PageHeader';
import ProfileSection from '@/components/ProfileSection';
import ProgramConfiguration from '@/components/ProgramConfiguration';
import OnboardingHandoff from '@/components/OnboardingHandoff';
import ClientDialog from '@/components/ClientDialog';
import ClientRelationshipValue from '@/components/ClientRelationshipValue';
import {Button} from '@/components/ui/button';
const TABS=[['overview','Overview'],['organization','Organization'],['technical','Technical Environment'],['security','Security & Data'],['program','Program Configuration'],['people','People & Ownership']];
export function LegacyClientSettings(){const [params]=useSearchParams();return <Navigate replace to={'/client-profile?tab='+(params.get('tab')==='compliance'?'program':'people')}/>;}
export default function ClientProfile(){
  const {currentClientId}=useOrg();
  return <ProfileWorkspace key={currentClientId} clientId={currentClientId}/>;
}
function ProfileWorkspace({clientId}){
  const org=useOrg(),{user}=useAuth(),[params,setParams]=useSearchParams();
  const [data,setData]=useState(null),[handoff,setHandoff]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[editClient,setEditClient]=useState(false);
  const canEdit=['super_admin','platform_admin'].includes(user?.role),tab=TABS.some(([id])=>id===params.get('tab'))?params.get('tab'):'overview';
  const reload=()=>setRevision(n=>n+1);
  useEffect(()=>{if(!clientId)return;const c=new AbortController();setError('');
    Promise.all([api.get('/clients/'+clientId+'/profile',{signal:c.signal}),api.get('/onboarding/handoff',{params:{client_id:clientId},signal:c.signal})]).then(([p,h])=>{if(!c.signal.aborted){setData(p.data);setHandoff(h.data);}}).catch(e=>{if(!c.signal.aborted)setError(formatError(e));});return()=>c.abort();
  },[clientId,revision]);
  if(!clientId)return <PageHeader title="Client Profile" subtitle="Select or create a client first."/>;
  if(error)return <div className="page-content" role="alert"><p>{error}</p><Button onClick={reload}>Retry profile</Button></div>;
  if(!data||!handoff)return <div className="page-content" role="status">Loading Client Profile…</div>;
  if(!data.completed)return <><div className="page-gutter pt-4 text-sm font-medium">Client Profile · Setup Required</div><Onboarding onComplete={reload}/></>;
  const profile=data.profile||{},progress=completeness(profile),requirements=handoff.records.requirements;
  const programs=FRAMEWORKS.filter(f=>requirements.some(r=>r.baseline_key===f.key&&r.applicability==='applicable'));
  async function save(values){try{await api.patch('/clients/'+clientId+'/profile',{section:tab,values,expected_updated_at:data.updated_at??null});await org.refresh();reload();}catch(e){throw new Error(formatError(e));}}
  return <div>
    <PageHeader title="Client Profile" subtitle={org.currentClient?.name+' · Active · Organization context and current program configuration'} action={<Button variant="outline" asChild><Link to="/dashboard">Open Dashboard</Link></Button>}/>
    <div className="page-content space-y-5">
      <nav aria-label="Client Profile sections" className="flex flex-wrap gap-1 border-b border-line pb-2">{TABS.map(([id,label])=><Button key={id} variant={tab===id?'secondary':'ghost'} size="sm" aria-current={tab===id?'page':undefined} onClick={()=>setParams({tab:id})}>{label}</Button>)}</nav>
      {tab==='overview'&&<>
        <div className="grid md:grid-cols-2 gap-4">{[['Organization','organization'],['Technical Environment','technical'],['Security & Data','security']].map(([title,key])=><section key={key} className="border border-line rounded-lg p-4 space-y-2"><h2 className="font-semibold">{title}</h2>{key==='organization'&&<p className="text-sm">{org.currentClient?.name} · {org.currentClient?.industry||'Industry not provided'}</p>}<dl className="text-sm space-y-2">{catalog.sections[key].filter(f=>profile[key]?.[f.id]!=null).slice(0,6).map(f=><div key={f.id}><dt className="text-xs text-ink-secondary">{f.label}</dt><dd className="break-words">{Array.isArray(profile[key][f.id])?profile[key][f.id].join(' · '):String(profile[key][f.id])}</dd></div>)}</dl>{!Object.values(profile[key]||{}).some(v=>v!=null)&&<p className="text-sm text-ink-secondary">Optional context not yet provided.</p>}<Button size="sm" variant="ghost" onClick={()=>setParams({tab:key})}>View {title}</Button></section>)}
        <section className="border border-line rounded-lg p-4 space-y-3"><h2 className="font-semibold">Programs</h2>{programs.length?programs.map(f=><Link className="block text-sm text-link underline" key={f.key} to={'/compliance/'+f.key}>{f.name}</Link>):<p className="text-sm">No formal framework currently applies.</p>}<Button size="sm" variant="ghost" onClick={()=>setParams({tab:'program'})}>View program configuration</Button></section></div>
        <section className="border border-line rounded-lg p-4 space-y-2"><h2 className="font-semibold">Optional profile completeness · {progress.percent}%</h2><p className="text-xs text-ink-secondary">Eight recommended context fields only. Not compliance, readiness, risk, or program health. Operational work is never blocked.</p><p className="text-sm">{progress.missing.length?'Not yet provided: '+progress.missing.join(' · '):'Recommended context fields provided.'}</p><Button variant="outline" size="sm" onClick={()=>setParams({tab:'organization'})}>Complete profile</Button></section>
        <PeopleSummary client={handoff.client}/>{applicabilityPrompts(profile,requirements).map(text=><p key={text} className="text-sm border border-line rounded p-3">{text} <Link className="underline text-link" to="/client-profile?tab=program">Review configuration</Link></p>)}
      </>}
      {['organization','technical','security'].includes(tab)&&<>{tab==='organization'&&<div className="flex items-center gap-3 text-sm"><span>{org.currentClient?.name} · {org.currentClient?.industry||'Industry not provided'}</span>{canEdit&&<Button variant="outline" size="sm" onClick={()=>setEditClient(true)}>Edit client identity</Button>}</div>}<ProfileSection key={tab} section={tab} values={profile[tab]} canEdit={canEdit} onSave={save}/></>}
      {tab==='program'&&<>
        {canEdit?<ProgramConfiguration clientId={clientId} onSaved={reload}/>:<p className="text-sm text-ink-secondary">An administrator can manage program configuration. Current records are shown below.</p>}
        <OnboardingHandoff embedded snapshot={handoff} state={data.baseline?.state} catalog={onboardingCatalog} clientId={clientId} canManage={canEdit}/>
        <Baseline baseline={data.baseline}/>
        <details className="border border-line rounded-lg p-4"><summary className="text-sm cursor-pointer font-medium">All compliance & requirements</summary><ComplianceProfile key={revision} clientId={clientId}/></details>
        {requirements.some(r=>r.baseline_response==='retired')&&<section className="border border-line rounded-lg p-4 space-y-2"><h2 className="font-semibold text-sm">Retired programs</h2><p className="text-xs text-ink-secondary">Historical assessments and linked work remain in their authoritative workspaces.</p>{FRAMEWORKS.filter(f=>requirements.some(r=>r.baseline_key===f.key&&r.baseline_response==='retired')).map(f=><Link className="block text-sm underline text-link" key={f.key} to={'/compliance/'+f.key}>View retained {f.name} program</Link>)}</section>}
        {canEdit&&<Link className="inline-block text-sm underline text-link" to={'/admin/audit?client='+clientId}>View Audit History</Link>}
        <details className="border border-line rounded-lg p-4"><summary className="text-sm cursor-pointer font-medium">Recent profile & program changes</summary><p className="text-xs text-ink-secondary my-2">Latest 50 material changes, from the existing activity log.</p>{data.history.length?data.history.map((event,i)=><article className="text-sm py-3 border-t border-line" key={i}><p>{event.at} · {event.user_name||'Recorded actor'} · {event.action}</p>{event.meta?.program&&<p>{event.meta.program}: {event.meta.previous_status||'Not recorded'} → {event.meta.applicability}{event.meta.reason?' · '+event.meta.reason:''}{event.meta.effective_date?' · Effective '+event.meta.effective_date:''}</p>}{Object.entries(event.meta?.changes||{}).map(([key,v])=><p key={key}>{catalog.sections[event.meta.section]?.find(f=>f.id===key)?.label||key}: {JSON.stringify(v.before)} → {JSON.stringify(v.after)}</p>)}</article>):<p className="text-sm">No recorded profile changes yet.</p>}</details>
      </>}
      {tab==='people'&&<><PeopleSummary client={handoff.client}/><p className="text-sm text-ink-secondary">Executive Sponsor, IT Lead, Security Lead and other business responsibilities remain in Contacts & Roles. Contacts do not automatically have platform access or assignment eligibility.</p><div className="flex gap-3"><Button asChild variant="outline"><Link to="/contacts">Manage people & roles</Link></Button>{canEdit&&<Button variant="outline" onClick={()=>setEditClient(true)}>Edit client relationships</Button>}</div>{canEdit&&<details className="border border-line rounded-lg p-4"><summary className="cursor-pointer text-sm font-medium">Platform users & access</summary><UsersTable scope="client" clientId={clientId} allowedRoles={user.role==='super_admin'?['platform_admin','client_contributor','client_readonly']:['client_contributor','client_readonly']}/></details>}</>}
    </div>
    {canEdit&&<ClientDialog open={editClient} onOpenChange={setEditClient} client={org.currentClient} onCreated={()=>{org.refresh();reload();}}/>}
  </div>;
}
function PeopleSummary({client}){return <section className="border border-line rounded-lg p-4"><h2 className="font-semibold mb-3">People & Ownership</h2><div className="grid sm:grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-ink-secondary">Primary Contact</p><ClientRelationshipValue primary client={client}/></div><div><p className="text-xs text-ink-secondary">GRC Lead</p><ClientRelationshipValue client={client}/></div></div></section>;}
function Baseline({baseline}){
  if(!baseline)return <p className="text-sm">No onboarding baseline recorded.</p>;
  return <details className="border border-line rounded-lg p-4"><summary className="text-sm font-medium cursor-pointer">View onboarding baseline</summary><p className="text-sm mt-3">{baseline.legacy?('Legacy onboarding record'+(baseline.completed_at?' · Completed '+baseline.completed_at:'')+(baseline.completed_by?' · Actor '+baseline.completed_by:'')+'. Missing intake, counts and relationships are not reconstructed from current records.'):'Initial program baseline · Completed '+baseline.completed_at+' · Actor '+baseline.completed_by}</p>{!baseline.legacy&&<p className="text-sm mt-2">{baseline.policies} Policies · {baseline.reviews} Reviews · Primary Contact: {baseline.primary_contact_id||'Not designated'} · GRC Lead: {baseline.assigned_owner_id||'Unassigned'}</p>}<div className="grid md:grid-cols-2 gap-4 mt-3 text-sm">{['requirements','policies'].map(group=><section key={group}><h3 className="font-semibold">{group==='requirements'?'Compliance':'Policies'}</h3>{onboardingCatalog[group].map(item=><p key={item.key}>{item.name} — {({applies:'Applies',does_not_apply:'Does Not Apply',unsure:'Undetermined',yes:'Reported Existing',no:'Reported Missing'})[baseline.state?.[group]?.[item.key]]||'Not recorded'}</p>)}</section>)}</div></details>;
}
