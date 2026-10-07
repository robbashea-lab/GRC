import {BrawndoSurface} from './BrawndoPage';
import {ClientPresentationContext} from './ClientSurface';
import './ClientSurface.css';

export default function AdminSurface({children}) {
  return <ClientPresentationContext.Provider value="Administration">
    <BrawndoSurface className="client-surface admin-surface">{children}</BrawndoSurface>
  </ClientPresentationContext.Provider>;
}
