import {useEffect,useRef,useState} from 'react';
import { useLocation,useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useCompliance } from '@/context/ComplianceContext';
import { COMPLIANCE_SECTIONS } from '@/lib/complianceNavigation';
import PageHeader from '@/components/PageHeader';
import FrameworkWorkspace from './FrameworkWorkspace';
import { useAuth } from '@/context/AuthContext';
import { isWorkspacePresentation } from '@/lib/reference';
import CisWorkspaceLoading,{useCisLoadingProgram} from '@/components/CisWorkspaceLoading';
import {frameworkContextIdentity,frameworkContextRequest,frameworkContextScope,useFrameworkContextIntent} from '@/lib/frameworkContextIntent';
import {formatError} from '@/lib/api';
import {canOperate} from '@/lib/permissions';

function AssessmentContextRetry({command,onRecovered}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  async function retry(){
    setBusy(true);setError('');
    try{
      await command.retry();
      if(live.current)await onRecovered();
    }catch(error){if(live.current)setError(formatError(error));}
    finally{if(live.current)setBusy(false);}
  }
  return <section className="panel space-y-3" aria-label="Unconfirmed assessment save">
    <p>The original assessment and shared-context save needs confirmation. Ordinary client records remain unavailable until recovery finishes.</p>
    {error&&<p role="alert">{error}</p>}
    <button className="cta" type="button" disabled={busy} onClick={retry}>Retry unconfirmed assessment save</button>
  </section>;
}

// Scope the retry controller without remounting the normal assessment workspace.
function AssessmentContextRecovery({enabled,identity,recoveryKey,onRecovered,children}){
  const command=useFrameworkContextIntent(identity);
  if(!enabled||!frameworkContextRequest(command.pendingRequest(),identity))return children;
  return <AssessmentContextRetry key={recoveryKey} command={command} onRecovered={onRecovered}/>;
}

export default function ComplianceWorkspace() {
  const { requirementKey } = useParams();
  const org=useOrg(),{ currentClientId,recoveryClientId }=org;
  const compliance=useCompliance(),{ items, loading, error }=compliance;
  const auth=useAuth(),{ user,workspaceMode }=auth;
  const location=useLocation(),params=new URLSearchParams(location.search);
  const recoveryIdentity={mode:workspaceMode,actorId:user?.user_id,clientId:currentClientId||recoveryClientId,
    frameworkKey:requirementKey,assessmentId:params.get('assessment')};
  const canRecover=!auth.loading&&!org.loading&&user?.status==='active'
    &&canOperate(user)&&frameworkContextIdentity(recoveryIdentity)
    &&COMPLIANCE_SECTIONS.some(section=>section.key===requirementKey&&section.implemented)
    &&(!params.get('client_id')||params.get('client_id')===recoveryIdentity.clientId);
  const loadingProgram=useCisLoadingProgram(requirementKey,currentClientId);
  const section = items.find(item => item.key === requirementKey)||COMPLIANCE_SECTIONS.find(item => item.key === requirementKey);
  // Loaded SOC and ISO workspaces provide one scoped header, including native empty/error states.
  const ownHeader = requirementKey === 'cis-ig1' && isWorkspacePresentation(currentClientId, user) && !error && (!loading||!!loadingProgram)
    || ['soc-2','iso-27001'].includes(requirementKey) && !!currentClientId && !loading && !error && section?.implemented;
  const enabled = items.some(item => item.key === requirementKey);
  // The sidebar names the client; the subtitle names the framework version the workspace carries.
  const edition = section && (section.version && !section.name.includes(section.version) ? `${section.name} · ${section.version}` : section.name);
  const subtitle = !currentClientId ? 'Select a client organization from the sidebar first.'
    : !section ? undefined : section.implemented ? `Assessment workspace · ${edition}` : `${edition} · Applicability only; no assessment catalog`;
  const content=<div>
    {!ownHeader && <PageHeader title={section?.label || 'Requirement unavailable'} subtitle={subtitle} />}
    <div className="section-body">
      {loading ? loadingProgram ? <CisWorkspaceLoading program={loadingProgram}/> : <p role="status" className="text-sm text-ink-muted">Loading client requirement…</p>
        : error ? <p role="alert" className="text-sm text-ink-muted">Unable to load this client requirement. {error}</p>
        : section?.implemented ? <FrameworkWorkspace key={currentClientId+':'+requirementKey} frameworkKey={requirementKey} clientId={currentClientId}/>
        : <div className="bg-surface-card border border-line rounded-lg p-4 text-sm text-ink-muted">
          {enabled ? 'Program selected for this client. Detailed requirement assessment and mapping have not yet been configured in Omnisciente.' : 'This requirement is not enabled in this client’s completed onboarding.'}
        </div>}
    </div>
  </div>;
  // Only this URL's retained command can bypass a failed-closed read, and only to retry it.
  return <AssessmentContextRecovery enabled={canRecover} recoveryKey={frameworkContextScope(recoveryIdentity)+':'+user?.role}
    identity={recoveryIdentity} onRecovered={async()=>{compliance.refresh?.();await org.refresh?.();}}>{content}</AssessmentContextRecovery>;
}
