import {Outlet, useLocation} from 'react-router-dom';
import {ComplianceProvider} from '@/context/ComplianceContext';
import {AdditionalSectionsProvider} from '@/lib/brawndoAdditionalScope';
import NativeStandardShell from './NativeStandardShell';
import AdminSurface from './AdminSurface';
import ClientSurface from './ClientSurface';
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
  const content = pathname.startsWith('/admin/') ? <AdminSurface><Outlet/></AdminSurface>
    : pathname === '/clients' ? <Outlet/> : <ClientSurface><Outlet/></ClientSurface>;
  return <AdditionalSectionsProvider><ComplianceProvider><NativeStandardShell>{content}</NativeStandardShell></ComplianceProvider></AdditionalSectionsProvider>;
}
