import {useNavigate} from 'react-router-dom';
import PortfolioHistoryDialog from './PortfolioReports';
import {programIdentity} from '@/lib/portfolioProgress';

// The dashboard gate resolves and validates the native client/program before rendering.
export default function BrawndoDemoProgram({client, program, refreshToken}) {
  const navigate = useNavigate();
  const openStatus = status => {
    const [path, query = ''] = program.to.split('?');
    const params = new URLSearchParams(query);
    params.set('client_id', client.client_id);
    params.set('view', status);
    navigate(`${path}?${params}`);
  };
  return <PortfolioHistoryDialog inline referenceHistory client={client} programs={[program]}
    selected={programIdentity(program)} refreshToken={refreshToken}
    onNavigate={navigate} onStatusNavigate={openStatus} />;
}
