import { grcLead, primaryContact } from '@/lib/clientRelationships';

export default function ClientRelationshipValue({ client, primary = false }) {
  const value = primary ? primaryContact(client) : grcLead(client);
  return <div className="min-w-0"><div className="font-medium text-ink-primary">{value.name}</div>
    {value.detail && <div className="text-xs text-ink-secondary break-words">{value.detail}</div>}
    {value.notice && <div className="text-xs text-ink-secondary">{value.notice}</div>}
  </div>;
}
