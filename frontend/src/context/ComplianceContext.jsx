import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import api, { formatError } from '@/lib/api';
import { complianceNavigation } from '@/lib/complianceNavigation';

const ComplianceContext = createContext({ items: [], loading: false, error: '' });
export function ComplianceProvider({ children }) {
  const { currentClientId } = useOrg();
  const { pathname } = useLocation();
  const [result, setResult] = useState(null);
  const platform = ['/clients', '/admin', '/platform'].some(path => pathname.startsWith(path));
  useEffect(() => {
    let cancelled = false;
    if (!currentClientId || platform) return;
    Promise.all([
      api.get('/onboarding/baseline', { params: { client_id: currentClientId } }),
      api.get('/requirements', { params: { client_id: currentClientId } }),
    ]).then(([baseline, requirements]) => {
      if (!cancelled) setResult({ clientId: currentClientId, pathname, items: complianceNavigation(currentClientId, baseline.data.state, requirements.data), error: '' });
    }).catch(error => {
      if (!cancelled) setResult({ clientId: currentClientId, pathname, items: [], error: formatError(error) });
    });
    return () => { cancelled = true; };
  }, [currentClientId, pathname, platform]);
  const ready = result?.clientId === currentClientId && result?.pathname === pathname;
  const value = !currentClientId || platform ? { items: [], loading: false, error: '' }
    : { items: result?.clientId === currentClientId ? result.items : [], loading: !ready, error: ready ? result.error : '' };
  return <ComplianceContext.Provider value={value}>{children}</ComplianceContext.Provider>;
}
export const useCompliance = () => useContext(ComplianceContext);
