import {useOrg} from '@/context/OrgContext';
import ClientIdentityMark from './ClientIdentityMark';
import './V3WorkspaceHeading.css';

export default function V3WorkspaceHeading({clientName, clientRecord, eyebrow, title, subtitle, beforeTitle, focusHeading = false, children, className = '', actionsClass = ''}) {
  const org = useOrg();
  const client = clientRecord || org?.currentClient;
  const name = client?.name || clientName || 'Client';
  return <header className={'dash-head v3-workspace-head ' + className}>
    <span className="v3-client-mark" aria-hidden="true"><ClientIdentityMark client={client} fallback={name.trim().charAt(0)} portfolio/></span>
    <div className="v3-heading-copy">{beforeTitle}<div className="eyebrow">{eyebrow || 'Client workspace · ' + name}</div>
      <h1 className="page-title" tabIndex={focusHeading?-1:undefined}>{title}</h1>{subtitle && <div className="page-sub grad">{subtitle}</div>}
    </div>
    {children && <div className={'v3-heading-actions ' + actionsClass}>{children}</div>}
  </header>;
}
