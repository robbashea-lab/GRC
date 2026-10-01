import {createContext} from 'react';
import {useOrg} from '@/context/OrgContext';
import {useBrawndoTheme,useBrawndoPortalTheme} from '@/lib/brawndoTheme';
import './BrawndoPage.css';
import './ClientSurface.css';

// Presentation only: all routes and records remain owned by their existing modules.
export const ClientPresentationContext=createContext(null);
export default function ClientSurface({children}) {
  const [theme]=useBrawndoTheme();
  const {currentClient}=useOrg();
  useBrawndoPortalTheme(true,theme);
  return <ClientPresentationContext.Provider value={currentClient?.name||'Client'}><div className="bpage client-surface" data-theme={theme}>
    {children}
  </div></ClientPresentationContext.Provider>;
}

