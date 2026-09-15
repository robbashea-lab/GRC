import { useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useCompliance } from '@/context/ComplianceContext';
import { COMPLIANCE_SECTIONS } from '@/lib/complianceNavigation';
import PageHeader from '@/components/PageHeader';
import FrameworkWorkspace from './FrameworkWorkspace';

export default function ComplianceWorkspace() {
  const { requirementKey } = useParams();
  const { currentClient,currentClientId } = useOrg();
  const { items, loading, error } = useCompliance();
  const section = COMPLIANCE_SECTIONS.find(item => item.key === requirementKey);
  const enabled = items.some(item => item.key === requirementKey);
  return <div>
    <PageHeader title={section?.label || 'Requirement unavailable'} subtitle={currentClient?.name || 'Select a client organization from the sidebar first.'} />
    <div className="page-content">
      {loading ? <p role="status" className="text-sm text-ink-muted">Loading client requirement…</p>
        : error ? <p role="alert" className="text-sm text-ink-muted">Unable to load this client requirement. {error}</p>
        : section?.implemented ? <FrameworkWorkspace key={currentClientId+':'+requirementKey} frameworkKey={requirementKey} clientId={currentClientId}/>
        : <div className="bg-surface-card border border-line rounded-lg page-content text-sm text-ink-muted">
          {enabled ? 'Program selected for this client. Detailed requirement assessment and mapping have not yet been configured in Omnisciente.' : 'This requirement is not enabled in this client’s completed onboarding.'}
        </div>}
    </div>
  </div>;
}
