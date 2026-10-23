import {useNavigate} from 'react-router-dom';
import PortfolioHistoryDialog from './PortfolioReports';
import {programIdentity} from '@/lib/portfolioProgress';
import CisDomainProfile from './CisDomainProfile';
import CisDashboardRiskMatrix from './CisDashboardRiskMatrix';
import {cisClientProgram} from '@/lib/cisExperience';

// The dashboard gate resolves and validates the native client/program before rendering.
export default function BrawndoDemoProgram({client, program, refreshToken, cisDashboardProfile=false, domainSource, contextKey}) {
  const navigate = useNavigate();
  const openStatus = status => {
    const [path, query = ''] = program.to.split('?');
    const params = new URLSearchParams(query);
    params.set('client_id', client.client_id);
    params.set('view', status);
    navigate(`${path}?${params}`);
  };
  return <PortfolioHistoryDialog inline referenceHistory demoScenario client={client} programs={[program]}
    selected={programIdentity(program)} refreshToken={refreshToken}
    cisDashboardProfile={cisDashboardProfile} profileContent={cisDashboardProfile?<div className="cis-dashboard-profile-row">
      <CisDomainProfile source={domainSource} clientId={client.client_id} implementationGroup={cisClientProgram(client)?.implementationGroup}/>
      <CisDashboardRiskMatrix clientId={client.client_id} contextKey={contextKey} refreshToken={refreshToken}/>
    </div>:null}
    onNavigate={navigate} onStatusNavigate={openStatus} />;
}
