# Phase 4C: relationship ownership

## Inspection before implementation

| Surface | Primary Contact | GRC Lead |
| --- | --- | --- |
| Client creation/edit | `clients.primary_contact`, one free-text input; no Contact created | `clients.assigned_owner_id`; UI choices filtered to super/platform admins |
| Client Management | text available to search/edit | resolves from role-filtered `/users`; a stored client-role lead displays Unassigned |
| Portfolio | raw client text | backend resolves all users; Demo returns the entire matching user |
| Contacts & Roles | independent Contact documents; editing never updates client text | no lead assignment |
| Client Settings, Dashboard/context | no existing relationship display | no existing lead display; context carries raw client |
| Onboarding | independently upserts Contacts by business role | does not set client lead |
| Reviews, Policies | operational owners, not primary relationships | no client lead assignment; historical actors are separate |

The five canonical Demo clients currently assign client-admin Users as GRC Leads,
although the client-management selector only offers internal admins. Those stored
values must remain identifiable, not be silently replaced or upgraded to staff.
No persistent development database is available for a live-data inventory.

## Scope and decisions

- Add optional `primary_contact_id` referencing a same-client Contact. New-client
  structured details create one Contact; existing clients select an existing
  Contact by ID. No matching by name/email, identity merging, accounts or invitations.
- Retain legacy `primary_contact` verbatim. It is compatibility data, not a second
  authority when a Contact ID is present. Legacy rows are explicitly unlinked.
- Selecting a replacement or clearing the relationship never deletes a Contact.
- Linked inactive Contacts remain readable. Hard deletion of a current Primary
  Contact is blocked; archive it or explicitly change the relationship first.
- Retain `assigned_owner_id` as the only lead reference. New selections use the
  existing internal role subset, active account state and existing client scope.
  Existing out-of-policy/disabled assignments remain visible and unchanged.
- Read projections resolve only referenced identities, in batches, with minimal
  fields. Contact resolution includes client ID. No stored duplicate names.
- No Dashboard cards, operational eligibility, approval rules, membership changes,
  startup migrations or automatic reconciliation.

Security basis: OWASP Authorization Cheat Sheet, "Validate the Permissions on
Every Request" and "Ensure Lookup IDs are Not Accessible Even When Guessed".
https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
These guide scoped relationship checks, not a claim of whole-app verification.
