import {useLayoutEffect} from 'react';
import {BrawndoSurface} from './BrawndoPage';
import {ClientPresentationContext} from './ClientSurface';
import './ClientSurface.css';
import './AdminSurface.css';

export default function AdminSurface({children}) {
  // Native dialogs portal outside this surface; publish presentation only while it is mounted.
  useLayoutEffect(() => {
    document.documentElement.dataset.adminPresentation = 'true';
    return () => { delete document.documentElement.dataset.adminPresentation; };
  }, []);
  return <ClientPresentationContext.Provider value="Administration">
    <BrawndoSurface className="client-surface admin-surface">{children}</BrawndoSurface>
  </ClientPresentationContext.Provider>;
}
