import { useEffect, useState } from 'react';
import api from './api';

// Display names come from the client-scoped people list (/clients/{id}/members): members plus
// former accounts still referenced by the client's records. /users is admin-only and must never
// be the source of a label. A raw account ID is never shown.
export function personLabel(people, id, empty = 'Unassigned') {
  if (!id) return empty;
  const person = people?.find(u => u.user_id === id);
  if (person) return person.name || person.email || 'Former user';
  // Older records hold a name snapshot rather than an account ID; IDs never contain spaces.
  return /\s/.test(String(id)) ? String(id) : 'Former user';
}

export function peopleMap(people) {
  const map = {};
  (people || []).forEach(u => { map[u.user_id] = personLabel(people, u.user_id); });
  return map;
}

// Accepted record reloads may add referenced owners; previous responses are discarded.
export function useClientPeople(clientId, refreshKey) {
  const [state, setState] = useState({ clientId: '', people: [] });
  useEffect(() => {
    if (!clientId) return undefined;
    const controller = new AbortController();
    api.get(`/clients/${encodeURIComponent(clientId)}/members`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setState({ clientId, people: Array.isArray(data) ? data : [] }); })
      .catch(() => { if (!controller.signal.aborted) setState({ clientId, people: [] }); });
    return () => controller.abort();
  }, [clientId, refreshKey]);
  return state.clientId === clientId ? state.people : [];
}
