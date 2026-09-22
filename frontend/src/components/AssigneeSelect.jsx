import { useEffect, useId, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import api, { formatError, PREVIEW_MODE } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

// History is supplied for the selected label only, never used as candidate data.
export default function AssigneeSelect({ clientId, value, onChange, label = 'Owner', disabled = false,
  users = [], testId, required = false, emptyLabel = 'Unassigned' }) {
  const { user } = useAuth();
  const helpId = useId();
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null), [selected, setSelected] = useState(null);
  const [peopleError, setPeopleError] = useState('');
  const mode = PREVIEW_MODE;
  useEffect(() => { setOpen(false); setSearch(''); setOffset(0); setSelected(null); }, [clientId, user, mode]);
  useEffect(() => {
    if (!open || !clientId) return;
    const controller = new AbortController();
    setResult(null);
    api.get(`/clients/${clientId}/assignees`, { params: { search, offset, limit: 50 }, signal: controller.signal })
      .then(({ data }) => {
        if (!Array.isArray(data?.items) || typeof data.has_more !== 'boolean') throw new Error('Invalid candidate response');
        if (!controller.signal.aborted) setResult({ clientId, user, mode, search, offset, ...data });
      })
      .catch(error => { if (!controller.signal.aborted) setResult({ clientId, user, mode, search, offset, error: formatError(error) }); });
    return () => controller.abort();
  }, [clientId, user, mode, search, offset, open, retry]);
  const data = result && result.clientId === clientId && result.user === user && result.mode === mode && result.search === search && result.offset === offset ? result : null;
  const current = selected && selected.user_id === value && selected.clientId === clientId ? selected : users.find(u => u.user_id === value);
  const name = current?.name || current?.email || (value ? 'Recorded assignment' : emptyLabel);
  const choose = candidate => { setSelected(candidate ? { ...candidate, clientId } : null); onChange(candidate?.user_id || null); setOpen(false); };
  function managePeople(event) {
    event.preventDefault();
    // A same-origin blank tab inherits the isolated Demo session. Remove its
    // opener before navigation; preserve this form and never change assignment.
    if (localStorage.getItem('grc_client_id') !== clientId) {
      setPeopleError('Open Contacts & Roles from this client after saving your changes.');
      return;
    }
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setPeopleError('Allow this tab to open Contacts & Roles. Your form is unchanged.'); return; }
    tab.opener = null;
    tab.location.replace(new URL('/contacts', window.location.origin).href);
    setPeopleError('');
  }
  return <div className="space-y-1.5">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" variant="outline" aria-haspopup="dialog" aria-label={label} aria-expanded={open} aria-describedby={helpId} disabled={disabled || !clientId} data-testid={testId} className="w-full justify-between font-normal text-sm">
        <span className="truncate">{name}</span><ChevronDown className="h-4 w-4 shrink-0" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" aria-label={`${label} selection`} className="w-[var(--radix-popover-trigger-width)] min-w-64 p-2">
          <Input aria-label={`Search ${label.toLowerCase()} candidates`} placeholder="Search eligible users…" value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} maxLength={100} />
          <div className="max-h-64 overflow-y-auto mt-2" aria-label={`${label} candidates`}>
            {!required && <Button type="button" variant="ghost" className="w-full justify-start font-normal" aria-pressed={!value} onClick={() => choose(null)}>{emptyLabel}{!value && <Check className="ml-auto h-4 w-4" />}</Button>}
            {!data ? <p role="status" className="p-3 text-sm">Loading eligible users…</p> : data.error ? <div className="p-3 text-sm" role="alert">Eligible users could not be loaded. <button type="button" className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></div> : <>
              {!data.items.length && <p role="status" className="p-3 text-sm">{search ? 'No eligible users match this search.' : 'No eligible users available.'}</p>}
              {data.items.map(candidate => <Button type="button" variant="ghost" className="w-full h-auto py-2 justify-start text-left font-normal" key={candidate.user_id} aria-pressed={candidate.user_id === value} onClick={() => choose(candidate)}>
                <span className="min-w-0"><span className="block truncate">{candidate.name || candidate.email}</span>{candidate.name && candidate.email && <span className="block truncate text-xs text-ink-secondary">{candidate.email}</span>}</span>
                {candidate.user_id === value && <Check className="ml-auto h-4 w-4 shrink-0" />}
              </Button>)}
            </>}
          </div>
          {(offset > 0 || data?.has_more) && <div className="flex justify-between border-t border-line p-2"><Button type="button" size="sm" variant="ghost" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</Button><Button type="button" size="sm" variant="ghost" disabled={!data?.has_more} onClick={() => setOffset(n => n + 50)}>Next</Button></div>}
      </PopoverContent>
    </Popover>
    <p id={helpId} className="text-xs leading-relaxed text-ink-secondary">Only active platform users with access to this client can be assigned. Contacts alone are not eligible.</p>
    {value && current?.status && current.status !== 'active' && <p className="text-xs text-ink-secondary">The recorded account is not active. Its assignment is retained until you choose a replacement.</p>}
    <a href="/contacts" onClick={managePeople} className="inline-block text-xs text-link underline" aria-label="Manage people in a new tab">Manage people →</a>
    {peopleError && <p role="status" className="text-xs text-ink-secondary">{peopleError}</p>}
  </div>;
}
