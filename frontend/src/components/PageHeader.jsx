import {useContext} from 'react';
import {ClientPresentationContext} from './ClientSurface';
import {BrawndoPageHeader} from './BrawndoPage';

export default function PageHeader({ title, subtitle, action, eyebrow }) {
  const clientName=useContext(ClientPresentationContext);
  if(clientName)return <BrawndoPageHeader title={title} subtitle={subtitle} eyebrow={eyebrow||clientName}>{action}</BrawndoPageHeader>;
  return (
    <div className="page-header">
      <div className="page-header-content">
        <div className="page-header-copy">
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
