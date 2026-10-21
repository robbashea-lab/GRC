import {useId, useState} from 'react';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {PREVIEW_MODE} from '@/lib/api';
import {namedDemoClient} from '@/lib/demoClients';

// Entertainment identities belong only to the authorized fictional Demo cohort.
export function demoClientLogoSource({client, trustedDemo, workspaceMode, user, clients, loading, error}) {
  if (trustedDemo !== true || workspaceMode !== 'demo' || user?.workspace_mode !== 'demo' || !user.user_id
    || !user.role || loading || error || client?.environment !== 'Demo'
    || !clients?.some(row => row.client_id === client.client_id && row.environment === 'Demo')) return null;
  return namedDemoClient(client.client_id)?.logo || null;
}

// The caller retains its existing avatar geometry and visible accessible client name.
export default function ClientIdentityMark({client, fallback = '—'}) {
  const auth = useAuth() || {}, org = useOrg() || {};
  const gradient = useId().replace(/:/g, '');
  const [failedSource, setFailedSource] = useState(null);
  const source = demoClientLogoSource({client, trustedDemo: PREVIEW_MODE, workspaceMode: auth.workspaceMode,
    user: auth.user, clients: org.clients, loading: auth.loading || org.loading, error: auth.error || org.error});
  if (source === 'brawndo') return <svg aria-hidden="true" viewBox="0 0 40 40" style={{width:'100%',height:'100%',display:'block',borderRadius:'inherit'}}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2fbf3a"/><stop offset="1" stopColor="#0d6b1f"/></linearGradient></defs><rect width="40" height="40" rx="9" fill={`url(#${gradient})`}/><path d="M23.5 5 11 22.5h8.2L15.8 35 29 16.6h-8.4L23.5 5z" fill="#f5f50f" stroke="#0b3d12" strokeWidth="1.2" strokeLinejoin="round"/></svg>;
  if (source && source !== failedSource) return <img src={source} alt="" aria-hidden="true"
    style={{width:'100%',height:'100%',objectFit:'contain',display:'block',borderRadius:'inherit'}} onError={()=>setFailedSource(source)}/>;
  return <>{client?.name?.trim().slice(0, 1) || fallback}</>;
}
