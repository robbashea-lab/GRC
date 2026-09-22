// Display only: assignment choices and authorization remain server responsibilities.
export function primaryContact(client) {
  const contact = client?.primary_contact_record;
  if (client?.primary_contact_id) return {
    name: contact?.name || contact?.email || 'Recorded Primary Contact',
    detail: contact ? [contact.title, contact.email].filter(Boolean).join(' · ') : 'Contact unavailable — relationship retained',
    notice: contact && contact.status !== 'active' ? `Contact ${contact.status || 'status unknown'}` : '',
  };
  return { name: client?.primary_contact || 'Not designated', detail: '',
    notice: client?.primary_contact ? 'Not linked to Contacts & Roles' : '' };
}

export function grcLead(client) {
  const id = client?.assigned_owner_id;
  const lead = client?.grc_lead;
  if (!id) return { name: 'Unassigned', detail: '', notice: '' };
  return {
    name: lead?.name || lead?.email || 'Recorded GRC Lead', detail: lead?.name ? lead.email || '' : '',
    notice: !lead ? 'Account unavailable — relationship retained' : lead.status && lead.status !== 'active'
      ? `Account ${lead.status} — reassignment needed` : lead.role && !['super_admin', 'platform_admin'].includes(lead.role)
        ? 'Existing assignment is not an internal user' : '',
  };
}
