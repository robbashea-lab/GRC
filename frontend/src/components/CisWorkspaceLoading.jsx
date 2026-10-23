import {useLocation} from 'react-router-dom';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {PREVIEW_MODE} from '@/lib/api';
import {selectedClient} from '@/lib/clientSelection';
import {cisClientProgram,cisExperienceEligible,CIS_FRAMEWORK} from '@/lib/cisExperience';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import {BRAWNDO_CIS_VISUAL_ENABLED} from '@/lib/brawndoCisVisual';

export function useCisLoadingProgram(frameworkKey,clientId){
  const auth=useAuth(),org=useOrg()||{},location=useLocation();
  if(!BRAWNDO_CIS_VISUAL_ENABLED||frameworkKey!==CIS_FRAMEWORK||clientId!==org.currentClientId||location.pathname!=='/compliance/cis-ig1'
    ||(auth.workspaceMode==='demo'?PREVIEW_MODE!==true:PREVIEW_MODE!==false)
    ||!cisExperienceEligible({...org,...auth,authLoading:auth.loading,authError:auth.error,
      orgLoading:org.loading,orgError:org.error,selectedClientId:selectedClient(),
      routeClientId:new URLSearchParams(location.search).get('client_id')}))return null;
  return cisClientProgram(org.currentClient);
}

// Enrollment can name the loading shell; only the existing loaded-data gate may expose assessments or actions.
export default function CisWorkspaceLoading({program}){
  const [theme]=useBrawndoTheme();
  return <section className="bcis brawndo-cis-visual" data-theme={theme} data-testid="cis-workspace-loading" aria-busy="true">
    <header className="page-head"><div><h1>CIS IG{program.implementationGroup}</h1>
      <p>CIS Controls v{program.version} · Implementation Group {program.implementationGroup}</p></div></header>
    <p role="status" className="text-sm text-ink-secondary">Loading program workspace…</p>
  </section>;
}
