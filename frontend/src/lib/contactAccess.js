// Read-only presentation, not an assignment or authorization decision.
export function contactAccess(contact, clientId, context) {
  const unknown = { label: 'Access not verified', description: 'Platform access could not be verified for this client.' };
  if (!clientId || contact?.client_id !== clientId) return unknown;
  if (!contact.linked_user_id) return {
    label: 'Account not linked',
    description: 'This business Contact has no linked platform account. A Contact can be kept without application access.',
  };
  if (context?.clientId !== clientId || context?.status === 'loading') return {
    label: 'Checking access…', description: 'Checking the linked account for this client.',
  };
  if (context?.status !== 'ready') return unknown;
  const account = context.members.find(member => member.user_id === contact.linked_user_id);
  if (account && typeof account.has_client_access === 'boolean') {
    if (account.status === 'disabled') return { label: 'Disabled account', description: 'The linked account is disabled. Existing ownership and history are retained; active work may require reassignment.' };
    if (account.status === 'invited') return { label: 'Invitation pending', description: 'The linked account has not completed activation. Invitation delivery is reported separately; no active account access is implied.' };
    if (!account.has_client_access) return { label: 'No client access', description: 'An account is linked, but it has no access to this client. The business Contact remains valid.' };
  }
  // The members endpoint can also return historical owners without current access.
  const clients = account?.client_ids;
  const hasAccess = account && (account.has_client_access === true || account.role === 'super_admin' ||
    account.role === 'platform_admin' && Array.isArray(clients) && clients.length === 0 ||
    Array.isArray(clients) && clients.includes(clientId));
  if (!hasAccess) return unknown;
  if (account.status === 'disabled') return {
    label: 'Disabled account', description: 'The linked platform account is marked disabled. Business responsibilities are retained.',
  };
  if (account.status !== 'active') return {
    label: 'Account status unverified', description: 'An account is linked, but active access has not been verified. No invitation state is implied.',
  };
  return {
    label: 'Active account',
    description: 'The linked account is marked active and has access to this client. Assignment and approval still depend on existing permissions.',
  };
}

export function contactResponsibilities(contact) {
  return [...new Set([contact.role, ...(Array.isArray(contact.grc_roles) ? contact.grc_roles : [])].filter(Boolean))].join(' · ') || 'Not specified';
}
