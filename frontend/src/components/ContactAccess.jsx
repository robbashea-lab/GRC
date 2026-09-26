import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { contactAccess, contactResponsibilities, ownerAccountNote } from '@/lib/contactAccess';

export function useContactAccess(clientId, enabled, revision) {
  const { user, workspaceMode } = useAuth();
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled || !clientId || !user) return;
    const controller = new AbortController();
    const scope = { clientId, user, workspaceMode, revision };
    setResult({ ...scope, status: 'loading', members: [] });
    api.get(`/clients/${clientId}/contact-accounts`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setResult({ ...scope, status: 'ready', members: Array.isArray(data) ? data : [] });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ ...scope, status: 'error', members: [] });
    });
    return () => controller.abort();
  }, [clientId, enabled, user, workspaceMode, revision]);
  // Never render an earlier client's/account's response, even before effect cleanup.
  return enabled && result && result.clientId === clientId && result.user === user &&
    result.workspaceMode === workspaceMode && result.revision === revision
    ? result : { clientId, status: 'loading', members: [] };
}

export function ContactAccessStatus({ contact, clientId, context }) {
  const state = contactAccess(contact, clientId, context);
  return <span className="inline-flex rounded border border-line bg-surface-subtle px-2 py-0.5 text-xs text-ink-secondary" title={state.description}>{state.label}</span>;
}

export function ContactAccessDetails({ contact, clientId, open }) {
  const linkedId = contact?.linked_user_id;
  const revision = useMemo(() => ({ contact, linkedId }), [contact, linkedId]);
  const context = useContactAccess(clientId, open, revision);
  const current = contact || { client_id: clientId };
  const state = contactAccess(current, clientId, context);
  const account = context.members.find(member => member.user_id === current.linked_user_id);
  return <section aria-label="Platform access" className="rounded-md border border-line bg-surface-subtle p-3 space-y-2 text-xs text-ink-secondary">
    <h3 className="font-medium text-sm text-ink-primary">Platform access</h3>
    <ContactAccessStatus contact={current} clientId={clientId} context={context} />
    <p>{state.description}</p>
    {account?.email && <p><span className="font-medium">Linked account:</span> {account.email}</p>}
    {typeof account?.has_client_access === 'boolean' && <p><span className="font-medium">Client access:</span> {account.has_client_access ? account.status === 'active' ? 'Active' : 'Membership recorded; account not active' : 'None'}</p>}
    {contact && <p><span className="font-medium">Business responsibilities:</span> {contactResponsibilities(contact)}</p>}
    <p>Contact status and business roles do not grant platform access or approval permission.</p>
  </section>;
}

export function OwnerAccountNote({ users, id, status }) {
  const note = ownerAccountNote(users, id, status);
  return note ? <span className="block text-xs text-semantic-duesoon-text" title="Existing ownership is retained; reassign active work.">{note}</span> : null;
}
