import { useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useCompliance } from '@/context/ComplianceContext';
import { COMPLIANCE_SECTIONS } from '@/lib/complianceNavigation';
import PageHeader from '@/components/PageHeader';

export default function ComplianceWorkspace() {
  const { requirementKey } = useParams();
  const { currentClient } = useOrg();
  const { items, loading, error } = useCompliance();
  const section = COMPLIANCE_SECTIONS.find(item => item.key === requirementKey);
  const enabled = items.some(item => item.key === requirementKey);
  return <div>
    <PageHeader title={section?.label || 'Requirement unavailable'} subtitle={currentClient?.name || 'Select a client organization from the sidebar first.'} />
    <div className="p-8">
      {loading ? <p role="status" className="text-sm text-ink-muted">Loading client requirement…</p>
        : error ? <p role="alert" className="text-sm text-ink-muted">Unable to load this client requirement. {error}</p>
        : <div className="bg-white border border-slate-200 rounded-lg p-8 text-sm text-ink-muted">
          {enabled ? `No ${section.label} content has been configured for this client yet.` : 'This requirement is not enabled in this client’s completed onboarding.'}
        </div>}
    </div>
  </div>;
}
