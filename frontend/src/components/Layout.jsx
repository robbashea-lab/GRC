import {Outlet, useLocation} from 'react-router-dom';
import {ComplianceProvider} from '@/context/ComplianceContext';
import {AdditionalSectionsProvider} from '@/lib/brawndoAdditionalScope';
import NativeStandardShell from './NativeStandardShell';
import AdminSurface from './AdminSurface';
import ClientSurface from './ClientSurface';
import {useAuth} from '@/context/AuthContext';
import {useOrg} from '@/context/OrgContext';
import {ClientWorkspaceAvailability} from '@/lib/useSurfaceRef';
import './BrawndoPortalTheme.css';
import './BrawndoWorkspace.css';
import './SixSurfaceAppearance.css';
import './AdditionalSectionsAppearance.css';
import './CisWorkspaceSizing.css';
import './CisRegisterSizing.css';
import './NativeStandard.css';

// The protected shell changes presentation; native contexts and commands retain
// enrollment, record identity, authorization and save behavior.
export default function Layout() {
  const {pathname} = useLocation();
  const org=useOrg(),auth=useAuth();
  const clientRoute=pathname!=='/clients'&&!pathname.startsWith('/clients/')&&pathname!=='/account'
    &&pathname!=='/admin'&&!pathname.startsWith('/admin/')&&!pathname.startsWith('/platform');
  const unavailable=clientRoute&&!!(org.loading||org.error||auth.loading||auth.error
    ||org.currentClientId&&org.currentClient?.client_id!==org.currentClientId);
  const refreshing=unavailable&&org.loading&&!org.error&&!auth.error;
  const block=unavailable?event=>{event.preventDefault();event.stopPropagation();}:undefined;
  const content = pathname.startsWith('/admin/') ? <AdminSurface><Outlet/></AdminSurface>
    : pathname === '/clients' ? <Outlet/> : <ClientSurface><Outlet/></ClientSurface>;
  return <AdditionalSectionsProvider><ComplianceProvider><NativeStandardShell>
    {unavailable&&<p className="section-body" role={refreshing?'status':'alert'}>{refreshing?'Refreshing client workspace…':'The client workspace is unavailable. Resolve the current client read before editing.'}</p>}
    <ClientWorkspaceAvailability.Provider value={!unavailable}>
      <div data-client-workspace-body hidden={unavailable} inert={unavailable}
        onClickCapture={block} onSubmitCapture={block} onKeyDownCapture={block} onPointerDownCapture={block}
        onInputCapture={block} onChangeCapture={block}>{content}</div>
    </ClientWorkspaceAvailability.Provider>
  </NativeStandardShell></ComplianceProvider></AdditionalSectionsProvider>;
}
