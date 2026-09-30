import { useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useCompliance } from '@/context/ComplianceContext';
import { COMPLIANCE_SECTIONS } from '@/lib/complianceNavigation';
import PageHeader from '@/components/PageHeader';
import FrameworkWorkspace from './FrameworkWorkspace';
import { useAuth } from '@/context/AuthContext';
import { isBrawndoReference } from '@/lib/reference';

export default function ComplianceWorkspace() {
  const { requirementKey } = useParams();
  const { currentClientId } = useOrg();
  const { items, loading, error } = useCompliance();
  const { user } = useAuth();
  // Brawndo CIS IG1 renders its own themed header inside the workspace.
  const ownHeader = requirementKey === 'cis-ig1' && isBrawndoReference(currentClientId, user) && !loading && !error;
  const section = COMPLIANCE_SECTIONS.find(item => item.key === requirementKey);
  const enabled = items.some(item => item.key === requirementKey);
  // The sidebar names the client; the subtitle names the framework version the workspace carries.
  const edition = section && (section.version && !section.name.includes(section.version) ? `${section.name} · ${section.version}` : section.name);
  const subtitle = !currentClientId ? 'Select a client organization from the sidebar first.'
    : !section ? undefined : section.implemented ? `Assessment workspace · ${edition}` : `${edition} · Applicability only; no assessment catalog`;
  return <div>
    {!ownHeader && <PageHeader title={section?.label || 'Requirement unavailable'} subtitle={subtitle} />}
    <div className="section-body">
      {loading ? <p role="status" className="text-sm text-ink-muted">Loading client requirement…</p>
        : error ? <p role="alert" className="text-sm text-ink-muted">Unable to load this client requirement. {error}</p>
        : section?.implemented ? <FrameworkWorkspace key={currentClientId+':'+requirementKey} frameworkKey={requirementKey} clientId={currentClientId}/>
        : <div className="bg-surface-card border border-line rounded-lg p-4 text-sm text-ink-muted">
          {enabled ? 'Program selected for this client. Detailed requirement assessment and mapping have not yet been configured in Omnisciente.' : 'This requirement is not enabled in this client’s completed onboarding.'}
        </div>}
    </div>
  </div>;
}
